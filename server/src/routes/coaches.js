const express = require('express');
const dayjs = require('dayjs');
const db = require('../db');
const { ok, BizError, page, now, logAction, lifecycleTick, activateCard, cardDeduct, cardBlockReason } = require('../util');
const { staffAuth } = require('../middleware/auth');

const r = express.Router();

// ============ 教练档案 ============
r.get('/coaches', staffAuth(), async (req, res, next) => {
  try {
    const cond = ['merchant_id=?']; const params = [req.user.mid];
    if (req.query.status != null && req.query.status !== '') { cond.push('status=?'); params.push(req.query.status); }
    const rows = await db.query(`SELECT * FROM biz_club_coach WHERE ${cond.join(' AND ')} ORDER BY sort, id`, params);
    res.json(ok(rows));
  } catch (e) { next(e); }
});

// 新增教练（教练是员工的特化: 同时创建登录账号 + 教练档案）
r.post('/coaches', staffAuth('admin', 'manager'), async (req, res, next) => {
  try {
    const bcrypt = require('bcryptjs');
    const b = req.body;
    if (!b.realname) throw new BizError('请填写教练姓名');
    if (!b.username) throw new BizError('请填写登录账号');
    const dup = await db.queryOne('SELECT id FROM sys_user WHERE username=?', [b.username]);
    if (dup) throw new BizError('登录账号已存在，请更换');
    const pwd = await bcrypt.hash(b.password || 'admin123', 10);
    const result = await db.tx(async (t) => {
      const userId = await t.insert(
        'INSERT INTO sys_user (merchant_id,club_id,username,password,realname,phone,role) VALUES (?,?,?,?,?,?,\'coach\')',
        [req.user.mid, b.club_id || req.clubId, b.username, pwd, b.realname, b.phone || '']);
      const coachId = await t.insert(
        'INSERT INTO biz_club_coach (merchant_id,club_id,user_id,realname,nickname,good_at,`desc`,detail,sort,status) VALUES (?,?,?,?,?,?,?,?,?,1)',
        [req.user.mid, b.club_id || req.clubId, userId, b.realname, b.nickname || '', b.good_at || '', b.desc || '', b.detail || '', b.sort || 0]);
      return { id: coachId, user_id: userId };
    });
    await logAction(req, '新增教练', `${b.realname}(${b.username})`);
    res.json(ok(result));
  } catch (e) { next(e); }
});

r.put('/coaches/:id', staffAuth('admin', 'manager', 'coach'), async (req, res, next) => {
  try {
    const b = req.body;
    const isSelf = req.user.role === 'coach';
    // 教练本人只能改自己的主页
    if (isSelf && req.user.coachId !== Number(req.params.id)) throw new BizError('只能编辑自己的主页');
    const cur = await db.queryOne('SELECT * FROM biz_club_coach WHERE id=? AND merchant_id=?', [req.params.id, req.user.mid]);
    if (!cur) throw new BizError('教练不存在');
    const pick = (v, dft) => (v === undefined ? dft : v);
    // 教练本人可改: 昵称/擅长/一句话简介/详细介绍/头像/主页背景; 排序、状态、课时价仅管理员可改
    const row = {
      realname: isSelf ? cur.realname : pick(b.realname, cur.realname),
      nickname: pick(b.nickname, cur.nickname) || '',
      good_at: pick(b.good_at, cur.good_at) || '',
      desc: pick(b.desc, cur.desc) || '',
      detail: pick(b.detail, cur.detail) || '',
      avatar: pick(b.avatar, cur.avatar) || '',
      cover: pick(b.cover, cur.cover) || '',
      sort: isSelf ? cur.sort : (b.sort || 0),
      status: isSelf ? cur.status : (b.status != null ? b.status : 1),
      lesson_price: isSelf ? cur.lesson_price : (b.lesson_price != null ? b.lesson_price : 0),
    };
    await db.exec('UPDATE biz_club_coach SET realname=?,nickname=?,good_at=?,`desc`=?,detail=?,avatar=?,cover=?,sort=?,status=?,lesson_price=? WHERE id=? AND merchant_id=?',
      [row.realname, row.nickname, row.good_at, row.desc, row.detail, row.avatar, row.cover,
        row.sort, row.status, row.lesson_price, req.params.id, req.user.mid]);
    await logAction(req, isSelf ? '更新我的教练主页' : '更新教练档案', row.realname);
    res.json(ok());
  } catch (e) { next(e); }
});

// 教练本人的档案(工作台「我的主页」用)
r.get('/coaches/me', staffAuth(), async (req, res, next) => {
  try {
    const id = req.user.coachId || 0;
    if (!id) throw new BizError('当前账号不是教练');
    const row = await db.queryOne('SELECT * FROM biz_club_coach WHERE id=? AND merchant_id=?', [id, req.user.mid]);
    if (!row) throw new BizError('教练档案不存在');
    res.json(ok(row));
  } catch (e) { next(e); }
});

// ============ 私教课程类型 ============
r.get('/ptrain-courses', staffAuth(), async (req, res, next) => {
  try {
    const rows = await db.query('SELECT * FROM biz_ptrain_course WHERE merchant_id=? ORDER BY sort, id', [req.user.mid]);
    res.json(ok(rows));
  } catch (e) { next(e); }
});
r.post('/ptrain-courses', staffAuth('admin', 'manager'), async (req, res, next) => {
  try {
    const b = req.body;
    const id = await db.insert(
      `INSERT INTO biz_ptrain_course (merchant_id,club_id,title,course_type,duration,people_count,card_scope,coach_ids,intro,sort,status)
       VALUES (?,?,?,?,?,?,?,?,?,?,?)`,
      [req.user.mid, req.clubId, b.title, b.course_type || 1, b.duration || 60, b.people_count || 1,
        JSON.stringify(b.card_scope || []), JSON.stringify(b.coach_ids || []), b.intro || '', b.sort || 0, b.status != null ? b.status : 1]);
    res.json(ok({ id }));
  } catch (e) { next(e); }
});
r.put('/ptrain-courses/:id', staffAuth('admin', 'manager'), async (req, res, next) => {
  try {
    const b = req.body;
    await db.exec(
      `UPDATE biz_ptrain_course SET title=?,course_type=?,duration=?,people_count=?,card_scope=?,coach_ids=?,intro=?,sort=?,status=? WHERE id=? AND merchant_id=?`,
      [b.title, b.course_type || 1, b.duration || 60, b.people_count || 1, JSON.stringify(b.card_scope || []),
        JSON.stringify(b.coach_ids || []), b.intro || '', b.sort || 0, b.status != null ? b.status : 1, req.params.id, req.user.mid]);
    res.json(ok());
  } catch (e) { next(e); }
});

// ============ 教练休息 ============
r.get('/coach-rests', staffAuth(), async (req, res, next) => {
  try {
    const { coach_id, from, to } = req.query;
    const cond = ['merchant_id=?']; const params = [req.user.mid];
    if (coach_id) { cond.push('coach_id=?'); params.push(coach_id); }
    if (from) { cond.push('rest_date>=?'); params.push(from); }
    if (to) { cond.push('rest_date<=?'); params.push(to); }
    const rows = await db.query(`SELECT * FROM biz_coach_rest WHERE ${cond.join(' AND ')} ORDER BY rest_date`, params);
    res.json(ok(rows));
  } catch (e) { next(e); }
});
r.post('/coach-rests', staffAuth(), async (req, res, next) => {
  try {
    const b = req.body;
    const coachId = req.user.role === 'coach' ? req.user.coachId : b.coach_id;
    if (!coachId || !b.rest_date) throw new BizError('请选择教练与日期');
    const id = await db.insert('INSERT INTO biz_coach_rest (merchant_id,club_id,coach_id,rest_date,from_time,to_time,remark) VALUES (?,?,?,?,?,?,?)',
      [req.user.mid, req.clubId, coachId, b.rest_date, b.from_time || '', b.to_time || '', b.remark || '']);
    res.json(ok({ id }));
  } catch (e) { next(e); }
});
r.delete('/coach-rests/:id', staffAuth(), async (req, res, next) => {
  try {
    await db.exec('DELETE FROM biz_coach_rest WHERE id=? AND merchant_id=?', [req.params.id, req.user.mid]);
    res.json(ok());
  } catch (e) { next(e); }
});

// ============ 可约时段计算（共享: 员工代约与会员端均可用）============
// GET /coaches/:id/slots?date=YYYY-MM-DD&duration=60
r.get('/coaches/:id/slots', staffAuth(), (req, res, next) => computeSlots(req, res, next));
async function computeSlots(req, res, next) {
  try {
    const coachId = Number(req.params.id);
    const date = req.query.date;
    const duration = Number(req.query.duration || 60);
    if (!date) throw new BizError('请选择日期');
    res.json(ok(await getCoachSlots(coachId, date, duration)));
  } catch (e) { next(e); }
}

// ============ 时间轴: 占用区间计算 (约课按 15 分钟刻度, 区间冲突校验) ============
const toMin = (t) => { const [h, m] = String(t || '0:0').split(':').map(Number); return h * 60 + (m || 0); };
const fromMin = (m) => `${String(Math.floor(m / 60)).padStart(2, '0')}:${String(m % 60).padStart(2, '0')}`;
const DEFAULT_OPEN = '08:00-21:00';
function parseOpen(openTime) {
  const m = String(openTime || '').match(/(\d{1,2}:\d{2})\s*-\s*(\d{1,2}:\d{2})/);
  const [a, b] = m ? [m[1], m[2]] : DEFAULT_OPEN.split('-');
  return { open: toMin(a), close: toMin(b) };
}
const overlap = (aFrom, aTo, bFrom, bTo) => aFrom < bTo && bFrom < aTo;

// 教练当天的占用区间(对会员脱敏, 不带会员姓名)
async function getCoachBusy(coachId, date) {
  const busy = [];
  const bookings = await db.query(
    'SELECT from_time, to_time FROM biz_ptrain_bespeak_record WHERE coach_id=? AND `date`=? AND status IN (0,1)', [coachId, date]);
  bookings.forEach(b => busy.push({ from: b.from_time, to: b.to_time, type: 'booked', label: '已约' }));
  const classes = await db.query(
    `SELECT title, DATE_FORMAT(start_time,'%H:%i') from_time, DATE_FORMAT(end_time,'%H:%i') to_time FROM biz_syllabus_group
     WHERE coach_id=? AND DATE(start_time)=? AND status=1`, [coachId, date]);
  classes.forEach(c => busy.push({ from: c.from_time, to: c.to_time, type: 'class', label: '团课·' + c.title }));
  const rests = await db.query('SELECT from_time, to_time, remark FROM biz_coach_rest WHERE coach_id=? AND rest_date=?', [coachId, date]);
  rests.forEach(x => busy.push(x.from_time
    ? { from: x.from_time, to: x.to_time, type: 'rest', label: '休息' }
    : { from: '00:00', to: '24:00', type: 'rest', label: '全天休息' }));
  return busy.sort((a, b) => toMin(a.from) - toMin(b.from));
}

// 会员当天自己已有的课(私教+团课), 避免同一时间约两节
async function getMemberBusy(vipId, date, excludeBookingId = 0) {
  const busy = [];
  const pts = await db.query(
    'SELECT id, from_time, to_time, coach_name FROM biz_ptrain_bespeak_record WHERE vip_id=? AND `date`=? AND status IN (0,1) AND id<>?', [vipId, date, excludeBookingId]);
  pts.forEach(b => busy.push({ from: b.from_time, to: b.to_time, type: 'mine', label: '我的私教·' + b.coach_name }));
  const groups = await db.query(
    `SELECT syllabus_title, DATE_FORMAT(class_start_time,'%H:%i') f, DATE_FORMAT(class_end_time,'%H:%i') t
     FROM biz_syllabus_subscribe_record WHERE vip_id=? AND DATE(class_start_time)=? AND status IN (0,1)`, [vipId, date]);
  groups.forEach(g => busy.push({ from: g.f, to: g.t, type: 'mine', label: '我的团课·' + g.syllabus_title }));
  return busy;
}

// 统一的约课时间校验, 通过返回 null, 否则返回中文原因
// allowPast: 员工代约补录场景放开"开始时间已过"限制(会员自约仍禁止)
function checkTimeRange({ date, fromTime, duration, openTime, coachBusy, memberBusy, allowPast }) {
  if (!/^\d{2}:(00|15|30|45)$/.test(String(fromTime))) return '开始时间须为整点、15分、30分或45分';
  const f = toMin(fromTime), t = f + duration;
  const { open, close } = parseOpen(openTime);
  if (f < open || t > close) return `超出营业时间（${fromMin(open)}-${fromMin(close)}）`;
  if (!allowPast && dayjs(`${date} ${fromTime}`).isBefore(dayjs())) return '开始时间已过';
  const cb = (coachBusy || []).find(b => overlap(f, t, toMin(b.from), toMin(b.to)));
  if (cb) return `教练该时段有安排（${cb.label} ${cb.from}-${cb.to}）`;
  const mb = (memberBusy || []).find(b => overlap(f, t, toMin(b.from), toMin(b.to)));
  if (mb) return `该时段与您已有的课程冲突（${mb.label} ${mb.from}-${mb.to}）`;
  return null;
}

// 整点时段列表(后台代约下拉仍按整点展示, 底层用同一套区间校验)
async function getCoachSlots(coachId, date, duration = 60, openTime = DEFAULT_OPEN) {
  const busy = await getCoachBusy(coachId, date);
  const { open, close } = parseOpen(openTime);
  const slots = [];
  for (let m = Math.ceil(open / 60) * 60; m + duration <= close; m += 60) {
    const from = fromMin(m);
    const reason = checkTimeRange({ date, fromTime: from, duration, openTime, coachBusy: busy, memberBusy: [] });
    slots.push({ from_time: from, to_time: fromMin(m + duration), available: !reason,
      reason: !reason ? '' : reason.includes('已过') ? '已过' : reason.includes('休息') ? '休息' : '已占用' });
  }
  return slots;
}

// ============ 私教预约 ============
// 代约 body: {coach_id, vip_id, course_id, date, from_time, card_id, remark}
// 权限: 管理员/店长可为任意教练代约; 教练只能约到自己名下(coach_id 强制为本人)
r.post('/ptrain-bookings', staffAuth('admin', 'manager', 'coach'), async (req, res, next) => {
  try {
    const b = req.body;
    let coachId = Number(b.coach_id) || 0;
    if (req.user.role === 'coach') {
      if (!req.user.coachId) throw new BizError('当前账号未绑定教练档案，无法代约');
      coachId = req.user.coachId;
    }
    const result = await createPtBooking({
      mid: req.user.mid, clubId: b.club_id || req.clubId, vipId: b.vip_id, coachId, courseId: b.course_id,
      date: b.date, fromTime: b.from_time, cardId: b.card_id,
      recordType: 3, remark: b.remark || `代约(${req.user.name})`,
      autoConfirm: true,
      allowPast: true,   // 员工代约支持补录历史课程
    });
    await logAction(req, '私教代约', `会员#${b.vip_id} ${b.date} ${b.from_time}`);
    res.json(ok(result));
  } catch (e) { next(e); }
});

// 代约课取数: 会员可用私教卡 + 教练(教练角色仅本人) + 其课程 + 当日占用 + 会员当日占用 + 门店
// GET /agent-booking/pt?vip_id=&date=
r.get('/agent-booking/pt', staffAuth('admin', 'manager', 'coach'), async (req, res, next) => {
  try {
    const mid = req.user.mid;
    const date = req.query.date || dayjs().format('YYYY-MM-DD');
    const vipId = Number(req.query.vip_id) || 0;
    const vip = vipId ? await db.queryOne('SELECT id, realname, phone, coach_id, sub_coach_id, is_black FROM biz_vip_user WHERE id=? AND merchant_id=?', [vipId, mid]) : null;
    if (vipId && !vip) throw new BizError('会员不存在');
    const onlyMe = req.user.role === 'coach' ? (req.user.coachId || 0) : 0;
    const coaches = await db.query(
      `SELECT id, realname, good_at FROM biz_club_coach WHERE merchant_id=? AND status=1${onlyMe ? ' AND id=?' : ''} ORDER BY sort, id`,
      onlyMe ? [mid, onlyMe] : [mid]);
    const courses = await db.query(
      'SELECT id, title, duration, people_count, coach_ids, card_scope FROM biz_ptrain_course WHERE merchant_id=? AND status=1 ORDER BY sort, id', [mid]);
    const list = [];
    for (const c of coaches) {
      const cs = courses.filter(x => { const ids = JSON.parse(x.coach_ids || '[]'); return !ids.length || ids.includes(c.id); });
      if (!cs.length) continue;
      list.push({
        ...c,
        is_main: !!(vip && vip.coach_id === c.id), is_sub: !!(vip && vip.sub_coach_id === c.id),
        courses: cs.map(({ coach_ids, ...rest }) => rest),
        busy: await getCoachBusy(c.id, date),
      });
    }
    list.sort((a, b) => (b.is_main - a.is_main) || (b.is_sub - a.is_sub));
    const clubs = await db.query('SELECT id, name, address, open_time FROM biz_club WHERE merchant_id=? AND status=1 ORDER BY sort, id', [mid]);
    const cards = vipId ? await db.query(
      `SELECT id, card_type_id, card_type_name, card_kind, counts, left_counts, left_money, expire_time, status FROM biz_member_card
       WHERE vip_id=? AND merchant_id=? AND status IN (0,1) ORDER BY FIELD(card_kind,4,1,2,3), expire_time`, [vipId, mid]) : [];
    cards.forEach(c => { const why = cardBlockReason(c); c.usable = !why; c.reason = why; });
    const mine = vipId ? await db.query(
      `SELECT id, coach_name, course_title, from_time, to_time, status FROM biz_ptrain_bespeak_record
       WHERE vip_id=? AND \`date\`=? AND status IN (0,1,3) ORDER BY from_time`, [vipId, date]) : [];
    res.json(ok({
      date, member: vip, coaches: list, clubs,
      default_club_id: (req.clubId && clubs.some(c => c.id === req.clubId)) ? req.clubId : ((clubs[0] || {}).id || null),
      cards, mine, member_busy: vipId ? await getMemberBusy(vipId, date) : [],
      locked_coach_id: onlyMe || null,
    }));
  } catch (e) { next(e); }
});

// 共享创建逻辑（会员端也调用）
async function createPtBooking({ mid, clubId, vipId, coachId, courseId, date, fromTime, cardId, recordType, remark, autoConfirm, allowPast }) {
  const vip = await db.queryOne('SELECT * FROM biz_vip_user WHERE id=? AND merchant_id=?', [vipId, mid]);
  if (!vip) throw new BizError('会员不存在');
  if (vip.is_black) throw new BizError('该会员在黑名单中，禁止预约');
  const coach = await db.queryOne('SELECT * FROM biz_club_coach WHERE id=? AND status=1', [coachId]);
  if (!coach) throw new BizError('教练不存在或已离职');
  const course = await db.queryOne('SELECT * FROM biz_ptrain_course WHERE id=?', [courseId]);
  if (!course) throw new BizError('课程不存在');
  const coachIds = JSON.parse(course.coach_ids || '[]');
  if (coachIds.length && !coachIds.includes(coach.id)) throw new BizError('该教练不授此课程');
  const card = await db.queryOne('SELECT * FROM biz_member_card WHERE id=? AND vip_id=?', [cardId, vipId]);
  if (!card) throw new BizError('支付卡不存在');
  // 2026-09-21: 任何卡种都能约任何课程; 次卡/私教卡按次扣, 时间卡不扣次, 储值卡看余额
  const cardWhy = cardBlockReason(card);
  if (cardWhy) throw new BizError(`该卡${cardWhy}`);
  const deductNum = cardDeduct(card.card_kind, 1);
  // 卡类型规则
  const cat = await db.queryOne('SELECT * FROM biz_card_category WHERE id=?', [card.card_type_id]);
  const scope = JSON.parse(course.card_scope || '[]');
  if (scope.length && !scope.includes(card.card_type_id)) throw new BizError('该卡不支持此课程');
  await checkBookingLimits(cat, card, vipId, date, 'pt');
  // 上课门店(约课时选择; 教练不绑定门店, 卡的流水归属不受影响)
  const club = await db.queryOne('SELECT id, open_time FROM biz_club WHERE id=? AND merchant_id=? AND status=1', [clubId, mid]);
  if (!club) throw new BizError('请选择上课门店');
  // 时间区间校验: 15分钟刻度 / 营业时间内 / 未过 / 不与教练安排和会员自己的课冲突
  const why = checkTimeRange({
    date, fromTime, duration: course.duration, openTime: club.open_time,
    coachBusy: await getCoachBusy(coachId, date), memberBusy: await getMemberBusy(vipId, date),
    allowPast,
  });
  if (why) throw new BizError(why);
  const toTime = dayjs(`${date} ${fromTime}`).add(course.duration, 'minute').format('HH:mm');
  const status = autoConfirm ? 1 : 0; // 教练确认制: 会员自约默认待确认
  const id = await db.insert(
    `INSERT INTO biz_ptrain_bespeak_record (merchant_id,club_id,coach_id,coach_name,vip_id,realname,phone,course_id,course_title,
      \`date\`,from_time,to_time,card_id,card_type_name,card_deduct_num,record_type,membership_id,status,remark)
     VALUES (?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?)`,
    [mid, clubId, coachId, coach.realname, vipId, vip.realname, vip.phone, course.id, course.title,
      date, fromTime, toTime, card.id, card.card_type_name, deductNum, recordType, vip.membership_id, status, remark || '']);
  if (status === 1) await sendBookingSms({ merchant_id: mid, vip_id: vipId, realname: vip.realname, phone: vip.phone, date, from_time: fromTime, coach_name: coach.realname, course_title: course.title });
  return { id, status };
}

// 预约成功短信 (纪要5.2: 约课每节约1条)
async function sendBookingSms(bk) {
  try {
    await require('../sms').send(bk.merchant_id, {
      vipId: bk.vip_id, realname: bk.realname, phone: bk.phone, scene: 'booking_ok',
      params: { name: bk.realname, date: dayjs(bk.date).format('M月D日'), time: bk.from_time, coach: bk.coach_name, course: bk.course_title || '私教课' },
    });
  } catch (e) { /* 短信失败不阻塞 */ }
}

// 卡类型预约规则校验（团课/私教通用）
async function checkBookingLimits(cat, card, vipId, date, kind) {
  if (!cat) return;
  const dayStart = `${date} 00:00:00`; const dayEnd = `${date} 23:59:59`;
  const cnt = async (from, to) => {
    const [{ n: n1 }] = await db.query(
      `SELECT COUNT(*) n FROM biz_ptrain_bespeak_record WHERE vip_id=? AND card_id=? AND status IN (0,1) AND CONCAT(\`date\`,' ',from_time) BETWEEN ? AND ?`,
      [vipId, card.id, from, to]);
    const [{ n: n2 }] = await db.query(
      `SELECT COUNT(*) n FROM biz_syllabus_subscribe_record WHERE vip_id=? AND card_id=? AND status IN (0,1) AND class_start_time BETWEEN ? AND ?`,
      [vipId, card.id, from, to]);
    return n1 + n2;
  };
  if (cat.book_limit_day > 0 && (await cnt(dayStart, dayEnd)) >= cat.book_limit_day) throw new BizError(`该卡每日最多预约${cat.book_limit_day}次`);
  if (cat.book_limit_week > 0) {
    const ws = dayjs(date).startOf('week').format('YYYY-MM-DD 00:00:00');
    const we = dayjs(date).endOf('week').format('YYYY-MM-DD 23:59:59');
    if ((await cnt(ws, we)) >= cat.book_limit_week) throw new BizError(`该卡每周最多预约${cat.book_limit_week}次`);
  }
  if (cat.book_limit_month30 > 0) {
    const ms = dayjs(date).subtract(30, 'day').format('YYYY-MM-DD 00:00:00');
    if ((await cnt(ms, dayEnd)) >= cat.book_limit_month30) throw new BizError(`该卡每30天最多预约${cat.book_limit_month30}次`);
  }
  if (cat.advance_book_limit > 0) {
    const [{ n: p1 }] = await db.query('SELECT COUNT(*) n FROM biz_ptrain_bespeak_record WHERE vip_id=? AND card_id=? AND status IN (0,1)', [vipId, card.id]);
    const [{ n: p2 }] = await db.query('SELECT COUNT(*) n FROM biz_syllabus_subscribe_record WHERE vip_id=? AND card_id=? AND status IN (0,1)', [vipId, card.id]);
    if (p1 + p2 >= cat.advance_book_limit) throw new BizError(`该卡最多可同时保留${cat.advance_book_limit}个未完成预约`);
  }
  // 爽约惩罚: 30天内爽约达上限暂停约课
  if (cat.noshow_limit_30d > 0) {
    const from = dayjs().subtract(30, 'day').format('YYYY-MM-DD HH:mm:ss');
    const [{ n: ns1 }] = await db.query('SELECT COUNT(*) n FROM biz_ptrain_bespeak_record WHERE vip_id=? AND status=4 AND update_time>=?', [vipId, from]);
    const [{ n: ns2 }] = await db.query('SELECT COUNT(*) n FROM biz_syllabus_subscribe_record WHERE vip_id=? AND status=4 AND update_time>=?', [vipId, from]);
    if (ns1 + ns2 >= cat.noshow_limit_30d) throw new BizError(`30天内爽约已达${cat.noshow_limit_30d}次，约课资格暂停，请联系前台`);
  }
}

// 私教预约列表
r.get('/ptrain-bookings', staffAuth(), async (req, res, next) => {
  try {
    const { p, size, offset } = page(req);
    const { coach_id, vip_id, date, date_from, date_to, status, keyword, order } = req.query;
    const cond = ['merchant_id=?']; const params = [req.user.mid];
    // 教练只看自己的
    if (req.user.role === 'coach') { cond.push('coach_id=?'); params.push(req.user.coachId); }
    else if (coach_id) { cond.push('coach_id=?'); params.push(coach_id); }
    if (vip_id) { cond.push('vip_id=?'); params.push(vip_id); }
    if (date) { cond.push('`date`=?'); params.push(date); }
    if (date_from) { cond.push('`date`>=?'); params.push(date_from); }
    if (date_to) { cond.push('`date`<=?'); params.push(date_to); }
    if (status != null && status !== '') { cond.push('status=?'); params.push(status); }
    if (keyword) { cond.push('(realname LIKE ? OR phone LIKE ?)'); params.push(`%${keyword}%`, `%${keyword}%`); }
    const where = cond.join(' AND ');
    const [{ total }] = await db.query(`SELECT COUNT(*) total FROM biz_ptrain_bespeak_record WHERE ${where}`, params);
    // order=asc: 按上课时间从早到晚(今天/未来看下一节课); 默认 desc(历史看最近的)
    const dir = order === 'asc' ? 'ASC' : 'DESC';
    const rows = await db.query(
      `SELECT * FROM biz_ptrain_bespeak_record WHERE ${where} ORDER BY \`date\` ${dir}, from_time ${dir} LIMIT ? OFFSET ?`,
      [...params, size, offset]);
    res.json(ok({ list: rows, total }));
  } catch (e) { next(e); }
});

// 教练课表（日/周视图数据: 预约+团课+休息）
r.get('/coaches/:id/schedule', staffAuth(), async (req, res, next) => {
  try {
    const { from, to } = req.query;
    const coachId = req.params.id;
    const bookings = await db.query(
      `SELECT * FROM biz_ptrain_bespeak_record WHERE coach_id=? AND \`date\` BETWEEN ? AND ? ORDER BY \`date\`, from_time`, [coachId, from, to]);
    const classes = await db.query(
      `SELECT id,title,start_time,end_time,classroom_name,booked_count,people_count FROM biz_syllabus_group
       WHERE coach_id=? AND start_time BETWEEN ? AND ? AND status IN (1,3) ORDER BY start_time`, [coachId, `${from} 00:00:00`, `${to} 23:59:59`]);
    const rests = await db.query('SELECT * FROM biz_coach_rest WHERE coach_id=? AND rest_date BETWEEN ? AND ?', [coachId, from, to]);
    res.json(ok({ bookings, classes, rests }));
  } catch (e) { next(e); }
});

// 确认预约（教练确认制）
r.post('/ptrain-bookings/:id/confirm', staffAuth(), async (req, res, next) => {
  try {
    const bk = await db.queryOne('SELECT * FROM biz_ptrain_bespeak_record WHERE id=? AND merchant_id=?', [req.params.id, req.user.mid]);
    if (!bk) throw new BizError('预约不存在');
    if (bk.status !== 0) throw new BizError('该预约不是待确认状态');
    await db.exec('UPDATE biz_ptrain_bespeak_record SET status=1 WHERE id=?', [bk.id]);
    await sendBookingSms(bk);
    await logAction(req, '确认私教预约', `#${bk.id} ${bk.realname} ${bk.date} ${bk.from_time}`);
    res.json(ok());
  } catch (e) { next(e); }
});

// 取消预约
r.post('/ptrain-bookings/:id/cancel', staffAuth(), async (req, res, next) => {
  try {
    const bk = await db.queryOne('SELECT * FROM biz_ptrain_bespeak_record WHERE id=? AND merchant_id=?', [req.params.id, req.user.mid]);
    if (!bk) throw new BizError('预约不存在');
    if (![0, 1].includes(bk.status)) throw new BizError('该预约不可取消');
    await db.exec('UPDATE biz_ptrain_bespeak_record SET status=2, cancel_reason=? WHERE id=?', [req.body.reason || `${req.user.name}取消`, bk.id]);
    res.json(ok());
  } catch (e) { next(e); }
});

// 爽约标记
r.post('/ptrain-bookings/:id/noshow', staffAuth(), async (req, res, next) => {
  try {
    const bk = await db.queryOne('SELECT * FROM biz_ptrain_bespeak_record WHERE id=? AND merchant_id=?', [req.params.id, req.user.mid]);
    if (!bk) throw new BizError('预约不存在');
    if (bk.status !== 1) throw new BizError('仅已确认的预约可标记爽约');
    await db.exec('UPDATE biz_ptrain_bespeak_record SET status=4 WHERE id=?', [bk.id]);
    await logAction(req, '私教爽约', `#${bk.id} ${bk.realname}`);
    res.json(ok());
  } catch (e) { next(e); }
});

// 教练发起消课（进入待学员确认）
r.post('/ptrain-bookings/:id/start-finish', staffAuth(), async (req, res, next) => {
  try {
    const bk = await db.queryOne('SELECT * FROM biz_ptrain_bespeak_record WHERE id=? AND merchant_id=?', [req.params.id, req.user.mid]);
    if (!bk) throw new BizError('预约不存在');
    if (bk.status !== 1) throw new BizError('仅已确认的预约可发起消课');
    if (bk.confirm_status === 1) throw new BizError('已发起，等待学员确认');
    await db.exec('UPDATE biz_ptrain_bespeak_record SET confirm_status=1 WHERE id=?', [bk.id]);
    res.json(ok({ msg: '已发起消课，请学员在小程序「待确认消课」中确认' }));
  } catch (e) { next(e); }
});

// 消课完成（共享: 学员确认 or 员工代确认）
async function finishPtBooking(bookingId, { receptionId, receptionRemark }) {
  const bk = await db.queryOne('SELECT * FROM biz_ptrain_bespeak_record WHERE id=?', [bookingId]);
  if (!bk) throw new BizError('预约不存在');
  if (bk.status === 3) throw new BizError('该课程已消课');
  if (![1].includes(bk.status)) throw new BizError('仅已确认的预约可消课');
  let card = await db.queryOne('SELECT * FROM biz_member_card WHERE id=?', [bk.card_id]);
  if (!card) throw new BizError('扣课卡不存在');
  if (card.status === 0) card = await activateCard(card.id); // 首次使用开卡
  if (![1].includes(card.status)) throw new BizError(`扣课卡当前${['待开卡', '使用中', '已过期', '已暂停', '已停用', '已退卡'][card.status]}，请先处理`);
  // 扣次数: 次卡/私教卡才扣(时间卡不限次、储值卡按余额); 教练课时恒计 1 节
  const deduct = Number(bk.card_deduct_num) || 0;
  if (deduct > 0 && card.left_counts < deduct) throw new BizError('卡剩余课时不足');
  const spendMoney = +(deduct * Number(card.unit_price)).toFixed(2);
  // 流水归属跟随卡: 消耗计入开卡门店 (2026-09-07需求会: 跨店上课不改变归属)
  await db.tx(async (t) => {
    if (deduct > 0) {
      await t.exec('UPDATE biz_member_card SET left_counts=left_counts-? WHERE id=? AND left_counts>=?', [deduct, card.id, deduct]);
    }
    const recId = await t.insert(
      `INSERT INTO biz_ptrain_record (merchant_id,club_id,vip_id,realname,coach_id,coach_name,once_card_id,costs,unit_price,spend_money,
        type,bespeak_id,is_syllabus_sub,reception_id,reception_remark)
       VALUES (?,?,?,?,?,?,?,?,?,?,1,?,1,?,?)`,
      [bk.merchant_id, card.club_id, bk.vip_id, bk.realname, bk.coach_id, bk.coach_name, card.id, 1,
        card.unit_price, spendMoney, bk.id, receptionId || 0, receptionRemark || '学员确认']);
    if (deduct > 0) {
      await t.insert(
        `INSERT INTO biz_card_spend (merchant_id,club_id,card_id,vip_id,card_kind,card_type_name,scene,costs,unit_price,spend_money,
          ptrain_record_id,coach_id,coach_name,membership_id,realname,phone)
         VALUES (?,?,?,?,?,?,2,?,?,?,?,?,?,?,?,?)`,
        [bk.merchant_id, card.club_id, card.id, bk.vip_id, card.card_kind, card.card_type_name, deduct, card.unit_price, spendMoney,
          recId, bk.coach_id, bk.coach_name, bk.membership_id, bk.realname, bk.phone]);
    }
    await t.exec('UPDATE biz_ptrain_bespeak_record SET status=3, confirm_status=2 WHERE id=?', [bk.id]);
  });
  // 销课短信 + 里程碑 + 卡将耗尽提醒
  const sms = require('../sms');
  const growth = require('./growth');
  const leftAfter = card.left_counts - deduct;
  await sms.send(bk.merchant_id, {
    vipId: bk.vip_id, realname: bk.realname, phone: bk.phone, scene: 'lesson_done',
    params: { name: bk.realname, course: bk.course_title, coach: bk.coach_name, left: leftAfter },
  });
  if (deduct > 0 && leftAfter <= 2) {
    await sms.sendOnce(bk.merchant_id, {
      vipId: bk.vip_id, realname: bk.realname, phone: bk.phone, scene: 'card_low',
      params: { name: bk.realname, card: card.card_type_name, detail: `仅剩${leftAfter}节` },
    }, 7);
  }
  await growth.checkLessonMilestone(bk.vip_id, card.id).catch(() => {});
  return { spendMoney };
}

// 员工代确认消课（前台/店长, 留痕）
r.post('/ptrain-bookings/:id/finish', staffAuth('admin', 'manager', 'reception', 'coach'), async (req, res, next) => {
  try {
    // 2026-09-07需求会: 现状即教练手动点销课、课时随之扣减 → 教练可直接销课(仅限本人课程); 学员确认为可选双保险
    if (req.user.role === 'coach') {
      const own = await db.queryOne('SELECT coach_id FROM biz_ptrain_bespeak_record WHERE id=? AND merchant_id=?', [req.params.id, req.user.mid]);
      if (!own || own.coach_id !== req.user.coachId) throw new BizError('只能销自己的课');
    }
    const who = req.user.role === 'coach' ? `${req.user.name}教练确认销课` : `${req.user.name}代确认`;
    const result = await finishPtBooking(req.params.id, { receptionId: req.user.uid, receptionRemark: `${who} ${req.body.remark || ''}`.trim() });
    await logAction(req, '代确认消课', `预约#${req.params.id}`);
    res.json(ok(result));
  } catch (e) { next(e); }
});

// 补消课（无预约直接扣, 店长权限）
r.post('/ptrain-records/manual', staffAuth('admin', 'manager'), async (req, res, next) => {
  try {
    const { vip_id, coach_id, card_id, costs = 1, remark } = req.body;
    const vip = await db.queryOne('SELECT * FROM biz_vip_user WHERE id=? AND merchant_id=?', [vip_id, req.user.mid]);
    const coach = await db.queryOne('SELECT * FROM biz_club_coach WHERE id=?', [coach_id]);
    let card = await db.queryOne('SELECT * FROM biz_member_card WHERE id=? AND vip_id=?', [card_id, vip_id]);
    if (!vip || !coach || !card) throw new BizError('参数有误');
    if (card.status === 0) card = await activateCard(card.id);
    if (card.left_counts < costs) throw new BizError('卡剩余课时不足');
    const spendMoney = +(costs * Number(card.unit_price)).toFixed(2);
    await db.tx(async (t) => {
      await t.exec('UPDATE biz_member_card SET left_counts=left_counts-? WHERE id=?', [costs, card.id]);
      const recId = await t.insert(
        `INSERT INTO biz_ptrain_record (merchant_id,club_id,vip_id,realname,coach_id,coach_name,once_card_id,costs,unit_price,spend_money,
          type,bespeak_id,is_syllabus_sub,reception_id,reception_remark) VALUES (?,?,?,?,?,?,?,?,?,?,1,0,0,?,?)`,
        [req.user.mid, card.club_id, vip.id, vip.realname, coach.id, coach.realname, card.id, costs, card.unit_price, spendMoney,
          req.user.uid, `补消课 ${remark || ''}`]);
      await t.insert(
        `INSERT INTO biz_card_spend (merchant_id,club_id,card_id,vip_id,card_kind,card_type_name,scene,costs,unit_price,spend_money,
          ptrain_record_id,coach_id,coach_name,realname,phone,remark) VALUES (?,?,?,?,4,?,2,?,?,?,?,?,?,?,?,?)`,
        [req.user.mid, card.club_id, card.id, vip.id, card.card_type_name, costs, card.unit_price, spendMoney,
          recId, coach.id, coach.realname, vip.realname, vip.phone, `补消课 ${remark || ''}`]);
    });
    await require('./growth').checkLessonMilestone(vip.id, card.id).catch(() => {});
    await logAction(req, '补消课', `${vip.realname} ${coach.realname} ${costs}课时`);
    res.json(ok());
  } catch (e) { next(e); }
});

// 消课记录 (支持导出明细)
r.get('/ptrain-records', staffAuth(), async (req, res, next) => {
  try {
    const { p, size, offset } = page(req);
    const { coach_id, vip_id, month, export: exp } = req.query;
    const cond = ['p.merchant_id=?']; const params = [req.user.mid];
    if (req.user.role === 'coach') { cond.push('p.coach_id=?'); params.push(req.user.coachId); }
    else if (coach_id) { cond.push('p.coach_id=?'); params.push(coach_id); }
    if (vip_id) { cond.push('p.vip_id=?'); params.push(vip_id); }
    if (month) { cond.push("DATE_FORMAT(p.insert_time,'%Y-%m')=?"); params.push(month); }
    if (req.query.club_id) { cond.push('p.club_id=?'); params.push(req.query.club_id); }
    const where = cond.join(' AND ');
    const [{ total }] = await db.query(`SELECT COUNT(*) total FROM biz_ptrain_record p WHERE ${where}`, params.slice());
    // 门店与卡类挂在卡上(club_id 即开卡门店, 分成按此算), 左连出来供列表与导出使用
    const rows = await db.query(
      `SELECT p.*, cl.name club_name, c.card_type_name, c.card_kind
       FROM biz_ptrain_record p
       LEFT JOIN biz_club cl ON cl.id=p.club_id
       LEFT JOIN biz_member_card c ON c.id=p.once_card_id
       WHERE ${where} ORDER BY p.id DESC ${exp ? '' : 'LIMIT ? OFFSET ?'}`,
      exp ? params : [...params, size, offset]);
    if (exp) {
      const { sendCsv, CARD_KIND } = require('../util');
      rows.forEach(x => { x.card_kind_name = CARD_KIND[x.card_kind] || ''; });
      return sendCsv(res, `消课记录_${dayjs().format('YYYYMMDD')}`, [
        ['id', '记录ID'], ['insert_time', '时间'], ['club_name', '开卡门店'], ['realname', '会员'], ['coach_name', '教练'],
        ['card_type_name', '卡类型'], ['card_kind_name', '卡种'], ['costs', '课时数'],
        ['unit_price', '课时单价'], ['spend_money', '耗课金额'], ['reception_remark', '确认方式'],
      ], rows);
    }
    res.json(ok({ list: rows, total }));
  } catch (e) { next(e); }
});

// 教练学员列表（名下学员: 持私教卡 + 上课频率）
r.get('/coaches/:id/students', staffAuth(), async (req, res, next) => {
  try {
    const coachId = req.user.role === 'coach' ? req.user.coachId : req.params.id;
    const rows = await db.query(
      `SELECT v.id, v.realname, v.phone, v.avatar,
              c.id card_id, c.card_type_name, c.left_counts, c.counts, c.expire_time, c.status card_status,
              (SELECT MAX(insert_time) FROM biz_ptrain_record r WHERE r.vip_id=v.id AND r.coach_id=?) last_lesson_time,
              (SELECT COUNT(*) FROM biz_ptrain_record r WHERE r.vip_id=v.id AND r.coach_id=? AND r.insert_time>=DATE_SUB(NOW(), INTERVAL 30 DAY)) lessons_30d
       FROM biz_member_card c JOIN biz_vip_user v ON v.id=c.vip_id
       WHERE c.merchant_id=? AND c.card_kind=4 AND c.status IN (0,1,3) AND (c.coach_id=? OR v.coach_id=?)
       ORDER BY last_lesson_time IS NULL, last_lesson_time DESC`,
      [coachId, coachId, req.user.mid, coachId, coachId]);
    res.json(ok(rows));
  } catch (e) { next(e); }
});

// 教练业绩（我的业绩 / 全员课时榜）
r.get('/coaches/performance', staffAuth(), async (req, res, next) => {
  try {
    const month = req.query.month || dayjs().format('YYYY-MM');
    const rows = await db.query(
      `SELECT co.id, co.realname,
              COALESCE(r.lessons,0) lessons, COALESCE(r.spend_money,0) spend_money,
              COALESCE(s.sales,0) sales_money, COALESCE(s.orders,0) sales_orders
       FROM biz_club_coach co
       LEFT JOIN (SELECT coach_id, SUM(costs) lessons, SUM(spend_money) spend_money FROM biz_ptrain_record
                  WHERE merchant_id=? AND DATE_FORMAT(insert_time,'%Y-%m')=? GROUP BY coach_id) r ON r.coach_id=co.id
       LEFT JOIN (SELECT rc.membership_id, SUM(rc.actual_money) sales, COUNT(*) orders FROM biz_card_recharge rc
                  WHERE rc.merchant_id=? AND DATE_FORMAT(rc.insert_time,'%Y-%m')=? AND rc.actual_money>0 GROUP BY rc.membership_id) s ON s.membership_id=co.user_id
       WHERE co.merchant_id=? AND co.status=1 ORDER BY lessons DESC`,
      [req.user.mid, month, req.user.mid, month, req.user.mid]);
    if (req.query.export === 'csv') {
      const { sendCsv } = require('../util');
      return sendCsv(res, `教练业绩_${month}`, [
        ['realname', '教练'], ['lessons', '消课课时'], ['spend_money', '耗课金额'],
        ['sales_orders', '成单数'], ['sales_money', '销售业绩'],
      ], rows);
    }
    res.json(ok(rows));
  } catch (e) { next(e); }
});

module.exports = r;
module.exports.createPtBooking = createPtBooking;
module.exports.finishPtBooking = finishPtBooking;
module.exports.getCoachSlots = getCoachSlots;
module.exports.getCoachBusy = getCoachBusy;
module.exports.getMemberBusy = getMemberBusy;
module.exports.checkTimeRange = checkTimeRange;
module.exports.parseOpen = parseOpen;
module.exports.checkBookingLimits = checkBookingLimits;
