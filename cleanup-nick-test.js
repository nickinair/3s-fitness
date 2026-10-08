/* 清理 Nick(vip_id=290) 在 2026-09-23 联调期间产生的测试数据。
 * 保留会员账号本身, 只删当天造出来的卡/流水/合同/意向/计划/短信/日志。
 * 删除前把所有受影响的行原样备份成 JSON, 便于回滚。 */
const fs = require('fs');
const path = require('path');
const db = require('./server/src/db');

const VIP = 290;
const DAY = '2026-09-23';   // 这些测试数据全部产生于当天, 与此不符即中止
const CARD_IDS = [539, 540];
const RECHARGE_IDS = [279, 280];
const CONTRACT_IDS = [39, 40];
const PLAN_IDS = [8];
const INTENT_IDS = [3, 4];
const SMS_IDS = [131, 132, 133, 134, 135, 136];
const LOG_IDS = [416, 417];

const inList = (a) => a.join(',');

(async () => {
  // ---- 0. 防呆: 确认这些行确实属于 Nick, 且都是 09-23 当天产生的 ----
  // 注意用本地日期, 不能用 toISOString(): 凌晨 03:16 CST 在 UTC 下是前一天
  const localDay = (d) => {
    const x = new Date(d); const p = (n) => String(n).padStart(2, '0');
    return `${x.getFullYear()}-${p(x.getMonth() + 1)}-${p(x.getDate())}`;
  };
  const guard = async (table, ids, vipCol = 'vip_id') => {
    const rows = await db.query(`SELECT * FROM ${table} WHERE id IN (${inList(ids)})`);
    if (rows.length !== ids.length) throw new Error(`${table}: 期望 ${ids.length} 行, 实际 ${rows.length} 行`);
    for (const r of rows) {
      if (vipCol && r[vipCol] !== VIP) throw new Error(`${table}#${r.id}: ${vipCol}=${r[vipCol]} 不是 Nick(${VIP})`);
      if (r.insert_time && localDay(r.insert_time) !== DAY) {
        throw new Error(`${table}#${r.id}: 创建于 ${localDay(r.insert_time)}, 不是 ${DAY}`);
      }
    }
    return rows;
  };

  const backup = {};
  backup.biz_member_card = await guard('biz_member_card', CARD_IDS);
  backup.biz_card_recharge = await guard('biz_card_recharge', RECHARGE_IDS);
  backup.biz_club_contract = await guard('biz_club_contract', CONTRACT_IDS);
  backup.biz_training_plan = await guard('biz_training_plan', PLAN_IDS);
  backup.biz_card_intent = await guard('biz_card_intent', INTENT_IDS);
  backup.biz_sms_log = await guard('biz_sms_log', SMS_IDS);
  backup.sys_log = await guard('sys_log', LOG_IDS, null);
  backup.biz_vip_user_before = await db.query('SELECT * FROM biz_vip_user WHERE id=?', [VIP]);

  const dir = path.join(__dirname, 'backups');
  const file = path.join(dir, `nick_测试数据_${new Date().toISOString().replace(/[-:T]/g, '').slice(0, 14)}.json`);
  fs.writeFileSync(file, JSON.stringify(backup, null, 1));
  console.log('备份已写入:', file);
  Object.entries(backup).forEach(([k, v]) => console.log(`  ${k}: ${v.length} 行`));

  // ---- 1. 删除 ----
  await db.tx(async (t) => {
    const del = async (table, ids) => {
      const r = await t.exec(`DELETE FROM ${table} WHERE id IN (${inList(ids)})`);
      console.log(`- ${table}: 删除 ${r.affectedRows} 行`);
    };
    await del('biz_club_contract', CONTRACT_IDS);   // 先删引用卡的
    await del('biz_card_recharge', RECHARGE_IDS);
    await del('biz_member_card', CARD_IDS);
    await del('biz_training_plan', PLAN_IDS);
    await del('biz_card_intent', INTENT_IDS);
    await del('biz_sms_log', SMS_IDS);
    await del('sys_log', LOG_IDS);
    // 卡没了, 会员的在籍状态要跟着回到「无卡」
    await t.exec('UPDATE biz_vip_user SET expire_status=0, expire_time=NULL WHERE id=?', [VIP]);
    console.log('- biz_vip_user: Nick 重置为无卡状态(账号保留)');
  });

  // ---- 2. 残留引用自检 ----
  console.log('\n=== 残留引用自检 ===');
  const checks = [
    ['指向已删卡的收款流水', `SELECT COUNT(*) n FROM biz_card_recharge WHERE card_id IN (${inList(CARD_IDS)})`],
    ['指向已删卡的耗卡流水', `SELECT COUNT(*) n FROM biz_card_spend WHERE card_id IN (${inList(CARD_IDS)})`],
    ['指向已删卡的合同', `SELECT COUNT(*) n FROM biz_club_contract WHERE card_id IN (${inList(CARD_IDS)})`],
    ['Nick 名下剩余卡', `SELECT COUNT(*) n FROM biz_member_card WHERE vip_id=${VIP}`],
    ['Nick 名下剩余合同', `SELECT COUNT(*) n FROM biz_club_contract WHERE vip_id=${VIP}`],
    ['Nick 名下剩余计划', `SELECT COUNT(*) n FROM biz_training_plan WHERE vip_id=${VIP}`],
    ['Nick 名下剩余意向', `SELECT COUNT(*) n FROM biz_card_intent WHERE vip_id=${VIP}`],
    ['Nick 账号是否还在(应为1)', `SELECT COUNT(*) n FROM biz_vip_user WHERE id=${VIP}`],
  ];
  for (const [label, sql] of checks) {
    const [{ n }] = await db.query(sql);
    console.log(`  ${label}: ${n}`);
  }
  const [today] = await db.query(
    "SELECT COALESCE(SUM(actual_money),0) s FROM biz_card_recharge WHERE DATE(insert_time)=CURDATE()");
  console.log(`\n今日预收(清理后): ¥${today.s}`);
  process.exit(0);
})().catch(e => { console.error('失败(已回滚):', e.message); process.exit(1); });
