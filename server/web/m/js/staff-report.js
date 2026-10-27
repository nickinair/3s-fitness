/* 员工端-报表中心: 数据看板 / 报表(用户数据+财务数据) / 我的业绩
 * 接口: GET /report/overview  /report/members  /report/finance  /report/mine  /report/staff-options
 * 局部组件: m-line-chart(纯 SVG 平滑折线) / m-ratio-list(名称+数值+百分比+进度条) */
(function () {
  window.MComponents = window.MComponents || {};

  /* Catmull-Rom -> 三次贝塞尔, 生成平滑折线 path */
  function smoothPath(pts) {
    if (!pts.length) return '';
    if (pts.length === 1) return 'M' + pts[0].x + ',' + pts[0].y;
    var d = 'M' + pts[0].x + ',' + pts[0].y;
    for (var i = 0; i < pts.length - 1; i++) {
      var p0 = pts[i - 1] || pts[i];
      var p1 = pts[i];
      var p2 = pts[i + 1];
      var p3 = pts[i + 2] || p2;
      var c1x = p1.x + (p2.x - p0.x) / 6;
      var c1y = p1.y + (p2.y - p0.y) / 6;
      var c2x = p2.x - (p3.x - p1.x) / 6;
      var c2y = p2.y - (p3.y - p1.y) / 6;
      d += ' C' + c1x.toFixed(1) + ',' + c1y.toFixed(1) + ' ' + c2x.toFixed(1) + ',' + c2y.toFixed(1) + ' ' + p2.x.toFixed(1) + ',' + p2.y.toFixed(1);
    }
    return d;
  }

  /* ============ m-line-chart: 纯 SVG 平滑折线, Y 轴 5 档刻度 + 底部月份标签 ============ */
  window.MComponents['m-line-chart'] = {
    props: {
      data: { type: Array, default: function () { return []; } }, // [{label,value}]
      color: { type: String, default: 'var(--brand)' },
    },
    computed: {
      geo() {
        var list = this.data || [];
        var n = list.length;
        var padL = 32, padR = 10, padT = 16, padB = 26;
        var W = Math.max(300, n * 26);
        var HT = 172; // 高度(避免与全局 H 工具对象重名)
        var iw = W - padL - padR, ih = HT - padT - padB;
        var vals = list.map(function (x) { return Number(x.value) || 0; });
        var maxVal = vals.length ? Math.max.apply(null, vals) : 0;
        if (maxVal <= 0) maxVal = 1;
        var step = maxVal / 4;
        var ticks = [0, 1, 2, 3, 4].map(function (i) {
          return { y: padT + ih - ih * i / 4, v: H.num(step * i) };
        });
        var pts = list.map(function (x, i) {
          return {
            x: padL + (n <= 1 ? iw / 2 : i * iw / (n - 1)),
            y: padT + ih - Math.max(0, Number(x.value) || 0) / maxVal * ih,
            v: x.value, label: x.label,
          };
        });
        var base = padT + ih;
        return { W: W, HT: HT, padL: padL, padR: padR, ticks: ticks, pts: pts, base: base, rotate: n > 8 };
      },
      linePath() { return smoothPath(this.geo.pts); },
      areaPath() {
        var g = this.geo;
        if (!g.pts.length) return '';
        var first = g.pts[0], last = g.pts[g.pts.length - 1];
        return this.linePath + ' L' + last.x.toFixed(1) + ',' + g.base + ' L' + first.x.toFixed(1) + ',' + g.base + ' Z';
      },
    },
    template: [
      '<div class="rpt-linechart">',
      '  <svg v-if="geo.pts.length" :viewBox="\'0 0 \'+geo.W+\' \'+geo.HT" preserveAspectRatio="none" style="width:100%;display:block">',
      '    <line v-for="t in geo.ticks" :key="\'g\'+t.y" :x1="geo.padL" :x2="geo.W-geo.padR" :y1="t.y" :y2="t.y" stroke-width="1" style="stroke:var(--c-line-2)"/>',
      '    <text v-for="t in geo.ticks" :key="\'t\'+t.y" x="1" :y="t.y+3" font-size="9" style="fill:var(--c-text-4)">{{ t.v }}</text>',
      '    <path :d="areaPath" :style="{ fill: color }" opacity=".12" stroke="none"/>',
      '    <path :d="linePath" fill="none" :style="{ stroke: color }" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"/>',
      '    <circle v-for="(p,i) in geo.pts" :key="\'c\'+i" :cx="p.x" :cy="p.y" r="2.6" :style="{ fill: color }"/>',
      '    <text v-for="(p,i) in geo.pts" :key="\'x\'+i" :x="p.x" :y="geo.HT-6" text-anchor="middle" font-size="9" style="fill:var(--c-text-3)"',
      '      :transform="geo.rotate ? (\'rotate(-40 \'+p.x+\' \'+(geo.HT-6)+\')\') : null">{{ p.label }}</text>',
      '  </svg>',
      '  <div v-else class="muted" style="text-align:center;padding:30px 0">暂无数据</div>',
      '</div>',
    ].join('\n'),
  };

  /* ============ m-ratio-list: 名称 + 数值(灰) + 右侧百分比 + 下方进度条(颜色循环) ============ */
  window.MComponents['m-ratio-list'] = {
    props: {
      list: { type: Array, default: function () { return []; } }, // [{name,value,pct}]
      unit: { type: String, default: '' },
      money: { type: Boolean, default: false },
    },
    data() { return { palette: ['var(--brand)', 'var(--c-ink-3)', 'var(--c-text-3)', 'var(--c-text-4)', 'var(--brand-soft-2)'] }; },
    methods: {
      colorOf(i) { return this.palette[i % this.palette.length]; },
      fmtVal(it) { return this.money ? H.money(it.value) : (H.num(it.value) + (this.unit || '')); },
      barWidth(it) { var p = Number(it.pct) || 0; return Math.min(100, Math.max(0, p)) + '%'; },
    },
    template: [
      '<div class="rpt-ratio">',
      '  <div v-if="!list || !list.length" class="muted" style="text-align:center;padding:20px 0">暂无数据</div>',
      '  <div v-for="(it,i) in list" :key="(it.name||\'\')+i" class="rpt-ratio-row">',
      '    <div class="rpt-ratio-top">',
      '      <span class="rpt-ratio-name">{{ it.name }}</span>',
      '      <span class="rpt-ratio-val">{{ fmtVal(it) }}</span>',
      '      <span class="rpt-ratio-pct">{{ H.num(it.pct) }}%</span>',
      '    </div>',
      '    <div class="rpt-ratio-bar"><div class="rpt-ratio-fill" :style="{width: barWidth(it), background: colorOf(i)}"></div></div>',
      '  </div>',
      '</div>',
    ].join('\n'),
  };

  /* 数据概览 11 个指标定义(顺序与接口契约一致) */
  var METRIC_DEFS = [
    { key: 'new_members', title: '新增会员', money: false },
    { key: 'expire_cards', title: '到期(卡)', money: false },
    { key: 'active_members', title: '活跃(人)', money: false },
    { key: 'recharge_money', title: '预收金额', money: true },
    { key: 'spend_money', title: '耗卡金额', money: true },
    { key: 'group_classes', title: '团课课量', money: false },
    { key: 'pt_lessons', title: '私教课量', money: false },
    { key: 'free_train_members', title: '自由训练人数', money: false },
    { key: 'group_spend', title: '团课耗课金额', money: true },
    { key: 'pt_spend', title: '私教耗课金额', money: true },
    { key: 'train_spend', title: '自由训练耗卡金额', money: true },
  ];

  /* ============ 数据看板 ============ */
  window.Pages.StaffReportOverview = {
    data() {
      return {
        period: 'day', date: H.today(),
        club_id: 'all', clubs: [],
        d: null, loading: true,
        datePop: false, dateVal: [],
        clubPop: false,
        minDate: new Date(2020, 0, 1), maxDate: new Date(),
      };
    },
    computed: {
      canSwitchClub() { return ['admin', 'platform', 'manager'].includes(((window.Store || {}).user || {}).role); },
      dateColsType() { return this.period === 'month' ? ['year', 'month'] : ['year', 'month', 'day']; },
      clubCols() { return this.clubs.map(function (c) { return { text: c.name, value: c.id }; }); },
      clubName() {
        var c = this.clubs.find((x) => x.id === this.club_id);
        return c ? c.name : '全部门店';
      },
      metrics() {
        if (!this.d) return [];
        var cur = this.d.cur || {}, prev = this.d.prev || {};
        return METRIC_DEFS.map(function (md) {
          var cv = Number(cur[md.key] || 0), pv = Number(prev[md.key] || 0);
          return { key: md.key, title: md.title, val: md.money ? H.money(cv) : H.num(cv), prevVal: md.money ? H.money(pv) : H.num(pv) };
        });
      },
    },
    template: [
      '<div class="page">',
      '  <m-nav title="数据看板"></m-nav>',
      '  <div class="rpt-topbar">',
      '    <van-tabs v-model:active="period" type="card" color="var(--brand)" @change="load">',
      '      <van-tab title="日" name="day"></van-tab>',
      '      <van-tab title="周" name="week"></van-tab>',
      '      <van-tab title="月" name="month"></van-tab>',
      '    </van-tabs>',
      '    <div class="rpt-date-btn" @click="openDate">{{ d ? d.label : \'\' }}<van-icon name="arrow-down" size="12"/></div>',
      '  </div>',
      '  <div v-if="canSwitchClub" class="rpt-club-btn" @click="clubPop=true"><van-icon name="shop-o" size="13"/><span class="flex1" style="margin-left:6px">{{ clubName }}</span><van-icon name="arrow-down" size="12"/></div>',
      '  <div v-if="loading" style="text-align:center;padding:60px 0"><van-loading color="var(--brand)">加载中...</van-loading></div>',
      '  <template v-else-if="d">',
      '    <div class="rpt-metric-grid">',
      '      <div class="rpt-metric-cell" v-for="m in metrics" :key="m.key">',
      '        <div class="rpt-metric-t">{{ m.title }}</div>',
      '        <div class="rpt-metric-v">{{ m.val }}</div>',
      '        <div class="rpt-metric-p">{{ d.prev_label }} {{ m.prevVal }}</div>',
      '      </div>',
      '    </div>',
      '    <div class="rpt-export-row" @click="exportCsv">导出本期数据 <van-icon name="arrow" size="11"/></div>',
      '  </template>',
      '  <van-popup v-model:show="datePop" position="bottom" round>',
      '    <van-date-picker v-model="dateVal" :columns-type="dateColsType" title="选择日期" :min-date="minDate" :max-date="maxDate" @confirm="onDateConfirm" @cancel="datePop=false"/>',
      '  </van-popup>',
      '  <van-popup v-model:show="clubPop" position="bottom" round v-if="canSwitchClub">',
      '    <van-picker title="选择门店" :columns="clubCols" @confirm="onClubConfirm" @cancel="clubPop=false"/>',
      '  </van-popup>',
      '</div>',
    ].join('\n'),
    methods: {
      openDate() {
        var dd = dayjs(this.date);
        this.dateVal = this.period === 'month'
          ? [String(dd.year()), String(dd.month() + 1).padStart(2, '0')]
          : [String(dd.year()), String(dd.month() + 1).padStart(2, '0'), String(dd.date()).padStart(2, '0')];
        this.datePop = true;
      },
      onDateConfirm(e) {
        var sel = e && e.selectedValues ? e.selectedValues : e;
        this.date = this.period === 'month' ? (sel[0] + '-' + sel[1] + '-01') : (sel[0] + '-' + sel[1] + '-' + sel[2]);
        this.datePop = false;
        this.load();
      },
      onClubConfirm(e) {
        this.club_id = e && e.selectedValues ? e.selectedValues[0] : e;
        this.clubPop = false;
        this.load();
      },
      async loadClubs() {
        try {
          var rows = await API.get('/clubs', { silent: true });
          var list = (rows || []).map(function (c) { return { id: c.id, name: c.name }; });
          list.sort(function (a, b) {
            if (a.name.indexOf('南坪') > -1) return -1;
            if (b.name.indexOf('南坪') > -1) return 1;
            return 0;
          });
          this.clubs = [{ id: 'all', name: '全部门店' }].concat(list);
        } catch (e) { /* ignore */ }
      },
      async load() {
        this.loading = true;
        try {
          var url = '/report/overview?period=' + this.period + '&date=' + this.date;
          if (this.canSwitchClub) url += '&club_id=' + this.club_id;
          this.d = await API.get(url);
        } finally { this.loading = false; }
      },
      exportCsv() {
        var url = '/api/report/overview?period=' + this.period + '&date=' + this.date + '&export=csv';
        if (this.canSwitchClub) url += '&club_id=' + this.club_id;
        window.open(url + '&token=' + encodeURIComponent(Store.token));
      },
    },
    async mounted() {
      if (this.canSwitchClub) await this.loadClubs();
      this.load();
    },
  };

  /* ============ 报表(用户数据/财务数据) ============ */
  window.Pages.StaffReportCenter = {
    data() {
      return {
        tab: 'members',
        club_id: 'all',
        clubList: [
          { id: '2', name: '3S健身·南坪店', shortName: '南坪' },
          { id: '1', name: '3S健身·巴南店', shortName: '巴南' },
        ],
        month: dayjs().format('YYYY-MM'),
        monthPop: false, monthVal: [],
        minDate: new Date(2020, 0, 1), maxDate: new Date(),
        membersData: null, financeData: null,
        loadingMembers: false, loadingFinance: false,
      };
    },
    computed: {
      monthLabel() { return dayjs(this.month + '-01').format('YYYY年M月'); },
      membersTrend() { return this.membersData ? this.membersData.trend.map(function (x) { return { label: x.label, value: x.value }; }) : []; },
      financeTrend() { return this.financeData ? this.financeData.trend.map(function (x) { return { label: x.label, value: x.value }; }) : []; },
    },
    template: [
      '<div class="page">',
      '  <m-nav title="报表"></m-nav>',
      '  <div class="rpt-club-bar">',
      '    <div class="rpt-club-segmented">',
      '      <div class="rpt-club-item" :class="{ active: club_id === \'all\' }" @click="onClubChange(\'all\')">全部</div>',
      '      <div v-for="c in clubList" :key="c.id" class="rpt-club-item" :class="{ active: club_id === c.id }" @click="onClubChange(c.id)">{{ c.shortName }}</div>',
      '    </div>',
      '  </div>',
      '  <div style="padding:10px 16px 0">',
      '    <van-tabs v-model:active="tab" type="card" color="var(--brand)" @change="onTab">',
      '      <van-tab title="用户数据" name="members"></van-tab>',
      '      <van-tab title="财务数据" name="finance"></van-tab>',
      '    </van-tabs>',
      '  </div>',
      '  <div class="rpt-month-btn" @click="openMonth">{{ monthLabel }} <van-icon name="arrow-down" size="12"/></div>',

      '  <template v-if="tab===\'members\'">',
      '    <div v-if="loadingMembers" style="text-align:center;padding:50px 0"><van-loading color="var(--brand)">加载中...</van-loading></div>',
      '    <template v-else-if="membersData">',
      '      <div class="rpt-kpi-row">',
      '        <div class="rpt-kpi"><div class="l">累计会员</div><div class="v">{{ H.num(membersData.summary.total_members) }}</div><div :class="[\'rpt-kpi-pct\', pctCls(membersData.summary.total_pct)]">{{ pctText(membersData.summary.total_pct) }}</div></div>',
      '        <div class="rpt-kpi"><div class="l">在籍会员</div><div class="v">{{ H.num(membersData.summary.active_members) }}</div><div :class="[\'rpt-kpi-pct\', pctCls(membersData.summary.active_pct)]">{{ pctText(membersData.summary.active_pct) }}</div></div>',
      '        <div class="rpt-kpi"><div class="l">新会员</div><div class="v">{{ H.num(membersData.summary.new_members) }}</div><div :class="[\'rpt-kpi-pct\', pctCls(membersData.summary.new_pct)]">{{ pctText(membersData.summary.new_pct) }}</div></div>',
      '        <div class="rpt-kpi"><div class="l">复购会员</div><div class="v">{{ H.num(membersData.summary.repeat_members) }}</div><div :class="[\'rpt-kpi-pct\', pctCls(membersData.summary.repeat_pct)]">{{ pctText(membersData.summary.repeat_pct) }}</div></div>',
      '      </div>',
      '      <div class="sec-title">新会员趋势</div>',
      '      <div class="card-box"><m-line-chart :data="membersTrend"></m-line-chart></div>',

      '      <div class="sec-title"><span>新开会员卡 <span class="muted" style="font-weight:400">共计{{ membersData.newCards.sum }}人</span></span><span class="more brand-text" @click="exportMembers(\'new_cards\')">导出明细 <van-icon name="arrow" size="10"/></span></div>',
      '      <div class="card-box"><m-ratio-list :list="mapList(membersData.newCards.list,\'cnt\')" unit="人"></m-ratio-list></div>',

      '      <div class="sec-title"><span>教练有效课时 <span class="muted" style="font-weight:400">共计{{ membersData.coachHours.sum }}节</span></span><span class="more brand-text" @click="exportMembers(\'coach_hours\')">导出明细 <van-icon name="arrow" size="10"/></span></div>',
      '      <div class="card-box"><m-ratio-list :list="mapList(membersData.coachHours.list,\'cnt\')" unit="节"></m-ratio-list></div>',

      '      <div class="sec-title"><span>销售成单 <span class="muted" style="font-weight:400">共计{{ membersData.salesOrders.sum }}单</span></span><span class="more brand-text" @click="exportMembers(\'sales_orders\')">导出明细 <van-icon name="arrow" size="10"/></span></div>',
      '      <div class="card-box"><m-ratio-list :list="mapList(membersData.salesOrders.list,\'cnt\')" unit="单"></m-ratio-list></div>',

      '      <div class="sec-title"><span>预约排行Top20 <span class="muted" style="font-weight:400">共计{{ membersData.bookingTop.sum }}次</span></span><span class="more brand-text" @click="exportMembers(\'booking_top\')">导出明细 <van-icon name="arrow" size="10"/></span></div>',
      '      <div class="card-box" style="margin-bottom:22px"><m-ratio-list :list="mapList(membersData.bookingTop.list,\'cnt\')" unit="次"></m-ratio-list></div>',
      '    </template>',
      '  </template>',

      '  <template v-else>',
      '    <div v-if="loadingFinance" style="text-align:center;padding:50px 0"><van-loading color="var(--brand)">加载中...</van-loading></div>',
      '    <template v-else-if="financeData">',
      '      <div class="rpt-kpi-row">',
      '        <div class="rpt-kpi"><div class="l">月度营收</div><div class="v">{{ H.money(financeData.summary.revenue) }}</div><div :class="[\'rpt-kpi-pct\', pctCls(financeData.summary.revenue_pct)]">{{ pctText(financeData.summary.revenue_pct) }}</div></div>',
      '        <div class="rpt-kpi"><div class="l">复购营收</div><div class="v">{{ H.money(financeData.summary.repeat_revenue) }}</div><div :class="[\'rpt-kpi-pct\', pctCls(financeData.summary.repeat_pct)]">{{ pctText(financeData.summary.repeat_pct) }}</div></div>',
      '        <div class="rpt-kpi"><div class="l">新用户营收</div><div class="v">{{ H.money(financeData.summary.new_user_revenue) }}</div><div :class="[\'rpt-kpi-pct\', pctCls(financeData.summary.new_user_pct)]">{{ pctText(financeData.summary.new_user_pct) }}</div></div>',
      '      </div>',
      '      <div class="sec-title">营收趋势</div>',
      '      <div class="card-box"><m-line-chart :data="financeTrend"></m-line-chart></div>',

      '      <div class="sec-title"><span>会员卡营收</span><span class="more brand-text" @click="exportFinance(\'by_card\')">导出明细 <van-icon name="arrow" size="10"/></span></div>',
      '      <div class="card-box"><m-ratio-list :list="mapList(financeData.byCard.list,\'money\')" money></m-ratio-list></div>',

      '      <div class="sec-title"><span>销售业绩</span><span class="more brand-text" @click="exportFinance(\'sales\')">导出明细 <van-icon name="arrow" size="10"/></span></div>',
      '      <div class="card-box"><m-ratio-list :list="mapList(financeData.sales.list,\'money\')" money></m-ratio-list></div>',

      '      <div class="sec-title"><span>人效 <span class="rpt-accrual">营收(权责发生制): <b>{{ H.money(financeData.accrual) }}</b></span></span><span class="more brand-text" @click="exportFinance(\'staff_value\')">导出明细 <van-icon name="arrow" size="10"/></span></div>',
      '      <div class="muted rpt-accrual-sub">(教练所有课程价值总和，团课价值取决于约课人数)</div>',
      '      <div class="card-box" style="margin-bottom:22px"><m-ratio-list :list="mapList(financeData.staffValue.list,\'money\')" money></m-ratio-list></div>',
      '    </template>',
      '  </template>',

      '  <van-popup v-model:show="monthPop" position="bottom" round>',
      '    <van-date-picker v-model="monthVal" :columns-type="[\'year\',\'month\']" title="选择年月" :min-date="minDate" :max-date="maxDate" @confirm="onMonthConfirm" @cancel="monthPop=false"/>',
      '  </van-popup>',
      '</div>',
    ].join('\n'),
    methods: {
      pctCls(v) { v = Number(v) || 0; return v > 0 ? 'up' : (v < 0 ? 'down' : 'muted'); },
      pctText(v) { v = Number(v) || 0; var a = v > 0 ? '▲' : (v < 0 ? '▼' : ''); return a + H.num(Math.abs(v)) + '%'; },
      mapList(list, key) { return (list || []).map(function (x) { return { name: x.name, value: x[key], pct: x.pct }; }); },
      // 先进明细预览页, 下载按钮在那个页面顶部
      exportMembers(section) {
        this.$router.push('/staff/report-detail?src=members&section=' + section + '&month=' + this.month + '&club_id=' + this.club_id);
      },
      exportFinance(section) {
        this.$router.push('/staff/report-detail?src=finance&section=' + section + '&month=' + this.month + '&club_id=' + this.club_id);
      },
      openMonth() {
        var dd = dayjs(this.month + '-01');
        this.monthVal = [String(dd.year()), String(dd.month() + 1).padStart(2, '0')];
        this.monthPop = true;
      },
      onMonthConfirm(e) {
        var sel = e && e.selectedValues ? e.selectedValues : e;
        this.month = sel[0] + '-' + sel[1];
        this.monthPop = false;
        this.membersData = null; this.financeData = null;
        this.ensureTab();
      },
      onClubChange(id) {
        if (this.club_id === id) return;
        this.club_id = id;
        this.membersData = null;
        this.financeData = null;
        try {
          this.$router.replace({
            path: this.$route.path,
            query: Object.assign({}, this.$route.query, { tab: this.tab, club_id: this.club_id }),
          });
        } catch (e) { /* ignore */ }
        this.ensureTab();
      },
      async loadClubs() {
        try {
          var rows = await API.get('/clubs', { silent: true });
          if (!rows || !rows.length) return;
          var list = rows.map(function (c) {
            var shortName = c.name.replace(/^3S健身[·\s]*/, '').replace(/店$/, '');
            return { id: String(c.id), name: c.name, shortName: shortName || c.name };
          });
          list.sort(function (a, b) {
            if (a.name.indexOf('南坪') > -1) return -1;
            if (b.name.indexOf('南坪') > -1) return 1;
            return 0;
          });
          this.clubList = list;
        } catch (e) { /* ignore */ }
      },
      onTab() {
        try {
          this.$router.replace({
            path: this.$route.path,
            query: Object.assign({}, this.$route.query, { tab: this.tab, club_id: this.club_id }),
          });
        } catch (e) { /* ignore */ }
        this.ensureTab();
      },
      ensureTab() {
        if (this.tab === 'members') this.ensureMembers(); else this.ensureFinance();
      },
      async ensureMembers() {
        if (this.membersData) return;
        this.loadingMembers = true;
        try {
          var url = '/report/members?month=' + this.month;
          if (this.club_id) url += '&club_id=' + this.club_id;
          this.membersData = await API.get(url);
        }
        finally { this.loadingMembers = false; }
      },
      async ensureFinance() {
        if (this.financeData) return;
        this.loadingFinance = true;
        try {
          var url = '/report/finance?month=' + this.month;
          if (this.club_id) url += '&club_id=' + this.club_id;
          this.financeData = await API.get(url);
        }
        finally { this.loadingFinance = false; }
      },
    },
    mounted() {
      var q = (this.$route && this.$route.query) || {};
      if (q.tab === 'finance') this.tab = 'finance';
      if (q.club_id) this.club_id = String(q.club_id);
      this.loadClubs();
      this.ensureTab();
    },
  };

  /* ============ 我的业绩 ============ */
  window.Pages.StaffMyPerf = {
    data() {
      return {
        month: dayjs().format('YYYY-MM'),
        monthPop: false, monthVal: [],
        minDate: new Date(2020, 0, 1), maxDate: new Date(),
        staffOptions: [], staffPop: false, userId: null,
        d: null, loading: true,
      };
    },
    computed: {
      isManagerRole() { return ['admin', 'manager'].includes((Store.user || {}).role); },
      monthLabel() { return dayjs(this.month + '-01').format('YYYY年M月'); },
      staffCols() {
        return this.staffOptions.map(function (s) { return { text: s.realname + '(' + (DICT.roleName[s.role] || s.role) + ')', value: s.id }; });
      },
      staffName() {
        if (!this.userId) return (Store.user || {}).realname || '我';
        var s = this.staffOptions.find((x) => x.id === this.userId);
        return s ? s.realname : '我';
      },
      noIncomeCfg() {
        if (!this.d) return false;
        var inc = this.d.income;
        return !inc.base_salary && !inc.sales_commission && !inc.course_commission;
      },
    },
    template: [
      '<div class="page">',
      '  <m-nav title="我的业绩"></m-nav>',
      '  <div class="rpt-month-btn" @click="openMonth">{{ monthLabel }} <van-icon name="arrow-down" size="12"/></div>',
      '  <div v-if="isManagerRole" class="coach-pick" @click="staffPop=true"><van-icon name="manager-o"/><span style="margin-left:6px">查看员工</span><div class="flex1"></div><b>{{ staffName }}</b><van-icon name="exchange" style="margin-left:6px"/></div>',

      '  <div v-if="loading" style="text-align:center;padding:60px 0"><van-loading color="var(--brand)">加载中...</van-loading></div>',
      '  <template v-else-if="d">',
      '    <div v-if="noIncomeCfg" class="rpt-warn-tip"><van-icon name="warning-o"/> 尚未配置固定工资与提成比例，请联系管理员在「员工与角色」设置</div>',
      '    <div class="rpt-income-card">',
      '      <div class="l">收入(元)</div>',
      '      <div class="v">{{ H.num(d.income.total) }}</div>',
      '      <div class="rpt-income-row"><span>固定工资</span><b>{{ H.money(d.income.base_salary) }}</b></div>',
      '      <div class="rpt-income-row"><span>销售提成</span><b>{{ H.money(d.income.sales_commission) }}</b></div>',
      '      <div class="rpt-income-row"><span>课程提成</span><b>{{ H.money(d.income.course_commission) }}</b></div>',
      '    </div>',

      '    <div class="sec-title">销售业绩分析</div>',
      '    <div class="card-box">',
      '      <div class="rpt-sales-grid">',
      '        <div class="rpt-sales-cell"><div class="l">成单数</div><div class="v">{{ d.sales.orders }}</div></div>',
      '        <div class="rpt-sales-cell"><div class="l">成单金额</div><div class="v">{{ H.money(d.sales.money) }}</div></div>',
      '        <div class="rpt-sales-cell"><div class="l">提成比例</div><div class="v">{{ H.num(d.income.sales_rate) }}%</div></div>',
      '        <div class="rpt-sales-cell"><div class="l">新增会员</div><div class="v">{{ d.sales.new_members }}</div></div>',
      '        <div class="rpt-sales-cell"><div class="l">本月流失</div><div class="v">{{ d.sales.lost_members }}</div></div>',
      '        <div class="rpt-sales-cell"><div class="l">新增游客</div><div class="v">{{ d.sales.new_visitors }}</div></div>',
      '      </div>',
      '    </div>',

      '    <template v-if="d.user.is_coach">',
      '      <div class="sec-title">课程业绩</div>',
      '      <div class="card-box">',
      '        <div class="rpt-sales-grid" style="grid-template-columns:repeat(3,1fr)">',
      '          <div class="rpt-sales-cell"><div class="l">课时</div><div class="v">{{ d.course.lessons }}节</div></div>',
      '          <div class="rpt-sales-cell"><div class="l">课程价值</div><div class="v">{{ H.money(d.course.money) }}</div></div>',
      '          <div class="rpt-sales-cell"><div class="l">提成比例</div><div class="v">{{ H.num(d.income.course_rate) }}%</div></div>',
      '        </div>',
      '      </div>',
      '    </template>',

      '    <div class="sec-title"><span>业绩排行</span><span class="more brand-text" @click="exportMine">导出明细 <van-icon name="arrow" size="10"/></span></div>',
      '    <div class="card-box"><m-ratio-list :list="mapRanking(d.ranking.list)" money></m-ratio-list></div>',

      '    <div class="rpt-bottom-row">',
      '      <div class="rpt-bottom-cell"><van-icon name="friends-o" size="20" color="var(--brand)"/><div class="v">{{ d.members.active }}</div><div class="l">在籍会员</div></div>',
      '      <div class="rpt-bottom-cell"><van-icon name="warning-o" size="20" color="var(--brand)"/><div class="v">{{ d.members.expired }}</div><div class="l">过期会员</div></div>',
      '      <div class="rpt-bottom-cell"><van-icon name="contact" size="20" color="var(--brand)"/><div class="v">{{ d.members.visitors }}</div><div class="l">游客</div></div>',
      '    </div>',
      '  </template>',

      '  <van-popup v-model:show="monthPop" position="bottom" round>',
      '    <van-date-picker v-model="monthVal" :columns-type="[\'year\',\'month\']" title="选择年月" :min-date="minDate" :max-date="maxDate" @confirm="onMonthConfirm" @cancel="monthPop=false"/>',
      '  </van-popup>',
      '  <van-popup v-model:show="staffPop" position="bottom" round v-if="isManagerRole">',
      '    <van-picker title="选择员工" :columns="staffCols" @confirm="onStaffConfirm" @cancel="staffPop=false"/>',
      '  </van-popup>',
      '</div>',
    ].join('\n'),
    methods: {
      openMonth() {
        var dd = dayjs(this.month + '-01');
        this.monthVal = [String(dd.year()), String(dd.month() + 1).padStart(2, '0')];
        this.monthPop = true;
      },
      onMonthConfirm(e) {
        var sel = e && e.selectedValues ? e.selectedValues : e;
        this.month = sel[0] + '-' + sel[1];
        this.monthPop = false;
        this.load();
      },
      onStaffConfirm(e) {
        this.userId = e && e.selectedValues ? e.selectedValues[0] : e;
        this.staffPop = false;
        this.load();
      },
      async loadStaffOptions() {
        try { this.staffOptions = await API.get('/report/staff-options', { silent: true }); }
        catch (e) { /* ignore */ }
      },
      mapRanking(list) { return (list || []).map(function (x) { return { name: x.name, value: x.money, pct: x.pct }; }); },
      exportMine() {
        var url = '/api/report/mine?month=' + this.month + '&export=csv&token=' + encodeURIComponent(Store.token);
        if (this.userId) url += '&user_id=' + this.userId;
        window.open(url);
      },
      async load() {
        this.loading = true;
        try {
          var url = '/report/mine?month=' + this.month;
          if (this.userId && this.isManagerRole) url += '&user_id=' + this.userId;
          this.d = await API.get(url);
        } finally { this.loading = false; }
      },
    },
    async mounted() {
      if (this.isManagerRole) await this.loadStaffOptions();
      this.load();
    },
  };
})();

/* 本文件定义的页面 / 建议路由:
 *   window.Pages.StaffReportOverview -> /staff/dashboard   数据看板
 *   window.Pages.StaffReportCenter   -> /staff/report      报表(query: tab=members|finance, 默认 members)
 *   window.Pages.StaffMyPerf         -> /staff/my-perf     我的业绩
 * 局部组件(注册于 window.MComponents, 由 app.js 统一 app.component):
 *   m-line-chart  纯 SVG 平滑折线图
 *   m-ratio-list  名称+数值+百分比+进度条 列表
 */

/* 明细预览页: 点「导出明细」先看到分组明细, 顶部再下载 CSV
   (对齐门店原来用的老系统导出样式: 按卡类型/教练/顾问分组, 每条一张小卡) */
window.Pages.StaffReportDetail = {
  data() { return { d: null, loading: true }; },
  computed: {
    src() { return this.$route.query.src === 'finance' ? 'finance' : 'members'; },
    section() { return this.$route.query.section || ''; },
    month() { return this.$route.query.month || dayjs().format('YYYY-MM'); },
    club_id() { return this.$route.query.club_id || 'all'; },
  },
  template: [
    '<div class="page">',
    '  <m-nav :title="d ? d.title : \'导出明细\'"></m-nav>',
    '  <div v-if="loading" style="text-align:center;padding:50px 0"><van-loading color="var(--brand)">加载中...</van-loading></div>',
    '  <template v-else-if="d">',
    '    <div class="dl-bar">',
    '      <div class="flex1">',
    '        <div class="t">{{ d.title }}</div>',
    '        <div class="s">共 {{ d.total }} {{ d.unit }} · {{ d.groups.length }} 组</div>',
    '      </div>',
    '      <van-button size="small" round type="primary" icon="down" @click="download">下载源文件</van-button>',
    '    </div>',
    '    <van-empty v-if="!d.groups.length" description="本月暂无数据"/>',
    '    <div v-for="g in d.groups" :key="g.name" class="dl-group">',
    '      <div class="hd"><span class="n">{{ g.name }}</span><span class="c">共 {{ g.count }} {{ d.unit }}</span></div>',
    '      <div class="items">',
    '        <div v-for="(it,i) in g.items" :key="i" class="it">',
    '          <div class="day">{{ it.day }}号</div>',
    '          <div class="tm">{{ it.time }}</div>',
    '          <div class="nm">{{ it.title }}</div>',
    '          <div class="sb" v-if="it.sub">{{ it.sub }}</div>',
    '          <div class="mn" v-if="it.money != null">{{ H.money(it.money) }}</div>',
    '        </div>',
    '      </div>',
    '    </div>',
    '  </template>',
    '</div>',
  ].join('\n'),
  methods: {
    download() {
      window.open('/api/report/' + this.src + '?month=' + this.month + '&export=csv&section='
        + this.section + '&club_id=' + this.club_id + '&token=' + encodeURIComponent(Store.token));
    },
    async load() {
      this.loading = true;
      try {
        var url = '/report/' + this.src + '?month=' + this.month + '&detail=' + this.section + '&club_id=' + this.club_id;
        this.d = await API.get(url);
      } finally { this.loading = false; }
    },
  },
  mounted() { this.load(); },
};
