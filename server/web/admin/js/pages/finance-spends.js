/* 耗卡明细 */
window.AppPages.FinanceSpends = {
  name: 'FinanceSpendsPage',
  data() {
    return {
      range: [dayjs().startOf('month').format('YYYY-MM-DD'), dayjs().format('YYYY-MM-DD')],
      query: { scene: '', keyword: '', club_id: window.clubDefault(), page: 1, size: 20 },
      list: [], total: 0, sum: 0, loading: false,
      Fmt: window.Fmt, DICT: window.DICT,
    };
  },
  template: `
  <div>
    <div class="card-box">
      <div class="search-bar">
        <el-date-picker v-model="range" type="daterange" value-format="YYYY-MM-DD" start-placeholder="开始" end-placeholder="结束" style="width:250px" />
        <club-picker v-model="query.club_id" @change="search" />
        <el-select v-model="query.scene" placeholder="耗卡场景" clearable style="width:120px">
          <el-option v-for="(v,k) in DICT.spendScene" :key="k" :value="k" :label="v" />
        </el-select>
        <el-input v-model="query.keyword" placeholder="会员/手机号" clearable style="width:150px" @keyup.enter="search" />
        <el-button type="primary" @click="search"><el-icon><Search /></el-icon>&nbsp;查询</el-button>
        <el-button @click="reset">重置</el-button>
        <div style="flex:1"></div>
        <el-button @click="exportCsv"><el-icon><Download /></el-icon>&nbsp;导出CSV</el-button>
      </div>
      <div class="stat-strip">
        <div class="item"><b>{{ Fmt.money(sum) }}</b>合计耗卡</div>
        <div class="item"><b>{{ total }}</b>笔流水</div>
      </div>
      <el-table border :data="list" v-loading="loading" stripe>
        <el-table-column label="时间" width="150"><template #default="{ row }">{{ Fmt.time(row.insert_time) }}</template></el-table-column>
        <el-table-column label="会员" width="120">
          <template #default="{ row }">
            <el-link type="primary" @click="$router.push('/members/' + row.vip_id)">{{ row.realname }}</el-link>
            <div class="text-muted">{{ row.phone }}</div>
          </template>
        </el-table-column>
        <el-table-column prop="card_type_name" label="卡类型" min-width="130" show-overflow-tooltip />
        <el-table-column label="场景" width="96"><template #default="{ row }"><dict-tag dict="spendScene" :value="row.scene" /></template></el-table-column>
        <el-table-column prop="costs" label="扣减次数" width="80" />
        <el-table-column label="耗卡金额" width="110"><template #default="{ row }"><span class="money">{{ Fmt.money(row.spend_money) }}</span></template></el-table-column>
        <el-table-column prop="coach_name" label="教练" width="90" />
        <el-table-column prop="remark" label="备注" min-width="130" show-overflow-tooltip />
      </el-table>
      <div class="pager">
        <el-pagination background layout="total, sizes, prev, pager, next" :total="total"
          v-model:current-page="query.page" v-model:page-size="query.size" :page-sizes="[20,50,100]"
          @current-change="load" @size-change="search" />
      </div>
    </div>
  </div>`,
  methods: {
    params() {
      return Object.assign({}, this.query, {
        from: this.range && this.range[0] ? this.range[0] : undefined,
        to: this.range && this.range[1] ? this.range[1] : undefined,
      });
    },
    async load() {
      this.loading = true;
      try {
        const d = await api.get('/finance/spends', this.params());
        this.list = d.list; this.total = d.total; this.sum = d.sum;
      } finally { this.loading = false; }
    },
    search() { this.query.page = 1; this.load(); },
    reset() {
      this.range = [dayjs().startOf('month').format('YYYY-MM-DD'), dayjs().format('YYYY-MM-DD')];
      this.query = { scene: '', keyword: '', page: 1, size: 20 };
      this.load();
    },
    exportCsv() { window.open(api.exportUrl('/finance/spends', Object.assign(this.params(), { page: undefined, size: undefined }))); },
  },
  mounted() { this.load(); },
};
