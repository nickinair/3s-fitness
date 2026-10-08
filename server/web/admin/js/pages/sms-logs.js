/* 短信记录 */
window.AppPages.SmsLogs = {
  name: 'SmsLogsPage',
  data() {
    return {
      query: { scene: '', keyword: '', page: 1, size: 20 },
      list: [], total: 0, monthCount: 0, loading: false,
      Fmt: window.Fmt, DICT: window.DICT,
    };
  },
  template: `
  <div>
    <div class="card-box">
      <el-alert type="info" :closable="false" show-icon style="margin-bottom:12px">
        <template #title>
          本月已发送 <b>{{ monthCount }}</b> 条 · 腾讯云短信企业认证后每月免费200条 · 当前为<b>模拟发送模式</b>（未配置短信凭证），正式模板待运营方提供
        </template>
      </el-alert>
      <div class="search-bar">
        <el-select v-model="query.scene" placeholder="全部场景" clearable style="width:150px">
          <el-option v-for="(v,k) in DICT.smsScene" :key="k" :value="k" :label="v" />
        </el-select>
        <el-input v-model="query.keyword" placeholder="会员/手机号" clearable style="width:170px" @keyup.enter="search" />
        <el-button type="primary" @click="search"><el-icon><Search /></el-icon>&nbsp;查询</el-button>
        <el-button @click="reset">重置</el-button>
        <div style="flex:1"></div>
        <el-button @click="exportCsv"><el-icon><Download /></el-icon>&nbsp;导出CSV</el-button>
      </div>
      <el-table border :data="list" v-loading="loading" stripe>
        <el-table-column label="会员" width="110">
          <template #default="{ row }">
            <el-link v-if="row.vip_id" type="primary" @click="$router.push('/members/' + row.vip_id)">{{ row.realname }}</el-link>
            <span v-else>{{ row.realname || '-' }}</span>
          </template>
        </el-table-column>
        <el-table-column prop="phone" label="手机号" width="120" />
        <el-table-column label="场景" width="100">
          <template #default="{ row }"><dict-tag dict="smsScene" :value="row.scene" /></template>
        </el-table-column>
        <el-table-column prop="content" label="内容" min-width="320" show-overflow-tooltip />
        <el-table-column label="状态" width="80">
          <template #default="{ row }"><dict-tag dict="smsStatus" :value="row.status" /></template>
        </el-table-column>
        <el-table-column label="时间" width="150"><template #default="{ row }">{{ Fmt.time(row.insert_time) }}</template></el-table-column>
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
        const d = await api.get('/sms-logs', this.query);
        this.list = d.list; this.total = d.total; this.monthCount = d.monthCount || 0;
      } finally { this.loading = false; }
    },
    search() { this.query.page = 1; this.load(); },
    reset() { this.query = { scene: '', keyword: '', page: 1, size: 20 }; this.load(); },
    exportCsv() {
      window.open(api.exportUrl('/sms-logs', Object.assign({}, this.query, { page: undefined, size: undefined })));
    },
  },
  mounted() { this.load(); },
};
