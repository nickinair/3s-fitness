/* 初始化数据库: node scripts/init-db.js [--reset]
 * --reset 删除并重建 fitness_app 库 */
const fs = require('fs');
const path = require('path');
const mysql = require('mysql2/promise');
const bcrypt = require('bcryptjs');
const dayjs = require('dayjs');

const DB_CONFIG = require('../src/config').db;

const D = (d) => d.format('YYYY-MM-DD HH:mm:ss');
const today = dayjs().startOf('day');

async function main() {
  const reset = process.argv.includes('--reset');
  const conn = await mysql.createConnection({ ...DB_CONFIG, database: undefined, multipleStatements: true });

  if (reset) {
    console.log('Dropping database fitness_app ...');
    await conn.query('DROP DATABASE IF EXISTS fitness_app');
  }

  console.log('Applying schema ...');
  const schema = fs.readFileSync(path.join(__dirname, 'schema.sql'), 'utf8');
  await conn.query(schema);
  await conn.query('USE fitness_app');

  const [[{ n }]] = await conn.query('SELECT COUNT(*) n FROM sys_merchant');
  if (n > 0) { console.log('Already seeded, skip. (use --reset to reseed)'); await conn.end(); return; }

  console.log('Seeding demo data ...');
  const pwd = await bcrypt.hash('admin123', 10);
  const memberPwd = await bcrypt.hash('123456', 10);

  // ---- 商户与门店 ----
  await conn.query(`INSERT INTO sys_merchant (id,name,contact,phone,status,expire_time) VALUES
    (1,'3S健身','Nick','13800000001',1,'2027-12-31 23:59:59')`);
  // 与线上实际配置保持一致(门店名/地址/营业时间/排序); sort 小的排前面, 会员约课默认选中第一个
  await conn.query(`INSERT INTO biz_club (id,merchant_id,name,address,phone,intro,open_time,sort) VALUES
    (1,1,'3S健身·巴南店','重庆市南岸区亚太商谷19栋','023-8500XXXX','1000㎡ 旗舰店，团课教室与专业力量区','06:30-22:30',2),
    (2,1,'3S健身·南坪店','重庆市巴南区万达广场B区T9栋30楼','028-8500XXXX','社区精品店，主打私教与小团课','07:00-22:00',1)`);

  // ---- 员工账号 ----
  await conn.query(`INSERT INTO sys_user (id,merchant_id,club_id,username,password,realname,phone,role) VALUES
    (1,0,0,'platform','${pwd}','平台管理员','13900000000','platform'),
    (2,1,0,'admin','${pwd}','管理员','13800000002','admin'),
    (3,1,1,'manager01','${pwd}','张远','13800000003','manager'),
    (4,1,1,'sale01','${pwd}','王莉','13800000004','membership'),
    (5,1,1,'sale02','${pwd}','刘芳','13800000005','membership'),
    (6,1,1,'front01','${pwd}','周小雨','13800000006','reception'),
    (7,1,1,'coach01','${pwd}','李强','13800000007','coach'),
    (8,1,1,'coach02','${pwd}','张伟','13800000008','coach'),
    (9,1,1,'coach03','${pwd}','陈晨','13800000009','coach'),
    (10,1,2,'manager02','${pwd}','赵敏','13800000010','manager')`);

  // ---- 教练档案 ----
  await conn.query(`INSERT INTO biz_club_coach (id,merchant_id,club_id,user_id,realname,good_at,\`desc\`,detail,sort) VALUES
    (1,1,1,7,'李强','增肌塑形 · 体态矫正','国家级健身教练认证，8年执教经验','ACE-CPT 认证 / 前省队举重运动员 / 累计授课6000+课时。擅长增肌减脂周期化训练与体态评估矫正。',1),
    (2,1,1,8,'张伟','减脂 · 功能性训练','CrossFit L2 教练，功能性训练专家','CrossFit Level2 / FMS 功能性动作筛查认证。带领减脂训练营12期，学员平均减重8.5kg。',2),
    (3,1,1,9,'陈晨','瑜伽 · 普拉提 · 产后修复','全美瑜伽联盟 RYT500 认证','RYT500 / 普拉提大器械认证 / 产后修复专项。教学风格温和精准，深受女性会员欢迎。',3)`);

  // ---- 来源渠道 ----
  await conn.query(`INSERT INTO biz_user_source (merchant_id,title,sort) VALUES
    (1,'自然到店',1),(1,'大众点评',2),(1,'朋友介绍',3),(1,'抖音',4),(1,'地推活动',5)`);

  // ---- 卡类型 ----
  await conn.query(`INSERT INTO biz_card_category
    (id,merchant_id,club_id,card_kind,title,intro,expire_days,total_counts,price,original_price,gift_money,
     book_limit_day,noshow_limit_30d,pause_times,pause_max_days,open_card_mode,latest_open_days,
     group_advance_range,cancel_deadline_hours,free_train_time_range,online_sale,sort) VALUES
    (1,1,0,2,'自助训练月卡','30天内不限次入场自由训练，含团课预约权益',30,0,299,399,0, 2,3,1,7,1,30,'7,2',2,'06:30-22:30',1,1),
    (2,1,0,2,'自助训练年卡','365天不限次入场，含团课预约权益，可暂停3次',365,0,2599,3299,0, 3,3,3,30,2,60,'7,2',2,'06:30-22:30',1,2),
    (3,1,0,1,'团课次卡·10次','10次团课/入场通用，有效期90天',90,10,399,499,0, 2,3,1,7,2,30,'7,2',2,'06:30-22:30',1,3),
    (4,1,0,1,'体验卡·1次','新客专享单次体验（团课或自由训练）',7,1,19,59,0, 1,3,0,0,1,7,'3,2',2,'06:30-22:30',1,4),
    (5,1,0,4,'私教卡·20课时','20节 1v1 私教课，有效期100天',100,20,4400,5600,0, 2,3,2,14,2,45,'',3,'',1,5),
    (6,1,0,4,'私教卡·10课时','10节 1v1 私教课，有效期60天',60,10,2400,2800,0, 2,3,1,14,2,45,'',3,'',1,6),
    (7,1,0,3,'储值卡·2000','充2000赠200，可用于买课/续卡/商品抵扣',365,0,2000,2000,200, 0,3,0,0,1,30,'',2,'',1,7)`);

  // ---- 会员 ----
  // helper arrays
  const members = [
    // [id, phone, realname, gender, sourceId, sourceName, membershipId, membershipName, coachId, coachName, label]
    [1,'13911110001','林小满',2,3,'朋友介绍',4,'王莉',1,'李强',1],
    [2,'13911110002','徐志远',1,1,'自然到店',4,'王莉',0,'',1],
    [3,'13911110003','何佳音',2,2,'大众点评',5,'刘芳',3,'陈晨',1],
    [4,'13911110004','孙建国',1,1,'自然到店',4,'王莉',0,'',2],
    [5,'13911110005','吴雅婷',2,4,'抖音',5,'刘芳',2,'张伟',1],
    [6,'13911110006','郑凯',1,3,'朋友介绍',4,'王莉',1,'李强',1],
    [7,'13911110007','杨思思',2,2,'大众点评',5,'刘芳',0,'',2],
    [8,'13911110008','高翔',1,5,'地推活动',4,'王莉',0,'',1],
    [9,'13911110009','罗曼',2,4,'抖音',5,'刘芳',3,'陈晨',1],
    [10,'13911110010','邓超群',1,1,'自然到店',4,'王莉',2,'张伟',1],
    [11,'13911110011','冯静',2,3,'朋友介绍',5,'刘芳',0,'',3],
    [12,'13911110012','蒋大力',1,1,'自然到店',4,'王莉',0,'',2],
    [13,'13911110013','沈月',2,2,'大众点评',5,'刘芳',0,'',1],
    [14,'13911110014','曹阳',1,5,'地推活动',4,'王莉',0,'',2],
    [15,'13911110015','钱多多',2,3,'朋友介绍',4,'王莉',1,'李强',1],
    [16,'13911110016','老王测试',1,1,'自然到店',4,'王莉',0,'',3],
  ];
  for (const m of members) {
    const created = D(today.subtract(30 + m[0] * 9, 'day').add(10, 'hour'));
    await conn.query(
      `INSERT INTO biz_vip_user (id,merchant_id,phone,password,realname,nickname,gender,source_id,source_name,
       membership_id,membership_name,coach_id,coach_name,label_levels,insert_time) VALUES (?,?,?,?,?,?,?,?,?,?,?,?,?,?,?)`,
      [m[0],1,m[1],memberPwd,m[2],m[2],m[3],m[4],m[5],m[6],m[7],m[8],m[9],m[10],created]);
    await conn.query('INSERT INTO biz_user_club (vip_user_id, club_id) VALUES (?,1)', [m[0]]);
  }

  // ---- 会员卡 + 收款流水 + 合同 ----
  let contractSeq = 1;
  async function openCard(vipId, catId, openDaysAgo, opts = {}) {
    const [[cat]] = await conn.query('SELECT * FROM biz_card_category WHERE id=?', [catId]);
    const [[vip]] = await conn.query('SELECT * FROM biz_vip_user WHERE id=?', [vipId]);
    const openTime = today.subtract(openDaysAgo, 'day').add(11, 'hour');
    const expireTime = openTime.add(cat.expire_days, 'day').endOf('day');
    const counts = cat.total_counts;
    const actual = opts.actual != null ? opts.actual : Number(cat.price);
    const unit = counts > 0 ? +(actual / counts).toFixed(2) : 0;
    const isStore = cat.card_kind === 3;
    const sum = isStore ? Number(cat.price) + Number(cat.gift_money) : 0;
    const leftMoney = opts.leftMoney != null ? opts.leftMoney : sum;
    const leftCounts = opts.leftCounts != null ? opts.leftCounts : counts;
    const status = opts.status != null ? opts.status : (expireTime.isBefore(dayjs()) ? 2 : 1);
    const cn = `HT${dayjs().format('YYYYMM')}${String(contractSeq++).padStart(4, '0')}`;
    const [r] = await conn.query(
      `INSERT INTO biz_member_card (merchant_id,club_id,vip_id,card_kind,card_type_id,card_type_name,counts,left_counts,
        sum_money,left_money,unit_price,actual_money,open_card_mode,open_card_time,start_use_time,expire_time,expire_days,
        contract_number,coach_id,coach_name,membership_id,membership_name,ope_user_id,ope_username,pay_method,realname,phone,status,insert_time)
       VALUES (?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?)`,
      [1, 1, vipId, cat.card_kind, cat.id, cat.title, counts, leftCounts, sum, leftMoney, unit, actual,
        cat.open_card_mode, D(openTime), D(openTime), D(expireTime), cat.expire_days, cn,
        vip.coach_id, vip.coach_name, vip.membership_id, vip.membership_name, 6, '周小雨', opts.pay || 'wechat',
        vip.realname, vip.phone, status, D(openTime)]);
    const cardId = r.insertId;
    const [r2] = await conn.query(
      `INSERT INTO biz_card_recharge (merchant_id,club_id,card_id,vip_id,card_kind,card_type_id,card_type_name,type,actual_money,gift_money,
        counts,expire_days,pay_method,membership_id,membership_name,ope_user_id,ope_username,realname,phone,contract_number,is_new_user,insert_time)
       VALUES (?,?,?,?,?,?,?,1,?,?,?,?,?,?,?,?,?,?,?,?,?,?)`,
      [1, 1, cardId, vipId, cat.card_kind, cat.id, cat.title, actual, isStore ? cat.gift_money : 0,
        counts, cat.expire_days, opts.pay || 'wechat', vip.membership_id, vip.membership_name, 6, '周小雨',
        vip.realname, vip.phone, cn, opts.isNew ? 1 : 0, D(openTime)]);
    await conn.query(
      `INSERT INTO biz_club_contract (merchant_id,club_id,contract_num,card_id,recharge_id,vip_id,realname,phone,title,type,content,sign_status,sign_time,insert_time)
       VALUES (?,?,?,?,?,?,?,?,?,1,?,?,?,?)`,
      [1, 1, cn, cardId, r2.insertId, vipId, vip.realname, vip.phone, `${cat.title}购卡合同`,
        contractContent(vip, cat, actual, D(openTime)), opts.unsigned ? 0 : 1, opts.unsigned ? null : D(openTime), D(openTime)]);
    return { cardId, cat, unit, expireTime };
  }
  function contractContent(vip, cat, actual, time) {
    return `甲方（会员）：${vip.realname}（${vip.phone}）\n乙方（商户）：3S健身（统一社会信用代码 91510100XXXXXXXXXX）\n\n一、甲方购买乙方「${cat.title}」，实收金额 ¥${actual}，${cat.total_counts ? `共 ${cat.total_counts} 次，` : ''}有效期 ${cat.expire_days} 天。\n二、会员卡仅限本人使用，不得转借；转卡/退卡需经门店审核。\n三、因甲方个人原因申请退卡的，按剩余价值扣除手续费后退还。\n四、甲方应遵守场馆管理规定，安全训练。\n五、本合同自签署之日起生效。\n\n签署时间：${time}`;
  }

  // 在籍会员: 时间卡/次卡/私教卡/储值卡 组合
  const c1 = await openCard(1, 5, 20, { leftCounts: 14, isNew: 1 });          // 林小满 私教20 已用6
  await openCard(1, 1, 10, { isNew: 0 });                                      // 林小满 月卡
  const c2 = await openCard(2, 2, 60, { isNew: 1 });                           // 徐志远 年卡
  const c3 = await openCard(3, 6, 15, { leftCounts: 7, isNew: 1 });            // 何佳音 私教10 已用3
  const c4 = await openCard(4, 3, 25, { leftCounts: 4, isNew: 1 });            // 孙建国 次卡10 已用6
  const c5 = await openCard(5, 5, 30, { leftCounts: 11, isNew: 1 });           // 吴雅婷 私教20 已用9
  await openCard(5, 1, 5, {});                                                 // 吴雅婷 月卡
  const c6 = await openCard(6, 1, 12, { isNew: 1 });                           // 郑凯 月卡
  const c7 = await openCard(7, 3, 40, { leftCounts: 2, isNew: 1 });            // 杨思思 次卡
  const c8 = await openCard(8, 1, 28, { isNew: 1 });                           // 高翔 月卡 快到期(28/30)
  const c9 = await openCard(9, 6, 8, { leftCounts: 9, isNew: 1 });             // 罗曼 私教10
  const c10 = await openCard(10, 2, 200, { isNew: 1 });                        // 邓超群 年卡(200天前,仍有效)
  const c15 = await openCard(15, 7, 18, { leftMoney: 1560, isNew: 1, pay: 'cash' }); // 钱多多 储值卡 已消费640
  await openCard(15, 4, 2, { leftCounts: 1 });                                 // 钱多多 体验卡
  // 过期会员
  await openCard(11, 1, 90, { isNew: 1 });                                     // 冯静 月卡 已过期
  await openCard(12, 3, 150, { leftCounts: 0, status: 2, isNew: 1 });          // 蒋大力 次卡 用完+过期
  await openCard(13, 1, 70, { isNew: 1 });                                     // 沈月 月卡 已过期
  // 待开卡
  await openCard(14, 3, 3, { status: 0, isNew: 1, unsigned: true });           // 曹阳 次卡 待开卡未签署
  // 黑名单示例
  await conn.query(`UPDATE biz_vip_user SET is_black=1, black_reason='多次冒用他人会员卡入场' WHERE id=16`);
  await openCard(16, 1, 45, {});

  // ---- 潜在客户 ----
  await conn.query(`INSERT INTO biz_user_potential (merchant_id,club_id,realname,phone,gender,membership_id,membership_name,source_id,source_name,label_levels,last_maintain_time,last_maintain_record,remark) VALUES
    (1,1,'王一博','13922220001',1,4,'王莉',2,'大众点评',1,'${D(today.subtract(1, 'day').add(15, 'hour'))}','已到店参观，对私教卡感兴趣，周末再来体验','意向强烈'),
    (1,1,'佟丽','13922220002',2,5,'刘芳',4,'抖音',2,'${D(today.subtract(3, 'day').add(11, 'hour'))}','电话沟通，想先上体验课','关注瑜伽课程'),
    (1,1,'马进','13922220003',1,4,'王莉',5,'地推活动',3,'${D(today.subtract(12, 'day').add(16, 'hour'))}','地推扫码留资，暂未回访','')`,);

  // ---- 维护记录 ----
  await conn.query(`INSERT INTO biz_maintain_record (merchant_id,club_id,vip_user_id,vip_user_type,membership_id,membership_name,record_type,content,insert_time) VALUES
    (1,1,1,1,4,'王莉',2,'到店沟通训练计划，续私教卡意向A','${D(today.subtract(2, 'day').add(14, 'hour'))}'),
    (1,1,11,1,5,'刘芳',1,'电话回访：月卡已到期，本周内到店可享续卡折扣','${D(today.subtract(1, 'day').add(10, 'hour'))}'),
    (1,1,13,1,5,'刘芳',3,'微信发送续卡活动海报，未回复','${D(today.subtract(4, 'day').add(19, 'hour'))}'),
    (1,1,8,1,4,'王莉',1,'提醒月卡即将到期，推荐升级年卡','${D(today.subtract(0, 'day').add(9, 'hour'))}')`);

  // ---- 私教课程类型 ----
  await conn.query(`INSERT INTO biz_ptrain_course (id,merchant_id,club_id,title,course_type,duration,people_count,card_scope,coach_ids,intro,sort) VALUES
    (1,1,1,'1v1 私教训练课',1,60,1,'[]','[]','根据体测结果定制训练计划，全程一对一指导',1),
    (2,1,1,'1v1 体态评估与矫正',1,60,1,'[]','[1,3]','针对圆肩驼背、骨盆前倾等体态问题的评估与矫正训练',2),
    (3,1,1,'小团体能课(2-4人)',2,60,4,'[]','[2]','2-4人小团功能性体能训练，趣味与强度兼顾',3)`);

  // ---- 教练休息 ----
  await conn.query(`INSERT INTO biz_coach_rest (merchant_id,club_id,coach_id,rest_date,from_time,to_time,remark) VALUES
    (1,1,1,'${today.add(1, 'day').format('YYYY-MM-DD')}','','','轮休'),
    (1,1,3,'${today.add(2, 'day').format('YYYY-MM-DD')}','13:00','18:00','培训')`);

  // ---- 团课课程库 / 教室 ----
  await conn.query(`INSERT INTO biz_course_group (id,merchant_id,club_id,title,duration,difficulty,deduct_num,card_scope,intro,tags) VALUES
    (1,1,1,'燃脂搏击操',60,3,1,'[]','拳击与有氧结合，60分钟高强度燃脂','燃脂,有氧'),
    (2,1,1,'动感单车',45,4,1,'[]','音乐律动骑行，挑战心肺极限','燃脂,骑行'),
    (3,1,1,'流瑜伽',60,2,1,'[]','呼吸与体式串联，改善柔韧与平衡','瑜伽,拉伸'),
    (4,1,1,'HIIT循环训练',45,5,1,'[]','高强度间歇循环，快速提升代谢','高强度,塑形')`);
  await conn.query(`INSERT INTO biz_syllabus_classroom (id,merchant_id,club_id,title,capacity) VALUES
    (1,1,1,'操课教室A',20),(2,1,1,'动感单车房',15),(3,1,1,'瑜伽室',12)`);

  // ---- 排课: 过去7天 + 未来7天 ----
  const courseMap = {
    1: { coach: [2, '张伟'], room: [1, '操课教室A'], time: ['18:30', 60], cap: 20, low: 3 },
    2: { coach: [2, '张伟'], room: [2, '动感单车房'], time: ['19:45', 45], cap: 15, low: 3 },
    3: { coach: [3, '陈晨'], room: [3, '瑜伽室'], time: ['10:00', 60], cap: 12, low: 2 },
    4: { coach: [1, '李强'], room: [1, '操课教室A'], time: ['12:15', 45], cap: 16, low: 3 },
  };
  const [groups] = await conn.query('SELECT * FROM biz_course_group WHERE merchant_id=1');
  const syllabusIds = { past: [], future: [] };
  for (let d = -7; d <= 7; d++) {
    const day = today.add(d, 'day');
    for (const g of groups) {
      const cfg = courseMap[g.id];
      if (g.id === 2 && day.day() % 2 === 0) continue; // 单车隔天
      if (g.id === 4 && day.day() % 2 === 1) continue;
      const st = dayjs(`${day.format('YYYY-MM-DD')} ${cfg.time[0]}`);
      const et = st.add(cfg.time[1], 'minute');
      const isPast = et.isBefore(dayjs());
      const [r] = await conn.query(
        `INSERT INTO biz_syllabus_group (merchant_id,club_id,group_id,title,coach_id,coach_name,classroom_id,classroom_name,
          start_time,end_time,people_count,lower_limit,deduct_num,status) VALUES (1,1,?,?,?,?,?,?,?,?,?,?,?,?)`,
        [g.id, g.title, cfg.coach[0], cfg.coach[1], cfg.room[0], cfg.room[1], D(st), D(et), cfg.cap, cfg.low, g.deduct_num, isPast ? 3 : 1]);
      (isPast ? syllabusIds.past : syllabusIds.future).push({ id: r.insertId, st, et, title: g.title, groupId: g.id });
    }
  }

  // ---- 团课预约: 过去=已核销/爽约 + 消耗流水; 未来=已约 ----
  // 用有团课权益的会员: 时间卡/次卡持有者
  const groupBookers = [
    { vip: 2, card: c2, name: '徐志远', phone: '13911110002' },
    { vip: 4, card: c4, name: '孙建国', phone: '13911110004' },
    { vip: 6, card: c6, name: '郑凯', phone: '13911110006' },
    { vip: 7, card: c7, name: '杨思思', phone: '13911110007' },
    { vip: 8, card: c8, name: '高翔', phone: '13911110008' },
    { vip: 10, card: c10, name: '邓超群', phone: '13911110010' },
  ];
  for (const s of syllabusIds.past) {
    const bookers = groupBookers.filter((_, i) => (s.id + i) % 3 !== 0);
    let booked = 0;
    for (let i = 0; i < bookers.length; i++) {
      const b = bookers[i];
      const noshow = (s.id + i) % 7 === 0;
      const status = noshow ? 4 : 2;
      const kind = b.card.cat.card_kind;
      const deduct = kind === 1 ? 1 : 0; // 次卡扣1, 时间卡不扣
      await conn.query(
        `INSERT INTO biz_syllabus_subscribe_record (merchant_id,club_id,syllabus_id,group_id,syllabus_title,vip_id,realname,phone,
         card_kind,card_id,card_type_name,card_deduct_num,class_start_time,class_end_time,status,insert_time,update_time)
         VALUES (1,1,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?)`,
        [s.id, s.groupId, s.title, b.vip, b.name, b.phone, kind, b.card.cardId, b.card.cat.title, deduct,
          D(s.st), D(s.et), status, D(s.st.subtract(1, 'day')), D(s.et)]);
      booked++;
      if (status === 2 && deduct > 0) {
        await conn.query(
          `INSERT INTO biz_card_spend (merchant_id,club_id,card_id,vip_id,card_kind,card_type_name,scene,costs,unit_price,spend_money,
            syllabus_id,coach_id,coach_name,realname,phone,insert_time) VALUES (1,1,?,?,?,?,3,?,?,?,?,?,?,?,?,?)`,
          [b.card.cardId, b.vip, kind, b.card.cat.title, deduct, b.card.unit, +(deduct * b.card.unit).toFixed(2),
            s.id, 0, '', b.name, b.phone, D(s.et)]);
      }
    }
    await conn.query('UPDATE biz_syllabus_group SET booked_count=? WHERE id=?', [booked, s.id]);
  }
  for (const s of syllabusIds.future.slice(0, 12)) {
    const bookers = groupBookers.filter((_, i) => (s.id + i) % 2 === 0);
    let booked = 0;
    for (const b of bookers) {
      const kind = b.card.cat.card_kind;
      await conn.query(
        `INSERT INTO biz_syllabus_subscribe_record (merchant_id,club_id,syllabus_id,group_id,syllabus_title,vip_id,realname,phone,
         card_kind,card_id,card_type_name,card_deduct_num,class_start_time,class_end_time,status,insert_time)
         VALUES (1,1,?,?,?,?,?,?,?,?,?,?,?,?,1,NOW())`,
        [s.id, s.groupId, s.title, b.vip, b.name, b.phone, kind, b.card.cardId, b.card.cat.title, kind === 1 ? 1 : 0, D(s.st), D(s.et)]);
      booked++;
    }
    await conn.query('UPDATE biz_syllabus_group SET booked_count=? WHERE id=?', [booked, s.id]);
  }

  // ---- 私教预约: 过去已完成(消课+流水) + 未来待确认/已确认 ----
  const ptBookers = [
    { vip: 1, card: c1, name: '林小满', phone: '13911110001', coach: [1, '李强'] },
    { vip: 3, card: c3, name: '何佳音', phone: '13911110003', coach: [3, '陈晨'] },
    { vip: 5, card: c5, name: '吴雅婷', phone: '13911110005', coach: [2, '张伟'] },
    { vip: 9, card: c9, name: '罗曼', phone: '13911110009', coach: [3, '陈晨'] },
  ];
  const slots = ['09:00', '11:00', '15:00', '17:00', '20:00'];
  for (let d = -14; d <= 5; d++) {
    const day = today.add(d, 'day');
    for (let i = 0; i < ptBookers.length; i++) {
      const b = ptBookers[i];
      if ((d + i * 2) % 3 !== 0) continue;
      const from = slots[(d + i + 20) % slots.length];
      const st = dayjs(`${day.format('YYYY-MM-DD')} ${from}`);
      const et = st.add(1, 'hour');
      const isPast = et.isBefore(dayjs());
      const status = isPast ? 3 : (d <= 1 ? 1 : 0);
      const [r] = await conn.query(
        `INSERT INTO biz_ptrain_bespeak_record (merchant_id,club_id,coach_id,coach_name,vip_id,realname,phone,course_id,course_title,
          \`date\`,from_time,to_time,card_id,card_type_name,card_deduct_num,record_type,membership_id,confirm_status,status,insert_time)
         VALUES (1,1,?,?,?,?,?,1,'1v1 私教训练课',?,?,?,?,?,1,1,?,?,?,?)`,
        [b.coach[0], b.coach[1], b.vip, b.name, b.phone, day.format('YYYY-MM-DD'), from, et.format('HH:mm'),
          b.card.cardId, b.card.cat.title, b.vip <= 5 ? 4 : 5, isPast ? 2 : 0, status, D(st.subtract(1, 'day'))]);
      if (isPast) {
        const [r2] = await conn.query(
          `INSERT INTO biz_ptrain_record (merchant_id,club_id,vip_id,realname,coach_id,coach_name,once_card_id,costs,unit_price,spend_money,
            type,bespeak_id,is_syllabus_sub,reception_id,reception_remark,insert_time) VALUES (1,1,?,?,?,?,?,1,?,?,1,?,1,0,'学员扫码确认',?)`,
          [b.vip, b.name, b.coach[0], b.coach[1], b.card.cardId, b.card.unit, b.card.unit, r.insertId, D(et)]);
        await conn.query(
          `INSERT INTO biz_card_spend (merchant_id,club_id,card_id,vip_id,card_kind,card_type_name,scene,costs,unit_price,spend_money,
            ptrain_record_id,coach_id,coach_name,realname,phone,insert_time) VALUES (1,1,?,?,4,?,2,1,?,?,?,?,?,?,?,?)`,
          [b.card.cardId, b.vip, b.card.cat.title, b.card.unit, b.card.unit, r2.insertId, b.coach[0], b.coach[1], b.name, b.phone, D(et)]);
      }
    }
  }

  // ---- 签到记录 + 时间卡摊销/次卡扣次 ----
  const checkinUsers = [
    { vip: 2, card: c2, name: '徐志远', phone: '13911110002' },
    { vip: 6, card: c6, name: '郑凯', phone: '13911110006' },
    { vip: 8, card: c8, name: '高翔', phone: '13911110008' },
    { vip: 10, card: c10, name: '邓超群', phone: '13911110010' },
    { vip: 1, card: c1, name: '林小满', phone: '13911110001' },
    { vip: 5, card: c5, name: '吴雅婷', phone: '13911110005' },
  ];
  for (let d = -10; d <= 0; d++) {
    const day = today.add(d, 'day');
    for (let i = 0; i < checkinUsers.length; i++) {
      const u = checkinUsers[i];
      if ((d + i) % 2 !== 0) continue;
      const inT = day.add(9 + ((i * 3 + d + 30) % 12), 'hour').add(17, 'minute');
      if (inT.isAfter(dayjs())) continue;
      const outT = inT.add(90, 'minute');
      await conn.query(
        `INSERT INTO biz_checkin_record (merchant_id,club_id,vip_id,realname,phone,card_id,card_kind,card_type_name,check_in_time,check_out_time,ope_user_id,ope_username,port)
         VALUES (1,1,?,?,?,?,?,?,?,?,6,'周小雨',1)`,
        [u.vip, u.name, u.phone, u.card.cardId, u.card.cat.card_kind, u.card.cat.title, D(inT), D(outT)]);
      await conn.query('UPDATE biz_vip_user SET last_sign_time=? WHERE id=?', [D(inT), u.vip]);
      // 时间卡按天摊销一条耗卡流水
      if (u.card.cat.card_kind === 2) {
        const daily = +(Number(u.card.cat.price) / u.card.cat.expire_days).toFixed(2);
        await conn.query(
          `INSERT INTO biz_card_spend (merchant_id,club_id,card_id,vip_id,card_kind,card_type_name,scene,costs,unit_price,spend_money,realname,phone,insert_time)
           VALUES (1,1,?,?,2,?,1,0,?,?,?,?,?)`,
          [u.card.cardId, u.vip, u.card.cat.title, daily, daily, u.name, u.phone, D(inT)]);
      }
    }
  }

  // ---- 储值卡消费示例 ----
  await conn.query(
    `INSERT INTO biz_card_spend (merchant_id,club_id,card_id,vip_id,card_kind,card_type_name,scene,costs,unit_price,spend_money,realname,phone,remark,insert_time)
     VALUES (1,1,?,15,3,'储值卡·2000',4,0,0,240,'钱多多','13911110015','购买运动水杯+蛋白粉','${D(today.subtract(6, 'day').add(15, 'hour'))}'),
            (1,1,?,15,3,'储值卡·2000',4,0,0,400,'钱多多','13911110015','小团课程包4节','${D(today.subtract(2, 'day').add(18, 'hour'))}')`,
    [c15.cardId, c15.cardId]);

  // ---- Banner ----
  await conn.query(`INSERT INTO biz_club_banner (merchant_id,club_id,image,title,link,sort) VALUES
    (1,0,'/static/banner1.svg','新系统全面升级，查看使用引导','/guide',1),
    (1,0,'/static/banner2.svg','私教体验课 ¥19 限时抢','',2)`);

  // ---- 公告 ----
  await conn.query(`INSERT INTO sys_notice (scope,merchant_id,title,content) VALUES
    (1,0,'平台维护通知','系统将于每周三 02:00-04:00 进行例行维护，期间管理后台可能短暂不可用。'),
    (2,1,'提前祝各位学员中秋节国庆节双节快乐','中秋与国庆将至，3S运动中心全体教练提前祝各位学员双节快乐、阖家团圆！假期期间的营业时间与课程安排请留意门店通知，也欢迎提前在小程序上预约课程。')`);

  // ---- 更新会员到期快照 ----
  await conn.query(`UPDATE biz_vip_user v SET
    expire_time = (SELECT MAX(expire_time) FROM biz_member_card c WHERE c.vip_id=v.id AND c.status IN (0,1,3)),
    expire_status = CASE
      WHEN EXISTS (SELECT 1 FROM biz_member_card c WHERE c.vip_id=v.id AND c.status IN (0,1,3)) THEN 1
      WHEN EXISTS (SELECT 1 FROM biz_member_card c WHERE c.vip_id=v.id) THEN 2
      ELSE 0 END`);
  // 剩余次数/余额快照按流水修正卡剩余(seed 中 leftCounts 已给定, 跳过)

  console.log('Seed done.');
  const [[mc]] = await conn.query('SELECT COUNT(*) n FROM biz_member_card');
  const [[sp]] = await conn.query('SELECT COUNT(*) n FROM biz_card_spend');
  const [[sy]] = await conn.query('SELECT COUNT(*) n FROM biz_syllabus_group');
  console.log(`cards=${mc.n} spends=${sp.n} syllabus=${sy.n}`);
  await conn.end();
}

main().catch(e => { console.error(e); process.exit(1); });
