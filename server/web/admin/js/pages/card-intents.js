/* 购卡意向 */
window.AppPages.CardIntents = {
  name: 'CardIntentsPage',
  data() {
    return {
      tab: '0',
      query: { page: 1, size: 20 },
      list: [], total: 0, loading: false, pendingCount: 0,
      Fmt: window.Fmt, DICT: window.DICT,
    };
  },
  template: `
  <div>
    <div class="card-box">
      <el-tabs v-model="tab" @tab-change="search">
        <el-tab-pane name="0">
          <template #label>待跟进<span v-if="pendingCount" class="menu-badge">{{ pendingCount > 99 ? '99+' : pendingCount }}</span></template>
        </el-tab-pane>
        <el-tab-pane label="已开卡" name="1" />
        <el-tab-pane label="已关闭" name="2" />
      </el-tabs>
      <div class="search-bar">
        <div style="flex:1"></div>
        <el-button @click="exportCsv"><el-icon><Download /></el-icon>&nbsp;导出CSV</el-button>
      </div>
      <el-alert v-if="tab === '0' && pendingCount > 0" type="info" :closable="false" show-icon style="margin-bottom:10px">
        <template #title>会员在小程序提交的购卡意向，请尽快联系并到「快速开卡」办理，开卡后自动核销为已开卡</template>
      </el-alert>
      <el-table border :data="list" v-loading="loading" stripe>
        <el-table-column label="会员" width="120">
          <template #default="{ row }">
            <el-link type="primary" @click="$router.push('/members/' + row.vip_id)">{{ row.realname }}</el-link>
          </template>
        </el-table-column>
        <el-table-column prop="phone" label="手机号" width="120" />
        <el-table-column prop="card_type_name" label="意向卡" min-width="140" show-overflow-tooltip />
        <el-table-column label="价格" width="100">
          <template #default="{ row }"><span class="money">{{ Fmt.money(row.price) }}</span></template>
        </el-table-column>
        <el-table-column prop="remark" label="会员备注" min-width="140" show-overflow-tooltip>
          <template #default="{ row }">{{ row.remark || '-' }}</template>
        </el-table-column>
        <el-table-column label="提交时间" width="150"><template #default="{ row }">{{ Fmt.time(row.insert_time) }}</template></el-table-column>
        <el-table-column label="状态" width="86">
          <template #default="{ row }"><dict-tag dict="intentStatus" :value="row.status" /></template>
        </el-table-column>
        <el-table-column label="处理人" width="110">
          <template #default="{ row }">
            <div>{{ row.handle_user || '-' }}</div>
            <div class="text-muted" v-if="row.handle_remark">{{ row.handle_remark }}</div>
          </template>
        </el-table-column>
        <el-table-column label="操作" width="130" fixed="right">
          <template #default="{ row }">
            <template v-if="row.status === 0">
              <el-button link type="primary" size="small" @click="goOpen(row)">去开卡</el-button>
              <el-button link type="danger" size="small" @click="close(row)">关闭</el-button>
            </template>
          </template>
        </el-table-column>
      </el-table>
      <div class="pager">
        <el-pagination background layout="total, prev, pager, next" :total="total"
          v-model:current-page="query.page" v-model:page-size="query.size" @current-change="load" />
      </div>
    </div>
  </div>`,
  methods: {
    async load() {
      this.loading = true;
      try {
        const d = await api.get('/card-intents', Object.assign({ status: this.tab }, this.query));
        this.list = d.list; this.total = d.total;
      } finally { this.loading = false; }
      this.loadPending();
    },
    async loadPending() {
      try { const d = await api.get('/card-intents/pending-count'); this.pendingCount = d.count || 0; } catch (e) {}
    },
    search() { this.query.page = 1; this.load(); },
    exportCsv() {
      window.open(api.exportUrl('/card-intents', Object.assign({ status: this.tab }, this.query, { page: undefined, size: undefined })));
    },
    goOpen(row) { this.$router.push({ path: '/card-open', query: { vip_id: row.vip_id } }); },
    close(row) {
      ElementPlus.ElMessageBox.prompt('关闭「' + row.realname + '」对「' + row.card_type_name + '」的购卡意向，请填写原因：', '关闭意向', {
        confirmButtonText: '确认关闭', cancelButtonText: '取消', inputPlaceholder: '如：会员暂不考虑 / 已电话沟通',
      }).then(async ({ value }) => {
        await api.post('/card-intents/' + row.id + '/close', { remark: value || '' });
        ElementPlus.ElMessage.success('已关闭');
        this.load();
      }).catch(() => {});
    },
  },
  mounted() { this.load(); },
};
