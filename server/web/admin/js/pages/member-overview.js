/* 会员概况 */
window.AppPages.MemberOverview = {
  name: 'MemberOverviewPage',
  data() {
    return { d: null, loading: false, Fmt: window.Fmt };
  },
  computed: {
    trendOpt() {
      if (!this.d) return null;
      return {
        tooltip: { trigger: 'axis' },
        grid: { left: 40, right: 20, top: 30, bottom: 30 },
        xAxis: { type: 'category', data: this.d.trend.map(x => x.month) },
        yAxis: { type: 'value', minInterval: 1 },
        series: [{ name: '新增会员', type: 'line', smooth: true, areaStyle: { opacity: .15 }, color: themeColor('--brand'), data: this.d.trend.map(x => x.cnt) }],
      };
    },
    byCardOpt() {
      if (!this.d) return null;
      return {
        tooltip: { trigger: 'item' },
        legend: { bottom: 0, type: 'scroll' },
        series: [{ type: 'pie', radius: ['45%', '70%'], center: ['50%', '44%'],
          data: this.d.byCard.map(x => ({ name: x.name, value: Number(x.cnt) })) }],
      };
    },
    bySourceOpt() {
      if (!this.d) return null;
      return {
        tooltip: { trigger: 'item' },
        legend: { bottom: 0, type: 'scroll' },
        series: [{ type: 'pie', radius: ['45%', '70%'], center: ['50%', '44%'],
          data: this.d.bySource.map(x => ({ name: x.name, value: Number(x.cnt) })) }],
      };
    },
  },
  template: `
  <div v-loading="loading">
    <div class="metric-grid" v-if="d">
      <div class="metric-card">
        <div class="m-icon"><el-icon size="20"><User /></el-icon></div>
        <div class="m-label">会员总数</div><div class="m-value">{{ d.counts.total || 0 }}</div>
      </div>
      <div class="metric-card">
        <div class="m-icon"><el-icon size="20"><CircleCheck /></el-icon></div>
        <div class="m-label">在籍会员</div><div class="m-value" style="color:var(--brand)">{{ d.counts.active || 0 }}</div>
      </div>
      <div class="metric-card">
        <div class="m-icon"><el-icon size="20"><WarningFilled /></el-icon></div>
        <div class="m-label">过期召回池</div><div class="m-value">{{ d.counts.expired || 0 }}</div>
      </div>
      <div class="metric-card">
        <div class="m-icon"><el-icon size="20"><Postcard /></el-icon></div>
        <div class="m-label">无卡会员</div><div class="m-value" style="color:var(--text-muted)">{{ d.counts.none || 0 }}</div>
      </div>
    </div>
    <div class="card-box">
      <div class="box-title">近12月新增会员趋势
        <el-dropdown @command="exportCsv">
          <el-button><el-icon><Download /></el-icon>&nbsp;导出CSV<el-icon class="el-icon--right"><ArrowDown /></el-icon></el-button>
          <template #dropdown><el-dropdown-menu>
            <el-dropdown-item command="counts">会员构成</el-dropdown-item>
            <el-dropdown-item command="trend">新增趋势</el-dropdown-item>
            <el-dropdown-item command="by_card">按卡类型</el-dropdown-item>
            <el-dropdown-item command="by_source">按来源</el-dropdown-item>
          </el-dropdown-menu></template>
        </el-dropdown>
      </div>
      <v-chart :option="trendOpt" height="280px" />
    </div>
    <div class="two-col">
      <div class="card-box">
        <div class="box-title">持卡类型分布</div>
        <v-chart :option="byCardOpt" height="300px" />
      </div>
      <div class="card-box">
        <div class="box-title">来源渠道分布</div>
        <v-chart :option="bySourceOpt" height="300px" />
      </div>
    </div>
  </div>`,
  methods: {
    async load() {
      this.loading = true;
      try { this.d = await api.get('/members/overview'); }
      finally { this.loading = false; }
    },
    exportCsv(section) { window.open(api.exportUrl('/members/overview', { section })); },
  },
  mounted() { this.load(); },
};
