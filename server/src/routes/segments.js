/* 会员分群 / 提醒面板
 * 设计: 配置化注册表 SEGMENTS, 新增筛选维度只需在此加一条, 前后端自动生效。
 * 权限: 教练只看名下会员(主/副教练=本人); admin/manager 看全部(跟随 clubScope 门店口径)。
 */
const express = require('express');
const dayjs = require('dayjs');
const db = require('../db');
const { ok, BizError, page } = require('../util');
const { staffAuth } = require('../middleware/auth');

const r = express.Router();

const LOW_LESSON = 10;          // 剩余课时预警阈值(节)
const COUNT_KINDS = '1,4';      // 计次卡种: 1次卡 4私教卡
const LIVE_CARD = '0,1';        // 有效卡状态: 0待开卡 1使用中

/* 计算列: 各分群的判定与展示都基于这些别名 */
const CALC = `
  CAST((SELECT COALESCE(SUM(c.left_counts),0) FROM biz_member_card c
     WHERE c.vip_id=v.id AND c.card_kind IN (${COUNT_KINDS}) AND c.status IN (${LIVE_CARD})) AS SIGNED) left_total,
  (SELECT COUNT(*) FROM biz_member_card c
     WHERE c.vip_id=v.id AND c.card_kind IN (${COUNT_KINDS}) AND c.status IN (${LIVE_CARD})) cnt_cards,
  ((SELECT COUNT(*) FROM biz_ptrain_record pr WHERE pr.vip_id=v.id AND pr.insert_time >= DATE_FORMAT(NOW(), '%Y-%m-01 00:00:00'))
   + (SELECT COUNT(*) FROM biz_syllabus_subscribe_record sb WHERE sb.vip_id=v.id AND sb.status=2 AND sb.class_start_time >= DATE_FORMAT(NOW(), '%Y-%m-01 00:00:00'))) trained_month,
  ((SELECT COUNT(*) FROM biz_ptrain_record pr WHERE pr.vip_id=v.id AND pr.insert_time >= DATE_SUB(NOW(), INTERVAL 6 MONTH))
   + (SELECT COUNT(*) FROM biz_syllabus_subscribe_record sb WHERE sb.vip_id=v.id AND sb.status=2 AND sb.class_start_time >= DATE_SUB(NOW(), INTERVAL 6 MONTH))) trained_half_year,
  ((SELECT COUNT(*) FROM biz_ptrain_record pr WHERE pr.vip_id=v.id)
   + (SELECT COUNT(*) FROM biz_syllabus_subscribe_record sb WHERE sb.vip_id=v.id AND sb.status=2)) trained,
  (SELECT COUNT(*) FROM biz_member_card c WHERE c.vip_id=v.id AND c.card_kind=2 AND c.status IN (${LIVE_CARD})) tc_active,
  (SELECT COUNT(*) FROM biz_member_card c WHERE c.vip_id=v.id AND c.card_kind=2 AND c.status=2) tc_expired
`;

/* 本周(周一~周日)的 MM-DD 列表, 用于生日匹配(忽略年份) */
function weekMonthDays() {
  const mon = dayjs().startOf('week').add(dayjs().day() === 0 ? -6 : 1, 'day');
  return Array.from({ length: 7 }, (_, i) => mon.add(i, 'day').format('MM-DD'));
}

/* ---- 分群注册表 ---- 新增维度在此追加即可 */
const SEGMENTS = {
  low_lesson: {
    title: '课时不足', icon: 'warning-o', desc: `剩余课时少于 ${LOW_LESSON} 节`,
    having: `cnt_cards > 0 AND left_total < ?`, params: (q) => [Number(q.threshold) || LOW_LESSON],
    sortField: 'left_total', defaultSort: 'asc',
  },
  birthday_week: {
    title: '本周生日', icon: 'gift-o', desc: '本周过生日的会员',
    where: () => {
      const days = weekMonthDays();
      return { sql: `v.birthday IS NOT NULL AND DATE_FORMAT(v.birthday,'%m-%d') IN (${days.map(() => '?').join(',')})`, params: days };
    },
    sortField: `DATE_FORMAT(v.birthday,'%m-%d')`, defaultSort: 'asc',
  },
  trained_10: {
    title: '当月满10次', icon: 'medal-o', desc: '当月训练满 10 次',
    having: 'trained_month >= 10', sortField: 'trained_month', defaultSort: 'desc',
  },
  trained_50: {
    title: '半年满50次', icon: 'diamond-o', desc: '半年内训练满 50 次',
    having: 'trained_half_year >= 50', sortField: 'trained_half_year', defaultSort: 'desc',
  },
  trained_20: { // 兼容旧路由与历史书签
    title: '半年满50次', icon: 'diamond-o', desc: '半年内训练满 50 次',
    having: 'trained_half_year >= 50', sortField: 'trained_half_year', defaultSort: 'desc',
  },
  timecard_active: {
    title: '有效期卡', icon: 'card', desc: '持有有效期卡(时间卡)的会员',
    having: 'tc_active > 0', sortField: 'left_total', defaultSort: 'desc',
  },
  timecard_expired: {
    title: '已过期期卡', icon: 'underway-o', desc: '期卡已过期的会员',
    having: 'tc_expired > 0', sortField: 'trained', defaultSort: 'desc',
  },
};

/* 权限与门店口径 */
function scope(req) {
  const cond = ['v.merchant_id=?', 'v.status=1'];
  const params = [req.user.mid];
  if (req.user.role === 'coach') {
    const cid = req.user.coachId || 0;
    cond.push('(v.coach_id=? OR v.sub_coach_id=?)');
    params.push(cid, cid);
  } else if (req.clubScope) {
    cond.push('EXISTS (SELECT 1 FROM biz_member_card mc WHERE mc.vip_id=v.id AND mc.club_id=?)');
    params.push(req.clubScope);
  }
  return { cond, params };
}

/* 拼出某分群的 WHERE / HAVING 与参数 */
function build(req, key, q) {
  const seg = SEGMENTS[key];
  if (!seg) throw new BizError('未知的分群: ' + key);
  const { cond, params } = scope(req);
  if (seg.where) { const w = seg.where(q); cond.push(w.sql); params.push(...w.params); }
  const having = seg.having || '';
  const hParams = seg.having && seg.params ? seg.params(q) : [];
  return { seg, where: cond.join(' AND '), params, having, hParams };
}

/* 各面板数量(工作台角标) */
r.get('/member-segments', staffAuth(), async (req, res, next) => {
  try {
    const out = [];
    for (const key of Object.keys(SEGMENTS)) {
      if (key === 'trained_20') continue; // 兼容 key, 避免面板列表中重复出现
      const { seg, where, params, having, hParams } = build(req, key, req.query);
      const sql = `SELECT COUNT(*) n FROM (
                     SELECT v.id, ${CALC} FROM biz_vip_user v WHERE ${where}
                     ${having ? `HAVING ${having}` : ''}
                   ) t`;
      const [{ n }] = await db.query(sql, [...params, ...hParams]);
      out.push({ key, title: seg.title, icon: seg.icon, desc: seg.desc, count: n, sortable: !!seg.sortField });
    }
    res.json(ok(out));
  } catch (e) { next(e); }
});

/* 某分群的会员名单 */
r.get('/member-segments/:key', staffAuth(), async (req, res, next) => {
  try {
    const { p, size, offset } = page(req);
    const { seg, where, params, having, hParams } = build(req, req.params.key, req.query);

    let order = 'v.id DESC';
    if (seg.sortField) {
      const dir = (req.query.sort || seg.defaultSort) === 'desc' ? 'DESC' : 'ASC';
      order = `${seg.sortField} ${dir}, v.id DESC`;
    }
    const base = `FROM biz_vip_user v WHERE ${where}`;
    const sel = `SELECT v.id, v.realname, v.phone, v.avatar, v.gender, v.birthday,
                        v.coach_id, v.coach_name, v.expire_status, v.expire_time, ${CALC} ${base}
                 ${having ? `HAVING ${having}` : ''} ORDER BY ${order} LIMIT ? OFFSET ?`;
    const rows = await db.query(sel, [...params, ...hParams, size, offset]);
    const [{ n: total }] = await db.query(
      `SELECT COUNT(*) n FROM (SELECT v.id, ${CALC} ${base} ${having ? `HAVING ${having}` : ''}) t`,
      [...params, ...hParams]);

    res.json(ok({ list: rows, total, p, size, title: seg.title, desc: seg.desc, sortable: !!seg.sortField }));
  } catch (e) { next(e); }
});

module.exports = r;
module.exports.SEGMENTS = SEGMENTS;
