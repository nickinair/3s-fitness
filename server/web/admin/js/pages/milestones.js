/* 里程碑总结 */
window.AppPages.Milestones = {
  name: 'MilestonesPage',
  data() {
    return {
      tab: '0',
      query: { keyword: '', page: 1, size: 20 },
      list: [], total: 0, loading: false, pendingCount: 0,
      // 填写总结
      dlg: false, cur: null, summary: '', saving: false,
      // 查看总结
      viewDlg: false,
      Fmt: window.Fmt, DICT: window.DICT,
    };
  },
  template: `
  <div>
    <div class="card-box">
      <el-alert v-if="pendingCount > 0" type="warning" :closable="false" show-icon style="margin-bottom:10px">
        <template #title>有 <b>{{ pendingCount }}</b> 条里程碑待总结，请及时填写训练成果，会员将在小程序中查看</template>
      </el-alert>
      <el-tabs v-model="tab" @tab-change="search">
        <el-tab-pane name="0">
          <template #label>待总结<span v-if="pendingCount" class="menu-badge">{{ pendingCount > 99 ? '99+' : pendingCount }}</span></template>
        </el-tab-pane>
        <el-tab-pane label="已总结" name="1" />
      </el-tabs>
      <div class="search-bar">
        <el-input v-model="query.keyword" placeholder="会员/手机号" clearable style="width:190px" @keyup.enter="search" />
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
        <el-table-column label="里程碑节点" width="130">
          <template #default="{ row }">
            <el-tag :type="row.type === 1 ? 'primary' : 'success'" size="default" style="font-weight:600">{{ nodeText(row) }}</el-tag>
          </template>
        </el-table-column>
        <el-table-column label="主教练" width="90">
          <template #default="{ row }">{{ row.coach_name || '-' }}</template>
        </el-table-column>
        <el-table-column label="卡类型" min-width="130">
          <template #default="{ row }">{{ row.card_type_name || '-' }}</template>
        </el-table-column>
        <el-table-column label="创建时间" width="150"><template #default="{ row }">{{ Fmt.time(row.insert_time) }}</template></el-table-column>
        <el-table-column label="状态" width="86">
          <template #default="{ row }"><dict-tag dict="milestoneStatus" :value="row.status" /></template>
        </el-table-column>
        <el-table-column label="操作" width="110" fixed="right">
          <template #default="{ row }">
            <el-button v-if="row.status === 0" link type="primary" size="small" @click="openSummary(row)">填写总结</el-button>
            <el-button v-else link type="primary" size="small" @click="viewSummary(row)">查看总结</el-button>
          </template>
        </el-table-column>
      </el-table>
      <div class="pager">
        <el-pagination background layout="total, prev, pager, next" :total="total"
          v-model:current-page="query.page" v-model:page-size="query.size" @current-change="load" />
      </div>
    </div>

    <!-- 填写总结 -->
    <el-dialog v-model="dlg" :title="cur ? '填写里程碑总结 - ' + cur.realname + ' · ' + nodeText(cur) : ''" width="560px" destroy-on-close>
      <el-input v-model="summary" type="textarea" :rows="6"
        placeholder="建议写清：本阶段训练成果（力量/体重/体态等变化）+ 下阶段训练建议。会员将在小程序「里程碑」中看到这段总结。" />
      <div class="text-muted" style="margin-top:8px;font-size:12px">提交后会员端立即可见，请认真填写</div>
      <template #footer>
        <el-button @click="dlg = false">取消</el-button>
        <el-button type="primary" :loading="saving" @click="saveSummary">提交总结</el-button>
      </template>
    </el-dialog>

    <!-- 查看总结 -->
    <el-dialog v-model="viewDlg" :title="cur ? '里程碑总结 - ' + cur.realname + ' · ' + nodeText(cur) : ''" width="560px">
      <template v-if="cur">
        <div style="background:var(--el-color-primary-light-9);border-radius:8px;padding:14px;line-height:1.8;white-space:pre-wrap">{{ cur.summary || '（无内容）' }}</div>
        <div class="text-muted" style="margin-top:10px">总结时间：{{ Fmt.time(cur.summary_time) }} · 教练：{{ cur.coach_name || '-' }}</div>
      </template>
    </el-dialog>
  </div>`,
  methods: {
    nodeText(row) { return row.type === 1 ? ('第' + row.node_value + '节课') : ('第' + row.node_value + '天'); },
    async load() {
      this.loading = true;
      try {
        const d = await api.get('/milestones', Object.assign({ status: this.tab }, this.query));
        this.list = d.list; this.total = d.total;
      } finally { this.loading = false; }
      this.loadPending();
    },
    async loadPending() {
      try { const d = await api.get('/milestones/pending-count'); this.pendingCount = d.count || 0; } catch (e) {}
    },
    search() { this.query.page = 1; this.load(); },
    reset() { this.query = { keyword: '', page: 1, size: 20 }; this.load(); },
    exportCsv() {
      window.open(api.exportUrl('/milestones', Object.assign({ status: this.tab }, this.query, { page: undefined, size: undefined })));
    },
    openSummary(row) { this.cur = row; this.summary = ''; this.dlg = true; },
    viewSummary(row) { this.cur = row; this.viewDlg = true; },
    async saveSummary() {
      if (!this.summary.trim()) return ElementPlus.ElMessage.warning('请填写总结内容');
      this.saving = true;
      try {
        await api.post('/milestones/' + this.cur.id + '/summary', { summary: this.summary.trim() });
        ElementPlus.ElMessage.success('总结已提交');
        this.dlg = false;
        this.load();
      } finally { this.saving = false; }
    },
  },
  mounted() { this.load(); },
};
