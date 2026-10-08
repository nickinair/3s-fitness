/* 应用入口: 路由 + 全局组件 */
(function () {
  const P = window.Pages;

  const routes = [
    { path: '/login', component: P.Login },
    // 会员端
    { path: '/', component: P.MemberHome },
    { path: '/schedule', component: P.MemberSchedule },
    { path: '/coaches', component: P.MemberCoaches },
    { path: '/coach/:id', component: P.MemberCoachDetail },
    { path: '/buy', component: P.MemberBuy },
    { path: '/mine', component: P.MemberMine },
    { path: '/profile', component: P.MemberProfile },
    { path: '/my-cards', component: P.MemberCards },
    { path: '/card/:id', component: P.MemberCardDetail },
    { path: '/my-bookings', component: P.MemberBookings },
    { path: '/pending-confirms', component: P.MemberPending },
    { path: '/checkin', component: P.MemberCheckin },
    { path: '/contracts', component: P.MemberContracts },
    { path: '/contract/:id', component: P.MemberContractDetail },
    { path: '/milestones', component: P.MemberMilestones },
    { path: '/plans', component: P.MemberPlans },
    { path: '/plan/:id', component: P.MemberPlanDetail },
    { path: '/security', component: P.MemberSecurity },
    { path: '/guide', component: P.MemberGuide },
    // 员工端
    { path: '/staff', component: P.StaffHome },
    { path: '/staff/mine', component: P.StaffMine },
    { path: '/staff/checkin', component: P.StaffCheckin },
    { path: '/staff/opencard', component: P.StaffOpenCard },
    { path: '/staff/book', component: P.StaffBook },
    { path: '/staff/members', component: P.StaffMembers },
    { path: '/staff/member/:id', component: P.StaffMemberDetail },
    { path: '/staff/segment/:key', component: P.StaffSegment },
    { path: '/staff/potential', component: P.StaffPotential },
    { path: '/staff/sales', component: P.StaffSales },
    { path: '/staff/schedule', component: P.CoachSchedule },
    { path: '/staff/bookings', component: P.CoachBookings },
    { path: '/staff/students', component: P.CoachStudents },
    { path: '/staff/perf', component: P.CoachPerf },
    { path: '/staff/rests', component: P.CoachRests },
    { path: '/staff/profile', component: P.StaffCoachProfile },
    { path: '/staff/dashboard', component: P.StaffReportOverview },
    { path: '/staff/report', component: P.StaffReportCenter },
    { path: '/staff/report-detail', component: P.StaffReportDetail },
    { path: '/staff/my-perf', component: P.StaffMyPerf },
    { path: '/staff/group-today', component: P.StaffGroupToday },
    { path: '/staff/group/:id', component: P.StaffGroupDetail },
    { path: '/staff/today', component: P.StaffTodayBookings },
    { path: '/staff/plans', component: P.StaffPlans },
    { path: '/staff/plan-edit', component: P.StaffPlanEdit },
    { path: '/staff/milestones', component: P.StaffMilestones },
    { path: '/staff/intents', component: P.StaffIntents },

    // 员工端-对齐 PC 后台的管理功能 (页面文件缺失时该条会被自动过滤掉)
    { path: '/staff/cards', component: P.StaffCardList },
    { path: '/staff/card/:id', component: P.StaffCardDetail },
    { path: '/staff/contracts', component: P.StaffContracts },
    { path: '/staff/members-overview', component: P.StaffMemberOverview },
    { path: '/staff/finance-monthly', component: P.StaffFinanceMonthly },
    { path: '/staff/recharges', component: P.StaffRecharges },
    { path: '/staff/spends', component: P.StaffSpends },
    { path: '/staff/card-balance', component: P.StaffCardBalance },
    { path: '/staff/coach-consume', component: P.StaffCoachConsume },
    { path: '/staff/pt-records', component: P.StaffPtRecords },
    { path: '/staff/checkin-records', component: P.StaffCheckinRecords },
    { path: '/staff/checkin-report', component: P.StaffCheckinReport },
    { path: '/staff/sms-logs', component: P.StaffSmsLogs },
    { path: '/staff/op-logs', component: P.StaffOpLogs },
    { path: '/staff/schedule-admin', component: P.StaffSchedule },
    { path: '/staff/group-courses', component: P.StaffGroupCourses },
    { path: '/staff/classrooms', component: P.StaffClassrooms },
    { path: '/staff/pt-courses', component: P.StaffPtCourses },
    { path: '/staff/card-categories', component: P.StaffCardCategories },
    { path: '/staff/training-actions', component: P.StaffTrainingActions },
    { path: '/staff/coaches', component: P.StaffCoaches },
    { path: '/staff/sources', component: P.StaffSources },
    { path: '/staff/settings-club', component: P.StaffSettingsClub },
    { path: '/staff/settings-staff', component: P.StaffSettingsStaff },
    { path: '/staff/notices', component: P.StaffNotices },
    { path: '/staff/banners', component: P.StaffBanners },

    { path: '/:pathMatch(.*)*', redirect: '/' },
  ].filter(r => r.component || r.redirect);

  const router = VueRouter.createRouter({
    history: VueRouter.createWebHashHistory(),
    routes,
  });

  router.beforeEach((to) => {
    if (to.path === '/login') {
      if (Store.token) return Store.type === 'staff' ? '/staff' : '/';
      return true;
    }
    if (!Store.token) return '/login';
    const isStaffPage = to.path === '/staff' || to.path.startsWith('/staff/');
    if (isStaffPage && Store.type !== 'staff') return '/';
    if (!isStaffPage && Store.type === 'staff') return '/staff';
    return true;
  });

  const App = {
    computed: {
      tabbar() {
        const p = this.$route.path;
        if (['/', '/schedule', '/coaches', '/mine'].includes(p)) return 'member';
        if (['/staff', '/staff/mine'].includes(p)) return 'staff';
        return '';
      },
    },
    template: [
      '<router-view v-slot="{ Component }">',
      '  <component :is="Component" :key="$route.fullPath"/>',
      '</router-view>',
      '<div class="tabbar-wrap" v-if="tabbar">',
      '  <van-tabbar :fixed="false" route active-color="#0d5e56" safe-area-inset-bottom>',
      '    <template v-if="tabbar===\'member\'">',
      '      <van-tabbar-item replace to="/" icon="wap-home-o">首页</van-tabbar-item>',
      '      <van-tabbar-item replace to="/schedule" icon="calendar-o">约课</van-tabbar-item>',
      '      <van-tabbar-item replace to="/coaches" icon="friends-o">私教</van-tabbar-item>',
      '      <van-tabbar-item replace to="/mine" icon="user-o">我的</van-tabbar-item>',
      '    </template>',
      '    <template v-else>',
      '      <van-tabbar-item replace to="/staff" icon="apps-o">工作台</van-tabbar-item>',
      '      <van-tabbar-item replace to="/staff/mine" icon="user-o">我的</van-tabbar-item>',
      '    </template>',
      '  </van-tabbar>',
      '</div>',
    ].join('\n'),
  };

  /* 软键盘避让: iOS 键盘弹出时布局视口不变, 底部弹层(position:fixed;bottom:0)会被键盘盖住。
     用 visualViewport 实时算出键盘占高写入 --kb, 由 CSS 把弹层顶上去并压缩其最大高度。 */
  (function keyboardInset() {
    const vv = window.visualViewport;
    if (!vv) return;                       // 老浏览器不支持则维持原行为
    const root = document.documentElement;
    const apply = () => {
      const kb = Math.max(0, window.innerHeight - vv.height - vv.offsetTop);
      root.style.setProperty('--kb', (kb > 80 ? kb : 0) + 'px');  // 80px 阈值: 滤掉地址栏收缩等抖动
    };
    vv.addEventListener('resize', apply);
    vv.addEventListener('scroll', apply);
    apply();
  })();

  const app = Vue.createApp(App);
  app.use(router);
  app.use(vant);

  // 模板内可直接使用 H / DICT / Store
  app.config.globalProperties.H = window.H;
  app.config.globalProperties.DICT = window.DICT;
  app.config.globalProperties.Store = window.Store;

  // 通用组件
  Object.entries(window.MComponents || {}).forEach(([n, c]) => app.component(n, c));
  if (window.WBGrid) app.component('wb-grid', window.WBGrid);   // 可编辑九宫格(工作台/常用功能自定义)
  app.component('m-nav', {
    props: { title: String, back: { type: Boolean, default: true } },
    template: '<van-nav-bar class="m-nav" :title="title" :left-arrow="back" @click-left="onBack" :border="false"/>',
    methods: {
      onBack() {
        if (!this.back) return;
        const home = Store.type === 'staff' ? '/staff' : '/';
        // 尝试 router.back(); 如果回退后仍在当前页(说明无有效历史), 则直接跳转首页
        const current = this.$route.fullPath;
        this.$router.back();
        // 用 setTimeout 检测: 如果 50ms 后路由没变化, 说明 back 无效, 手动跳首页
        setTimeout(() => {
          if (this.$route.fullPath === current) {
            this.$router.replace(home);
          }
        }, 80);
      },
    },
  });

  app.component('m-avatar', {
    props: { name: String, size: { type: Number, default: 44 } },
    computed: {
      st() { return { width: this.size + 'px', height: this.size + 'px', fontSize: Math.round(this.size / 2.4) + 'px' }; },
      ch() { return (this.name || '?').slice(0, 1); },
    },
    template: '<div class="m-avatar" :style="st">{{ ch }}</div>',
  });

  app.component('d-tag', {
    props: ['dict', 'v'],
    computed: {
      item() {
        const it = (window.DICT[this.dict] || {})[this.v];
        if (Array.isArray(it)) return it;
        return [it == null ? String(this.v) : it, 'default'];
      },
    },
    template: '<van-tag :type="item[1]" round>{{ item[0] }}</van-tag>',
  });

  app.mount('#app');
})();
