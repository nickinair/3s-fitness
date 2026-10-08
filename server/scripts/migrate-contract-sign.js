/* 合同签署闭环: 记录签署来源与经办人 (可重复执行)
 * sign_source: 1=会员自签(小程序)  2=店内当面签(员工设备)
 * sign_by:     当面签时的经办员工, 便于事后追溯是谁见证的 */
const mysql = require('mysql2/promise');
const cfg = require('../src/config').db;

async function main() {
  const conn = await mysql.createConnection(cfg);
  const has = async (table, col) => {
    const [r] = await conn.query(
      "SELECT COUNT(*) n FROM information_schema.columns WHERE table_schema=? AND table_name=? AND column_name=?",
      [cfg.database, table, col]);
    return r[0].n > 0;
  };
  const addCol = async (table, col, ddl) => {
    if (await has(table, col)) { console.log(`= ${table}.${col} 已存在`); return; }
    await conn.query(`ALTER TABLE ${table} ADD COLUMN ${ddl}`);
    console.log(`+ ${table}.${col}`);
  };

  await addCol('biz_club_contract', 'sign_source',
    "sign_source TINYINT DEFAULT 0 COMMENT '签署来源: 0未签 1会员自签 2店内当面签' AFTER sign_status");
  await addCol('biz_club_contract', 'sign_by',
    "sign_by VARCHAR(64) DEFAULT '' COMMENT '当面签的经办员工' AFTER sign_source");

  // 已签但没来源的历史数据, 统一归为会员自签
  const [r] = await conn.query('UPDATE biz_club_contract SET sign_source=1 WHERE sign_status=1 AND sign_source=0');
  console.log(`= 历史已签合同补来源: ${r.affectedRows} 条`);

  // 训练计划已读标记: 会员首页「训练计划」入口的未读红点靠它算
  await addCol('biz_training_plan', 'viewed_time',
    "viewed_time DATETIME NULL COMMENT '会员首次查看时间, NULL=未读'");
  // 存量已推送的计划视为已读, 免得上线当天老会员突然冒出一堆红点
  const [v] = await conn.query('UPDATE biz_training_plan SET viewed_time=insert_time WHERE pushed=1 AND viewed_time IS NULL');
  console.log(`= 存量已推送计划标记为已读: ${v.affectedRows} 条`);

  console.log('合同签署迁移完成');
  await conn.end();
}
main().catch(e => { console.error(e); process.exit(1); });
