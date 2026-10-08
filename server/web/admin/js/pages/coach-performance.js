/* 教练业绩 */
window.AppPages.CoachPerformance = {
  name: 'CoachPerformancePage',
  data() {
    return {
      month: dayjs().format('YYYY-MM'),
      list: [], loading: false,
      Fmt: window.Fmt,
      user: Auth.getUser() || {},
    };
  },
  computed: {
    displayList() {
      if (this.user.role === 'coach' && this.user.coach_id) {
        return this.list.filter(x => x.id === this.user.coach_id);
      }
      return this.list;
    },
    barOpt() {
      const rows = this.displayList;
      return {
        tooltip: { trigger: 'axis' },
        grid: { left: 60, right: 30, top: 30, bottom: 30 },
        xAxis: { type: 'value', minInterval: 1 },
        yAxis: { type: 'category', data: rows.map(x => x.realname).reverse() },
        series: [{ name: '消课课时', type: 'bar', color: '#0d5e56', barMaxWidth: 22,
          label: { show: true, position: 'right' },
          data: rows.map(x => Number(x.lessons || 0)).reverse() }],
      };
    },
  },
  template: `
  <div>
    <div class="card-box">
      <div class="search-bar">
        <el-date-picker v-model="month" type="month" value-format="YYYY-MM" :clearable="false" style="width:130px" @change="load" />
        <span class="text-muted" v-if="user.role === 'coach'">仅展示我的业绩</span>
        <div style="flex:1"></div>
        <el-button @click="exportCsv"><el-icon><Download /></el-icon>&nbsp;导出CSV</el-button>
      </div>
      <el-table border :data="displayList" v-loading="loading" stripe>
        <el-table-column type="index" label="排名" width="70" />
        <el-table-column prop="realname" label="教练" min-width="130" />
        <el-table-column label="消课课时" width="120" sortable :sort-method="(a,b) => a.lessons - b.lessons">
          <template #default="{ row }"><b>{{ Number(row.lessons || 0) }}</b> 节</template>
        </el-table-column>
        <el-table-column label="耗课金额" width="140">
          <template #default="{ row }"><span class="money">{{ Fmt.money(row.spend_money) }}</span></template>
        </el-table-column>
        <el-table-column label="关联销售额" width="140">
          <template #default="{ row }"><span class="money">{{ Fmt.money(row.sales_money) }}</span></template>
        </el-table-column>
        <el-table-column label="关联成单" width="100"><template #default="{ row }">{{ row.sales_orders || 0 }} 单</template></el-table-column>
        <el-table-column />
      </el-table>
    </div>
    <div class="card-box">
      <div class="box-title">{{ month }} 消课课时对比</div>
      <v-chart :option="barOpt" :height="Math.max(220, displayList.length * 44) + 'px'" />
    </div>
  </div>`,
  methods: {
    async load() {
      this.loading = true;
      try { this.list = await api.get('/coaches/performance', { month: this.month }); }
      finally { this.loading = false; }
    },
    exportCsv() { window.open(api.exportUrl('/coaches/performance', { month: this.month })); },
  },
  mounted() { this.load(); },
};
