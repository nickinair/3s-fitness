/* 数据看板 - 更新包含小程序报表功能 */

const DashRatioList = {   // 不能叫 RatioList: report.js 也在全局声明了同名常量, 重名会让后加载的 report.js 整个文件报错
  props: { list: { type: Array, default: () => [] }, unit: String, money: Boolean },
  data() { return { palette: ['var(--chart-1)', 'var(--chart-2)', 'var(--chart-3)', 'var(--chart-4)', 'var(--chart-5)'] }; },
  methods: {
    colorOf(i) { return this.palette[i % this.palette.length]; },
    fmtVal(it) { return this.money ? '¥' + window.Fmt.num(it.money || it.value) : (window.Fmt.num(it.cnt || it.value) + (this.unit || '')); },
    barWidth(it) { return Math.min(100, Math.max(0, Number(it.pct) || 0)) + '%'; },
    fmtPct(it) { return window.Fmt.num(it.pct || 0) + '%'; }
  },
  template: `
    <div class="ratio-list" style="padding-top:10px">
      <el-empty v-if="!list || !list.length" :image-size="60" />
      <div v-for="(it,i) in list" :key="i" style="margin-bottom:12px">
        <div style="display:flex;justify-content:space-between;margin-bottom:6px;font-size:13px;line-height:1">
          <div style="color:var(--text-main);white-space:nowrap;overflow:hidden;text-overflow:ellipsis;flex:1;padding-right:10px">{{ it.name }}</div>
          <div style="color:var(--text-muted);font-size:12px">
             <span>{{ fmtVal(it) }}</span>
             <span style="display:inline-block;width:60px;text-align:right">{{ fmtPct(it) }}</span>
          </div>
        </div>
        <div style="background:var(--el-fill-color-light);height:4px;border-radius:2px;overflow:hidden">
          <div :style="{width: barWidth(it), background: colorOf(i), height:'100%', borderRadius:'2px'}"></div>
        </div>
      </div>
    </div>
  `
};

window.AppPages.Dashboard = {
  name: 'DashboardPage',
  components: { RatioList: DashRatioList },

  data() {
    return {
      activeTab: 'overview',
      mode: 'day', // day日报 / month月报
      date: dayjs().format('YYYY-MM-DD'),
      month: dayjs().format('YYYY-MM'),
      data: null,
      monthly: null,
      segs: [],
      loading: false,
      Fmt: window.Fmt,
      DICT: window.DICT,
      
      // 报表相关
      rmonth: dayjs().format('YYYY-MM'),
      isAdmin: (Auth.getUser() || {}).role === 'admin',
      membersData: null,
      financeData: null,
      loadingMembers: false,
      loadingFinance: false,
      preview: { visible: false, loading: false, title: '明细预览', src: '', section: '', data: null, items: [] }
    };
  },
  computed: {
    isMonth() { return this.mode === 'month'; },
    diffLabel() { return this.isMonth ? '较上月' : '较昨日'; },
    metrics() {
      if (!this.data) return [];
      const t = this.data.today || {};
      const y = this.data.yesterday || {};
      const M = this.isMonth;
      const items = [
        { label: M ? '本月新增会员' : '新增会员', key: 'new_members', icon: 'UserFilled', tip: '新增会员 = 当期新建档会员数' },
        { label: M ? '本月到期' : '今日到期', key: 'today_expire', icon: 'AlarmClock', tip: '到期 = 有效卡在当期到期的会员数' },
        { label: M ? '月活跃人数' : '今日活跃', key: 'active_members', icon: 'Lightning', tip: '活跃 = 当期到店签到去重人数' },
        { label: M ? '本月预收' : '预收金额', key: 'recharge_money', icon: 'Wallet', money: true, tip: '预收金额 = 当期收款流水合计（卖卡收入，含退卡冲减，负债口径）' },
        { label: M ? '本月耗卡' : '耗卡金额', key: 'spend_money', icon: 'ShoppingCart', money: true, tip: '耗卡金额 = 当期消耗确认收入（签到扣次/私教消课/团课核销折算）' },
        { label: '团课节数', key: 'group_classes', icon: 'Calendar', tip: '团课节数 = 当期排课节数' },
        { label: '私教课时', key: 'pt_lessons', icon: 'Trophy', tip: '私教课时 = 当期消课课时' },
        { label: '入场人次', key: 'checkins', icon: 'Position', tip: '入场人次 = 当期签到次数' },
      ];
      return items.map(it => {
        const cur = Number(t[it.key] || 0);
        const prev = Number(y[it.key] || 0);
        const diff = cur - prev;
        return Object.assign({}, it, {
          value: it.money ? Fmt.money(cur) : cur,
          diff,
          diffText: it.money ? Fmt.money(Math.abs(diff)) : Math.abs(diff),
          dir: diff > 0 ? 'up' : diff < 0 ? 'down' : 'flat',
        });
      });
    },
    // 近12月经营流水: 预收(收款) vs 耗卡, 空月份补0
    monthTrend() {
      if (!this.monthly) return null;
      const months = [];
      for (let i = 11; i >= 0; i--) months.push(dayjs().subtract(i, 'month').format('YYYY-MM'));
      const pick = (rows) => {
        const map = {};
        (rows || []).forEach(r => { map[r.m] = Number(r.money || 0); });
        return months.map(m => +(map[m] || 0).toFixed(2));
      };
      return {
        tooltip: { trigger: 'axis', valueFormatter: v => '¥' + Number(v).toLocaleString('zh-CN', { maximumFractionDigits: 2 }) },
        legend: { data: ['预收流水', '耗卡金额'], right: 10, top: 0 },
        grid: { left: 70, right: 24, top: 40, bottom: 30 },
        xAxis: { type: 'category', data: months, boundaryGap: false },
        yAxis: { type: 'value', splitLine: { lineStyle: { type: 'dashed' } } },
        series: [
          { name: '预收流水', type: 'line', smooth: true, data: pick(this.monthly.revenueTrend),
            itemStyle: { color: themeColor('--brand') }, areaStyle: { opacity: 0.12 } },
          { name: '耗卡金额', type: 'line', smooth: true, data: pick(this.monthly.spendTrend),
            itemStyle: { color: themeColor('--chart-3') }, areaStyle: { opacity: 0.1 } },
        ],
      };
    },
    spendPie() {
      if (!this.data) return null;
      const t = this.data.today || {};
      return {
        tooltip: { trigger: 'item', valueFormatter: v => '¥' + Number(v).toFixed(2) },
        legend: { bottom: 0 },
        color: [themeColor('--chart-1'), themeColor('--chart-3'), themeColor('--chart-4')],
        series: [{
          type: 'pie', radius: ['48%', '72%'], center: ['50%', '44%'],
          label: { formatter: '{b}\n¥{c}' },
          data: [
            { name: '团课耗课', value: Number(t.group_spend || 0) },
            { name: '私教耗课', value: Number(t.pt_spend || 0) },
            { name: '自由训练/其他', value: Number(t.train_spend || 0) },
          ],
        }],
      };
    },
    // 新增报表图表
    membersTrendOption() {
      if (!this.membersData) return null;
      return {
        tooltip: { trigger: 'axis' },
        grid: { left: 40, right: 20, top: 20, bottom: 20 },
        xAxis: { type: 'category', data: this.membersData.trend.map(x => x.label), boundaryGap: false },
        yAxis: { type: 'value', minInterval: 1 },
        series: [{ type: 'line', smooth: true, data: this.membersData.trend.map(x => x.value), itemStyle: { color: themeColor('--brand') }, areaStyle: { opacity: 0.1 } }]
      };
    },
    financeTrendOption() {
      if (!this.financeData) return null;
      return {
        tooltip: { trigger: 'axis', valueFormatter: v => '¥' + Number(v).toFixed(2) },
        grid: { left: 60, right: 20, top: 20, bottom: 20 },
        xAxis: { type: 'category', data: this.financeData.trend.map(x => x.label), boundaryGap: false },
        yAxis: { type: 'value' },
        series: [{ type: 'line', smooth: true, data: this.financeData.trend.map(x => x.value), itemStyle: { color: themeColor('--brand') }, areaStyle: { opacity: 0.1 } }]
      };
    }
  },
  template: `
  <div>
    <el-tabs v-model="activeTab" @tab-change="onTabChange" class="dashboard-tabs" style="margin-bottom:15px">
      <el-tab-pane label="经营概览" name="overview"></el-tab-pane>
      <el-tab-pane label="用户数据" name="members"></el-tab-pane>
      <el-tab-pane label="财务数据" name="finance"></el-tab-pane>
    </el-tabs>

    <!-- 经营概览 Tab -->
    <div v-show="activeTab === 'overview'" v-loading="loading">
      <div class="card-box" style="display:flex;align-items:center;justify-content:space-between;">
        <div style="display:flex;align-items:center;gap:14px">
          <div style="font-size:15px;font-weight:600;color:var(--text-main)">{{ isMonth ? '经营月报' : '经营日报' }}
            <span class="text-muted" style="font-weight:400;margin-left:8px">对比{{ isMonth ? '上月' : '昨日' }}数据</span></div>
          <el-radio-group v-model="mode" size="small" @change="load">
            <el-radio-button value="day">日报</el-radio-button>
            <el-radio-button value="month">月报</el-radio-button>
          </el-radio-group>
        </div>
        <div style="display:flex;align-items:center;gap:10px">
          <el-date-picker v-if="!isMonth" v-model="date" type="date" value-format="YYYY-MM-DD" :clearable="false" @change="load" style="width:160px" />
          <el-date-picker v-else v-model="month" type="month" value-format="YYYY-MM" :clearable="false" @change="load" style="width:160px" />
          <el-dropdown @command="exportCsv">
            <el-button><el-icon><Download /></el-icon>&nbsp;导出CSV<el-icon class="el-icon--right"><ArrowDown /></el-icon></el-button>
            <template #dropdown><el-dropdown-menu>
              <el-dropdown-item command="summary">指标汇总</el-dropdown-item>
              <el-dropdown-item command="classes">团课安排</el-dropdown-item>
              <el-dropdown-item command="pt">私教预约</el-dropdown-item>
            </el-dropdown-menu></template>
          </el-dropdown>
        </div>
      </div>

      <div class="card-box" v-if="segs.length">
        <div class="box-title">会员提醒</div>
        <div class="seg-panels">
          <div class="seg-panel" v-for="s in segs" :key="s.key" @click="$router.push('/member-segment/' + s.key)">
            <el-badge :value="s.count" :hidden="!s.count" :max="99" type="danger">
              <div class="sp-title">{{ s.title }}</div>
            </el-badge>
            <div class="sp-desc">{{ s.desc }}</div>
          </div>
        </div>
      </div>

      <div class="metric-grid">
        <div class="metric-card" v-for="m in metrics" :key="m.label">
          <div class="m-icon"><el-icon size="20"><component :is="m.icon" /></el-icon></div>
          <div class="m-label">{{ m.label }}
            <el-tooltip :content="m.tip" placement="top">
              <el-icon style="cursor:help;vertical-align:-2px;margin-left:2px;color:var(--el-text-color-secondary)" size="13"><InfoFilled /></el-icon>
            </el-tooltip>
          </div>
          <div class="m-value">{{ m.value }}</div>
          <div class="m-diff">
            {{ diffLabel }}
            <span v-if="m.dir==='up'" class="up">▲ {{ m.diffText }}</span>
            <span v-else-if="m.dir==='down'" class="down">▼ {{ m.diffText }}</span>
            <span v-else>— 持平</span>
          </div>
        </div>
      </div>

      <div class="card-box">
        <div class="box-title" style="display:flex;align-items:center;justify-content:space-between">
          <span>近12月经营流水</span>
          <span class="text-muted" style="font-size:12px;font-weight:400">预收 = 当期收款（含退卡冲减）· 耗卡 = 当期消耗确认收入 · 点击<el-link type="primary" style="font-size:12px;vertical-align:baseline" @click="$router.push('/finance-monthly')">月度报表</el-link>看明细</span>
        </div>
        <v-chart v-if="monthTrend" :option="monthTrend" height="300px" />
      </div>

      <div class="three-col" style="grid-template-columns: 340px 1fr 1fr;">
        <div class="card-box">
          <div class="box-title">{{ isMonth ? '本月耗课拆分' : '今日耗课拆分' }}</div>
          <v-chart :option="spendPie" height="290px" />
        </div>
        <div class="card-box">
          <div class="box-title">今日团课</div>
          <el-table border :data="data ? data.classes : []" size="small" max-height="300">
            <el-table-column label="时间" width="100">
              <template #default="{ row }">{{ dayjs(row.start_time).format('HH:mm') }}-{{ dayjs(row.end_time).format('HH:mm') }}</template>
            </el-table-column>
            <el-table-column prop="title" label="课程" min-width="90" show-overflow-tooltip />
            <el-table-column prop="coach_name" label="教练" width="70" />
            <el-table-column label="预约" width="70">
              <template #default="{ row }">{{ row.booked_count }}/{{ row.people_count }}</template>
            </el-table-column>
            <el-table-column label="状态" width="76">
              <template #default="{ row }"><dict-tag dict="syllabusStatus" :value="row.status" /></template>
            </el-table-column>
          </el-table>
          <el-empty v-if="data && !data.classes.length" description="今日暂无团课" :image-size="60" />
        </div>
        <div class="card-box">
          <div class="box-title">今日私教预约</div>
          <el-table border :data="data ? data.ptToday : []" size="small" max-height="300">
            <el-table-column label="时间" width="100">
              <template #default="{ row }">{{ row.from_time }}-{{ row.to_time }}</template>
            </el-table-column>
            <el-table-column prop="realname" label="会员" width="80" />
            <el-table-column prop="coach_name" label="教练" width="70" />
            <el-table-column prop="course_title" label="课程" min-width="90" show-overflow-tooltip />
            <el-table-column label="状态" width="80">
              <template #default="{ row }"><dict-tag dict="ptStatus" :value="row.status" /></template>
            </el-table-column>
          </el-table>
          <el-empty v-if="data && !data.ptToday.length" description="今日暂无私教预约" :image-size="60" />
        </div>
      </div>
    </div>

    <!-- 用户数据 Tab -->
    <div v-show="activeTab === 'members'" v-loading="loadingMembers">
      <div style="display:flex;justify-content:flex-end;gap:10px;margin-bottom:15px">
        <el-date-picker v-model="rmonth" type="month" value-format="YYYY-MM" :clearable="false" @change="onReportMonth" style="width:160px" />
      </div>
      <template v-if="membersData">
        <div class="metric-grid">
          <div class="metric-card"><div class="m-label">累计会员</div><div class="m-value">{{ Fmt.num(membersData.summary.total_members) }}</div><div class="m-diff" :class="pctCls(membersData.summary.total_pct)">较上月 {{ pctText(membersData.summary.total_pct) }}</div></div>
          <div class="metric-card"><div class="m-label">在籍会员</div><div class="m-value">{{ Fmt.num(membersData.summary.active_members) }}</div><div class="m-diff" :class="pctCls(membersData.summary.active_pct)">较上月 {{ pctText(membersData.summary.active_pct) }}</div></div>
          <div class="metric-card"><div class="m-label">新会员</div><div class="m-value">{{ Fmt.num(membersData.summary.new_members) }}</div><div class="m-diff" :class="pctCls(membersData.summary.new_pct)">较上月 {{ pctText(membersData.summary.new_pct) }}</div></div>
          <div class="metric-card"><div class="m-label">复购会员
            <el-tooltip content="复购会员 = 当月老会员续卡/再次购卡/充值的去重人数" placement="top">
              <el-icon style="cursor:help;vertical-align:-2px;margin-left:2px;color:var(--el-text-color-secondary)" size="13"><InfoFilled /></el-icon>
            </el-tooltip></div><div class="m-value">{{ Fmt.num(membersData.summary.repeat_members) }}</div><div class="m-diff" :class="pctCls(membersData.summary.repeat_pct)">较上月 {{ pctText(membersData.summary.repeat_pct) }}</div></div>
        </div>
        
        <div class="card-box">
           <div class="box-title">新会员趋势</div>
           <v-chart :option="membersTrendOption" height="250px" />
        </div>

        <div class="three-col" style="grid-template-columns: 1fr 1fr; gap:20px">
           <div class="card-box">
              <div class="box-title" style="display:flex;justify-content:space-between">
                <span>新开会员卡 <span class="text-muted" style="font-weight:normal;font-size:12px;margin-left:4px">共计{{membersData.newCards.sum}}人</span></span>
                <el-button link type="primary" @click="previewDetail('members', 'new_cards')">导出明细</el-button>
              </div>
              <ratio-list :list="membersData.newCards.list" unit="人" />
           </div>
           <div class="card-box">
              <div class="box-title" style="display:flex;justify-content:space-between">
                <span>教练有效课时 <span class="text-muted" style="font-weight:normal;font-size:12px;margin-left:4px">共计{{membersData.coachHours.sum}}节</span></span>
                <el-button link type="primary" @click="previewDetail('members', 'coach_hours')">导出明细</el-button>
              </div>
              <ratio-list :list="membersData.coachHours.list" unit="节" />
           </div>
           <div class="card-box">
              <div class="box-title" style="display:flex;justify-content:space-between">
                <span>销售成单 <span class="text-muted" style="font-weight:normal;font-size:12px;margin-left:4px">共计{{membersData.salesOrders.sum}}单</span></span>
                <el-button link type="primary" @click="previewDetail('members', 'sales_orders')">导出明细</el-button>
              </div>
              <ratio-list :list="membersData.salesOrders.list" unit="单" />
           </div>
           <div class="card-box">
              <div class="box-title" style="display:flex;justify-content:space-between">
                <span>预约排行Top20 <span class="text-muted" style="font-weight:normal;font-size:12px;margin-left:4px">共计{{membersData.bookingTop.sum}}次</span></span>
                <el-button link type="primary" @click="previewDetail('members', 'booking_top')">导出明细</el-button>
              </div>
              <ratio-list :list="membersData.bookingTop.list" unit="次" />
           </div>
        </div>
      </template>
    </div>

    <!-- 财务数据 Tab -->
    <div v-show="activeTab === 'finance'" v-loading="loadingFinance">
      <div style="display:flex;justify-content:flex-end;gap:10px;margin-bottom:15px">
        <el-date-picker v-model="rmonth" type="month" value-format="YYYY-MM" :clearable="false" @change="onReportMonth" style="width:160px" />
      </div>
      <template v-if="financeData">
        <div class="metric-grid">
          <div class="metric-card"><div class="m-label">月度营收</div><div class="m-value" style="color:var(--money)">¥{{ Fmt.num(financeData.summary.revenue) }}</div><div class="m-diff" :class="pctCls(financeData.summary.revenue_pct)">较上月 {{ pctText(financeData.summary.revenue_pct) }}</div></div>
          <div class="metric-card"><div class="m-label">复购营收</div><div class="m-value" style="color:var(--money)">¥{{ Fmt.num(financeData.summary.repeat_revenue) }}</div><div class="m-diff" :class="pctCls(financeData.summary.repeat_pct)">较上月 {{ pctText(financeData.summary.repeat_pct) }}</div></div>
          <div class="metric-card"><div class="m-label">新用户营收</div><div class="m-value" style="color:var(--money)">¥{{ Fmt.num(financeData.summary.new_user_revenue) }}</div><div class="m-diff" :class="pctCls(financeData.summary.new_user_pct)">较上月 {{ pctText(financeData.summary.new_user_pct) }}</div></div>
        </div>
        
        <div class="card-box">
           <div class="box-title">营收趋势</div>
           <v-chart :option="financeTrendOption" height="250px" />
        </div>

        <div class="three-col" style="grid-template-columns: 1fr 1fr 1fr; gap:20px">
           <div class="card-box">
              <div class="box-title" style="display:flex;justify-content:space-between">
                <span>会员卡营收</span>
                <el-button link type="primary" @click="previewDetail('finance', 'by_card')">导出明细</el-button>
              </div>
              <ratio-list :list="financeData.byCard.list" money />
           </div>
           <div class="card-box">
              <div class="box-title" style="display:flex;justify-content:space-between">
                <span>销售业绩</span>
                <el-button link type="primary" @click="previewDetail('finance', 'sales')">导出明细</el-button>
              </div>
              <ratio-list :list="financeData.sales.list" money />
           </div>
           <div class="card-box">
              <div class="box-title" style="display:flex;justify-content:space-between">
                <span>人效 <span class="text-muted" style="font-weight:normal;font-size:12px;margin-left:4px">营收(权责发生制): ¥{{Fmt.num(financeData.accrual)}}</span></span>
                <el-button link type="primary" @click="previewDetail('finance', 'staff_value')">导出明细</el-button>
              </div>
              <div class="text-muted" style="font-size:12px">(教练所有课程价值总和，团课价值取决于约课人数)</div>
              <ratio-list :list="financeData.staffValue.list" money />
           </div>
        </div>
      </template>
    </div>

    <!-- 预览与导出弹窗 -->
    <el-dialog v-model="preview.visible" :title="preview.title" width="800px" top="5vh">
      <div style="display:flex;justify-content:space-between;align-items:center;margin-bottom:15px">
        <span v-if="preview.data">共 {{ preview.data.total }} {{ preview.data.unit }} · {{ preview.data.groups.length }} 组</span>
        <el-button type="primary" @click="exportDetailCsv"><el-icon><Download/></el-icon>&nbsp;下载CSV文件</el-button>
      </div>
      <el-table v-loading="preview.loading" :data="preview.items" max-height="500" size="small" border stripe>
        <el-table-column prop="groupName" label="分组" width="120" show-overflow-tooltip />
        <el-table-column prop="day" label="日期" width="80">
          <template #default="{row}">{{row.day}}号</template>
        </el-table-column>
        <el-table-column prop="time" label="时间" width="90" />
        <el-table-column prop="title" label="名称" min-width="120" show-overflow-tooltip />
        <el-table-column prop="sub" label="说明" min-width="120" show-overflow-tooltip />
        <el-table-column label="金额/数量" width="100" align="right">
           <template #default="{row}">
             <span v-if="row.money != null && preview.src === 'finance'" style="color:var(--money);font-weight:bold">¥{{ Fmt.num(row.money) }}</span>
             <span v-else-if="row.money != null">{{ row.money }}</span>
           </template>
        </el-table-column>
      </el-table>
    </el-dialog>
  </div>`,
  methods: {
    dayjs,
    async load() {
      this.loading = true;
      try {
        this.data = await api.get('/finance/dashboard',
          this.mode === 'month' ? { mode: 'month', month: this.month } : { date: this.date });
      } finally { this.loading = false; }
    },
    exportCsv(section) {
      const p = this.mode === 'month' ? { mode: 'month', month: this.month } : { date: this.date };
      window.open(api.exportUrl('/finance/dashboard', Object.assign({}, p, { section })));
    },
    async loadMonthly() {
      const role = (Auth.getUser() || {}).role;
      if (!['admin', 'manager'].includes(role)) return; // 与月度报表菜单权限一致
      this.monthly = await api.get('/finance/monthly');
    },
    async loadSegs() {
      try { this.segs = await api.get('/member-segments'); } catch (e) { /* ignore */ }
    },
    
    // 新增方法
    onTabChange() {
      if (this.activeTab === 'members' && !this.membersData) this.loadMembers();
      if (this.activeTab === 'finance' && !this.financeData) this.loadFinance();
    },
    pctCls(v) { v = Number(v) || 0; return v > 0 ? 'up' : (v < 0 ? 'down' : ''); },
    pctText(v) { v = Number(v) || 0; let a = v > 0 ? '▲ ' : (v < 0 ? '▼ ' : ''); return a + Fmt.num(Math.abs(v)) + '%'; },
    // 门店口径跟随顶部门店切换; 显式传 club_id, 让 CSV 下载(无请求头)与页面数据一致. 非管理员后端固定本店, 忽略该参数
    reportParams(extra) {
      const p = { month: this.rmonth };
      if (this.isAdmin) p.club_id = Auth.getClubId() || 'all';
      return Object.assign(p, extra);
    },
    // 切换月份后两个标签页的数据都失效, 只重载当前页
    onReportMonth() { this.membersData = null; this.financeData = null; this.onTabChange(); },
    async loadMembers() {
      this.loadingMembers = true;
      try { this.membersData = await api.get('/report/members', this.reportParams()); }
      finally { this.loadingMembers = false; }
    },
    async loadFinance() {
      this.loadingFinance = true;
      try { this.financeData = await api.get('/report/finance', this.reportParams()); }
      finally { this.loadingFinance = false; }
    },
    async previewDetail(src, section) {
      this.preview.src = src;
      this.preview.section = section;
      this.preview.title = '加载中...';
      this.preview.visible = true;
      this.preview.loading = true;
      try {
        const d = await api.get('/report/' + src, this.reportParams({ detail: section }));
        this.preview.data = d;
        this.preview.title = d.title;
        const items = [];
        (d.groups || []).forEach(g => {
          (g.items || []).forEach(it => {
             items.push(Object.assign({}, it, { groupName: g.name }));
          });
        });
        this.preview.items = items;
      } finally {
        this.preview.loading = false;
      }
    },
    exportDetailCsv() {
      const url = api.exportUrl('/report/' + this.preview.src, this.reportParams({ section: this.preview.section }));
      window.open(url);
    }
  },
  mounted() { this.load(); this.loadMonthly(); this.loadSegs(); },
};
