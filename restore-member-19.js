/* 修复: 恢复被误删的真实会员 id=19「三七」(18996387137)
 * 原因: 该会员 09-07 由小程序注册(is_import=0), 但 09-21 导入时按手机号匹配到他,
 *       把 2 张真实老系统卡(ext_card_id 18700749/20211381, 含 ¥210 真实收款)追加到其名下。
 *       清理脚本按 is_import<>1 删人, 误删了这个真实客户, 使其卡成为孤儿。
 * 动作: 从备份原样恢复 biz_vip_user / biz_user_club 两行, 并清空指向已删教练(李强)的残留字段。
 */
const fs = require('fs');
const db = require('./server/src/db');

const BACKUP = 'backups/fitness_app_清理前_20260922_183019.sql';

function grab(sql, table, pred) {
  const re = new RegExp('INSERT INTO `' + table + '` \\(([^)]+)\\) VALUES\\n([\\s\\S]*?);\\n', 'g');
  let m, cols = null; const hits = [];
  while ((m = re.exec(sql))) {
    cols = m[1];
    m[2].split(/,\n(?=\()/).forEach(t => { const s = t.replace(/,$/, '').trim(); if (pred(s)) hits.push(s); });
  }
  return { cols, hits };
}

(async () => {
  const sql = fs.readFileSync(BACKUP, 'utf8');
  const v = grab(sql, 'biz_vip_user', t => /^\(19,/.test(t));
  const u = grab(sql, 'biz_user_club', t => /^\(\d+,19,/.test(t));
  if (!v.hits.length) throw new Error('备份中未找到 biz_vip_user id=19');

  const exists = await db.queryOne('SELECT id FROM biz_vip_user WHERE id=19');
  if (exists) { console.log('会员 19 已存在, 无需恢复'); process.exit(0); }

  await db.tx(async (t) => {
    await t.exec(`INSERT INTO \`biz_vip_user\` (${v.cols}) VALUES ${v.hits[0]}`);
    // 原记录的 coach_id=1(李强) 已随清理删除, 清空避免孤儿引用
    await t.exec("UPDATE biz_vip_user SET coach_id=0, coach_name='' WHERE id=19");
    for (const row of u.hits) {
      await t.exec(`INSERT IGNORE INTO \`biz_user_club\` (${u.cols}) VALUES ${row}`);
    }
  });

  const m = await db.queryOne('SELECT id,realname,phone,birthday,expire_time,coach_id FROM biz_vip_user WHERE id=19');
  const cards = await db.query('SELECT id,card_type_name,ext_card_id,left_counts,status FROM biz_member_card WHERE vip_id=19');
  const [{ n: orphan }] = await db.query(
    'SELECT COUNT(*) n FROM biz_member_card c WHERE NOT EXISTS(SELECT 1 FROM biz_vip_user v WHERE v.id=c.vip_id)');
  console.log('=== 已恢复会员 ===');
  console.table([m]);
  console.log('=== 其名下的真实卡 ===');
  console.table(cards);
  console.log('孤立卡数量(应为0):', orphan);
  process.exit(0);
})().catch(e => { console.error('❌ 恢复失败, 事务已回滚:', e.message); process.exit(1); });
