/* AI 健身助手「小S」(会员端)
 * 模型: DeepSeek (deepseek-flash 支持文本+图片+工具调用), 密钥在 secrets.json 的 deepseek_keys(多个主备切换)
 * 设计要点:
 *   1) 所有业务工具的 vip_id 一律取自登录 token, 模型无法查到别人的数据
 *   2) 约课/取消只生成「草稿卡片」, 会员点击确认后才真正下单(复用 createPtBooking 全套校验)
 *   3) 每日简报/周报按天/周缓存在 biz_ai_report, 并作为助手消息写进对话流
 *   4) 每人每日限额: 文本 AI_LIMIT.chats 条, 图片 AI_LIMIT.images 张 */
const express = require('express');
const fs = require('fs');
const path = require('path');
const dayjs = require('dayjs');
const db = require('../db');
const { ok, BizError, logAction, cardBlockReason } = require('../util');
const { memberAuth } = require('../middleware/auth');
const { createPtBooking, getCoachBusy, getMemberBusy, checkTimeRange, parseOpen } = require('./coaches');

const r = express.Router();
r.use(memberAuth);

/* ================= 配置 ================= */
function loadSecrets() {
  try { return JSON.parse(fs.readFileSync(path.join(__dirname, '..', '..', 'secrets.json'), 'utf8')); } catch { return {}; }
}
const S = loadSecrets();
const CFG = {
  keys: (process.env.DEEPSEEK_API_KEY ? [process.env.DEEPSEEK_API_KEY] : [])
    .concat(Array.isArray(S.deepseek_keys) ? S.deepseek_keys : (S.deepseek_api_key ? [S.deepseek_api_key] : []))
    .filter(Boolean),
  model: process.env.DEEPSEEK_MODEL || S.deepseek_model || 'deepseek-flash',
  base: process.env.DEEPSEEK_BASE_URL || S.deepseek_base_url || 'https://api.deepseek.com',
};
const AI_LIMIT = { chats: Number(S.ai_daily_chats) || 50, images: Number(S.ai_daily_images) || 5 };
// 视觉模型(拍照识别热量): 通义千问 Qwen-VL(OpenAI 兼容接口), 未配置或失败时回落到 deepseek-flash 的图片能力
const VLM = {
  key: process.env.VLM_API_KEY || S.vlm_api_key || '',
  base: process.env.VLM_BASE_URL || S.vlm_base_url || 'https://dashscope.aliyuncs.com/compatible-mode/v1',
  model: process.env.VLM_MODEL || S.vlm_model || 'qwen3-vl-plus',
};
const BOT_NAME = '小S';
const WEEK = '日一二三四五六';
const uploadRoots = ['/data/uploads', path.join(__dirname, '..', '..', 'web', 'uploads')];

/* ================= 建表(首次调用时) ================= */
let tablesReady = null;
function ensureTables() {
  if (!tablesReady) {
    tablesReady = (async () => {
      await db.exec(`CREATE TABLE IF NOT EXISTS biz_ai_message (
        id INT AUTO_INCREMENT PRIMARY KEY, merchant_id INT NOT NULL DEFAULT 1, vip_id INT NOT NULL,
        role VARCHAR(16) NOT NULL, content TEXT, image VARCHAR(255) NOT NULL DEFAULT '', cards TEXT,
        tokens INT NOT NULL DEFAULT 0, insert_time DATETIME DEFAULT CURRENT_TIMESTAMP,
        KEY idx_vip (vip_id, id)) DEFAULT CHARSET=utf8mb4`);
      await db.exec(`CREATE TABLE IF NOT EXISTS biz_ai_meal_log (
        id INT AUTO_INCREMENT PRIMARY KEY, merchant_id INT NOT NULL DEFAULT 1, vip_id INT NOT NULL,
        meal_date DATE NOT NULL, meal_type VARCHAR(16) NOT NULL DEFAULT '', image VARCHAR(255) NOT NULL DEFAULT '',
        foods TEXT, kcal INT NOT NULL DEFAULT 0, protein DECIMAL(6,1) NOT NULL DEFAULT 0,
        carbs DECIMAL(6,1) NOT NULL DEFAULT 0, fat DECIMAL(6,1) NOT NULL DEFAULT 0, comment VARCHAR(500) NOT NULL DEFAULT '',
        insert_time DATETIME DEFAULT CURRENT_TIMESTAMP, KEY idx_vip_date (vip_id, meal_date)) DEFAULT CHARSET=utf8mb4`);
      await db.exec(`CREATE TABLE IF NOT EXISTS biz_ai_report (
        id INT AUTO_INCREMENT PRIMARY KEY, merchant_id INT NOT NULL DEFAULT 1, vip_id INT NOT NULL,
        type VARCHAR(16) NOT NULL, period VARCHAR(16) NOT NULL, content TEXT, data TEXT,
        read_time DATETIME NULL, insert_time DATETIME DEFAULT CURRENT_TIMESTAMP,
        UNIQUE KEY uk_vip_type_period (vip_id, type, period)) DEFAULT CHARSET=utf8mb4`);
      await db.exec(`CREATE TABLE IF NOT EXISTS biz_ai_usage (
        vip_id INT NOT NULL, use_date DATE NOT NULL, chats INT NOT NULL DEFAULT 0, images INT NOT NULL DEFAULT 0,
        PRIMARY KEY (vip_id, use_date)) DEFAULT CHARSET=utf8mb4`);
    })().catch((e) => { tablesReady = null; throw e; });
  }
  return tablesReady;
}

/* ================= DeepSeek 调用(多 Key 主备) ================= */
let keyIdx = 0;
async function llm(messages, { tools, maxTokens = 1200, temperature = 0.6, json = false, timeout = 45000 } = {}) {
  if (!CFG.keys.length) throw new BizError('AI 服务未配置');
  let lastErr;
  for (let i = 0; i < CFG.keys.length; i++) {
    const key = CFG.keys[(keyIdx + i) % CFG.keys.length];
    try {
      const body = { model: CFG.model, messages, max_tokens: maxTokens, temperature, thinking: { type: 'disabled' } };
      if (tools && tools.length) { body.tools = tools; body.tool_choice = 'auto'; }
      if (json) body.response_format = { type: 'json_object' };
      const resp = await fetch(`${CFG.base}/chat/completions`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${key}` },
        body: JSON.stringify(body),
        signal: AbortSignal.timeout(timeout),
      });
      if (!resp.ok) {
        const t = await resp.text();
        const err = new Error(`DeepSeek HTTP ${resp.status}: ${t.slice(0, 200)}`);
        err.status = resp.status;
        throw err;
      }
      const data = await resp.json();
      return { message: (data.choices && data.choices[0] && data.choices[0].message) || {}, usage: data.usage || {} };
    } catch (e) {
      lastErr = e;
      // 400 等请求本身的问题换 Key 也没用; 鉴权/余额/限流/网络/5xx 才切到下一个 Key
      if (e.status && [400, 422].includes(e.status)) break;
      keyIdx = (keyIdx + 1) % CFG.keys.length;
    }
  }
  console.error('[AI] llm failed:', lastErr && lastErr.message);
  throw new BizError('AI 助手暂时有点忙，请稍后再试');
}

// 视觉模型调用(Qwen-VL), 失败抛原始错误由调用方决定是否回落
async function vlm(messages, { maxTokens = 900, temperature = 0.3, json = false, timeout = 45000 } = {}) {
  const body = { model: VLM.model, messages, max_tokens: maxTokens, temperature };
  if (json) body.response_format = { type: 'json_object' };
  const resp = await fetch(`${VLM.base}/chat/completions`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${VLM.key}` },
    body: JSON.stringify(body),
    signal: AbortSignal.timeout(timeout),
  });
  if (!resp.ok) throw new Error(`VLM HTTP ${resp.status}: ${(await resp.text()).slice(0, 200)}`);
  const data = await resp.json();
  return { message: (data.choices && data.choices[0] && data.choices[0].message) || {}, usage: data.usage || {} };
}
async function visionChat(messages, opts) {
  if (VLM.key) {
    try { return await vlm(messages, opts); } catch (e) { console.error('[AI] vlm failed, fallback deepseek:', e.message); }
  }
  return llm(messages, opts);
}

/* ================= 小工具 ================= */
const toMin = (t) => { const [h, m] = String(t || '0:0').split(':').map(Number); return (h || 0) * 60 + (m || 0); };
const fromMin = (m) => `${String(Math.floor(m / 60)).padStart(2, '0')}:${String(m % 60).padStart(2, '0')}`;
const fmtD = (d) => (d ? dayjs(d).format('YYYY-MM-DD') : '');
function dayLabel(d) {
  const x = dayjs(d);
  const diff = x.startOf('day').diff(dayjs().startOf('day'), 'day');
  const head = diff === 0 ? '今天' : diff === 1 ? '明天' : diff === 2 ? '后天' : diff === -1 ? '昨天' : x.format('M月D日');
  return `${head}(周${WEEK[x.day()]})`;
}
// 模型偶尔输出 Markdown, 小程序 text 组件不渲染, 这里清理掉
function cleanText(s) {
  return String(s || '')
    .replace(/\*\*(.+?)\*\*/g, '$1')
    .replace(/^#{1,6}\s*/gm, '')
    .replace(/^\s*[-*]\s+/gm, '・')
    .replace(/`([^`]+)`/g, '$1')
    .replace(/\n{3,}/g, '\n\n')
    .trim();
}
const PT_STATUS = { 0: '待教练确认', 1: '已确认', 2: '已取消', 3: '已完成', 4: '爽约' };
const GROUP_STATUS = { 0: '候补中', 1: '已约', 2: '已上课', 3: '已取消', 4: '爽约' };
const KIND = { 1: '次卡', 2: '时间卡', 3: '储值卡', 4: '私教卡' };
const MEAL_NAMES = { breakfast: '早餐', lunch: '午餐', dinner: '晚餐', snack: '加餐' };
function mealTypeByHour(h) {
  if (h < 10) return 'breakfast';
  if (h < 15) return 'lunch';
  if (h < 21) return 'dinner';
  return 'snack';
}

/* ================= 会员数据(全部以 vipId 为界) ================= */
async function getClubs(mid) {
  return db.query('SELECT id, name, address, open_time FROM biz_club WHERE merchant_id=? AND status=1 ORDER BY sort, id', [mid]);
}

async function getProfile(ctx) {
  const v = await db.queryOne(
    `SELECT realname, nickname, gender, birthday, coach_name, sub_coach_name, initial_weight, target_weight,
            training_frequency, constellation_mbti FROM biz_vip_user WHERE id=?`, [ctx.vip]);
  if (!v) return {};
  const body = await db.queryOne('SELECT record_date, height, weight, body_fat, muscle FROM biz_body_record WHERE vip_id=? ORDER BY record_date DESC, id DESC LIMIT 1', [ctx.vip]);
  const age = v.birthday ? dayjs().diff(dayjs(v.birthday), 'year') : null;
  return {
    name: v.realname || v.nickname || '会员',
    gender: v.gender === 1 ? '男' : v.gender === 2 ? '女' : '未知',
    age,
    main_coach: v.coach_name || '', sub_coach: v.sub_coach_name || '',
    initial_weight_kg: v.initial_weight != null ? Number(v.initial_weight) : null,
    target_weight_kg: v.target_weight != null ? Number(v.target_weight) : null,
    training_frequency: v.training_frequency || '',
    latest_body: body ? {
      date: fmtD(body.record_date), height_cm: Number(body.height) || null, weight_kg: Number(body.weight) || null,
      body_fat_pct: Number(body.body_fat) || null, muscle_kg: Number(body.muscle) || null,
    } : null,
  };
}

// 每日建议摄入热量(粗估): Mifflin-St Jeor * 1.45 活动系数, 减脂 -400 / 增重 +300
function dailyTarget(p) {
  const weight = (p.latest_body && p.latest_body.weight_kg) || p.initial_weight_kg;
  if (!weight) return null;
  const height = (p.latest_body && p.latest_body.height_cm) || (p.gender === '女' ? 160 : 172);
  const age = p.age || 30;
  const bmr = 10 * weight + 6.25 * height - 5 * age + (p.gender === '女' ? -161 : 5);
  let kcal = bmr * 1.45;
  let goal = '保持';
  if (p.target_weight_kg && p.target_weight_kg < weight - 0.5) { kcal -= 400; goal = '减脂'; }
  else if (p.target_weight_kg && p.target_weight_kg > weight + 0.5) { kcal += 300; goal = '增肌增重'; }
  kcal = Math.round(kcal / 50) * 50;
  return { kcal, goal, protein_g: Math.round(weight * (goal === '减脂' ? 1.8 : 1.6)) };
}

async function getUpcoming(ctx, days = 14) {
  const until = dayjs().add(days, 'day').format('YYYY-MM-DD');
  const pts = await db.query(
    `SELECT b.id, b.\`date\`, b.from_time, b.to_time, b.course_title, b.coach_name, b.status, c.name club_name
       FROM biz_ptrain_bespeak_record b LEFT JOIN biz_club c ON c.id=b.club_id
      WHERE b.vip_id=? AND b.status IN (0,1) AND CONCAT(b.\`date\`,' ',b.from_time) >= ? AND b.\`date\` <= ?
      ORDER BY b.\`date\`, b.from_time LIMIT 20`, [ctx.vip, dayjs().format('YYYY-MM-DD HH:mm'), until]);
  const groups = await db.query(
    `SELECT s.id, s.class_start_time, s.class_end_time, s.syllabus_title, s.status, g.coach_name, c.name club_name
       FROM biz_syllabus_subscribe_record s
       LEFT JOIN biz_syllabus_group g ON g.id=s.syllabus_id LEFT JOIN biz_club c ON c.id=s.club_id
      WHERE s.vip_id=? AND s.status IN (0,1) AND s.class_start_time >= NOW() AND s.class_start_time <= ?
      ORDER BY s.class_start_time LIMIT 20`, [ctx.vip, `${until} 23:59:59`]);
  const list = [
    ...pts.map(b => ({
      booking_id: b.id, kind: '私教', sort: `${fmtD(b.date)} ${b.from_time}`, day: dayLabel(b.date), date: fmtD(b.date),
      time: `${b.from_time}-${b.to_time}`, title: b.course_title, coach: b.coach_name, status: PT_STATUS[b.status], club: b.club_name || '',
    })),
    ...groups.map(g => ({
      group_booking_id: g.id, kind: '团课', sort: dayjs(g.class_start_time).format('YYYY-MM-DD HH:mm'), day: dayLabel(g.class_start_time),
      date: fmtD(g.class_start_time), time: `${dayjs(g.class_start_time).format('HH:mm')}-${dayjs(g.class_end_time).format('HH:mm')}`,
      title: g.syllabus_title, coach: g.coach_name || '', status: GROUP_STATUS[g.status], club: g.club_name || '',
    })),
  ].sort((a, b) => a.sort.localeCompare(b.sort)).map(({ sort, ...x }) => x);
  return { now: dayjs().format('YYYY-MM-DD HH:mm'), count: list.length, lessons: list };
}

async function getStats(ctx, from, to) {
  const f = fmtD(from) || dayjs().startOf('month').format('YYYY-MM-DD');
  const t = fmtD(to) || dayjs().format('YYYY-MM-DD');
  const pts = await db.query(
    'SELECT `date`, from_time, to_time, status, coach_name FROM biz_ptrain_bespeak_record WHERE vip_id=? AND `date` BETWEEN ? AND ?',
    [ctx.vip, f, t]);
  const groups = await db.query(
    `SELECT class_start_time, class_end_time, status FROM biz_syllabus_subscribe_record
      WHERE vip_id=? AND class_start_time BETWEEN ? AND ?`, [ctx.vip, `${f} 00:00:00`, `${t} 23:59:59`]);
  const [{ n: checkins }] = await db.query(
    'SELECT COUNT(*) n FROM biz_checkin_record WHERE vip_id=? AND check_in_time BETWEEN ? AND ?', [ctx.vip, `${f} 00:00:00`, `${t} 23:59:59`]);
  const donePt = pts.filter(p => p.status === 3);
  const doneGroup = groups.filter(g => g.status === 2);
  const ptMin = donePt.reduce((s, p) => s + Math.max(0, toMin(p.to_time) - toMin(p.from_time)), 0);
  const gMin = doneGroup.reduce((s, g) => s + Math.max(0, dayjs(g.class_end_time).diff(dayjs(g.class_start_time), 'minute')), 0);
  const days = new Set([...donePt.map(p => fmtD(p.date)), ...doneGroup.map(g => fmtD(g.class_start_time))]);
  const coaches = {};
  donePt.forEach(p => { coaches[p.coach_name] = (coaches[p.coach_name] || 0) + 1; });
  return {
    from: f, to: t,
    pt_lessons_done: donePt.length, group_lessons_done: doneGroup.length,
    total_lessons: donePt.length + doneGroup.length,
    total_minutes: ptMin + gMin, total_hours: +((ptMin + gMin) / 60).toFixed(1),
    training_days: days.size, checkins,
    cancelled: pts.filter(p => p.status === 2).length + groups.filter(g => g.status === 3).length,
    no_show: pts.filter(p => p.status === 4).length + groups.filter(g => g.status === 4).length,
    upcoming_in_range: pts.filter(p => [0, 1].includes(p.status)).length + groups.filter(g => [0, 1].includes(g.status)).length,
    pt_by_coach: coaches,
  };
}

async function getCards(ctx) {
  const rows = await db.query(
    `SELECT c.id, c.card_kind, c.card_type_id, c.card_type_name, c.counts, c.left_counts, c.left_money, c.expire_time, c.status,
            c.latest_open_time, IF(c.vip_id=?, 0, 1) AS is_shared, v.realname AS owner_name
       FROM biz_member_card c JOIN biz_vip_user v ON v.id=c.vip_id
      WHERE (c.vip_id=? OR c.id IN (SELECT card_id FROM biz_member_card_user WHERE vip_id=?)) AND c.status IN (0,1,2,3)
      ORDER BY is_shared, FIELD(c.status,1,0,3,2), c.id DESC`, [ctx.vip, ctx.vip, ctx.vip]);
  return rows.map(c => ({
    card_id: c.id, name: c.card_type_name, kind: KIND[c.card_kind] || '',
    status: ['待开卡', '使用中', '已过期', '已暂停'][c.status],
    left: c.card_kind === 2 ? '不限次' : c.card_kind === 3 ? `余额¥${Number(c.left_money)}` : `剩余${c.left_counts}/${c.counts}次`,
    left_counts: c.left_counts,
    expire: c.expire_time ? fmtD(c.expire_time) : (c.status === 0 ? '首次使用后开始计算' : ''),
    days_to_expire: c.expire_time ? dayjs(c.expire_time).startOf('day').diff(dayjs().startOf('day'), 'day') : null,
    shared_from: c.is_shared ? `${c.owner_name}的家庭共享卡` : '',
  }));
}

function parseLessonPlan(lp) {
  if (!lp) return null;
  const s = String(lp).trim();
  if (s.startsWith('{')) {
    try {
      const o = JSON.parse(s);
      return { title: o.title || '', note: o.note || '', actions: (o.items || []).map(x => `${x.action_name} ${x.sets}组x${x.reps}${x.unit || '次'}${x.weight ? ' ' + x.weight + (/kg/i.test(x.weight) ? '' : 'kg') : ''}`) };
    } catch { return null; }
  }
  if (/^https?:|^\/uploads|\.(png|jpe?g|webp)$/i.test(s)) return { title: '教练发送了训练计划图片', actions: [] };
  return { title: '', note: s.slice(0, 200), actions: [] };
}

async function getPlans(ctx, limit = 3) {
  const plans = await db.query(
    `SELECT id, coach_name, title, plan_date, items, note FROM biz_training_plan
      WHERE vip_id=? AND status=1 ORDER BY plan_date DESC, id DESC LIMIT ?`, [ctx.vip, Math.min(10, limit)]);
  const today = await db.query(
    `SELECT from_time, to_time, coach_name, course_title, status, lesson_plan FROM biz_ptrain_bespeak_record
      WHERE vip_id=? AND \`date\`=? AND status IN (0,1,3) ORDER BY from_time`, [ctx.vip, dayjs().format('YYYY-MM-DD')]);
  return {
    today_lessons: today.map(t => ({ time: `${t.from_time}-${t.to_time}`, coach: t.coach_name, course: t.course_title, status: PT_STATUS[t.status], plan: parseLessonPlan(t.lesson_plan) })),
    recent_plans: plans.map(p => {
      let items = [];
      try { items = JSON.parse(p.items || '[]'); } catch { items = []; }
      return {
        date: fmtD(p.plan_date), coach: p.coach_name, title: p.title, note: p.note || '',
        actions: items.slice(0, 15).map(x => `${x.action_name} ${x.sets}组x${x.reps}${x.unit || '次'}${x.weight ? ' ' + x.weight : ''}`),
      };
    }),
  };
}

async function listCoaches(ctx) {
  const vip = await db.queryOne('SELECT coach_id, sub_coach_id FROM biz_vip_user WHERE id=?', [ctx.vip]);
  const rows = await db.query(
    `SELECT id, realname, nickname, good_at FROM biz_club_coach WHERE merchant_id=? AND status=1
       AND NOT EXISTS (SELECT 1 FROM sys_user u WHERE u.id=biz_club_coach.user_id AND u.status=0) ORDER BY sort, id`, [ctx.mid]);
  return rows.map(c => ({
    coach_id: c.id, name: c.realname, good_at: c.good_at || '',
    relation: vip && vip.coach_id === c.id ? '我的主教练' : vip && vip.sub_coach_id === c.id ? '我的副教练' : '',
  }));
}

// 名字模糊匹配教练(忽略 emoji/空格)
async function resolveCoach(ctx, { coach_id, coach_name }) {
  const list = await db.query(
    `SELECT id, realname, nickname FROM biz_club_coach WHERE merchant_id=? AND status=1
       AND NOT EXISTS (SELECT 1 FROM sys_user u WHERE u.id=biz_club_coach.user_id AND u.status=0)`, [ctx.mid]);
  if (coach_id) { const c = list.find(x => x.id === Number(coach_id)); if (c) return { coach: c }; }
  const norm = (s) => String(s || '').replace(/[\s\u{1F000}-\u{1FFFF}\u2600-\u27BF]/gu, '').replace(/教练$/, '').toLowerCase();
  const q = norm(coach_name);
  if (!q) {
    const vip = await db.queryOne('SELECT coach_id FROM biz_vip_user WHERE id=?', [ctx.vip]);
    const main = vip && list.find(x => x.id === vip.coach_id);
    if (main) return { coach: main };
    return { error: '请告诉我想约哪位教练', candidates: list.map(x => x.realname) };
  }
  const hits = list.filter(x => norm(x.realname) === q || norm(x.nickname) === q);
  const fuzzy = hits.length ? hits : list.filter(x => norm(x.realname).includes(q) || q.includes(norm(x.realname)) || (x.nickname && norm(x.nickname).includes(q)));
  if (fuzzy.length === 1) return { coach: fuzzy[0] };
  if (fuzzy.length > 1) return { error: `有多位教练匹配「${coach_name}」，请确认是哪一位`, candidates: fuzzy.map(x => x.realname) };
  return { error: `没有找到叫「${coach_name}」的在职教练`, candidates: list.map(x => x.realname) };
}

async function pickClub(ctx, clubId, clubName) {
  const clubs = await getClubs(ctx.mid);
  if (clubId) { const c = clubs.find(x => x.id === Number(clubId)); if (c) return c; }
  if (clubName) { const c = clubs.find(x => x.name.includes(clubName) || clubName.includes(x.name.replace(/^3S健身·/, ''))); if (c) return c; }
  // 未指定: 会员所属门店 > 门店排序第一家
  const uc = await db.queryOne('SELECT club_id FROM biz_user_club WHERE vip_user_id=? ORDER BY club_id LIMIT 1', [ctx.vip]);
  return (uc && clubs.find(x => x.id === uc.club_id)) || clubs[0];
}

async function coachAvailability(ctx, { coach_id, coach_name, date, club_id, duration = 60 }) {
  const rc = await resolveCoach(ctx, { coach_id, coach_name });
  if (rc.error) return rc;
  const d = fmtD(date) || dayjs().format('YYYY-MM-DD');
  const club = await pickClub(ctx, club_id);
  const busy = await getCoachBusy(rc.coach.id, d);
  const myBusy = await getMemberBusy(ctx.vip, d);
  const { open, close } = parseOpen(club && club.open_time);
  const free = [];
  for (let m = open; m + duration <= close; m += 15) {
    const why = checkTimeRange({ date: d, fromTime: fromMin(m), duration, openTime: club && club.open_time, coachBusy: busy, memberBusy: myBusy, allowPast: false });
    if (!why) free.push(m);
  }
  // 连续可开始时间压缩成区间, 便于模型表达
  const ranges = [];
  free.forEach((m) => {
    const last = ranges[ranges.length - 1];
    if (last && m - last[1] === 15) last[1] = m; else ranges.push([m, m]);
  });
  return {
    coach: rc.coach.realname, coach_id: rc.coach.id, date: d, day: dayLabel(d), club: club && club.name, open_time: club && club.open_time,
    duration_min: duration,
    available_start_ranges: ranges.map(([a, b]) => (a === b ? fromMin(a) : `${fromMin(a)}~${fromMin(b)} 之间任意15分钟整点开始`)),
    coach_busy: busy.map(b => `${b.from}-${b.to} ${b.type === 'rest' ? '休息' : '已有安排'}`),
    my_busy: myBusy.map(b => `${b.from}-${b.to} ${b.label}`),
  };
}

async function proposeBooking(ctx, a) {
  const rc = await resolveCoach(ctx, a);
  if (rc.error) return rc;
  const coach = rc.coach;
  const date = fmtD(a.date);
  if (!date || !/^\d{4}-\d{2}-\d{2}$/.test(date)) return { error: '请确认上课日期' };
  const fm = String(a.from_time || '').match(/^(\d{1,2}):(\d{2})$/);
  if (!fm) return { error: '请确认开始时间，例如 19:00' };
  const fromTime = `${fm[1].padStart(2, '0')}:${fm[2]}`;
  const courses = await db.query('SELECT id, title, duration, coach_ids, card_scope FROM biz_ptrain_course WHERE merchant_id=? AND status=1 ORDER BY sort, id', [ctx.mid]);
  const teachable = courses.filter(c => { const ids = JSON.parse(c.coach_ids || '[]'); return !ids.length || ids.includes(coach.id); });
  if (!teachable.length) return { error: `${coach.realname} 教练暂未开设可预约的私教课程` };
  let course = a.course_id ? teachable.find(c => c.id === Number(a.course_id)) : null;
  if (!course && a.course_name) course = teachable.find(c => c.title.includes(a.course_name) || a.course_name.includes(c.title));
  if (!course) course = teachable.find(c => /私教/.test(c.title)) || teachable[0];
  const club = await pickClub(ctx, a.club_id, a.club_name);
  if (!club) return { error: '门店信息缺失，请联系前台' };

  // 选卡: 本人卡优先, 私教卡 > 次卡 > 时间卡 > 储值卡, 跳过不可用的
  const scope = JSON.parse(course.card_scope || '[]');
  const cards = await db.query(
    `SELECT c.*, IF(c.vip_id=?, 0, 1) AS is_shared, v.realname AS owner_name
       FROM biz_member_card c JOIN biz_vip_user v ON v.id=c.vip_id
      WHERE (c.vip_id=? OR c.id IN (SELECT card_id FROM biz_member_card_user WHERE vip_id=?)) AND c.status IN (0,1,2)
      ORDER BY is_shared, FIELD(c.card_kind,4,1,2,3), c.expire_time`, [ctx.vip, ctx.vip, ctx.vip]);
  const usable = cards.filter(c => !cardBlockReason(c, date) && (!scope.length || scope.includes(c.card_type_id)));
  let card = a.card_id ? usable.find(c => c.id === Number(a.card_id)) : null;
  if (!card) card = usable[0];
  if (!card) {
    return { error: '你目前没有可用于该课程的会员卡（次数用完或已到期），可以去购卡页看看', action: 'buy' };
  }
  const why = checkTimeRange({
    date, fromTime, duration: course.duration, openTime: club.open_time,
    coachBusy: await getCoachBusy(coach.id, date), memberBusy: await getMemberBusy(ctx.vip, date), allowPast: false,
  });
  if (why) return { error: why, hint: '可以调用 get_coach_availability 查询该教练当天可约时间推荐给会员' };
  const toTime = fromMin(toMin(fromTime) + course.duration);
  const draft = {
    coach_id: coach.id, coach_name: coach.realname, course_id: course.id, course_title: course.title,
    date, from_time: fromTime, to_time: toTime, club_id: club.id, club_name: club.name,
    card_id: card.id, card_name: card.card_type_name + (card.is_shared ? `（${card.owner_name}共享）` : ''),
    card_left: card.card_kind === 2 ? '不限次' : card.card_kind === 3 ? `余额¥${Number(card.left_money)}` : `剩余${card.left_counts}次`,
  };
  ctx.cards.push({ type: 'booking', title: '确认预约私教课', day: dayLabel(date), draft });
  return { ok: true, message: '预约草稿已生成，正在等待会员在卡片上点击「确认预约」，此时还没有真正预约成功', draft };
}

async function proposeCancel(ctx, { booking_id }) {
  const bk = await db.queryOne('SELECT * FROM biz_ptrain_bespeak_record WHERE id=? AND vip_id=?', [booking_id, ctx.vip]);
  if (!bk) return { error: '没有找到这节预约，可先调用 get_upcoming_lessons 查看 booking_id' };
  if (![0, 1].includes(bk.status)) return { error: `这节课当前状态为「${PT_STATUS[bk.status]}」，不能取消` };
  const start = dayjs(`${fmtD(bk.date)} ${bk.from_time}`);
  if (start.isBefore(dayjs())) return { error: '这节课已经开始或已过，不能取消' };
  const deadline = await cancelDeadline(bk);
  if (deadline > 0 && start.diff(dayjs(), 'hour', true) < deadline) {
    return { error: `开课前 ${deadline} 小时内不能自行取消，请直接联系 ${bk.coach_name} 教练` };
  }
  const draft = { booking_id: bk.id, coach_name: bk.coach_name, course_title: bk.course_title, date: fmtD(bk.date), from_time: bk.from_time, to_time: bk.to_time };
  ctx.cards.push({ type: 'cancel', title: '确认取消预约', day: dayLabel(bk.date), draft });
  return { ok: true, message: '取消草稿已生成，等待会员点击卡片上的「确认取消」，此时还没有真正取消', draft };
}

async function cancelDeadline(bk) {
  const card = await db.queryOne('SELECT card_type_id FROM biz_member_card WHERE id=?', [bk.card_id]);
  const cat = card ? await db.queryOne('SELECT cancel_deadline_hours FROM biz_card_category WHERE id=?', [card.card_type_id]) : null;
  return (cat && cat.cancel_deadline_hours) || 0;
}

async function searchActions(ctx, { keyword }) {
  const kw = String(keyword || '').trim().slice(0, 20);
  if (!kw) return { actions: [] };
  const rows = await db.query(
    `SELECT name, part, equipment, description FROM biz_training_action
      WHERE merchant_id IN (0,?) AND status=1 AND (name LIKE ? OR part LIKE ? OR description LIKE ?)
      ORDER BY (name=?) DESC, (name LIKE ?) DESC LIMIT 6`, [ctx.mid, `%${kw}%`, `%${kw}%`, `%${kw}%`, kw, `${kw}%`]);
  return { source: '门店动作库', actions: rows };
}

/* ---- 天气: Open-Meteo(免 Key), 按门店坐标, 30 分钟缓存 ---- */
const WMO = {
  0: '晴', 1: '晴间多云', 2: '多云', 3: '阴', 45: '雾', 48: '雾凇', 51: '小毛毛雨', 53: '毛毛雨', 55: '大毛毛雨',
  61: '小雨', 63: '中雨', 65: '大雨', 66: '冻雨', 67: '冻雨', 71: '小雪', 73: '中雪', 75: '大雪', 77: '雪粒',
  80: '阵雨', 81: '中阵雨', 82: '强阵雨', 85: '阵雪', 86: '大阵雪', 95: '雷阵雨', 96: '雷阵雨伴冰雹', 99: '强雷阵雨伴冰雹',
};
function clubGeo(club) {
  const s = `${(club && club.name) || ''}${(club && club.address) || ''}`;
  if (/巴南/.test(s)) return [29.40, 106.54];
  if (/南坪|南岸/.test(s)) return [29.53, 106.57];
  if (/渝北/.test(s)) return [29.72, 106.63];
  if (/江北/.test(s)) return [29.58, 106.57];
  return [Number(S.weather_lat) || 29.56, Number(S.weather_lng) || 106.55];
}
const weatherCache = {};
async function getWeather(ctx, { club_id } = {}) {
  const club = await pickClub(ctx, club_id);
  const [lat, lng] = clubGeo(club);
  const key = `${lat},${lng}`;
  const c = weatherCache[key];
  if (c && Date.now() - c.t < 30 * 60000) return c.v;
  try {
    const url = `https://api.open-meteo.com/v1/forecast?latitude=${lat}&longitude=${lng}&current=temperature_2m,apparent_temperature,weather_code,relative_humidity_2m`
      + '&daily=weather_code,temperature_2m_max,temperature_2m_min,precipitation_probability_max,uv_index_max&timezone=Asia/Shanghai&forecast_days=3';
    const resp = await fetch(url, { signal: AbortSignal.timeout(8000) });
    const d = await resp.json();
    const v = {
      city: club ? club.name : '重庆',
      now: d.current ? `${WMO[d.current.weather_code] || ''} ${Math.round(d.current.temperature_2m)}°C 体感${Math.round(d.current.apparent_temperature)}°C 湿度${d.current.relative_humidity_2m}%` : '',
      days: (d.daily && d.daily.time || []).map((t, i) => ({
        day: dayLabel(t), weather: WMO[d.daily.weather_code[i]] || '',
        temp: `${Math.round(d.daily.temperature_2m_min[i])}~${Math.round(d.daily.temperature_2m_max[i])}°C`,
        rain_prob: `${d.daily.precipitation_probability_max[i] || 0}%`, uv: d.daily.uv_index_max[i],
      })),
    };
    weatherCache[key] = { t: Date.now(), v };
    return v;
  } catch (e) {
    return { error: '天气服务暂不可用' };
  }
}

async function getMeals(ctx, { date } = {}) {
  const d = fmtD(date) || dayjs().format('YYYY-MM-DD');
  const rows = await db.query('SELECT meal_type, foods, kcal, protein, carbs, fat FROM biz_ai_meal_log WHERE vip_id=? AND meal_date=? ORDER BY id', [ctx.vip, d]);
  const total = rows.reduce((s, x) => ({ kcal: s.kcal + x.kcal, protein: s.protein + Number(x.protein), carbs: s.carbs + Number(x.carbs), fat: s.fat + Number(x.fat) }), { kcal: 0, protein: 0, carbs: 0, fat: 0 });
  const target = dailyTarget(await getProfile(ctx));
  return {
    date: d,
    meals: rows.map(x => {
      let foods = [];
      try { foods = JSON.parse(x.foods || '[]'); } catch { foods = []; }
      return { meal: MEAL_NAMES[x.meal_type] || x.meal_type, kcal: x.kcal, foods: foods.map(f => f.name).join('、') };
    }),
    total: { kcal: total.kcal, protein_g: Math.round(total.protein), carbs_g: Math.round(total.carbs), fat_g: Math.round(total.fat) },
    daily_target: target,
    remaining_kcal: target ? target.kcal - total.kcal : null,
  };
}

async function getBodyRecords(ctx) {
  const rows = await db.query(
    'SELECT record_date, height, weight, body_fat, muscle, waist, hip, coach_name FROM biz_body_record WHERE vip_id=? ORDER BY record_date DESC, id DESC LIMIT 8', [ctx.vip]);
  return { records: rows.map(x => ({ date: fmtD(x.record_date), height: x.height, weight: x.weight, body_fat: x.body_fat, muscle: x.muscle, waist: x.waist, hip: x.hip })) };
}

function weekRange(offset = 0) {
  // 周一为一周开始
  const base = dayjs().add(offset, 'week');
  const dow = (base.day() + 6) % 7;
  const start = base.subtract(dow, 'day').startOf('day');
  return { from: start.format('YYYY-MM-DD'), to: start.add(6, 'day').format('YYYY-MM-DD'), label: `${start.format('M.D')}-${start.add(6, 'day').format('M.D')}` };
}

async function weekCompare(ctx, { week_offset = 0 } = {}) {
  const off = Math.max(-8, Math.min(0, Number(week_offset) || 0));
  const cur = weekRange(off); const prev = weekRange(off - 1);
  const [a, b] = await Promise.all([getStats(ctx, cur.from, cur.to), getStats(ctx, prev.from, prev.to)]);
  const [{ kcal, n }] = await db.query(
    'SELECT COALESCE(SUM(kcal),0) kcal, COUNT(DISTINCT meal_date) n FROM biz_ai_meal_log WHERE vip_id=? AND meal_date BETWEEN ? AND ?', [ctx.vip, cur.from, cur.to]);
  return {
    this_week: { range: cur.label, ...a }, last_week: { range: prev.label, ...b },
    meal_log_days: Number(n), avg_daily_kcal_logged: Number(n) ? Math.round(Number(kcal) / Number(n)) : null,
  };
}

/* ================= 工具定义 ================= */
const TOOLS = [
  { name: 'get_my_profile', description: '会员基本资料: 姓名、性别、年龄、主教练、初始/目标体重、最近一次体测', parameters: { type: 'object', properties: {} } },
  { name: 'get_upcoming_lessons', description: '会员未来已预约的私教课和团课(含 booking_id, 可用于取消)', parameters: { type: 'object', properties: { days: { type: 'integer', description: '查询未来几天, 默认14' } } } },
  { name: 'get_training_stats', description: '统计会员某时间段的训练数据: 完成的私教/团课节数、训练时长、训练天数、到店签到次数、取消/爽约次数', parameters: { type: 'object', properties: { from: { type: 'string', description: 'YYYY-MM-DD' }, to: { type: 'string', description: 'YYYY-MM-DD' } }, required: ['from', 'to'] } },
  { name: 'get_week_compare', description: '本周(或之前某周)与前一周的训练对比数据, 用于生成每周训练小结', parameters: { type: 'object', properties: { week_offset: { type: 'integer', description: '0=本周, -1=上周' } } } },
  { name: 'get_my_cards', description: '会员的会员卡: 卡名、剩余次数/余额、到期日、状态(含家庭共享卡)', parameters: { type: 'object', properties: {} } },
  { name: 'get_training_plans', description: '今天的课程及教练安排的训练计划内容, 以及最近的训练计划', parameters: { type: 'object', properties: { limit: { type: 'integer' } } } },
  { name: 'list_coaches', description: '门店在职教练列表(含擅长方向、是否是我的主教练)', parameters: { type: 'object', properties: {} } },
  { name: 'get_coach_availability', description: '查询某位教练某天还能约的开始时间和已有安排', parameters: { type: 'object', properties: { coach_name: { type: 'string' }, date: { type: 'string', description: 'YYYY-MM-DD' }, club_id: { type: 'integer' } }, required: ['date'] } },
  { name: 'propose_pt_booking', description: '生成私教课预约草稿(不会直接下单), 会员在卡片上点确认后才预约。教练名不填默认会员主教练', parameters: { type: 'object', properties: { coach_name: { type: 'string' }, date: { type: 'string', description: 'YYYY-MM-DD' }, from_time: { type: 'string', description: 'HH:mm, 分钟须为00/15/30/45' }, course_name: { type: 'string' }, club_id: { type: 'integer' } }, required: ['date', 'from_time'] } },
  { name: 'propose_cancel', description: '生成取消私教预约的草稿(不会直接取消), 会员点确认后才取消', parameters: { type: 'object', properties: { booking_id: { type: 'integer' } }, required: ['booking_id'] } },
  { name: 'search_actions', description: '在门店动作库中检索健身动作(名称/部位/器械/说明)', parameters: { type: 'object', properties: { keyword: { type: 'string' } }, required: ['keyword'] } },
  { name: 'get_weather', description: '门店所在地今天起3天天气与气温', parameters: { type: 'object', properties: { club_id: { type: 'integer' } } } },
  { name: 'get_meal_logs', description: '会员某天记录的饮食、已摄入热量、每日建议摄入与剩余热量', parameters: { type: 'object', properties: { date: { type: 'string', description: 'YYYY-MM-DD, 默认今天' } } } },
  { name: 'get_body_records', description: '会员历次体测数据(体重、体脂、肌肉量、腰臀围)', parameters: { type: 'object', properties: {} } },
].map(f => ({ type: 'function', function: f }));

async function runTool(ctx, name, args) {
  switch (name) {
    case 'get_my_profile': { const p = await getProfile(ctx); return { ...p, daily_target: dailyTarget(p) }; }
    case 'get_upcoming_lessons': return getUpcoming(ctx, Math.min(60, Number(args.days) || 14));
    case 'get_training_stats': return getStats(ctx, args.from, args.to);
    case 'get_week_compare': return weekCompare(ctx, args);
    case 'get_my_cards': {
      const cards = await getCards(ctx);
      if (cards.some(c => (c.left_counts != null && c.left_counts <= 2 && c.kind !== '时间卡' && c.kind !== '储值卡') || (c.days_to_expire != null && c.days_to_expire <= 7 && c.days_to_expire >= 0))) {
        ctx.cards.push({ type: 'link', text: '课时快用完了？去看看续卡方案', path: 'buy' });
      }
      return { cards };
    }
    case 'get_training_plans': return getPlans(ctx, Number(args.limit) || 3);
    case 'list_coaches': return { coaches: await listCoaches(ctx) };
    case 'get_coach_availability': return coachAvailability(ctx, args);
    case 'propose_pt_booking': {
      const res = await proposeBooking(ctx, args);
      if (res.action === 'buy') ctx.cards.push({ type: 'link', text: '去购卡', path: 'buy' });
      return res;
    }
    case 'propose_cancel': return proposeCancel(ctx, args);
    case 'search_actions': return searchActions(ctx, args);
    case 'get_weather': return getWeather(ctx, args);
    case 'get_meal_logs': return getMeals(ctx, args);
    case 'get_body_records': return getBodyRecords(ctx);
    default: return { error: `未知工具 ${name}` };
  }
}

async function systemPrompt(ctx) {
  const clubs = await getClubs(ctx.mid);
  const n = dayjs();
  return `你是「${BOT_NAME}」，3S运动中心（重庆）的 AI 健身助手，正在为会员「${ctx.name}」服务。
现在是 ${n.format('YYYY-MM-DD HH:mm')} 星期${WEEK[n.day()]}。
门店：${clubs.map(c => `${c.name}(id=${c.id}，${c.address}，营业${c.open_time})`).join('；')}。

你能做：查询会员自己的课程、会员卡、训练数据、训练计划、饮食记录和体测；帮会员预约或取消私教课；解答健身动作、训练方法、饮食营养、恢复拉伸问题；结合天气给出提醒。

规则：
1. 涉及会员个人数据时必须调用工具获取，严禁编造；工具没有返回的数据就如实说查不到。
2. 预约私教：需要教练、日期、开始时间（分钟为00/15/30/45）。把「明晚7点」「周五下午三点」换算成具体日期和24小时制时间。会员没说教练时默认主教练。信息齐全就直接调用 propose_pt_booking；返回 error 时向会员解释原因，时段冲突就调用 get_coach_availability 推荐2~3个可约时间。草稿生成后只说「请在下方卡片确认」，绝不能说已经预约成功。
3. 取消预约：先用 get_upcoming_lessons 找到 booking_id，再调用 propose_cancel，同样只说请确认。团课取消请引导到「我的预约」页面操作。
4. 回复简洁口语化，一般不超过150字，可以用少量 emoji。不要用 Markdown 标题、表格、加粗；分点时用「・」或数字。
5. 伤病疼痛、疾病、孕期、用药等问题只给一般性建议，并提醒咨询教练或医生。不推荐极端节食、药物或补剂剂量。
6. 讲解动作时先调用 search_actions 查门店动作库，再结合专业知识说明：目标肌群、动作要领、常见错误、新手建议。
7. 与健身、饮食、健康、本门店无关的话题，礼貌说明你只能帮忙健身相关的事。
8. 饮食建议参考 get_meal_logs / get_my_profile 中的每日建议热量与蛋白质目标；热量数值都是估算。`;
}

/* ================= 用量 ================= */
async function useQuota(vip, kind) {
  const d = dayjs().format('YYYY-MM-DD');
  const row = await db.queryOne('SELECT chats, images FROM biz_ai_usage WHERE vip_id=? AND use_date=?', [vip, d]);
  const used = row ? row[kind] : 0;
  if (used >= AI_LIMIT[kind]) {
    throw new BizError(kind === 'images' ? `今天的拍照识别次数（${AI_LIMIT.images}次）已用完，明天再来吧` : `今天和小S聊得很多啦（${AI_LIMIT.chats}条上限），明天继续～`);
  }
  await db.exec(`INSERT INTO biz_ai_usage (vip_id, use_date, ${kind}) VALUES (?,?,1) ON DUPLICATE KEY UPDATE ${kind}=${kind}+1`, [vip, d]);
}
async function quotaLeft(vip) {
  const row = await db.queryOne('SELECT chats, images FROM biz_ai_usage WHERE vip_id=? AND use_date=?', [vip, dayjs().format('YYYY-MM-DD')]);
  return { chats: AI_LIMIT.chats - (row ? row.chats : 0), images: AI_LIMIT.images - (row ? row.images : 0) };
}

async function saveMsg(ctx, role, content, { image = '', cards = null, tokens = 0, time = null } = {}) {
  return db.insert(
    `INSERT INTO biz_ai_message (merchant_id, vip_id, role, content, image, cards, tokens${time ? ', insert_time' : ''}) VALUES (?,?,?,?,?,?,?${time ? ',?' : ''})`,
    [ctx.mid, ctx.vip, role, content || '', image || '', cards && cards.length ? JSON.stringify(cards) : null, tokens, ...(time ? [time] : [])]);
}

function ctxOf(req) {
  return { vip: req.user.vip, mid: req.user.mid || 1, name: req.user.name || '会员', cards: [] };
}

function msgOut(m) {
  let cards = [];
  try { cards = m.cards ? JSON.parse(m.cards) : []; } catch { cards = []; }
  return { id: m.id, role: m.role, text: m.content, image: m.image, cards, time: dayjs(m.insert_time).format('MM-DD HH:mm') };
}

/* ================= 每日简报 / 周报 ================= */
async function buildDailyBrief(ctx) {
  const today = dayjs().format('YYYY-MM-DD');
  const exist = await db.queryOne('SELECT id FROM biz_ai_report WHERE vip_id=? AND type=? AND period=?', [ctx.vip, 'daily', today]);
  if (exist) return false;
  // 占位防并发重复生成
  try {
    await db.insert('INSERT INTO biz_ai_report (merchant_id, vip_id, type, period, content) VALUES (?,?,?,?,?)', [ctx.mid, ctx.vip, 'daily', today, '']);
  } catch (e) { return false; }
  const [profile, upcoming, plans, weather, cards, meals] = await Promise.all([
    getProfile(ctx), getUpcoming(ctx, 7), getPlans(ctx, 1), getWeather(ctx), getCards(ctx), getMeals(ctx),
  ]);
  const lowCards = cards.filter(c => c.status !== '已过期' && ((c.left_counts != null && c.left_counts <= 2 && !['时间卡', '储值卡'].includes(c.kind)) || (c.days_to_expire != null && c.days_to_expire >= 0 && c.days_to_expire <= 7)));
  const data = {
    member: profile.name, goal: dailyTarget(profile), next_lessons: upcoming.lessons.slice(0, 3),
    today_lessons: plans.today_lessons, latest_plan: plans.recent_plans[0] || null, weather,
    cards_need_attention: lowCards, meals_today: meals.total,
  };
  let content = '';
  try {
    const { message } = await llm([
      { role: 'system', content: `你是3S运动中心的AI健身助手「${BOT_NAME}」。根据数据给会员写「今日简报」，要求：
・开头一句亲切问候(带会员名，结合时间段，如早上好)。
・然后分行，每行一个 emoji 开头：📅 下一节课（没有就鼓励约课）；🏋️ 今日训练要点（今天有课时结合训练计划，没有则给一条简短训练建议）；🍽 饮食建议（今天有课给课后饮食建议，否则日常饮食注意，结合目标）；🌤 天气（气温和降雨，提醒穿衣、带伞、补水）；有卡快到期或课时不足时加一行 💳 提醒。
・总字数 200 字以内，不要 Markdown，不要编造数据中没有的课程。` },
      { role: 'user', content: JSON.stringify(data) },
    ], { maxTokens: 600, temperature: 0.7, timeout: 25000 });
    content = cleanText(message.content);
  } catch (e) {
    const nl = upcoming.lessons[0];
    content = `${profile.name}，你好！\n📅 ${nl ? `下一节课：${nl.day} ${nl.time} ${nl.title}${nl.coach ? ' · ' + nl.coach : ''}` : '近期还没有预约，找个时间练起来吧'}\n🌤 ${weather.now || '天气信息暂不可用'}`;
  }
  const cardList = [{ type: 'brief', title: `今日简报 · ${dayjs().format('M月D日')} 周${WEEK[dayjs().day()]}`, weather: weather.days ? `${weather.days[0].weather} ${weather.days[0].temp}` : '' }];
  if (lowCards.length) cardList.push({ type: 'link', text: '查看续卡方案', path: 'buy' });
  await db.exec('UPDATE biz_ai_report SET content=?, data=?, read_time=NOW() WHERE vip_id=? AND type=? AND period=?', [content, JSON.stringify(data).slice(0, 60000), ctx.vip, 'daily', today]);
  await saveMsg(ctx, 'assistant', content, { cards: cardList });
  return true;
}

async function buildWeeklyReport(ctx, force = false) {
  const last = weekRange(-1);
  const period = `W${last.from}`;
  const exist = await db.queryOne('SELECT id FROM biz_ai_report WHERE vip_id=? AND type=? AND period=?', [ctx.vip, 'weekly', period]);
  if (exist && !force) return false;
  const cmp = await weekCompare(ctx, { week_offset: -1 });
  // 两周都没有任何训练/签到就不打扰
  if (!force && !cmp.this_week.total_lessons && !cmp.last_week.total_lessons && !cmp.this_week.checkins) return false;
  if (!exist) {
    try {
      await db.insert('INSERT INTO biz_ai_report (merchant_id, vip_id, type, period, content) VALUES (?,?,?,?,?)', [ctx.mid, ctx.vip, 'weekly', period, '']);
    } catch (e) { return false; }
  }
  const upcoming = await getUpcoming(ctx, 7);
  let content = '';
  try {
    const { message } = await llm([
      { role: 'system', content: `你是3S运动中心的AI健身助手「${BOT_NAME}」。根据数据写一份「上周训练小结」：
1) 一句话总评（带鼓励）；2) 上周完成几节课、练了多久、到店几次，与再上一周相比是多了还是少了（给出具体变化）；3) 有取消或爽约时温和提醒；4) 下周建议（训练频次、部位/有氧搭配、饮食或作息一条），如果下周已有预约就提一下。
200 字以内，不要 Markdown，可以用 emoji。` },
      { role: 'user', content: JSON.stringify({ member: ctx.name, ...cmp, next_week_booked: upcoming.lessons.slice(0, 5) }) },
    ], { maxTokens: 700, temperature: 0.7, timeout: 25000 });
    content = cleanText(message.content);
  } catch (e) {
    const a = cmp.this_week; const b = cmp.last_week;
    content = `上周（${a.range}）你完成了 ${a.total_lessons} 节课，训练 ${a.total_hours} 小时，到店 ${a.checkins} 次；再上一周是 ${b.total_lessons} 节。继续保持节奏！`;
  }
  const a = cmp.this_week; const b = cmp.last_week;
  const card = {
    type: 'weekly', title: `上周训练小结 · ${a.range}`,
    rows: [
      { label: '完成课程', unit: '节', cur: a.total_lessons, prev: b.total_lessons },
      { label: '训练时长', unit: '小时', cur: a.total_hours, prev: b.total_hours },
      { label: '到店签到', unit: '次', cur: a.checkins, prev: b.checkins },
    ].map(x => ({ ...x, max: Math.max(x.cur, x.prev, 1) })),
  };
  await db.exec('UPDATE biz_ai_report SET content=?, data=? WHERE vip_id=? AND type=? AND period=?', [content, JSON.stringify(cmp), ctx.vip, 'weekly', period]);
  await saveMsg(ctx, 'assistant', content, { cards: [card] });
  return true;
}

/* ================= 拍照识别热量 ================= */
function readUpload(url) {
  const m = String(url || '').match(/^\/uploads\/([\w.-]+\.(jpe?g|png|webp|gif|heic|heif))$/i);
  if (!m) throw new BizError('图片地址无效，请重新上传');
  for (const root of uploadRoots) {
    const p = path.join(root, m[1]);
    if (fs.existsSync(p)) {
      const buf = fs.readFileSync(p);
      if (buf.length > 8 * 1024 * 1024) throw new BizError('图片太大了，请换一张');
      const ext = m[2].toLowerCase();
      const mime = ext === 'png' ? 'image/png' : ext === 'webp' ? 'image/webp' : ext === 'gif' ? 'image/gif' : 'image/jpeg';
      return `data:${mime};base64,${buf.toString('base64')}`;
    }
  }
  throw new BizError('图片不存在，请重新上传');
}

async function recognizeMeal(ctx, imageUrl, userText) {
  const dataUrl = readUpload(imageUrl);
  const profile = await getProfile(ctx);
  const target = dailyTarget(profile);
  const meals = await getMeals(ctx);
  const { message, usage } = await visionChat([
    { role: 'system', content: `你是专业营养师。识别图片中的食物并估算热量，只输出 JSON：
{"is_food":true,"foods":[{"name":"食物名","grams":估算克数整数,"kcal":热量整数}],"total_kcal":整数,"protein_g":数字,"carbs_g":数字,"fat_g":数字,"kcal_range":"如 550-700","comment":"点评与建议"}
要求：按中国常见份量估算；油炸/勾芡/红烧的菜要计入用油；看不清的按常见做法估计；食物名用简短常用菜名(不超过8个字，不要括号备注)。comment 60~120 字：结合会员目标（${target ? target.goal + '，每日建议约' + target.kcal + 'kcal(这是全天总量，一顿正餐约占三分之一)，今天已记录' + meals.total.kcal + 'kcal' : '未设置目标'}）评价这一餐本身是否合适（蛋白质是否充足、油脂/精制碳水是否过多），不要拿一餐和全天目标直接比较，给出 1~2 条可执行的调整建议，口语化，可带 emoji。
如果图片里不是食物，返回 {"is_food":false,"comment":"简短说明"}。` },
    { role: 'user', content: [{ type: 'image_url', image_url: { url: dataUrl } }, { type: 'text', text: userText ? `会员说：${String(userText).slice(0, 200)}` : '请识别这餐的热量' }] },
  ], { json: true, maxTokens: 900, temperature: 0.3, timeout: 60000 });
  let o;
  try {
    const s = String(message.content || '');
    o = JSON.parse(s.slice(s.indexOf('{'), s.lastIndexOf('}') + 1));
  } catch (e) { throw new BizError('没看清这张图片，换个角度再拍一张试试'); }
  if (!o.is_food) return { text: cleanText(o.comment || '这张图片里好像没有食物哦，拍一张餐食照片试试～'), cards: [], tokens: usage.total_tokens || 0 };
  const foods = (Array.isArray(o.foods) ? o.foods : []).slice(0, 12).map(f => ({
    name: String(f.name || '').slice(0, 20), grams: Math.max(0, Math.round(Number(f.grams) || 0)), kcal: Math.max(0, Math.round(Number(f.kcal) || 0)),
  })).filter(f => f.name);
  const total = Math.round(Number(o.total_kcal) || foods.reduce((s, f) => s + f.kcal, 0));
  // 会员文字里提到了餐次就用它, 否则按当前时间推断
  const said = String(userText || '');
  const mealType = /早餐|早饭|早上/.test(said) ? 'breakfast' : /午餐|午饭|中午/.test(said) ? 'lunch'
    : /晚餐|晚饭|晚上/.test(said) ? 'dinner' : /加餐|零食|夜宵|下午茶/.test(said) ? 'snack' : mealTypeByHour(dayjs().hour());
  const card = {
    type: 'meal', title: '这餐约', image: imageUrl, foods, kcal: total, range: String(o.kcal_range || '').slice(0, 20),
    protein: +(Number(o.protein_g) || 0).toFixed(1), carbs: +(Number(o.carbs_g) || 0).toFixed(1), fat: +(Number(o.fat_g) || 0).toFixed(1),
    meal_type: mealType, meal_name: MEAL_NAMES[mealType], comment: cleanText(o.comment || '').slice(0, 300),
    target: target ? target.kcal : null, eaten: meals.total.kcal,
  };
  const text = `识别到 ${foods.map(f => f.name).join('、') || '食物'}，这餐大约 ${total} kcal${card.range ? `（${card.range}）` : ''}。\n${card.comment}`;
  return { text, cards: [card], tokens: usage.total_tokens || 0 };
}

/* ================= 路由 ================= */
const QUICK = ['下一节课是什么时候', '我的卡还剩几节', '帮我约私教', '本周训练小结', '上个月练了多久', '今天吃什么好', '深蹲怎么做才标准'];

// 首页机器人红点: 今天还没看过简报
r.get('/dot', async (req, res, next) => {
  try {
    await ensureTables();
    const row = await db.queryOne('SELECT id FROM biz_ai_report WHERE vip_id=? AND type=? AND period=?', [req.user.vip, 'daily', dayjs().format('YYYY-MM-DD')]);
    res.json(ok({ dot: !row }));
  } catch (e) { next(e); }
});

// 打开抽屉: 生成今日简报/上周小结(按需), 返回最近对话
r.get('/init', async (req, res, next) => {
  try {
    await ensureTables();
    const ctx = ctxOf(req);
    const v = await db.queryOne('SELECT realname, nickname FROM biz_vip_user WHERE id=?', [ctx.vip]);
    if (v) ctx.name = v.realname || v.nickname || ctx.name;
    const isNewUser = !(await db.queryOne('SELECT id FROM biz_ai_message WHERE vip_id=? LIMIT 1', [ctx.vip]));
    if (isNewUser) {
      await saveMsg(ctx, 'assistant', `Hi ${ctx.name}，我是你的 AI 健身助手${BOT_NAME} 🤖\n我可以帮你：\n・查课程、查卡、查训练数据\n・一句话约私教，比如「约BOOM教练明晚7点」\n・讲解健身动作和饮食知识\n・拍一张餐食照片帮你估算热量\n每天第一次打开，我还会给你一份今日简报～`);
    }
    if (CFG.keys.length) {
      await buildWeeklyReport(ctx).catch(e => console.error('[AI] weekly:', e.message));
      await buildDailyBrief(ctx).catch(e => console.error('[AI] daily:', e.message));
    }
    const rows = await db.query('SELECT * FROM biz_ai_message WHERE vip_id=? ORDER BY id DESC LIMIT 40', [ctx.vip]);
    res.json(ok({ messages: rows.reverse().map(msgOut), quick: QUICK, quota: await quotaLeft(ctx.vip), name: ctx.name, enabled: CFG.keys.length > 0 }));
  } catch (e) { next(e); }
});

// 对话(可附带一张已上传图片)
r.post('/chat', async (req, res, next) => {
  try {
    await ensureTables();
    const ctx = ctxOf(req);
    const text = String(req.body.message || '').trim().slice(0, 500);
    const image = String(req.body.image || '');
    if (!text && !image) throw new BizError('说点什么吧～');
    await useQuota(ctx.vip, image ? 'images' : 'chats');
    const v = await db.queryOne('SELECT realname, nickname FROM biz_vip_user WHERE id=?', [ctx.vip]);
    if (v) ctx.name = v.realname || v.nickname || ctx.name;
    await saveMsg(ctx, 'user', text, { image });

    let reply = ''; let tokens = 0;
    if (image) {
      const rst = await recognizeMeal(ctx, image, text);
      reply = rst.text; tokens = rst.tokens; ctx.cards.push(...rst.cards);
    } else if (/^(本周|这周|上周)?(训练)?(小结|周报|总结)$|训练小结|周报/.test(text) && /上周/.test(text)) {
      // 「上周小结」直接生成卡片式周报
      await buildWeeklyReport(ctx, true);
      const last = await db.queryOne('SELECT * FROM biz_ai_message WHERE vip_id=? AND role=? ORDER BY id DESC LIMIT 1', [ctx.vip, 'assistant']);
      return res.json(ok({ messages: [msgOut(last)], quota: await quotaLeft(ctx.vip) }));
    } else {
      const history = await db.query('SELECT role, content, image FROM biz_ai_message WHERE vip_id=? ORDER BY id DESC LIMIT 13', [ctx.vip]);
      const hist = history.reverse().slice(0, -1) // 去掉刚存的这条
        .filter(m => m.content)
        .map(m => ({ role: m.role === 'user' ? 'user' : 'assistant', content: (m.image ? '[发送了一张餐食照片] ' : '') + m.content.slice(0, 800) }));
      const messages = [{ role: 'system', content: await systemPrompt(ctx) }, ...hist, { role: 'user', content: text }];
      for (let round = 0; round < 5; round++) {
        const { message, usage } = await llm(messages, { tools: TOOLS, maxTokens: 1000 });
        tokens += usage.total_tokens || 0;
        const calls = message.tool_calls || [];
        if (!calls.length) { reply = cleanText(message.content); break; }
        messages.push({ role: 'assistant', content: message.content || '', tool_calls: calls });
        for (const c of calls) {
          let args = {};
          try { args = JSON.parse(c.function.arguments || '{}'); } catch { args = {}; }
          let result;
          try { result = await runTool(ctx, c.function.name, args); } catch (e) { result = { error: e.biz ? e.message : '查询失败' }; console.error('[AI] tool', c.function.name, e.message); }
          messages.push({ role: 'tool', tool_call_id: c.id, content: JSON.stringify(result).slice(0, 12000) });
        }
      }
      if (!reply) reply = '这个问题我还没处理好，换个说法再试试？';
    }
    // 同类卡片只保留最后一张(模型多次调用时)
    const seen = new Set();
    const cards = ctx.cards.reverse().filter(c => { const k = c.type + (c.path || ''); if (seen.has(k)) return false; seen.add(k); return true; }).reverse();
    const id = await saveMsg(ctx, 'assistant', reply, { cards, tokens });
    res.json(ok({ messages: [{ id, role: 'assistant', text: reply, image: '', cards, time: dayjs().format('MM-DD HH:mm') }], quota: await quotaLeft(ctx.vip) }));
  } catch (e) { next(e); }
});

// 更新消息里某张卡片的状态(确认后卡片变为已完成)
async function markCard(ctx, msgId, idx, patch) {
  if (!msgId) return;
  const m = await db.queryOne('SELECT id, cards FROM biz_ai_message WHERE id=? AND vip_id=?', [msgId, ctx.vip]);
  if (!m || !m.cards) return;
  let cards = [];
  try { cards = JSON.parse(m.cards); } catch { return; }
  if (!cards[idx]) return;
  cards[idx] = { ...cards[idx], ...patch };
  await db.exec('UPDATE biz_ai_message SET cards=? WHERE id=?', [JSON.stringify(cards), m.id]);
}

// 确认预约(会员点击卡片按钮)
r.post('/confirm-booking', async (req, res, next) => {
  try {
    await ensureTables();
    const ctx = ctxOf(req);
    const d = req.body.draft || {};
    const result = await createPtBooking({
      mid: ctx.mid, clubId: d.club_id, vipId: ctx.vip, coachId: d.coach_id, courseId: d.course_id,
      date: d.date, fromTime: d.from_time, cardId: d.card_id, recordType: 1, remark: 'AI助手预约', autoConfirm: false, allowPast: false,
    });
    await logAction(req, '会员AI约课', `预约#${result.id} 教练:${d.coach_name || d.coach_id} ${d.date} ${d.from_time}`);
    const statusText = result.status === 1 ? '预约成功' : '已提交，待教练确认';
    await markCard(ctx, req.body.msg_id, Number(req.body.card_idx) || 0, { done: statusText, booking_id: result.id });
    const text = `✅ ${statusText}：${dayLabel(d.date)} ${d.from_time}-${d.to_time} ${d.coach_name}教练 · ${d.course_title}${result.status === 1 ? '' : '\n教练确认后会通知你，可在「我的预约」查看。'}`;
    const id = await saveMsg(ctx, 'assistant', text, { cards: [{ type: 'link', text: '查看我的预约', path: 'my-bookings' }] });
    res.json(ok({ status: result.status, done: statusText, message: { id, role: 'assistant', text, cards: [{ type: 'link', text: '查看我的预约', path: 'my-bookings' }], time: dayjs().format('MM-DD HH:mm') } }));
  } catch (e) { next(e); }
});

// 确认取消
r.post('/confirm-cancel', async (req, res, next) => {
  try {
    await ensureTables();
    const ctx = ctxOf(req);
    const bk = await db.queryOne('SELECT * FROM biz_ptrain_bespeak_record WHERE id=? AND vip_id=?', [req.body.booking_id, ctx.vip]);
    if (!bk) throw new BizError('预约不存在');
    if (![0, 1].includes(bk.status)) throw new BizError('该预约不可取消');
    const start = dayjs(`${fmtD(bk.date)} ${bk.from_time}`);
    const deadline = await cancelDeadline(bk);
    if (deadline > 0 && start.diff(dayjs(), 'hour', true) < deadline && start.isAfter(dayjs())) {
      throw new BizError(`开课前${deadline}小时内不可自行取消，请联系教练`);
    }
    await db.exec("UPDATE biz_ptrain_bespeak_record SET status=2, cancel_reason='会员通过AI助手取消' WHERE id=?", [bk.id]);
    await logAction(req, '会员AI取消私教', `预约#${bk.id} 教练:${bk.coach_name || ''} ${fmtD(bk.date)} ${bk.from_time}`);
    await markCard(ctx, req.body.msg_id, Number(req.body.card_idx) || 0, { done: '已取消' });
    const text = `已帮你取消 ${dayLabel(bk.date)} ${bk.from_time} ${bk.coach_name}教练的课程。`;
    const id = await saveMsg(ctx, 'assistant', text);
    res.json(ok({ done: '已取消', message: { id, role: 'assistant', text, cards: [], time: dayjs().format('MM-DD HH:mm') } }));
  } catch (e) { next(e); }
});

// 记入饮食
r.post('/meal-log', async (req, res, next) => {
  try {
    await ensureTables();
    const ctx = ctxOf(req);
    const b = req.body || {};
    const num = (v, max) => Math.max(0, Math.min(max, Number(v) || 0));
    const mealType = MEAL_NAMES[b.meal_type] ? b.meal_type : mealTypeByHour(dayjs().hour());
    const foods = (Array.isArray(b.foods) ? b.foods : []).slice(0, 12).map(f => ({ name: String(f.name || '').slice(0, 20), grams: num(f.grams, 5000), kcal: num(f.kcal, 5000) }));
    if (b.msg_id) {
      const m = await db.queryOne('SELECT cards FROM biz_ai_message WHERE id=? AND vip_id=?', [b.msg_id, ctx.vip]);
      const c = m && m.cards ? (JSON.parse(m.cards)[Number(b.card_idx) || 0] || {}) : {};
      if (c.done) throw new BizError('这餐已经记录过了');
    }
    await db.insert(
      `INSERT INTO biz_ai_meal_log (merchant_id, vip_id, meal_date, meal_type, image, foods, kcal, protein, carbs, fat, comment)
       VALUES (?,?,?,?,?,?,?,?,?,?,?)`,
      [ctx.mid, ctx.vip, dayjs().format('YYYY-MM-DD'), mealType, String(b.image || '').slice(0, 255), JSON.stringify(foods),
        Math.round(num(b.kcal, 10000)), num(b.protein, 1000), num(b.carbs, 2000), num(b.fat, 1000), String(b.comment || '').slice(0, 500)]);
    const meals = await getMeals(ctx);
    const done = `已记入${MEAL_NAMES[mealType]}`;
    await markCard(ctx, b.msg_id, Number(b.card_idx) || 0, { done, meal_type: mealType, meal_name: MEAL_NAMES[mealType] });
    const t = meals.daily_target;
    const text = `🍽 ${done}。今天已摄入约 ${meals.total.kcal} kcal${t ? `，建议总量约 ${t.kcal} kcal，${meals.remaining_kcal >= 0 ? `还可以吃约 ${meals.remaining_kcal} kcal` : `已超出约 ${-meals.remaining_kcal} kcal，晚点可以加一点有氧`}` : ''}。蛋白质 ${meals.total.protein_g}g${t ? ` / 目标 ${t.protein_g}g` : ''}。`;
    const id = await saveMsg(ctx, 'assistant', text);
    res.json(ok({ done, message: { id, role: 'assistant', text, cards: [], time: dayjs().format('MM-DD HH:mm') } }));
  } catch (e) { next(e); }
});

// 清空对话
r.post('/clear', async (req, res, next) => {
  try {
    await ensureTables();
    await db.exec('DELETE FROM biz_ai_message WHERE vip_id=?', [req.user.vip]);
    res.json(ok());
  } catch (e) { next(e); }
});

module.exports = r;
