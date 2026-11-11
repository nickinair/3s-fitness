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
    { path: '/complete-profile', component: P.CompleteProfile },
    { path: '/training-photos', component: P.MemberTrainingPhotos },
    { path: '/profile', component: P.MemberProfile },
    { path: '/my-cards', component: P.MemberCards },
    { path: '/card/:id', component: P.MemberCardDetail },
    { path: '/my-bookings', component: P.MemberBookings },
    { path: '/pending-confirms', component: P.MemberPending },
    { path: '/checkin', component: P.MemberCheckin },
    { path: '/contracts', component: P.MemberContracts },
    { path: '/contract/:id', component: P.MemberContractDetail },
    { path: '/milestones', component: P.MemberMilestones },
    { path: '/meals', component: P.MemberMeals },
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

  // 同步页面标题到 document.title, 使小程序 web-view 顶部原生导航栏显示当前子页面标题(替代固定「3S运动中心」)
  function setDocTitle(t) {
    const title = t || '3S运动中心';
    if (document.title === title) return;
    document.title = title;
    if (MP.is() && document.body) {
      try {
        const f = document.createElement('iframe');
        f.style.display = 'none';
        f.src = '/favicon.ico';
        f.onload = f.onerror = () => setTimeout(() => f.remove(), 0);
        document.body.appendChild(f);
      } catch (e) {}
    }
  }
  window.setDocTitle = setDocTitle;

  const ROUTE_TITLES = {
    '/': '3S运动中心',
    '/login': '登录',
    '/schedule': '约课',
    '/coaches': '私教教练',
    '/buy': '购卡',
    '/mine': '我的',
    '/complete-profile': '完善档案 · 领专属积分',
    '/training-photos': '训练风采',
    '/profile': '编辑资料',
    '/my-cards': '我的会员卡',
    '/my-bookings': '我的预约',
    '/pending-confirms': '待确认消课',
    '/checkin': '到店签到',
    '/contracts': '我的合同',
    '/milestones': '我的里程碑',
    '/meals': '饮食日记',
    '/plans': '训练计划',
    '/security': '账号与安全',
    '/guide': '使用引导',
    '/staff': '工作台',
    '/staff/mine': '我的',
    '/staff/checkin': '快速签到',
    '/staff/opencard': '快速开卡',
    '/staff/book': '代约课',
    '/staff/members': '会员列表',
    '/staff/potential': '录入潜客',
    '/staff/sales': '顾问业绩',
    '/staff/schedule': '我的课表',
    '/staff/bookings': '预约管理',
    '/staff/students': '我的学员',
    '/staff/perf': '教练业绩',
    '/staff/rests': '休息设置',
    '/staff/profile': '我的主页',
    '/staff/dashboard': '数据看板',
    '/staff/report': '报表',
    '/staff/report-detail': '导出明细',
    '/staff/my-perf': '我的业绩',
    '/staff/group-today': '今日团课核销',
    '/staff/today': '今日预约',
    '/staff/plans': '训练计划',
    '/staff/plan-edit': '训练计划',
    '/staff/milestones': '里程碑总结',
    '/staff/intents': '购卡意向',
    '/staff/cards': '会员卡列表',
    '/staff/contracts': '合同管理',
    '/staff/members-overview': '会员概况',
    '/staff/finance-monthly': '月度经营报表',
    '/staff/recharges': '收款明细',
    '/staff/spends': '耗卡明细',
    '/staff/card-balance': '剩余卡价值',
    '/staff/coach-consume': '教练消耗统计',
    '/staff/pt-records': '消课记录',
    '/staff/checkin-records': '签到记录',
    '/staff/checkin-report': '签到报表',
    '/staff/sms-logs': '短信记录',
    '/staff/op-logs': '操作日志',
    '/staff/schedule-admin': '排课表',
    '/staff/group-courses': '团课课程库',
    '/staff/classrooms': '教室管理',
    '/staff/pt-courses': '私教课程',
    '/staff/card-categories': '卡类型配置',
    '/staff/training-actions': '动作库',
    '/staff/coaches': '教练档案',
    '/staff/sources': '来源渠道',
    '/staff/settings-club': '门店信息',
    '/staff/settings-staff': '员工与角色',
    '/staff/notices': '公告',
    '/staff/banners': '首页 Banner',
    '/staff/segment/low_lesson': '课时不足',
    '/staff/segment/birthday_week': '会员生日',
    '/staff/segment/trained_10': '当月满10次',
    '/staff/segment/trained_50': '半年满50次',
    '/staff/segment/trained_20': '半年满50次',
    '/staff/segment/timecard_active': '有效期卡',
    '/staff/segment/timecard_expired': '过期期卡',
  };

  function resolveRouteTitle(to) {
    const p = to.path || '/';
    if (p === '/' && to.query && to.query.edit) return '常用功能管理';
    if (ROUTE_TITLES[p]) return ROUTE_TITLES[p];
    if (p.indexOf('/coach/') === 0) return '教练主页';
    if (p.indexOf('/card/') === 0) return '会员卡详情';
    if (p.indexOf('/contract/') === 0) return '合同详情';
    if (p.indexOf('/plan/') === 0) return '计划详情';
    if (p.indexOf('/staff/member/') === 0) return '会员详情';
    if (p.indexOf('/staff/segment/') === 0) return '会员名单';
    if (p.indexOf('/staff/group/') === 0) return '预约名单';
    if (p.indexOf('/staff/card/') === 0) return '会员卡详情';
    return '';
  }

  const TABS = ['/', '/schedule', '/coaches', '/mine', '/staff', '/staff/mine'];

  // 地址栏 ?token= 只在首次导航时接管一次; 否则退出登录 / 401 后每次跳转都会把旧 token 写回去
  let searchTokenUsed = false;
  router.beforeEach((to, from) => {
    const sp = new URLSearchParams(window.location.search);
    const urlToken = (to.query && to.query.token) || (!searchTokenUsed && sp.get('token'));
    searchTokenUsed = true;
    if (urlToken) {
      const urlType = (to.query && to.query.type) || sp.get('type') || 'member';
      Store.token = urlToken;
      Store.type = urlType;
    }
    // 小程序里会员回到「首页」= 切回原生首页(沉浸式视频); ?edit=1 是原生首页「管理」进来的常用功能编辑, 留在 H5
    if (to.path === '/' && Store.token && Store.type !== 'staff' && !(to.query && to.query.edit) && MP.is() && MP.homeWithToken()) return false;
    if (to.path === '/complete-profile') {
      if (!Store.token) return '/login';
    } else if (to.path === '/login') {
      if (Store.token) return Store.type === 'staff' ? '/staff' : '/';
      return true;
    } else {
      if (!Store.token) return '/login';
      const isStaffPage = to.path === '/staff' || to.path.startsWith('/staff/');
      if (isStaffPage && Store.type !== 'staff') return '/';
      if (!isStaffPage && Store.type === 'staff') return '/staff';
    }
    // 小程序 web-view 内发生跨页面路由跳转时, 走原生页面栈(navigateTo / redirectTo),
    // 保证顶部原生标题栏 100% 刷新为目标页标题, 且左上角原生返回按钮能逐级返回上一页
    if (MP.is() && from && from.matched && from.matched.length > 0 && to.path !== from.path) {
      const isTabSwitch = TABS.includes(to.path) && TABS.includes(from.path);
      if (MP.go(to.fullPath, isTabSwitch)) return false;
    }
    return true;
  });

  // 小程序内页面通过 navigateTo 独立打开时, H5 内部的 $router.back() 转为调用原生 navigateBack 返回上一页
  const origBack = router.back.bind(router);
  router.back = function () {
    if (MP.is() && window.wx && wx.miniProgram && wx.miniProgram.navigateBack && window.history.length <= 1) {
      wx.miniProgram.navigateBack();
      return;
    }
    origBack();
  };

  router.afterEach((to) => {
    const t = resolveRouteTitle(to);
    if (t) setDocTitle(t);
  });

  const App = {
    data() {
      return { ai: window.AI ? AI.state : { unread: false } };
    },
    methods: {
      // 教练版小S: tabbar 最左侧入口, 不切换路由, 直接从左侧拉出抽屉
      openAi() { if (window.AI) AI.open(); },
    },
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
      '  <van-tabbar :fixed="false" route active-color="var(--brand)" safe-area-inset-bottom>',
      '    <template v-if="tabbar===\'member\'">',
      '      <van-tabbar-item replace to="/">',
      '        <span>首页</span>',
      '        <template #icon="props"><van-icon :name="props.active ? \'wap-home\' : \'wap-home-o\'"/></template>',
      '      </van-tabbar-item>',
      '      <van-tabbar-item replace to="/schedule">',
      '        <span>约课</span>',
      '        <template #icon="props">',
      '          <svg v-if="props.active" viewBox="0 0 24 24" width="20" height="20" fill="currentColor" style="vertical-align:middle;display:inline-block">',
      '            <rect x="3" y="4" width="18" height="17" rx="3.5" style="fill:var(--brand)"/>',
      '            <path d="M7 2v3.5M17 2v3.5" stroke-width="2.2" stroke-linecap="round" style="stroke:var(--brand)"/>',
      '            <path d="M4 8.5h16" stroke="#fff" stroke-width="1.8"/>',
      '            <rect x="7" y="11.5" width="2.5" height="2.5" rx="0.6" fill="#fff"/>',
      '            <rect x="14.5" y="11.5" width="2.5" height="2.5" rx="0.6" fill="#fff"/>',
      '            <rect x="7" y="15.5" width="2.5" height="2.5" rx="0.6" fill="#fff"/>',
      '            <rect x="14.5" y="15.5" width="2.5" height="2.5" rx="0.6" fill="#fff"/>',
      '          </svg>',
      '          <van-icon v-else name="calendar-o"/>',
      '        </template>',
      '      </van-tabbar-item>',
      '      <van-tabbar-item replace to="/coaches">',
      '        <span>私教</span>',
      '        <template #icon="props"><van-icon :name="props.active ? \'friends\' : \'friends-o\'"/></template>',
      '      </van-tabbar-item>',
      '      <van-tabbar-item replace to="/mine">',
      '        <span>我的</span>',
      '        <template #icon="props"><van-icon :name="props.active ? \'user\' : \'user-o\'"/></template>',
      '      </van-tabbar-item>',
      '    </template>',
      '    <template v-else>',
      '      <van-tabbar-item class="tab-ai" @click="openAi">',
      '        <span>小S</span>',
      '        <template #icon>',
      '          <span class="tab-ai-ic"><img src="/static/ai-bot.png" alt="小S"/><i class="ai-bot-ring"></i><i v-if="ai.unread" class="tab-ai-dot"></i></span>',
      '        </template>',
      '      </van-tabbar-item>',
      '      <van-tabbar-item replace to="/staff">',
      '        <span>工作台</span>',
      '        <template #icon="props">',
      '          <svg v-if="props.active" viewBox="0 0 24 24" width="20" height="20" style="fill:var(--brand);vertical-align:middle;display:inline-block">',
      '            <rect x="3" y="3" width="7.5" height="7.5" rx="2.5"/>',
      '            <rect x="13.5" y="3" width="7.5" height="7.5" rx="2.5"/>',
      '            <rect x="3" y="13.5" width="7.5" height="7.5" rx="2.5"/>',
      '            <rect x="13.5" y="13.5" width="7.5" height="7.5" rx="2.5"/>',
      '          </svg>',
      '          <van-icon v-else name="apps-o"/>',
      '        </template>',
      '      </van-tabbar-item>',
      '      <van-tabbar-item replace to="/staff/mine">',
      '        <span>我的</span>',
      '        <template #icon="props"><van-icon :name="props.active ? \'user\' : \'user-o\'"/></template>',
      '      </van-tabbar-item>',
      '    </template>',
      '  </van-tabbar>',
      '</div>',
      '<ai-drawer/>',
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
    props: {
      title: String,
      back: { type: Boolean, default: true },
      inlineAi: { type: Boolean, default: false },
    },
    computed: {
      isMp() { return MP.is(); },
      isMember() {
        const p = (this.$route && this.$route.path) || '';
        return Store.type !== 'staff' && p !== '/login' && !p.startsWith('/staff');
      },
    },
    watch: {
      title: {
        immediate: true,
        handler(v) { if (v) setDocTitle(v); },
      },
    },
    template: [
      '<van-nav-bar v-if="!isMp" class="m-nav" :title="title" :border="false">',
      '  <template #left>',
      '    <div class="m-nav-left">',
      '      <div v-if="back" class="m-nav-ic" @click.stop="onBack"><van-icon name="arrow-left"/></div>',
      '      <div v-if="isMember && back" class="m-nav-ic" @click.stop="onHome"><van-icon name="wap-home-o"/></div>',
      '      <ai-entry v-if="isMember"/>',
      '    </div>',
      '  </template>',
      '</van-nav-bar>',
      '<div v-else-if="isMember && !inlineAi" class="mp-ai-bar">',
      '  <ai-entry :home="back"/>',
      '</div>',
    ].join('\n'),
    methods: {
      onBack() {
        if (!this.back) return;
        const home = Store.type === 'staff' ? '/staff' : '/';
        const current = this.$route.fullPath;
        this.$router.back();
        setTimeout(() => {
          if (this.$route.fullPath === current) {
            this.$router.replace(home);
          }
        }, 80);
      },
      onHome() {
        if (MP.is() && MP.homeWithToken()) return;
        this.$router.push(Store.type === 'staff' ? '/staff' : '/');
      },
      onPhoto() {
        if (window.AI && window.AI.openWithPhoto) window.AI.openWithPhoto();
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
