/* 报表中心: 数据概览 / 用户数据+财务数据(报表中心) / 我的业绩
 *   GET /report/overview   period=day|week|month, date=YYYY-MM-DD, club_id
 *   GET /report/members    month=YYYY-MM, club_id
 *   GET /report/finance    month=YYYY-MM, club_id
 *   GET /report/mine       month=YYYY-MM, user_id(admin/manager)
 *   GET /report/staff-options */

/* 比例条列表: 标题(含"共计"副标题) + 导出明细 + 每行 名称/数值/百分比 + 进度条
 * 仅在本文件内定义并在下面三个页面组件的 components 里注册, 不写入 window.AppComponents */
const RatioList = {
  name: 'RatioList',
  props: {
    title: { type: String, default: '' },
    subtitle: { type: String, default: '' },
    note: { type: String, default: '' },
    exportable: { type: Boolean, default: true },
    list: { type: Array, default: () => [] },
  },
  emits: ['export'],
  data() {
    return { colors: ['#4f6bed', '#3aa5d8', '#3cb371', '#8bc34a', '#e0b93c', '#e08a3c', '#e05a5a'] };
  },
  template: `
    <div>
      <div class="rpt-section-head">
        <div><span class="rpt-section-title">{{ title }}</span><span v-if="subtitle" class="rpt-section-sub">{{ subtitle }}</span></div>
        <span v-if="exportable" class="rpt-export-btn" @click="$emit('export')">导出明细 &gt;</span>
      </div>
      <div v-if="note" class="rpt-section-note">{{ note }}</div>
      <div v-if="!list.length" class="text-muted" style="padding:16px 0;text-align:center">暂无数据</div>
      <div class="rpt-ratio-item" v-for="(row, i) in list" :key="row.name + '_' + i">
        <div class="rpt-ratio-top">
          <span class="rpt-ratio-name">{{ row.name }}</span>
          <span>
            <span class="rpt-ratio-val">{{ row.valueText }}</span>
            <span class="rpt-ratio-pct">{{ row.pct }}%</span>
          </span>
        </div>
        <div class="rpt-ratio-bar"><div class="rpt-ratio-fill" :style="{ width: Math.min(100, Math.max(0, row.pct)) + '%', background: colors[i % colors.length] }"></div></div>
      </div>
    </div>`,
};

/* ============ 1. 数据概览 ============ */
window.AppPages.ReportOverview = {
  name: 'ReportOverviewPage',
  data() {
    return {
      period: 'day', // day | week | month
      date: dayjs().format('YYYY-MM-DD'), // 日/周 用同一个日期选择(周 = 取所在周)
      monthVal: dayjs().format('YYYY-MM'),
      clubId: window.clubDefault(),
      d: null, loading: false,
      Fmt: window.Fmt,
    };
  },
  computed: {
    apiDate() { return this.period === 'month' ? (this.monthVal + '-01') : this.date; },
    metrics() {
      if (!this.d) return [];
      const cur = this.d.cur || {}; const prev = this.d.prev || {};
      const plabel = this.d.prev_label || '';
      const items = [
        { key: 'new_members', label: '新增会员' },
        { key: 'expire_cards', label: '到期(卡)' },
        { key: 'active_members', label: '活跃(人)' },
        { key: 'recharge_money', label: '预收金额', money: true },
        { key: 'spend_money', label: '耗卡金额', money: true },
        { key: 'group_classes', label: '团课课量' },
        { key: 'pt_lessons', label: '私教课量' },
        { key: 'free_train_members', label: '自由训练人数' },
        { key: 'group_spend', label: '团课耗课金额', money: true },
        { key: 'pt_spend', label: '私教耗课金额', money: true },
        { key: 'train_spend', label: '自由训练耗卡金额', money: true },
      ];
      return items.map(it => {
        const cv = Number(cur[it.key] || 0); const pv = Number(prev[it.key] || 0);
        return {
          key: it.key,
          label: it.label,
          value: it.money ? Fmt.money(cv) : cv,
          prevText: plabel + ' ' + (it.money ? Fmt.money(pv) : pv),
        };
      });
    },
  },
  components: { RatioList },
  template: `
  <div v-loading="loading">
    <div class="card-box" style="display:flex;align-items:center;flex-wrap:wrap;gap:14px">
      <el-radio-group v-model="period" @change="load">
        <el-radio-button value="day">日</el-radio-button>
        <el-radio-button value="week">周</el-radio-button>
        <el-radio-button value="month">月</el-radio-button>
      </el-radio-group>
      <el-date-picker v-if="period !== 'month'" v-model="date" type="date" value-format="YYYY-MM-DD" :clearable="false" style="width:160px" @change="load" />
      <el-date-picker v-else v-model="monthVal" type="month" value-format="YYYY-MM" :clearable="false" style="width:160px" @change="load" />
      <club-picker v-model="clubId" @change="load" />
      <span v-if="d" class="text-muted" style="margin-left:auto">{{ d.label }}</span>
      <el-button @click="exportCsv"><el-icon><Download /></el-icon>&nbsp;导出CSV</el-button>
    </div>

    <div class="card-box">
      <div class="rpt-grid3">
        <div class="rpt-metric" v-for="m in metrics" :key="m.key">
          <div class="rpt-m-label">{{ m.label }}</div>
          <div class="rpt-m-value">{{ m.value }}</div>
          <div class="rpt-m-prev">{{ m.prevText }}</div>
        </div>
      </div>
    </div>
  </div>`,
  methods: {
    async load() {
      this.loading = true;
      try { this.d = await api.get('/report/overview', { period: this.period, date: this.apiDate, club_id: this.clubId }); }
      finally { this.loading = false; }
    },
    exportCsv() {
      window.open(api.exportUrl('/report/overview', { period: this.period, date: this.apiDate, club_id: this.clubId }));
    },
  },
  mounted() { this.load(); },
};

/* ============ 2. 报表中心: 用户数据 /report-members + 财务数据 /report-finance ============ */
window.AppPages.ReportCenter = {
  name: 'ReportCenterPage',
  data() {
    return {
      month: dayjs().format('YYYY-MM'),
      clubId: window.clubDefault(),
      dm: null, // 用户数据
      df: null, // 财务数据
      loading: false,
      Fmt: window.Fmt,
    };
  },
  computed: {
    tab() { return this.$route.path === '/report-finance' ? 'finance' : 'members'; },
    kpis() {
      if (this.tab === 'finance') {
        const s = (this.df && this.df.summary) || {};
        return [
          { label: '月度营收', value: Fmt.money(s.revenue), pct: s.revenue_pct },
          { label: '复购营收', value: Fmt.money(s.repeat_revenue), pct: s.repeat_pct },
          { label: '新用户营收', value: Fmt.money(s.new_user_revenue), pct: s.new_user_pct },
        ].map(this.withDir);
      }
      const s = (this.dm && this.dm.summary) || {};
      return [
        { label: '累计会员', value: s.total_members || 0, pct: s.total_pct },
        { label: '在籍会员', value: s.active_members || 0, pct: s.active_pct },
        { label: '新会员', value: s.new_members || 0, pct: s.new_pct },
      ].map(this.withDir);
    },
    trendOpt() {
      const trend = (this.tab === 'finance' ? (this.df && this.df.trend) : (this.dm && this.dm.trend)) || [];
      return {
        tooltip: { trigger: 'axis' },
        grid: { left: 55, right: 20, top: 20, bottom: 30 },
        xAxis: { type: 'category', data: trend.map(x => x.label) },
        yAxis: { type: 'value' },
        series: [{ name: this.tab === 'finance' ? '营收' : '新增会员', type: 'line', smooth: true, color: '#0d5e56', areaStyle: { opacity: .12 },
          data: trend.map(x => Number(x.value || 0)) }],
      };
    },
    newCardsList() { return this.mapList(this.dm && this.dm.newCards); },
    coachHoursList() { return this.mapList(this.dm && this.dm.coachHours); },
    salesOrdersList() { return this.mapList(this.dm && this.dm.salesOrders); },
    bookingTopList() { return this.mapList(this.dm && this.dm.bookingTop); },
    byCardList() { return this.mapList(this.df && this.df.byCard, true); },
    salesList() { return this.mapList(this.df && this.df.sales, true); },
    staffValueList() { return this.mapList(this.df && this.df.staffValue, true); },
  },
  components: { RatioList },
  template: `
  <div v-loading="loading">
    <div class="card-box" style="display:flex;align-items:center;flex-wrap:wrap;gap:14px">
      <el-radio-group :model-value="tab" @update:model-value="switchTab">
        <el-radio-button value="members">用户数据</el-radio-button>
        <el-radio-button value="finance">财务数据</el-radio-button>
      </el-radio-group>
      <el-date-picker v-model="month" type="month" value-format="YYYY-MM" :clearable="false" style="width:140px" @change="load" />
      <club-picker v-model="clubId" @change="load" />
    </div>

    <div class="rpt-kpi-row">
      <div class="rpt-kpi" v-for="k in kpis" :key="k.label">
        <div class="rpt-kpi-label">{{ k.label }}</div>
        <div class="rpt-kpi-value">{{ k.value }}</div>
        <div class="rpt-kpi-pct" :class="k.dir">
          <span v-if="k.dir==='up'">▲ {{ k.pctText }}%</span>
          <span v-else-if="k.dir==='down'">▼ {{ k.pctText }}%</span>
          <span v-else>— 持平</span>
        </div>
      </div>
    </div>

    <div class="card-box">
      <div class="box-title">{{ tab==='finance' ? '近12月营收' : '近12月新增会员' }}</div>
      <v-chart :option="trendOpt" height="300px" />
    </div>

    <template v-if="tab==='members'">
      <div class="card-box"><ratio-list title="新开会员卡" :subtitle="'共计' + (dm ? dm.newCards.sum : 0) + '人'" :list="newCardsList" @export="exportSection('new_cards')" /></div>
      <div class="card-box"><ratio-list title="教练有效课时" :subtitle="'共计' + (dm ? dm.coachHours.sum : 0) + '节'" :list="coachHoursList" @export="exportSection('coach_hours')" /></div>
      <div class="card-box"><ratio-list title="销售成单" :subtitle="'共计' + (dm ? dm.salesOrders.sum : 0) + '单'" :list="salesOrdersList" @export="exportSection('sales_orders')" /></div>
      <div class="card-box"><ratio-list title="预约排行Top20" :subtitle="'共计' + (dm ? dm.bookingTop.sum : 0) + '次'" :list="bookingTopList" @export="exportSection('booking_top')" /></div>
    </template>
    <template v-else>
      <div class="card-box"><ratio-list title="会员卡营收" :subtitle="'共计' + Fmt.money(df ? df.byCard.sum : 0)" :list="byCardList" @export="exportSection('by_card')" /></div>
      <div class="card-box"><ratio-list title="销售业绩" :subtitle="'共计' + Fmt.money(df ? df.sales.sum : 0)" :list="salesList" @export="exportSection('sales')" /></div>
      <div class="card-box"><ratio-list title="人效" :subtitle="'营收(权责发生制): ' + Fmt.money(df ? df.accrual : 0)" note="(教练所有课程价值总和，团课价值取决于约课人数)" :list="staffValueList" @export="exportSection('staff_value')" /></div>
    </template>
  </div>`,
  methods: {
    withDir(k) {
      const pct = Number(k.pct) || 0;
      const dir = pct > 0 ? 'up' : pct < 0 ? 'down' : 'flat';
      return Object.assign({}, k, { dir, pctText: Math.abs(pct).toFixed(1) });
    },
    mapList(obj, money) {
      if (!obj || !obj.list) return [];
      return obj.list.map(x => ({ name: x.name, pct: Number(x.pct || 0), valueText: money ? Fmt.money(x.money) : Number(x.cnt || 0) }));
    },
    switchTab(val) {
      const path = val === 'finance' ? '/report-finance' : '/report-members';
      if (this.$route.path !== path) this.$router.replace(path);
    },
    async load() {
      this.loading = true;
      try {
        if (this.tab === 'finance') this.df = await api.get('/report/finance', { month: this.month, club_id: this.clubId });
        else this.dm = await api.get('/report/members', { month: this.month, club_id: this.clubId });
      } finally { this.loading = false; }
    },
    exportSection(section) {
      const url = this.tab === 'finance' ? '/report/finance' : '/report/members';
      window.open(api.exportUrl(url, { month: this.month, club_id: this.clubId, section }));
    },
  },
  watch: {
    '$route.path'() { this.load(); },
  },
  mounted() { this.load(); },
};

/* ============ 3. 我的业绩 /report-mine ============ */
window.AppPages.ReportMine = {
  name: 'ReportMinePage',
  data() {
    return {
      month: dayjs().format('YYYY-MM'),
      userId: null,
      staffOptions: [],
      d: null, loading: false,
      Fmt: window.Fmt, DICT: window.DICT,
    };
  },
  computed: {
    isAdminLike() { const u = Auth.getUser() || {}; return ['admin', 'manager'].includes(u.role); },
    showHint() {
      if (!this.d) return false;
      const inc = this.d.income || {};
      return !Number(inc.base_salary) && !Number(inc.sales_commission) && !Number(inc.course_commission);
    },
    rankingList() {
      if (!this.d || !this.d.ranking || !this.d.ranking.list) return [];
      return this.d.ranking.list.map(x => ({ name: x.name, pct: Number(x.pct || 0), valueText: Fmt.money(x.money) }));
    },
  },
  components: { RatioList },
  template: `
  <div v-loading="loading">
    <div class="card-box" style="display:flex;align-items:center;flex-wrap:wrap;gap:14px">
      <el-date-picker v-model="month" type="month" value-format="YYYY-MM" :clearable="false" style="width:140px" @change="load" />
      <el-select v-if="isAdminLike" v-model="userId" placeholder="本人" clearable style="width:180px" @change="load">
        <el-option v-for="s in staffOptions" :key="s.id" :value="s.id" :label="s.realname + (DICT.role[s.role] ? '(' + DICT.role[s.role] + ')' : '')" />
      </el-select>
    </div>

    <el-alert v-if="showHint" type="info" :closable="false" show-icon style="margin-bottom:14px">
      尚未配置该员工的固定工资与提成比例，可在「系统设置 → 员工与角色」编辑
    </el-alert>

    <template v-if="d">
      <div class="card-box">
        <div class="rpt-income-big">收入(元)<span class="rpt-income-num">{{ Fmt.money(d.income.total) }}</span></div>
        <div class="rpt-income-rows">
          <div class="rpt-income-row">固定工资<b>{{ Fmt.money(d.income.base_salary) }}</b></div>
          <div class="rpt-income-row">销售提成<b>{{ Fmt.money(d.income.sales_commission) }}</b></div>
          <div class="rpt-income-row">课程提成<b>{{ Fmt.money(d.income.course_commission) }}</b></div>
        </div>
      </div>

      <div class="card-box">
        <div class="box-title">销售业绩分析</div>
        <div class="rpt-cellgrid">
          <div class="rpt-cell"><div class="rpt-cell-label">成单数</div><div class="rpt-cell-value">{{ d.sales.orders }}</div></div>
          <div class="rpt-cell"><div class="rpt-cell-label">成单金额</div><div class="rpt-cell-value">{{ Fmt.money(d.sales.money) }}</div></div>
          <div class="rpt-cell"><div class="rpt-cell-label">提成比例</div><div class="rpt-cell-value">{{ d.income.sales_rate }}%</div></div>
          <div class="rpt-cell"><div class="rpt-cell-label">新增会员</div><div class="rpt-cell-value">{{ d.sales.new_members }}</div></div>
          <div class="rpt-cell"><div class="rpt-cell-label">本月流失</div><div class="rpt-cell-value">{{ d.sales.lost_members }}</div></div>
          <div class="rpt-cell"><div class="rpt-cell-label">新增游客</div><div class="rpt-cell-value">{{ d.sales.new_visitors }}</div></div>
        </div>
      </div>

      <div class="card-box" v-if="d.user.is_coach">
        <div class="box-title">课程业绩</div>
        <div class="rpt-cellgrid">
          <div class="rpt-cell"><div class="rpt-cell-label">课时</div><div class="rpt-cell-value">{{ d.course.lessons }} 节</div></div>
          <div class="rpt-cell"><div class="rpt-cell-label">课程价值</div><div class="rpt-cell-value">{{ Fmt.money(d.course.money) }}</div></div>
          <div class="rpt-cell"><div class="rpt-cell-label">提成比例</div><div class="rpt-cell-value">{{ d.income.course_rate }}%</div></div>
        </div>
      </div>

      <div class="card-box">
        <ratio-list title="业绩排行" :subtitle="'共计' + Fmt.money(d.ranking.sum)" :list="rankingList" @export="exportRanking" />
      </div>

      <div class="rpt-bottom3">
        <div class="rpt-cell"><div class="rpt-cell-value">{{ d.members.active }}</div><div class="rpt-cell-label">在籍会员</div></div>
        <div class="rpt-cell"><div class="rpt-cell-value">{{ d.members.expired }}</div><div class="rpt-cell-label">过期会员</div></div>
        <div class="rpt-cell"><div class="rpt-cell-value">{{ d.members.visitors }}</div><div class="rpt-cell-label">游客</div></div>
      </div>
    </template>
  </div>`,
  methods: {
    async load() {
      this.loading = true;
      try { this.d = await api.get('/report/mine', { month: this.month, user_id: this.userId }); }
      finally { this.loading = false; }
    },
    exportRanking() {
      window.open(api.exportUrl('/report/mine', { month: this.month, user_id: this.userId }));
    },
  },
  async mounted() {
    if (this.isAdminLike) {
      try { this.staffOptions = await api.get('/report/staff-options'); } catch (e) {}
    }
    this.load();
  },
};
