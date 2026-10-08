/* 教练消耗统计 */
window.AppPages.CoachConsume = {
  name: 'CoachConsumePage',
  data() {
    return {
      range: [dayjs().startOf('month').format('YYYY-MM-DD'), dayjs().format('YYYY-MM-DD')],
      clubId: window.clubDefault(),
      d: null, loading: false,
      Fmt: window.Fmt, DICT: window.DICT,
    };
  },
  computed: {
    rankOpt() {
      if (!this.d) return null;
      const rows = [...(this.d.ranking || [])].reverse(); // 横向条形图从下到上
      const moneyMap = {};
      rows.forEach(r => { moneyMap[r.name] = Number(r.money || 0); });
      return {
        tooltip: {
          trigger: 'axis', axisPointer: { type: 'shadow' },
          formatter: (ps) => {
            const p = ps[0];
            return p.name + '<br/>消课课时：<b>' + p.value + ' 节</b><br/>耗课金额：<b>¥' +
              (moneyMap[p.name] || 0).toLocaleString('zh-CN', { maximumFractionDigits: 2 }) + '</b>';
          },
        },
        grid: { left: 80, right: 40, top: 10, bottom: 26 },
        xAxis: { type: 'value', minInterval: 1, splitLine: { lineStyle: { type: 'dashed' } } },
        yAxis: { type: 'category', data: rows.map(r => r.name) },
        series: [{
          type: 'bar', data: rows.map(r => Number(r.lessons || 0)), barMaxWidth: 26,
          itemStyle: { color: '#0d5e56', borderRadius: [0, 6, 6, 0] },
          label: { show: true, position: 'right', formatter: '{c} 节' },
        }],
      };
    },
    dailyOpt() {
      if (!this.d) return null;
      const daily = this.d.daily || [];
      const days = [...new Set(daily.map(x => x.d))].sort();
      const byCoach = {};
      daily.forEach(x => {
        if (!byCoach[x.coach_name]) byCoach[x.coach_name] = {};
        byCoach[x.coach_name][x.d] = Number(x.lessons || 0);
      });
      const colors = ['#0d5e56', '#3a7bd5', '#c98a2d', '#7b52ab', '#d43a3a', '#2a9d8f', '#e07b39'];
      const names = Object.keys(byCoach);
      return {
        tooltip: { trigger: 'axis' },
        legend: { data: names, top: 0 },
        grid: { left: 46, right: 24, top: 36, bottom: 30 },
        xAxis: { type: 'category', data: days, boundaryGap: false },
        yAxis: { type: 'value', name: '课时', minInterval: 1, splitLine: { lineStyle: { type: 'dashed' } } },
        series: names.map((n, i) => ({
          name: n, type: 'line', smooth: true, connectNulls: true,
          itemStyle: { color: colors[i % colors.length] },
          data: days.map(day => byCoach[n][day] != null ? byCoach[n][day] : 0),
        })),
      };
    },
  },
  template: `
  <div v-loading="loading">
    <div class="card-box" style="display:flex;align-items:center;justify-content:space-between">
      <div style="font-size:15px;font-weight:600;color:var(--text-main)">教练消耗统计
        <span class="text-muted" style="font-weight:400;margin-left:8px">消课课时 · 耗课金额 · 团课节数</span>
      </div>
      <div style="display:flex;gap:10px;align-items:center">
        <el-date-picker v-model="range" type="daterange" value-format="YYYY-MM-DD" start-placeholder="开始" end-placeholder="结束"
          :clearable="false" style="width:260px" @change="load" />
        <club-picker v-model="clubId" @change="load" />
        <el-dropdown @command="exportCsv">
          <el-button><el-icon><Download /></el-icon>&nbsp;导出CSV<el-icon class="el-icon--right"><ArrowDown /></el-icon></el-button>
          <template #dropdown><el-dropdown-menu>
            <el-dropdown-item command="ranking">排名</el-dropdown-item>
            <el-dropdown-item command="daily">按日趋势</el-dropdown-item>
          </el-dropdown-menu></template>
        </el-dropdown>
      </div>
    </div>

    <div class="two-col">
      <div class="card-box">
        <div class="box-title">教练消耗排名 <span class="text-muted" style="font-weight:400;font-size:12px">按消课课时，悬停查看耗课金额</span></div>
        <v-chart v-if="rankOpt" :option="rankOpt" :height="Math.max(220, (d && d.ranking ? d.ranking.length : 0) * 52 + 60) + 'px'" />
        <el-empty v-if="d && !d.ranking.length" description="该时段暂无消耗数据" :image-size="60" />
      </div>
      <div class="card-box">
        <div class="box-title">排名明细</div>
        <el-table border :data="d ? d.ranking : []" size="small" stripe>
          <el-table-column type="index" label="#" width="46" />
          <el-table-column prop="name" label="教练" min-width="100" />
          <el-table-column label="消课课时" width="90"><template #default="{ row }">{{ Number(row.lessons || 0) }} 节</template></el-table-column>
          <el-table-column label="耗课金额" width="110"><template #default="{ row }"><span class="money">{{ Fmt.money(row.money) }}</span></template></el-table-column>
          <el-table-column label="团课节数" width="90"><template #default="{ row }">{{ Number(row.group_classes || 0) }} 节</template></el-table-column>
        </el-table>
      </div>
    </div>

    <div class="card-box">
      <div class="box-title">按日消耗趋势 <span class="text-muted" style="font-weight:400;font-size:12px">每位教练一条线（消课课时/日）</span></div>
      <v-chart v-if="dailyOpt" :option="dailyOpt" height="320px" />
      <el-empty v-if="d && !d.daily.length" description="该时段暂无按日数据" :image-size="60" />
    </div>
  </div>`,
  methods: {
    params() {
      return { club_id: this.clubId,
        from: this.range && this.range[0] ? this.range[0] : undefined,
        to: this.range && this.range[1] ? this.range[1] : undefined,
      };
    },
    async load() {
      this.loading = true;
      try { this.d = await api.get('/finance/coach-consume', this.params()); }
      finally { this.loading = false; }
    },
    exportCsv(section) { window.open(api.exportUrl('/finance/coach-consume', Object.assign({}, this.params(), { section }))); },
  },
  mounted() { this.load(); },
};
