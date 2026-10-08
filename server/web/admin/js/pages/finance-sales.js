/* 顾问业绩(按开卡员工统计) */
window.AppPages.FinanceSales = {
  name: 'FinanceSalesPage',
  data() {
    return {
      month: dayjs().format('YYYY-MM'),
      clubId: window.clubDefault(),
      d: null, loading: false,
      range: [], dp: 1, dsize: 50,
      Fmt: window.Fmt, DICT: window.DICT,
      user: Auth.getUser() || {},
    };
  },
  template: `
  <div v-loading="loading">
    <div class="card-box">
      <div class="search-bar mb0">
        <el-date-picker v-model="month" type="month" value-format="YYYY-MM" :clearable="false" style="width:140px" @change="onMonth" />
        <club-picker v-model="clubId" @change="load" />
        <span class="text-muted" v-if="user.role === 'membership'">我的业绩（仅展示本人数据）</span>
        <div style="flex:1"></div>
        <el-dropdown @command="exportCsv">
          <el-button><el-icon><Download /></el-icon>&nbsp;导出CSV<el-icon class="el-icon--right"><ArrowDown /></el-icon></el-button>
          <template #dropdown><el-dropdown-menu>
            <el-dropdown-item command="details">收款明细</el-dropdown-item>
            <el-dropdown-item command="list">业绩汇总</el-dropdown-item>
          </el-dropdown-menu></template>
        </el-dropdown>
      </div>
    </div>
    <div class="card-box">
      <div class="box-title">{{ month }} 业绩排行</div>
      <el-table border :data="d ? d.list : []" stripe>
        <el-table-column type="index" label="排名" width="70" />
        <el-table-column prop="name" label="员工" min-width="140" />
        <el-table-column prop="orders" label="成单数" width="100" />
        <el-table-column label="业绩金额" width="150">
          <template #default="{ row }"><span class="money" style="font-size:15px">{{ Fmt.money(row.money) }}</span></template>
        </el-table-column>
        <el-table-column label="新客成单" width="100"><template #default="{ row }">{{ row.new_orders || 0 }}</template></el-table-column>
        <el-table-column label="续费金额" width="140"><template #default="{ row }">{{ Fmt.money(row.renew_money) }}</template></el-table-column>
        <el-table-column />
      </el-table>
    </div>
    <div class="card-box">
      <div class="box-title">
        收款明细
        <span class="text-muted" style="font-size:12px;font-weight:400;margin-left:8px" v-if="d">
          {{ d.from }} 至 {{ d.to }} · 共 {{ d.detail_total }} 条 · 合计 {{ Fmt.money(d.detail_sum) }}
        </span>
      </div>
      <div class="search-bar">
        <el-date-picker v-model="range" type="daterange" value-format="YYYY-MM-DD" range-separator="至"
          start-placeholder="开始日期" end-placeholder="结束日期" style="width:260px" @change="reloadDetail" />
        <el-button @click="quick(12)">近一年</el-button>
        <el-button @click="quick(3)">近三月</el-button>
        <el-button @click="quick(1)">近一月</el-button>
      </div>
      <el-table border :data="d ? d.details : []" size="small" stripe max-height="480">
        <el-table-column label="时间" width="150"><template #default="{ row }">{{ Fmt.time(row.insert_time) }}</template></el-table-column>
        <el-table-column prop="realname" label="会员" width="100" />
        <el-table-column prop="card_type_name" label="卡类型" min-width="130" show-overflow-tooltip />
        <el-table-column label="类型" width="76"><template #default="{ row }"><dict-tag dict="rechargeType" :value="row.type" /></template></el-table-column>
        <el-table-column label="金额" width="110"><template #default="{ row }"><span class="money">{{ Fmt.money(row.actual_money) }}</span></template></el-table-column>
        <el-table-column label="是否新客" width="80"><template #default="{ row }">{{ row.is_new_user ? '新客' : '老客' }}</template></el-table-column>
        <el-table-column prop="membership_name" label="业绩归属" width="100" />
        <el-table-column label="支付" width="76"><template #default="{ row }">{{ DICT.payMethod[row.pay_method] || '-' }}</template></el-table-column>
      </el-table>
      <el-pagination v-if="d && d.detail_total > dsize" style="margin-top:12px;justify-content:flex-end"
        layout="total, sizes, prev, pager, next" :total="d.detail_total" v-model:current-page="dp"
        v-model:page-size="dsize" :page-sizes="[50, 100, 200]"
        @current-change="reloadDetail" @size-change="() => { dp = 1; reloadDetail(); }" />
    </div>
  </div>`,
  computed: {
    query() {
      return {
        month: this.month, club_id: this.clubId,
        from: this.range && this.range[0] ? this.range[0] : undefined,
        to: this.range && this.range[1] ? this.range[1] : undefined,
      };
    },
  },
  methods: {
    async load() {
      this.loading = true;
      try {
        this.d = await api.get('/finance/sales', Object.assign({}, this.query, { page: this.dp, size: this.dsize }));
        // 首次进入回填默认区间(近一年), 让筛选框和实际口径一致
        if ((!this.range || !this.range.length) && this.d.from) this.range = [this.d.from, this.d.to];
      } finally { this.loading = false; }
    },
    reloadDetail() { this.load(); },
    onMonth() { this.range = []; this.dp = 1; this.load(); },
    quick(months) {
      const to = dayjs(this.month + '-01').endOf('month');
      this.range = [to.subtract(months - 1, 'month').startOf('month').format('YYYY-MM-DD'), to.format('YYYY-MM-DD')];
      this.dp = 1; this.load();
    },
    exportCsv(section) { window.open(api.exportUrl('/finance/sales', Object.assign({}, this.query, { section }))); },
  },
  mounted() { this.load(); },
};
