/* 签到报表 */
window.AppPages.CheckinReport = {
  name: 'CheckinReportPage',
  data() {
    return {
      range: [dayjs().subtract(29, 'day').format('YYYY-MM-DD'), dayjs().format('YYYY-MM-DD')],
      d: null, loading: false,
    };
  },
  computed: {
    byDayOpt() {
      if (!this.d) return null;
      return {
        tooltip: { trigger: 'axis' },
        grid: { left: 46, right: 20, top: 30, bottom: 40 },
        xAxis: { type: 'category', data: this.d.byDay.map(x => dayjs(x.d).format('MM-DD')) },
        yAxis: { type: 'value', minInterval: 1 },
        series: [{ name: '入场人次', type: 'line', smooth: true, areaStyle: { opacity: .15 }, color: '#0d5e56',
          data: this.d.byDay.map(x => x.cnt) }],
      };
    },
    byHourOpt() {
      if (!this.d) return null;
      const map = {};
      this.d.byHour.forEach(x => { map[x.h] = x.cnt; });
      const hours = Array.from({ length: 18 }, (_, i) => i + 6); // 6:00-23:00
      return {
        tooltip: { trigger: 'axis' },
        grid: { left: 46, right: 20, top: 30, bottom: 40 },
        xAxis: { type: 'category', data: hours.map(h => h + '时') },
        yAxis: { type: 'value', minInterval: 1 },
        series: [{ name: '入场人次', type: 'bar', color: '#18a08d', barMaxWidth: 26,
          data: hours.map(h => map[h] || 0) }],
      };
    },
  },
  template: `
  <div v-loading="loading">
    <div class="card-box">
      <div class="search-bar mb0">
        <el-date-picker v-model="range" type="daterange" value-format="YYYY-MM-DD"
          start-placeholder="开始日期" end-placeholder="结束日期" :clearable="false" style="width:270px" @change="load" />
        <el-button type="primary" @click="load">查询</el-button>
        <div style="flex:1"></div>
        <el-dropdown @command="exportCsv">
          <el-button><el-icon><Download /></el-icon>&nbsp;导出CSV<el-icon class="el-icon--right"><ArrowDown /></el-icon></el-button>
          <template #dropdown><el-dropdown-menu>
            <el-dropdown-item command="by_day">按日签到</el-dropdown-item>
            <el-dropdown-item command="by_hour">时段分布</el-dropdown-item>
          </el-dropdown-menu></template>
        </el-dropdown>
      </div>
    </div>
    <div class="card-box">
      <div class="box-title">每日入场人次</div>
      <v-chart :option="byDayOpt" height="300px" />
    </div>
    <div class="card-box">
      <div class="box-title">时段分布（高峰识别）</div>
      <v-chart :option="byHourOpt" height="300px" />
    </div>
  </div>`,
  methods: {
    async load() {
      this.loading = true;
      try { this.d = await api.get('/checkin-report', { from: this.range[0], to: this.range[1] }); }
      finally { this.loading = false; }
    },
    exportCsv(section) {
      window.open(api.exportUrl('/checkin-report', { from: this.range[0], to: this.range[1], section }));
    },
  },
  mounted() { this.load(); },
};
