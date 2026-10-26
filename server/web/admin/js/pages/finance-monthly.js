/* 月度经营报表 */
window.AppPages.FinanceMonthly = {
  name: 'FinanceMonthlyPage',
  data() {
    return {
      month: dayjs().format('YYYY-MM'),
      clubId: window.clubDefault(),
      d: null, loading: false,
      Fmt: window.Fmt, DICT: window.DICT,
    };
  },
  computed: {
    coreMetrics() {
      if (!this.d) return [];
      const c = this.d.cur || {}; const p = this.d.prev || {};
      const items = [
        { label: '月营收', key: 'revenue', money: true, icon: 'Wallet' },
        { label: '新用户营收', key: 'new_user_revenue', money: true, icon: 'UserFilled' },
        { label: '复购营收', key: 'repeat_revenue', money: true, icon: 'RefreshRight' },
        { label: '耗卡金额', key: 'spend_money', money: true, icon: 'ShoppingCart' },
        { label: '开卡数', key: 'open_cards', money: false, icon: 'Postcard' },
        { label: '成单数', key: 'orders', money: false, icon: 'Tickets' },
        { label: '新增会员', key: 'new_members', money: false, icon: 'Plus' },
      ];
      return items.map(it => {
        const cur = Number(c[it.key] || 0); const prev = Number(p[it.key] || 0);
        const pct = prev > 0 ? ((cur - prev) / prev * 100) : (cur > 0 ? 100 : 0);
        return Object.assign({}, it, {
          value: it.money ? Fmt.money(cur) : cur,
          pct: Math.abs(pct).toFixed(1),
          dir: cur - prev > 0 ? 'up' : cur - prev < 0 ? 'down' : 'flat',
        });
      });
    },
    trendOpt() {
      if (!this.d) return null;
      const months = [];
      const m0 = dayjs(this.month + '-01').subtract(11, 'month');
      for (let i = 0; i < 12; i++) months.push(m0.add(i, 'month').format('YYYY-MM'));
      const revMap = {}; this.d.revenueTrend.forEach(x => { revMap[x.m] = Number(x.money || 0); });
      const memMap = {}; this.d.memberTrend.forEach(x => { memMap[x.m] = Number(x.cnt || 0); });
      return {
        tooltip: { trigger: 'axis' },
        legend: { bottom: 0 },
        grid: { left: 60, right: 60, top: 30, bottom: 50 },
        xAxis: { type: 'category', data: months },
        yAxis: [
          { type: 'value', name: '营收(¥)' },
          { type: 'value', name: '新增会员', minInterval: 1 },
        ],
        series: [
          { name: '营收', type: 'line', smooth: true, color: themeColor('--brand'), areaStyle: { opacity: .12 }, data: months.map(m => revMap[m] || 0) },
          { name: '新增会员', type: 'line', smooth: true, color: '#3a7bd5', yAxisIndex: 1, data: months.map(m => memMap[m] || 0) },
        ],
      };
    },
    byCardOpt() {
      if (!this.d) return null;
      return {
        tooltip: { trigger: 'item', valueFormatter: v => '¥' + Number(v).toLocaleString() },
        legend: { bottom: 0, type: 'scroll' },
        series: [{ type: 'pie', radius: ['45%', '70%'], center: ['50%', '42%'],
          data: this.d.byCardType.map(x => ({ name: x.name, value: Number(x.money || 0) })) }],
      };
    },
    sceneOpt() {
      if (!this.d) return null;
      return {
        tooltip: { trigger: 'item', valueFormatter: v => '¥' + Number(v).toLocaleString() },
        legend: { bottom: 0 },
        color: ['#909399', '#7b52ab', themeColor('--brand'), themeColor('--money'), '#d43a3a'],
        series: [{ type: 'pie', radius: ['45%', '70%'], center: ['50%', '42%'],
          data: this.d.spendByScene.map(x => ({ name: DICT.spendScene[x.scene] || ('场景' + x.scene), value: Number(x.money || 0) })) }],
      };
    },
  },
  template: `
  <div v-loading="loading">
    <div class="card-box" style="display:flex;align-items:center;justify-content:space-between">
      <div style="font-size:15px;font-weight:600;color:var(--text-main)">月度经营报表 <span class="text-muted" style="font-weight:400;margin-left:8px">环比上月</span></div>
      <div style="display:flex;align-items:center;gap:10px">
        <el-date-picker v-model="month" type="month" value-format="YYYY-MM" :clearable="false" style="width:140px" @change="load" />
        <club-picker v-model="clubId" @change="load" />
        <el-dropdown @command="exportCsv">
          <el-button><el-icon><Download /></el-icon>&nbsp;导出CSV<el-icon class="el-icon--right"><ArrowDown /></el-icon></el-button>
          <template #dropdown><el-dropdown-menu>
            <el-dropdown-item command="summary">汇总</el-dropdown-item>
            <el-dropdown-item command="member_trend">会员趋势</el-dropdown-item>
            <el-dropdown-item command="revenue_trend">营收趋势</el-dropdown-item>
            <el-dropdown-item command="spend_trend">耗卡趋势</el-dropdown-item>
            <el-dropdown-item command="by_card_type">新开卡构成</el-dropdown-item>
            <el-dropdown-item command="spend_scene">耗卡构成</el-dropdown-item>
            <el-dropdown-item command="sales">顾问业绩</el-dropdown-item>
            <el-dropdown-item command="coach_hours">教练有效课时</el-dropdown-item>
          </el-dropdown-menu></template>
        </el-dropdown>
      </div>
    </div>

    <div class="metric-grid" style="grid-template-columns:repeat(7,1fr)">
      <div class="metric-card" v-for="m in coreMetrics" :key="m.label">
        <div class="m-label">{{ m.label }}</div>
        <div class="m-value" style="font-size:22px">{{ m.value }}</div>
        <div class="m-diff">
          环比
          <span v-if="m.dir==='up'" class="up">▲ {{ m.pct }}%</span>
          <span v-else-if="m.dir==='down'" class="down">▼ {{ m.pct }}%</span>
          <span v-else>— 持平</span>
        </div>
      </div>
    </div>

    <div class="card-box">
      <div class="box-title">近12月 营收 + 会员增长</div>
      <v-chart :option="trendOpt" height="320px" />
    </div>

    <div class="two-col">
      <div class="card-box">
        <div class="box-title">开卡构成（按卡类型）</div>
        <div style="display:grid;grid-template-columns:1fr 1fr;gap:10px;align-items:center">
          <v-chart :option="byCardOpt" height="260px" />
          <el-table border :data="d ? d.byCardType : []" size="small" max-height="260">
            <el-table-column prop="name" label="卡类型" min-width="110" show-overflow-tooltip />
            <el-table-column prop="cnt" label="单数" width="60" />
            <el-table-column label="金额" width="100"><template #default="{ row }"><span class="money">{{ Fmt.money(row.money) }}</span></template></el-table-column>
          </el-table>
        </div>
      </div>
      <div class="card-box">
        <div class="box-title">耗卡构成（按场景）</div>
        <div style="display:grid;grid-template-columns:1fr 1fr;gap:10px;align-items:center">
          <v-chart :option="sceneOpt" height="260px" />
          <el-table border :data="d ? d.spendByScene : []" size="small" max-height="260">
            <el-table-column label="场景" min-width="90"><template #default="{ row }"><dict-tag dict="spendScene" :value="row.scene" /></template></el-table-column>
            <el-table-column prop="cnt" label="笔数" width="60" />
            <el-table-column label="金额" width="100"><template #default="{ row }"><span class="money">{{ Fmt.money(row.money) }}</span></template></el-table-column>
          </el-table>
        </div>
      </div>
    </div>

    <div class="two-col">
      <div class="card-box">
        <div class="box-title">顾问业绩</div>
        <el-table border :data="d ? d.sales : []" size="small" stripe>
          <el-table-column type="index" label="#" width="46" />
          <el-table-column prop="name" label="员工" min-width="100" />
          <el-table-column prop="orders" label="成单数" width="80" />
          <el-table-column label="业绩金额" width="120"><template #default="{ row }"><span class="money">{{ Fmt.money(row.money) }}</span></template></el-table-column>
        </el-table>
      </div>
      <div class="card-box">
        <div class="box-title">教练课时</div>
        <el-table border :data="d ? d.coachHours : []" size="small" stripe>
          <el-table-column type="index" label="#" width="46" />
          <el-table-column prop="name" label="教练" min-width="100" />
          <el-table-column label="消课课时" width="100"><template #default="{ row }">{{ Number(row.lessons || 0) }} 节</template></el-table-column>
          <el-table-column label="耗课金额" width="120"><template #default="{ row }"><span class="money">{{ Fmt.money(row.money) }}</span></template></el-table-column>
        </el-table>
      </div>
    </div>
  </div>`,
  methods: {
    async load() {
      this.loading = true;
      try { this.d = await api.get('/finance/monthly', { month: this.month, club_id: this.clubId }); }
      finally { this.loading = false; }
    },
    exportCsv(section) {
      window.open(api.exportUrl('/finance/monthly', { month: this.month, club_id: this.clubId, section }));
    },
  },
  mounted() { this.load(); },
};
