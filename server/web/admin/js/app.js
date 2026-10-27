/* 应用入口：布局 + 路由 */
(function () {
  const P = window.AppPages;

  /* ============ 主题管理: light / dark / auto(跟随系统) ============ */
  const Theme = {
    get() { return localStorage.getItem('fit_admin_theme') || 'auto'; },
    set(v) { localStorage.setItem('fit_admin_theme', v); Theme.apply(); },
    isDark() {
      const m = Theme.get();
      return m === 'dark' || (m === 'auto' && window.matchMedia('(prefers-color-scheme: dark)').matches);
    },
    apply() {
      document.documentElement.classList.toggle('dark', Theme.isDark());
      window.dispatchEvent(new CustomEvent('fit-theme-change'));
    },
  };
  window.matchMedia('(prefers-color-scheme: dark)').addEventListener('change', () => {
    if (Theme.get() === 'auto') Theme.apply();
  });
  Theme.apply();
  window.AppTheme = Theme;

  /* ============ 菜单定义（roles 为可见角色） ============ */
  const ALL = ['admin', 'manager', 'membership', 'reception', 'coach'];
  const MENUS = [
    { path: '/dashboard', title: '数据看板', coachTitle: '工作台', icon: 'DataBoard', roles: ALL },
    {
      title: '会员管理', icon: 'User', roles: ['admin', 'manager', 'membership', 'reception'],
      children: [
        { path: '/members', title: '会员列表', roles: ['admin', 'manager', 'membership', 'reception'] },
        { path: '/potentials', title: '潜在客户', roles: ['admin', 'manager', 'membership'] },
        { path: '/members-overview', title: '会员概况', roles: ['admin', 'manager'] },
        { path: '/members-import', title: '会员导入', roles: ['admin', 'manager', 'membership'] },
      ],
    },
    {
      title: '会员卡管理', icon: 'Postcard', roles: ['admin', 'manager', 'membership', 'reception'],
      children: [
        { path: '/card-open', title: '快速开卡', roles: ['admin', 'manager', 'membership', 'reception'] },
        { path: '/cards', title: '会员卡列表', roles: ['admin', 'manager', 'membership', 'reception'] },
        { path: '/card-intents', title: '购卡意向', roles: ['admin', 'manager', 'membership', 'reception'] },
        { path: '/card-categories', title: '卡类型配置', roles: ['admin', 'manager'] },
        { path: '/contracts', title: '合同管理', roles: ['admin', 'manager', 'reception'] },
      ],
    },
    {
      title: '教练管理', icon: 'Trophy', roles: ['admin', 'manager', 'reception', 'coach'],
      children: [
        { path: '/pt-bookings', title: '预约管理', roles: ['admin', 'manager', 'reception', 'coach'] },
        { path: '/pt-records', title: '消课记录', roles: ['admin', 'manager', 'coach'] },
        { path: '/training-plans', title: '训练计划', roles: ['admin', 'manager', 'coach'] },
        { path: '/milestones', title: '里程碑总结', roles: ['admin', 'manager', 'coach'] },
        { path: '/training-actions', title: '动作库', roles: ['admin', 'manager', 'coach'] },
        { path: '/coach-students', title: '学员管理', coachTitle: '我的学员', roles: ['admin', 'manager', 'coach'] },
        { path: '/coach-performance', title: '教练业绩', coachTitle: '我的业绩', roles: ['admin', 'manager', 'coach'] },
        { path: '/coaches', title: '教练档案', roles: ['admin', 'manager'] },
        { path: '/pt-courses', title: '私教课程', roles: ['admin', 'manager'] },
        { path: '/coach-rests', title: '休息管理', roles: ['admin', 'manager', 'coach'] },
      ],
    },
    {
      title: '课程与排课', icon: 'Calendar', roles: ['admin', 'manager', 'reception'],
      children: [
        { path: '/schedule', title: '排课表', roles: ['admin', 'manager', 'reception'] },
        { path: '/group-courses', title: '团课课程库', roles: ['admin', 'manager'] },
        { path: '/classrooms', title: '教室管理', roles: ['admin', 'manager'] },
      ],
    },
    {
      title: '签到管理', icon: 'Position', roles: ['admin', 'manager', 'reception'],
      children: [
        { path: '/checkin', title: '前台签到', roles: ['admin', 'manager', 'reception'] },
        { path: '/checkin-records', title: '签到记录', roles: ['admin', 'manager', 'reception'] },
        { path: '/checkin-report', title: '签到报表', roles: ['admin', 'manager'] },
      ],
    },
    {
      title: '报表中心', icon: 'TrendCharts', roles: ['admin', 'manager', 'membership', 'reception', 'coach'],
      children: [
        { path: '/report-overview', title: '数据概览', roles: ['admin', 'manager'] },
        { path: '/report-members', title: '会员报表', roles: ['admin', 'manager'] },
        { path: '/report-finance', title: '财务报表', roles: ['admin', 'manager'] },
        { path: '/report-mine', title: '我的业绩', roles: ['admin', 'manager', 'membership', 'reception', 'coach'] },
      ],
    },
    {
      title: '财务报表', icon: 'Wallet', roles: ['admin', 'manager', 'membership'],
      children: [
        { path: '/finance-monthly', title: '月度报表', roles: ['admin', 'manager'] },
        { path: '/finance-recharges', title: '收款明细', roles: ['admin', 'manager'] },
        { path: '/finance-spends', title: '耗卡明细', roles: ['admin', 'manager'] },
        { path: '/finance-sales', title: '顾问业绩', saleTitle: '我的业绩', roles: ['admin', 'manager', 'membership'] },
        { path: '/coach-consume', title: '教练消耗统计', roles: ['admin', 'manager'] },
      ],
    },
    {
      title: '系统设置', icon: 'Setting', roles: ['admin', 'manager'],
      children: [
        { path: '/settings-club', title: '门店信息', roles: ['admin', 'manager'] },
        { path: '/settings-staff', title: '员工与角色', roles: ['admin', 'manager'] },
        { path: '/settings-sources', title: '来源渠道', roles: ['admin', 'manager'] },
        { path: '/settings-notices', title: '公告', roles: ['admin', 'manager'] },
        { path: '/settings-banners', title: '首页Banner', roles: ['admin', 'manager'] },
        { path: '/sms-logs', title: '短信记录', roles: ['admin', 'manager'] },
        { path: '/settings-logs', title: '操作日志', roles: ['admin', 'manager'] },
      ],
    },
  ];

  const TITLE_MAP = {};
  MENUS.forEach(m => {
    if (m.path) TITLE_MAP[m.path] = m.title;
    (m.children || []).forEach(c => { TITLE_MAP[c.path] = c.title; });
  });
  Object.assign(TITLE_MAP, {
    '/members-overview': '会员概况',
    '/members-import': '会员导入',
  });

  /* ============ 布局组件 ============ */
  const Layout = {
    name: 'AppLayout',
    data() {
      return {
        user: Auth.getUser() || {},
        clubs: [],
        clubId: (Auth.getClubId() && Auth.getClubId() !== 'all') ? Number(Auth.getClubId()) : 'all',
        themeMode: Theme.get(),
        badges: {}, // path -> 待办数（菜单红点）
      };
    },
    computed: {
      role() { return this.user.role; },
      roleName() { return DICT.role[this.user.role] || this.user.role || ''; },
      menus() {
        const r = this.role;
        return MENUS
          .filter(m => m.roles.includes(r))
          .map(m => {
            const item = Object.assign({}, m);
            if (r === 'coach' && m.coachTitle) item.title = m.coachTitle;
            if (item.children) {
              item.children = item.children.filter(c => c.roles.includes(r)).map(c => {
                const ci = Object.assign({}, c);
                if (r === 'coach' && c.coachTitle) ci.title = c.coachTitle;
                if (r === 'membership' && c.saleTitle) ci.title = c.saleTitle;
                return ci;
              });
            }
            return item;
          })
          .filter(m => !m.children || m.children.length);
      },
      pageTitle() {
        const p = this.$route.path;
        if (p.startsWith('/members/')) return '会员详情';
        if (p.startsWith('/cards/')) return '会员卡详情';
        return TITLE_MAP[p] || '3S健身';
      },
      // 面包屑: [分组, 列表页(可点), 详情页]
      crumbs() {
        const p = this.$route.path;
        // 详情页 -> 挂到对应列表页下
        const detailMap = { '/members/': ['/members', '会员详情'], '/cards/': ['/cards', '会员卡详情'] };
        let listPath = p, detailTitle = null;
        for (const prefix of Object.keys(detailMap)) {
          if (p.startsWith(prefix)) { listPath = detailMap[prefix][0]; detailTitle = detailMap[prefix][1]; break; }
        }
        const items = [];
        for (const m of this.menus) {
          if (m.path === listPath) { items.push({ title: m.title, to: m.path }); break; }
          const child = (m.children || []).find(c => c.path === listPath);
          if (child) { items.push({ title: m.title }); items.push({ title: child.title, to: child.path }); break; }
        }
        if (!items.length) items.push({ title: TITLE_MAP[listPath] || this.pageTitle, to: listPath });
        if (detailTitle) items.push({ title: detailTitle });
        return items;
      },
      showBack() { return this.$route.path !== '/dashboard'; },
      themeLabel() { return { light: '浅色', dark: '深色', auto: '跟随系统' }[this.themeMode] || '跟随系统'; },
      activeMenu() {
        const p = this.$route.path;
        if (p.startsWith('/members/')) return '/members';
        if (p.startsWith('/cards/')) return '/cards';
        return p;
      },
    },
    template: `
    <div class="layout">
      <aside class="sidebar">
        <div class="brand"><div class="badge">3S</div><span>3S运动中心</span><i class="brand-tag">管理后台</i></div>
        <div class="menu-scroll">
          <el-menu :default-active="activeMenu" router background-color="transparent" :default-openeds="openeds">
            <template v-for="(m, i) in menus" :key="m.title">
              <el-menu-item v-if="!m.children" :index="m.path">
                <el-icon><component :is="m.icon" /></el-icon><span>{{ m.title }}</span>
              </el-menu-item>
              <el-sub-menu v-else :index="String(i)">
                <template #title><el-icon><component :is="m.icon" /></el-icon><span>{{ m.title }}</span></template>
                <el-menu-item v-for="c in m.children" :key="c.path" :index="c.path">{{ c.title }}<span v-if="badges[c.path]" class="menu-badge">{{ badges[c.path] > 99 ? '99+' : badges[c.path] }}</span></el-menu-item>
              </el-sub-menu>
            </template>
          </el-menu>
        </div>
      </aside>
      <div class="main">
        <header class="topbar">
          <div class="page-head">
            <el-button v-if="showBack" class="back-btn" text @click="goBack">
              <el-icon><ArrowLeft /></el-icon><span>返回</span>
            </el-button>
            <el-divider v-if="showBack" direction="vertical" />
            <el-breadcrumb separator="/">
              <el-breadcrumb-item v-for="(c, i) in crumbs" :key="i"
                :to="c.to && i < crumbs.length - 1 ? c.to : undefined"
                :class="{ 'crumb-current': i === crumbs.length - 1 }">{{ c.title }}</el-breadcrumb-item>
            </el-breadcrumb>
          </div>
          <div class="spacer"></div>
          <el-dropdown trigger="click" @command="setTheme">
            <div class="theme-btn" :title="'主题: ' + themeLabel">
              <el-icon size="17"><Monitor v-if="themeMode==='auto'" /><Moon v-else-if="themeMode==='dark'" /><Sunny v-else /></el-icon>
            </div>
            <template #dropdown>
              <el-dropdown-menu>
                <el-dropdown-item command="light" :class="{'is-active-theme': themeMode==='light'}"><el-icon><Sunny /></el-icon>浅色模式<span v-if="themeMode==='light'" style="margin-left:8px">✓</span></el-dropdown-item>
                <el-dropdown-item command="dark" :class="{'is-active-theme': themeMode==='dark'}"><el-icon><Moon /></el-icon>深色模式<span v-if="themeMode==='dark'" style="margin-left:8px">✓</span></el-dropdown-item>
                <el-dropdown-item command="auto" :class="{'is-active-theme': themeMode==='auto'}"><el-icon><Monitor /></el-icon>跟随系统<span v-if="themeMode==='auto'" style="margin-left:8px">✓</span></el-dropdown-item>
              </el-dropdown-menu>
            </template>
          </el-dropdown>
          <el-select v-if="role === 'admin' && clubs.length" v-model="clubId" class="club-select" style="width:170px" @change="switchClub">
            <template #prefix><el-icon><OfficeBuilding /></el-icon></template>
            <el-option value="all" label="全部门店" />
            <el-option v-for="c in clubs" :key="c.id" :value="c.id" :label="c.name" />
          </el-select>
          <el-dropdown @command="onCmd">
            <div class="user-box">
              <el-avatar :size="30" style="background:var(--brand)">{{ (user.realname || user.username || '?').slice(0,1) }}</el-avatar>
              <span>{{ user.realname || user.username }}</span>
              <el-tag size="small" type="info">{{ roleName }}</el-tag>
              <el-icon><ArrowDown /></el-icon>
            </div>
            <template #dropdown>
              <el-dropdown-menu>
                <el-dropdown-item command="logout"><el-icon><SwitchButton /></el-icon>退出登录</el-dropdown-item>
              </el-dropdown-menu>
            </template>
          </el-dropdown>
        </header>
        <main class="content"><router-view /></main>
      </div>
    </div>`,
    setup() {
      return { openeds: ['0', '1', '2', '3', '4', '5', '6', '7'] };
    },
    created() {
      if (this.role === 'admin') this.loadClubs();
      this.loadBadges();
    },
    methods: {
      async loadBadges() {
        try {
          if (['admin', 'manager', 'coach'].includes(this.role)) {
            const d = await api.get('/milestones/pending-count');
            if (d && d.count) this.badges['/milestones'] = d.count;
          }
          if (['admin', 'manager', 'membership', 'reception'].includes(this.role)) {
            const d = await api.get('/card-intents/pending-count');
            if (d && d.count) this.badges['/card-intents'] = d.count;
          }
        } catch (e) { /* 静默 */ }
      },
      setTheme(v) { Theme.set(v); this.themeMode = v; },
      goBack() {
        // 有浏览历史则后退, 否则回到面包屑上一级/看板
        const hasHistory = window.history.state && window.history.state.back;
        if (hasHistory) return this.$router.back();
        const parent = [...this.crumbs].reverse().find((c, i) => i > 0 && c.to);
        this.$router.push(parent ? parent.to : '/dashboard');
      },
      async loadClubs() {
        this.clubs = await api.get('/clubs');
        if (this.clubId !== 'all' && !this.clubs.some(c => c.id === this.clubId)) { this.clubId = 'all'; Auth.setClubId('all'); }
      },
      switchClub(v) {
        Auth.setClubId(v);
        ElementPlus.ElMessage.success('已切换门店');
        location.reload();
      },
      onCmd(cmd) {
        if (cmd === 'logout') {
          ElementPlus.ElMessageBox.confirm('确定退出登录？', '退出', { type: 'warning' })
            .then(() => { Auth.logout(); }).catch(() => {});
        }
      },
    },
  };

  /* ============ 路由 ============ */
  const routes = [
    { path: '/login', component: P.Login },
    {
      path: '/', component: Layout, redirect: '/dashboard',
      children: [
        { path: 'dashboard', component: P.Dashboard },
        { path: 'members', component: P.Members },
        { path: 'members-overview', component: P.MemberOverview },
        { path: 'members-import', component: P.MembersImport },
        { path: 'members/:id', component: P.MemberDetail },
        { path: 'member-segment/:key', component: P.MemberSegment },
        { path: 'potentials', component: P.Potentials },
        { path: 'card-open', component: P.CardOpen },
        { path: 'cards', component: P.Cards },
        { path: 'cards/:id', component: P.CardDetail },
        { path: 'card-categories', component: P.CardCategories },
        { path: 'contracts', component: P.Contracts },
        { path: 'coaches', component: P.Coaches },
        { path: 'pt-courses', component: P.PtCourses },
        { path: 'coach-rests', component: P.CoachRests },
        { path: 'pt-bookings', component: P.PtBookings },
        { path: 'pt-records', component: P.PtRecords },
        { path: 'coach-students', component: P.CoachStudents },
        { path: 'coach-performance', component: P.CoachPerformance },
        { path: 'schedule', component: P.Schedule },
        { path: 'group-courses', component: P.GroupCourses },
        { path: 'classrooms', component: P.Classrooms },
        { path: 'checkin', component: P.Checkin },
        { path: 'checkin-records', component: P.CheckinRecords },
        { path: 'checkin-report', component: P.CheckinReport },
        { path: 'finance-monthly', component: P.FinanceMonthly },
        { path: 'finance-recharges', component: P.FinanceRecharges },
        { path: 'finance-spends', component: P.FinanceSpends },
        { path: 'finance-sales', component: P.FinanceSales },
        { path: 'report-overview', component: P.ReportOverview },
        { path: 'report-members', component: P.ReportCenter },
        { path: 'report-finance', component: P.ReportCenter },
        { path: 'report-mine', component: P.ReportMine },
        { path: 'settings-club', component: P.SettingsClub },
        { path: 'settings-staff', component: P.SettingsStaff },
        { path: 'settings-sources', component: P.SettingsSources },
        { path: 'settings-notices', component: P.SettingsNotices },
        { path: 'settings-banners', component: P.SettingsBanners },
        { path: 'settings-logs', component: P.SettingsLogs },
        { path: 'training-plans', component: P.TrainingPlans },
        { path: 'milestones', component: P.Milestones },
        { path: 'training-actions', component: P.TrainingActions },
        { path: 'card-intents', component: P.CardIntents },
        { path: 'sms-logs', component: P.SmsLogs },
        { path: 'coach-consume', component: P.CoachConsume },
      ],
    },
    { path: '/:pathMatch(.*)*', redirect: '/dashboard' },
  ];

  const router = VueRouter.createRouter({
    history: VueRouter.createWebHashHistory(),
    routes,
  });

  router.beforeEach((to, from, next) => {
    if (to.path !== '/login' && !Auth.getToken()) return next('/login');
    if (to.path === '/login' && Auth.getToken()) return next('/dashboard');
    next();
  });

  const app = Vue.createApp({ template: '<router-view />' });
  app.use(router);
  app.use(ElementPlus, { locale: ElementPlusLocaleZhCn });
  for (const [name, comp] of Object.entries(ElementPlusIconsVue)) app.component(name, comp);
  app.component('VChart', AppComponents.VChart);
  app.component('DictTag', AppComponents.DictTag);
  app.component('MemberSelect', AppComponents.MemberSelect);
  app.component('ClubPicker', AppComponents.ClubPicker);
  app.mount('#app');
})();
