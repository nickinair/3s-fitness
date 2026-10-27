/* 员工端-工作台 + 我的 */
(function () {
  /* 工作台入口注册表: t=名称 icon=Vant图标 to=路由 badge=角标来源 roles=可见角色。
     roles 与下方 MENU_TREE(全部功能折叠面板)及 PC 后台菜单一致 —— 添加/移除按钮时按它过滤。 */
  const MENU = {
    checkin: { t: '快速签到', icon: 'aim', to: '/staff/checkin', roles: ['admin', 'manager', 'reception'] },
    opencard: { t: '快速开卡', icon: 'credit-pay', to: '/staff/opencard', roles: ['admin', 'manager', 'membership', 'reception'] },
    book: { t: '代约课', icon: 'calendar-o', to: '/staff/book', roles: ['admin', 'manager', 'coach'] },
    members: { t: '会员查询', icon: 'search', to: '/staff/members', roles: ['admin', 'manager', 'membership', 'reception'] },
    groupToday: { t: '团课核销', icon: 'todo-list-o', to: '/staff/group-today', roles: ['admin', 'manager', 'reception'] },
    todayBook: { t: '今日预约', icon: 'clock-o', to: '/staff/today', roles: ['admin', 'manager', 'membership', 'reception', 'coach'] },
    potential: { t: '录潜客', icon: 'add-o', to: '/staff/potential', roles: ['admin', 'manager', 'membership'] },
    sales: { t: '顾问业绩', icon: 'chart-trending-o', to: '/staff/sales', roles: ['admin', 'manager', 'membership'] },
    cschedule: { t: '我的课表', icon: 'calendar-o', to: '/staff/schedule', roles: ['admin', 'manager', 'coach'] },
    cbookings: { t: '预约管理', icon: 'orders-o', to: '/staff/bookings', roles: ['admin', 'manager', 'reception', 'coach'], badge: 'pt' },
    cplans: { t: '训练计划', icon: 'notes-o', to: '/staff/plans', roles: ['admin', 'manager', 'coach'] },
    cmilestones: { t: '里程碑总结', icon: 'medal-o', to: '/staff/milestones', roles: ['admin', 'manager', 'coach'], badge: 'milestone' },
    intents: { t: '购卡意向', icon: 'shopping-cart-o', to: '/staff/intents', roles: ['admin', 'manager', 'membership', 'reception'], badge: 'intent' },
    cstudents: { t: '我的学员', icon: 'friends-o', to: '/staff/students', roles: ['admin', 'manager', 'coach'] },
    cperf: { t: '教练业绩', icon: 'chart-trending-o', to: '/staff/perf', roles: ['admin', 'manager', 'coach'] },
    crests: { t: '休息设置', icon: 'underway-o', to: '/staff/rests', roles: ['admin', 'manager', 'coach'] },
    cprofile: { t: '我的主页', icon: 'manager-o', to: '/staff/profile', roles: ['coach'] },
    dashboard: { t: '数据看板', icon: 'bar-chart-o', to: '/staff/dashboard', roles: ['admin', 'manager'] },
    report: { t: '报表', icon: 'chart-trending-o', to: '/staff/report', roles: ['admin', 'manager'] },
    myperf: { t: '我的业绩', icon: 'gold-coin-o', to: '/staff/my-perf', roles: ['admin', 'manager', 'membership', 'reception', 'coach'] },
    salesAll: { t: '顾问业绩', icon: 'chart-trending-o', to: '/staff/sales', roles: ['admin', 'manager'] },
    perfAll: { t: '教练业绩', icon: 'medal-o', to: '/staff/perf', roles: ['admin', 'manager'] },
    /* 会员分群面板: badge 用 'seg:<key>' 取 /member-segments 的数量, 新增维度只需在此加一条 */
    segLow: { t: '课时不足', icon: 'warning-o', to: '/staff/segment/low_lesson', roles: ['admin', 'manager', 'membership', 'reception', 'coach'], badge: 'seg:low_lesson' },
    segBirth: { t: '会员生日', icon: 'gift-o', to: '/staff/segment/birthday_week', roles: ['admin', 'manager', 'membership', 'reception', 'coach'], badge: 'seg:birthday_week' },
    seg10: { t: '满10次会员', icon: 'medal-o', to: '/staff/segment/trained_10', roles: ['admin', 'manager', 'membership', 'coach'], badge: 'seg:trained_10' },
    seg20: { t: '满20次会员', icon: 'diamond-o', to: '/staff/segment/trained_20', roles: ['admin', 'manager', 'membership', 'coach'], badge: 'seg:trained_20' },
    tcActive: { t: '有效期卡', icon: 'vip-card-o', to: '/staff/segment/timecard_active', roles: ['admin', 'manager', 'membership', 'reception', 'coach'], badge: 'seg:timecard_active' },
    tcExpired: { t: '过期期卡', icon: 'underway-o', to: '/staff/segment/timecard_expired', roles: ['admin', 'manager', 'membership', 'reception', 'coach'], badge: 'seg:timecard_expired' },
    contracts: { t: '合同管理', icon: 'sign', to: '/staff/contracts', roles: ['admin', 'manager', 'reception'], badge: 'contract' },
    /* —— 以下为「可添加」的完整功能池(与全部功能/PC 后台对齐), 默认不出现在工作台 —— */
    membersOverview: { t: '会员概况', icon: 'chart-trending-o', to: '/staff/members-overview', roles: ['admin', 'manager'] },
    cards: { t: '会员卡列表', icon: 'vip-card-o', to: '/staff/cards', roles: ['admin', 'manager', 'membership', 'reception'] },
    cardCategories: { t: '卡类型配置', icon: 'setting-o', to: '/staff/card-categories', roles: ['admin', 'manager'] },
    ptRecords: { t: '消课记录', icon: 'orders-o', to: '/staff/pt-records', roles: ['admin', 'manager', 'coach'] },
    actions: { t: '动作库', icon: 'todo-list-o', to: '/staff/training-actions', roles: ['admin', 'manager', 'coach'] },
    coaches: { t: '教练档案', icon: 'manager-o', to: '/staff/coaches', roles: ['admin', 'manager'] },
    ptCourses: { t: '私教课程', icon: 'medal-o', to: '/staff/pt-courses', roles: ['admin', 'manager'] },
    scheduleAdmin: { t: '排课表', icon: 'calendar-o', to: '/staff/schedule-admin', roles: ['admin', 'manager', 'reception'] },
    groupCourses: { t: '团课课程库', icon: 'apps-o', to: '/staff/group-courses', roles: ['admin', 'manager'] },
    classrooms: { t: '教室管理', icon: 'location-o', to: '/staff/classrooms', roles: ['admin', 'manager'] },
    checkinRecords: { t: '签到记录', icon: 'orders-o', to: '/staff/checkin-records', roles: ['admin', 'manager', 'reception'] },
    checkinReport: { t: '签到报表', icon: 'chart-trending-o', to: '/staff/checkin-report', roles: ['admin', 'manager'] },
    financeMonthly: { t: '月度报表', icon: 'balance-o', to: '/staff/finance-monthly', roles: ['admin', 'manager'] },
    recharges: { t: '收款明细', icon: 'balance-o', to: '/staff/recharges', roles: ['admin', 'manager'] },
    spends: { t: '耗卡明细', icon: 'balance-o', to: '/staff/spends', roles: ['admin', 'manager'] },
    cardBalance: { t: '剩余卡价值', icon: 'balance-o', to: '/staff/card-balance', roles: ['admin', 'manager'] },
    coachConsume: { t: '教练消耗统计', icon: 'balance-o', to: '/staff/coach-consume', roles: ['admin', 'manager'] },
    settingsClub: { t: '门店信息', icon: 'shop-o', to: '/staff/settings-club', roles: ['admin', 'manager'] },
    settingsStaff: { t: '员工与角色', icon: 'friends-o', to: '/staff/settings-staff', roles: ['admin', 'manager'] },
    sources: { t: '来源渠道', icon: 'label-o', to: '/staff/sources', roles: ['admin', 'manager'] },
    notices: { t: '公告', icon: 'volume-o', to: '/staff/notices', roles: ['admin', 'manager'] },
    banners: { t: '首页Banner', icon: 'photo-o', to: '/staff/banners', roles: ['admin', 'manager'] },
    smsLogs: { t: '短信记录', icon: 'chat-o', to: '/staff/sms-logs', roles: ['admin', 'manager'] },
    opLogs: { t: '操作日志', icon: 'records-o', to: '/staff/op-logs', roles: ['admin', 'manager'] },
  };
  /* 顺序即工作台展示顺序 —— 教练: 预约管理(主按钮)→会员各维度数据; 管理员: 开卡/约课(主按钮)→看数据→会员维度 */
  const ROLE_MENUS = {
    reception: ['checkin', 'segLow', 'segBirth', 'tcActive', 'tcExpired', 'intents', 'members', 'groupToday', 'todayBook', 'myperf'],
    membership: ['members', 'segLow', 'segBirth', 'seg10', 'seg20', 'tcActive', 'tcExpired', 'potential', 'intents', 'myperf', 'sales'],
    coach: ['segLow', 'seg10', 'seg20', 'segBirth', 'tcActive', 'tcExpired', 'cstudents', 'cschedule', 'cplans', 'cmilestones', 'myperf', 'cperf', 'crests', 'cprofile'],
    manager: ['dashboard', 'report', 'segLow', 'segBirth', 'seg10', 'seg20', 'tcExpired', 'cplans', 'members', 'todayBook', 'cbookings', 'intents', 'contracts', 'potential', 'salesAll', 'perfAll', 'myperf'],
    admin: ['dashboard', 'report', 'segLow', 'segBirth', 'seg10', 'seg20', 'tcExpired', 'cplans', 'members', 'todayBook', 'cbookings', 'intents', 'contracts', 'potential', 'salesAll', 'perfAll', 'myperf'],
  };

  /* 全部功能: 与 PC 后台菜单(web/admin/js/app.js)一一对齐, roles 取值一致 */
  const MENU_TREE = [
    { title: '会员管理', icon: 'friends-o', children: [
      { t: '会员查询', to: '/staff/members', roles: ['admin', 'manager', 'membership', 'reception'] },
      { t: '课时不足', to: '/staff/segment/low_lesson', roles: ['admin', 'manager', 'membership', 'reception', 'coach'] },
      { t: '会员生日', to: '/staff/segment/birthday_week', roles: ['admin', 'manager', 'membership', 'reception', 'coach'] },
      { t: '满10次会员', to: '/staff/segment/trained_10', roles: ['admin', 'manager', 'membership', 'coach'] },
      { t: '满20次会员', to: '/staff/segment/trained_20', roles: ['admin', 'manager', 'membership', 'coach'] },
      { t: '有效期卡', to: '/staff/segment/timecard_active', roles: ['admin', 'manager', 'membership', 'reception', 'coach'] },
      { t: '过期期卡', to: '/staff/segment/timecard_expired', roles: ['admin', 'manager', 'membership', 'reception', 'coach'] },
      { t: '潜在客户', to: '/staff/potential', roles: ['admin', 'manager', 'membership'] },
      { t: '会员概况', to: '/staff/members-overview', roles: ['admin', 'manager'] },
    ] },
    { title: '会员卡管理', icon: 'credit-pay', children: [
      { t: '快速开卡', to: '/staff/opencard', roles: ['admin', 'manager', 'membership', 'reception'] },
      { t: '会员卡列表', to: '/staff/cards', roles: ['admin', 'manager', 'membership', 'reception'] },
      { t: '购卡意向', to: '/staff/intents', roles: ['admin', 'manager', 'membership', 'reception'] },
      { t: '卡类型配置', to: '/staff/card-categories', roles: ['admin', 'manager'] },
      { t: '合同管理', to: '/staff/contracts', roles: ['admin', 'manager', 'reception'] },
    ] },
    { title: '教练管理', icon: 'medal-o', children: [
      { t: '代约课', to: '/staff/book', roles: ['admin', 'manager', 'coach'] },
      { t: '预约管理', to: '/staff/bookings', roles: ['admin', 'manager', 'reception', 'coach'] },
      { t: '消课记录', to: '/staff/pt-records', roles: ['admin', 'manager', 'coach'] },
      { t: '训练计划', to: '/staff/plans', roles: ['admin', 'manager', 'coach'] },
      { t: '里程碑总结', to: '/staff/milestones', roles: ['admin', 'manager', 'coach'] },
      { t: '动作库', to: '/staff/training-actions', roles: ['admin', 'manager', 'coach'] },
      { t: '学员管理', to: '/staff/students', roles: ['admin', 'manager', 'coach'] },
      { t: '教练业绩', to: '/staff/perf', roles: ['admin', 'manager', 'coach'] },
      { t: '教练档案', to: '/staff/coaches', roles: ['admin', 'manager'] },
      { t: '私教课程', to: '/staff/pt-courses', roles: ['admin', 'manager'] },
      { t: '休息管理', to: '/staff/rests', roles: ['admin', 'manager', 'coach'] },
      { t: '我的主页', to: '/staff/profile', roles: ['coach'] },
    ] },
    { title: '课程与排课', icon: 'calendar-o', children: [
      { t: '教练课表', to: '/staff/schedule', roles: ['admin', 'manager', 'coach'] },
      { t: '排课表', to: '/staff/schedule-admin', roles: ['admin', 'manager', 'reception'] },
      { t: '团课核销', to: '/staff/group-today', roles: ['admin', 'manager', 'reception'] },
      { t: '团课课程库', to: '/staff/group-courses', roles: ['admin', 'manager'] },
      { t: '教室管理', to: '/staff/classrooms', roles: ['admin', 'manager'] },
    ] },
    { title: '签到管理', icon: 'aim', children: [
      { t: '前台签到', to: '/staff/checkin', roles: ['admin', 'manager', 'reception'] },
      { t: '签到记录', to: '/staff/checkin-records', roles: ['admin', 'manager', 'reception'] },
      { t: '签到报表', to: '/staff/checkin-report', roles: ['admin', 'manager'] },
    ] },
    { title: '报表中心', icon: 'chart-trending-o', children: [
      { t: '数据看板', to: '/staff/dashboard', roles: ['admin', 'manager'] },
      { t: '会员报表', to: '/staff/report?tab=members', roles: ['admin', 'manager'] },
      { t: '财务报表', to: '/staff/report?tab=finance', roles: ['admin', 'manager'] },
      { t: '我的业绩', to: '/staff/my-perf', roles: ['admin', 'manager', 'membership', 'reception', 'coach'] },
    ] },
    { title: '财务报表', icon: 'balance-o', children: [
      { t: '月度报表', to: '/staff/finance-monthly', roles: ['admin', 'manager'] },
      { t: '收款明细', to: '/staff/recharges', roles: ['admin', 'manager'] },
      { t: '耗卡明细', to: '/staff/spends', roles: ['admin', 'manager'] },
      { t: '剩余卡价值', to: '/staff/card-balance', roles: ['admin', 'manager'] },
      { t: '顾问业绩', to: '/staff/sales', roles: ['admin', 'manager', 'membership'] },
      { t: '教练消耗统计', to: '/staff/coach-consume', roles: ['admin', 'manager'] },
    ] },
    { title: '系统设置', icon: 'setting-o', children: [
      { t: '门店信息', to: '/staff/settings-club', roles: ['admin', 'manager'] },
      { t: '员工与角色', to: '/staff/settings-staff', roles: ['admin', 'manager'] },
      { t: '来源渠道', to: '/staff/sources', roles: ['admin', 'manager'] },
      { t: '公告', to: '/staff/notices', roles: ['admin', 'manager'] },
      { t: '首页Banner', to: '/staff/banners', roles: ['admin', 'manager'] },
      { t: '短信记录', to: '/staff/sms-logs', roles: ['admin', 'manager'] },
      { t: '操作日志', to: '/staff/op-logs', roles: ['admin', 'manager'] },
    ] },
  ];

  window.Pages.StaffHome = {
    data() {
      // 工作台每次进入都会重建(路由 key 变化), 展开状态存起来, 否则点进子页再回来又得重新展开
      let open = [];
      try { open = JSON.parse(localStorage.getItem('wb_open') || '[]'); } catch (e) { open = []; }
      return {
        user: Store.user || {}, dash: null, clubs: [], pendingPt: 0, pendingMilestone: 0, pendingIntent: 0, pendingContract: 0, open: Array.isArray(open) ? open : [], segs: {},
        // 自定义布局: layout 为入口 key 顺序; custom=true 表示用户保存过自定义
        editing: false, layout: [], custom: false,
      };
    },
    computed: {
      role() { return this.user.role; },
      clubName() {
        const c = this.clubs.find(x => x.id === this.user.club_id) || this.clubs[0];
        return c ? c.name : '门店';
      },
      // 工作台顶部主操作: 教练=预约管理+代约课; 管理员=快速开卡+代约课
      mainActs() {
        const acts = [];
        if (this.role === 'coach') acts.push(MENU.cbookings);
        if (['admin', 'manager', 'membership', 'reception'].includes(this.role)) acts.push(MENU.opencard);
        if (['admin', 'manager', 'coach'].includes(this.role)) acts.push(MENU.book);
        return acts;
      },
      // 当前角色可用的全部入口(编辑态添加池的数据源)
      availKeys() { return Object.keys(MENU).filter(k => MENU[k].roles.includes(this.role)); },
      menuDefs() { return this.availKeys.reduce((m, k) => { m[k] = { t: MENU[k].t, icon: MENU[k].icon }; return m; }, {}); },
      // 主按钮的 to 集合: 已在顶部大按钮展示, 九宫格里不再重复
      mainTos() { return this.mainActs.map(a => a.to); },
      // 九宫格当前布局: 过滤掉已失效(角色变化/入口下线)与主按钮重复项
      gridKeys() {
        return this.layout.filter(k => MENU[k] && MENU[k].roles.includes(this.role) && !this.mainTos.includes(MENU[k].to));
      },
      // 可添加池: 排除已添加(layout)与已常驻顶部主按钮的(避免重复出现)
      poolKeys() { return this.availKeys.filter(k => !this.layout.includes(k) && !this.mainTos.includes(MENU[k].to)); },
      menuBadges() {
        return this.gridKeys.reduce((m, k) => { const n = this.badgeCount(k); if (n) m[k] = n; return m; }, {});
      },
      groups() {
        const r = this.role;
        return MENU_TREE
          .map(g => ({ title: g.title, icon: g.icon, children: g.children.filter(c => c.roles.includes(r)) }))
          .filter(g => g.children.length);
      },
      showStats() { return this.role !== 'coach' && this.dash; },
    },
    watch: {
      open(v) { try { localStorage.setItem('wb_open', JSON.stringify(v || [])); } catch (e) { /* 隐私模式写不了, 忽略 */ } },
      layout(v) { try { localStorage.setItem(this.layoutKey, JSON.stringify(v || [])); } catch (e) { /* ignore */ } },
    },
    template: [
      '<div class="page has-tabbar">',
      '  <div class="staff-hero">',
      '    <div class="flex">',
      '      <m-avatar :name="user.realname" :size="46"></m-avatar>',
      '      <div class="flex1" style="margin-left:12px">',
      '        <div style="font-size:18px;font-weight:700">{{ user.realname }}<span class="role-tag">{{ DICT.roleName[role] || role }}</span></div>',
      '        <div style="font-size:12px;opacity:.85;margin-top:4px"><van-icon name="shop-o" size="12"/> {{ clubName }}</div>',
      '      </div>',
      '    </div>',
      '  </div>',
      '  <div class="stat-row" v-if="showStats">',
      '    <div class="stat-cell"><div class="v">{{ dash.today.today_bookings }}</div><div class="l">今日约课</div></div>',
      '    <div class="stat-cell"><div class="v">{{ H.money(dash.today.recharge_money) }}</div><div class="l">今日预收</div></div>',
      '    <div class="stat-cell"><div class="v">{{ H.money(dash.today.spend_money) }}</div><div class="l">今日耗卡</div></div>',
      '  </div>',
      '  <div class="stat-row" v-else-if="role===\'coach\'">',
      '    <div class="stat-cell"><div class="v">{{ pendingPt }}</div><div class="l">待确认预约</div></div>',
      '    <div class="stat-cell" @click="$router.push(\'/staff/schedule\')"><div class="v"><van-icon name="calendar-o"/></div><div class="l">今日课表</div></div>',
      '  </div>',
      '  <div class="sec-title">工作台 <span class="wb-edit-btn" @click="toggleEdit">{{ editing ? \'完成\' : \'编辑\' }}</span></div>',
      // 主按钮 + 分割线 + 九宫格同处一张卡片内, 与会员端「买卡/约课」保持一致
      '  <div class="act-panel">',
      '  <div class="wb-acts" v-if="mainActs.length">',
      '    <div v-for="(a, i) in mainActs" :key="a.to" class="wb-act" :class="{primary: i === mainActs.length - 1}" @click="$router.push(a.to)">',
      '      <van-badge :content="badgeOf(a)" :show-zero="false"><van-icon :name="a.icon" size="20"/></van-badge><span>{{ a.t }}</span>',
      '    </div>',
      '  </div>',
      '  <div class="act-split" v-if="mainActs.length"></div>',
      '  <div class="wb-tip" v-if="editing">长按图标拖动排序 · 点右上角 − 移除 · 下方点按添加</div>',
      '  <wb-grid :defs="menuDefs" :keys="gridKeys" :editing="editing" :badges="menuBadges" @update:keys="layout = $event" @pick="goKey"/>',
      '  <template v-if="editing">',
      '    <div class="wb-pool-title" v-if="poolKeys.length">可添加的功能</div>',
      '    <wb-grid class="wb-pool" :defs="menuDefs" :keys="poolKeys" :badges="menuBadges" icon-size="22" @pick="addItem"/>',
      '    <div class="wb-reset" @click="resetLayout"><van-icon name="replay"/> 恢复默认布局</div>',
      '  </template>',
      '  </div>',
      '  <template v-if="showStats && dash.classes && dash.classes.length">',
      '    <div class="sec-title">今日团课</div>',
      '    <div class="card-box" style="padding:2px 8px">',
      '      <van-cell v-for="cl in dash.classes" :key="cl.id" :title="H.time(cl.start_time)+\' \'+cl.title" :label="(cl.coach_name||\'\')+\' · \'+(cl.classroom_name||\'\')">',
      '        <template #value><span class="muted">{{ cl.booked_count }}/{{ cl.people_count }}</span> <d-tag dict="syllabusStatus" :v="cl.status"></d-tag></template>',
      '      </van-cell>',
      '    </div>',
      '  </template>',
      '  <div class="sec-title">全部功能</div>',
      '  <van-collapse v-model="open" class="fn-collapse">',
      // name 用分组标题而非下标: 菜单增删后已展开的分组不会串位
      '    <van-collapse-item v-for="g in groups" :key="g.title" :name="g.title">',
      '      <template #title><van-icon :name="g.icon" color="var(--brand)" style="margin-right:6px;vertical-align:-2px"/>{{ g.title }}<span class="muted" style="margin-left:6px;font-size:12px">{{ g.children.length }}</span></template>',
      '      <van-cell v-for="c in g.children" :key="c.to" :title="c.t" is-link @click="$router.push(c.to)"/>',
      '    </van-collapse-item>',
      '  </van-collapse>',
      '</div>',
    ].join('\n'),
    methods: {
      badgeCount(key) {
        const m = MENU[key];
        if (!m || !m.badge) return 0;
        if (m.badge.startsWith('seg:')) return this.segs[m.badge.slice(4)] || 0;
        return { pt: this.pendingPt, milestone: this.pendingMilestone, intent: this.pendingIntent, contract: this.pendingContract }[m.badge] || 0;
      },
      badgeOf(m) {
        const n = this.badgeCount(Object.keys(MENU).find(k => MENU[k] === m));
        return n ? n : '';
      },
      goKey(key) { const m = MENU[key]; if (m) this.$router.push(m.to); },
      addItem(key) { if (!this.layout.includes(key)) this.layout = [...this.layout, key]; },
      toggleEdit() {
        if (this.editing) { this.saveLayout(); return; }
        // 进入编辑: 以过滤后的实际展示布局为准(自然清理失效项)
        this.layout = [...this.gridKeys];
        this.editing = true;
      },
      async saveLayout() {
        const items = [...this.gridKeys];
        try {
          await API.put('/workbench', { items });
          this.custom = items.length > 0;
          this.editing = false;
          vant.showToast({ message: '工作台已保存', icon: 'success' });
        } catch (e) { /* API 层已 toast 错误 */ }
      },
      async resetLayout() {
        try { await vant.showConfirmDialog({ title: '恢复默认', message: '将恢复为当前角色的默认布局，确定吗？', confirmButtonColor: 'var(--brand)' }); } catch (e) { return; }
        this.layout = [...(ROLE_MENUS[this.role] || [])];
      },
    },
    async mounted() {
      // 自定义布局: 先用本地缓存即时渲染避免闪变, 再以后端为准
      this.layoutKey = 'wb_layout_staff_' + (Store.user || {}).id;
      try { const c = JSON.parse(localStorage.getItem(this.layoutKey) || 'null'); if (Array.isArray(c) && c.length) this.layout = c; } catch (e) { /* ignore */ }
      if (!this.layout.length) this.layout = [...(ROLE_MENUS[this.role] || [])];
      try {
        const d = await API.get('/workbench', { silent: true });
        if (d && Array.isArray(d.items) && d.items.length) this.layout = d.items;
      } catch (e) { /* ignore */ }
      // 会员分群面板数量(角标); 后端已按角色收窄: 教练只统计名下会员
      try {
        const segs = await API.get('/member-segments', { silent: true });
        this.segs = (segs || []).reduce((m, s) => { m[s.key] = s.count; return m; }, {});
      } catch (e) { /* ignore */ }
      if (this.role !== 'coach') {
        try { this.dash = await API.get('/finance/dashboard', { silent: true }); } catch (e) { /* ignore */ }
      }
      if (this.role === 'coach' || this.role === 'manager' || this.role === 'admin') {
        try {
          const d = await API.get('/ptrain-bookings?status=0&size=1', { silent: true });
          this.pendingPt = d.total || 0;
        } catch (e) { /* ignore */ }
      }
      if (this.role === 'coach') {
        try {
          const d = await API.get('/milestones/pending-count', { silent: true });
          this.pendingMilestone = (d && d.count) || 0;
        } catch (e) { /* ignore */ }
      }
      if (['membership', 'reception', 'manager', 'admin'].includes(this.role)) {
        try {
          const d = await API.get('/card-intents/pending-count', { silent: true });
          this.pendingIntent = (d && d.count) || 0;
        } catch (e) { /* ignore */ }
        try {
          const d = await API.get('/contracts/pending-count', { silent: true });
          this.pendingContract = (d && d.count) || 0;
        } catch (e) { /* ignore */ }
      }
    },
  };

  window.Pages.StaffMine = {
    data() {
      return {
        user: Store.user || {},
        pwdShow: false, oldPwd: '', newPwd: '', saving: false,
      };
    },
    template: [
      '<div class="page has-tabbar">',
      '  <div class="home-hero" style="padding-bottom:24px">',
      '    <div class="flex">',
      '      <m-avatar :name="user.realname" :size="56"></m-avatar>',
      '      <div class="flex1" style="margin-left:14px">',
      '        <div style="font-size:19px;font-weight:700">{{ user.realname }}</div>',
      '        <div style="font-size:12px;opacity:.85;margin-top:4px">{{ user.username }} · {{ DICT.roleName[user.role]||user.role }}</div>',
      '      </div>',
      '    </div>',
      '  </div>',
      '  <div class="card-box" style="padding:4px 8px">',
      '    <van-cell title="修改密码" icon="lock" is-link @click="pwdShow=true"/>',
      '    <van-cell title="切换为会员端" icon="exchange" is-link :border="false" @click="toMember"/>',
      '  </div>',
      '  <div style="margin:24px 16px">',
      '    <van-button block round plain type="danger" @click="logout">退出登录</van-button>',
      '  </div>',
      '  <van-popup v-model:show="pwdShow" position="bottom" round safe-area-inset-bottom>',
      '    <div style="padding:20px 16px 24px">',
      '      <div style="font-size:16px;font-weight:600;margin-bottom:12px">修改密码</div>',
      '      <van-field v-model="oldPwd" type="password" label="原密码" placeholder="请输入原密码"/>',
      '      <van-field v-model="newPwd" type="password" label="新密码" placeholder="至少6位"/>',
      '      <div class="mt12"><van-button type="primary" block round :loading="saving" @click="changePwd">确认修改</van-button></div>',
      '    </div>',
      '  </van-popup>',
      '</div>',
    ].join('\n'),
    methods: {
      async changePwd() {
        if (!this.newPwd || this.newPwd.length < 6) return vant.showToast('新密码至少6位');
        this.saving = true;
        try {
          await API.post('/auth/change-password', { old_password: this.oldPwd, new_password: this.newPwd });
          this.pwdShow = false; this.oldPwd = ''; this.newPwd = '';
          vant.showToast({ message: '修改成功', icon: 'success' });
        } finally { this.saving = false; }
      },
      toMember() {
        Store.logout();
        this.$router.replace('/login');
      },
      async logout() {
        try { await vant.showConfirmDialog({ title: '退出登录', message: '确定退出当前账号吗？', confirmButtonColor: 'var(--brand)' }); } catch (e) { return; }
        Store.logout();
        this.$router.replace('/login');
      },
    },
  };
})();
