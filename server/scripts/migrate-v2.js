/* v2 迁移: 2026-09-07 需求沟通会 增量 (可重复执行)
 * 主/副教练、体测记录、里程碑、动作库、训练计划、短信日志、购卡意向、门店改名 */
const mysql = require('mysql2/promise');
const cfg = require('../src/config').db;

async function main() {
  const conn = await mysql.createConnection({ ...cfg, multipleStatements: true });
  const has = async (table, col) => {
    const [r] = await conn.query(
      `SELECT COUNT(*) n FROM information_schema.columns WHERE table_schema='fitness_app' AND table_name=? AND column_name=?`, [table, col]);
    return r[0].n > 0;
  };
  const addCol = async (table, col, ddl) => {
    if (!(await has(table, col))) { await conn.query(`ALTER TABLE ${table} ADD COLUMN ${ddl}`); console.log(`+ ${table}.${col}`); }
  };

  // ---- 字段增量 ----
  await addCol('biz_vip_user', 'sub_coach_id', "sub_coach_id INT DEFAULT 0 COMMENT '副教练'");
  await addCol('biz_vip_user', 'sub_coach_name', "sub_coach_name VARCHAR(32) DEFAULT '' COMMENT '副教练姓名'");
  await addCol('biz_card_category', 'milestone_type', "milestone_type TINYINT DEFAULT 0 COMMENT '里程碑: 0关闭 1按课时 2按天数'");
  await addCol('biz_card_category', 'milestone_interval', "milestone_interval INT DEFAULT 10 COMMENT '里程碑间隔(节/天)'");
  await addCol('biz_club_coach', 'lesson_price', "lesson_price DECIMAL(10,2) DEFAULT 0 COMMENT '课时单价(展示口径, 引导会员自助约课)'");

  // ---- 新表 ----
  await conn.query(`CREATE TABLE IF NOT EXISTS biz_body_record (
    id INT AUTO_INCREMENT PRIMARY KEY,
    merchant_id INT NOT NULL, club_id INT DEFAULT 0,
    vip_id INT NOT NULL, realname VARCHAR(32) DEFAULT '',
    coach_id INT DEFAULT 0, coach_name VARCHAR(32) DEFAULT '',
    record_date DATE NOT NULL,
    weight DECIMAL(5,1) COMMENT '体重kg',
    body_fat DECIMAL(4,1) COMMENT '体脂率%',
    muscle DECIMAL(5,1) COMMENT '肌肉量kg',
    bust DECIMAL(5,1) COMMENT '胸围cm', waist DECIMAL(5,1) COMMENT '腰围cm', hip DECIMAL(5,1) COMMENT '臀围cm',
    remark VARCHAR(255) DEFAULT '',
    insert_time DATETIME DEFAULT CURRENT_TIMESTAMP,
    KEY idx_vip (vip_id, record_date)
  ) ENGINE=InnoDB COMMENT='会员体测记录(时间线)'`);

  await conn.query(`CREATE TABLE IF NOT EXISTS biz_milestone (
    id INT AUTO_INCREMENT PRIMARY KEY,
    merchant_id INT NOT NULL, club_id INT DEFAULT 0,
    vip_id INT NOT NULL, realname VARCHAR(32) DEFAULT '', phone VARCHAR(20) DEFAULT '',
    coach_id INT DEFAULT 0 COMMENT '主教练(总结责任人)', coach_name VARCHAR(32) DEFAULT '',
    type TINYINT DEFAULT 1 COMMENT '1按课时 2按天数',
    node_value INT NOT NULL COMMENT '第N节课 / 第N天',
    card_id INT DEFAULT 0, card_type_name VARCHAR(64) DEFAULT '',
    status TINYINT DEFAULT 0 COMMENT '0待总结 1已总结',
    summary TEXT COMMENT '教练训练总结',
    summary_time DATETIME,
    insert_time DATETIME DEFAULT CURRENT_TIMESTAMP,
    UNIQUE KEY uk_node (vip_id, type, node_value, card_id),
    KEY idx_coach (coach_id, status)
  ) ENGINE=InnoDB COMMENT='会员里程碑(每N节课/N天)'`);

  await conn.query(`CREATE TABLE IF NOT EXISTS biz_training_action (
    id INT AUTO_INCREMENT PRIMARY KEY,
    merchant_id INT DEFAULT 0 COMMENT '0=系统预置',
    name VARCHAR(64) NOT NULL,
    part VARCHAR(20) DEFAULT '' COMMENT '部位: 胸/背/肩/手臂/腿/臀/核心/有氧/拉伸',
    equipment VARCHAR(32) DEFAULT '' COMMENT '器械',
    description VARCHAR(500) DEFAULT '',
    is_custom TINYINT DEFAULT 0,
    status TINYINT DEFAULT 1,
    insert_time DATETIME DEFAULT CURRENT_TIMESTAMP,
    KEY idx_m (merchant_id, part)
  ) ENGINE=InnoDB COMMENT='动作库'`);

  await conn.query(`CREATE TABLE IF NOT EXISTS biz_training_plan (
    id INT AUTO_INCREMENT PRIMARY KEY,
    merchant_id INT NOT NULL, club_id INT DEFAULT 0,
    coach_id INT NOT NULL, coach_name VARCHAR(32) DEFAULT '',
    vip_id INT DEFAULT 0 COMMENT '0=模板', realname VARCHAR(32) DEFAULT '',
    title VARCHAR(64) NOT NULL,
    plan_date DATE,
    items TEXT COMMENT 'JSON [{action_name,sets,reps,unit,weight,rest,remark}]',
    note VARCHAR(500) DEFAULT '',
    is_template TINYINT DEFAULT 0,
    pushed TINYINT DEFAULT 0 COMMENT '已推送会员',
    status TINYINT DEFAULT 1,
    insert_time DATETIME DEFAULT CURRENT_TIMESTAMP,
    KEY idx_coach (coach_id, is_template),
    KEY idx_vip (vip_id, plan_date)
  ) ENGINE=InnoDB COMMENT='训练计划'`);

  await conn.query(`CREATE TABLE IF NOT EXISTS biz_sms_log (
    id INT AUTO_INCREMENT PRIMARY KEY,
    merchant_id INT NOT NULL,
    vip_id INT DEFAULT 0, realname VARCHAR(32) DEFAULT '', phone VARCHAR(20) NOT NULL,
    scene VARCHAR(20) NOT NULL COMMENT 'buy_card/lesson_done/card_low/milestone/plan_push/intent',
    content VARCHAR(500) NOT NULL,
    status TINYINT DEFAULT 0 COMMENT '0模拟发送 1真实成功 2失败',
    insert_time DATETIME DEFAULT CURRENT_TIMESTAMP,
    KEY idx_m (merchant_id, scene, insert_time),
    KEY idx_card_scene (vip_id, scene, insert_time)
  ) ENGINE=InnoDB COMMENT='短信发送记录'`);

  await conn.query(`CREATE TABLE IF NOT EXISTS biz_card_intent (
    id INT AUTO_INCREMENT PRIMARY KEY,
    merchant_id INT NOT NULL, club_id INT DEFAULT 0,
    vip_id INT NOT NULL, realname VARCHAR(32) DEFAULT '', phone VARCHAR(20) DEFAULT '',
    card_type_id INT NOT NULL, card_type_name VARCHAR(64) DEFAULT '', price DECIMAL(10,2) DEFAULT 0,
    remark VARCHAR(255) DEFAULT '',
    status TINYINT DEFAULT 0 COMMENT '0待跟进 1已开卡 2已关闭',
    handle_user VARCHAR(32) DEFAULT '', handle_time DATETIME, handle_remark VARCHAR(255) DEFAULT '',
    insert_time DATETIME DEFAULT CURRENT_TIMESTAMP,
    KEY idx_m (merchant_id, status)
  ) ENGINE=InnoDB COMMENT='购卡意向(会员端提交,线下收款开卡)'`);

  // ---- 门店改名 (纪要: 巴南店/南坪店) ----
  await conn.query(`UPDATE biz_club SET name='3S健身·巴南店' WHERE id=1 AND merchant_id=1`);
  await conn.query(`UPDATE biz_club SET name='3S健身·南坪店' WHERE id=2 AND merchant_id=1`);
  // 测试建的金融城店(无业务数据)删除
  const [[c3]] = await conn.query(`SELECT COUNT(*) n FROM biz_member_card WHERE club_id=3`);
  if (c3.n === 0) await conn.query(`DELETE FROM biz_club WHERE id=3 AND merchant_id=1 AND name LIKE '%金融城%'`);
  // 冗余快照同步改名
  await conn.query(`UPDATE biz_vip_user SET coach_name=coach_name WHERE 1=0`); // noop 占位

  // ---- 卡类型默认里程碑配置 ----
  await conn.query(`UPDATE biz_card_category SET milestone_type=1, milestone_interval=10 WHERE card_kind IN (1,4) AND milestone_type=0`);
  await conn.query(`UPDATE biz_card_category SET milestone_type=2, milestone_interval=30 WHERE card_kind=2 AND milestone_type=0`);

  // ---- 教练课时单价演示值 ----
  await conn.query(`UPDATE biz_club_coach SET lesson_price=220 WHERE id=1 AND lesson_price=0`);
  await conn.query(`UPDATE biz_club_coach SET lesson_price=200 WHERE id=2 AND lesson_price=0`);
  await conn.query(`UPDATE biz_club_coach SET lesson_price=180 WHERE id=3 AND lesson_price=0`);
  await conn.query(`UPDATE biz_club_coach SET lesson_price=100 WHERE id=5 AND lesson_price=0`); // 新教练价格优势

  // ---- 动作库预置 (引自开源健身动作整理) ----
  const [[{ n: an }]] = await conn.query('SELECT COUNT(*) n FROM biz_training_action WHERE merchant_id=0');
  if (an === 0) {
    const A = [
      ['胸', '杠铃', '杠铃卧推'], ['胸', '哑铃', '哑铃卧推'], ['胸', '哑铃', '上斜哑铃卧推'], ['胸', '哑铃', '哑铃飞鸟'],
      ['胸', '器械', '蝴蝶机夹胸'], ['胸', '绳索', '绳索夹胸'], ['胸', '自重', '俯卧撑'], ['胸', '器械', '坐姿推胸'],
      ['背', '自重', '引体向上'], ['背', '器械', '高位下拉'], ['背', '器械', '坐姿划船'], ['背', '杠铃', '杠铃划船'],
      ['背', '哑铃', '单臂哑铃划船'], ['背', '杠铃', '硬拉'], ['背', '绳索', '直臂下压'], ['背', '器械', 'T杠划船'],
      ['肩', '哑铃', '哑铃肩推'], ['肩', '杠铃', '杠铃推举'], ['肩', '哑铃', '哑铃侧平举'], ['肩', '哑铃', '哑铃前平举'],
      ['肩', '哑铃', '俯身反向飞鸟'], ['肩', '绳索', '面拉'], ['肩', '杠铃', '直立划船'],
      ['手臂', '杠铃', '杠铃弯举'], ['手臂', '哑铃', '哑铃交替弯举'], ['手臂', '哑铃', '锤式弯举'], ['手臂', '绳索', '绳索下压'],
      ['手臂', '哑铃', '仰卧臂屈伸'], ['手臂', '杠铃', '窄距卧推'], ['手臂', '自重', '双杠臂屈伸'],
      ['腿', '杠铃', '杠铃深蹲'], ['腿', '器械', '哈克深蹲'], ['腿', '器械', '腿举'], ['腿', '器械', '腿屈伸'],
      ['腿', '器械', '腿弯举'], ['腿', '哑铃', '保加利亚分腿蹲'], ['腿', '哑铃', '箭步蹲'], ['腿', '器械', '站姿提踵'],
      ['腿', '哑铃', '哑铃深蹲'], ['腿', '杠铃', '罗马尼亚硬拉'],
      ['臀', '自重', '臀桥'], ['臀', '杠铃', '杠铃臀推'], ['臀', '器械', '髋外展'], ['臀', '绳索', '绳索后踢腿'],
      ['核心', '自重', '平板支撑'], ['核心', '自重', '卷腹'], ['核心', '自重', '悬垂举腿'], ['核心', '自重', '俄罗斯转体'],
      ['核心', '自重', '侧平板支撑'], ['核心', '自重', '登山跑'], ['核心', '器械', '健腹轮'],
      ['有氧', '器械', '跑步机慢跑'], ['有氧', '器械', '椭圆机'], ['有氧', '器械', '动感单车'], ['有氧', '器械', '划船机'],
      ['有氧', '自重', '跳绳'], ['有氧', '自重', '波比跳'], ['有氧', '自重', '开合跳'], ['有氧', '器械', '战绳'],
      ['有氧', '器械', '爬楼机'], ['有氧', '自重', '高抬腿'],
      ['拉伸', '器械', '泡沫轴放松'], ['拉伸', '自重', '静态拉伸'], ['拉伸', '自重', '动态热身'], ['拉伸', '自重', '肩部环绕'],
    ];
    for (const [part, eq, name] of A) {
      await conn.query('INSERT INTO biz_training_action (merchant_id,name,part,equipment) VALUES (0,?,?,?)', [name, part, eq]);
    }
    console.log(`+ 动作库预置 ${A.length} 个动作`);
  }

  console.log('v2 迁移完成');
  await conn.end();
}
main().catch(e => { console.error(e); process.exit(1); });

/* v3 (2026-09-15 纪要复核): 关闭开课前取消时限(暂不做的强管理规则), 体测增加身高 */
if (require.main === module) {
  (async () => {
    const mysql2 = require('mysql2/promise');
    const c = await mysql2.createConnection({ ...require('../src/config').db });
    await c.query('UPDATE biz_card_category SET cancel_deadline_hours=0');
    const [h] = await c.query("SELECT COUNT(*) n FROM information_schema.columns WHERE table_schema='fitness_app' AND table_name='biz_body_record' AND column_name='height'");
    if (!h[0].n) await c.query("ALTER TABLE biz_body_record ADD COLUMN height DECIMAL(5,1) COMMENT '身高cm' AFTER record_date");
    await c.end();
  })();
}
