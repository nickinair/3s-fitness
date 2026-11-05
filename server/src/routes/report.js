/* 报表中心(对齐旧系统移动端报表):
 *   GET /report/overview   数据概览  period=day|week|month, date=YYYY-MM-DD, club_id
 *   GET /report/members    会员报表(用户数据) month=YYYY-MM, club_id
 *   GET /report/finance    财务报表(财务数据) month=YYYY-MM, club_id
 *   GET /report/mine       我的业绩 month=YYYY-MM  (admin/manager 可传 user_id 看指定员工)
 *   以上均支持 export=csv&section=<板块名> 导出明细 */
const express = require('express');
const dayjs = require('dayjs');
const db = require('../db');
const { ok, BizError, lifecycleTick, sendCsv, PAY_METHODS, CARD_KIND } = require('../util');
const { staffAuth } = require('../middleware/auth');

const r = express.Router();

// 添加安全的数据库查询包装器函数
async function safeDbQuery(query, params = []) {
  try {
    return await db.query(query, params);
  } catch (error) {
    console.error('Database query error:', error.message, 'Query:', query, 'Params:', params);
    throw new BizError(`数据库查询错误: ${error.message}`);
  }
}

async function safeDbQueryOne(query, params = []) {
  try {
    return await db.queryOne(query, params);
  } catch (error) {
    console.error('Database query one error:', error.message, 'Query:', query, 'Params:', params);
    throw new BizError(`数据库查询错误: ${error.message}`);
  }
}

function clubScope(req) {
  const q = req.query.club_id;
  if (q === 'all' || q === '0') return null;
  if (q) return Number(q);
  if (['admin', 'platform'].includes(req.user.role)) {
    return req.clubScope;
  }
  return req.clubId;
}
const cw = (club, alias = '') => club ? ` AND ${alias}club_id=?` : '';
const cp = (club) => club ? [club] : [];
const pct = (cur, prev) => { cur = Number(cur) || 0; prev = Number(prev) || 0; if (!prev) return cur ? 100 : 0; return +(((cur - prev) / prev) * 100).toFixed(2); };
const withPct = (list, key) => {
  const sum = list.reduce((a, x) => a + Number(x[key] || 0), 0);
  list.forEach(x => { x.pct = sum ? +((Number(x[key] || 0) / sum) * 100).toFixed(2) : 0; });
  return { list, sum };
};
const monthRange = (m) => [dayjs(m + '-01').format('YYYY-MM-DD 00:00:00'), dayjs(m + '-01').endOf('month').format('YYYY-MM-DD 23:59:59')];
const csvTime = (v) => v ? dayjs(v).format('YYYY-MM-DD HH:mm') : '';
const OVERVIEW_METRICS = [
  ['new_members', '新增会员'], ['expire_cards', '到期(卡)'], ['active_members', '活跃(人)'],
  ['recharge_money', '预收金额'], ['spend_money', '耗卡金额'], ['group_classes', '团课课量'],
  ['pt_lessons', '私教课量'], ['free_train_members', '自由训练人数'], ['group_spend', '团课耗课金额'],
  ['pt_spend', '私教耗课金额'], ['train_spend', '自由训练耗卡金额'],
];


/* ============ 数据概览: 日 / 周 / 月, 对比上一周期 ============ */
r.get('/report/overview', staffAuth(), async (req, res, next) => {
  try {
    await lifecycleTick();
    const mid = req.user.mid;
    const club = clubScope(req);
    const C = cw(club);
    const P = cp(club);

    // 添加参数验证
    if (!mid) {
      throw new BizError('商户ID不能为空');
    }

    const period = ['day', 'week', 'month'].includes(req.query.period) ? req.query.period : 'day';
    const base = dayjs(req.query.date || dayjs().format('YYYY-MM-DD'));

    // 验证日期是否有效
    if (!base.isValid()) {
      throw new BizError('日期格式错误');
    }

    let from, to, pfrom, pto, label, plabel;
    if (period === 'day') {
      from = base.startOf('day'); to = base.endOf('day'); pfrom = from.subtract(1, 'day'); pto = to.subtract(1, 'day');
      label = base.format('YYYY.MM.DD'); plabel = '昨日';
    } else if (period === 'week') {
      const dow = (base.day() + 6) % 7; // 周一为一周开始
      from = base.subtract(dow, 'day').startOf('day'); to = from.add(6, 'day').endOf('day');
      pfrom = from.subtract(7, 'day'); pto = to.subtract(7, 'day');
      label = from.format('MM.DD') + ' - ' + to.format('MM.DD'); plabel = '上周';
    } else {
      from = base.startOf('month'); to = base.endOf('month'); pfrom = from.subtract(1, 'month'); pto = pfrom.endOf('month');
      label = base.format('YYYY年M月'); plabel = '上月';
    }
    const F = (d) => d.format('YYYY-MM-DD HH:mm:ss');

    async function metrics(a, b) {
      const [m] = await safeDbQuery(
        `SELECT
          (SELECT COUNT(*) FROM biz_vip_user WHERE merchant_id=? AND insert_time BETWEEN ? AND ?) new_members,
          (SELECT COUNT(*) FROM biz_member_card WHERE merchant_id=?${C} AND status IN (1,2) AND expire_time BETWEEN ? AND ?) expire_cards,
          (SELECT COUNT(DISTINCT vip_id) FROM biz_checkin_record WHERE merchant_id=?${C} AND check_in_time BETWEEN ? AND ?) active_members,
          (SELECT COALESCE(SUM(actual_money),0) FROM biz_card_recharge WHERE merchant_id=?${C} AND insert_time BETWEEN ? AND ?) recharge_money,
          (SELECT COALESCE(SUM(spend_money),0) FROM biz_card_spend WHERE merchant_id=?${C} AND insert_time BETWEEN ? AND ?) spend_money,
          (SELECT COUNT(*) FROM biz_syllabus_group WHERE merchant_id=?${C} AND start_time BETWEEN ? AND ? AND status IN (1,3)) group_classes,
          (SELECT COALESCE(SUM(costs),0) FROM biz_ptrain_record WHERE merchant_id=?${C} AND insert_time BETWEEN ? AND ?) pt_lessons,
          (SELECT COUNT(DISTINCT vip_id) FROM biz_card_spend WHERE merchant_id=?${C} AND insert_time BETWEEN ? AND ? AND scene=1) free_train_members,
          (SELECT COALESCE(SUM(spend_money),0) FROM biz_card_spend WHERE merchant_id=?${C} AND insert_time BETWEEN ? AND ? AND scene=3) group_spend,
          (SELECT COALESCE(SUM(spend_money),0) FROM biz_card_spend WHERE merchant_id=?${C} AND insert_time BETWEEN ? AND ? AND scene=2) pt_spend,
          (SELECT COALESCE(SUM(spend_money),0) FROM biz_card_spend WHERE merchant_id=?${C} AND insert_time BETWEEN ? AND ? AND scene=1) train_spend`,
        [mid, a, b, ...Array.from({ length: 10 }).flatMap(() => [mid, ...P, a, b])]);
      return m;
    }
    const cur = await metrics(F(from), F(to));
    const prev = await metrics(F(pfrom), F(pto));
    if (req.query.export === 'csv') {
      const rows = OVERVIEW_METRICS.map(([key, name]) => ({
        name, cur: Number(cur[key] || 0), prev: Number(prev[key] || 0), pct: pct(cur[key], prev[key]) + '%',
      }));
      return sendCsv(res, `数据概览_${label.replace(/[ .]/g, '')}`,
        [['name', '指标'], ['cur', `本期(${label})`], ['prev', plabel], ['pct', '环比']],
        rows);
    }
    res.json(ok({ period, date: base.format('YYYY-MM-DD'), from: from.format('YYYY-MM-DD'), to: to.format('YYYY-MM-DD'), label, prev_label: plabel, club, cur, prev }));
  } catch (e) { next(e); }
});

/* ============ 会员报表(用户数据) ============ */
r.get('/report/members', staffAuth(), async (req, res, next) => {
  try {
    await lifecycleTick();
    const mid = req.user.mid; const club = clubScope(req); const C = cw(club); const P = cp(club);
    const month = req.query.month || dayjs().format('YYYY-MM');

    // 添加参数验证
    if (!mid) {
      throw new BizError('商户ID不能为空');
    }

    const lastMonth = dayjs(month + '-01').subtract(1, 'month').format('YYYY-MM');
    const [from, to] = monthRange(month);
    const MC = club ? ' AND EXISTS (SELECT 1 FROM biz_member_card mc WHERE mc.vip_id=v.id AND mc.club_id=?)' : '';
    const exp = req.query.export === 'csv' ? String(req.query.section || '') : '';

    async function core(m) {
      const [a, b] = monthRange(m);
      const [row] = await safeDbQuery(
        `SELECT
          (SELECT COUNT(*) FROM biz_vip_user v WHERE merchant_id=? AND status=1 AND insert_time<=?${MC}) total_members,
          (SELECT COUNT(DISTINCT v.id) FROM biz_vip_user v JOIN biz_member_card c ON c.vip_id=v.id AND c.status IN (0,1,3) AND c.open_card_time<=? AND (c.expire_time IS NULL OR c.expire_time>=?)${cw(club, 'c.')} WHERE v.merchant_id=? AND v.status=1) active_members,
          (SELECT COUNT(*) FROM biz_vip_user v WHERE merchant_id=? AND insert_time BETWEEN ? AND ?${MC}) new_members,
          (SELECT COUNT(DISTINCT vip_id) FROM biz_card_recharge WHERE merchant_id=? AND is_new_user=0 AND actual_money>0 AND insert_time BETWEEN ? AND ?${C}) repeat_members`,
        [mid, b, ...P, b, a, ...P, mid, mid, a, b, ...P, mid, a, b, ...P]);
      return row;
    }
    const cur = await core(month); const prev = await core(lastMonth);
    const summary = {
      total_members: Number(cur.total_members), active_members: Number(cur.active_members), new_members: Number(cur.new_members),
      // 复购会员 = 当月有老客付费(续卡/再次开卡/充值)的去重人数, 与财务数据「复购营收」同口径
      repeat_members: Number(cur.repeat_members),
      total_pct: pct(cur.total_members, prev.total_members), active_pct: pct(cur.active_members, prev.active_members), new_pct: pct(cur.new_members, prev.new_members),
      repeat_pct: pct(cur.repeat_members, prev.repeat_members),
    };
    const trendFrom = dayjs(month + '-01').subtract(11, 'month').format('YYYY-MM-01');
    const trendRaw = await safeDbQuery(
      `SELECT DATE_FORMAT(insert_time,'%Y-%m') m, COUNT(*) cnt FROM biz_vip_user v WHERE merchant_id=? AND insert_time>=? AND insert_time<=?${MC} GROUP BY 1`, [mid, trendFrom, to, ...P]);
    const trend = Array.from({ length: 12 }).map((_, i) => { const m = dayjs(trendFrom).add(i, 'month').format('YYYY-MM'); const hit = trendRaw.find(x => x.m === m); return { m, label: m.slice(5) + '月', value: hit ? Number(hit.cnt) : 0 }; });

    // 新开会员卡(人数, 按卡类型)
    const newCards = withPct(await safeDbQuery(
      `SELECT card_type_name name, COUNT(DISTINCT vip_id) cnt FROM biz_card_recharge WHERE merchant_id=? AND type=1 AND insert_time BETWEEN ? AND ?${C} GROUP BY card_type_name ORDER BY cnt DESC`,
      [mid, from, to, ...P]), 'cnt');
    // 教练有效课时
    const coachHours = withPct(await safeDbQuery(
      `SELECT MAX(coach_name) name, coach_id, SUM(costs) cnt FROM biz_ptrain_record WHERE merchant_id=? AND insert_time BETWEEN ? AND ?${C} GROUP BY coach_id ORDER BY cnt DESC`,
      [mid, from, to, ...P]), 'cnt');
    // 销售成单(按业绩归属)
    const salesOrders = withPct(await safeDbQuery(
      `SELECT IF(membership_name='','未归属',membership_name) name, COUNT(*) cnt FROM biz_card_recharge WHERE merchant_id=? AND actual_money>0 AND insert_time BETWEEN ? AND ?${C} GROUP BY 1 ORDER BY cnt DESC`,
      [mid, from, to, ...P]), 'cnt');
    // 预约排行 Top20(私教已确认/已完成 + 团课已预约/已核销)
    const bookingTop = withPct(await safeDbQuery(
      `SELECT name, SUM(cnt) cnt FROM (
         SELECT realname name, COUNT(*) cnt FROM biz_ptrain_bespeak_record WHERE merchant_id=? AND status IN (1,3) AND \`date\` BETWEEN ? AND ?${C} GROUP BY vip_id, realname
         UNION ALL
         SELECT realname name, COUNT(*) cnt FROM biz_syllabus_subscribe_record WHERE merchant_id=? AND status IN (1,2) AND class_start_time BETWEEN ? AND ?${C} GROUP BY vip_id, realname
       ) t GROUP BY name ORDER BY cnt DESC LIMIT 20`,
      [mid, from.slice(0, 10), to.slice(0, 10), ...P, mid, from, to, ...P]), 'cnt');
    const [{ n: bookingTotal }] = await safeDbQuery(
      `SELECT (SELECT COUNT(*) FROM biz_ptrain_bespeak_record WHERE merchant_id=? AND status IN (1,3) AND \`date\` BETWEEN ? AND ?${C})
            + (SELECT COUNT(*) FROM biz_syllabus_subscribe_record WHERE merchant_id=? AND status IN (1,2) AND class_start_time BETWEEN ? AND ?${C}) n`,
      [mid, from.slice(0, 10), to.slice(0, 10), ...P, mid, from, to, ...P]);
    bookingTop.sum = Number(bookingTotal);

    /* 明细板块登记表: 一处定义, CSV 导出与「明细预览页」共用同一份数据与口径。
       group=分组字段, item=预览页每条卡片取哪些字段(时间/主标题/副标题/金额) */
    const detailKey = String(req.query.detail || '');
    if (exp || detailKey) {
      const map = {
        new_cards: {
          title: `${month} 开卡记录`, unit: '张',
          headers: [['insert_time', '时间'], ['realname', '会员'], ['phone', '手机号'], ['club_name', '开卡门店'], ['card_type_name', '卡类型'], ['actual_money', '金额'], ['membership_name', '业绩归属']],
          group: 'card_type_name', item: { t: 'insert_time', title: 'realname', sub: 'membership_name', money: 'actual_money' },
          load: () => safeDbQuery(`SELECT cr.*, cl.name club_name FROM biz_card_recharge cr LEFT JOIN biz_club cl ON cl.id=cr.club_id
            WHERE cr.merchant_id=? AND cr.type=1 AND cr.insert_time BETWEEN ? AND ?${cw(club, 'cr.')} ORDER BY cr.insert_time`, [mid, from, to, ...P]),
        },
        coach_hours: {
          title: `${month} 上课记录`, unit: '节',
          headers: [['insert_time', '时间'], ['coach_name', '教练'], ['club_name', '开卡门店'], ['realname', '会员'], ['card_type_name', '卡类型'], ['costs', '课时'], ['spend_money', '课程价值']],
          group: 'coach_name', item: { t: 'insert_time', title: 'realname', sub: 'card_type_name', money: 'spend_money' },
          load: () => safeDbQuery(`SELECT p.*, cl.name club_name, c.card_type_name FROM biz_ptrain_record p
            LEFT JOIN biz_club cl ON cl.id=p.club_id LEFT JOIN biz_member_card c ON c.id=p.once_card_id
            WHERE p.merchant_id=? AND p.insert_time BETWEEN ? AND ?${cw(club, 'p.')} ORDER BY p.insert_time`, [mid, from, to, ...P]),
        },
        sales_orders: {
          title: `${month} 销售成单`, unit: '单',
          headers: [['insert_time', '时间'], ['membership_name', '业绩归属'], ['club_name', '开卡门店'], ['realname', '会员'], ['card_type_name', '卡类型'], ['actual_money', '金额']],
          group: 'membership_name', item: { t: 'insert_time', title: 'card_type_name', sub: 'realname', money: 'actual_money' },
          load: async () => (await safeDbQuery(`SELECT cr.*, cl.name club_name FROM biz_card_recharge cr LEFT JOIN biz_club cl ON cl.id=cr.club_id
            WHERE cr.merchant_id=? AND cr.actual_money>0 AND cr.insert_time BETWEEN ? AND ?${cw(club, 'cr.')} ORDER BY cr.insert_time`, [mid, from, to, ...P]))
            .map(x => ({ ...x, membership_name: x.membership_name || '未归属' })),
        },
        booking_top: {
          title: `${month} 预约记录`, unit: '次',
          headers: [['t', '时间'], ['realname', '会员'], ['kind', '类型'], ['title', '课程'], ['coach_name', '教练']],
          group: 'realname', item: { t: 't', title: 'title', sub: 'coach_name', money: '' },
          load: async () => [
            ...(await safeDbQuery(`SELECT CONCAT(\`date\`,' ',from_time) t, realname, '私教' kind, course_title title, coach_name FROM biz_ptrain_bespeak_record WHERE merchant_id=? AND status IN (1,3) AND \`date\` BETWEEN ? AND ?${C}`, [mid, from.slice(0, 10), to.slice(0, 10), ...P])),
            ...(await safeDbQuery(`SELECT class_start_time t, realname, '团课' kind, syllabus_title title, '' coach_name FROM biz_syllabus_subscribe_record WHERE merchant_id=? AND status IN (1,2) AND class_start_time BETWEEN ? AND ?${C}`, [mid, from, to, ...P])),
          ].sort((a, b) => String(a.t).localeCompare(String(b.t))),
        },
      };
      const sec = map[exp || detailKey];
      if (!sec) throw new BizError('未知导出板块: ' + (exp || detailKey));

      // 在这里添加额外的安全检查
      if (typeof sec.load !== 'function') {
        throw new BizError('导出配置错误：load方法不存在');
      }

      const rows = await sec.load();

      if (exp) return sendCsv(res, sec.title.replace(/ /g, '_'), sec.headers, rows.map(x => ({ ...x, insert_time: csvTime(x.insert_time), t: csvTime(x.t) })));
      return res.json(ok(groupDetail(sec, rows)));
    }
    res.json(ok({ month, club, summary, trend, newCards, coachHours, salesOrders, bookingTop }));
  } catch (e) { next(e); }
});


/* 把明细行按 sec.group 分组, 组装成预览页要的结构。
   日期拆成「几号 + 时分」两行, 与门店习惯的老系统样式一致。 */
function groupDetail(sec, rows) {
  const map = new Map();
  for (const row of rows) {
    const key = String(row[sec.group] == null || row[sec.group] === '' ? '未归属' : row[sec.group]);
    if (!map.has(key)) map.set(key, []);
    const t = row[sec.item.t];
    const d = t ? dayjs(t) : null;
    map.get(key).push({
      day: d && d.isValid() ? d.format('D') : '',
      // 导入的历史数据只有日期, 时分是 00:00, 显示出来是噪音
      time: d && d.isValid() && d.format('HH:mm') !== '00:00' ? d.format('HH:mm') : '',
      title: row[sec.item.title] || '',
      sub: sec.item.sub ? (row[sec.item.sub] || '') : '',
      money: sec.item.money ? Number(row[sec.item.money] || 0) : null,
    });
  }
  const groups = [...map.entries()].map(([name, items]) => ({ name, count: items.length, items }))
    .sort((a, b) => b.count - a.count);
  return { title: sec.title, unit: sec.unit, total: rows.length, groups };
}

/* ============ 财务报表(财务数据) ============ */
r.get('/report/finance', staffAuth(), async (req, res, next) => {
  try {
    await lifecycleTick();
    const mid = req.user.mid; const club = clubScope(req); const C = cw(club); const P = cp(club);
    const month = req.query.month || dayjs().format('YYYY-MM');
    const lastMonth = dayjs(month + '-01').subtract(1, 'month').format('YYYY-MM');
    const [from, to] = monthRange(month);
    const exp = req.query.export === 'csv' ? String(req.query.section || '') : '';

    async function core(m) {
      const [a, b] = monthRange(m);
      const [row] = await db.query(
        `SELECT
          COALESCE(SUM(actual_money),0) revenue,
          COALESCE(SUM(IF(is_new_user=0 AND actual_money>0, actual_money, 0)),0) repeat_revenue,
          COALESCE(SUM(IF(is_new_user=1 AND actual_money>0, actual_money, 0)),0) new_user_revenue
         FROM biz_card_recharge WHERE merchant_id=? AND insert_time BETWEEN ? AND ?${C}`, [mid, a, b, ...P]);
      return row;
    }
    const cur = await core(month); const prev = await core(lastMonth);
    const summary = {
      revenue: Number(cur.revenue), repeat_revenue: Number(cur.repeat_revenue), new_user_revenue: Number(cur.new_user_revenue),
      revenue_pct: pct(cur.revenue, prev.revenue), repeat_pct: pct(cur.repeat_revenue, prev.repeat_revenue), new_user_pct: pct(cur.new_user_revenue, prev.new_user_revenue),
    };
    const trendFrom = dayjs(month + '-01').subtract(11, 'month').format('YYYY-MM-01');
    const trendRaw = await db.query(
      `SELECT DATE_FORMAT(insert_time,'%Y-%m') m, SUM(actual_money) money FROM biz_card_recharge WHERE merchant_id=? AND insert_time>=? AND insert_time<=?${C} GROUP BY 1`, [mid, trendFrom, to, ...P]);
    const trend = Array.from({ length: 12 }).map((_, i) => { const m = dayjs(trendFrom).add(i, 'month').format('YYYY-MM'); const hit = trendRaw.find(x => x.m === m); return { m, label: m.slice(5) + '月', value: hit ? Number(hit.money) : 0 }; });

    // 会员卡营收(按卡类型); 储值卡充值单独一行
    const byCard = withPct(await db.query(
      `SELECT IF(card_kind=3,'储值卡充值',card_type_name) name, SUM(actual_money) money FROM biz_card_recharge WHERE merchant_id=? AND insert_time BETWEEN ? AND ?${C} GROUP BY 1 ORDER BY money DESC`,
      [mid, from, to, ...P]), 'money');
    // 销售业绩(按业绩归属)
    const sales = withPct(await db.query(
      `SELECT IF(membership_name='','未归属',membership_name) name, SUM(actual_money) money, COUNT(*) orders FROM biz_card_recharge WHERE merchant_id=? AND insert_time BETWEEN ? AND ?${C} GROUP BY 1 ORDER BY money DESC`,
      [mid, from, to, ...P]), 'money');
    // 人效: 教练所有课程价值(私教消课 + 团课核销, 团课按实际约课人数的耗卡金额)
    const staffValue = withPct(await db.query(
      `SELECT IF(coach_name='' OR coach_name IS NULL,'未指定教练',coach_name) name, SUM(spend_money) money, SUM(costs) lessons FROM biz_card_spend
       WHERE merchant_id=? AND scene IN (2,3) AND insert_time BETWEEN ? AND ?${C} GROUP BY 1 ORDER BY money DESC`,
      [mid, from, to, ...P]), 'money');
    const [{ accrual }] = await db.query(`SELECT COALESCE(SUM(spend_money),0) accrual FROM biz_card_spend WHERE merchant_id=? AND insert_time BETWEEN ? AND ?${C}`, [mid, from, to, ...P]);

    const detailKey = String(req.query.detail || '');
    if (exp || detailKey) {
      // 收款流水(带门店), 三个板块里有两个用它
      const rech = async () => (await db.query(
        `SELECT cr.*, cl.name club_name FROM biz_card_recharge cr LEFT JOIN biz_club cl ON cl.id=cr.club_id
         WHERE cr.merchant_id=? AND cr.insert_time BETWEEN ? AND ?${cw(club, 'cr.')} ORDER BY cr.insert_time`, [mid, from, to, ...P]))
        .map(x => ({ ...x, pay_label: PAY_METHODS[x.pay_method] || x.pay_method, type_label: ['', '开卡', '续卡', '充值', '退卡'][x.type] || '', kind_label: CARD_KIND[x.card_kind] || '', membership_name: x.membership_name || '未归属' }));
      const map = {
        by_card: {
          title: `${month} 会员卡营收`, unit: '笔',
          headers: [['insert_time', '时间'], ['club_name', '开卡门店'], ['realname', '会员'], ['card_type_name', '卡类型'], ['kind_label', '卡种'], ['type_label', '类型'], ['actual_money', '金额'], ['pay_label', '支付方式']],
          group: 'card_type_name', item: { t: 'insert_time', title: 'realname', sub: 'type_label', money: 'actual_money' },
          load: rech,
        },
        sales: {
          title: `${month} 销售业绩`, unit: '笔',
          headers: [['insert_time', '时间'], ['membership_name', '业绩归属'], ['club_name', '开卡门店'], ['realname', '会员'], ['card_type_name', '卡类型'], ['actual_money', '金额'], ['ope_username', '经手人']],
          group: 'membership_name', item: { t: 'insert_time', title: 'realname', sub: 'card_type_name', money: 'actual_money' },
          load: rech,
        },
        staff_value: {
          title: `${month} 人效明细`, unit: '节',
          headers: [['insert_time', '时间'], ['coach_name', '教练'], ['club_name', '开卡门店'], ['realname', '会员'], ['card_type_name', '卡类型'], ['scene_label', '场景'], ['costs', '课时'], ['spend_money', '课程价值']],
          group: 'coach_name', item: { t: 'insert_time', title: 'realname', sub: 'card_type_name', money: 'spend_money' },
          load: async () => (await db.query(
            `SELECT sp.*, cl.name club_name FROM biz_card_spend sp LEFT JOIN biz_club cl ON cl.id=sp.club_id
             WHERE sp.merchant_id=? AND sp.scene IN (2,3) AND sp.insert_time BETWEEN ? AND ?${cw(club, 'sp.')} ORDER BY sp.insert_time`, [mid, from, to, ...P]))
            .map(x => ({ ...x, scene_label: x.scene === 2 ? '私教消课' : '团课核销', coach_name: x.coach_name || '未指定教练' })),
        },
      };
      const sec = map[exp || detailKey];
      if (!sec) throw new BizError('未知导出板块');
      const rows = await sec.load();
      if (exp) return sendCsv(res, sec.title.replace(/ /g, '_'), sec.headers, rows.map(x => ({ ...x, insert_time: csvTime(x.insert_time) })));
      return res.json(ok(groupDetail(sec, rows)));
    }
    res.json(ok({ month, club, summary, trend, byCard, sales, staffValue, accrual: Number(accrual) }));
  } catch (e) { next(e); }
});

/* ============ 我的业绩 ============ */
r.get('/report/mine', staffAuth(), async (req, res, next) => {
  try {
    await lifecycleTick();
    const mid = req.user.mid;
    const month = req.query.month || dayjs().format('YYYY-MM');
    const [from, to] = monthRange(month);
    // admin/manager 可查看指定员工
    let uid = req.user.uid;
    if (req.query.user_id && ['admin', 'manager'].includes(req.user.role)) uid = Number(req.query.user_id);
    const u = await db.queryOne('SELECT id,realname,role,base_salary,sales_rate,course_rate FROM sys_user WHERE id=? AND merchant_id=?', [uid, mid]);
    if (!u) throw new BizError('员工不存在');
    const coach = await db.queryOne('SELECT id FROM biz_club_coach WHERE user_id=? AND merchant_id=?', [uid, mid]);
    const coachId = coach ? coach.id : 0;
    const exp = req.query.export === 'csv' ? String(req.query.section || 'ranking') : '';

    const [s] = await db.query(
      `SELECT COUNT(*) orders, COALESCE(SUM(actual_money),0) money FROM biz_card_recharge WHERE merchant_id=? AND membership_id=? AND actual_money>0 AND insert_time BETWEEN ? AND ?`,
      [mid, uid, from, to]);
    const [c] = coachId
      ? await db.query(`SELECT COALESCE(SUM(costs),0) lessons, COALESCE(SUM(spend_money),0) money FROM biz_ptrain_record WHERE merchant_id=? AND coach_id=? AND insert_time BETWEEN ? AND ?`, [mid, coachId, from, to])
      : [{ lessons: 0, money: 0 }];
    const [m] = await db.query(
      `SELECT
        (SELECT COUNT(*) FROM biz_vip_user WHERE merchant_id=? AND membership_id=? AND insert_time BETWEEN ? AND ?) new_members,
        (SELECT COUNT(*) FROM biz_vip_user WHERE merchant_id=? AND membership_id=? AND expire_status=2 AND expire_time BETWEEN ? AND ?) lost_members,
        (SELECT COUNT(*) FROM biz_user_potential WHERE merchant_id=? AND membership_id=? AND insert_time BETWEEN ? AND ?) new_visitors,
        (SELECT COUNT(*) FROM biz_vip_user WHERE merchant_id=? AND membership_id=? AND status=1 AND expire_status=1) active_members,
        (SELECT COUNT(*) FROM biz_vip_user WHERE merchant_id=? AND membership_id=? AND status=1 AND expire_status=2) expired_members,
        (SELECT COUNT(*) FROM biz_user_potential WHERE merchant_id=? AND membership_id=? AND is_vip_user=0 AND status=1) visitors`,
      [mid, uid, from, to, mid, uid, from, to, mid, uid, from, to, mid, uid, mid, uid, mid, uid]);
    const salesCommission = +(Number(s.money) * Number(u.sales_rate) / 100).toFixed(2);
    const courseCommission = +(Number(c.money) * Number(u.course_rate) / 100).toFixed(2);
    const income = +(Number(u.base_salary) + salesCommission + courseCommission).toFixed(2);

    // 业绩排行(全员, 按销售金额)
    const ranking = withPct(await db.query(
      `SELECT IF(membership_name='','未归属',membership_name) name, membership_id, SUM(actual_money) money, COUNT(*) orders FROM biz_card_recharge
       WHERE merchant_id=? AND actual_money>0 AND insert_time BETWEEN ? AND ? GROUP BY membership_id, membership_name ORDER BY money DESC`, [mid, from, to]), 'money');

    if (exp) {
      const rows = (await db.query(`SELECT * FROM biz_card_recharge WHERE merchant_id=? AND membership_id=? AND insert_time BETWEEN ? AND ? ORDER BY id DESC`, [mid, uid, from, to]))
        .map(x => ({ ...x, insert_time: csvTime(x.insert_time), pay_label: PAY_METHODS[x.pay_method] || x.pay_method, type_label: ['', '开卡', '续卡', '充值', '退卡'][x.type] || '' }));
      return sendCsv(res, `我的业绩明细_${u.realname}_${month}`, [['insert_time', '时间'], ['realname', '会员'], ['phone', '手机号'], ['card_type_name', '卡类型'], ['type_label', '类型'], ['actual_money', '金额'], ['pay_label', '支付方式']], rows);
    }
    res.json(ok({
      month, user: { id: u.id, realname: u.realname, role: u.role, is_coach: !!coachId },
      income: { total: income, base_salary: Number(u.base_salary), sales_commission: salesCommission, course_commission: courseCommission, sales_rate: Number(u.sales_rate), course_rate: Number(u.course_rate) },
      sales: { orders: Number(s.orders), money: Number(s.money), new_members: Number(m.new_members), lost_members: Number(m.lost_members), new_visitors: Number(m.new_visitors) },
      course: { lessons: Number(c.lessons), money: Number(c.money) },
      members: { active: Number(m.active_members), expired: Number(m.expired_members), visitors: Number(m.visitors) },
      ranking,
    }));
  } catch (e) { next(e); }
});

// 员工列表(我的业绩页给管理员切换用)
r.get('/report/staff-options', staffAuth('admin', 'manager'), async (req, res, next) => {
  try {
    res.json(ok(await db.query("SELECT id, realname, role FROM sys_user WHERE merchant_id=? AND status=1 AND role<>'platform' ORDER BY id", [req.user.mid])));
  } catch (e) { next(e); }
});

module.exports = r;
