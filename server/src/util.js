const dayjs = require('dayjs');
const db = require('./db');

const ok = (data = null) => ({ code: 0, msg: 'ok', data });
const fail = (msg, code = 1) => ({ code, msg, data: null });

// 业务错误（会被全局错误处理转成 200 + code!=0 返回）
class BizError extends Error {
  constructor(msg, code = 1) { super(msg); this.biz = true; this.code = code; }
}

function page(req) {
  const p = Math.max(1, parseInt(req.query.page) || 1);
  const size = Math.min(200, Math.max(1, parseInt(req.query.size) || 20));
  return { p, size, offset: (p - 1) * size };
}

const now = () => dayjs().format('YYYY-MM-DD HH:mm:ss');
const fmt = (d) => dayjs(d).format('YYYY-MM-DD HH:mm:ss');

async function logAction(req, action, detail = '') {
  try {
    const u = req.user || {};
    await db.insert(
      'INSERT INTO sys_log (merchant_id,club_id,user_id,username,action,detail) VALUES (?,?,?,?,?,?)',
      [u.mid || 0, u.cid || 0, u.uid || u.vip || 0, u.name || '', action, String(detail).slice(0, 490)]);
  } catch (e) { /* 日志失败不影响业务 */ }
}

// ---- 卡生命周期滴答: 过期/自动激活/暂停恢复 + 会员快照, 60s 节流 ----
let lastTick = 0;
async function lifecycleTick(force = false) {
  if (!force && Date.now() - lastTick < 60000) return;
  lastTick = Date.now();
  const n = now();
  // 使用中 -> 已过期
  await db.exec('UPDATE biz_member_card SET status=2 WHERE status=1 AND expire_time IS NOT NULL AND expire_time < ?', [n]);
  // 暂停到期 -> 恢复使用
  await db.exec('UPDATE biz_member_card SET status=1, suspend_start_time=NULL, suspend_end_time=NULL WHERE status=3 AND suspend_end_time IS NOT NULL AND suspend_end_time < ?', [n]);
  // 待开卡超过最晚开卡日期 -> 自动激活
  const stale = await db.query('SELECT id, latest_open_time, expire_days FROM biz_member_card WHERE status=0 AND latest_open_time IS NOT NULL AND latest_open_time < ?', [n]);
  for (const c of stale) {
    const openT = c.latest_open_time;
    const expT = dayjs(openT).add(c.expire_days, 'day').endOf('day').format('YYYY-MM-DD HH:mm:ss');
    await db.exec('UPDATE biz_member_card SET status=IF(?<NOW(),2,1), open_card_time=?, start_use_time=?, expire_time=? WHERE id=?',
      [expT, openT, openT, expT, c.id]);
  }
  // 成长域日巡检: 按天里程碑 + 卡将耗尽短信 (1小时节流)
  if (!lifecycleTick._lastGrowth || Date.now() - lifecycleTick._lastGrowth > 3600000) {
    lifecycleTick._lastGrowth = Date.now();
    try { await require('./routes/growth').dailyGrowthTick(); } catch (e) { console.error('growth tick:', e.message); }
  }
  // 会员到期快照
  await db.exec(`UPDATE biz_vip_user v SET
    expire_time = (SELECT MAX(expire_time) FROM biz_member_card c WHERE c.vip_id=v.id AND c.status IN (0,1,3)),
    expire_status = CASE
      WHEN EXISTS (SELECT 1 FROM biz_member_card c WHERE c.vip_id=v.id AND c.status IN (0,1,3)) THEN 1
      WHEN EXISTS (SELECT 1 FROM biz_member_card c WHERE c.vip_id=v.id) THEN 2
      ELSE 0 END`);
}

// 激活待开卡（首次使用触发）
async function activateCard(cardId) {
  const c = await db.queryOne('SELECT * FROM biz_member_card WHERE id=?', [cardId]);
  if (!c || c.status !== 0) return c;
  const openT = now();
  const expT = dayjs().add(c.expire_days, 'day').endOf('day').format('YYYY-MM-DD HH:mm:ss');
  await db.exec('UPDATE biz_member_card SET status=1, open_card_time=?, start_use_time=?, expire_time=? WHERE id=?', [openT, openT, expT, cardId]);
  return db.queryOne('SELECT * FROM biz_member_card WHERE id=?', [cardId]);
}

// CSV 导出
function sendCsv(res, filename, headers, rows) {
  const esc = (v) => {
    if (v == null) return '';
    const s = String(v);
    return /[",\n]/.test(s) ? `"${s.replace(/"/g, '""')}"` : s;
  };
  const body = [headers.map(h => h[1]).join(','), ...rows.map(r => headers.map(h => esc(r[h[0]])).join(','))].join('\n');
  res.setHeader('Content-Type', 'text/csv; charset=utf-8');
  res.setHeader('Content-Disposition', `attachment; filename*=UTF-8''${encodeURIComponent(filename)}.csv`);
  res.send('﻿' + body);
}

// ---- 约课用卡规则 (2026-09-21: 任何卡种都可预约任何课程) ----
// 次卡/私教卡 按次扣; 时间卡不扣次; 储值卡按余额(无单价则不扣)
const COUNT_KINDS = [1, 4];
const cardDeduct = (kind, num = 1) => (COUNT_KINDS.includes(Number(kind)) ? (Number(num) || 0) : 0);
// 返回 '' 表示可用于约课, 否则返回不可用的原因(给会员看)
function cardBlockReason(c) {
  if (!c) return '卡不存在';
  if (c.status === 2) return '已于 ' + dayjs(c.expire_time).format('YYYY-MM-DD') + ' 到期';
  if (![0, 1].includes(c.status)) return (CARD_STATUS[c.status] || '不可用') + '，暂不能约课';
  if (COUNT_KINDS.includes(Number(c.card_kind)) && Number(c.left_counts) < 1) return '剩余次数为 0';
  if (Number(c.card_kind) === 3 && Number(c.left_money) <= 0) return '储值余额为 0';
  return '';
}

const PAY_METHODS = { wechat: '微信支付', alipay: '支付宝', cash: '现金', pos: 'POS刷卡', transfer: '转账', store: '储值卡抵扣', meituan: '美团/大众', other: '其他', import: '历史导入' };
const CARD_KIND = { 1: '次卡', 2: '时间卡', 3: '储值卡', 4: '私教卡' };
const CARD_STATUS = { 0: '待开卡', 1: '使用中', 2: '已过期', 3: '已暂停', 4: '已停用', 5: '已退卡' };

function contractTemplate({ realname, phone, catTitle, actual, counts, expireDays, payLabel, time, extra = '', clubName = '', retainage = 0 }) {
  return `甲方（会员）：${realname}（${phone}）
乙方（商户）：3S运动中心（统一社会信用代码 91510100XXXXXXXXXX）${clubName ? `\n服务门店：${clubName}` : ''}

一、服务内容
1.1 甲方购买乙方「${catTitle}」，实收金额 ¥${actual}，${counts ? `共 ${counts} 次，` : ''}有效期 ${expireDays} 天，支付方式：${payLabel}。${extra}
${retainage > 0 ? `1.2 本次尚有尾款 ¥${retainage} 未结清，甲方应于约定期限内补足；尾款未结清期间乙方有权暂停相应服务。\n1.3` : '1.2'} 有效期自开卡之日起算；选择「首次使用时开卡」的，自首次到店使用之日起算。
${retainage > 0 ? '1.4' : '1.3'} 团体课需提前预约，私教课由教练与甲方约定时间；课时以实际上课核销为准，预约本身不扣减课时。

二、双方权利义务
2.1 会员卡仅限甲方本人使用，不得转借他人；转卡、退卡须经门店审核同意。
2.2 甲方应如实告知自身健康状况，遵守场馆管理规定并在教练指导下安全训练；因隐瞒疾病史、既往伤病或不当使用器械造成的后果，由甲方自行承担。
2.3 甲方随身财物请自行妥善保管，贵重物品建议存放前台；乙方对未寄存物品的遗失不承担保管责任。
2.4 乙方应保持器械与场地安全可用，按约定提供教练及课程服务；因设备检修、场地改造等原因需暂停营业的，乙方应提前公示，有效期相应顺延。

三、变更与终止
3.1 因甲方个人原因申请退卡的，按剩余价值扣除已消费部分及手续费后退还。
3.2 甲方因伤病、孕产、长期出差等正当事由，可凭证明申请暂停会籍（请假），暂停期间有效期顺延。
3.3 甲方严重违反场馆规定且经劝阻无效的，乙方有权终止本合同并按剩余价值退款。

四、其他
4.1 本合同自甲方签署之日起生效，电子签名与手写签名具有同等效力。
4.2 甲方同意乙方为履行本合同处理其姓名、联系方式及训练记录，乙方不得用于约定之外的用途。
4.3 未尽事宜由双方协商解决；协商不成的，可向乙方所在地有管辖权的人民法院提起诉讼。

生成时间：${time}`;
}

module.exports = { ok, fail, BizError, page, now, fmt, logAction, lifecycleTick, activateCard, sendCsv, contractTemplate, PAY_METHODS, CARD_KIND, CARD_STATUS, COUNT_KINDS, cardDeduct, cardBlockReason };

/* ============ 会员卡剩余价值 ============
 * 口径(2026-09-24 与门店确认):
 *   储值卡  = 余额 + 剩余赠额
 *   计次卡  = 剩余次数 × 实收单价
 *   期卡    = 实收 × 剩余天数 / 总有效天数 (直线摊销; 待开卡的算整张)
 *   已过期/已停用/已退卡 一律计 0 (门店已无履约义务)
 * 退卡金额、剩余价值报表、财务负债口径共用这一套, 避免两处算出不同的数。
 */
const REMAIN_VALUE_SQL = `CASE
  WHEN c.status NOT IN (0,1,3) THEN 0
  WHEN c.card_kind=3 THEN ROUND(COALESCE(c.left_money,0)+COALESCE(c.left_gift_money,0),2)
  WHEN c.counts>0 THEN ROUND(COALESCE(c.left_counts,0)*COALESCE(c.unit_price,0),2)
  WHEN c.expire_time IS NULL THEN ROUND(COALESCE(c.actual_money,0),2)
  WHEN COALESCE(c.expire_days,0)>0 THEN ROUND(COALESCE(c.actual_money,0)
       * LEAST(GREATEST(DATEDIFF(c.expire_time, CURDATE()),0), c.expire_days) / c.expire_days, 2)
  ELSE 0 END`;

// JS 版(单张卡用), 与上面的 SQL 必须保持一致
function cardRemainValue(c) {
  if (!c || ![0, 1, 3].includes(c.status)) return 0;
  const r2 = (n) => Math.round((Number(n) || 0) * 100) / 100;
  if (c.card_kind === 3) return r2(Number(c.left_money || 0) + Number(c.left_gift_money || 0));
  if (Number(c.counts) > 0) return r2(Number(c.left_counts || 0) * Number(c.unit_price || 0));
  if (!c.expire_time) return r2(c.actual_money);
  const days = Number(c.expire_days || 0);
  if (days <= 0) return 0;
  // 与 SQL 的 DATEDIFF 对齐: 只比日期, 不看时分秒(到期日通常是 23:59:59)
  const dayOf = (d) => { const x = new Date(d); return new Date(x.getFullYear(), x.getMonth(), x.getDate()); };
  const left = Math.min(Math.max(Math.round((dayOf(c.expire_time) - dayOf(new Date())) / 86400000), 0), days);
  return r2(Number(c.actual_money || 0) * left / days);
}

module.exports.REMAIN_VALUE_SQL = REMAIN_VALUE_SQL;
module.exports.cardRemainValue = cardRemainValue;
