# 3S 健身房管理系统

基于《健身房管理系统产品功能文档 v2.0》开发的多商户（SaaS）健身房管理系统，覆盖四端：

| 端 | 地址 | 使用者 |
|---|---|---|
| 门户页 | http://localhost:8090/ | 各端入口导航 |
| 会员端 + 员工端（移动 H5） | http://localhost:8090/m/ | 会员 / 店长 / 顾问 / 前台 / 教练 |
| 商户管理后台（Web） | http://localhost:8090/admin/ | 店长 / 运营 |
| 平台总后台（Web） | http://localhost:8090/platform/ | SaaS 运营方 |

## 演示账号

- 平台管理员：`platform / admin123`
- 商户管理员：`admin / admin123`；店长：`manager01 / admin123`
- 会籍顾问：`sale01 / admin123`；前台：`front01 / admin123`；教练：`coach01 / admin123`
- 会员（移动端）：`13911110001 ~ 13911110016`，密码 `123456`
  - 13911110001 林小满：持私教20次卡 + 月卡；13911110002 徐志远：年卡；13911110015 钱多多：储值卡

## 启动 / 停止

```bash
./start.sh    # 启动 (端口 8090)
./stop.sh     # 停止
```

重置并重建演示数据：`cd server && node scripts/init-db.js --reset`

## 技术架构

- **后端**：Node.js + Express + MySQL（腾讯云 CynosDB），REST API，JWT 双身份认证（员工 / 会员）
- **前端**：Vue 3（CDN 全局构建，免编译）；后台用 Element Plus + ECharts，移动端用 Vant 4
- **数据库**：`fitness_app` 库，表前缀 `biz_`/`sys_`，多租户按 `merchant_id + club_id` 隔离；
  流水不可变（退卡负向冲减）、快照冗余（流水/预约冗余姓名手机号等）、金额 DECIMAL(10,2)

```
fitness-app/
├── 3S健身房管理系统产品功能文档.pdf   # PRD
├── start.sh / stop.sh
└── server/
    ├── API.md               # API 契约文档
    ├── scripts/schema.sql   # 建表
    ├── scripts/init-db.js   # 初始化 + 种子数据
    ├── src/
    │   ├── index.js / app.js / config.js / db.js / util.js
    │   ├── middleware/auth.js
    │   └── routes/          # auth/common/members/cards/coaches/group/checkin/finance/member/platform
    └── web/                 # 免构建前端（express 静态托管）
        ├── portal/  admin/  platform/  m/  static/
```

## 核心业务规则实现（对应 PRD）

- **会员生命周期**：潜客 → 在籍（持有效卡）→ 过期（召回池）；手机号商户内唯一；黑名单禁止签到/购卡/预约；删除仅逻辑禁用
- **四类卡**：次卡 / 时间卡 / 储值卡 / 私教卡，单表 + `card_kind`；卡类型（商品模板）与卡实例分离，改模板不影响已售卡
- **卡状态机**：待开卡(首次使用/指定日期激活, 超最晚开卡日自动激活) → 使用中 → 已过期 / 已暂停(有效期顺延) / 已停用 / 已退卡
- **耗卡口径**：`耗卡金额 = 消耗次数 × 实收单价(实收金额÷总次数)`；时间卡按签到日摊销；开卡收款计「预收」，消耗才计经营收入
- **预约规则引擎**：由卡类型配置驱动 — 每日/每周/每30天限次、可提前预约未完成单数上限、团课提前开约/截止窗口、开课前 N 小时内取消扣次、30 天爽约超限暂停约课资格
- **团课**：排课(教室/教练冲突校验) → 会员预约(满员候补排队) → 取消自动候补转正 → 到课扫码核销扣次 → 课后结算未到者计爽约
- **私教闭环**：会员自约(待教练确认) / 教练·员工代约(直接确认) → 教练发起消课 → 学员确认 → 扣课时 + 消课记录 + 耗卡流水（计教练有效课时）；支持店长补消课
- **合同**：每笔开卡/续费自动生成购卡合同，会员端手写签名签署
- **财务双口径**：预收（收款流水）与耗卡（消耗流水）分列；月报含新用户/复购营收、卡类型构成、顾问业绩（归开卡单顾问）、教练课时

## 数据库连接

- 外网：`cd-cynosdbmysql-grp-333otp80.sql.tencentcdb.com:29057`（当前使用）
- 内网：`10.6.0.6:3306`（部署到腾讯云同 VPC 服务器时改用，见 `server/src/config.js`，支持环境变量 `DB_HOST/DB_PORT/DB_USER/DB_PASSWORD` 覆盖）
