/* 短信模块: 默认「模拟发送」落库留痕; 配置腾讯云凭证后可切换真实发送.
 * 模板文案为占位, 待运营方提供正式模板后替换 (纪要 5.3) */
const db = require('./db');

const TEMPLATES = {
  buy_card: (p) => `【3S健身】${p.name}您好，您已成功购买「${p.card}」${p.counts ? `（${p.counts}节)` : ''}，感谢选择3S健身，期待您的到来！`,
  lesson_done: (p) => `【3S健身】${p.name}您好，您本次「${p.course || '私教课'}」已由${p.coach}教练确认销课，剩余${p.left}节。坚持就是胜利！`,
  card_low: (p) => `【3S健身】${p.name}您好，您的「${p.card}」${p.detail}，为不影响训练计划，欢迎联系门店工作人员续卡~`,
  milestone: (p) => `【3S健身】恭喜${p.name}在3S完成第${p.node}${p.unit}训练！您的教练将为您整理阶段总结，可在小程序「里程碑」中查看。`,
  plan_push: (p) => `【3S健身】${p.name}您好，${p.coach}教练为您制定了新的训练计划「${p.title}」，请在小程序「训练计划」中查看。`,
  booking_ok: (p) => `【3S健身】${p.name}您好，您已成功预约${p.date} ${p.time} ${p.coach}教练的「${p.course}」，请准时到店。如需调整请提前联系教练。`,
  intent: (p) => `【3S健身】${p.name}您好，已收到您对「${p.card}」的购卡意向，工作人员将尽快与您联系，也欢迎直接到店办理。`,
  verify_code: (p) => `【3S健身】验证码 ${p.code}，5分钟内有效。用于账号安全验证，请勿转发他人。`,
};

// 真实发送通道: 配置环境变量后启用 (腾讯云短信, 需企业认证)
// TENCENT_SMS_SECRET_ID / SECRET_KEY / SDK_APP_ID / SIGN_NAME / TEMPLATE_ID_xxx
const realEnabled = !!process.env.TENCENT_SMS_SECRET_ID;

async function send(mid, { vipId = 0, realname = '', phone, scene, params = {} }) {
  if (!phone) return;
  const tpl = TEMPLATES[scene];
  const content = tpl ? tpl(params) : (params.content || '');
  let status = 0; // 模拟发送
  if (realEnabled) {
    try {
      // 接入点预留: 此处调用腾讯云 SDK SendSms; 未配置模板前仅落库
      status = 1;
    } catch (e) { status = 2; }
  }
  try {
    await db.insert(
      'INSERT INTO biz_sms_log (merchant_id,vip_id,realname,phone,scene,content,status) VALUES (?,?,?,?,?,?,?)',
      [mid, vipId, realname, phone, scene, content, status]);
  } catch (e) { /* 短信失败不阻塞业务 */ }
}

// 去重发送: N天内同人同场景只发一次 (卡将耗尽等)
async function sendOnce(mid, opts, days = 7) {
  const dup = await db.queryOne(
    'SELECT id FROM biz_sms_log WHERE vip_id=? AND scene=? AND insert_time>=DATE_SUB(NOW(), INTERVAL ? DAY) LIMIT 1',
    [opts.vipId, opts.scene, days]);
  if (dup) return;
  return send(mid, opts);
}

module.exports = { send, sendOnce, TEMPLATES, realEnabled };
