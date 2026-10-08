const express = require('express');
const dayjs = require('dayjs');
const db = require('../db');
const { ok, BizError, now, lifecycleTick, activateCard, PAY_METHODS, cardBlockReason } = require('../util');
const { memberAuth } = require('../middleware/auth');
const { createPtBooking, finishPtBooking, getCoachSlots, getCoachBusy, getMemberBusy, checkTimeRange, parseOpen } = require('./coaches');
const { createGroupBooking, cancelGroupBooking } = require('./group');
const { doCheckin } = require('./checkin');

const r = express.Router();
r.use(memberAuth);

// 会员可选门店 + 默认门店(最近一张有效卡的开卡店, 否则第一家)
async function clubOptions(mid, vipId) {
  const clubs = await db.query('SELECT id, name, address, open_time FROM biz_club WHERE merchant_id=? AND status=1 ORDER BY sort, id', [mid]);
  // 默认选中列表第一个门店(按门店排序 sort), 由后台「门店信息」的排序字段控制
  const def = clubs[0] ? clubs[0].id : 0;
  return { clubs, default_club_id: def };
}

// ---- 首页: 门店 + banner + 我的概览 ----
r.get('/home', async (req, res, next) => {
  try {
    await lifecycleTick();
    const mid = req.user.mid;
    const clubs = await db.query('SELECT id,name,address,phone,intro,open_time FROM biz_club WHERE merchant_id=? AND status=1 ORDER BY sort, id', [mid]);
    const banners = await db.query('SELECT * FROM biz_club_banner WHERE merchant_id=? AND status=1 ORDER BY sort', [mid]);
    const vip = await db.queryOne('SELECT id,realname,nickname,phone,avatar,points,expire_status,expire_time,is_black FROM biz_vip_user WHERE id=?', [req.user.vip]);
    const cards = await db.query(
      `SELECT id,card_kind,card_type_name,counts,left_counts,left_money,expire_time,status FROM biz_member_card
       WHERE vip_id=? AND status IN (0,1,3) ORDER BY id DESC`, [req.user.vip]);
    // 近一周(今天起 7 天内)的待上课程数
    const [{ n: upcoming }] = await db.query(
      `SELECT (SELECT COUNT(*) FROM biz_ptrain_bespeak_record WHERE vip_id=? AND status IN (0,1)
                 AND CONCAT(\`date\`,' ',from_time) >= NOW() AND \`date\` < DATE_ADD(CURDATE(), INTERVAL 7 DAY))
            + (SELECT COUNT(*) FROM biz_syllabus_subscribe_record WHERE vip_id=? AND status IN (0,1)
                 AND class_start_time >= NOW() AND class_start_time < DATE_ADD(CURDATE(), INTERVAL 7 DAY)) n`,
      [req.user.vip, req.user.vip]);
    // 下一节课(私教/团课取更早的一节)
    const nextRows = await db.query(
      `(SELECT CONCAT(\`date\`,' ',from_time) AS start_time, course_title AS title, coach_name, 'pt' AS kind
          FROM biz_ptrain_bespeak_record
         WHERE vip_id=? AND status IN (0,1) AND CONCAT(\`date\`,' ',from_time) >= NOW()
         ORDER BY start_time LIMIT 1)
       UNION ALL
       (SELECT class_start_time AS start_time, syllabus_title AS title, '' AS coach_name, 'group' AS kind
          FROM biz_syllabus_subscribe_record
         WHERE vip_id=? AND status IN (0,1) AND class_start_time >= NOW()
         ORDER BY class_start_time LIMIT 1)
       ORDER BY start_time LIMIT 1`, [req.user.vip, req.user.vip]);
    const nextLesson = nextRows[0] || null;
    const [{ n: pendingConfirm }] = await db.query(
      'SELECT COUNT(*) n FROM biz_ptrain_bespeak_record WHERE vip_id=? AND confirm_status=1 AND status=1', [req.user.vip]);
    const [{ n: pendingContract }] = await db.query(
      'SELECT COUNT(*) n FROM biz_club_contract WHERE vip_id=? AND hidden=0 AND sign_status=0', [req.user.vip]);
    // 教练推送后还没打开过的训练计划
    const [{ n: newPlan }] = await db.query(
      'SELECT COUNT(*) n FROM biz_training_plan WHERE vip_id=? AND status=1 AND pushed=1 AND viewed_time IS NULL', [req.user.vip]);
    const notices = await db.query('SELECT id,title,content,insert_time FROM sys_notice WHERE scope=2 AND merchant_id=? AND status=1 ORDER BY id DESC LIMIT 5', [mid]);
    res.json(ok({ clubs, banners, vip, cards, upcoming, nextLesson, pendingConfirm, pendingContract, newPlan, notices }));
  } catch (e) { next(e); }
});

// ---- 在线买卡 ----
r.get('/card-categories', async (req, res, next) => {
  try {
    const rows = await db.query(
      `SELECT id,card_kind,title,intro,expire_days,total_counts,price,original_price,gift_money,open_card_mode,cover_img
       FROM biz_card_category WHERE merchant_id=? AND status=1 AND online_sale=1 ORDER BY sort, id`, [req.user.mid]);
    res.json(ok(rows));
  } catch (e) { next(e); }
});

// 购卡意向（线下收款模式: 会员端只做选择, 提交意向后由门店线下收款开卡 — 2026-09-07需求会）
r.post('/card-intents', async (req, res, next) => {
  try {
    const cat = await db.queryOne('SELECT * FROM biz_card_category WHERE id=? AND merchant_id=? AND status=1 AND online_sale=1', [req.body.card_type_id, req.user.mid]);
    if (!cat) throw new BizError('该卡暂不可选购');
    const vip = await db.queryOne('SELECT * FROM biz_vip_user WHERE id=?', [req.user.vip]);
    if (vip.is_black) throw new BizError('账号异常，请联系门店');
    const dup = await db.queryOne('SELECT id FROM biz_card_intent WHERE vip_id=? AND card_type_id=? AND status=0', [vip.id, cat.id]);
    if (dup) throw new BizError('您已提交过该卡的购卡意向，工作人员会尽快联系您');
    const id = await db.insert(
      `INSERT INTO biz_card_intent (merchant_id,club_id,vip_id,realname,phone,card_type_id,card_type_name,price,remark)
       VALUES (?,?,?,?,?,?,?,?,?)`,
      [req.user.mid, req.clubId, vip.id, vip.realname || vip.nickname, vip.phone, cat.id, cat.title, cat.price, req.body.remark || '']);
    await require('../sms').send(req.user.mid, {
      vipId: vip.id, realname: vip.realname, phone: vip.phone, scene: 'intent',
      params: { name: vip.realname || vip.nickname, card: cat.title },
    });
    res.json(ok({ id, msg: '意向已提交，工作人员将尽快与您联系，也可直接到店办理' }));
  } catch (e) { next(e); }
});

r.get('/my-card-intents', async (req, res, next) => {
  try {
    res.json(ok(await db.query('SELECT * FROM biz_card_intent WHERE vip_id=? ORDER BY id DESC LIMIT 20', [req.user.vip])));
  } catch (e) { next(e); }
});

// ---- 里程碑（时间线 + 身体数据对比） ----
r.get('/milestones', async (req, res, next) => {
  try {
    const milestones = await db.query('SELECT * FROM biz_milestone WHERE vip_id=? ORDER BY type, node_value', [req.user.vip]);
    const bodyRecords = await db.query('SELECT * FROM biz_body_record WHERE vip_id=? ORDER BY record_date, id', [req.user.vip]);
    const [{ totalLessons }] = await db.query('SELECT COALESCE(SUM(costs),0) totalLessons FROM biz_ptrain_record WHERE vip_id=? AND type IN (1,3)', [req.user.vip]);
    res.json(ok({ milestones, bodyRecords, totalLessons: Number(totalLessons) }));
  } catch (e) { next(e); }
});

// ---- 我的训练计划 ----
r.get('/training-plans', async (req, res, next) => {
  try {
    const rows = await db.query(
      `SELECT id,coach_name,title,plan_date,note,pushed,insert_time,
              COALESCE(JSON_LENGTH(items),0) item_count
       FROM biz_training_plan WHERE vip_id=? AND status=1 ORDER BY id DESC LIMIT 50`, [req.user.vip]);
    res.json(ok(rows));
  } catch (e) { next(e); }
});
r.get('/training-plans/:id', async (req, res, next) => {
  try {
    const plan = await db.queryOne('SELECT * FROM biz_training_plan WHERE id=? AND vip_id=? AND status=1', [req.params.id, req.user.vip]);
    if (!plan) throw new BizError('计划不存在');
    // 首次打开即标记已读, 首页入口的红点随之消掉
    if (!plan.viewed_time) await db.exec('UPDATE biz_training_plan SET viewed_time=NOW() WHERE id=?', [plan.id]);
    res.json(ok(plan));
  } catch (e) { next(e); }
});

// ---- 我的卡 ----
r.get('/my-cards', async (req, res, next) => {
  try {
    await lifecycleTick();
    const rows = await db.query('SELECT * FROM biz_member_card WHERE vip_id=? ORDER BY FIELD(status,1,0,3,2,4,5), id DESC', [req.user.vip]);
    res.json(ok(rows));
  } catch (e) { next(e); }
});
r.get('/my-cards/:id', async (req, res, next) => {
  try {
    const card = await db.queryOne('SELECT * FROM biz_member_card WHERE id=? AND vip_id=?', [req.params.id, req.user.vip]);
    if (!card) throw new BizError('会员卡不存在');
    const recharges = await db.query('SELECT id,type,actual_money,counts,expire_days,pay_method,insert_time FROM biz_card_recharge WHERE card_id=? ORDER BY id DESC', [card.id]);
    const spends = await db.query('SELECT id,scene,costs,spend_money,coach_name,remark,insert_time FROM biz_card_spend WHERE card_id=? ORDER BY id DESC LIMIT 50', [card.id]);
    res.json(ok({ card, recharges, spends }));
  } catch (e) { next(e); }
});

// ---- 团课课表 ----
r.get('/schedule', async (req, res, next) => {
  try {
    const date = req.query.date || dayjs().format('YYYY-MM-DD');
    const rows = await db.query(
      `SELECT s.*, g.difficulty, g.tags, g.intro,
         (SELECT COUNT(*) FROM biz_syllabus_subscribe_record r WHERE r.syllabus_id=s.id AND r.vip_id=? AND r.status IN (0,1)) my_booked,
         c.name club_name
       FROM biz_syllabus_group s LEFT JOIN biz_course_group g ON g.id=s.group_id LEFT JOIN biz_club c ON c.id=s.club_id
       WHERE s.merchant_id=? AND DATE(s.start_time)=? AND s.hidden=0 AND s.status IN (1,3)
       ORDER BY s.start_time`, [req.user.vip, req.user.mid, date]);
    res.json(ok(rows));
  } catch (e) { next(e); }
});

// 可用于某课程的我的卡
r.get('/schedule/:id/available-cards', async (req, res, next) => {
  try {
    const s = await db.queryOne('SELECT * FROM biz_syllabus_group WHERE id=?', [req.params.id]);
    if (!s) throw new BizError('课程不存在');
    const g = await db.queryOne('SELECT * FROM biz_course_group WHERE id=?', [s.group_id]);
    const scope = JSON.parse((g && g.card_scope) || '[]');
    const cards = await db.query(
      `SELECT id,card_kind,card_type_id,card_type_name,counts,left_counts,left_money,expire_time,status FROM biz_member_card
       WHERE vip_id=? ORDER BY FIELD(status,1,0,3,2,4,5), FIELD(card_kind,1,2,4,3), expire_time DESC`, [req.user.vip]);
    cards.forEach(c => {
      let reason = cardBlockReason(c);
      if (!reason && scope.length && !scope.includes(c.card_type_id)) reason = '不支持「' + (g ? g.title : '该课程') + '」';
      if (!reason && c.expire_time && dayjs(c.expire_time).isBefore(dayjs(s.start_time))) reason = '开课前已到期';
      c.usable = !reason; c.reason = reason;
    });
    res.json(ok(cards));
  } catch (e) { next(e); }
});

// 团课预约
r.post('/schedule/:id/book', async (req, res, next) => {
  try {
    const result = await createGroupBooking({
      mid: req.user.mid, clubId: req.clubId, syllabusId: req.params.id,
      vipId: req.user.vip, cardId: req.body.card_id, userType: 1,
    });
    res.json(ok(result));
  } catch (e) { next(e); }
});

// ---- 教练团队（含课时单价与主/副教练标识, 引导会员自助约课）----
r.get('/coaches', async (req, res, next) => {
  try {
    const rows = await db.query(
      `SELECT id,realname,nickname,avatar,cover,good_at,\`desc\`,detail,lesson_price,
        (SELECT COUNT(*) FROM biz_ptrain_record p WHERE p.coach_id=biz_club_coach.id) lesson_total
       FROM biz_club_coach WHERE merchant_id=? AND status=1 ORDER BY sort`, [req.user.mid]);
    const vip = await db.queryOne('SELECT coach_id, sub_coach_id FROM biz_vip_user WHERE id=?', [req.user.vip]);
    res.json(ok({ list: rows, my_coach_id: vip ? vip.coach_id : 0, my_sub_coach_id: vip ? vip.sub_coach_id : 0 }));
  } catch (e) { next(e); }
});

// ---- 我的体测数据 ----
r.get('/body-records', async (req, res, next) => {
  try {
    res.json(ok(await db.query('SELECT * FROM biz_body_record WHERE vip_id=? ORDER BY record_date, id', [req.user.vip])));
  } catch (e) { next(e); }
});

r.get('/coaches/:id', async (req, res, next) => {
  try {
    const coach = await db.queryOne('SELECT * FROM biz_club_coach WHERE id=? AND merchant_id=?', [req.params.id, req.user.mid]);
    if (!coach) throw new BizError('教练不存在');
    const courses = await db.query('SELECT * FROM biz_ptrain_course WHERE merchant_id=? AND status=1 ORDER BY sort', [req.user.mid]);
    const filtered = courses.filter(c => {
      const ids = JSON.parse(c.coach_ids || '[]');
      return !ids.length || ids.includes(coach.id);
    });
    res.json(ok({ coach, courses: filtered, ...(await clubOptions(req.user.mid, req.user.vip)) }));
  } catch (e) { next(e); }
});

// 私教课表: 指定日期所有在职教练的可约时段 + 我当天的私教预约 (会员端「课表-私教课」tab)
r.get('/pt-schedule', async (req, res, next) => {
  try {
    const date = req.query.date || dayjs().format('YYYY-MM-DD');
    const vip = await db.queryOne('SELECT coach_id, sub_coach_id FROM biz_vip_user WHERE id=?', [req.user.vip]);
    const coaches = await db.query(
      `SELECT id, realname, good_at, lesson_price FROM biz_club_coach WHERE merchant_id=? AND status=1 ORDER BY sort, id`, [req.user.mid]);
    const courses = await db.query(
      'SELECT id, title, duration, people_count, coach_ids, intro FROM biz_ptrain_course WHERE merchant_id=? AND status=1 ORDER BY sort, id', [req.user.mid]);
    const list = [];
    for (const c of coaches) {
      const cs = courses.filter(x => { const ids = JSON.parse(x.coach_ids || '[]'); return !ids.length || ids.includes(c.id); });
      if (!cs.length) continue; // 不授任何私教课的教练不展示
      const busy = await getCoachBusy(c.id, date);
      list.push({
        ...c, is_main: vip && vip.coach_id === c.id, is_sub: vip && vip.sub_coach_id === c.id,
        courses: cs.map(({ coach_ids, ...rest }) => rest), busy,
      });
    }
    list.sort((a, b) => (b.is_main - a.is_main) || (b.is_sub - a.is_sub));
    const mine = await db.query(
      `SELECT b.id, b.coach_id, b.coach_name, b.course_title, b.from_time, b.to_time, b.status, b.confirm_status, c.name club_name
       FROM biz_ptrain_bespeak_record b LEFT JOIN biz_club c ON c.id=b.club_id
       WHERE b.vip_id=? AND b.\`date\`=? AND b.status IN (0,1,3) ORDER BY b.from_time`, [req.user.vip, date]);
    const opts = await clubOptions(req.user.mid, req.user.vip);
    const myBusy = await getMemberBusy(req.user.vip, date);
    // 每位教练在默认门店营业时间内还能约的起始时刻数(15分钟刻度, 60分钟课)
    const defClub = opts.clubs.find(x => x.id === opts.default_club_id) || opts.clubs[0] || {};
    const { open, close } = parseOpen(defClub.open_time);
    for (const c of list) {
      let free = 0;
      for (let m = open; m + 60 <= close; m += 15) {
        const hh = `${String(Math.floor(m / 60)).padStart(2, '0')}:${String(m % 60).padStart(2, '0')}`;
        if (!checkTimeRange({ date, fromTime: hh, duration: 60, openTime: defClub.open_time, coachBusy: c.busy, memberBusy: [] })) free++;
      }
      c.free = free;
    }
    res.json(ok({ date, coaches: list, mine, my_busy: myBusy, ...opts }));
  } catch (e) { next(e); }
});

// 时间轴: 教练当天占用 + 我当天已有的课 (约课时间轴交互用)
r.get('/coaches/:id/busy', async (req, res, next) => {
  try {
    const date = req.query.date || dayjs().format('YYYY-MM-DD');
    res.json(ok({ date, busy: await getCoachBusy(Number(req.params.id), date), my_busy: await getMemberBusy(req.user.vip, date) }));
  } catch (e) { next(e); }
});

// 教练可约时段
r.get('/coaches/:id/slots', async (req, res, next) => {
  try {
    const duration = Number(req.query.duration || 60);
    res.json(ok(await getCoachSlots(Number(req.params.id), req.query.date, duration)));
  } catch (e) { next(e); }
});

// 我的可支付私教卡
r.get('/my-pt-cards', async (req, res, next) => {
  try {
    const courseId = req.query.course_id;
    let scope = []; let courseTitle = '';
    if (courseId) {
      const course = await db.queryOne('SELECT title, card_scope FROM biz_ptrain_course WHERE id=?', [courseId]);
      scope = JSON.parse((course && course.card_scope) || '[]');
      courseTitle = (course && course.title) || '';
    }
    // 任何卡种都能约私教课; 不可用的也返回, 带 reason 让会员知道为什么约不了
    const cards = await db.query(
      `SELECT id,card_type_id,card_type_name,card_kind,counts,left_counts,left_money,expire_time,status FROM biz_member_card
       WHERE vip_id=? ORDER BY FIELD(status,1,0,3,2,4,5), FIELD(card_kind,4,1,2,3), expire_time DESC`, [req.user.vip]);
    cards.forEach(c => {
      let reason = cardBlockReason(c);
      if (!reason && scope.length && !scope.includes(c.card_type_id)) reason = '不支持「' + courseTitle + '」';
      c.usable = !reason; c.reason = reason;
    });
    res.json(ok(cards));
  } catch (e) { next(e); }
});

// 私教预约（会员自约 → 待教练确认）
r.post('/pt-bookings', async (req, res, next) => {
  try {
    const b = req.body;
    const result = await createPtBooking({
      mid: req.user.mid, clubId: b.club_id, vipId: req.user.vip, coachId: b.coach_id, courseId: b.course_id,
      date: b.date, fromTime: b.from_time, cardId: b.card_id, recordType: 1, remark: '', autoConfirm: false,
    });
    res.json(ok(result));
  } catch (e) { next(e); }
});

// ---- 我的预约 ----
r.get('/my-bookings', async (req, res, next) => {
  try {
    const pt = await db.query('SELECT * FROM biz_ptrain_bespeak_record WHERE vip_id=? ORDER BY `date` DESC, from_time DESC LIMIT 50', [req.user.vip]);
    const group = await db.query('SELECT * FROM biz_syllabus_subscribe_record WHERE vip_id=? ORDER BY class_start_time DESC LIMIT 50', [req.user.vip]);
    res.json(ok({ pt, group }));
  } catch (e) { next(e); }
});

// 取消私教预约
r.post('/pt-bookings/:id/cancel', async (req, res, next) => {
  try {
    const bk = await db.queryOne('SELECT * FROM biz_ptrain_bespeak_record WHERE id=? AND vip_id=?', [req.params.id, req.user.vip]);
    if (!bk) throw new BizError('预约不存在');
    if (![0, 1].includes(bk.status)) throw new BizError('该预约不可取消');
    // 私教取消时限
    const card = await db.queryOne('SELECT * FROM biz_member_card WHERE id=?', [bk.card_id]);
    const cat = card ? await db.queryOne('SELECT cancel_deadline_hours FROM biz_card_category WHERE id=?', [card.card_type_id]) : null;
    const deadline = (cat && cat.cancel_deadline_hours) || 0;
    const start = dayjs(`${dayjs(bk.date).format('YYYY-MM-DD')} ${bk.from_time}`);
    if (deadline > 0 && start.diff(dayjs(), 'hour', true) < deadline && start.isAfter(dayjs())) {
      throw new BizError(`开课前${deadline}小时内不可自行取消，请联系教练`);
    }
    await db.exec("UPDATE biz_ptrain_bespeak_record SET status=2, cancel_reason='会员取消' WHERE id=?", [bk.id]);
    res.json(ok());
  } catch (e) { next(e); }
});

// 取消团课预约
r.post('/group-bookings/:id/cancel', async (req, res, next) => {
  try {
    const bk = await db.queryOne('SELECT id,vip_id FROM biz_syllabus_subscribe_record WHERE id=? AND vip_id=?', [req.params.id, req.user.vip]);
    if (!bk) throw new BizError('预约不存在');
    res.json(ok(await cancelGroupBooking(bk.id, { byMember: true, reason: '会员取消' })));
  } catch (e) { next(e); }
});

// ---- 消课确认（学员扫码/点击确认）----
r.get('/pending-confirms', async (req, res, next) => {
  try {
    const rows = await db.query(
      'SELECT * FROM biz_ptrain_bespeak_record WHERE vip_id=? AND confirm_status=1 AND status=1 ORDER BY `date` DESC', [req.user.vip]);
    res.json(ok(rows));
  } catch (e) { next(e); }
});
r.post('/pt-bookings/:id/confirm-finish', async (req, res, next) => {
  try {
    const bk = await db.queryOne('SELECT * FROM biz_ptrain_bespeak_record WHERE id=? AND vip_id=?', [req.params.id, req.user.vip]);
    if (!bk) throw new BizError('预约不存在');
    if (bk.confirm_status !== 1) throw new BizError('该课程未发起消课');
    const result = await finishPtBooking(bk.id, { receptionId: 0, receptionRemark: '学员确认' });
    res.json(ok(result));
  } catch (e) { next(e); }
});

// ---- 自助签到（模拟扫门店二维码）----
r.post('/checkin', async (req, res, next) => {
  try {
    const result = await doCheckin({
      mid: req.user.mid, clubId: req.clubId, vipId: req.user.vip, cardId: req.body.card_id || null,
      opeUserId: 0, opeUsername: '会员自助', port: 2, storeFee: 30,
    });
    res.json(ok(result));
  } catch (e) { next(e); }
});
r.get('/my-checkins', async (req, res, next) => {
  try {
    res.json(ok(await db.query('SELECT * FROM biz_checkin_record WHERE vip_id=? ORDER BY id DESC LIMIT 50', [req.user.vip])));
  } catch (e) { next(e); }
});

// ---- 我的合同 ----
r.get('/my-contracts', async (req, res, next) => {
  try {
    const rows = await db.query(
      'SELECT id,contract_num,title,sign_status,sign_time,insert_time FROM biz_club_contract WHERE vip_id=? AND hidden=0 ORDER BY id DESC', [req.user.vip]);
    res.json(ok(rows));
  } catch (e) { next(e); }
});
r.get('/my-contracts/:id', async (req, res, next) => {
  try {
    const c = await db.queryOne('SELECT * FROM biz_club_contract WHERE id=? AND vip_id=?', [req.params.id, req.user.vip]);
    if (!c) throw new BizError('合同不存在');
    res.json(ok(c));
  } catch (e) { next(e); }
});
// 签署（手写签名 base64）
r.post('/my-contracts/:id/sign', async (req, res, next) => {
  try {
    const c = await db.queryOne('SELECT * FROM biz_club_contract WHERE id=? AND vip_id=?', [req.params.id, req.user.vip]);
    if (!c) throw new BizError('合同不存在');
    if (c.sign_status === 1) throw new BizError('合同已签署');
    if (!req.body.sign_img) throw new BizError('请先手写签名');
    await db.exec('UPDATE biz_club_contract SET sign_status=1, sign_img=?, sign_time=NOW(), sign_source=1 WHERE id=?', [req.body.sign_img, c.id]);
    res.json(ok());
  } catch (e) { next(e); }
});
// 各入口的未读/待办数, 供「我的」页角标用(首页随 /home 一并返回)
r.get('/badges', async (req, res, next) => {
  try {
    const v = req.user.vip;
    const [[c], [p], [f]] = await Promise.all([
      db.query('SELECT COUNT(*) n FROM biz_club_contract WHERE vip_id=? AND hidden=0 AND sign_status=0', [v]),
      db.query('SELECT COUNT(*) n FROM biz_training_plan WHERE vip_id=? AND status=1 AND pushed=1 AND viewed_time IS NULL', [v]),
      db.query('SELECT COUNT(*) n FROM biz_ptrain_bespeak_record WHERE vip_id=? AND confirm_status=1 AND status=1', [v]),
    ]);
    res.json(ok({ contract: c.n, plan: p.n, confirm: f.n }));
  } catch (e) { next(e); }
});

// ---- 个人资料 ----
r.get('/profile', async (req, res, next) => {
  try {
    const v = await db.queryOne('SELECT id,phone,realname,nickname,avatar,gender,birthday,points,expire_status,expire_time,membership_name,coach_id,coach_name,sub_coach_id,sub_coach_name FROM biz_vip_user WHERE id=?', [req.user.vip]);
    res.json(ok(v));
  } catch (e) { next(e); }
});
r.put('/profile', async (req, res, next) => {
  try {
    const b = req.body;
    await db.exec('UPDATE biz_vip_user SET realname=?, nickname=?, gender=?, birthday=? WHERE id=?',
      [b.realname, b.nickname || b.realname, b.gender || 0, b.birthday || null, req.user.vip]);
    res.json(ok());
  } catch (e) { next(e); }
});

/* ============ 账号与安全 ============ */
/* 验证码放内存(5分钟有效), 短信走现有模拟通道落库留痕;
 * 身份校验通过后签发 10 分钟的一次性票据, 换手机号/改密码时必须带票据 */
const bcryptSec = require('bcryptjs');
const jwtSec = require('jsonwebtoken');
const configSec = require('../config');
const smsSec = require('../sms');

const CODE_TTL = 5 * 60 * 1000;
const codes = new Map(); // key: vip:scene:phone -> { code, exp, fails }
const codeKey = (vip, scene, phone) => `${vip}:${scene}:${phone}`;
const maskPhone = (p) => (p && p.length === 11 ? p.slice(0, 3) + '****' + p.slice(7) : (p || ''));

function putCode(vip, scene, phone) {
  const code = String(Math.floor(100000 + Math.random() * 900000));
  codes.set(codeKey(vip, scene, phone), { code, exp: Date.now() + CODE_TTL, fails: 0 });
  return code;
}
function checkCode(vip, scene, phone, input) {
  const k = codeKey(vip, scene, phone);
  const it = codes.get(k);
  if (!it || it.exp < Date.now()) throw new BizError('验证码已失效，请重新获取');
  if (it.fails >= 5) { codes.delete(k); throw new BizError('错误次数过多，请重新获取验证码'); }
  if (String(input || '').trim() !== it.code) { it.fails++; throw new BizError('验证码不正确'); }
  codes.delete(k);
}
function issueTicket(vip, purpose) {
  return jwtSec.sign({ t: 'sec', vip, purpose }, configSec.jwtSecret, { expiresIn: '10m' });
}
function useTicket(token, vip, purpose) {
  let d = null;
  try { d = jwtSec.verify(token || '', configSec.jwtSecret); } catch { d = null; }
  if (!d || d.t !== 'sec' || d.vip !== vip || d.purpose !== purpose) throw new BizError('身份验证已过期，请重新验证');
}

// 账号与安全首页
r.get('/security', async (req, res, next) => {
  try {
    const v = await db.queryOne('SELECT phone,password FROM biz_vip_user WHERE id=?', [req.user.vip]);
    res.json(ok({ phone: v.phone, phone_mask: maskPhone(v.phone), has_password: !!v.password }));
  } catch (e) { next(e); }
});

// 发送验证码: scene = verify(验证本人当前手机) | new_phone(验证要换的新号)
r.post('/security/send-code', async (req, res, next) => {
  try {
    const scene = req.body.scene === 'new_phone' ? 'new_phone' : 'verify';
    const v = await db.queryOne('SELECT id,phone,realname FROM biz_vip_user WHERE id=?', [req.user.vip]);
    let phone = v.phone;
    if (scene === 'new_phone') {
      phone = String(req.body.phone || '').trim();
      if (!/^1[3-9]\d{9}$/.test(phone)) throw new BizError('请输入正确的手机号');
      if (phone === v.phone) throw new BizError('新手机号不能与当前手机号相同');
      const dup = await db.queryOne('SELECT id FROM biz_vip_user WHERE phone=? AND id<>? AND status=1', [phone, v.id]);
      if (dup) throw new BizError('该手机号已被其他账号绑定');
    }
    const code = putCode(v.id, scene, phone);
    await smsSec.send(req.user.mid, {
      vipId: v.id, realname: v.realname, phone, scene: 'verify_code', params: { code },
    });
    // 模拟短信通道下把验证码回传, 便于演示环境自测; 接入真实短信后不再返回
    res.json(ok({ sent_to: maskPhone(phone), mock_code: smsSec.realEnabled ? '' : code }));
  } catch (e) { next(e); }
});

// 身份验证: 手机验证码 或 原密码 -> 换取票据
r.post('/security/verify', async (req, res, next) => {
  try {
    const purpose = req.body.purpose === 'phone' ? 'phone' : 'password';
    const v = await db.queryOne('SELECT id,phone,password FROM biz_vip_user WHERE id=?', [req.user.vip]);
    if (req.body.method === 'password') {
      if (!v.password || !(await bcryptSec.compare(String(req.body.password || ''), v.password))) throw new BizError('原密码不正确');
    } else {
      checkCode(v.id, 'verify', v.phone, req.body.code);
    }
    res.json(ok({ ticket: issueTicket(v.id, purpose) }));
  } catch (e) { next(e); }
});

// 更换手机号
r.post('/security/phone', async (req, res, next) => {
  try {
    useTicket(req.body.ticket, req.user.vip, 'phone');
    const phone = String(req.body.phone || '').trim();
    if (!/^1[3-9]\d{9}$/.test(phone)) throw new BizError('请输入正确的手机号');
    const dup = await db.queryOne('SELECT id FROM biz_vip_user WHERE phone=? AND id<>? AND status=1', [phone, req.user.vip]);
    if (dup) throw new BizError('该手机号已被其他账号绑定');
    checkCode(req.user.vip, 'new_phone', phone, req.body.code);
    await db.exec('UPDATE biz_vip_user SET phone=? WHERE id=?', [phone, req.user.vip]);
    res.json(ok({ phone, phone_mask: maskPhone(phone) }));
  } catch (e) { next(e); }
});

// 修改登录密码
r.post('/security/password', async (req, res, next) => {
  try {
    useTicket(req.body.ticket, req.user.vip, 'password');
    const pwd = String(req.body.password || '');
    if (pwd.length < 6) throw new BizError('新密码至少6位');
    await db.exec('UPDATE biz_vip_user SET password=? WHERE id=?', [await bcryptSec.hash(pwd, 10), req.user.vip]);
    res.json(ok());
  } catch (e) { next(e); }
});

// ---- 首页常用功能自定义布局 (按会员持久化; 空数组 = 恢复默认) ----
const widget = require('../widget');
r.get('/workbench', async (req, res, next) => {
  try {
    res.json(ok({ items: await widget.loadWidget(req.user.vip, 'member_home') }));
  } catch (e) { next(e); }
});
r.put('/workbench', async (req, res, next) => {
  try {
    const items = await widget.saveWidget(req.user.vip, 'member_home', req.body.items);
    res.json(ok({ items }));
  } catch (e) { next(e); }
});

module.exports = r;
