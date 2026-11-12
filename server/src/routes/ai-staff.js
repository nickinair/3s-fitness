/**
 * 小S · 教练版 —— 员工端(教练/店长/管理员) AI 工作助手
 *
 * 原则: AI 只负责「听懂 + 调用工具查数据 + 生成确认卡片」, 不新增业务逻辑。
 *   - 读: 直接查库或复用现有接口, 教练只看自己的学员/课程, 店长/管理员按门店口径看全店;
 *   - 写: 一律先生成草稿卡片(存在消息里), 员工点「确认」后由服务端用员工自己的身份
 *         调用现有 /api 接口执行(权限、校验、扣课全部沿用原逻辑), 并额外记一条「[AI助手]」操作日志;
 *   - 涉及金额的操作(开卡/续卡/退卡/储值扣费/手动补录消课)不执行, 只给页面入口。
 * 复用会员端小S的 DeepSeek 多 Key、语音识别、消息/卡片存储方式。
 */
const express = require('express');
const dayjs = require('dayjs');
const db = require('../db');
const config = require('../config');
const { ok, BizError, logAction, cardBlockReason } = require('../util');
const { staffAuth } = require('../middleware/auth');
const { getCoachBusy, getMemberBusy, checkTimeRange, parseOpen } = require('./coaches');
const { shared } = require('./ai-assistant');
const SCRIPT_LIB = require('../ai-scripts');

const { CFG, S, llm, cleanText, dayLabel, fmtD, toMin, fromMin, PT_STATUS, GROUP_STATUS, KIND, parseLessonPlan, getClubs } = shared;
let pinyin = null;
try { ({ pinyin } = require('pinyin-pro')); } catch (e) { /* 未安装时退化为汉字匹配 */ }

const r = express.Router();
r.use(staffAuth());

const BOT_NAME = '小S';
const WEEK = '日一二三四五六';
const DAILY_CHATS = Number(S.ai_staff_daily_chats) || 200;
const BATCH_MAX = 20;
const ROLE_NAME = { platform: '平台管理员', admin: '管理员', manager: '店长', membership: '会籍顾问', reception: '前台', coach: '教练' };

/* ================= 建表 ================= */
let tablesReady = null;
function ensureTables() {
  if (!tablesReady) {
    tablesReady = (async () => {
      await db.exec(`CREATE TABLE IF NOT EXISTS biz_ai_staff_message (
        id INT AUTO_INCREMENT PRIMARY KEY, merchant_id INT NOT NULL DEFAULT 1, user_id INT NOT NULL,
        role VARCHAR(16) NOT NULL, content TEXT, cards MEDIUMTEXT, tokens INT NOT NULL DEFAULT 0,
        insert_time DATETIME DEFAULT CURRENT_TIMESTAMP, KEY idx_user (user_id, id)) DEFAULT CHARSET=utf8mb4`);
      // 主动推送去重: 早报/周报/课前提醒/漏消课提醒, 每个(用户,类型,对象)只推一次
      await db.exec(`CREATE TABLE IF NOT EXISTS biz_ai_staff_event (
        id INT AUTO_INCREMENT PRIMARY KEY, user_id INT NOT NULL, type VARCHAR(16) NOT NULL, ref VARCHAR(32) NOT NULL,
        insert_time DATETIME DEFAULT CURRENT_TIMESTAMP, UNIQUE KEY uk_user_type_ref (user_id, type, ref)) DEFAULT CHARSET=utf8mb4`);
      // 门店话术库: 员工在小S里沉淀的话术(内置话术在 src/ai-scripts.js)
      await db.exec(`CREATE TABLE IF NOT EXISTS biz_ai_script (
        id INT AUTO_INCREMENT PRIMARY KEY, merchant_id INT NOT NULL DEFAULT 1, scene VARCHAR(32) NOT NULL, title VARCHAR(100) NOT NULL DEFAULT '',
        content TEXT, user_id INT NOT NULL DEFAULT 0, username VARCHAR(32) NOT NULL DEFAULT '', status TINYINT NOT NULL DEFAULT 1,
        insert_time DATETIME DEFAULT CURRENT_TIMESTAMP, KEY idx_scene (merchant_id, scene)) DEFAULT CHARSET=utf8mb4`);
      await db.exec(`CREATE TABLE IF NOT EXISTS biz_ai_staff_state (
        user_id INT PRIMARY KEY, last_read_id INT NOT NULL DEFAULT 0, use_date DATE NULL, chats INT NOT NULL DEFAULT 0
        ) DEFAULT CHARSET=utf8mb4`);
    })().catch((e) => { tablesReady = null; throw e; });
  }
  return tablesReady;
}

/* ================= 上下文 / 权限 ================= */
async function ctxOf(req) {
  const u = req.user;
  let coachId = u.coachId || 0;
  if (!coachId && u.uid) {
    const c = await db.queryOne('SELECT id FROM biz_club_coach WHERE user_id=? AND status=1', [u.uid]);
    if (c) coachId = c.id;
  }
  return {
    req, uid: u.uid, mid: u.mid || 1, name: u.name || '教练', role: u.role, coachId,
    isCoach: u.role === 'coach',
    isMgr: ['admin', 'manager', 'platform'].includes(u.role),
    clubScope: req.clubScope || null, clubId: req.clubId, cards: [],
  };
}

const tail = (p) => String(p || '').slice(-4);
const vname = (v) => (v && (v.realname || v.nickname)) || '会员';
const staffOpLabel = (ctx, act) => (ctx.isCoach ? `${ctx.name}代${act}` : `管理员代${act}`);
const normReason = (s) => String(s || '').trim()
  .replace(/店长代?(预约|约课|代约)/g, '管理员代预约')
  .replace(/店长代?取消/g, '管理员代取消')
  .replace(/代约\(店长\)/g, '管理员代预约')
  .replace(/^店长$/, '管理员');

// 教练的学员口径: 主/副教练是我、名下有我的私教卡、或半年内上过我的课
function studentSql(ctx, a = 'v') {
  if (!ctx.isCoach) return ['', []];
  const since = dayjs().subtract(180, 'day').format('YYYY-MM-DD');
  const c = ctx.coachId || -1;
  return [` AND (${a}.coach_id=? OR ${a}.sub_coach_id=?
    OR EXISTS (SELECT 1 FROM biz_member_card mc WHERE mc.vip_id=${a}.id AND mc.coach_id=? AND mc.status IN (0,1,2,3))
    OR EXISTS (SELECT 1 FROM biz_ptrain_bespeak_record pb WHERE pb.vip_id=${a}.id AND pb.coach_id=? AND pb.\`date\`>=?))`,
  [c, c, c, c, since]];
}

async function getMember(ctx, vipId) {
  const [sc, sp] = studentSql(ctx);
  const v = await db.queryOne(`SELECT v.* FROM biz_vip_user v WHERE v.id=? AND v.merchant_id=?${sc}`, [vipId, ctx.mid, ...sp]);
  if (v) { ctx.lastVip = { id: v.id }; return v; }
  const exist = await db.queryOne('SELECT id FROM biz_vip_user WHERE id=? AND merchant_id=?', [vipId, ctx.mid]);
  if (!exist) throw new BizError('没有找到这位会员，请先用姓名或手机尾号搜索');
  throw new BizError('这位会员不是你的学员，教练只能查看和操作自己的学员');
}

async function getBooking(ctx, id) {
  const bk = await db.queryOne('SELECT * FROM biz_ptrain_bespeak_record WHERE id=? AND merchant_id=?', [id, ctx.mid]);
  if (!bk) throw new BizError(`预约#${id}不存在`);
  if (ctx.isCoach && bk.coach_id !== ctx.coachId) throw new BizError(`预约#${id}不是你的课，教练只能操作自己的课程`);
  if (!ctx.isCoach && ctx.clubScope && bk.club_id && bk.club_id !== ctx.clubScope) throw new BizError(`预约#${id}不属于当前门店`);
  return bk;
}

async function listCoaches(ctx) {
  return db.query(
    `SELECT id, realname, nickname, user_id FROM biz_club_coach WHERE merchant_id=? AND status=1
       AND NOT EXISTS (SELECT 1 FROM sys_user u WHERE u.id=biz_club_coach.user_id AND u.status=0) ORDER BY sort, id`, [ctx.mid]);
}

// 解析要操作的教练: 教练角色永远是自己; 管理者可按名字指定, 不指定则用自己的教练档案
async function resolveCoach(ctx, coachName, { required = true } = {}) {
  if (ctx.isCoach) {
    if (!ctx.coachId) throw new BizError('当前账号未绑定教练档案');
    const c = await db.queryOne('SELECT id, realname FROM biz_club_coach WHERE id=?', [ctx.coachId]);
    return c;
  }
  const list = await listCoaches(ctx);
  const norm = (s) => String(s || '').replace(/[\s\u{1F000}-\u{1FFFF}☀-➿]/gu, '').replace(/教练$/, '').toLowerCase();
  const q = norm(coachName);
  if (!q) {
    if (ctx.coachId) return list.find(x => x.id === ctx.coachId) || null;
    if (!required) return null;
    throw new BizError(`请说明是哪位教练，在职教练有：${list.map(x => x.realname).join('、')}`);
  }
  const hit = list.filter(x => norm(x.realname) === q || norm(x.nickname) === q);
  const fz = hit.length ? hit : list.filter(x => norm(x.realname).includes(q) || q.includes(norm(x.realname)));
  if (fz.length === 1) return fz[0];
  if (fz.length > 1) throw new BizError(`有多位教练匹配「${coachName}」：${fz.map(x => x.realname).join('、')}，请说全名`);
  throw new BizError(`没有找到叫「${coachName}」的在职教练，在职教练有：${list.map(x => x.realname).join('、')}`);
}

async function myClub(ctx) {
  const clubs = await getClubs(ctx.mid);
  return clubs.find(c => c.id === ctx.clubId) || clubs[0] || null;
}

/* ================= 以员工身份调用现有接口(复用全部校验与权限) ================= */
async function callApi(ctx, method, path, body) {
  const headers = { 'Content-Type': 'application/json', Authorization: ctx.req.headers.authorization || '' };
  if (ctx.req.headers['x-club-id']) headers['X-Club-Id'] = String(ctx.req.headers['x-club-id']);
  const resp = await fetch(`http://127.0.0.1:${config.port}/api${path}`, {
    method, headers, body: body ? JSON.stringify(body) : undefined, signal: AbortSignal.timeout(30000),
  });
  let j;
  try { j = await resp.json(); } catch { throw new BizError(`接口异常(${resp.status})`); }
  if (j.code !== 0) throw new BizError(j.msg || '操作失败');
  return j.data;
}

/* ================= 查询类工具 ================= */
function pyOf(s) {
  if (!pinyin) return { full: String(s || '').toLowerCase(), ini: '' };
  const t = String(s || '').replace(/[^一-龥a-zA-Z]/g, '');
  return {
    full: pinyin(t, { toneType: 'none', type: 'array' }).join('').toLowerCase(),
    ini: pinyin(t, { pattern: 'first', toneType: 'none', type: 'array' }).join('').toLowerCase(),
  };
}

async function searchMember(ctx, { keyword }) {
  const kw = String(keyword || '').trim().replace(/\s+/g, '').replace(/(会员|学员|先生|女士|小姐|同学)$/, '').slice(0, 20);
  if (!kw) return { error: '请告诉我会员姓名或手机尾号' };
  const [sc, sp] = studentSql(ctx);
  const base = `SELECT v.id, v.realname, v.nickname, v.phone, v.gender, v.coach_name, v.expire_status
                  FROM biz_vip_user v WHERE v.merchant_id=? AND v.status=1${sc}`;
  let rows;
  if (/^\d{3,11}$/.test(kw)) {
    rows = await db.query(`${base} AND v.phone LIKE ? ORDER BY v.id DESC LIMIT 10`, [ctx.mid, ...sp, `%${kw}`]);
  } else {
    rows = await db.query(`${base} AND (v.realname LIKE ? OR v.nickname LIKE ?) ORDER BY (v.realname=?) DESC, v.id DESC LIMIT 10`,
      [ctx.mid, ...sp, `%${kw}%`, `%${kw}%`, kw]);
    const exact = rows.filter(v => v.realname === kw);
    if (exact.length === 1) rows = exact;
    // 语音识别常出现同音字: 汉字匹配不到时按拼音/首字母再找一遍
    if (!rows.length && pinyin) {
      const q = pyOf(kw);
      const all = await db.query(`${base} ORDER BY v.id DESC LIMIT 3000`, [ctx.mid, ...sp]);
      rows = all.filter((v) => {
        const p = pyOf(vname(v));
        return (q.full && p.full && (p.full === q.full || (q.full.length >= 4 && p.full.includes(q.full))))
          || (/^[a-z]{2,4}$/i.test(kw) && p.ini === kw.toLowerCase());
      }).slice(0, 10);
    }
  }
  const members = rows.map(v => ({
    vip_id: v.id, name: vname(v), phone_tail: tail(v.phone), gender: v.gender === 1 ? '男' : v.gender === 2 ? '女' : '',
    main_coach: v.coach_name || '', status: ['未开卡', '有效会员', '已过期'][v.expire_status] || '',
  }));
  if (members.length === 1) ctx.lastVip = { id: members[0].vip_id };
  if (members.length > 1) {
    ctx.cards.push({
      type: 'pick', title: '你说的是哪位？',
      options: members.slice(0, 6).map(m => ({
        label: m.name, sub: `尾号${m.phone_tail}${m.main_coach ? ' · 主教练' + m.main_coach : ''}`,
        send: `是${m.name}（尾号${m.phone_tail}，会员ID ${m.vip_id}）`,
      })),
    });
  }
  return {
    count: members.length, members,
    tip: members.length > 1 ? '有多位会员匹配，已给员工出了选择卡片，请先问「你说的是哪位？」，等员工选择后再继续'
      : members.length ? '' : (ctx.isCoach ? '你的学员里没有找到，可以让员工说手机尾号再试' : '没有找到，可以让员工说手机尾号再试'),
  };
}

async function memberCards(vipId) {
  return db.query(
    `SELECT c.*, IF(c.vip_id=?, 0, 1) AS is_shared, v.realname AS owner_name
       FROM biz_member_card c JOIN biz_vip_user v ON v.id=c.vip_id
      WHERE (c.vip_id=? OR c.id IN (SELECT card_id FROM biz_member_card_user WHERE vip_id=?)) AND c.status IN (0,1,2,3)
      ORDER BY is_shared, FIELD(c.status,1,0,3,2), FIELD(c.card_kind,4,1,2,3), c.expire_time`, [vipId, vipId, vipId]);
}
function cardBrief(c) {
  return {
    card_id: c.id, name: c.card_type_name + (c.is_shared ? `（${c.owner_name}共享）` : ''), kind: KIND[c.card_kind] || '',
    status: ['待开卡', '使用中', '已过期', '已暂停'][c.status] || '',
    left: c.card_kind === 2 ? '不限次' : c.card_kind === 3 ? `余额¥${Number(c.left_money)}` : `剩余${c.left_counts}/${c.counts}次`,
    expire: c.expire_time ? fmtD(c.expire_time) : '',
  };
}

async function memberProfile(ctx, { vip_id }) {
  const v = await getMember(ctx, vip_id);
  const [cards, lessons, upcoming, bodies, plan, maintain, milestones, stat] = await Promise.all([
    memberCards(v.id),
    // 最近上过的课以消课记录为准(含手动补录), 有对应预约的带出课程名和本节课计划
    db.query(`SELECT r.insert_time, r.costs, r.coach_name, b.from_time, b.course_title, b.lesson_plan
                FROM biz_ptrain_record r LEFT JOIN biz_ptrain_bespeak_record b ON b.id=r.bespeak_id AND r.bespeak_id>0
               WHERE r.vip_id=? ORDER BY r.insert_time DESC, r.id DESC LIMIT 5`, [v.id]),
    db.query(`SELECT id, \`date\`, from_time, to_time, coach_name, course_title, status FROM biz_ptrain_bespeak_record
               WHERE vip_id=? AND status IN (0,1) AND \`date\`>=? ORDER BY \`date\`, from_time LIMIT 5`, [v.id, dayjs().format('YYYY-MM-DD')]),
    db.query('SELECT record_date, weight, body_fat, muscle, waist FROM biz_body_record WHERE vip_id=? ORDER BY record_date DESC, id DESC LIMIT 5', [v.id]),
    db.queryOne('SELECT title, plan_date, items, coach_name FROM biz_training_plan WHERE vip_id=? AND status=1 ORDER BY plan_date DESC, id DESC LIMIT 1', [v.id]),
    db.queryOne('SELECT content, membership_name, insert_time FROM biz_maintain_record WHERE vip_user_id=? AND vip_user_type=1 ORDER BY id DESC LIMIT 1', [v.id]),
    db.query('SELECT id, type, node_value, status FROM biz_milestone WHERE vip_id=? AND status=0 ORDER BY id DESC LIMIT 3', [v.id]).catch(() => []),
    db.queryOne('SELECT COALESCE(SUM(costs),0) n FROM biz_ptrain_record WHERE vip_id=? AND insert_time>=?',
      [v.id, dayjs().subtract(30, 'day').format('YYYY-MM-DD 00:00:00')]),
  ]);
  const lastCheckin = await db.queryOne('SELECT check_in_time FROM biz_checkin_record WHERE vip_id=? ORDER BY id DESC LIMIT 1', [v.id]);
  let planItems = [];
  try { planItems = plan ? JSON.parse(plan.items || '[]') : []; } catch { planItems = []; }
  return {
    vip_id: v.id, name: vname(v), phone_tail: tail(v.phone),
    gender: v.gender === 1 ? '男' : v.gender === 2 ? '女' : '未知',
    age: v.birthday ? dayjs().diff(dayjs(v.birthday), 'year') : null,
    birthday: v.birthday ? dayjs(v.birthday).format('MM-DD') : '',
    main_coach: v.coach_name || '', remark: v.remark || '',
    target_weight_kg: v.target_weight != null ? Number(v.target_weight) || null : null,
    cards: cards.map(cardBrief),
    lessons_last_30d: stat ? Number(stat.n) || 0 : 0,
    last_visit: lastCheckin ? dayjs(lastCheckin.check_in_time).format('YYYY-MM-DD HH:mm') : '',
    recent_lessons: lessons.map(l => ({ date: fmtD(l.insert_time), time: l.from_time || '', coach: l.coach_name, course: l.course_title || '补录消课', lessons: Number(l.costs) || 1, plan: parseLessonPlan(l.lesson_plan) })),
    upcoming_bookings: upcoming.map(b => ({ booking_id: b.id, day: dayLabel(b.date), date: fmtD(b.date), time: `${b.from_time}-${b.to_time}`, coach: b.coach_name, course: b.course_title, status: PT_STATUS[b.status] })),
    body_trend: bodies.map(b => ({ date: fmtD(b.record_date), weight: Number(b.weight) || null, body_fat: Number(b.body_fat) || null, muscle: Number(b.muscle) || null, waist: Number(b.waist) || null })),
    last_plan: plan ? { title: plan.title, date: fmtD(plan.plan_date), coach: plan.coach_name, actions: planItems.slice(0, 10).map(x => `${x.action_name} ${x.sets}组x${x.reps}${x.unit || '次'}`) } : null,
    last_maintain: maintain ? { content: maintain.content, by: maintain.membership_name, time: dayjs(maintain.insert_time).format('YYYY-MM-DD') } : null,
    pending_milestones: milestones.map(m => ({ milestone_id: m.id, node: m.type === 1 ? `第${m.node_value}节课` : `第${m.node_value}天` })),
  };
}

function bookingRow(b) {
  let plan = '';
  if (b.lesson_plan) plan = '已填';
  return {
    booking_id: b.id, vip_id: b.vip_id, member: b.realname, phone_tail: tail(b.phone), coach: b.coach_name,
    day: dayLabel(b.date), date: fmtD(b.date), time: `${b.from_time}-${b.to_time}`, course: b.course_title,
    status: PT_STATUS[b.status] + (b.status === 1 && b.confirm_status === 1 ? '(已发起消课,待学员确认)' : ''),
    lesson_plan: plan || '未填',
  };
}

async function getSchedule(ctx, { date_from, date_to, coach_name }) {
  const from = fmtD(date_from) || dayjs().format('YYYY-MM-DD');
  let to = fmtD(date_to) || from;
  if (dayjs(to).diff(dayjs(from), 'day') > 13) to = dayjs(from).add(13, 'day').format('YYYY-MM-DD');
  const coach = await resolveCoach(ctx, coach_name, { required: false });
  if (!coach) {
    // 管理者未指定教练且无教练档案: 全店私教预约 + 团课
    const cond = ['merchant_id=?', '`date` BETWEEN ? AND ?', 'status IN (0,1,3,4)']; const p = [ctx.mid, from, to];
    if (ctx.clubScope) { cond.push('club_id=?'); p.push(ctx.clubScope); }
    const bks = await db.query(`SELECT * FROM biz_ptrain_bespeak_record WHERE ${cond.join(' AND ')} ORDER BY \`date\`, from_time LIMIT 80`, p);
    const gc = await db.query(`SELECT id, title, coach_name, start_time, end_time, booked_count, people_count FROM biz_syllabus_group
      WHERE merchant_id=?${ctx.clubScope ? ' AND club_id=?' : ''} AND start_time BETWEEN ? AND ? AND status IN (1,3) ORDER BY start_time LIMIT 40`,
    [ctx.mid, ...(ctx.clubScope ? [ctx.clubScope] : []), `${from} 00:00:00`, `${to} 23:59:59`]);
    return {
      scope: '全店', from, to, pt_count: bks.length, pt_bookings: bks.map(bookingRow),
      group_classes: gc.map(g => ({ syllabus_id: g.id, title: g.title, coach: g.coach_name, time: `${dayjs(g.start_time).format('MM-DD HH:mm')}-${dayjs(g.end_time).format('HH:mm')}`, booked: `${g.booked_count || 0}/${g.people_count || 0}` })),
    };
  }
  const [bks, gc, rests] = await Promise.all([
    db.query('SELECT * FROM biz_ptrain_bespeak_record WHERE coach_id=? AND `date` BETWEEN ? AND ? AND status IN (0,1,3,4) ORDER BY `date`, from_time', [coach.id, from, to]),
    db.query(`SELECT id, title, start_time, end_time, classroom_name, booked_count, people_count FROM biz_syllabus_group
      WHERE coach_id=? AND start_time BETWEEN ? AND ? AND status IN (1,3) ORDER BY start_time`, [coach.id, `${from} 00:00:00`, `${to} 23:59:59`]),
    db.query('SELECT rest_date, from_time, to_time, remark FROM biz_coach_rest WHERE coach_id=? AND rest_date BETWEEN ? AND ?', [coach.id, from, to]),
  ]);
  return {
    coach: coach.realname, from, to, pt_count: bks.length,
    pt_bookings: bks.map(bookingRow),
    group_classes: gc.map(g => ({ syllabus_id: g.id, title: g.title, time: `${dayjs(g.start_time).format('MM-DD HH:mm')}-${dayjs(g.end_time).format('HH:mm')}`, room: g.classroom_name, booked: `${g.booked_count || 0}/${g.people_count || 0}` })),
    rests: rests.map(x => ({ date: fmtD(x.rest_date), time: x.from_time ? `${x.from_time}-${x.to_time}` : '全天', remark: x.remark })),
  };
}

// 某教练某天所有可开始时间(15 分钟粒度)
async function freeStarts(coachId, date, duration, openTime, vipId, excludeBookingId = 0) {
  const busy = await getCoachBusy(coachId, date);
  // 改约时把原预约自己占的时段让出来
  const exclude = excludeBookingId ? await db.queryOne('SELECT `date`, from_time, to_time FROM biz_ptrain_bespeak_record WHERE id=?', [excludeBookingId]) : null;
  const cb = exclude && fmtD(exclude.date) === date
    ? busy.filter(b => !(b.type === 'booked' && b.from === exclude.from_time && b.to === exclude.to_time)) : busy;
  const mb = vipId ? await getMemberBusy(vipId, date, excludeBookingId) : [];
  const { open, close } = parseOpen(openTime);
  const free = [];
  for (let m = open; m + duration <= close; m += 15) {
    const why = checkTimeRange({ date, fromTime: fromMin(m), duration, openTime, coachBusy: cb, memberBusy: mb, allowPast: false });
    if (!why) free.push(m);
  }
  return { free, coachBusy: cb, memberBusy: mb };
}

// 冲突时推荐离期望时间最近的空档(当天优先, 不够再往后找 3 天)
async function nearestSlots(coachId, date, fromTime, duration, openTime, vipId, excludeBookingId = 0, n = 3) {
  const want = toMin(fromTime);
  const out = [];
  for (let i = 0; i < 4 && out.length < n; i++) {
    const d = dayjs(date).add(i, 'day').format('YYYY-MM-DD');
    const { free } = await freeStarts(coachId, d, duration, openTime, vipId, excludeBookingId);
    const half = free.filter(m => m % 30 === 0);
    const pool = half.length ? half : free;
    pool.sort((a, b) => Math.abs(a - want) - Math.abs(b - want));
    pool.slice(0, n - out.length).sort((a, b) => a - b).forEach(m => out.push({ date: d, from_time: fromMin(m) }));
  }
  return out;
}

async function freeSlots(ctx, { date, coach_name, duration, vip_id }) {
  const coach = await resolveCoach(ctx, coach_name);
  const d = fmtD(date) || dayjs().format('YYYY-MM-DD');
  const club = await myClub(ctx);
  const dur = Number(duration) || 60;
  if (vip_id) await getMember(ctx, vip_id);
  const { free, coachBusy, memberBusy } = await freeStarts(coach.id, d, dur, club && club.open_time, vip_id);
  const ranges = [];
  free.forEach((m) => { const last = ranges[ranges.length - 1]; if (last && m - last[1] === 15) last[1] = m; else ranges.push([m, m]); });
  return {
    coach: coach.realname, date: d, day: dayLabel(d), duration_min: dur, open_time: club && club.open_time,
    available_start_ranges: ranges.map(([a, b]) => (a === b ? fromMin(a) : `${fromMin(a)}~${fromMin(b)}`)),
    coach_busy: coachBusy.map(b => `${b.from}-${b.to} ${b.label || ''}`),
    member_busy: memberBusy.map(b => `${b.from}-${b.to} ${b.label}`),
  };
}

async function findBookings(ctx, { vip_id, date_from, date_to, status, coach_name }) {
  const cond = ['merchant_id=?']; const p = [ctx.mid];
  if (ctx.isCoach) { cond.push('coach_id=?'); p.push(ctx.coachId || -1); } else {
    if (coach_name) { const c = await resolveCoach(ctx, coach_name); cond.push('coach_id=?'); p.push(c.id); }
    if (ctx.clubScope) { cond.push('club_id=?'); p.push(ctx.clubScope); }
  }
  if (vip_id) { await getMember(ctx, vip_id); cond.push('vip_id=?'); p.push(vip_id); }
  const from = fmtD(date_from); const to = fmtD(date_to);
  if (from) { cond.push('`date`>=?'); p.push(from); }
  if (to) { cond.push('`date`<=?'); p.push(to); }
  const st = { pending: [0], confirmed: [1], active: [0, 1], done: [3], cancelled: [2], noshow: [4] }[status] || (from || to ? [0, 1, 2, 3, 4] : [0, 1]);
  cond.push(`status IN (${st.join(',')})`);
  if (!from && !to && st.every(s => s <= 1)) { cond.push('`date`>=?'); p.push(dayjs().subtract(3, 'day').format('YYYY-MM-DD')); }
  const rows = await db.query(`SELECT * FROM biz_ptrain_bespeak_record WHERE ${cond.join(' AND ')} ORDER BY \`date\`, from_time LIMIT 40`, p);
  return { count: rows.length, bookings: rows.map(bookingRow) };
}

// 待处理: confirm=待确认预约, finish=已上完未消课, plan=近两天未填课程计划
async function pendingRows(ctx, kind) {
  const cond = ['merchant_id=?']; const p = [ctx.mid];
  if (ctx.isCoach || ctx.coachId && !ctx.isMgr) { cond.push('coach_id=?'); p.push(ctx.coachId || -1); }
  else if (ctx.clubScope) { cond.push('club_id=?'); p.push(ctx.clubScope); }
  const nowS = dayjs().format('YYYY-MM-DD HH:mm');
  if (kind === 'confirm') {
    cond.push('status=0', "CONCAT(`date`,' ',to_time) >= ?"); p.push(nowS);
  } else if (kind === 'finish') {
    cond.push('status=1', "CONCAT(`date`,' ',to_time) <= ?", '`date`>=?');
    p.push(nowS, dayjs().subtract(14, 'day').format('YYYY-MM-DD'));
  } else {
    cond.push('status IN (0,1)', '`date` BETWEEN ? AND ?', "(lesson_plan IS NULL OR lesson_plan='')");
    p.push(dayjs().format('YYYY-MM-DD'), dayjs().add(1, 'day').format('YYYY-MM-DD'));
  }
  return db.query(`SELECT * FROM biz_ptrain_bespeak_record WHERE ${cond.join(' AND ')} ORDER BY \`date\`, from_time LIMIT 50`, p);
}
async function listPending(ctx, { kind = 'confirm' }) {
  const rows = await pendingRows(ctx, kind);
  return { kind: { confirm: '待确认预约', finish: '已上完未消课', plan: '今明两天未填课程计划' }[kind] || kind, count: rows.length, bookings: rows.map(bookingRow) };
}

async function getPerformance(ctx, { month, coach_name }) {
  const m = /^\d{4}-\d{2}$/.test(month || '') ? month : dayjs().format('YYYY-MM');
  const rows = await callApi(ctx, 'GET', `/coaches/performance?month=${m}`);
  const list = (rows || []).map(x => ({ coach: x.realname, coach_id: x.id, lessons: Number(x.lessons), consume_money: Number(x.spend_money), sales_orders: Number(x.sales_orders), sales_money: Number(x.sales_money) }));
  let mine = null;
  try { mine = await callApi(ctx, 'GET', `/report/mine?month=${m}`); } catch (e) { mine = null; }
  if (ctx.isCoach || (!ctx.isMgr)) {
    const me = list.find(x => x.coach_id === ctx.coachId) || null;
    const rank = me ? list.filter(x => x.lessons > me.lessons).length + 1 : null;
    return { month: m, me, lessons_rank: rank, coach_total: list.length, salary_estimate: mine && trimObj(mine) };
  }
  if (coach_name) {
    const c = await resolveCoach(ctx, coach_name);
    return { month: m, coach: list.find(x => x.coach_id === c.id) || null };
  }
  return { month: m, ranking: list, total_lessons: list.reduce((s, x) => s + x.lessons, 0), total_sales: +list.reduce((s, x) => s + x.sales_money, 0).toFixed(2) };
}

// 去掉大字段, 防止把列表明细整个塞给模型
function trimObj(o, depth = 0) {
  if (Array.isArray(o)) return o.slice(0, 15).map(x => trimObj(x, depth + 1));
  if (o && typeof o === 'object') {
    const out = {};
    Object.keys(o).forEach((k) => { if (!/avatar|password|token|openid|cover|image|photo/i.test(k)) out[k] = depth > 3 ? String(o[k]).slice(0, 60) : trimObj(o[k], depth + 1); });
    return out;
  }
  return o;
}

const SEGMENTS = { low_lesson: '课时不足', birthday_week: '本周生日', trained_10: '当月满10次', trained_50: '半年满50次', timecard_active: '有效期卡', timecard_expired: '已过期期卡' };
async function listSegment(ctx, { key }) {
  if (!SEGMENTS[key]) return { error: `可选名单：${Object.entries(SEGMENTS).map(([k, v]) => `${k}=${v}`).join('，')}` };
  const data = await callApi(ctx, 'GET', `/member-segments/${key}?size=30`);
  const list = (data.list || data.rows || data || []);
  return {
    segment: SEGMENTS[key], total: data.total != null ? data.total : list.length,
    members: list.slice(0, 30).map(v => ({
      vip_id: v.id, name: v.realname, phone_tail: tail(v.phone), main_coach: v.coach_name || '',
      birthday: v.birthday ? dayjs(v.birthday).format('MM-DD') : undefined,
      left_lessons: v.left_total, trained_this_month: v.trained_month,
    })),
  };
}

async function listStudents(ctx, { coach_name }) {
  const coach = await resolveCoach(ctx, coach_name);
  const rows = await callApi(ctx, 'GET', `/coaches/${coach.id}/students`);
  return {
    coach: coach.realname, count: rows.length,
    students: rows.slice(0, 60).map(s => ({
      vip_id: s.id, name: s.realname, phone_tail: tail(s.phone), card: s.card_type_name,
      left: `${s.left_counts}/${s.counts}`, expire: fmtD(s.expire_time),
      last_lesson: s.last_lesson_time ? fmtD(s.last_lesson_time) : '从未上课', lessons_30d: s.lessons_30d,
    })),
  };
}

async function groupClasses(ctx, { date, with_roster }) {
  const d = fmtD(date) || dayjs().format('YYYY-MM-DD');
  const cond = ['merchant_id=?', 'start_time BETWEEN ? AND ?', 'status IN (1,3)']; const p = [ctx.mid, `${d} 00:00:00`, `${d} 23:59:59`];
  if (ctx.isCoach) { cond.push('coach_id=?'); p.push(ctx.coachId || -1); } else if (ctx.clubScope) { cond.push('club_id=?'); p.push(ctx.clubScope); }
  const gc = await db.query(`SELECT * FROM biz_syllabus_group WHERE ${cond.join(' AND ')} ORDER BY start_time`, p);
  const out = [];
  for (const g of gc) {
    const item = { syllabus_id: g.id, title: g.title, coach: g.coach_name, time: `${dayjs(g.start_time).format('HH:mm')}-${dayjs(g.end_time).format('HH:mm')}`, room: g.classroom_name, booked: `${g.booked_count || 0}/${g.people_count || 0}` };
    if (with_roster !== false) {
      const bk = await db.query('SELECT id, realname, phone, status FROM biz_syllabus_subscribe_record WHERE syllabus_id=? AND status IN (0,1,2,4) ORDER BY id', [g.id]);
      item.roster = bk.map(b => ({ group_booking_id: b.id, member: b.realname, phone_tail: tail(b.phone), status: GROUP_STATUS[b.status] }));
    }
    out.push(item);
  }
  return { date: d, day: dayLabel(d), classes: out };
}

async function storeReport(ctx, { type = 'dashboard', date, month }) {
  if (!ctx.isMgr) return { error: '经营数据仅店长/管理员可查看' };
  const d = fmtD(date) || dayjs().format('YYYY-MM-DD');
  const m = /^\d{4}-\d{2}$/.test(month || '') ? month : dayjs().format('YYYY-MM');
  const map = {
    dashboard: `/finance/dashboard?mode=${month ? 'month' : 'day'}&date=${d}&month=${m}`,
    monthly: `/finance/monthly?month=${m}`,
    card_balance: '/finance/card-balance?size=20',
    overview: `/report/overview?month=${m}`,
    checkin: `/checkin-report?from=${dayjs(d).subtract(6, 'day').format('YYYY-MM-DD')}&to=${d}`,
    coach_consume: `/finance/coach-consume?from=${m}-01&to=${dayjs(m + '-01').endOf('month').format('YYYY-MM-DD')}`,
  };
  if (!map[type]) return { error: `可选类型：${Object.keys(map).join('/')}` };
  const data = await callApi(ctx, 'GET', map[type]);
  return { type, date: d, month: m, data: trimObj(data) };
}

async function listMilestones(ctx) {
  const data = await callApi(ctx, 'GET', '/milestones?status=0&size=20');
  return {
    total: data.total,
    milestones: (data.list || []).map(m => ({ milestone_id: m.id, vip_id: m.vip_id, member: m.realname, node: m.type === 1 ? `第${m.node_value}节课` : `第${m.node_value}天`, card: m.card_type_name, created: fmtD(m.insert_time) })),
  };
}

/* ================= 写操作: 只生成草稿卡片 ================= */
function pushAction(ctx, card) {
  ctx.cards.push({ type: 'action', ...card });
  return { ok: true, message: `草稿已生成，正在等待员工在卡片上点击「${card.btn}」，此时还没有真正执行，请只回复「请在下方卡片确认」之类的话` };
}
// checkTimeRange 的提示是会员口吻(您/我的), 员工端改成第三人称
const staffWhy = (w) => String(w || '').replace(/您/g, '会员').replace(/我的(私教|团课)/g, '会员的$1');
const timeRe = /^(\d{1,2}):(\d{2})$/;
function normTime(t) { const m = String(t || '').match(timeRe); return m ? `${m[1].padStart(2, '0')}:${m[2]}` : ''; }

async function pickCourseAndCard(ctx, coachId, vipId, date, { course_name, card_id } = {}) {
  const courses = await db.query('SELECT id, title, duration, coach_ids, card_scope FROM biz_ptrain_course WHERE merchant_id=? AND status=1 ORDER BY sort, id', [ctx.mid]);
  const teachable = courses.filter(c => { const ids = JSON.parse(c.coach_ids || '[]'); return !ids.length || ids.includes(coachId); });
  if (!teachable.length) throw new BizError('该教练暂未开设可预约的私教课程');
  const cards = (await memberCards(vipId)).filter(c => !cardBlockReason(c, date));
  const fits = (course) => { const sc = JSON.parse(course.card_scope || '[]'); return cards.filter(c => !sc.length || sc.includes(c.card_type_id)); };
  let course = course_name ? teachable.find(c => c.title.includes(course_name) || course_name.includes(c.title)) : null;
  if (!course) course = teachable.find(c => fits(c).length && /私教/.test(c.title)) || teachable.find(c => fits(c).length) || teachable[0];
  const usable = fits(course);
  let card = card_id ? usable.find(c => c.id === Number(card_id)) : null;
  if (!card) card = usable[0];
  if (!card) throw new BizError('该会员没有可用于私教课的会员卡（次数用完/已到期），需要先开卡或续卡（涉及金额，请到会员详情页办理）');
  return { course, card };
}

async function proposeBooking(ctx, a) {
  const v = await getMember(ctx, a.vip_id);
  // 管理者没说教练、自己也不是教练时, 默认约会员的主教练
  const coach = (!ctx.isCoach && !a.coach_name && !ctx.coachId && v.coach_id)
    ? (await listCoaches(ctx)).find(c => c.id === v.coach_id) || await resolveCoach(ctx, a.coach_name)
    : await resolveCoach(ctx, a.coach_name);
  const date = fmtD(a.date);
  if (!/^\d{4}-\d{2}-\d{2}$/.test(date || '')) return { error: '请确认上课日期' };
  const from = normTime(a.from_time);
  if (!from) return { error: '请确认开始时间，例如 19:00' };
  const { course, card } = await pickCourseAndCard(ctx, coach.id, v.id, date, a);
  const club = await myClub(ctx);
  const draft = { vip_id: v.id, member: vname(v), coach_id: coach.id, coach_name: coach.realname, course_id: course.id, course_title: course.title, duration: course.duration, card_id: card.id, club_id: club && club.id, date, from_time: from };
  const why = checkTimeRange({ date, fromTime: from, duration: course.duration, openTime: club && club.open_time, coachBusy: await getCoachBusy(coach.id, date), memberBusy: await getMemberBusy(v.id, date), allowPast: false });
  const rows = [['会员', `${vname(v)}（尾号${tail(v.phone)}）`], ['教练', coach.realname], ['课程', `${course.title}（${course.duration}分钟）`], ['用卡', `${cardBrief(card).name} · ${cardBrief(card).left}`]];
  if (why) {
    const alts = await nearestSlots(coach.id, date, from, course.duration, club && club.open_time, v.id);
    if (!alts.length) return { error: `${why}，近几天也没有空档` };
    pushAction(ctx, {
      act: 'book', title: '该时段有冲突，选一个最近的空档', warn: `${dayLabel(date)} ${from} ${staffWhy(why)}`,
      rows, options: alts.map(x => ({ value: `${x.date} ${x.from_time}`, label: `${dayLabel(x.date)} ${x.from_time}` })), option: `${alts[0].date} ${alts[0].from_time}`,
      btn: '确认代约', draft,
    });
    return { conflict: staffWhy(why), suggestions: alts, message: '时段冲突，已在卡片上列出最近的空档供员工选择，请告诉员工冲突原因并让其在卡片上选择后确认' };
  }
  rows.splice(2, 0, ['时间', `${dayLabel(date)} ${from}-${fromMin(toMin(from) + course.duration)}`]);
  return pushAction(ctx, { act: 'book', title: '确认代约私教课', rows, btn: '确认代约', draft });
}

async function proposeCancel(ctx, { booking_ids, reason }) {
  const ids = [...new Set((booking_ids || []).map(Number).filter(Boolean))].slice(0, BATCH_MAX);
  if (!ids.length) return { error: '请先用 find_bookings 找到要取消的 booking_id' };
  const items = [];
  for (const id of ids) {
    const bk = await getBooking(ctx, id);
    if (![0, 1].includes(bk.status)) return { error: `${bk.realname} ${fmtD(bk.date)} ${bk.from_time} 的课当前「${PT_STATUS[bk.status]}」，不能取消` };
    items.push({ id: bk.id, text: `${bk.realname} · ${dayLabel(bk.date)} ${bk.from_time}-${bk.to_time}`, sub: `${bk.coach_name} · ${bk.course_title}`, checked: true });
  }
  const r = normReason(reason) || staffOpLabel(ctx, '取消');
  return pushAction(ctx, { act: 'cancel', title: ids.length > 1 ? `确认取消 ${ids.length} 节课` : '确认取消这节课', items, rows: [['原因', r]], btn: '确认取消', danger: true, draft: { reason: r } });
}

async function proposeReschedule(ctx, { booking_id, new_date, new_from_time }) {
  const bk = await getBooking(ctx, booking_id);
  if (![0, 1].includes(bk.status)) return { error: `这节课当前「${PT_STATUS[bk.status]}」，不能改约` };
  const date = fmtD(new_date) || fmtD(bk.date);
  const from = normTime(new_from_time);
  if (!from) return { error: '请确认改到几点' };
  const duration = toMin(bk.to_time) - toMin(bk.from_time) || 60;
  const club = await myClub(ctx);
  const cb = (await getCoachBusy(bk.coach_id, date)).filter(b => !(fmtD(bk.date) === date && b.type === 'booked' && b.from === bk.from_time && b.to === bk.to_time));
  const why = checkTimeRange({ date, fromTime: from, duration, openTime: club && club.open_time, coachBusy: cb, memberBusy: await getMemberBusy(bk.vip_id, date, bk.id), allowPast: false });
  const draft = { booking_id: bk.id, vip_id: bk.vip_id, coach_id: bk.coach_id, course_id: bk.course_id, card_id: bk.card_id, club_id: bk.club_id || (club && club.id), date, from_time: from, duration };
  const rows = [['会员', bk.realname], ['原时间', `${dayLabel(bk.date)} ${bk.from_time}-${bk.to_time}`]];
  if (why) {
    const alts = await nearestSlots(bk.coach_id, date, from, duration, club && club.open_time, bk.vip_id, bk.id);
    if (!alts.length) return { error: `${why}，近几天也没有空档` };
    pushAction(ctx, { act: 'reschedule', title: '新时段有冲突，选一个最近的空档', warn: `${dayLabel(date)} ${from} ${staffWhy(why)}`, rows, options: alts.map(x => ({ value: `${x.date} ${x.from_time}`, label: `${dayLabel(x.date)} ${x.from_time}` })), option: `${alts[0].date} ${alts[0].from_time}`, btn: '确认改约', draft });
    return { conflict: staffWhy(why), suggestions: alts, message: '新时段冲突，已在卡片上给出最近空档，请员工选择后确认' };
  }
  rows.push(['改到', `${dayLabel(date)} ${from}-${fromMin(toMin(from) + duration)}`]);
  return pushAction(ctx, { act: 'reschedule', title: '确认改约（取消原课并重约）', rows, btn: '确认改约', draft });
}

async function bookingItems(ctx, ids, rows, check) {
  const items = [];
  for (const id of ids) {
    const bk = await getBooking(ctx, id);
    const why = check(bk);
    if (why) continue;
    items.push({ id: bk.id, text: `${bk.realname} · ${dayLabel(bk.date)} ${bk.from_time}-${bk.to_time}`, sub: `${bk.coach_name} · ${bk.course_title}`, checked: true });
  }
  return items;
}

async function proposeConfirm(ctx, { booking_ids }) {
  let ids = (booking_ids || []).map(Number).filter(Boolean);
  if (!ids.length) ids = (await pendingRows(ctx, 'confirm')).map(b => b.id);
  const items = await bookingItems(ctx, ids.slice(0, BATCH_MAX), [], bk => (bk.status !== 0 ? '非待确认' : ''));
  if (!items.length) return { error: '没有待确认的预约' };
  return pushAction(ctx, { act: 'confirm', title: `确认 ${items.length} 个待确认预约`, items, btn: '全部确认', draft: {} });
}

async function proposeFinish(ctx, { booking_ids, mode }) {
  let ids = (booking_ids || []).map(Number).filter(Boolean);
  if (!ids.length) ids = (await pendingRows(ctx, 'finish')).map(b => b.id);
  const items = await bookingItems(ctx, ids.slice(0, BATCH_MAX), [], bk => (bk.status !== 1 ? '非已确认' : ''));
  if (!items.length) return { error: '没有可消课的课程（只有「已确认」状态的课可以消课）' };
  return pushAction(ctx, {
    act: 'finish', title: items.length > 1 ? `消课 ${items.length} 节` : '确认消课', items,
    options: [{ value: 'finish', label: '直接消课（扣课时）' }, { value: 'start_finish', label: '发给学员确认后再扣' }],
    option: mode === 'start_finish' ? 'start_finish' : 'finish', btn: '确认消课', draft: {},
  });
}

async function proposeNoshow(ctx, { booking_ids }) {
  const ids = (booking_ids || []).map(Number).filter(Boolean).slice(0, BATCH_MAX);
  const items = await bookingItems(ctx, ids, [], bk => (bk.status !== 1 ? 'x' : ''));
  if (!items.length) return { error: '只有「已确认」的预约可以标记爽约' };
  return pushAction(ctx, { act: 'noshow', title: '确认标记爽约', items, btn: '标记爽约', danger: true, draft: {} });
}

async function proposeGroupCheckin(ctx, { syllabus_id, group_booking_ids }) {
  let rows = [];
  if (group_booking_ids && group_booking_ids.length) {
    rows = await db.query(`SELECT b.*, g.coach_id g_coach, g.title g_title FROM biz_syllabus_subscribe_record b LEFT JOIN biz_syllabus_group g ON g.id=b.syllabus_id
      WHERE b.id IN (${group_booking_ids.map(() => '?').join(',')}) AND b.merchant_id=?`, [...group_booking_ids.map(Number), ctx.mid]);
  } else if (syllabus_id) {
    rows = await db.query(`SELECT b.*, g.coach_id g_coach, g.title g_title FROM biz_syllabus_subscribe_record b LEFT JOIN biz_syllabus_group g ON g.id=b.syllabus_id
      WHERE b.syllabus_id=? AND b.merchant_id=? AND b.status=1`, [syllabus_id, ctx.mid]);
  }
  if (ctx.isCoach) rows = rows.filter(b => b.g_coach === ctx.coachId);
  rows = rows.filter(b => b.status === 1).slice(0, BATCH_MAX);
  if (!rows.length) return { error: '没有可签到的团课预约（只有「已约」状态可签到，候补需先转正）' };
  return pushAction(ctx, {
    act: 'checkin', title: `团课签到 · ${rows[0].g_title || rows[0].syllabus_title}`,
    items: rows.map(b => ({ id: b.id, text: b.realname, sub: `尾号${tail(b.phone)} · ${dayjs(b.class_start_time).format('MM-DD HH:mm')}`, checked: true })),
    btn: '确认签到', draft: {},
  });
}

async function proposeRest(ctx, { date, from_time, to_time, remark, coach_name }) {
  const coach = await resolveCoach(ctx, coach_name);
  const d = fmtD(date);
  if (!d) return { error: '请确认请假日期' };
  const f = normTime(from_time); const t = normTime(to_time);
  const fm = f ? toMin(f) : 0; const tm = t ? toMin(t) : 24 * 60;
  const [bks, gcs] = await Promise.all([
    db.query('SELECT * FROM biz_ptrain_bespeak_record WHERE coach_id=? AND `date`=? AND status IN (0,1) ORDER BY from_time', [coach.id, d]),
    db.query(`SELECT title, DATE_FORMAT(start_time,'%H:%i') f, DATE_FORMAT(end_time,'%H:%i') t FROM biz_syllabus_group WHERE coach_id=? AND DATE(start_time)=? AND status IN (1,3)`, [coach.id, d]),
  ]);
  const hit = bks.filter(b => toMin(b.from_time) < tm && toMin(b.to_time) > fm);
  const ghit = gcs.filter(g => toMin(g.f) < tm && toMin(g.t) > fm);
  const conflicts = [...hit.map(b => `${b.from_time} ${b.realname} 私教(预约#${b.id})`), ...ghit.map(g => `${g.f} 团课·${g.title}`)];
  pushAction(ctx, {
    act: 'rest', title: '确认请假', btn: '确认请假',
    rows: [['教练', coach.realname], ['日期', dayLabel(d)], ['时间', f ? `${f}-${t || '24:00'}` : '全天'], ...(remark ? [['事由', remark]] : [])],
    warn: conflicts.length ? `该时段还有 ${conflicts.length} 节课：${conflicts.join('；')}。请假后这些课不会自动取消，建议先改约或取消` : '',
    draft: { coach_id: coach.id, rest_date: d, from_time: f, to_time: f ? (t || '23:59') : '', remark: remark || '' },
  });
  return { conflicts, conflict_booking_ids: hit.map(b => b.id), message: conflicts.length ? '已生成请假卡片，但时段内有课，请提醒员工并建议先改约（可调用 propose_reschedule）' : '请假草稿已生成，等员工确认' };
}

async function parsePlanText(ctx, text) {
  const data = await callApi(ctx, 'POST', '/training-plans/parse', { text: String(text || '').slice(0, 800) });
  return { title: data.title || '训练计划', items: data.items || [] };
}
const itemText = (x) => `${x.action_name} ${x.sets || ''}组×${x.reps || ''}${x.unit || '次'}${x.weight ? ' ' + x.weight + (/kg/i.test(x.weight) ? '' : 'kg') : ''}`;

/* ---- 训练计划来源: 模板 / 会员上次的计划 / 新建(口述) ---- */
const parseItems = (raw) => { try { const a = JSON.parse(raw || '[]'); return Array.isArray(a) ? a : []; } catch { return []; } };

// 可选的计划: 我的模板(教练只看自己的, 管理者看全店) + 该会员最近 3 份计划
async function planChoices(ctx, vipId, keyword) {
  const cond = ['merchant_id=?', 'status=1', 'is_template=1']; const p = [ctx.mid];
  if (ctx.isCoach) { cond.push('coach_id=?'); p.push(ctx.coachId || -1); }
  if (keyword) { cond.push('title LIKE ?'); p.push(`%${String(keyword).slice(0, 20)}%`); }
  const templates = await db.query(`SELECT id, title, coach_name, items FROM biz_training_plan WHERE ${cond.join(' AND ')} ORDER BY id DESC LIMIT 8`, p);
  const recent = vipId ? await db.query(
    'SELECT id, title, plan_date, coach_name, items FROM biz_training_plan WHERE merchant_id=? AND vip_id=? AND status=1 AND is_template=0 ORDER BY plan_date DESC, id DESC LIMIT 3',
    [ctx.mid, vipId]) : [];
  const brief = (items) => `${items.length}个动作：${items.slice(0, 3).map(x => x.action_name).join('、')}${items.length > 3 ? '…' : ''}`;
  return {
    templates: templates.map(t => ({ plan_id: t.id, title: t.title, coach: t.coach_name, actions: brief(parseItems(t.items)) })),
    recent: recent.map(t => ({ plan_id: t.id, title: t.title, date: fmtD(t.plan_date), actions: brief(parseItems(t.items)) })),
  };
}
async function askPlanSource(ctx, vipId, keyword, forWhat) {
  const c = await planChoices(ctx, vipId, keyword);
  ctx.cards.push({
    type: 'pick', title: `${forWhat}用哪份训练计划？`,
    options: [
      ...c.templates.map(t => ({ label: `模板「${t.title}」`, sub: t.actions, send: `用模板「${t.title}」（计划ID ${t.plan_id}）` })),
      ...c.recent.map(t => ({ label: `沿用 ${dayjs(t.date).format('M月D日')}「${t.title}」`, sub: t.actions, send: `沿用${dayjs(t.date).format('M月D日')}的「${t.title}」（计划ID ${t.plan_id}）` })),
      { label: '新建一份计划', sub: '直接说动作安排，比如：卧推4组12次，深蹲5组8次60公斤', send: '新建一份计划' },
    ],
  });
  return {
    need_choice: true, ...c,
    message: `已给员工出了选择卡片（${c.templates.length}个模板、${c.recent.length}份该会员之前的计划、新建）。请问一句「用之前的模板，还是新建？」，等员工选择：选了模板/之前的计划就带 plan_id 再调用；说新建就请他说出动作安排后带 text 调用`,
  };
}
async function loadPlan(ctx, planId, vipId) {
  const t = await db.queryOne('SELECT * FROM biz_training_plan WHERE id=? AND merchant_id=? AND status=1', [planId, ctx.mid]);
  if (!t) throw new BizError('这份训练计划不存在或已删除');
  // 教练只能用自己的模板, 或该会员自己的历史计划
  if (ctx.isCoach && t.coach_id !== ctx.coachId && !(vipId && t.vip_id === vipId)) throw new BizError('只能使用自己的训练计划模板');
  const items = parseItems(t.items);
  if (!items.length) throw new BizError('这份计划里没有动作');
  return { title: t.title, items, note: t.note || '', source: t.is_template ? `模板「${t.title}」` : `沿用 ${dayjs(t.plan_date).format('M月D日')} 的计划` };
}
// 新建(口述)的计划可以顺手存为模板, 下次直接选
const SAVE_TPL_OPTS = [{ value: 'once', label: '只用这一次' }, { value: 'template', label: '同时存为我的模板' }];

async function proposeLessonPlan(ctx, { booking_id, text, plan_id, note }) {
  const bk = await getBooking(ctx, booking_id);
  if (![0, 1, 3].includes(bk.status)) return { error: `这节课已${PT_STATUS[bk.status]}，不能再写课程计划` };
  if (!plan_id && !String(text || '').trim()) return askPlanSource(ctx, bk.vip_id, '', `给 ${bk.realname} ${dayLabel(bk.date)} ${bk.from_time} 的课`);
  const plan = plan_id ? await loadPlan(ctx, Number(plan_id), bk.vip_id) : { ...(await parsePlanText(ctx, text)), source: '新建' };
  return pushAction(ctx, {
    act: 'lesson_plan', title: '确认本节课训练计划', btn: '保存计划',
    rows: [['课程', `${bk.realname} · ${dayLabel(bk.date)} ${bk.from_time}`], ['来源', plan.source], ['计划', plan.title]],
    list: plan.items.map(itemText),
    ...(plan_id ? {} : { options: SAVE_TPL_OPTS, option: 'once' }),
    draft: { booking_id: bk.id, title: plan.title, items: plan.items, note: note || plan.note || '' },
  });
}

async function proposePushPlan(ctx, { vip_id, text, plan_id, plan_date, note }) {
  const v = await getMember(ctx, vip_id);
  if (!plan_id && !String(text || '').trim()) return askPlanSource(ctx, v.id, '', `给 ${vname(v)} 推送`);
  const plan = plan_id ? await loadPlan(ctx, Number(plan_id), v.id) : { ...(await parsePlanText(ctx, text)), source: '新建' };
  const d = fmtD(plan_date) || dayjs().format('YYYY-MM-DD');
  return pushAction(ctx, {
    act: 'push_plan', title: '确认推送训练计划', btn: '保存并推送',
    rows: [['会员', `${vname(v)}（尾号${tail(v.phone)}）`], ['日期', dayLabel(d)], ['来源', plan.source], ['标题', plan.title]],
    list: plan.items.map(itemText),
    ...(plan_id ? {} : { options: SAVE_TPL_OPTS, option: 'once' }),
    draft: { vip_id: v.id, title: plan.title, items: plan.items, plan_date: d, note: note || plan.note || '' },
  });
}

async function saveAsTemplate(ctx, d) {
  await callApi(ctx, 'POST', '/training-plans', { title: d.title, items: d.items, vip_id: 0, note: d.note || '', is_template: 1 });
}

async function proposeBody(ctx, a) {
  const v = await getMember(ctx, a.vip_id);
  const d = fmtD(a.record_date) || dayjs().format('YYYY-MM-DD');
  const F = { height: '身高cm', weight: '体重kg', body_fat: '体脂率%', muscle: '肌肉量kg', bust: '胸围cm', waist: '腰围cm', hip: '臀围cm' };
  const draft = { vip_id: v.id, record_date: d, remark: a.remark || '' };
  const rows = [['会员', vname(v)], ['日期', dayLabel(d)]];
  Object.keys(F).forEach((k) => { const n = Number(a[k]); if (n > 0) { draft[k] = n; rows.push([F[k], String(n)]); } });
  if (rows.length === 2) return { error: '请告诉我具体的体测数值，比如体重、体脂率' };
  const last = await db.queryOne('SELECT weight, body_fat FROM biz_body_record WHERE vip_id=? ORDER BY record_date DESC, id DESC LIMIT 1', [v.id]);
  if (last && draft.weight && Number(last.weight)) rows.push(['较上次体重', `${(draft.weight - Number(last.weight)).toFixed(1)}kg`]);
  return pushAction(ctx, { act: 'body', title: '确认录入体测', rows, btn: '确认录入', draft });
}

async function proposeMaintain(ctx, { vip_id, content, record_type, todo_time }) {
  const v = await getMember(ctx, vip_id);
  if (!content) return { error: '请说一下维护内容' };
  const types = { 电话: 1, 到店: 2, 微信: 3, 其他: 4 };
  const rt = types[record_type] || Number(record_type) || 3;
  const todo = todo_time ? dayjs(todo_time).format('YYYY-MM-DD HH:mm:ss') : '';
  return pushAction(ctx, {
    act: 'maintain', title: '确认添加维护记录', btn: '保存记录',
    rows: [['会员', vname(v)], ['方式', ['', '电话', '到店', '微信', '其他'][rt] || '微信'], ...(todo ? [['下次跟进', dayjs(todo).format('M月D日 HH:mm')]] : [])],
    text: String(content).slice(0, 500), text_label: '维护内容（可修改）',
    draft: { vip_user_id: v.id, record_type: rt, todo_time: todo },
  });
}

async function proposePotential(ctx, { realname, phone, gender, remark }) {
  const p = String(phone || '').replace(/\D/g, '');
  if (!/^1\d{10}$/.test(p)) return { error: '请提供11位手机号' };
  const g = gender === '男' || gender === 1 ? 1 : gender === '女' || gender === 2 ? 2 : 0;
  return pushAction(ctx, {
    act: 'potential', title: '确认录入潜在客户', btn: '确认录入',
    rows: [['姓名', realname || '未填'], ['手机', p], ['性别', ['未知', '男', '女'][g]]],
    text: remark || '', text_label: '备注（可修改）',
    draft: { realname: realname || '', phone: p, gender: g, source_name: 'AI助手录入' },
  });
}

async function proposeMilestoneSummary(ctx, { milestone_id, summary }) {
  const m = await db.queryOne('SELECT * FROM biz_milestone WHERE id=? AND merchant_id=?', [milestone_id, ctx.mid]);
  if (!m) return { error: '里程碑不存在，可先调用 list_milestones' };
  if (!summary) return { error: '请先写好总结内容' };
  return pushAction(ctx, {
    act: 'milestone', title: '确认提交里程碑总结', btn: '提交总结',
    rows: [['会员', m.realname], ['节点', m.type === 1 ? `第${m.node_value}节课` : `第${m.node_value}天`]],
    text: String(summary).slice(0, 1000), text_label: '训练总结（可修改）', draft: { milestone_id: m.id },
  });
}

/* ================= 工作量统计(上课 + 训练计划) ================= */
// 口径: 上课节数 = 消课记录 SUM(costs)(与教练业绩/报表一致, 含补录); 取消/爽约看预约表;
// 课程计划填写率 = 时间段内已完成的预约里写了「本节课计划」的节数; 训练计划 = 该教练新建的(非模板)计划份数, 推送=已推送给会员的
async function workStats(mid, coachId, from, to) {
  const F = `${from} 00:00:00`; const T = `${to} 23:59:59`;
  const cw = coachId ? ' AND coach_id=?' : ''; const cp = coachId ? [coachId] : [];
  const [rec, bk, plan, gc] = await Promise.all([
    db.queryOne(`SELECT COALESCE(SUM(costs),0) lessons, COUNT(DISTINCT vip_id) students, COUNT(*) records, SUM(bespeak_id=0) manual FROM biz_ptrain_record WHERE merchant_id=?${cw} AND insert_time BETWEEN ? AND ?`, [mid, ...cp, F, T]),
    db.queryOne(`SELECT SUM(status=3) finished, SUM(status=3 AND lesson_plan IS NOT NULL AND lesson_plan<>'') with_plan, SUM(status=2) cancelled, SUM(status=4) noshow
                   FROM biz_ptrain_bespeak_record WHERE merchant_id=?${cw} AND \`date\` BETWEEN ? AND ?`, [mid, ...cp, from, to]),
    db.queryOne(`SELECT SUM(is_template=0) created, SUM(is_template=0 AND pushed=1) pushed, SUM(is_template=1) templates, COUNT(DISTINCT IF(is_template=0, vip_id, NULL)) members
                   FROM biz_training_plan WHERE merchant_id=?${cw} AND status=1 AND insert_time BETWEEN ? AND ?`, [mid, ...cp, F, T]),
    db.queryOne(`SELECT COUNT(*) n FROM biz_syllabus_group WHERE merchant_id=?${cw} AND status IN (1,3) AND start_time BETWEEN ? AND ? AND start_time<=NOW()`, [mid, ...cp, F, T]),
  ]);
  const N = v => Number(v) || 0;
  return {
    from, to,
    lessons: N(rec.lessons), lesson_records: N(rec.records), manual_records: N(rec.manual), students: N(rec.students),
    group_classes_taught: N(gc.n),
    finished_bookings: N(bk.finished), lessons_with_plan: N(bk.with_plan),
    plan_fill_rate: N(bk.finished) ? `${Math.round(N(bk.with_plan) / N(bk.finished) * 100)}%` : '-',
    cancelled: N(bk.cancelled), noshow: N(bk.noshow),
    plans_created: N(plan.created), plans_pushed: N(plan.pushed), plan_members: N(plan.members), templates_created: N(plan.templates),
  };
}
async function getWorkStats(ctx, { date_from, date_to, coach_name }) {
  const from = fmtD(date_from) || dayjs().startOf('month').format('YYYY-MM-DD');
  const to = fmtD(date_to) || dayjs().format('YYYY-MM-DD');
  const note = '上课节数以消课记录为准(与教练业绩一致, 含手动补录); 课程计划=预约上挂的「本节课计划」; 训练计划=新建并发给会员的计划';
  if (ctx.isCoach || coach_name || (ctx.coachId && !ctx.isMgr)) {
    const c = await resolveCoach(ctx, coach_name);
    return { coach: c.realname, ...(await workStats(ctx.mid, c.id, from, to)), note };
  }
  // 管理者不指定教练: 全店合计 + 各教练明细
  const coaches = await listCoaches(ctx);
  const per = [];
  for (const c of coaches) {
    const w = await workStats(ctx.mid, c.id, from, to);
    if (w.lessons || w.plans_created || w.finished_bookings || w.group_classes_taught) per.push({ coach: c.realname, lessons: w.lessons, students: w.students, plan_fill_rate: w.plan_fill_rate, plans_created: w.plans_created, plans_pushed: w.plans_pushed, group_classes_taught: w.group_classes_taught });
  }
  return { scope: '全店', ...(await workStats(ctx.mid, 0, from, to)), by_coach: per, note };
}

/* ================= 话术库 ================= */
const { SCENES, sceneOf } = SCRIPT_LIB;
async function getScripts(ctx, { scene, keyword }) {
  const sc = sceneOf(scene) || sceneOf(keyword);
  if (!sc) {
    ctx.cards.push({
      type: 'pick', title: '要看哪类话术？',
      options: Object.entries(SCENES).map(([k, v]) => ({ label: v.name, sub: v.desc, send: `${v.name}话术` })),
    });
    return { scenes: Object.entries(SCENES).map(([k, v]) => ({ scene: k, name: v.name })), message: '已给出话术分类卡片，请员工选一类' };
  }
  const S0 = SCENES[sc];
  await ensureTables();
  const mine = await db.query('SELECT id, title, content, username FROM biz_ai_script WHERE merchant_id=? AND scene=? AND status=1 ORDER BY id DESC LIMIT 10', [ctx.mid, sc]);
  const items = [
    ...mine.map(x => ({ title: x.title || '门店话术', content: x.content, by: `门店 · ${x.username}` })),
    ...S0.scripts.map(x => ({ title: x.title, content: x.content, by: '' })),
  ];
  ctx.cards.push({ type: 'scripts', title: `话术库 · ${S0.name}`, tips: S0.tips, items });
  return {
    scene: sc, name: S0.name, tips: S0.tips, count: items.length, scripts: items.map(x => `【${x.title}】${x.content}`),
    message: '话术卡片已展示给员工(可逐条复制)。回复只需一句话；如果员工提到具体会员，先 get_member_profile，再参照这些话术的结构写一份填好真实数据的，用 make_copy_card 给出',
  };
}

// 需要跟进的会员: expiring 卡快到期/课时快用完, inactive 长期未到店, trial 体验客户
async function listFollowup(ctx, { kind = 'expiring', days }) {
  const [sc, sp] = studentSql(ctx);
  let rows = [];
  let sceneName = '';
  if (kind === 'expiring') {
    sceneName = SCENES.expiring.name;
    const d = Math.min(90, Number(days) || 30);
    rows = await db.query(
      `SELECT v.id, v.realname, v.phone, c.card_type_name, c.card_kind, c.left_counts, c.expire_time
         FROM biz_member_card c JOIN biz_vip_user v ON v.id=c.vip_id
        WHERE c.merchant_id=? AND c.status=1 AND v.status=1${sc}
          AND ((c.expire_time BETWEEN NOW() AND ?) OR (c.card_kind IN (1,4) AND c.left_counts<=2))
        ORDER BY c.expire_time LIMIT 30`, [ctx.mid, ...sp, dayjs().add(d, 'day').format('YYYY-MM-DD 23:59:59')]);
    rows = rows.map(r => ({
      vip_id: r.id, name: r.realname, phone_tail: tail(r.phone), card: r.card_type_name,
      left: [1, 4].includes(r.card_kind) ? `剩${r.left_counts}次` : '', expire: fmtD(r.expire_time),
      why: [1, 4].includes(r.card_kind) && r.left_counts <= 2 ? `课时剩${r.left_counts}节` : `${fmtD(r.expire_time)}到期`,
    }));
  } else if (kind === 'inactive') {
    sceneName = SCENES.inactive.name;
    const d = Math.min(180, Number(days) || 21);
    const since = dayjs().subtract(d, 'day').format('YYYY-MM-DD');
    rows = await db.query(
      `SELECT v.id, v.realname, v.phone,
              GREATEST(COALESCE((SELECT MAX(DATE(ck.check_in_time)) FROM biz_checkin_record ck WHERE ck.vip_id=v.id),'2000-01-01'),
                       COALESCE((SELECT MAX(DATE(pr.insert_time)) FROM biz_ptrain_record pr WHERE pr.vip_id=v.id),'2000-01-01')) last_day
         FROM biz_vip_user v
        WHERE v.merchant_id=? AND v.status=1${sc}
          AND EXISTS (SELECT 1 FROM biz_member_card lc WHERE lc.vip_id=v.id AND lc.status IN (0,1))
       HAVING last_day < ? ORDER BY last_day DESC LIMIT 30`, [ctx.mid, ...sp, since]);
    rows = rows.map(r => ({
      vip_id: r.id, name: r.realname, phone_tail: tail(r.phone),
      last: fmtD(r.last_day) === '2000-01-01' ? '从未到店' : fmtD(r.last_day),
      why: fmtD(r.last_day) === '2000-01-01' ? '办卡后还没来过' : `${dayjs().diff(dayjs(r.last_day), 'day')}天没来`,
    }));
  } else {
    sceneName = SCENES.trial.name;
    const since = dayjs().subtract(60, 'day').format('YYYY-MM-DD');
    const vs = await db.query(
      `SELECT DISTINCT v.id, v.realname, v.phone, c.card_type_name, c.insert_time
         FROM biz_member_card c JOIN biz_vip_user v ON v.id=c.vip_id
        WHERE c.merchant_id=? AND c.card_type_name LIKE '%体验%' AND c.status IN (0,1,2) AND c.insert_time>=? AND v.status=1${sc}
          AND NOT EXISTS (SELECT 1 FROM biz_member_card o WHERE o.vip_id=v.id AND o.status IN (0,1) AND o.card_type_name NOT LIKE '%体验%')
        ORDER BY c.insert_time DESC LIMIT 20`, [ctx.mid, since, ...sp]);
    const pc = ['merchant_id=?', 'status=1', 'is_vip_user=0', 'insert_time>=?']; const pp = [ctx.mid, since];
    if (ctx.isCoach) { pc.push('coach_id=?'); pp.push(ctx.coachId || -1); }
    const pts = await db.query(`SELECT id, realname, phone, remark FROM biz_user_potential WHERE ${pc.join(' AND ')} ORDER BY id DESC LIMIT 20`, pp).catch(() => []);
    rows = [
      ...vs.map(r => ({ vip_id: r.id, name: r.realname, phone_tail: tail(r.phone), why: `体验卡 ${r.card_type_name}` })),
      ...pts.map(r => ({ potential_id: r.id, name: r.realname || '潜客', phone_tail: tail(r.phone), why: `潜在客户${r.remark ? ' · ' + String(r.remark).slice(0, 12) : ''}` })),
    ];
  }
  if (rows.length) {
    ctx.cards.push({
      type: 'pick', title: `需要跟进的会员（${sceneName}）`,
      options: rows.slice(0, 8).map(r => ({
        label: `${r.name}（尾号${r.phone_tail}）`, sub: r.why,
        send: `给${r.name}写一份「${sceneName}」话术（${r.vip_id ? `会员ID ${r.vip_id}` : `潜客ID ${r.potential_id}`}）`,
      })),
    });
  }
  return { kind, scene: sceneName, count: rows.length, members: rows, message: rows.length ? '已出选人卡片，员工点谁就给谁写个性化话术' : '目前没有需要跟进的会员' };
}

function proposeSaveScript(ctx, { scene, title, content }) {
  const sc = sceneOf(scene) || sceneOf(title) || sceneOf(content);
  if (!sc) return { error: `请说明归到哪一类：${Object.values(SCENES).map(v => v.name).join('、')}` };
  if (!String(content || '').trim()) return { error: '话术内容为空' };
  return pushAction(ctx, {
    act: 'save_script', title: '存入门店话术库', btn: '存入话术库',
    rows: [['分类', SCENES[sc].name], ['标题', title || '门店话术']],
    text: String(content).slice(0, 1000), text_label: '话术内容（可修改，会员姓名等建议写成{会员}）',
    draft: { scene: sc, title: String(title || '门店话术').slice(0, 60) },
  });
}

/* 小S 办不了的事, 一律给出对应功能页的引导按钮。roles 与工作台「全部功能」菜单一致, 没权限的页面不给 */
const ALL = ['admin', 'manager', 'membership', 'reception', 'coach'];
const MGR = ['admin', 'manager'];
const CARD_ROLES = ['admin', 'manager', 'membership', 'reception'];
const PT_ROLES = ['admin', 'manager', 'coach'];
const PAGES = {
  member: { name: '会员详情', desc: '会员资料、名下会员卡（续卡/退卡/暂停/延期/改卡在卡详情里办理）', path: v => `/staff/member/${v}`, roles: CARD_ROLES.concat('coach'), needVip: true },
  members: { name: '会员列表', desc: '找会员、看会员资料', path: () => '/staff/members', roles: CARD_ROLES },
  opencard: { name: '快速开卡', desc: '开卡、办卡、续卡（续买一张新卡）、储值充值', path: v => (v ? `/staff/opencard?vip_id=${v}` : '/staff/opencard'), roles: CARD_ROLES },
  cards: { name: '会员卡列表', desc: '退卡、暂停/恢复、延期、修改卡信息、转卡', path: () => '/staff/cards', roles: CARD_ROLES },
  intents: { name: '购卡意向', desc: '会员提交的购卡意向跟进', path: () => '/staff/intents', roles: CARD_ROLES },
  contracts: { name: '合同管理', desc: '电子合同、签约', path: () => '/staff/contracts', roles: ['admin', 'manager', 'reception'] },
  card_categories: { name: '卡类型配置', desc: '卡种、价格、约课限制配置', path: () => '/staff/card-categories', roles: MGR },
  book: { name: '代约课', desc: '手动代约私教课/团课', path: v => (v ? `/staff/book?vip_id=${v}` : '/staff/book'), roles: PT_ROLES },
  bookings: { name: '预约管理', desc: '查看/处理所有私教预约', path: () => '/staff/bookings', roles: ['admin', 'manager', 'reception', 'coach'] },
  pt_records: { name: '消课记录', desc: '消课记录、手动补录消课', path: () => '/staff/pt-records', roles: PT_ROLES },
  schedule: { name: '教练课表', desc: '日/周课表', path: () => '/staff/schedule', roles: PT_ROLES },
  rests: { name: '休息管理', desc: '请假/休息设置与删除', path: () => '/staff/rests', roles: PT_ROLES },
  plans: { name: '训练计划', desc: '训练计划与模板', path: () => '/staff/plans', roles: PT_ROLES },
  milestones: { name: '里程碑总结', desc: '里程碑训练总结', path: () => '/staff/milestones', roles: PT_ROLES },
  students: { name: '学员管理', desc: '名下私教学员', path: () => '/staff/students', roles: PT_ROLES },
  training_actions: { name: '动作库', desc: '健身动作库维护', path: () => '/staff/training-actions', roles: PT_ROLES },
  coach_profile: { name: '我的主页', desc: '教练个人主页、头像、介绍', path: () => '/staff/profile', roles: ['coach'] },
  coaches: { name: '教练档案', desc: '教练资料、排序、上下架', path: () => '/staff/coaches', roles: MGR },
  pt_courses: { name: '私教课程', desc: '私教课程、时长、可授课教练', path: () => '/staff/pt-courses', roles: MGR },
  schedule_admin: { name: '排课表', desc: '团课排课、复制周课表', path: () => '/staff/schedule-admin', roles: ['admin', 'manager', 'reception'] },
  group_today: { name: '团课核销', desc: '今日团课签到核销', path: () => '/staff/group-today', roles: ['admin', 'manager', 'reception'] },
  group_courses: { name: '团课课程库', desc: '团课课程维护', path: () => '/staff/group-courses', roles: MGR },
  checkin: { name: '前台签到', desc: '会员到店签到', path: () => '/staff/checkin', roles: ['admin', 'manager', 'reception'] },
  checkin_records: { name: '签到记录', desc: '到店签到记录', path: () => '/staff/checkin-records', roles: ['admin', 'manager', 'reception'] },
  potential: { name: '潜在客户', desc: '潜客录入与跟进', path: () => '/staff/potential', roles: ['admin', 'manager', 'membership'] },
  my_perf: { name: '我的业绩', desc: '个人业绩与收入', path: () => '/staff/my-perf', roles: ALL },
  perf: { name: '教练业绩', desc: '教练课时业绩排名', path: () => '/staff/perf', roles: PT_ROLES },
  dashboard: { name: '数据看板', desc: '经营看板', path: () => '/staff/dashboard', roles: MGR },
  report: { name: '报表中心', desc: '会员/财务报表、导出', path: () => '/staff/report', roles: MGR },
  finance_monthly: { name: '月度报表', desc: '月度经营报表', path: () => '/staff/finance-monthly', roles: MGR },
  recharges: { name: '收款明细', desc: '收款/退款流水', path: () => '/staff/recharges', roles: MGR },
  spends: { name: '耗卡明细', desc: '耗卡流水', path: () => '/staff/spends', roles: MGR },
  card_balance: { name: '剩余卡价值', desc: '卡余额负债', path: () => '/staff/card-balance', roles: MGR },
  settings_staff: { name: '员工与角色', desc: '员工账号、角色、重置密码、可上私教课', path: () => '/staff/settings-staff', roles: MGR },
  settings_club: { name: '门店信息', desc: '门店名称、地址、营业时间', path: () => '/staff/settings-club', roles: MGR },
  op_logs: { name: '操作日志', desc: '谁在什么时候做了什么', path: () => '/staff/op-logs', roles: MGR },
};
function pushPage(ctx, page, vipId) {
  const p = PAGES[page];
  if (!p || !p.roles.includes(ctx.role === 'platform' ? 'admin' : ctx.role)) return false;
  if (p.needVip && !vipId) return pushPage(ctx, ctx.isCoach ? 'students' : 'members');
  if (ctx.cards.some(c => c.type === 'link' && c.path === p.path(vipId))) return true;
  ctx.cards.push({ type: 'link', text: `去「${p.name}」办理`, path: p.path(vipId) });
  return true;
}
function openPage(ctx, { page, vip_id }) {
  if (!PAGES[page]) return { error: `可选页面：${Object.keys(PAGES).join('/')}` };
  if (!pushPage(ctx, page, vip_id)) return { error: `员工的账号没有「${PAGES[page].name}」页面的权限，不要说「点下方按钮」，请告诉员工找店长或前台办理` };
  return { ok: true, message: '入口按钮已放在回复下方，回复里说一句「点下方按钮去办理」即可' };
}

/* 兜底: 小S 回复说办不了/去页面办, 但模型没调用 open_page 时, 按关键词补一个最相关的入口按钮 */
const PAGE_HINTS = [
  [/补录|补消|手动消课|补课时/, 'pt_records'],
  [/退卡|退款|暂停|停卡|延期|转卡|改卡|修改.*卡|卡.*(修改|调整|转让)/, 'cards'],
  [/开卡|办卡|买卡|购卡|续卡|充值|储值/, 'opencard'],
  [/合同|签约/, 'contracts'],
  [/意向/, 'intents'],
  [/卡类型|卡种|价格/, 'card_categories'],
  [/排课|团课.*(安排|排)|复制.*课表/, 'schedule_admin'],
  [/团课.*(核销|签到)/, 'group_today'],
  [/签到/, 'checkin'],
  [/私教课程|课程设置|课程时长/, 'pt_courses'],
  [/教练档案|教练资料/, 'coaches'],
  [/主页|头像|个人介绍/, 'coach_profile'],
  [/动作库/, 'training_actions'],
  [/员工|账号|密码|角色/, 'settings_staff'],
  [/门店.*(信息|地址|营业)/, 'settings_club'],
  [/删.*(请假|休息)|取消.*(请假|休息)|休息设置/, 'rests'],
  [/训练计划|计划模板/, 'plans'],
  [/里程碑/, 'milestones'],
  [/收款|流水/, 'recharges'],
  [/报表|导出/, 'report'],
  [/日志/, 'op_logs'],
  [/约课|代约|预约/, 'book'],
  [/会员资料|会员信息|改.*(手机|姓名|资料)/, 'members'],
];
const CANT_RE = /办不了|做不了|没法|无法|不能(直接)?(帮|办|执行|操作|处理)|不支持|只能给你|页面|入口|去.{0,6}(办理|操作|处理)/;
// 返回需要追加到回复里的说明(命中的页面当前账号都没有权限时)
function guideFallback(ctx, userText, reply) {
  if (ctx.cards.some(c => c.type === 'link' || c.type === 'action')) return '';
  if (!CANT_RE.test(reply)) return '';
  const vip = (ctx.lastVip && ctx.lastVip.id) || null;
  let denied = '';
  for (const src of [userText, reply]) {
    for (const [re, page] of PAGE_HINTS) {
      if (!re.test(src)) continue;
      if (pushPage(ctx, page, page === 'opencard' || page === 'book' ? vip : null)) return '';
      denied = denied || PAGES[page].name;
    }
  }
  return denied ? `\n「${denied}」需要店长或前台的账号办理，可以请他们帮忙。` : '';
}

function makeCopyCard(ctx, { title, text }) {
  if (!text) return { error: '内容为空' };
  ctx.cards.push({ type: 'copy', title: title || '文案草稿', text: String(text).slice(0, 1500) });
  return { ok: true, message: '已放进可复制卡片，回复里不用再重复全文，简单说一句即可' };
}

/* ================= 工具定义 ================= */
const P = (props, required) => ({ type: 'object', properties: props, ...(required ? { required } : {}) });
const str = (description) => ({ type: 'string', ...(description ? { description } : {}) });
const int = (description) => ({ type: 'integer', ...(description ? { description } : {}) });
const ids = (description) => ({ type: 'array', items: { type: 'integer' }, description });
const COACH = str('教练名，管理者指定其他教练时填写；教练本人不用填');

function toolDefs(ctx) {
  const list = [
    { name: 'search_member', description: '按姓名/拼音/手机尾号模糊搜索会员, 拿到 vip_id。提到任何会员名字都要先调用', parameters: P({ keyword: str('姓名、拼音或手机号后4位') }, ['keyword']) },
    { name: 'get_member_profile', description: '会员360画像: 会员卡余量、最近5节课、即将上的课(booking_id)、体测趋势、最近训练计划、最近维护记录、待写里程碑', parameters: P({ vip_id: int() }, ['vip_id']) },
    { name: 'get_schedule', description: '查课表: 某教练某日期范围的私教预约(booking_id)、团课、请假。管理者不指定教练时看全店', parameters: P({ date_from: str('YYYY-MM-DD'), date_to: str('YYYY-MM-DD'), coach_name: COACH }) },
    { name: 'get_free_slots', description: '查某教练某天可约的开始时间(已排除已约/已完课/团课/请假, 带 vip_id 时同时排除会员自己的课)', parameters: P({ date: str('YYYY-MM-DD'), coach_name: COACH, duration: int('分钟, 默认60'), vip_id: int() }, ['date']) },
    { name: 'find_bookings', description: '查私教预约(拿 booking_id 用于取消/改约/消课/爽约/写计划)。status: pending待确认/confirmed已确认/active未上/done已完成/cancelled/noshow', parameters: P({ vip_id: int(), date_from: str('YYYY-MM-DD'), date_to: str('YYYY-MM-DD'), status: str(), coach_name: COACH }) },
    { name: 'list_pending', description: '待办: kind=confirm 待确认预约 / finish 已上完还没消课 / plan 今明两天没填课程计划', parameters: P({ kind: { type: 'string', enum: ['confirm', 'finish', 'plan'] } }, ['kind']) },
    { name: 'get_work_stats', description: '工作量统计(某段时间): 上课节数(以消课记录为准, 含补录)、服务学员数、团课节数、取消/爽约、课程计划填写率、新建/推送训练计划份数、新存模板数。问「上了多少课」「写/发了多少训练计划」时用它。管理者不指定教练则返回全店合计和各教练明细', parameters: P({ date_from: str('YYYY-MM-DD, 默认本月1日'), date_to: str('YYYY-MM-DD, 默认今天'), coach_name: COACH }) },
    { name: 'get_performance', description: '业绩: 某月消课课时、耗课金额、销售业绩、课时排名、工资预估。month=YYYY-MM', parameters: P({ month: str(), coach_name: COACH }) },
    { name: 'list_segment', description: '会员名单: low_lesson课时不足 / birthday_week本周生日 / trained_10当月满10次 / trained_50半年满50次 / timecard_active有效期卡 / timecard_expired已过期期卡(教练自动只看自己的学员)', parameters: P({ key: { type: 'string', enum: Object.keys(SEGMENTS) } }, ['key']) },
    { name: 'list_students', description: '教练名下私教学员: 卡余量、到期日、最近上课时间、近30天课时(用于找沉睡学员)', parameters: P({ coach_name: COACH }) },
    { name: 'get_group_classes', description: '某天的团课及预约名单(group_booking_id, 用于签到)', parameters: P({ date: str('YYYY-MM-DD') }) },
    { name: 'list_milestones', description: '待填写训练总结的里程碑(milestone_id)', parameters: P({}) },

    { name: 'propose_booking', description: '生成代约私教课草稿卡片(不直接下单)。冲突时会自动在卡片上给出最近空档', parameters: P({ vip_id: int(), date: str('YYYY-MM-DD'), from_time: str('HH:mm, 分钟00/15/30/45'), coach_name: COACH, course_name: str() }, ['vip_id', 'date', 'from_time']) },
    { name: 'propose_cancel', description: '生成取消私教预约草稿(可多节)', parameters: P({ booking_ids: ids('booking_id 列表'), reason: str('用户明确说了取消原因时才填，没说就留空(默认管理员代取消)') }, ['booking_ids']) },
    { name: 'propose_reschedule', description: '生成改约草稿: 取消原课并重约到新时间, 一张卡片完成', parameters: P({ booking_id: int(), new_date: str('YYYY-MM-DD, 不填为原日期'), new_from_time: str('HH:mm') }, ['booking_id', 'new_from_time']) },
    { name: 'propose_confirm_bookings', description: '生成批量确认待确认预约草稿; 不传 booking_ids 则取全部待确认', parameters: P({ booking_ids: ids() }) },
    { name: 'propose_finish', description: '生成消课草稿(可批量勾选); 不传 booking_ids 则取全部已上完未消课。mode=finish直接消课 / start_finish发学员确认', parameters: P({ booking_ids: ids(), mode: { type: 'string', enum: ['finish', 'start_finish'] } }) },
    { name: 'propose_noshow', description: '生成标记爽约草稿', parameters: P({ booking_ids: ids() }, ['booking_ids']) },
    { name: 'propose_group_checkin', description: '生成团课签到草稿: 传 syllabus_id 签到整节课已约学员, 或传 group_booking_ids 指定几个人', parameters: P({ syllabus_id: int(), group_booking_ids: ids() }) },
    { name: 'propose_rest', description: '生成请假草稿, 会自动检查该时段已有的课并提示。不填时间=全天', parameters: P({ date: str('YYYY-MM-DD'), from_time: str('HH:mm'), to_time: str('HH:mm'), remark: str('事由'), coach_name: COACH }, ['date']) },
    { name: 'propose_lesson_plan', description: '给某节私教预约挂「本节课训练计划」(待确认/已确认/已完成的课都可以)。三种来源: 传 plan_id 用模板或会员之前的计划; 传 text 把口述动作新建; 两者都不传则给员工出选择卡片(模板/之前的计划/新建)', parameters: P({ booking_id: int(), plan_id: int('模板或之前计划的 计划ID'), text: str('新建时的口述内容, 如: 卧推4组12次 深蹲5组8次60公斤'), note: str() }, ['booking_id']) },
    { name: 'propose_push_plan', description: '给会员推送训练计划(会员小程序可见+短信)。传 plan_id 用模板或之前的计划; 传 text 口述新建; 都不传则先给员工出选择卡片', parameters: P({ vip_id: int(), plan_id: int('模板或之前计划的 计划ID'), text: str('新建时的口述内容'), plan_date: str('YYYY-MM-DD'), note: str() }, ['vip_id']) },
    { name: 'propose_body_record', description: '生成体测录入草稿', parameters: P({ vip_id: int(), record_date: str('YYYY-MM-DD'), height: { type: 'number' }, weight: { type: 'number' }, body_fat: { type: 'number', description: '体脂率%' }, muscle: { type: 'number' }, bust: { type: 'number' }, waist: { type: 'number' }, hip: { type: 'number' }, remark: str() }, ['vip_id']) },
    { name: 'propose_maintain', description: '生成会员维护(跟进)记录草稿, 可带下次跟进时间(待办)', parameters: P({ vip_id: int(), content: str(), record_type: { type: 'string', enum: ['电话', '到店', '微信', '其他'] }, todo_time: str('YYYY-MM-DD HH:mm') }, ['vip_id', 'content']) },
    { name: 'propose_potential', description: '生成录入潜在客户草稿', parameters: P({ realname: str(), phone: str(), gender: str('男/女'), remark: str() }, ['phone']) },
    { name: 'propose_milestone_summary', description: '把你写好的里程碑训练总结生成提交草稿(员工可在卡片上修改后提交)', parameters: P({ milestone_id: int(), summary: str() }, ['milestone_id', 'summary']) },
    { name: 'get_scripts', description: `话术库: 门店标准话术+门店沉淀话术, 会以可复制卡片展示。scene 可选: ${Object.entries(SCENES).map(([k, v]) => `${k}=${v.name}`).join('，')}; 不传 scene 则出分类选择卡片`, parameters: P({ scene: { type: 'string', enum: Object.keys(SCENES) } }) },
    { name: 'list_followup', description: '需要跟进的会员名单并出选人卡片: expiring 卡快到期/课时快用完(days 默认30), inactive 长期未到店(days 默认21), trial 体验客户/潜客(近60天)。教练只看自己的学员', parameters: P({ kind: { type: 'string', enum: ['expiring', 'inactive', 'trial'] }, days: int() }, ['kind']) },
    { name: 'propose_save_script', description: '把一段话术存进门店话术库(员工确认后保存, 全店可见)', parameters: P({ scene: { type: 'string', enum: Object.keys(SCENES) }, title: str(), content: str() }, ['scene', 'content']) },
    { name: 'make_copy_card', description: '把你写好的续卡/召回话术、课后反馈、生日祝福等文案放进可一键复制的卡片', parameters: P({ title: str(), text: str() }, ['text']) },
    { name: 'open_page', description: `给出功能页入口按钮。凡是你办不了的事都必须调用它。可选页面：${Object.entries(PAGES).map(([k, p]) => `${k}=${p.name}(${p.desc})`).join('；')}`, parameters: P({ page: { type: 'string', enum: Object.keys(PAGES) }, vip_id: int('涉及具体会员时填写, 开卡/代约/会员详情会自动带上该会员') }, ['page']) },
  ];
  if (ctx.isMgr) {
    list.push({ name: 'store_report', description: '经营数据(店长/管理员): dashboard当日或当月营收与客流 / monthly月度经营 / card_balance卡余额(负债) / overview报表总览 / checkin近7天到店 / coach_consume教练耗课排名', parameters: P({ type: { type: 'string', enum: ['dashboard', 'monthly', 'card_balance', 'overview', 'checkin', 'coach_consume'] }, date: str('YYYY-MM-DD'), month: str('YYYY-MM') }, ['type']) });
  }
  return list.map(f => ({ type: 'function', function: f }));
}

async function runTool(ctx, name, a) {
  switch (name) {
    case 'search_member': return searchMember(ctx, a);
    case 'get_member_profile': return memberProfile(ctx, a);
    case 'get_schedule': return getSchedule(ctx, a);
    case 'get_free_slots': return freeSlots(ctx, a);
    case 'find_bookings': return findBookings(ctx, a);
    case 'list_pending': return listPending(ctx, a);
    case 'get_performance': return getPerformance(ctx, a);
    case 'get_work_stats': return getWorkStats(ctx, a);
    case 'list_segment': return listSegment(ctx, a);
    case 'list_students': return listStudents(ctx, a);
    case 'get_group_classes': return groupClasses(ctx, a);
    case 'list_milestones': return listMilestones(ctx);
    case 'store_report': return storeReport(ctx, a);
    case 'propose_booking': return proposeBooking(ctx, a);
    case 'propose_cancel': return proposeCancel(ctx, a);
    case 'propose_reschedule': return proposeReschedule(ctx, a);
    case 'propose_confirm_bookings': return proposeConfirm(ctx, a);
    case 'propose_finish': return proposeFinish(ctx, a);
    case 'propose_noshow': return proposeNoshow(ctx, a);
    case 'propose_group_checkin': return proposeGroupCheckin(ctx, a);
    case 'propose_rest': return proposeRest(ctx, a);
    case 'propose_lesson_plan': return proposeLessonPlan(ctx, a);
    case 'propose_push_plan': return proposePushPlan(ctx, a);
    case 'propose_body_record': return proposeBody(ctx, a);
    case 'propose_maintain': return proposeMaintain(ctx, a);
    case 'propose_potential': return proposePotential(ctx, a);
    case 'propose_milestone_summary': return proposeMilestoneSummary(ctx, a);
    case 'make_copy_card': return makeCopyCard(ctx, a);
    case 'get_scripts': return getScripts(ctx, a);
    case 'list_followup': return listFollowup(ctx, a);
    case 'propose_save_script': return proposeSaveScript(ctx, a);
    case 'open_page': return openPage(ctx, a);
    default: return { error: `未知工具 ${name}` };
  }
}

async function systemPrompt(ctx) {
  const clubs = await getClubs(ctx.mid);
  const n = dayjs();
  const scope = ctx.isCoach ? '你只能查看和操作这位教练自己的学员和课程。'
    : ctx.isMgr ? `你可以查看全店数据${ctx.coachId ? '；对方本人也是教练，说「我的课」时指他自己的课' : ''}。` : '你可以查看门店的会员与课程。';
  return `你是「${BOT_NAME} · 教练版」，3S运动中心（重庆）的 AI 工作助手，正在为${ROLE_NAME[ctx.role] || '员工'}「${ctx.name}」服务。${scope}
现在是 ${n.format('YYYY-MM-DD HH:mm')} 星期${WEEK[n.day()]}。门店：${clubs.map(c => `${c.name}(营业${c.open_time})`).join('；')}。

你只做三件事：听懂员工的话 → 调用工具查数据或生成草稿 → 让员工在卡片上点确认。

规则：
1. 所有数字、名单、时间必须来自工具返回，严禁编造；查不到就如实说。上课节数、训练计划份数用 get_work_stats（与业绩报表同一口径），不要自己数预约。
2. 写操作（代约、取消、改约、确认预约、消课、爽约、团课签到、请假、课程计划、推送训练计划、体测、维护记录、潜客、里程碑总结）只能调用对应的 propose_* 工具生成卡片，之后只说「请在下方卡片确认」，绝不能说已经完成。
3. 话里提到会员时，先用 search_member 拿 vip_id。匹配到多位时停下来问「你说的是哪位？」（已自动给出选择卡片），不要自己猜；一个都没找到就请对方说手机尾号。
4. 把「明天下午三点」「周五晚上7点半」换算成具体日期和24小时制，分钟用00/15/30/45；分不清上午下午、或会员/时间不明确时先问清楚再操作。
5. 取消/改约/消课/爽约/写课程计划前，先用 find_bookings 或 list_pending 找到 booking_id。
   员工只说「代约课」没给信息时，问一句「给哪位会员约？哪天几点？」${ctx.isCoach ? '' : '（不说教练就默认会员的主教练）'}；只说「代消课」时直接调用 propose_finish（不传 booking_ids，会列出${ctx.isCoach ? '你' : '全店'}已上完还没消课的课，员工在卡片上勾选），没有待消课的就如实说。
6. 你办不了的事（开卡、续卡、退卡、储值充值/扣费、补录消课、改卡/延期/暂停、合同、团课排课、各种设置等），一句话说明原因，并且必须调用 open_page 给出最相关的页面入口（涉及具体会员时带上 vip_id），回复里说「点下方按钮去办理」。
   课程计划可以写在「待确认」或「已确认」的课上，不需要先确认预约。
   挂/推送训练计划时，员工没说具体动作、也没指定模板，就先只传 booking_id（或 vip_id）调用，系统会列出模板和会员之前的计划，然后问「用之前的模板，还是新建？」；员工选了就带 plan_id，说新建就请他口述动作后带 text。不要默认新建。
7. 批量操作一次最多20条，超过时告诉员工分批处理。
8. 写话术、课后反馈、生日祝福、里程碑总结前，先查会员画像，结合真实数据写，语气真诚自然、不夸张不承诺效果；写好用 make_copy_card（里程碑总结用 propose_milestone_summary）。
   话术库：员工说「话术库」或某类话术（体验课、续卡/快过期、沉睡激活、课后反馈、生日）时调用 get_scripts；问「该跟进谁」「哪些卡快过期」「谁好久没来」「体验客户」时调用 list_followup。给具体会员写话术时：get_member_profile + get_scripts(对应场景) 后，参照标准话术的结构写一份填好真实数据（剩余课时、到期日、训练次数、体测变化等）的，用 make_copy_card 给出。员工说「把这段存进话术库」时用 propose_save_script，内容里的会员姓名换成{会员}。
9. 回复简洁口语化，一般不超过120字，不要用 Markdown 标题、表格、加粗；列清单时用「・」。
10. 与门店工作无关的话题，礼貌说明你只负责门店工作相关的事。`;
}

/* ================= 存储 / 用量 ================= */
async function saveMsg(ctx, role, content, { cards = null, tokens = 0 } = {}) {
  return db.insert('INSERT INTO biz_ai_staff_message (merchant_id, user_id, role, content, cards, tokens) VALUES (?,?,?,?,?,?)',
    [ctx.mid, ctx.uid, role, content || '', cards && cards.length ? JSON.stringify(cards) : null, tokens]);
}
function msgOut(m) {
  let cards = [];
  try { cards = m.cards ? JSON.parse(m.cards) : []; } catch { cards = []; }
  // 草稿里的执行参数不下发给前端, 确认时以服务端存的为准
  cards = cards.map(({ draft, ...c }) => c);
  return { id: m.id, role: m.role, text: m.content, image: '', cards, time: dayjs(m.insert_time).format('MM-DD HH:mm') };
}
async function useQuota(ctx) {
  const d = dayjs().format('YYYY-MM-DD');
  const st = await db.queryOne('SELECT use_date, chats FROM biz_ai_staff_state WHERE user_id=?', [ctx.uid]);
  const used = st && fmtD(st.use_date) === d ? st.chats : 0;
  if (used >= DAILY_CHATS) throw new BizError(`今天已经和小S聊了 ${DAILY_CHATS} 条，明天继续吧`);
  await db.exec(`INSERT INTO biz_ai_staff_state (user_id, use_date, chats) VALUES (?,?,1)
    ON DUPLICATE KEY UPDATE chats=IF(use_date=VALUES(use_date), chats+1, 1), use_date=VALUES(use_date)`, [ctx.uid, d]);
}
async function markRead(ctx) {
  const m = await db.queryOne('SELECT MAX(id) id FROM biz_ai_staff_message WHERE user_id=?', [ctx.uid]);
  await db.exec('INSERT INTO biz_ai_staff_state (user_id, last_read_id) VALUES (?,?) ON DUPLICATE KEY UPDATE last_read_id=VALUES(last_read_id)', [ctx.uid, (m && m.id) || 0]);
}
// 去重占位: 返回 true 表示第一次
async function once(ctx, type, ref) {
  try { await db.insert('INSERT INTO biz_ai_staff_event (user_id, type, ref) VALUES (?,?,?)', [ctx.uid, type, String(ref)]); return true; } catch (e) { return false; }
}

/* ================= 主动推送: 早报 / 周报 / 课前提醒 / 漏消课 / 冲突预警 ================= */
function finishCard(rows, title) {
  return {
    type: 'action', act: 'finish', title, btn: '确认消课',
    items: rows.slice(0, BATCH_MAX).map(b => ({ id: b.id, text: `${b.realname} · ${dayLabel(b.date)} ${b.from_time}-${b.to_time}`, sub: b.course_title, checked: true })),
    options: [{ value: 'finish', label: '直接消课（扣课时）' }, { value: 'start_finish', label: '发给学员确认后再扣' }], option: 'finish', draft: {},
  };
}

async function conflictsOf(coachId, from, to) {
  const out = [];
  for (let d = dayjs(from); !d.isAfter(dayjs(to)); d = d.add(1, 'day')) {
    const ds = d.format('YYYY-MM-DD');
    const busy = (await getCoachBusy(coachId, ds)).filter(b => !(b.type === 'booked' && b.label === '已完课'));
    for (let i = 0; i < busy.length; i++) {
      for (let j = i + 1; j < busy.length; j++) {
        const a = busy[i]; const b = busy[j];
        if (!(toMin(a.from) < toMin(b.to) && toMin(b.from) < toMin(a.to))) continue;
        if (a.type === 'rest' || b.type === 'rest') {
          const [rest, other] = a.type === 'rest' ? [a, b] : [b, a];
          out.push(`${dayLabel(ds)}${rest.label === '全天休息' ? '请了全天假' : `${rest.from}-${rest.to}请了假`}，但 ${other.from} 还有「${other.label}」`);
        } else out.push(`${dayLabel(ds)} ${a.from}「${a.label}」与 ${b.from}「${b.label}」时间重叠`);
      }
    }
  }
  return out;
}

async function buildDailyBrief(ctx) {
  const today = dayjs().format('YYYY-MM-DD');
  if (!(await once(ctx, 'daily', today))) return;
  const lines = [`☀️ ${ctx.name}，早上好！今天是${dayjs().format('M月D日')} 星期${WEEK[dayjs().day()]}`];
  const cards = [];
  if (ctx.coachId) {
    const [lessons, gcs, pend, miss, noplan] = await Promise.all([
      db.query('SELECT * FROM biz_ptrain_bespeak_record WHERE coach_id=? AND `date`=? AND status IN (0,1,3) ORDER BY from_time', [ctx.coachId, today]),
      db.query("SELECT title, DATE_FORMAT(start_time,'%H:%i') f, booked_count, people_count FROM biz_syllabus_group WHERE coach_id=? AND DATE(start_time)=? AND status IN (1,3) ORDER BY start_time", [ctx.coachId, today]),
      pendingRows({ ...ctx, isCoach: true }, 'confirm'),
      pendingRows({ ...ctx, isCoach: true }, 'finish'),
      pendingRows({ ...ctx, isCoach: true }, 'plan'),
    ]);
    if (lessons.length || gcs.length) {
      lines.push(`\n📅 今天 ${lessons.length} 节私教${gcs.length ? `、${gcs.length} 节团课` : ''}：`);
      lessons.forEach(b => lines.push(`・${b.from_time} ${b.realname}${b.status === 0 ? '（待确认）' : b.status === 3 ? '（已完成）' : ''}${b.lesson_plan ? '' : '・未写计划'}`));
      gcs.forEach(g => lines.push(`・${g.f} 团课「${g.title}」${g.booked_count || 0}/${g.people_count || 0}人`));
    } else lines.push('\n📅 今天没有排课，可以约约沉睡学员～');
    const todo = [];
    if (pend.length) { todo.push(`${pend.length} 个预约待确认`); cards.push({ type: 'action', act: 'confirm', title: `确认 ${Math.min(pend.length, BATCH_MAX)} 个待确认预约`, btn: '全部确认', items: pend.slice(0, BATCH_MAX).map(b => ({ id: b.id, text: `${b.realname} · ${dayLabel(b.date)} ${b.from_time}`, sub: b.course_title, checked: true })), draft: {} }); }
    if (miss.length) {
      todo.push(`${miss.length} 节课上完还没消课`);
      cards.push(finishCard(miss, `${Math.min(miss.length, BATCH_MAX)} 节课待消课`));
      for (const b of miss) await once(ctx, 'miss', b.id);   // 早报里已经给了消课卡片, 不再单独提醒
    }
    if (noplan.length) todo.push(`今明两天 ${noplan.length} 节课没写课程计划`);
    const ms = await db.queryOne(`SELECT COUNT(*) n FROM biz_milestone WHERE merchant_id=? AND status=0 AND (coach_id=? OR (coach_id=0 AND vip_id IN (SELECT id FROM biz_vip_user WHERE coach_id=?)))`, [ctx.mid, ctx.coachId, ctx.coachId]).catch(() => null);
    if (ms && ms.n) todo.push(`${ms.n} 个里程碑待写总结`);
    const low = await db.query(`SELECT DISTINCT v.realname, c.left_counts FROM biz_member_card c JOIN biz_vip_user v ON v.id=c.vip_id
      WHERE c.merchant_id=? AND c.card_kind=4 AND c.status=1 AND c.left_counts<=2 AND (c.coach_id=? OR v.coach_id=?) LIMIT 5`, [ctx.mid, ctx.coachId, ctx.coachId]);
    if (low.length) todo.push(`课时快用完：${low.map(x => `${x.realname}(剩${x.left_counts})`).join('、')}`);
    const bd = await db.query(`SELECT realname, DATE_FORMAT(birthday,'%m-%d') md FROM biz_vip_user WHERE merchant_id=? AND status=1 AND (coach_id=? OR sub_coach_id=?)
      AND birthday IS NOT NULL AND DATE_FORMAT(birthday,'%m-%d') BETWEEN ? AND ? LIMIT 5`, [ctx.mid, ctx.coachId, ctx.coachId, dayjs().format('MM-DD'), dayjs().add(6, 'day').format('MM-DD')]).catch(() => []);
    if (bd.length) todo.push(`本周生日：${bd.map(x => `${x.realname}(${x.md})`).join('、')}，可以让我写祝福`);
    const cf = await conflictsOf(ctx.coachId, today, dayjs().add(2, 'day').format('YYYY-MM-DD'));
    if (cf.length) todo.push(`⚠️ 冲突预警：${cf.slice(0, 3).join('；')}`);
    if (todo.length) { lines.push('\n📌 待办：'); todo.forEach(t => lines.push(`・${t}`)); }
  }
  if (ctx.isMgr) {
    const cs = ctx.clubScope ? ' AND club_id=?' : ''; const cp = ctx.clubScope ? [ctx.clubScope] : [];
    const [pt, pend, miss, gc, ck] = await Promise.all([
      db.queryOne(`SELECT COUNT(*) n FROM biz_ptrain_bespeak_record WHERE merchant_id=?${cs} AND \`date\`=? AND status IN (0,1,3)`, [ctx.mid, ...cp, today]),
      db.queryOne(`SELECT COUNT(*) n FROM biz_ptrain_bespeak_record WHERE merchant_id=?${cs} AND status=0 AND \`date\`>=?`, [ctx.mid, ...cp, today]),
      db.queryOne(`SELECT COUNT(*) n FROM biz_ptrain_bespeak_record WHERE merchant_id=?${cs} AND status=1 AND \`date\`>=? AND CONCAT(\`date\`,' ',to_time)<=?`, [ctx.mid, ...cp, dayjs().subtract(14, 'day').format('YYYY-MM-DD'), dayjs().format('YYYY-MM-DD HH:mm')]),
      db.queryOne(`SELECT COUNT(*) n FROM biz_syllabus_group WHERE merchant_id=?${cs} AND DATE(start_time)=? AND status IN (1,3)`, [ctx.mid, ...cp, today]),
      db.queryOne(`SELECT COUNT(*) n FROM biz_checkin_record WHERE merchant_id=?${cs} AND DATE(check_in_time)=?`, [ctx.mid, ...cp, dayjs().subtract(1, 'day').format('YYYY-MM-DD')]),
    ]);
    lines.push(`\n🏬 全店：今天 ${pt.n} 节私教、${gc.n} 节团课；${pend.n} 个预约待教练确认；近两周 ${miss.n} 节课上完未消课；昨天到店 ${ck.n} 人次。`);
    lines.push('想看营收、卡余额、教练排名，直接问我就行。');
  }
  const id = await saveMsg(ctx, 'assistant', lines.join('\n'), { cards });
  return id;
}

async function buildWeeklyReport(ctx) {
  if (!ctx.coachId) return;
  const ws = dayjs().day() === 0 ? dayjs().subtract(6, 'day') : dayjs().day(1);
  const lastFrom = ws.subtract(7, 'day').format('YYYY-MM-DD'); const lastTo = ws.subtract(1, 'day').format('YYYY-MM-DD');
  if (!(await once(ctx, 'weekly', lastFrom))) return;
  const prevFrom = ws.subtract(14, 'day').format('YYYY-MM-DD'); const prevTo = ws.subtract(8, 'day').format('YYYY-MM-DD');
  const [a, b] = await Promise.all([workStats(ctx.mid, ctx.coachId, lastFrom, lastTo), workStats(ctx.mid, ctx.coachId, prevFrom, prevTo)]);
  const done = a.lessons; const pdone = b.lessons;
  if (!done && !pdone) return;
  const diff = done - pdone;
  const sleep = await db.query(`SELECT v.realname, MAX(DATE(p.insert_time)) last FROM biz_ptrain_record p JOIN biz_vip_user v ON v.id=p.vip_id
    WHERE p.coach_id=? GROUP BY p.vip_id HAVING last < ? AND last >= ? ORDER BY last DESC LIMIT 5`,
  [ctx.coachId, dayjs().subtract(14, 'day').format('YYYY-MM-DD'), dayjs().subtract(90, 'day').format('YYYY-MM-DD')]);
  const lines = [`📊 上周（${dayjs(lastFrom).format('M.D')}-${dayjs(lastTo).format('M.D')}）教练周报`,
    `・完成私教 ${done} 节，${diff === 0 ? '与前一周持平' : diff > 0 ? `比前一周多 ${diff} 节 👍` : `比前一周少 ${-diff} 节`}`,
    `・服务学员 ${a.students} 人，取消 ${a.cancelled} 节，爽约 ${a.noshow} 节`,
    `・课程计划：上完的 ${a.finished_bookings} 节课里 ${a.lessons_with_plan} 节写了计划；新发训练计划 ${a.plans_created} 份${a.templates_created ? `，新存模板 ${a.templates_created} 个` : ''}`];
  if (sleep.length) lines.push(`・超过两周没上课：${sleep.map(x => `${x.realname}(${dayjs(x.last).format('M.D')})`).join('、')}，可以让我写召回话术`);
  await saveMsg(ctx, 'assistant', lines.join('\n'));
}

// 课前 15 分钟提醒 + 下课 30 分钟仍未消课提醒(由前端每 3 分钟轮询 /dot 触发)
async function proactiveTick(ctx) {
  if (!ctx.coachId) return;
  const now = dayjs(); const today = now.format('YYYY-MM-DD'); const hm = now.format('HH:mm');
  const soon = await db.query(`SELECT * FROM biz_ptrain_bespeak_record WHERE coach_id=? AND \`date\`=? AND status IN (0,1)
    AND from_time > ? AND from_time <= ? ORDER BY from_time`, [ctx.coachId, today, hm, now.add(15, 'minute').format('HH:mm')]);
  for (const b of soon) {
    if (!(await once(ctx, 'pre', b.id))) continue;
    const plan = parseLessonPlan(b.lesson_plan);
    const last = await db.queryOne('SELECT `date`, lesson_plan FROM biz_ptrain_bespeak_record WHERE vip_id=? AND status=3 AND id<>? ORDER BY `date` DESC, from_time DESC LIMIT 1', [b.vip_id, b.id]);
    const lp = last && parseLessonPlan(last.lesson_plan);
    await saveMsg(ctx, 'assistant', `⏰ ${b.from_time} ${b.realname} 的私教课还有不到15分钟${b.status === 0 ? '（预约还没确认）' : ''}\n${plan && plan.actions.length ? `本节计划：${plan.actions.slice(0, 4).join('、')}` : '本节还没写课程计划，可以直接跟我说动作安排'}${lp && lp.actions.length ? `\n上次（${dayjs(last.date).format('M.D')}）练了：${lp.actions.slice(0, 3).join('、')}` : ''}`);
  }
  const miss = await db.query(`SELECT * FROM biz_ptrain_bespeak_record WHERE coach_id=? AND \`date\`=? AND status=1 AND confirm_status<>1
    AND to_time <= ? ORDER BY from_time`, [ctx.coachId, today, now.subtract(30, 'minute').format('HH:mm')]);
  const fresh = [];
  for (const b of miss) if (await once(ctx, 'miss', b.id)) fresh.push(b);
  if (fresh.length) {
    await saveMsg(ctx, 'assistant', `🔔 ${fresh.map(b => `${b.from_time} ${b.realname}`).join('、')} 的课已经下课半小时了，还没消课，点一下就能消：`,
      { cards: [finishCard(fresh, fresh.length > 1 ? `消课 ${fresh.length} 节` : '确认消课')] });
  }
}

/* ================= 执行草稿 ================= */
async function execAction(ctx, card, input) {
  const d = card.draft || {};
  const chosenIds = Array.isArray(input.items) ? input.items.map(Number) : (card.items || []).filter(i => i.checked).map(i => i.id);
  const allowed = new Set((card.items || []).map(i => i.id));
  const picked = chosenIds.filter(id => allowed.has(id)).slice(0, BATCH_MAX);
  const text = input.text != null ? String(input.text).trim().slice(0, 1000) : (card.text || '');
  const option = input.option != null ? String(input.option) : card.option;
  if (card.options && card.options.length && !card.options.some(o => o.value === option)) throw new BizError('请选择一个选项');

  const each = async (fn, label) => {
    if (!picked.length) throw new BizError('请至少勾选一项');
    const okN = []; const fails = [];
    for (const id of picked) {
      const it = card.items.find(i => i.id === id);
      try { await fn(id); okN.push(it.text); } catch (e) { fails.push(`${it.text}：${e.biz ? e.message : '失败'}`); }
    }
    await logAction(ctx.req, `[AI助手]${label}`, `${okN.length}项 ${okN.join('；')}${fails.length ? ` 失败${fails.length}项` : ''}`);
    if (!okN.length) throw new BizError(fails.join('\n'));
    return `${label}成功 ${okN.length} 项${fails.length ? `，失败 ${fails.length} 项：\n${fails.join('\n')}` : ''}`;
  };

  switch (card.act) {
    case 'book': {
      let date = d.date; let from = d.from_time;
      if (option) [date, from] = option.split(' ');
      await getMember(ctx, d.vip_id);
      await callApi(ctx, 'POST', '/ptrain-bookings', { vip_id: d.vip_id, coach_id: d.coach_id, course_id: d.course_id, card_id: d.card_id, club_id: d.club_id, date, from_time: from, remark: staffOpLabel(ctx, '预约') });
      await logAction(ctx.req, '[AI助手]私教代约', `${d.member} ${d.coach_name} ${date} ${from}`);
      return `已为 ${d.member} 约好 ${dayLabel(date)} ${from} ${d.coach_name} 的${d.course_title}`;
    }
    case 'reschedule': {
      let date = d.date; let from = d.from_time;
      if (option) [date, from] = option.split(' ');
      const bk = await getBooking(ctx, d.booking_id);
      if (![0, 1].includes(bk.status)) throw new BizError('原预约已不是待上课状态');
      await callApi(ctx, 'POST', `/ptrain-bookings/${bk.id}/cancel`, { reason: `${staffOpLabel(ctx, '取消')}（改约到${date} ${from}）` });
      try {
        await callApi(ctx, 'POST', '/ptrain-bookings', { vip_id: bk.vip_id, coach_id: bk.coach_id, course_id: bk.course_id, card_id: bk.card_id, club_id: bk.club_id || d.club_id, date, from_time: from, remark: staffOpLabel(ctx, '预约') });
      } catch (e) {
        // 重约失败: 恢复原预约, 不让会员凭空少一节课
        await db.exec('UPDATE biz_ptrain_bespeak_record SET status=?, cancel_reason=? WHERE id=?', [bk.status, bk.cancel_reason || '', bk.id]);
        throw new BizError(`重约失败，原预约已保留：${e.message}`);
      }
      await logAction(ctx.req, '[AI助手]改约', `${bk.realname} ${fmtD(bk.date)} ${bk.from_time} → ${date} ${from}`);
      return `已把 ${bk.realname} 的课从 ${dayLabel(bk.date)} ${bk.from_time} 改到 ${dayLabel(date)} ${from}`;
    }
    case 'cancel':
      return each(async (id) => { await getBooking(ctx, id); await callApi(ctx, 'POST', `/ptrain-bookings/${id}/cancel`, { reason: normReason(d.reason) || staffOpLabel(ctx, '取消') }); }, '取消预约');
    case 'confirm':
      return each(async (id) => { await getBooking(ctx, id); await callApi(ctx, 'POST', `/ptrain-bookings/${id}/confirm`); }, '确认预约');
    case 'finish':
      return each(async (id) => {
        await getBooking(ctx, id);
        if (option === 'start_finish') await callApi(ctx, 'POST', `/ptrain-bookings/${id}/start-finish`);
        else await callApi(ctx, 'POST', `/ptrain-bookings/${id}/finish`, { remark: 'AI助手' });
      }, option === 'start_finish' ? '发起消课' : '消课');
    case 'noshow':
      return each(async (id) => { await getBooking(ctx, id); await callApi(ctx, 'POST', `/ptrain-bookings/${id}/noshow`); }, '标记爽约');
    case 'checkin':
      return each(async (id) => {
        if (ctx.isCoach) {
          const g = await db.queryOne('SELECT g.coach_id FROM biz_syllabus_subscribe_record b JOIN biz_syllabus_group g ON g.id=b.syllabus_id WHERE b.id=?', [id]);
          if (!g || g.coach_id !== ctx.coachId) throw new BizError('不是你的团课');
        }
        await callApi(ctx, 'POST', `/syllabus-bookings/${id}/checkin`);
      }, '团课签到');
    case 'rest': {
      if (ctx.isCoach && d.coach_id !== ctx.coachId) throw new BizError('只能给自己请假');
      await callApi(ctx, 'POST', '/coach-rests', { coach_id: d.coach_id, rest_date: d.rest_date, from_time: d.from_time, to_time: d.to_time, remark: d.remark });
      await logAction(ctx.req, '[AI助手]教练请假', `教练#${d.coach_id} ${d.rest_date} ${d.from_time ? `${d.from_time}-${d.to_time}` : '全天'}`);
      return `已登记 ${dayLabel(d.rest_date)} ${d.from_time ? `${d.from_time}-${d.to_time}` : '全天'}请假，这段时间会员约不到你`;
    }
    case 'lesson_plan': {
      const bk = await getBooking(ctx, d.booking_id);
      await callApi(ctx, 'PUT', `/ptrain-bookings/${bk.id}/lesson-plan`, { lesson_plan: JSON.stringify({ title: d.title, items: d.items, note: d.note || '' }) });
      const tpl = option === 'template';
      if (tpl) await saveAsTemplate(ctx, d);
      await logAction(ctx.req, '[AI助手]课程计划', `${bk.realname} ${fmtD(bk.date)} ${bk.from_time} ${d.items.length}个动作${tpl ? ' 并存为模板' : ''}`);
      // 计划海报在前端用 canvas 生成(与手动「制定计划」同一套), 这里把数据交给前端补生成并回写 img_url
      ctx.post = { type: 'lesson_plan_poster', booking_id: bk.id, title: d.title, items: d.items, note: d.note || '', member: bk.realname, coach: bk.coach_name, date: fmtD(bk.date) };
      return `已保存 ${bk.realname} 这节课的训练计划，会员在小程序里能看到${tpl ? `；「${d.title}」已存为模板，下次可以直接选` : ''}`;
    }
    case 'push_plan': {
      await getMember(ctx, d.vip_id);
      const res = await callApi(ctx, 'POST', '/training-plans', { title: d.title, items: d.items, vip_id: d.vip_id, plan_date: d.plan_date, note: d.note || '' });
      await callApi(ctx, 'POST', `/training-plans/${res.id}/push`);
      const tpl = option === 'template';
      if (tpl) await saveAsTemplate(ctx, d);
      await logAction(ctx.req, '[AI助手]推送训练计划', `会员#${d.vip_id} ${d.title}${tpl ? ' 并存为模板' : ''}`);
      return `训练计划已保存并推送给会员${tpl ? `；「${d.title}」已存为模板` : ''}`;
    }
    case 'body': {
      await getMember(ctx, d.vip_id);
      await callApi(ctx, 'POST', '/body-records', d);
      await logAction(ctx.req, '[AI助手]录入体测', `会员#${d.vip_id} ${d.record_date}`);
      return '体测数据已录入';
    }
    case 'maintain': {
      if (!text) throw new BizError('维护内容不能为空');
      await getMember(ctx, d.vip_user_id);
      await callApi(ctx, 'POST', '/maintain-records', { vip_user_id: d.vip_user_id, vip_user_type: 1, record_type: d.record_type, content: text, is_todo: d.todo_time ? 1 : 0, todo_time: d.todo_time || null });
      await logAction(ctx.req, '[AI助手]维护记录', `会员#${d.vip_user_id} ${text.slice(0, 60)}`);
      return `维护记录已保存${d.todo_time ? `，${dayjs(d.todo_time).format('M月D日 HH:mm')} 会提醒你跟进` : ''}`;
    }
    case 'potential': {
      await callApi(ctx, 'POST', '/potentials', { ...d, remark: text });
      await logAction(ctx.req, '[AI助手]录入潜客', `${d.realname} ${d.phone}`);
      return `潜在客户 ${d.realname || d.phone} 已录入`;
    }
    case 'save_script': {
      if (!text) throw new BizError('话术内容不能为空');
      await db.insert('INSERT INTO biz_ai_script (merchant_id, scene, title, content, user_id, username) VALUES (?,?,?,?,?,?)',
        [ctx.mid, d.scene, d.title, text, ctx.uid, ctx.name]);
      await logAction(ctx.req, '[AI助手]存入话术库', `${SCENES[d.scene].name} · ${d.title}`);
      return `已存入门店话术库「${SCENES[d.scene].name}」，全店员工都能用`;
    }
    case 'milestone': {
      if (!text) throw new BizError('总结内容不能为空');
      await callApi(ctx, 'POST', `/milestones/${d.milestone_id}/summary`, { summary: text });
      await logAction(ctx.req, '[AI助手]里程碑总结', `#${d.milestone_id}`);
      return '里程碑总结已提交，会员可以看到';
    }
    default: throw new BizError('未知操作');
  }
}

/* ================= 路由 ================= */
// 代约课、代消课是教练和管理员最高频的操作, 固定排在最前面
const QUICK_MAIN = ['代约课', '代消课', '话术库'];
const QUICK_COACH = ['今天有哪些课', '确认待确认的预约', '明天下午请假', '查一下学员', '这个月业绩', '课时快用完的学员'];
const QUICK_MGR = ['今天营收多少', '全店今天的课', '待确认的预约', '教练课时排名', '卡余额负债', '课时快用完的会员'];

r.get('/dot', async (req, res, next) => {
  try {
    await ensureTables();
    const ctx = await ctxOf(req);
    await proactiveTick(ctx).catch(e => console.error('[AI-staff] tick:', e.message));
    const st = await db.queryOne('SELECT last_read_id FROM biz_ai_staff_state WHERE user_id=?', [ctx.uid]);
    const m = await db.queryOne('SELECT COUNT(*) n FROM biz_ai_staff_message WHERE user_id=? AND role=? AND id>?', [ctx.uid, 'assistant', (st && st.last_read_id) || 0]);
    const daily = await db.queryOne('SELECT id FROM biz_ai_staff_event WHERE user_id=? AND type=? AND ref=?', [ctx.uid, 'daily', dayjs().format('YYYY-MM-DD')]);
    res.json(ok({ dot: !daily || m.n > 0, unread: m.n }));
  } catch (e) { next(e); }
});

r.get('/init', async (req, res, next) => {
  try {
    await ensureTables();
    const ctx = await ctxOf(req);
    const isNew = !(await db.queryOne('SELECT id FROM biz_ai_staff_message WHERE user_id=? LIMIT 1', [ctx.uid]));
    if (isNew) {
      await saveMsg(ctx, 'assistant', `Hi ${ctx.name}，我是你的工作助手${BOT_NAME} 🤖\n按住说话就能办事，比如：\n・「帮王芳约明晚7点」\n・「今天的课都消了」\n・「周五下午请假」\n・「李雷最近练得怎么样」\n所有改动都会先给你一张卡片，点确认才生效。每天第一次打开我会给你一份早报～`);
    }
    await buildWeeklyReport(ctx).catch(e => console.error('[AI-staff] weekly:', e.message));
    await buildDailyBrief(ctx).catch(e => console.error('[AI-staff] daily:', e.message));
    await proactiveTick(ctx).catch(() => {});
    const rows = await db.query('SELECT * FROM biz_ai_staff_message WHERE user_id=? ORDER BY id DESC LIMIT 40', [ctx.uid]);
    await markRead(ctx);
    res.json(ok({
      messages: rows.reverse().map(msgOut), quick: [...QUICK_MAIN, ...(ctx.isMgr && !ctx.coachId ? QUICK_MGR : ctx.isMgr ? [...QUICK_COACH.slice(0, 4), ...QUICK_MGR.slice(0, 3)] : QUICK_COACH)],
      name: ctx.name, enabled: CFG.keys.length > 0, mode: 'staff',
    }));
  } catch (e) { next(e); }
});

r.post('/chat', async (req, res, next) => {
  try {
    await ensureTables();
    const ctx = await ctxOf(req);
    const text = String(req.body.message || '').trim().slice(0, 500);
    if (!text) throw new BizError('说点什么吧～');
    await useQuota(ctx);
    await saveMsg(ctx, 'user', text);
    let reply = ''; let tokens = 0;
    const history = await db.query('SELECT role, content FROM biz_ai_staff_message WHERE user_id=? ORDER BY id DESC LIMIT 15', [ctx.uid]);
    const hist = history.reverse().slice(0, -1).filter(m => m.content)
      .map(m => ({ role: m.role === 'user' ? 'user' : 'assistant', content: m.content.slice(0, 800) }));
    const messages = [{ role: 'system', content: await systemPrompt(ctx) }, ...hist, { role: 'user', content: text }];
    const tools = toolDefs(ctx);
    for (let round = 0; round < 6; round++) {
      const { message, usage } = await llm(messages, { tools, maxTokens: 1000, temperature: 0.3 });
      tokens += usage.total_tokens || 0;
      const calls = message.tool_calls || [];
      if (!calls.length) { reply = cleanText(message.content); break; }
      messages.push({ role: 'assistant', content: message.content || '', tool_calls: calls });
      for (const c of calls) {
        let args = {};
        try { args = JSON.parse(c.function.arguments || '{}'); } catch { args = {}; }
        let result;
        try { result = await runTool(ctx, c.function.name, args); } catch (e) { result = { error: e.biz ? e.message : '查询失败' }; if (!e.biz) console.error('[AI-staff] tool', c.function.name, e.message); }
        messages.push({ role: 'tool', tool_call_id: c.id, content: JSON.stringify(result).slice(0, 12000) });
      }
    }
    if (!reply) reply = ctx.cards.length ? '请在下方卡片确认～' : '这个我还没处理好，换个说法再试试？';
    const note = guideFallback(ctx, text, reply);
    if (note) reply = reply.replace(/[，,。]?\s*(请)?(点|在)下方(按钮|卡片)[^。]*。?/g, '。').replace(/[，,]?\s*只能给你(页面)?入口[。]?/g, '。').replace(/。。/g, '。') + note;
    // 同一类卡片只保留最后一张(模型重复调用时)
    const seen = new Set();
    const cards = ctx.cards.reverse().filter((c) => { const k = `${c.type}:${c.act || c.title || ''}:${c.path || ''}`; if (seen.has(k)) return false; seen.add(k); return true; }).reverse();
    const id = await saveMsg(ctx, 'assistant', reply, { cards, tokens });
    await markRead(ctx);
    res.json(ok({ messages: [msgOut({ id, role: 'assistant', content: reply, cards: JSON.stringify(cards), insert_time: new Date() })] }));
  } catch (e) { next(e); }
});

// 员工点卡片上的「确认」: 以服务端保存的草稿为准执行, 前端只能选择勾选项/选项/修改文字
r.post('/confirm', async (req, res, next) => {
  try {
    await ensureTables();
    const ctx = await ctxOf(req);
    const { msg_id, idx, cancel } = req.body || {};
    const m = await db.queryOne('SELECT id, cards FROM biz_ai_staff_message WHERE id=? AND user_id=?', [msg_id, ctx.uid]);
    if (!m || !m.cards) throw new BizError('卡片不存在');
    const cards = JSON.parse(m.cards);
    const card = cards[idx];
    if (!card || card.type !== 'action') throw new BizError('卡片不存在');
    if (card.status === 'done' || card.status === 'cancelled') throw new BizError('这张卡片已经处理过了');
    if (cancel) {
      cards[idx] = { ...card, status: 'cancelled', result: '已取消，未做任何改动' };
    } else {
      try {
        const result = await execAction(ctx, card, req.body || {});
        cards[idx] = { ...card, status: 'done', result, error: '' };
      } catch (e) {
        if (!e.biz) console.error('[AI-staff] exec', card.act, e.message);
        cards[idx] = { ...card, error: e.biz ? e.message : '执行失败，请稍后再试' };
      }
    }
    await db.exec('UPDATE biz_ai_staff_message SET cards=? WHERE id=?', [JSON.stringify(cards), m.id]);
    const { draft, ...out } = cards[idx];
    res.json(ok({ card: out, post: out.status === 'done' ? ctx.post || null : null }));
  } catch (e) { next(e); }
});

r.post('/clear', async (req, res, next) => {
  try {
    await ensureTables();
    await db.exec('DELETE FROM biz_ai_staff_message WHERE user_id=?', [req.user.uid]);
    res.json(ok());
  } catch (e) { next(e); }
});

r.post('/asr', async (req, res, next) => {
  try {
    const { audio_base64, format = 'wav' } = req.body || {};
    if (!audio_base64) throw new BizError('缺少音频数据');
    if (audio_base64.length > 8 * 1024 * 1024) throw new BizError('录音过长，请控制在1分钟内');
    const ai = require('../ai');
    if (!ai.asrEnabled()) throw new BizError('未配置语音识别服务');
    const text = await ai.asrRecognize(audio_base64, format);
    res.json(ok({ text }));
  } catch (e) {
    if (e.biz) return next(e);
    next(new BizError(e.message || '语音识别失败'));
  }
});

module.exports = r;
