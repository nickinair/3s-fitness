const express = require('express');
const dayjs = require('dayjs');
const db = require('../db');
const { ok, BizError, page, logAction, activateCard, sendCsv, cardDeduct, cardBlockReason } = require('../util');
const { staffAuth } = require('../middleware/auth');
const { checkBookingLimits } = require('./coaches');

const r = express.Router();

/* ---- 导出用中文字典 (与 web/admin/js/api.js dicts 保持一致) ---- */
const COURSE_STATUS = { 0: '停用', 1: '启用' };
const SYLLABUS_STATUS = { 1: '正常', 2: '已取消', 3: '已结课' };
const GROUP_BOOK_STATUS = { 0: '候补', 1: '已约', 2: '已核销', 3: '已取消', 4: '已爽约' };
const fmtMin = (v) => (v ? dayjs(v).format('YYYY-MM-DD HH:mm') : '');

// ============ 团课课程库 ============
r.get('/group-courses', staffAuth(), async (req, res, next) => {
  try {
    const exp = req.query.export === 'csv';
    const rows = await db.query('SELECT * FROM biz_course_group WHERE merchant_id=? ORDER BY id', [req.user.mid]);
    if (exp) {
      // card_scope 存的是卡类型ID数组, 导出时换成卡名 (与前端 cardName 展示一致)
      const cats = await db.query('SELECT id,title FROM biz_card_category WHERE merchant_id=?', [req.user.mid]);
      const catMap = new Map(cats.map(c => [c.id, c.title]));
      rows.forEach(x => {
        let ids = [];
        try { ids = JSON.parse(x.card_scope || '[]'); } catch (e) { ids = []; }
        if (!Array.isArray(ids)) ids = [];
        x.card_scope_label = ids.length ? ids.map(id => catMap.get(Number(id)) || `#${id}`).join(' / ') : '全部次卡/时间卡';
        x.difficulty_label = `${x.difficulty || 0}星`;
        x.status_label = COURSE_STATUS[x.status] || '';
      });
      return sendCsv(res, `团课课程_${dayjs().format('YYYYMMDD')}`, [
        ['id', '课程ID'], ['title', '课程名'], ['duration', '时长(分钟)'], ['difficulty_label', '难度'],
        ['deduct_num', '扣次'], ['card_scope_label', '可用卡范围'], ['tags', '标签'], ['status_label', '状态'],
      ], rows);
    }
    res.json(ok(rows));
  } catch (e) { next(e); }
});
r.post('/group-courses', staffAuth('admin', 'manager'), async (req, res, next) => {
  try {
    const b = req.body;
    const id = await db.insert(
      `INSERT INTO biz_course_group (merchant_id,club_id,title,duration,difficulty,deduct_num,card_scope,intro,tags,status)
       VALUES (?,?,?,?,?,?,?,?,?,?)`,
      [req.user.mid, req.clubId, b.title, b.duration || 60, b.difficulty || 1, b.deduct_num || 1,
        JSON.stringify(b.card_scope || []), b.intro || '', b.tags || '', b.status != null ? b.status : 1]);
    res.json(ok({ id }));
  } catch (e) { next(e); }
});
r.put('/group-courses/:id', staffAuth('admin', 'manager'), async (req, res, next) => {
  try {
    const b = req.body;
    await db.exec(
      `UPDATE biz_course_group SET title=?,duration=?,difficulty=?,deduct_num=?,card_scope=?,intro=?,tags=?,status=? WHERE id=? AND merchant_id=?`,
      [b.title, b.duration || 60, b.difficulty || 1, b.deduct_num || 1, JSON.stringify(b.card_scope || []),
        b.intro || '', b.tags || '', b.status != null ? b.status : 1, req.params.id, req.user.mid]);
    res.json(ok());
  } catch (e) { next(e); }
});

// ============ 教室 ============
r.get('/classrooms', staffAuth(), async (req, res, next) => {
  try {
    res.json(ok(await db.query('SELECT * FROM biz_syllabus_classroom WHERE merchant_id=? AND status=1 ORDER BY id', [req.user.mid])));
  } catch (e) { next(e); }
});
r.post('/classrooms', staffAuth('admin', 'manager'), async (req, res, next) => {
  try {
    const id = await db.insert('INSERT INTO biz_syllabus_classroom (merchant_id,club_id,title,capacity) VALUES (?,?,?,?)',
      [req.user.mid, req.clubId, req.body.title, req.body.capacity || 20]);
    res.json(ok({ id }));
  } catch (e) { next(e); }
});
r.put('/classrooms/:id', staffAuth('admin', 'manager'), async (req, res, next) => {
  try {
    await db.exec('UPDATE biz_syllabus_classroom SET title=?,capacity=?,status=? WHERE id=? AND merchant_id=?',
      [req.body.title, req.body.capacity, req.body.status != null ? req.body.status : 1, req.params.id, req.user.mid]);
    res.json(ok());
  } catch (e) { next(e); }
});

// ============ 排课 ============
// 周视图: GET /syllabus?from=YYYY-MM-DD&to=YYYY-MM-DD
r.get('/syllabus', staffAuth(), async (req, res, next) => {
  try {
    const { from, to, coach_id } = req.query;
    const exp = req.query.export === 'csv';
    const cond = ['merchant_id=?']; const params = [req.user.mid];
    if (req.clubScope) { cond.push('club_id=?'); params.push(req.clubScope); }
    if (from) { cond.push('start_time>=?'); params.push(`${from} 00:00:00`); }
    if (to) { cond.push('start_time<=?'); params.push(`${to} 23:59:59`); }
    if (coach_id) { cond.push('coach_id=?'); params.push(coach_id); }
    const rows = await db.query(`SELECT * FROM biz_syllabus_group WHERE ${cond.join(' AND ')} ORDER BY start_time`, params);
    if (exp) {
      rows.forEach(x => {
        x.start_label = fmtMin(x.start_time);
        x.end_label = fmtMin(x.end_time);
        x.booked_label = `${x.booked_count || 0}/${x.people_count || 0}`;
        x.status_label = SYLLABUS_STATUS[x.status] || '';
      });
      return sendCsv(res, `排课表_${dayjs().format('YYYYMMDD')}`, [
        ['id', '排课ID'], ['title', '课程'], ['coach_name', '教练'], ['classroom_name', '教室'],
        ['start_label', '开始时间'], ['end_label', '结束时间'], ['booked_label', '已约/容量'], ['status_label', '状态'],
      ], rows);
    }
    res.json(ok(rows));
  } catch (e) { next(e); }
});

// 排课详情（含预约名单）
r.get('/syllabus/:id', staffAuth(), async (req, res, next) => {
  try {
    const s = await db.queryOne('SELECT * FROM biz_syllabus_group WHERE id=? AND merchant_id=?', [req.params.id, req.user.mid]);
    if (!s) throw new BizError('排课不存在');
    const bookings = await db.query('SELECT * FROM biz_syllabus_subscribe_record WHERE syllabus_id=? ORDER BY FIELD(status,1,0,2,4,3), queue_no, id', [s.id]);
    res.json(ok({ syllabus: s, bookings }));
  } catch (e) { next(e); }
});

// 新增排课（单次）
r.post('/syllabus', staffAuth('admin', 'manager'), async (req, res, next) => {
  try {
    const b = req.body;
    const g = await db.queryOne('SELECT * FROM biz_course_group WHERE id=? AND merchant_id=?', [b.group_id, req.user.mid]);
    if (!g) throw new BizError('课程不存在');
    // 排课门店: 表单指定优先; 管理员在「全部门店」视图下必须指定
    let clubId = req.clubId;
    if (b.club_id) {
      const club = await db.queryOne('SELECT id FROM biz_club WHERE id=? AND merchant_id=? AND status=1', [b.club_id, req.user.mid]);
      if (!club) throw new BizError('门店不存在');
      clubId = club.id;
    } else if (!req.clubScope) throw new BizError('请选择排课门店');
    const coach = b.coach_id ? await db.queryOne('SELECT * FROM biz_club_coach WHERE id=?', [b.coach_id]) : null;
    const room = b.classroom_id ? await db.queryOne('SELECT * FROM biz_syllabus_classroom WHERE id=?', [b.classroom_id]) : null;
    const st = dayjs(b.start_time); const et = st.add(g.duration, 'minute');
    // 教室占用校验
    if (room) {
      const clash = await db.queryOne(
        `SELECT id,title FROM biz_syllabus_group WHERE classroom_id=? AND status=1 AND start_time<? AND end_time>?`,
        [room.id, et.format('YYYY-MM-DD HH:mm:ss'), st.format('YYYY-MM-DD HH:mm:ss')]);
      if (clash) throw new BizError(`教室在该时段已被「${clash.title}」占用`);
    }
    // 教练冲突校验
    if (coach) {
      const clash2 = await db.queryOne(
        `SELECT id,title FROM biz_syllabus_group WHERE coach_id=? AND status=1 AND start_time<? AND end_time>?`,
        [coach.id, et.format('YYYY-MM-DD HH:mm:ss'), st.format('YYYY-MM-DD HH:mm:ss')]);
      if (clash2) throw new BizError(`教练在该时段已有课程「${clash2.title}」`);
    }
    const id = await db.insert(
      `INSERT INTO biz_syllabus_group (merchant_id,club_id,group_id,title,coach_id,coach_name,classroom_id,classroom_name,
        start_time,end_time,people_count,lower_limit,deduct_num,is_vipuser_sub,self_cancel)
       VALUES (?,?,?,?,?,?,?,?,?,?,?,?,?,?,?)`,
      [req.user.mid, clubId, g.id, g.title, coach ? coach.id : 0, coach ? coach.realname : '',
        room ? room.id : 0, room ? room.title : '', st.format('YYYY-MM-DD HH:mm:ss'), et.format('YYYY-MM-DD HH:mm:ss'),
        b.people_count || (room ? room.capacity : 20), b.lower_limit || 0, b.deduct_num != null ? b.deduct_num : g.deduct_num,
        b.is_vipuser_sub || 0, b.self_cancel != null ? b.self_cancel : 1]);
    await logAction(req, '新增排课', `${g.title} ${st.format('MM-DD HH:mm')}`);
    res.json(ok({ id }));
  } catch (e) { next(e); }
});

// 编辑排课
r.put('/syllabus/:id', staffAuth('admin', 'manager'), async (req, res, next) => {
  try {
    const b = req.body;
    const s = await db.queryOne('SELECT * FROM biz_syllabus_group WHERE id=? AND merchant_id=?', [req.params.id, req.user.mid]);
    if (!s) throw new BizError('排课不存在');
    const coach = b.coach_id ? await db.queryOne('SELECT * FROM biz_club_coach WHERE id=?', [b.coach_id]) : null;
    const room = b.classroom_id ? await db.queryOne('SELECT * FROM biz_syllabus_classroom WHERE id=?', [b.classroom_id]) : null;
    await db.exec(
      `UPDATE biz_syllabus_group SET coach_id=?,coach_name=?,temporary_coach=?,classroom_id=?,classroom_name=?,
        start_time=?,end_time=?,people_count=?,lower_limit=?,hidden=? WHERE id=?`,
      [coach ? coach.id : s.coach_id, coach ? coach.realname : s.coach_name, b.temporary_coach || '',
        room ? room.id : s.classroom_id, room ? room.title : s.classroom_name,
        b.start_time || s.start_time, b.end_time || s.end_time, b.people_count || s.people_count,
        b.lower_limit != null ? b.lower_limit : s.lower_limit, b.hidden != null ? b.hidden : s.hidden, s.id]);
    res.json(ok());
  } catch (e) { next(e); }
});

// 取消排课（释放全部预约）
r.post('/syllabus/:id/cancel', staffAuth('admin', 'manager'), async (req, res, next) => {
  try {
    const s = await db.queryOne('SELECT * FROM biz_syllabus_group WHERE id=? AND merchant_id=?', [req.params.id, req.user.mid]);
    if (!s) throw new BizError('排课不存在');
    await db.tx(async (t) => {
      await t.exec('UPDATE biz_syllabus_group SET status=2 WHERE id=?', [s.id]);
      await t.exec(`UPDATE biz_syllabus_subscribe_record SET status=3, cancel_reason='课程取消' WHERE syllabus_id=? AND status IN (0,1)`, [s.id]);
    });
    await logAction(req, '取消排课', `${s.title} ${dayjs(s.start_time).format('MM-DD HH:mm')} ${req.body.reason || ''}`);
    res.json(ok());
  } catch (e) { next(e); }
});

// 复制上周排课到指定周
r.post('/syllabus/copy-week', staffAuth('admin', 'manager'), async (req, res, next) => {
  try {
    const { from_week_start, to_week_start } = req.body; // YYYY-MM-DD (周一)
    if (!from_week_start || !to_week_start) throw new BizError('请选择来源周与目标周');
    const rows = await db.query(
      `SELECT * FROM biz_syllabus_group WHERE merchant_id=?${req.clubScope ? ' AND club_id=?' : ''} AND status=1 AND start_time BETWEEN ? AND ?`,
      [req.user.mid, ...(req.clubScope ? [req.clubScope] : []), `${from_week_start} 00:00:00`, dayjs(from_week_start).add(6, 'day').format('YYYY-MM-DD 23:59:59')]);
    const diff = dayjs(to_week_start).diff(dayjs(from_week_start), 'day');
    let created = 0;
    for (const s of rows) {
      const st = dayjs(s.start_time).add(diff, 'day');
      const et = dayjs(s.end_time).add(diff, 'day');
      if (st.isBefore(dayjs())) continue;
      const dup = await db.queryOne('SELECT id FROM biz_syllabus_group WHERE club_id=? AND group_id=? AND start_time=? AND status=1',
        [s.club_id, s.group_id, st.format('YYYY-MM-DD HH:mm:ss')]);
      if (dup) continue;
      await db.insert(
        `INSERT INTO biz_syllabus_group (merchant_id,club_id,group_id,title,coach_id,coach_name,classroom_id,classroom_name,
          start_time,end_time,people_count,lower_limit,deduct_num,is_vipuser_sub,self_cancel)
         VALUES (?,?,?,?,?,?,?,?,?,?,?,?,?,?,?)`,
        [s.merchant_id, s.club_id, s.group_id, s.title, s.coach_id, s.coach_name, s.classroom_id, s.classroom_name,
          st.format('YYYY-MM-DD HH:mm:ss'), et.format('YYYY-MM-DD HH:mm:ss'), s.people_count, s.lower_limit,
          s.deduct_num, s.is_vipuser_sub, s.self_cancel]);
      created++;
    }
    await logAction(req, '复制排课', `${from_week_start} -> ${to_week_start} 共${created}节`);
    res.json(ok({ created }));
  } catch (e) { next(e); }
});

// ============ 团课预约（共享逻辑）============
async function createGroupBooking({ mid, clubId, syllabusId, vipId, cardId, userType }) {
  const s = await db.queryOne('SELECT * FROM biz_syllabus_group WHERE id=? AND merchant_id=?', [syllabusId, mid]);
  if (!s) throw new BizError('课程不存在');
  if (s.status !== 1) throw new BizError('该课程已取消或已结课');
  if (dayjs(s.start_time).isBefore(dayjs())) throw new BizError('该课程已开课，无法预约');
  const vip = await db.queryOne('SELECT * FROM biz_vip_user WHERE id=? AND merchant_id=?', [vipId, mid]);
  if (!vip) throw new BizError('会员不存在');
  if (vip.is_black) throw new BizError('该会员在黑名单中，禁止预约');
  const dup = await db.queryOne('SELECT id FROM biz_syllabus_subscribe_record WHERE syllabus_id=? AND vip_id=? AND status IN (0,1)', [s.id, vipId]);
  if (dup) throw new BizError('已预约该课程，请勿重复预约');
  const card = await db.queryOne('SELECT * FROM biz_member_card WHERE id=? AND vip_id=?', [cardId, vipId]);
  if (!card) throw new BizError('支付卡不存在');
  // 2026-09-21: 任何卡种都能约团课; 次卡/私教卡按课程扣次, 时间卡不扣次, 储值卡看余额
  const cardWhy = cardBlockReason(card);
  if (cardWhy) throw new BizError(`该卡${cardWhy}`);
  const deduct = cardDeduct(card.card_kind, s.deduct_num);
  if (deduct > 0 && card.left_counts < deduct) throw new BizError('该卡剩余次数不足');
  if (card.expire_time && dayjs(card.expire_time).isBefore(dayjs(s.start_time))) throw new BizError('该卡在开课前已到期');
  const cat = await db.queryOne('SELECT * FROM biz_card_category WHERE id=?', [card.card_type_id]);
  // 课程范围
  const gcourse = await db.queryOne('SELECT * FROM biz_course_group WHERE id=?', [s.group_id]);
  const scope = JSON.parse((gcourse && gcourse.card_scope) || '[]');
  if (scope.length && !scope.includes(card.card_type_id)) throw new BizError('该卡不适用于此课程');
  // 提前预约窗口: group_advance_range "开约提前天数,截止提前小时"
  if (cat && cat.group_advance_range) {
    const [openDays, closeHours] = cat.group_advance_range.split(',').map(Number);
    if (openDays > 0 && dayjs(s.start_time).diff(dayjs(), 'day', true) > openDays) throw new BizError(`该卡最多提前${openDays}天预约`);
    if (closeHours > 0 && dayjs(s.start_time).diff(dayjs(), 'hour', true) < closeHours) throw new BizError(`开课前${closeHours}小时停止预约`);
  }
  await checkBookingLimits(cat, card, vipId, dayjs(s.start_time).format('YYYY-MM-DD'), 'group');

  // 满员 -> 候补
  const [{ n: bookedN }] = await db.query('SELECT COUNT(*) n FROM biz_syllabus_subscribe_record WHERE syllabus_id=? AND status=1', [s.id]);
  let status = 1, queueNo = 0;
  if (bookedN >= s.people_count) {
    const [{ mq }] = await db.query('SELECT COALESCE(MAX(queue_no),0) mq FROM biz_syllabus_subscribe_record WHERE syllabus_id=? AND status=0', [s.id]);
    status = 0; queueNo = mq + 1;
  }
  const id = await db.insert(
    `INSERT INTO biz_syllabus_subscribe_record (merchant_id,club_id,syllabus_id,group_id,syllabus_title,vip_id,realname,phone,
      card_kind,card_id,card_type_name,card_deduct_num,class_start_time,class_end_time,user_type,queue_no,status)
     VALUES (?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?)`,
    [mid, s.club_id, s.id, s.group_id, s.title, vipId, vip.realname, vip.phone, card.card_kind, card.id, card.card_type_name,
      deduct, s.start_time, s.end_time, userType, queueNo, status]);
  await db.exec('UPDATE biz_syllabus_group SET booked_count=(SELECT COUNT(*) FROM biz_syllabus_subscribe_record WHERE syllabus_id=? AND status=1) WHERE id=?', [s.id, s.id]);
  return { id, status, queue_no: queueNo, waitlist: status === 0 };
}

// 取消团课预约（共享）: 候补转正
async function cancelGroupBooking(bookingId, { byMember, reason }) {
  const bk = await db.queryOne('SELECT * FROM biz_syllabus_subscribe_record WHERE id=?', [bookingId]);
  if (!bk) throw new BizError('预约不存在');
  if (![0, 1].includes(bk.status)) throw new BizError('该预约不可取消');
  const s = await db.queryOne('SELECT * FROM biz_syllabus_group WHERE id=?', [bk.syllabus_id]);
  if (byMember && s && !s.self_cancel) throw new BizError('该课程不支持自主取消，请联系前台');
  let penalty = null;
  // 超时取消: 开课前 cancel_deadline_hours 内取消 → 次卡扣次留痕
  if (bk.status === 1 && s) {
    const card = await db.queryOne('SELECT * FROM biz_member_card WHERE id=?', [bk.card_id]);
    const cat = card ? await db.queryOne('SELECT * FROM biz_card_category WHERE id=?', [card.card_type_id]) : null;
    const deadline = (cat && cat.cancel_deadline_hours) || 0;
    const withinDeadline = deadline > 0 && dayjs(s.start_time).diff(dayjs(), 'hour', true) < deadline;
    if (withinDeadline && card && bk.card_deduct_num > 0) {
      await db.tx(async (t) => {
        await t.exec('UPDATE biz_member_card SET left_counts=GREATEST(left_counts-?,0) WHERE id=?', [bk.card_deduct_num, card.id]);
        await t.insert(
          `INSERT INTO biz_card_spend (merchant_id,club_id,card_id,vip_id,card_kind,card_type_name,scene,costs,unit_price,spend_money,
            syllabus_id,realname,phone,remark) VALUES (?,?,?,?,?,?,5,?,?,?,?,?,?,?)`,
          [bk.merchant_id, card.club_id, card.id, bk.vip_id, card.card_kind, card.card_type_name, bk.card_deduct_num,
            card.unit_price, +(bk.card_deduct_num * Number(card.unit_price)).toFixed(2), bk.syllabus_id, bk.realname, bk.phone,
            `开课前${deadline}小时内取消，按规则扣次`]);
      });
      penalty = `开课前${deadline}小时内取消，已扣${bk.card_deduct_num}次`;
    }
  }
  await db.exec('UPDATE biz_syllabus_subscribe_record SET status=3, cancel_reason=? WHERE id=?', [reason || (penalty || '用户取消'), bk.id]);
  // 候补转正
  if (bk.status === 1) {
    const next = await db.queryOne('SELECT * FROM biz_syllabus_subscribe_record WHERE syllabus_id=? AND status=0 ORDER BY queue_no LIMIT 1', [bk.syllabus_id]);
    if (next) await db.exec('UPDATE biz_syllabus_subscribe_record SET status=1, queue_no=0 WHERE id=?', [next.id]);
  }
  await db.exec('UPDATE biz_syllabus_group SET booked_count=(SELECT COUNT(*) FROM biz_syllabus_subscribe_record WHERE syllabus_id=? AND status=1) WHERE id=?', [bk.syllabus_id, bk.syllabus_id]);
  return { penalty };
}

// 员工代约
r.post('/syllabus/:id/book', staffAuth(), async (req, res, next) => {
  try {
    const result = await createGroupBooking({
      mid: req.user.mid, clubId: req.clubId, syllabusId: req.params.id,
      vipId: req.body.vip_id, cardId: req.body.card_id, userType: 2,
    });
    await logAction(req, '团课代约', `课程#${req.params.id} 会员#${req.body.vip_id}`);
    res.json(ok(result));
  } catch (e) { next(e); }
});

// 员工取消
r.post('/syllabus-bookings/:id/cancel', staffAuth(), async (req, res, next) => {
  try {
    res.json(ok(await cancelGroupBooking(req.params.id, { byMember: false, reason: req.body.reason || `${req.user.name}取消` })));
  } catch (e) { next(e); }
});

// 到课核销（扫码/点到）: 扣次+写耗课流水
r.post('/syllabus-bookings/:id/checkin', staffAuth(), async (req, res, next) => {
  try {
    const bk = await db.queryOne('SELECT * FROM biz_syllabus_subscribe_record WHERE id=? AND merchant_id=?', [req.params.id, req.user.mid]);
    if (!bk) throw new BizError('预约不存在');
    if (bk.status === 2) throw new BizError('已核销，请勿重复操作');
    if (![1].includes(bk.status)) throw new BizError('仅已约状态可核销（候补请先转正）');
    let card = await db.queryOne('SELECT * FROM biz_member_card WHERE id=?', [bk.card_id]);
    if (card && card.status === 0) card = await activateCard(card.id);
    const s = await db.queryOne('SELECT * FROM biz_syllabus_group WHERE id=?', [bk.syllabus_id]);
    await db.tx(async (t) => {
      if (bk.card_deduct_num > 0 && card) {
        if (card.left_counts < bk.card_deduct_num) throw new BizError('卡剩余次数不足，无法核销');
        await t.exec('UPDATE biz_member_card SET left_counts=left_counts-? WHERE id=?', [bk.card_deduct_num, card.id]);
        // 流水归属跟随卡(开卡门店)
        await t.insert(
          `INSERT INTO biz_card_spend (merchant_id,club_id,card_id,vip_id,card_kind,card_type_name,scene,costs,unit_price,spend_money,
            syllabus_id,coach_id,coach_name,ope_user_id,ope_username,realname,phone)
           VALUES (?,?,?,?,?,?,3,?,?,?,?,?,?,?,?,?,?)`,
          [bk.merchant_id, card.club_id, card.id, bk.vip_id, card.card_kind, card.card_type_name, bk.card_deduct_num,
            card.unit_price, +(bk.card_deduct_num * Number(card.unit_price)).toFixed(2), bk.syllabus_id,
            s ? s.coach_id : 0, s ? s.coach_name : '', req.user.uid, req.user.name, bk.realname, bk.phone]);
      }
      await t.exec('UPDATE biz_syllabus_subscribe_record SET status=2 WHERE id=?', [bk.id]);
    });
    res.json(ok());
  } catch (e) { next(e); }
});

// 课后结算: 未到 -> 爽约
r.post('/syllabus/:id/settle', staffAuth(), async (req, res, next) => {
  try {
    const s = await db.queryOne('SELECT * FROM biz_syllabus_group WHERE id=? AND merchant_id=?', [req.params.id, req.user.mid]);
    if (!s) throw new BizError('排课不存在');
    if (dayjs(s.end_time).isAfter(dayjs())) throw new BizError('课程尚未结束');
    const rst = await db.exec(`UPDATE biz_syllabus_subscribe_record SET status=4 WHERE syllabus_id=? AND status=1`, [s.id]);
    await db.exec(`UPDATE biz_syllabus_subscribe_record SET status=3, cancel_reason='候补未转正' WHERE syllabus_id=? AND status=0`, [s.id]);
    await db.exec('UPDATE biz_syllabus_group SET status=3 WHERE id=?', [s.id]);
    await logAction(req, '团课结算', `${s.title} 爽约${rst.affectedRows}人`);
    res.json(ok({ noshow: rst.affectedRows }));
  } catch (e) { next(e); }
});

// 团课预约记录列表
r.get('/syllabus-bookings', staffAuth(), async (req, res, next) => {
  try {
    const { p, size, offset } = page(req);
    const { syllabus_id, vip_id, status, date, keyword } = req.query;
    const exp = req.query.export === 'csv';
    const cond = ['merchant_id=?']; const params = [req.user.mid];
    if (syllabus_id) { cond.push('syllabus_id=?'); params.push(syllabus_id); }
    if (vip_id) { cond.push('vip_id=?'); params.push(vip_id); }
    if (status != null && status !== '') { cond.push('status=?'); params.push(status); }
    if (date) { cond.push('DATE(class_start_time)=?'); params.push(date); }
    if (keyword) { cond.push('(realname LIKE ? OR phone LIKE ?)'); params.push(`%${keyword}%`, `%${keyword}%`); }
    const where = cond.join(' AND ');
    const [{ total }] = await db.query(`SELECT COUNT(*) total FROM biz_syllabus_subscribe_record WHERE ${where}`, params);
    // 预约表不冗余教练, 导出时从排课表带出
    const sel = exp ? 'b.*, (SELECT g.coach_name FROM biz_syllabus_group g WHERE g.id=b.syllabus_id) coach_name' : 'b.*';
    const rows = await db.query(`SELECT ${sel} FROM biz_syllabus_subscribe_record b WHERE ${where} ORDER BY b.id DESC ${exp ? '' : 'LIMIT ? OFFSET ?'}`,
      exp ? params : [...params, size, offset]);
    if (exp) {
      rows.forEach(x => {
        x.class_start_label = fmtMin(x.class_start_time);
        x.status_label = GROUP_BOOK_STATUS[x.status] || '';
        x.insert_time_label = fmtMin(x.insert_time);
      });
      return sendCsv(res, `团课预约_${dayjs().format('YYYYMMDD')}`, [
        ['id', '预约ID'], ['realname', '会员'], ['phone', '手机号'], ['syllabus_title', '课程'],
        ['class_start_label', '上课时间'], ['coach_name', '教练'], ['card_type_name', '使用卡'],
        ['status_label', '预约状态'], ['insert_time_label', '预约时间'],
      ], rows);
    }
    res.json(ok({ list: rows, total }));
  } catch (e) { next(e); }
});

module.exports = r;
module.exports.createGroupBooking = createGroupBooking;
module.exports.cancelGroupBooking = cancelGroupBooking;
