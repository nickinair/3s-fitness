/* 签到记录 */
window.AppPages.CheckinRecords = {
  name: 'CheckinRecordsPage',
  data() {
    return {
      query: { date: dayjs().format('YYYY-MM-DD'), keyword: '', page: 1, size: 20 },
      list: [], total: 0, loading: false,
      Fmt: window.Fmt, DICT: window.DICT,
    };
  },
  template: `
  <div>
    <div class="card-box">
      <div class="search-bar">
        <el-date-picker v-model="query.date" type="date" value-format="YYYY-MM-DD" placeholder="签到日期" style="width:140px" />
        <el-input v-model="query.keyword" placeholder="会员/手机号" clearable style="width:170px" @keyup.enter="search" />
        <el-button type="primary" @click="search"><el-icon><Search /></el-icon>&nbsp;查询</el-button>
        <el-button @click="reset">重置</el-button>
        <div style="flex:1"></div>
        <el-button @click="exportCsv"><el-icon><Download /></el-icon>&nbsp;导出CSV</el-button>
      </div>
      <el-table border :data="list" v-loading="loading" stripe>
        <el-table-column label="会员" width="130">
          <template #default="{ row }">
            <el-link type="primary" @click="$router.push('/members/' + row.vip_id)">{{ row.realname }}</el-link>
            <div class="text-muted">{{ row.phone }}</div>
          </template>
        </el-table-column>
        <el-table-column label="入场时间" width="150"><template #default="{ row }">{{ Fmt.time(row.check_in_time) }}</template></el-table-column>
        <el-table-column label="出场时间" width="150">
          <template #default="{ row }">
            <span v-if="row.check_out_time">{{ Fmt.time(row.check_out_time) }}</span>
            <el-tag v-else type="success" size="small">在场</el-tag>
          </template>
        </el-table-column>
        <el-table-column label="使用卡" min-width="140">
          <template #default="{ row }">
            {{ row.card_type_name }} <dict-tag dict="cardKind" :value="row.card_kind" />
          </template>
        </el-table-column>
        <el-table-column prop="ope_username" label="经手人" width="110" />
        <el-table-column label="通道" width="80"><template #default="{ row }">{{ row.port === 2 ? '自助' : '前台' }}</template></el-table-column>
      </el-table>
      <div class="pager">
        <el-pagination background layout="total, sizes, prev, pager, next" :total="total"
          v-model:current-page="query.page" v-model:page-size="query.size" :page-sizes="[20,50,100]"
          @current-change="load" @size-change="search" />
      </div>
    </div>
  </div>`,
  methods: {
    async load() {
      this.loading = true;
      try {
        const d = await api.get('/checkins', this.query);
        this.list = d.list; this.total = d.total;
      } finally { this.loading = false; }
    },
    search() { this.query.page = 1; this.load(); },
    reset() { this.query = { date: dayjs().format('YYYY-MM-DD'), keyword: '', page: 1, size: 20 }; this.load(); },
    exportCsv() {
      window.open(api.exportUrl('/checkins', Object.assign({}, this.query, { page: undefined, size: undefined })));
    },
  },
  mounted() { this.load(); },
};
