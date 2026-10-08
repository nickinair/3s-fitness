const express = require('express');
const dayjs = require('dayjs');
const db = require('../db');
const { ok, page, lifecycleTick, sendCsv, PAY_METHODS, BizError, CARD_KIND, CARD_STATUS, REMAIN_VALUE_SQL } = require('../util');
const { staffAuth } = require('../middleware/auth');

const r = express.Router();

// 门店 id → 名称, 导出时拼列用
async function clubNameMap() {
  const rows = await db.query('SELECT id,name FROM biz_club');
  return rows.reduce((m, c) => (m[c.id] = c.name, m), {});
}

// 报表门店口径(纪要第九章: 两店独立统计, 按卡归属门店):
// admin 可选 club_id=all|N (默认全部); 店长等角色固定本店
function clubScope(req) {
  if (req.user.role === 'admin' || req.user.role === 'platform') {
    const q = req.query.club_id;
    if (q === 'all') return null;
    if (q) return Number(q);
    return req.clubScope; // 未传则跟随顶栏门店选择
  }
  return req.clubId;
}
const cw = (club) => club ? ' AND club_id=?' : '';
const cp = (club) => club ? [club] : [];

// 看板/报表类接口的分块导出: export=csv&section=xxx
// sections = { key: { name: '板块中文名', headers: [[字段,表头]], rows: [] } }
function sendSection(req, res, filename, sections) {
  const key = String(req.query.section || '') || Object.keys(sections)[0];
  const s = sections[key];
  if (!s) throw new BizError('不支持导出的板块: ' + key);
  sendCsv(res, filename + '_' + s.name, s.headers, s.rows);
}
const SCENE_LABEL = ['', '自由训练', '私教消课', '团课核销', '储值消费', '爽约扣次'];
const METRIC_ROWS = (defs, cur, prev, prevLabel) => defs.map(([k, name]) => ({
  name, cur: Number((cur || {})[k] || 0), prev: Number((prev || {})[k] || 0),
}));
const METRIC_HEAD = (curLabel, prevLabel) => [['name', '指标'], ['cur', curLabel], ['prev', prevLabel]];

// ============ 数据看板（日报: 对比昨日 / 月报: 对比上月）============
r.get('/finance/dashboard', staffAuth(), async (req, res, next) => {
  try {
    await lifecycleTick();
    const mid = req.user.mid; const club = clubScope(req); const C = cw(club);
    const mode = req.query.mode === 'month' ? 'month' : 'day';
    const date = req.query.date || dayjs().format('YYYY-MM-DD');
    const month = req.query.month || dayjs().format('YYYY-MM');

    // 通用区间统计 [from, to]
    async function rangeMetrics(from, to) {
      const [m] = await db.query(
        `SELECT
          (SELECT COUNT(*) FROM biz_vip_user WHERE merchant_id=? AND insert_time BETWEEN ? AND ?) new_members,
          (SELECT COUNT(*) FROM biz_vip_user WHERE merchant_id=? AND expire_status=1 AND expire_time BETWEEN ? AND ?) today_expire,
          (SELECT COUNT(DISTINCT vip_id) FROM biz_checkin_record WHERE merchant_id=?${C} AND check_in_time BETWEEN ? AND ?) active_members,
          (SELECT COALESCE(SUM(actual_money),0) FROM biz_card_recharge WHERE merchant_id=?${C} AND insert_time BETWEEN ? AND ?) recharge_money,
          (SELECT COALESCE(SUM(spend_money),0) FROM biz_card_spend WHERE merchant_id=?${C} AND insert_time BETWEEN ? AND ?) spend_money,
          (SELECT COUNT(*) FROM biz_syllabus_group WHERE merchant_id=?${C} AND start_time BETWEEN ? AND ? AND status IN (1,3)) group_classes,
          (SELECT COUNT(*) FROM biz_ptrain_record WHERE merchant_id=?${C} AND insert_time BETWEEN ? AND ?) pt_lessons,
          (SELECT COUNT(*) FROM biz_checkin_record WHERE merchant_id=?${C} AND check_in_time BETWEEN ? AND ?) checkins,
          (SELECT COALESCE(SUM(spend_money),0) FROM biz_card_spend WHERE merchant_id=?${C} AND insert_time BETWEEN ? AND ? AND scene=3) group_spend,
          (SELECT COALESCE(SUM(spend_money),0) FROM biz_card_spend WHERE merchant_id=?${C} AND insert_time BETWEEN ? AND ? AND scene=2) pt_spend,
          (SELECT COALESCE(SUM(spend_money),0) FROM biz_card_spend WHERE merchant_id=?${C} AND insert_time BETWEEN ? AND ? AND scene IN (1,4,5)) train_spend,
          (SELECT COUNT(*) FROM biz_ptrain_bespeak_record WHERE merchant_id=?${C} AND status IN (0,1,3) AND \`date\` BETWEEN DATE(?) AND DATE(?)) + (SELECT COUNT(*) FROM biz_syllabus_subscribe_record WHERE merchant_id=?${C} AND status IN (1,2) AND class_start_time BETWEEN ? AND ?) today_bookings`,
        [mid, from, to, mid, from, to,
          ...[1, 2, 3, 4, 5, 6, 7, 8, 9, 10, 11].flatMap(() => [mid, ...cp(club), from, to])]);
      return m;
    }

    let todayM, yesterdayM;
    if (mode === 'month') {
      const ms = dayjs(month + '-01');
      const pm = ms.subtract(1, 'month');
      todayM = await rangeMetrics(ms.format('YYYY-MM-DD 00:00:00'), ms.endOf('month').format('YYYY-MM-DD 23:59:59'));
      yesterdayM = await rangeMetrics(pm.format('YYYY-MM-DD 00:00:00'), pm.endOf('month').format('YYYY-MM-DD 23:59:59'));
    } else {
      const yesterday = dayjs(date).subtract(1, 'day').format('YYYY-MM-DD');
      todayM = await rangeMetrics(`${date} 00:00:00`, `${date} 23:59:59`);
      yesterdayM = await rangeMetrics(`${yesterday} 00:00:00`, `${yesterday} 23:59:59`);
    }
    // 今日课程列表
    const classes = await db.query(
      `SELECT id,title,coach_name,classroom_name,start_time,end_time,booked_count,people_count,status FROM biz_syllabus_group
       WHERE merchant_id=?${C} AND DATE(start_time)=? ORDER BY start_time`, [mid, ...cp(club), date]);
    const ptToday = await db.query(
      `SELECT id,coach_name,realname,from_time,to_time,course_title,status,confirm_status FROM biz_ptrain_bespeak_record
       WHERE merchant_id=?${C} AND \`date\`=? ORDER BY from_time`, [mid, ...cp(club), date]);
    if (req.query.export === 'csv') {
      const label = mode === 'month' ? month : date;
      const prevLabel = mode === 'month' ? '上月' : '昨日';
      const PT_STATUS = { 0: '待确认', 1: '已确认', 2: '已取消', 3: '已完成', 4: '已爽约' };
      const GC_STATUS = { 0: '未开始', 1: '已发布', 2: '已取消', 3: '已结束' };
      return sendSection(req, res, `数据看板_${label}`, {
        summary: {
          name: '指标汇总',
          headers: METRIC_HEAD(label, prevLabel),
          rows: METRIC_ROWS([
            ['new_members', '新增会员'], ['today_expire', '到期会员'], ['active_members', '活跃会员'],
            ['recharge_money', '预收金额'], ['spend_money', '耗卡金额'], ['group_classes', '团课课量'],
            ['pt_lessons', '私教课量'], ['checkins', '签到人次'], ['group_spend', '团课耗课金额'],
            ['pt_spend', '私教耗课金额'], ['train_spend', '自由训练耗卡金额'],
          ], todayM, yesterdayM),
        },
        classes: {
          name: '团课安排',
          headers: [['title', '课程'], ['coach_name', '教练'], ['classroom_name', '教室'], ['start_time', '开始'], ['end_time', '结束'], ['booked_count', '已约'], ['people_count', '容量'], ['status_label', '状态']],
          rows: classes.map(x => Object.assign({}, x, { status_label: GC_STATUS[x.status] || x.status })),
        },
        pt: {
          name: '私教预约',
          headers: [['coach_name', '教练'], ['realname', '会员'], ['from_time', '开始'], ['to_time', '结束'], ['course_title', '课程'], ['status_label', '状态']],
          rows: ptToday.map(x => Object.assign({}, x, { status_label: PT_STATUS[x.status] || x.status })),
        },
      });
    }
    res.json(ok({ date, month, mode, club, today: todayM, yesterday: yesterdayM, classes, ptToday }));
  } catch (e) { next(e); }
});

// ============ 月度报表 ============
r.get('/finance/monthly', staffAuth(), async (req, res, next) => {
  try {
    const mid = req.user.mid;
    const club = clubScope(req);
    const C = cw(club); const P = cp(club);
    const MC = club ? ' AND EXISTS (SELECT 1 FROM biz_member_card mc WHERE mc.vip_id=biz_vip_user.id AND mc.club_id=?)' : '';
    const month = req.query.month || dayjs().format('YYYY-MM');
    const lastMonth = dayjs(month + '-01').subtract(1, 'month').format('YYYY-MM');

    async function monthCore(m) {
      const [row] = await db.query(
        `SELECT
          (SELECT COUNT(*) FROM biz_vip_user WHERE merchant_id=? AND status=1${MC}) total_members,
          (SELECT COUNT(*) FROM biz_vip_user WHERE merchant_id=? AND status=1 AND expire_status=1${MC}) active_members,
          (SELECT COUNT(*) FROM biz_vip_user WHERE merchant_id=? AND DATE_FORMAT(insert_time,'%Y-%m')=?${MC}) new_members,
          (SELECT COALESCE(SUM(actual_money),0) FROM biz_card_recharge WHERE merchant_id=? AND DATE_FORMAT(insert_time,'%Y-%m')=?${C}) revenue,
          (SELECT COALESCE(SUM(actual_money),0) FROM biz_card_recharge WHERE merchant_id=? AND DATE_FORMAT(insert_time,'%Y-%m')=? AND is_new_user=1 AND actual_money>0${C}) new_user_revenue,
          (SELECT COALESCE(SUM(actual_money),0) FROM biz_card_recharge WHERE merchant_id=? AND DATE_FORMAT(insert_time,'%Y-%m')=? AND is_new_user=0 AND actual_money>0${C}) repeat_revenue,
          (SELECT COALESCE(SUM(spend_money),0) FROM biz_card_spend WHERE merchant_id=? AND DATE_FORMAT(insert_time,'%Y-%m')=?${C}) spend_money,
          (SELECT COUNT(*) FROM biz_card_recharge WHERE merchant_id=? AND DATE_FORMAT(insert_time,'%Y-%m')=? AND actual_money>0${C}) orders,
          (SELECT COUNT(*) FROM biz_card_recharge WHERE merchant_id=? AND DATE_FORMAT(insert_time,'%Y-%m')=? AND type=1${C}) open_cards`,
        [mid, ...P, mid, ...P, mid, m, ...P, mid, m, ...P, mid, m, ...P, mid, m, ...P, mid, m, ...P, mid, m, ...P, mid, m, ...P]);
      return row;
    }
    const cur = await monthCore(month);
    const prev = await monthCore(lastMonth);
    // 近12月趋势
    const from = dayjs(month + '-01').subtract(11, 'month').format('YYYY-MM-01');
    const memberTrend = await db.query(
      `SELECT DATE_FORMAT(insert_time,'%Y-%m') m, COUNT(*) cnt FROM biz_vip_user WHERE merchant_id=? AND insert_time>=?${MC} GROUP BY 1 ORDER BY 1`, [mid, from, ...P]);
    const revenueTrend = await db.query(
      `SELECT DATE_FORMAT(insert_time,'%Y-%m') m, SUM(actual_money) money FROM biz_card_recharge WHERE merchant_id=? AND insert_time>=?${C} GROUP BY 1 ORDER BY 1`, [mid, from, ...P]);
    const spendTrend = await db.query(
      `SELECT DATE_FORMAT(insert_time,'%Y-%m') m, SUM(spend_money) money FROM biz_card_spend WHERE merchant_id=? AND insert_time>=?${C} GROUP BY 1 ORDER BY 1`, [mid, from, ...P]);
    // 新开卡构成（按卡类型）
    const byCardType = await db.query(
      `SELECT card_type_name name, COUNT(*) cnt, SUM(actual_money) money FROM biz_card_recharge
       WHERE merchant_id=? AND DATE_FORMAT(insert_time,'%Y-%m')=? AND actual_money>0${C} GROUP BY card_type_name ORDER BY money DESC`, [mid, month, ...P]);
    // 耗卡构成（按场景）
    const spendByScene = await db.query(
      `SELECT scene, SUM(spend_money) money, COUNT(*) cnt FROM biz_card_spend
       WHERE merchant_id=? AND DATE_FORMAT(insert_time,'%Y-%m')=?${C} GROUP BY scene`, [mid, month, ...P]);
    // 顾问业绩(按开卡员工统计)
    const sales = await db.query(
      `SELECT IF(membership_name='','未归属',membership_name) name, COUNT(*) orders, SUM(actual_money) money FROM biz_card_recharge
       WHERE merchant_id=? AND DATE_FORMAT(insert_time,'%Y-%m')=? AND actual_money>0${C} GROUP BY 1 ORDER BY money DESC`, [mid, month, ...P]);
    // 教练有效课时
    const coachHours = await db.query(
      `SELECT MAX(coach_name) name, SUM(costs) lessons, SUM(spend_money) money FROM biz_ptrain_record
       WHERE merchant_id=? AND DATE_FORMAT(insert_time,'%Y-%m')=?${C} GROUP BY coach_id ORDER BY lessons DESC`, [mid, month, ...P]);
    if (req.query.export === 'csv') {
      return sendSection(req, res, `月度报表_${month}`, {
        summary: {
          name: '汇总',
          headers: METRIC_HEAD(month, lastMonth),
          rows: METRIC_ROWS([
            ['total_members', '累计会员'], ['active_members', '在籍会员'], ['new_members', '新增会员'],
            ['revenue', '月度营收'], ['new_user_revenue', '新用户营收'], ['repeat_revenue', '复购营收'],
            ['spend_money', '耗卡金额'], ['orders', '成单数'], ['open_cards', '开卡数'],
          ], cur, prev),
        },
        member_trend: { name: '会员趋势', headers: [['m', '月份'], ['cnt', '新增会员']], rows: memberTrend },
        revenue_trend: { name: '营收趋势', headers: [['m', '月份'], ['money', '营收']], rows: revenueTrend },
        spend_trend: { name: '耗卡趋势', headers: [['m', '月份'], ['money', '耗卡金额']], rows: spendTrend },
        by_card_type: { name: '新开卡构成', headers: [['name', '卡类型'], ['cnt', '张数'], ['money', '金额']], rows: byCardType },
        spend_scene: {
          name: '耗卡构成',
          headers: [['scene_label', '场景'], ['cnt', '笔数'], ['money', '金额']],
          rows: spendByScene.map(x => Object.assign({}, x, { scene_label: SCENE_LABEL[x.scene] || x.scene })),
        },
        sales: { name: '顾问业绩', headers: [['name', '业绩归属'], ['orders', '成单数'], ['money', '金额']], rows: sales },
        coach_hours: { name: '教练有效课时', headers: [['name', '教练'], ['lessons', '课时'], ['money', '课程价值']], rows: coachHours },
      });
    }
    res.json(ok({ month, club, cur, prev, memberTrend, revenueTrend, spendTrend, byCardType, spendByScene, sales, coachHours }));
  } catch (e) { next(e); }
});

// ============ 收款明细 ============
r.get('/finance/recharges', staffAuth(), async (req, res, next) => {
  try {
    const { p, size, offset } = page(req);
    const { from, to, type, pay_method, keyword, membership_id, export: exp } = req.query;
    const cond = ['merchant_id=?']; const params = [req.user.mid];
    const club = clubScope(req); if (club) { cond.push('club_id=?'); params.push(club); }
    if (from) { cond.push('insert_time>=?'); params.push(`${from} 00:00:00`); }
    if (to) { cond.push('insert_time<=?'); params.push(`${to} 23:59:59`); }
    if (type) { cond.push('type=?'); params.push(type); }
    if (pay_method) { cond.push('pay_method=?'); params.push(pay_method); }
    if (membership_id) { cond.push('membership_id=?'); params.push(membership_id); }
    if (keyword) { cond.push('(realname LIKE ? OR phone LIKE ?)'); params.push(`%${keyword}%`, `%${keyword}%`); }
    const where = cond.join(' AND ');
    const [{ total, sum }] = await db.query(`SELECT COUNT(*) total, COALESCE(SUM(actual_money),0) sum FROM biz_card_recharge WHERE ${where}`, params);
    const rows = await db.query(`SELECT * FROM biz_card_recharge WHERE ${where} ORDER BY id DESC ${exp ? '' : 'LIMIT ? OFFSET ?'}`,
      exp ? params : [...params, size, offset]);
    if (exp) {
      const clubMap = await clubNameMap();
      rows.forEach(x => { x.pay_label = PAY_METHODS[x.pay_method] || x.pay_method; x.type_label = ['', '开卡', '续卡', '充值', '退卡'][x.type]; x.club_name = clubMap[x.club_id] || ''; });
      return sendCsv(res, `收款明细_${dayjs().format('YYYYMMDD')}`, [
        ['id', '流水ID'], ['club_name', '开卡门店'], ['realname', '会员'], ['phone', '手机号'], ['card_type_name', '卡类型'], ['type_label', '类型'],
        ['actual_money', '实收金额'], ['pay_label', '支付方式'], ['membership_name', '业绩归属'], ['ope_username', '经手人'], ['insert_time', '时间'],
      ], rows);
    }
    res.json(ok({ list: rows, total, sum }));
  } catch (e) { next(e); }
});

// ============ 耗卡明细 ============
r.get('/finance/spends', staffAuth(), async (req, res, next) => {
  try {
    const { p, size, offset } = page(req);
    const { from, to, scene, keyword, export: exp } = req.query;
    const cond = ['merchant_id=?']; const params = [req.user.mid];
    const club = clubScope(req); if (club) { cond.push('club_id=?'); params.push(club); }
    if (from) { cond.push('insert_time>=?'); params.push(`${from} 00:00:00`); }
    if (to) { cond.push('insert_time<=?'); params.push(`${to} 23:59:59`); }
    if (scene) { cond.push('scene=?'); params.push(scene); }
    if (keyword) { cond.push('(realname LIKE ? OR phone LIKE ?)'); params.push(`%${keyword}%`, `%${keyword}%`); }
    const where = cond.join(' AND ');
    const [{ total, sum }] = await db.query(`SELECT COUNT(*) total, COALESCE(SUM(spend_money),0) sum FROM biz_card_spend WHERE ${where}`, params);
    const rows = await db.query(`SELECT * FROM biz_card_spend WHERE ${where} ORDER BY id DESC ${exp ? '' : 'LIMIT ? OFFSET ?'}`,
      exp ? params : [...params, size, offset]);
    if (exp) {
      const clubMap = await clubNameMap();
      rows.forEach(x => { x.scene_label = ['', '自由训练', '私教消课', '团课核销', '储值消费', '爽约扣次'][x.scene]; x.club_name = clubMap[x.club_id] || ''; x.kind_name = CARD_KIND[x.card_kind] || ''; });
      return sendCsv(res, `耗卡明细_${dayjs().format('YYYYMMDD')}`, [
        ['id', '流水ID'], ['club_name', '开卡门店'], ['realname', '会员'], ['phone', '手机号'], ['card_type_name', '卡类型'], ['kind_name', '卡种'], ['scene_label', '场景'],
        ['costs', '扣减次数'], ['spend_money', '耗卡金额'], ['coach_name', '教练'], ['insert_time', '时间'],
      ], rows);
    }
    res.json(ok({ list: rows, total, sum }));
  } catch (e) { next(e); }
});

// ============ 教练消耗统计（排名/对比/按日趋势, 支持导出）============
r.get('/finance/coach-consume', staffAuth(), async (req, res, next) => {
  try {
    const mid = req.user.mid;
    const from = req.query.from || dayjs().startOf('month').format('YYYY-MM-DD');
    const to = req.query.to || dayjs().format('YYYY-MM-DD');
    const club = clubScope(req); const C = cw(club); const P = cp(club);
    // 排名: 私教消课课时/耗课金额 + 团课授课节数 (按卡归属门店口径)
    const ranking = await db.query(
      `SELECT co.id coach_id, co.realname name,
              COALESCE(pr.lessons,0) lessons, COALESCE(pr.money,0) money,
              COALESCE(gc.classes,0) group_classes
       FROM biz_club_coach co
       LEFT JOIN (SELECT coach_id, SUM(costs) lessons, SUM(spend_money) money FROM biz_ptrain_record
                  WHERE merchant_id=? AND DATE(insert_time) BETWEEN ? AND ?${C} GROUP BY coach_id) pr ON pr.coach_id=co.id
       LEFT JOIN (SELECT coach_id, COUNT(*) classes FROM biz_syllabus_group
                  WHERE merchant_id=? AND status=3 AND DATE(start_time) BETWEEN ? AND ?${C} GROUP BY coach_id) gc ON gc.coach_id=co.id
       WHERE co.merchant_id=? AND co.status=1
       ORDER BY lessons DESC, money DESC`,
      [mid, from, to, ...P, mid, from, to, ...P, mid]);
    // 按日趋势 (每教练每日消耗课时)
    const daily = await db.query(
      `SELECT DATE(insert_time) d, coach_id, coach_name, SUM(costs) lessons, SUM(spend_money) money
       FROM biz_ptrain_record WHERE merchant_id=? AND DATE(insert_time) BETWEEN ? AND ?${C}
       GROUP BY 1, 2, 3 ORDER BY 1`, [mid, from, to, ...P]);
    if (req.query.export) {
      return sendSection(req, res, `教练消耗_${from}_${to}`, {
        ranking: {
          name: '排名',
          headers: [['name', '教练'], ['lessons', '消课课时'], ['money', '耗课金额'], ['group_classes', '团课节数']],
          rows: ranking,
        },
        daily: {
          name: '按日趋势',
          headers: [['d', '日期'], ['coach_name', '教练'], ['lessons', '消课课时'], ['money', '耗课金额']],
          rows: daily.map(x => Object.assign({}, x, { d: dayjs(x.d).format('YYYY-MM-DD') })),
        },
      });
    }
    res.json(ok({ from, to, ranking, daily }));
  } catch (e) { next(e); }
});

// ============ 顾问业绩(按开卡员工统计) ============
r.get('/finance/sales', staffAuth(), async (req, res, next) => {
  try {
    const mid = req.user.mid;
    const month = req.query.month || dayjs().format('YYYY-MM');
    // 教练角色无权看; 会籍角色只看自己（“我的业绩”）
    const onlyMine = req.user.role === 'membership';
    const cond = ['rc.merchant_id=?', "DATE_FORMAT(rc.insert_time,'%Y-%m')=?"]; const params = [mid, month];
    if (onlyMine) { cond.push('rc.membership_id=?'); params.push(req.user.uid); }
    const club = clubScope(req); if (club) { cond.push('rc.club_id=?'); params.push(club); }
    const rows = await db.query(
      `SELECT rc.membership_id, IF(rc.membership_name='','未归属',rc.membership_name) name,
              COUNT(*) orders, SUM(rc.actual_money) money,
              SUM(rc.is_new_user=1 AND rc.actual_money>0) new_orders,
              SUM(IF(rc.type=2, rc.actual_money, 0)) renew_money
       FROM biz_card_recharge rc WHERE ${cond.join(' AND ')} AND rc.actual_money != 0
       GROUP BY rc.membership_id, rc.membership_name ORDER BY money DESC`, params);
    // 明细: 默认近一年, 支持 from/to 与分页; export=csv 导出全部命中记录
    const exp = req.query.export === 'csv';
    const { p: dp, size: dsize, offset: doffset } = page(req);
    const from = req.query.from || dayjs(month + '-01').subtract(11, 'month').format('YYYY-MM-DD');
    const to = req.query.to || dayjs(month + '-01').endOf('month').format('YYYY-MM-DD');
    const dCond = ['merchant_id=?', 'DATE(insert_time)>=?', 'DATE(insert_time)<=?'];
    const dParams = [mid, from, to];
    if (onlyMine) { dCond.push('membership_id=?'); dParams.push(req.user.uid); }
    if (club) { dCond.push('club_id=?'); dParams.push(club); }
    const dWhere = dCond.join(' AND ');
    const [{ dTotal, dSum }] = await db.query(
      `SELECT COUNT(*) dTotal, COALESCE(SUM(actual_money),0) dSum FROM biz_card_recharge WHERE ${dWhere}`, dParams);
    const details = await db.query(
      `SELECT * FROM biz_card_recharge WHERE ${dWhere} ORDER BY id DESC ${exp ? '' : 'LIMIT ? OFFSET ?'}`,
      exp ? dParams : [...dParams, dsize, doffset]);
    if (exp) {
      details.forEach(x => { x.pay_label = PAY_METHODS[x.pay_method] || x.pay_method; x.type_label = ['', '开卡', '续卡', '充值', '退卡'][x.type]; x.new_label = x.is_new_user ? '新客' : '老客'; });
      return sendSection(req, res, `顾问业绩_${from}_${to}`, {
        details: {
          name: '明细',
          headers: [
            ['insert_time', '时间'], ['realname', '会员'], ['phone', '手机号'], ['card_type_name', '卡类型'], ['type_label', '类型'],
            ['actual_money', '金额'], ['new_label', '是否新客'], ['membership_name', '业绩归属'], ['pay_label', '支付方式'], ['ope_username', '经手人'],
          ],
          rows: details,
        },
        list: {
          name: `${month}汇总`,
          headers: [['name', '业绩归属'], ['orders', '成单数'], ['money', '业绩金额'], ['new_orders', '新客单'], ['renew_money', '续卡金额']],
          rows,
        },
      });
    }
    res.json(ok({ month, list: rows, details, detail_total: dTotal, detail_sum: dSum, detail_page: dp, detail_size: dsize, from, to }));
  } catch (e) { next(e); }
});

module.exports = r;

/* ============ 剩余卡价值（预收负债）============
 * 门店拿这个核算「还欠会员多少服务」, 也是分成结算的底数。
 * 口径见 util.REMAIN_VALUE_SQL: 计次卡按剩余次数×实收单价, 期卡按剩余天数直线摊销,
 * 储值卡按余额+赠额; 已过期/停用/退卡的卡一律计 0。
 * 只统计 status 0待开卡 / 1使用中 / 3已暂停 三种「门店仍有履约义务」的卡。
 */
r.get('/finance/card-balance', staffAuth('admin', 'manager'), async (req, res, next) => {
  try {
    await lifecycleTick();
    const { club_id, kind, keyword, export: exp } = req.query;
    const cond = ['c.merchant_id=?', 'c.status IN (0,1,3)']; const params = [req.user.mid];
    const scoped = clubScope(req);
    if (scoped) { cond.push('c.club_id=?'); params.push(scoped); }
    else if (club_id && club_id !== 'all') { cond.push('c.club_id=?'); params.push(club_id); }
    if (kind) { cond.push('c.card_kind=?'); params.push(kind); }
    if (keyword) { cond.push('(c.realname LIKE ? OR c.phone LIKE ?)'); params.push(`%${keyword}%`, `%${keyword}%`); }
    const where = cond.join(' AND ');
    const V = REMAIN_VALUE_SQL;

    // 明细(导出用全量, 页面用前 200 条按剩余价值从大到小)
    const rows = await db.query(
      `SELECT c.id, c.club_id, cl.name club_name, c.realname, c.phone, c.card_type_name, c.card_kind, c.status,
              c.counts, c.left_counts, c.unit_price, c.actual_money, c.expire_time, c.expire_days,
              c.left_money, c.left_gift_money, c.membership_name, c.coach_name, c.insert_time,
              GREATEST(DATEDIFF(c.expire_time, CURDATE()), 0) left_days, (${V}) remain_value
       FROM biz_member_card c LEFT JOIN biz_club cl ON cl.id=c.club_id
       WHERE ${where} ORDER BY remain_value DESC ${exp ? '' : 'LIMIT 200'}`, params);

    if (exp === 'csv') {
      rows.forEach(x => {
        x.kind_name = CARD_KIND[x.card_kind] || '';
        x.status_name = CARD_STATUS[x.status] || '';
        x.left_desc = Number(x.counts) > 0 ? `${x.left_counts}/${x.counts} 次`
          : (Number(x.card_kind) === 3 ? `余额 ${x.left_money}` : `${x.left_days} 天`);
      });
      return sendCsv(res, `剩余卡价值明细_${dayjs().format('YYYYMMDD')}`, [
        ['id', '卡ID'], ['club_name', '开卡门店'], ['realname', '会员'], ['phone', '手机号'],
        ['card_type_name', '卡类型'], ['kind_name', '卡种'], ['status_name', '状态'],
        ['actual_money', '实收金额'], ['unit_price', '实收单价'], ['left_desc', '剩余'],
        ['remain_value', '剩余价值'], ['expire_time', '到期时间'],
        ['membership_name', '业绩归属'], ['coach_name', '服务教练'], ['insert_time', '开卡时间'],
      ], rows);
    }

    // 汇总: 总额 / 按门店 / 按卡种 / 按卡类型
    const agg = async (sel, group) => db.query(
      `SELECT ${sel}, COUNT(*) cards, COUNT(DISTINCT c.vip_id) members, ROUND(SUM(${V}),2) value
       FROM biz_member_card c LEFT JOIN biz_club cl ON cl.id=c.club_id
       WHERE ${where} GROUP BY ${group} ORDER BY value DESC`, params);
    const [total] = await db.query(
      `SELECT COUNT(*) cards, COUNT(DISTINCT c.vip_id) members, ROUND(SUM(${V}),2) value,
              ROUND(SUM(c.actual_money),2) paid
       FROM biz_member_card c WHERE ${where}`, params);
    const [byClub, byKind, byType] = await Promise.all([
      agg('c.club_id, cl.name name', 'c.club_id, cl.name'),
      agg('c.card_kind, c.card_kind name', 'c.card_kind'),
      agg('c.card_type_name name', 'c.card_type_name'),
    ]);
    byKind.forEach(x => { x.name = CARD_KIND[x.card_kind] || '其他'; });
    res.json(ok({ total, byClub, byKind, byType, list: rows }));
  } catch (e) { next(e); }
});
