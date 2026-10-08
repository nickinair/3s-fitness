-- 健身房管理系统 数据库结构 v1.0
-- 多租户: 所有业务表带 merchant_id + club_id; 金额 DECIMAL(10,2); 时间 DATETIME; 状态 TINYINT
CREATE DATABASE IF NOT EXISTS fitness_app DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;
USE fitness_app;

-- ============ 平台/系统域 ============

-- 商户表（平台层）
CREATE TABLE IF NOT EXISTS sys_merchant (
  id INT AUTO_INCREMENT PRIMARY KEY,
  name VARCHAR(64) NOT NULL COMMENT '商户名称',
  contact VARCHAR(32) COMMENT '联系人',
  phone VARCHAR(20) COMMENT '联系电话',
  status TINYINT DEFAULT 1 COMMENT '1启用 0停用',
  expire_time DATETIME COMMENT '服务到期时间',
  remark VARCHAR(255),
  insert_time DATETIME DEFAULT CURRENT_TIMESTAMP
) ENGINE=InnoDB COMMENT='商户';

-- 门店表
CREATE TABLE IF NOT EXISTS biz_club (
  id INT AUTO_INCREMENT PRIMARY KEY,
  merchant_id INT NOT NULL,
  name VARCHAR(64) NOT NULL,
  logo VARCHAR(255) DEFAULT '',
  images TEXT COMMENT '相册JSON',
  address VARCHAR(255) DEFAULT '',
  phone VARCHAR(20) DEFAULT '',
  intro TEXT,
  open_time VARCHAR(64) DEFAULT '06:00-22:00' COMMENT '营业时段',
  sort INT NOT NULL DEFAULT 0 COMMENT '展示排序, 小的在前; 会员约课默认选中第一个',
  status TINYINT DEFAULT 1,
  insert_time DATETIME DEFAULT CURRENT_TIMESTAMP,
  KEY idx_merchant (merchant_id)
) ENGINE=InnoDB COMMENT='门店';

-- 员工账号表（含平台管理员、店长、顾问、前台、教练）
CREATE TABLE IF NOT EXISTS sys_user (
  id INT AUTO_INCREMENT PRIMARY KEY,
  merchant_id INT DEFAULT 0 COMMENT '0=平台账号',
  club_id INT DEFAULT 0 COMMENT '归属门店, 0=商户级',
  username VARCHAR(32) NOT NULL,
  password VARCHAR(100) NOT NULL,
  realname VARCHAR(32) DEFAULT '',
  phone VARCHAR(20) DEFAULT '',
  avatar VARCHAR(255) DEFAULT '',
  role VARCHAR(20) NOT NULL COMMENT 'platform/admin/manager/membership/reception/coach',
  base_salary DECIMAL(10,2) NOT NULL DEFAULT 0 COMMENT '固定工资(元/月)',
  sales_rate DECIMAL(5,2) NOT NULL DEFAULT 0 COMMENT '销售提成比例(%)',
  course_rate DECIMAL(5,2) NOT NULL DEFAULT 0 COMMENT '课程提成比例(%)',
  status TINYINT DEFAULT 1,
  insert_time DATETIME DEFAULT CURRENT_TIMESTAMP,
  UNIQUE KEY uk_username (username),
  KEY idx_merchant (merchant_id, club_id)
) ENGINE=InnoDB COMMENT='员工账号';

-- 操作日志
CREATE TABLE IF NOT EXISTS sys_log (
  id INT AUTO_INCREMENT PRIMARY KEY,
  merchant_id INT DEFAULT 0,
  club_id INT DEFAULT 0,
  user_id INT,
  username VARCHAR(32),
  action VARCHAR(64),
  detail VARCHAR(500),
  insert_time DATETIME DEFAULT CURRENT_TIMESTAMP,
  KEY idx_mc (merchant_id, insert_time)
) ENGINE=InnoDB COMMENT='操作日志';

-- 通知公告
CREATE TABLE IF NOT EXISTS sys_notice (
  id INT AUTO_INCREMENT PRIMARY KEY,
  scope TINYINT DEFAULT 1 COMMENT '1平台发商户 2商户发会员',
  merchant_id INT DEFAULT 0 COMMENT '0=全部商户',
  title VARCHAR(128) NOT NULL,
  content TEXT,
  status TINYINT DEFAULT 1,
  insert_time DATETIME DEFAULT CURRENT_TIMESTAMP
) ENGINE=InnoDB COMMENT='通知公告';

-- 广告位/Banner
CREATE TABLE IF NOT EXISTS biz_club_banner (
  id INT AUTO_INCREMENT PRIMARY KEY,
  merchant_id INT NOT NULL,
  club_id INT DEFAULT 0,
  image VARCHAR(500) NOT NULL,
  title VARCHAR(64) DEFAULT '',
  link VARCHAR(255) DEFAULT '',
  sort INT DEFAULT 0,
  status TINYINT DEFAULT 1,
  insert_time DATETIME DEFAULT CURRENT_TIMESTAMP
) ENGINE=InnoDB COMMENT='广告位';

-- ============ 会员域 ============

-- 会员档案表（业务锚点）
CREATE TABLE IF NOT EXISTS biz_vip_user (
  id INT AUTO_INCREMENT PRIMARY KEY,
  merchant_id INT NOT NULL,
  phone VARCHAR(20) NOT NULL COMMENT '会员唯一标识',
  password VARCHAR(100) DEFAULT '' COMMENT '小程序/H5登录密码',
  realname VARCHAR(32) DEFAULT '',
  nickname VARCHAR(32) DEFAULT '',
  avatar VARCHAR(255) DEFAULT '',
  gender TINYINT DEFAULT 0 COMMENT '0未知 1男 2女',
  birthday DATE,
  id_card_number VARCHAR(32) DEFAULT '',
  address VARCHAR(255) DEFAULT '',
  source_id INT DEFAULT 0,
  source_name VARCHAR(32) DEFAULT '',
  membership_id INT DEFAULT 0 COMMENT '会籍顾问',
  membership_name VARCHAR(32) DEFAULT '',
  coach_id INT DEFAULT 0 COMMENT '跟进教练',
  coach_name VARCHAR(32) DEFAULT '',
  introduce_person_id INT DEFAULT 0,
  introduce_count INT DEFAULT 0,
  points INT DEFAULT 0,
  used_points INT DEFAULT 0,
  is_universe_vip TINYINT DEFAULT 1 COMMENT '多门店通用会员',
  expire_time DATETIME COMMENT '最近到期时间(有效卡最大到期)',
  expire_status TINYINT DEFAULT 0 COMMENT '0无卡 1在籍 2已过期',
  last_sign_time DATETIME,
  last_maintain_time DATETIME,
  label_levels TINYINT DEFAULT 0 COMMENT '0无 1A 2B 3C',
  is_import TINYINT DEFAULT 0,
  is_black TINYINT DEFAULT 0 COMMENT '黑名单',
  black_reason VARCHAR(255) DEFAULT '',
  remark VARCHAR(500) DEFAULT '',
  status TINYINT DEFAULT 1 COMMENT '1正常 0禁用(逻辑删除)',
  insert_time DATETIME DEFAULT CURRENT_TIMESTAMP,
  update_time DATETIME DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
  UNIQUE KEY uk_phone (merchant_id, phone),
  KEY idx_expire (merchant_id, expire_status, expire_time),
  KEY idx_membership (merchant_id, membership_id)
) ENGINE=InnoDB COMMENT='会员档案';

-- 会员-门店关联（多门店通用会员）
CREATE TABLE IF NOT EXISTS biz_user_club (
  id INT AUTO_INCREMENT PRIMARY KEY,
  vip_user_id INT NOT NULL,
  club_id INT NOT NULL,
  insert_time DATETIME DEFAULT CURRENT_TIMESTAMP,
  UNIQUE KEY uk_vc (vip_user_id, club_id),
  KEY idx_club (club_id)
) ENGINE=InnoDB COMMENT='会员门店关联';

-- 潜在客户表
CREATE TABLE IF NOT EXISTS biz_user_potential (
  id INT AUTO_INCREMENT PRIMARY KEY,
  merchant_id INT NOT NULL,
  club_id INT NOT NULL,
  realname VARCHAR(32) DEFAULT '',
  phone VARCHAR(20) NOT NULL,
  gender TINYINT DEFAULT 0,
  membership_id INT DEFAULT 0,
  membership_name VARCHAR(32) DEFAULT '',
  coach_id INT DEFAULT 0,
  source_id INT DEFAULT 0,
  source_name VARCHAR(32) DEFAULT '',
  label_levels TINYINT DEFAULT 0 COMMENT '意向 1A 2B 3C',
  last_maintain_time DATETIME,
  last_maintain_record VARCHAR(255) DEFAULT '',
  is_vip_user TINYINT DEFAULT 0 COMMENT '已转正',
  vip_user_id INT DEFAULT 0,
  remark VARCHAR(500) DEFAULT '',
  status TINYINT DEFAULT 1,
  insert_time DATETIME DEFAULT CURRENT_TIMESTAMP,
  KEY idx_mc (merchant_id, club_id, is_vip_user)
) ENGINE=InnoDB COMMENT='潜在客户';

-- 会员维护记录
CREATE TABLE IF NOT EXISTS biz_maintain_record (
  id INT AUTO_INCREMENT PRIMARY KEY,
  merchant_id INT NOT NULL,
  club_id INT NOT NULL,
  vip_user_id INT NOT NULL,
  vip_user_type TINYINT DEFAULT 1 COMMENT '1会员 2潜客',
  membership_id INT DEFAULT 0,
  membership_name VARCHAR(32) DEFAULT '',
  record_type TINYINT DEFAULT 1 COMMENT '1电话 2到店 3微信 4其他',
  content TEXT,
  is_todo TINYINT DEFAULT 0,
  todo_time DATETIME,
  status TINYINT DEFAULT 1,
  insert_time DATETIME DEFAULT CURRENT_TIMESTAMP,
  KEY idx_vip (vip_user_id, vip_user_type, insert_time)
) ENGINE=InnoDB COMMENT='会员维护记录';

-- 来源渠道字典
CREATE TABLE IF NOT EXISTS biz_user_source (
  id INT AUTO_INCREMENT PRIMARY KEY,
  merchant_id INT NOT NULL,
  title VARCHAR(32) NOT NULL,
  sort INT DEFAULT 0,
  status TINYINT DEFAULT 1
) ENGINE=InnoDB COMMENT='来源渠道';

-- ============ 会员卡域 ============

-- 卡类型表（商品模板）
CREATE TABLE IF NOT EXISTS biz_card_category (
  id INT AUTO_INCREMENT PRIMARY KEY,
  merchant_id INT NOT NULL,
  club_id INT DEFAULT 0 COMMENT '0=全部门店',
  card_kind TINYINT NOT NULL COMMENT '1次卡 2时间卡 3储值卡 4私教卡',
  title VARCHAR(64) NOT NULL,
  intro TEXT,
  expire_days INT DEFAULT 0 COMMENT '有效天数',
  total_counts INT DEFAULT 0 COMMENT '总次数(时间卡为0)',
  price DECIMAL(10,2) DEFAULT 0 COMMENT '现售价; 储值卡=充值本金',
  original_price DECIMAL(10,2) DEFAULT 0,
  gift_money DECIMAL(10,2) DEFAULT 0 COMMENT '储值卡赠额',
  course_permission TEXT COMMENT '可约课程范围JSON []=不限',
  book_limit_day INT DEFAULT 0 COMMENT '每日最大预约 0不限',
  book_limit_week INT DEFAULT 0,
  book_limit_month30 INT DEFAULT 0,
  advance_book_limit INT DEFAULT 0 COMMENT '最多提前预约的未完成单数',
  free_cancel_total INT DEFAULT 0 COMMENT '总免责取消次数 0不限',
  free_cancel_month_overtime INT DEFAULT 0 COMMENT '每月超时免责取消次数',
  noshow_limit_30d INT DEFAULT 3 COMMENT '30天内爽约上限,超限暂停约课',
  pause_times INT DEFAULT 0 COMMENT '可暂停次数',
  pause_max_days INT DEFAULT 0 COMMENT '单次最长暂停天数',
  open_card_mode TINYINT DEFAULT 1 COMMENT '1购买立即 2首次使用 3指定日期',
  latest_open_days INT DEFAULT 30 COMMENT '购卡后N天自动激活',
  book_time_range VARCHAR(64) DEFAULT '' COMMENT '可预约时间范围',
  group_advance_range VARCHAR(64) DEFAULT '' COMMENT '团课提前预约: 提前N天开约,开课前N小时截止 如 7,2',
  cancel_deadline_hours INT DEFAULT 2 COMMENT '开课前N小时可免责取消',
  free_train_time_range VARCHAR(64) DEFAULT '' COMMENT '自由训练入场时段',
  online_sale TINYINT DEFAULT 1,
  purchase_limit INT DEFAULT 0 COMMENT '每人限购 0不限',
  student_only TINYINT DEFAULT 0,
  cover_img VARCHAR(500) DEFAULT '',
  card_img VARCHAR(500) DEFAULT '',
  sort INT DEFAULT 0,
  status TINYINT DEFAULT 1 COMMENT '1上架 0下架',
  insert_time DATETIME DEFAULT CURRENT_TIMESTAMP,
  KEY idx_mc (merchant_id, club_id, status)
) ENGINE=InnoDB COMMENT='卡类型(商品模板)';

-- 会员卡实例表（单表 + card_kind）
CREATE TABLE IF NOT EXISTS biz_member_card (
  id INT AUTO_INCREMENT PRIMARY KEY,
  merchant_id INT NOT NULL,
  club_id INT NOT NULL COMMENT '购卡门店',
  vip_id INT NOT NULL,
  card_kind TINYINT NOT NULL,
  card_type_id INT NOT NULL,
  card_type_name VARCHAR(64) DEFAULT '',
  counts INT DEFAULT 0 COMMENT '总次数',
  left_counts INT DEFAULT 0 COMMENT '剩余次数',
  sum_money DECIMAL(10,2) DEFAULT 0 COMMENT '储值卡总额(本金+赠额)',
  left_money DECIMAL(10,2) DEFAULT 0 COMMENT '储值卡余额',
  unit_price DECIMAL(10,2) DEFAULT 0 COMMENT '实收单价=实收金额/总次数',
  actual_money DECIMAL(10,2) DEFAULT 0 COMMENT '实收金额',
  retainage DECIMAL(10,2) DEFAULT 0 COMMENT '尾款',
  open_card_mode TINYINT DEFAULT 1,
  open_card_time DATETIME COMMENT '开卡(激活)时间',
  start_use_time DATETIME COMMENT '起用时间',
  expire_time DATETIME COMMENT '到期时间',
  expire_days INT DEFAULT 0 COMMENT '有效天数(待开卡时用于计算)',
  latest_open_time DATETIME COMMENT '最晚开卡日期',
  suspend_start_time DATETIME,
  suspend_end_time DATETIME,
  pause_used_times INT DEFAULT 0,
  contract_number VARCHAR(40) DEFAULT '',
  is_renew_card TINYINT DEFAULT 0,
  is_united_card TINYINT DEFAULT 1 COMMENT '多店通用',
  coach_id INT DEFAULT 0,
  coach_name VARCHAR(32) DEFAULT '',
  membership_id INT DEFAULT 0 COMMENT '业绩归属顾问',
  membership_name VARCHAR(32) DEFAULT '',
  ope_user_id INT DEFAULT 0,
  ope_username VARCHAR(32) DEFAULT '',
  pay_method VARCHAR(20) DEFAULT '' COMMENT 'wechat/alipay/cash/pos/transfer',
  realname VARCHAR(32) DEFAULT '',
  phone VARCHAR(20) DEFAULT '',
  source_port TINYINT DEFAULT 1 COMMENT '1后台 2小程序 3员工端',
  remark VARCHAR(500) DEFAULT '',
  ext_card_id VARCHAR(32) NOT NULL DEFAULT '' COMMENT '原系统会员卡ID(导入去重用)',
  physical_card_no VARCHAR(32) NOT NULL DEFAULT '' COMMENT '实体卡号',
  left_gift_money DECIMAL(10,2) NOT NULL DEFAULT 0 COMMENT '储值卡剩余赠送金额',
  status TINYINT DEFAULT 1 COMMENT '0待开卡 1使用中 2已过期 3已暂停 4已停用 5已退卡',
  insert_time DATETIME DEFAULT CURRENT_TIMESTAMP,
  update_time DATETIME DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
  KEY idx_vip (vip_id, status),
  KEY idx_mc (merchant_id, club_id, status),
  KEY idx_expire (merchant_id, status, expire_time)
) ENGINE=InnoDB COMMENT='会员卡实例';

-- 收款流水表（开卡/续费/充值/退卡负向冲减）不可变
CREATE TABLE IF NOT EXISTS biz_card_recharge (
  id INT AUTO_INCREMENT PRIMARY KEY,
  merchant_id INT NOT NULL,
  club_id INT NOT NULL,
  card_id INT NOT NULL,
  vip_id INT NOT NULL,
  card_kind TINYINT NOT NULL,
  card_type_id INT DEFAULT 0,
  card_type_name VARCHAR(64) DEFAULT '',
  type TINYINT DEFAULT 1 COMMENT '1开卡 2续卡 3充值 4退卡',
  actual_money DECIMAL(10,2) DEFAULT 0 COMMENT '实收(退卡为负)',
  gift_money DECIMAL(10,2) DEFAULT 0,
  counts INT DEFAULT 0 COMMENT '增加次数',
  expire_days INT DEFAULT 0 COMMENT '增加天数',
  pay_method VARCHAR(20) DEFAULT '',
  membership_id INT DEFAULT 0,
  membership_name VARCHAR(32) DEFAULT '',
  ope_user_id INT DEFAULT 0,
  ope_username VARCHAR(32) DEFAULT '',
  realname VARCHAR(32) DEFAULT '',
  phone VARCHAR(20) DEFAULT '',
  contract_number VARCHAR(40) DEFAULT '',
  is_new_user TINYINT DEFAULT 0 COMMENT '新用户首单',
  remark VARCHAR(500) DEFAULT '',
  insert_time DATETIME DEFAULT CURRENT_TIMESTAMP,
  KEY idx_card (card_id),
  KEY idx_mc_time (merchant_id, club_id, insert_time),
  KEY idx_membership (merchant_id, membership_id, insert_time)
) ENGINE=InnoDB COMMENT='收款流水';

-- 消耗流水表（每次核销一条, 耗卡金额=costs×unit_price）不可变
CREATE TABLE IF NOT EXISTS biz_card_spend (
  id INT AUTO_INCREMENT PRIMARY KEY,
  merchant_id INT NOT NULL,
  club_id INT NOT NULL,
  card_id INT NOT NULL,
  vip_id INT NOT NULL,
  card_kind TINYINT NOT NULL,
  card_type_name VARCHAR(64) DEFAULT '',
  scene TINYINT DEFAULT 1 COMMENT '1自由训练签到 2私教消课 3团课核销 4储值消费 5爽约扣次',
  costs INT DEFAULT 0 COMMENT '扣减次数/课时',
  unit_price DECIMAL(10,2) DEFAULT 0,
  spend_money DECIMAL(10,2) DEFAULT 0 COMMENT '耗卡金额',
  syllabus_id INT DEFAULT 0,
  ptrain_record_id INT DEFAULT 0,
  coach_id INT DEFAULT 0,
  coach_name VARCHAR(32) DEFAULT '',
  membership_id INT DEFAULT 0,
  ope_user_id INT DEFAULT 0,
  ope_username VARCHAR(32) DEFAULT '',
  realname VARCHAR(32) DEFAULT '',
  phone VARCHAR(20) DEFAULT '',
  remark VARCHAR(255) DEFAULT '',
  insert_time DATETIME DEFAULT CURRENT_TIMESTAMP,
  KEY idx_card (card_id),
  KEY idx_mc_time (merchant_id, club_id, insert_time),
  KEY idx_scene (merchant_id, scene, insert_time)
) ENGINE=InnoDB COMMENT='消耗流水';

-- 合同表
CREATE TABLE IF NOT EXISTS biz_club_contract (
  id INT AUTO_INCREMENT PRIMARY KEY,
  merchant_id INT NOT NULL,
  club_id INT NOT NULL,
  contract_num VARCHAR(40) NOT NULL,
  card_id INT DEFAULT 0,
  recharge_id INT DEFAULT 0,
  vip_id INT DEFAULT 0,
  realname VARCHAR(32) DEFAULT '',
  phone VARCHAR(20) DEFAULT '',
  title VARCHAR(128) DEFAULT '',
  type TINYINT DEFAULT 1 COMMENT '1免费合同 2电子签',
  content LONGTEXT COMMENT '合同正文',
  sign_status TINYINT DEFAULT 0 COMMENT '0未签署 1已签署',
  sign_img MEDIUMTEXT COMMENT '签名图base64',
  sign_time DATETIME,
  hidden TINYINT DEFAULT 0,
  insert_time DATETIME DEFAULT CURRENT_TIMESTAMP,
  UNIQUE KEY uk_num (contract_num),
  KEY idx_vip (vip_id)
) ENGINE=InnoDB COMMENT='购卡合同';

-- ============ 教练与履约域 ============

-- 教练表（员工的教练特化档案）
CREATE TABLE IF NOT EXISTS biz_club_coach (
  id INT AUTO_INCREMENT PRIMARY KEY,
  merchant_id INT NOT NULL,
  club_id INT NOT NULL,
  user_id INT DEFAULT 0 COMMENT '关联sys_user',
  realname VARCHAR(32) NOT NULL,
  nickname VARCHAR(32) DEFAULT '',
  avatar VARCHAR(500) DEFAULT '',
  cover VARCHAR(500) DEFAULT '',
  `desc` TEXT COMMENT '简介',
  good_at VARCHAR(255) DEFAULT '' COMMENT '擅长领域',
  detail TEXT COMMENT '详情介绍',
  month_ptrain_count INT DEFAULT 0,
  vip_count INT DEFAULT 0,
  sort INT DEFAULT 0,
  status TINYINT DEFAULT 1 COMMENT '1在职 0离职',
  insert_time DATETIME DEFAULT CURRENT_TIMESTAMP,
  KEY idx_mc (merchant_id, club_id, status)
) ENGINE=InnoDB COMMENT='教练档案';

-- 私教课程类型
CREATE TABLE IF NOT EXISTS biz_ptrain_course (
  id INT AUTO_INCREMENT PRIMARY KEY,
  merchant_id INT NOT NULL,
  club_id INT NOT NULL,
  title VARCHAR(64) NOT NULL,
  course_type TINYINT DEFAULT 1 COMMENT '1=1v1 2=小团',
  duration INT DEFAULT 60 COMMENT '分钟',
  cover VARCHAR(500) DEFAULT '',
  people_count INT DEFAULT 1,
  card_scope TEXT COMMENT '可用卡类型idJSON []=全部私教卡',
  coach_ids TEXT COMMENT '授课教练idJSON []=全部',
  intro TEXT,
  sort INT DEFAULT 0,
  status TINYINT DEFAULT 1,
  insert_time DATETIME DEFAULT CURRENT_TIMESTAMP,
  KEY idx_mc (merchant_id, club_id, status)
) ENGINE=InnoDB COMMENT='私教课程类型';

-- 教练休息设置
CREATE TABLE IF NOT EXISTS biz_coach_rest (
  id INT AUTO_INCREMENT PRIMARY KEY,
  merchant_id INT NOT NULL,
  club_id INT NOT NULL,
  coach_id INT NOT NULL,
  rest_date DATE NOT NULL,
  from_time VARCHAR(5) DEFAULT '' COMMENT '空=全天',
  to_time VARCHAR(5) DEFAULT '',
  remark VARCHAR(128) DEFAULT '',
  insert_time DATETIME DEFAULT CURRENT_TIMESTAMP,
  KEY idx_coach (coach_id, rest_date)
) ENGINE=InnoDB COMMENT='教练休息';

-- 私教预约表
CREATE TABLE IF NOT EXISTS biz_ptrain_bespeak_record (
  id INT AUTO_INCREMENT PRIMARY KEY,
  merchant_id INT NOT NULL,
  club_id INT NOT NULL,
  coach_id INT NOT NULL,
  coach_name VARCHAR(32) DEFAULT '',
  vip_id INT NOT NULL,
  realname VARCHAR(32) DEFAULT '',
  phone VARCHAR(20) DEFAULT '',
  course_id INT DEFAULT 0,
  course_title VARCHAR(64) DEFAULT '',
  `date` DATE NOT NULL,
  from_time VARCHAR(5) NOT NULL,
  to_time VARCHAR(5) NOT NULL,
  card_kind TINYINT DEFAULT 4,
  card_id INT DEFAULT 0,
  card_type_name VARCHAR(64) DEFAULT '',
  card_deduct_num INT DEFAULT 1,
  record_type TINYINT DEFAULT 1 COMMENT '1会员自约 2教练代约 3员工代约',
  membership_id INT DEFAULT 0,
  confirm_status TINYINT DEFAULT 0 COMMENT '消课确认: 0无 1待学员确认 2已确认',
  cancel_reason VARCHAR(255) DEFAULT '',
  remark VARCHAR(255) DEFAULT '',
  status TINYINT DEFAULT 0 COMMENT '0待确认 1已确认 2已取消 3已完成 4已爽约',
  insert_time DATETIME DEFAULT CURRENT_TIMESTAMP,
  update_time DATETIME DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
  KEY idx_coach_date (coach_id, `date`),
  KEY idx_vip (vip_id, status),
  KEY idx_mc (merchant_id, club_id, `date`)
) ENGINE=InnoDB COMMENT='私教预约';

-- 消课记录表（核销留痕, 计教练有效课时）
CREATE TABLE IF NOT EXISTS biz_ptrain_record (
  id INT AUTO_INCREMENT PRIMARY KEY,
  merchant_id INT NOT NULL,
  club_id INT NOT NULL,
  vip_id INT NOT NULL,
  realname VARCHAR(32) DEFAULT '',
  coach_id INT NOT NULL,
  coach_name VARCHAR(32) DEFAULT '',
  once_card_id INT DEFAULT 0 COMMENT '扣减的卡',
  costs INT DEFAULT 1 COMMENT '课时数',
  unit_price DECIMAL(10,2) DEFAULT 0,
  spend_money DECIMAL(10,2) DEFAULT 0 COMMENT '耗课金额',
  type TINYINT DEFAULT 1 COMMENT '1私教 2团课 3体验',
  syllabus_id INT DEFAULT 0,
  bespeak_id INT DEFAULT 0,
  is_syllabus_sub TINYINT DEFAULT 1 COMMENT '是否来自预约',
  reception_id INT DEFAULT 0 COMMENT '确认人(学员=0为本人)',
  reception_remark VARCHAR(255) DEFAULT '',
  insert_time DATETIME DEFAULT CURRENT_TIMESTAMP,
  KEY idx_coach (coach_id, insert_time),
  KEY idx_mc (merchant_id, club_id, insert_time)
) ENGINE=InnoDB COMMENT='消课记录';

-- ============ 团课域 ============

-- 团课课程库
CREATE TABLE IF NOT EXISTS biz_course_group (
  id INT AUTO_INCREMENT PRIMARY KEY,
  merchant_id INT NOT NULL,
  club_id INT NOT NULL,
  title VARCHAR(64) NOT NULL,
  cover VARCHAR(500) DEFAULT '',
  duration INT DEFAULT 60,
  difficulty TINYINT DEFAULT 1 COMMENT '1-5',
  deduct_num INT DEFAULT 1 COMMENT '消耗次数',
  card_scope TEXT COMMENT '适用卡JSON []=全部',
  intro TEXT,
  tags VARCHAR(128) DEFAULT '',
  status TINYINT DEFAULT 1,
  insert_time DATETIME DEFAULT CURRENT_TIMESTAMP,
  KEY idx_mc (merchant_id, club_id, status)
) ENGINE=InnoDB COMMENT='团课课程库';

-- 教室/场地
CREATE TABLE IF NOT EXISTS biz_syllabus_classroom (
  id INT AUTO_INCREMENT PRIMARY KEY,
  merchant_id INT NOT NULL,
  club_id INT NOT NULL,
  title VARCHAR(64) NOT NULL,
  capacity INT DEFAULT 20,
  status TINYINT DEFAULT 1
) ENGINE=InnoDB COMMENT='教室场地';

-- 团课排课表
CREATE TABLE IF NOT EXISTS biz_syllabus_group (
  id INT AUTO_INCREMENT PRIMARY KEY,
  merchant_id INT NOT NULL,
  club_id INT NOT NULL,
  group_id INT NOT NULL COMMENT '课程库id',
  title VARCHAR(64) DEFAULT '',
  coach_id INT DEFAULT 0,
  coach_name VARCHAR(32) DEFAULT '',
  temporary_coach VARCHAR(32) DEFAULT '' COMMENT '临时代课',
  classroom_id INT DEFAULT 0,
  classroom_name VARCHAR(64) DEFAULT '',
  start_time DATETIME NOT NULL,
  end_time DATETIME NOT NULL,
  people_count INT DEFAULT 20 COMMENT '满员人数',
  lower_limit INT DEFAULT 0 COMMENT '最低开课人数',
  booked_count INT DEFAULT 0 COMMENT '已约人数(冗余)',
  deduct_num INT DEFAULT 1,
  is_vipuser_sub TINYINT DEFAULT 0 COMMENT '限会员预约',
  self_cancel TINYINT DEFAULT 1 COMMENT '允许自主取消',
  hidden TINYINT DEFAULT 0,
  status TINYINT DEFAULT 1 COMMENT '1正常 2已取消 3已结课',
  insert_time DATETIME DEFAULT CURRENT_TIMESTAMP,
  KEY idx_mc_time (merchant_id, club_id, start_time),
  KEY idx_coach (coach_id, start_time)
) ENGINE=InnoDB COMMENT='团课排课';

-- 团课预约记录表
CREATE TABLE IF NOT EXISTS biz_syllabus_subscribe_record (
  id INT AUTO_INCREMENT PRIMARY KEY,
  merchant_id INT NOT NULL,
  club_id INT NOT NULL,
  syllabus_id INT NOT NULL,
  group_id INT DEFAULT 0,
  syllabus_title VARCHAR(64) DEFAULT '',
  vip_id INT NOT NULL,
  realname VARCHAR(32) DEFAULT '',
  phone VARCHAR(20) DEFAULT '',
  card_kind TINYINT DEFAULT 0,
  card_id INT DEFAULT 0,
  card_type_name VARCHAR(64) DEFAULT '',
  card_deduct_num INT DEFAULT 1,
  seat_number INT DEFAULT 0,
  class_start_time DATETIME,
  class_end_time DATETIME,
  user_type TINYINT DEFAULT 1 COMMENT '1会员自约 2代约',
  queue_no INT DEFAULT 0 COMMENT '候补序号 0=正式',
  cancel_reason VARCHAR(255) DEFAULT '',
  status TINYINT DEFAULT 1 COMMENT '0候补 1已约 2已核销 3已取消 4已爽约',
  insert_time DATETIME DEFAULT CURRENT_TIMESTAMP,
  update_time DATETIME DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
  KEY idx_syllabus (syllabus_id, status),
  KEY idx_vip (vip_id, status),
  KEY idx_mc (merchant_id, club_id, class_start_time)
) ENGINE=InnoDB COMMENT='团课预约记录';

-- ============ 用户自定义面板布局 ============

CREATE TABLE IF NOT EXISTS sys_user_widget (
  id INT AUTO_INCREMENT PRIMARY KEY,
  user_id INT NOT NULL COMMENT '员工 sys_user.id 或会员 biz_vip_user.id',
  scope VARCHAR(24) NOT NULL DEFAULT 'staff_workbench' COMMENT 'staff_workbench 员工工作台 / member_home 会员首页常用功能',
  items JSON COMMENT '入口 key 顺序数组, 顺序即展示顺序',
  update_time DATETIME DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
  UNIQUE KEY uk_user_scope (user_id, scope)
) ENGINE=InnoDB COMMENT='用户自定义面板布局';

-- ============ 用户自定义按钮配置 ============

CREATE TABLE IF NOT EXISTS sys_user_button_configs (
  id INT AUTO_INCREMENT PRIMARY KEY,
  user_id INT NOT NULL COMMENT '用户ID',
  role VARCHAR(50) NOT NULL COMMENT '角色：admin, coach, member',
  page_type VARCHAR(100) NOT NULL COMMENT '页面类型：admin-dashboard, coach-dashboard, member-home等',
  button_config JSON NOT NULL COMMENT '按钮配置JSON：[{id, title, icon, url, sort_order, enabled}]',
  created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
  updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
  UNIQUE KEY uk_user_role_page (user_id, role, page_type),
  INDEX idx_user_id (user_id),
  INDEX idx_role (role)
) ENGINE=InnoDB COMMENT='用户自定义按钮配置表';

-- ============ 用户自定义面板布局 ============

CREATE TABLE IF NOT EXISTS sys_user_widget (
  id INT AUTO_INCREMENT PRIMARY KEY,
  user_id INT NOT NULL COMMENT '员工 sys_user.id 或会员 biz_vip_user.id',
  scope VARCHAR(24) NOT NULL DEFAULT 'staff_workbench' COMMENT 'staff_workbench 员工工作台 / member_home 会员首页常用功能',
  items JSON COMMENT '入口 key 顺序数组, 顺序即展示顺序',
  update_time DATETIME DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
  UNIQUE KEY uk_user_scope (user_id, scope)
) ENGINE=InnoDB COMMENT='用户自定义面板布局';
