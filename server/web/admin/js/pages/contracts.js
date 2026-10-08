/* 合同列表 */
window.AppPages.Contracts = {
  name: 'ContractsPage',
  data() {
    return {
      query: { keyword: '', sign_status: '', page: 1, size: 20 },
      list: [], total: 0, loading: false,
      dlg: false, contract: null,
      Fmt: window.Fmt, DICT: window.DICT,
    };
  },
  template: `
  <div>
    <div class="card-box">
      <div class="search-bar">
        <el-input v-model="query.keyword" placeholder="会员/手机号/合同号" clearable style="width:220px" @keyup.enter="search" />
        <el-select v-model="query.sign_status" placeholder="签署状态" clearable style="width:120px">
          <el-option :value="0" label="待签署" /><el-option :value="1" label="已签署" />
        </el-select>
        <el-button type="primary" @click="search"><el-icon><Search /></el-icon>&nbsp;查询</el-button>
        <el-button @click="reset">重置</el-button>
      </div>
      <el-table border :data="list" v-loading="loading" stripe>
        <el-table-column prop="contract_num" label="合同号" width="210" />
        <el-table-column prop="title" label="标题" min-width="170" />
        <el-table-column label="会员" width="130">
          <template #default="{ row }">
            <el-link type="primary" @click="$router.push('/members/' + row.vip_id)">{{ row.realname }}</el-link>
            <div class="text-muted">{{ row.phone }}</div>
          </template>
        </el-table-column>
        <el-table-column label="签署状态" width="100"><template #default="{ row }"><dict-tag dict="signStatus" :value="row.sign_status" /></template></el-table-column>
        <el-table-column label="签署时间" width="150"><template #default="{ row }">{{ Fmt.time(row.sign_time) }}</template></el-table-column>
        <el-table-column label="创建时间" width="150"><template #default="{ row }">{{ Fmt.time(row.insert_time) }}</template></el-table-column>
        <el-table-column label="操作" width="100" fixed="right">
          <template #default="{ row }"><el-button link type="primary" size="small" @click="view(row)">查看合同</el-button></template>
        </el-table-column>
      </el-table>
      <div class="pager">
        <el-pagination background layout="total, prev, pager, next" :total="total"
          v-model:current-page="query.page" v-model:page-size="query.size" @current-change="load" />
      </div>
    </div>

    <el-dialog v-model="dlg" :title="contract ? contract.title + '（' + contract.contract_num + '）' : '合同'" width="680px">
      <template v-if="contract">
        <div style="margin-bottom:10px">
          <dict-tag dict="signStatus" :value="contract.sign_status" size="default" />
          <span class="text-muted" style="margin-left:10px" v-if="contract.sign_status === 1">签署于 {{ Fmt.time(contract.sign_time) }}</span>
          <span class="text-muted" style="margin-left:10px" v-else>会员可在小程序中签署</span>
        </div>
        <div class="contract-body">{{ contract.content }}</div>
        <div v-if="contract.sign_status === 1 && contract.sign_img" style="margin-top:12px">
          <div class="text-muted" style="margin-bottom:6px">会员签名：</div>
          <img :src="contract.sign_img" style="max-height:110px;border:1px dashed #ccc;border-radius:8px;background:#fff" />
        </div>
      </template>
    </el-dialog>
  </div>`,
  methods: {
    async load() {
      this.loading = true;
      try {
        const d = await api.get('/contracts', this.query);
        this.list = d.list; this.total = d.total;
      } finally { this.loading = false; }
    },
    search() { this.query.page = 1; this.load(); },
    reset() { this.query = { keyword: '', sign_status: '', page: 1, size: 20 }; this.load(); },
    async view(row) {
      this.contract = await api.get('/contracts/' + row.id);
      this.dlg = true;
    },
  },
  mounted() { this.load(); },
};
