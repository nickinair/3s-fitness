/* 潜在客户 */
window.AppPages.Potentials = {
  name: 'PotentialsPage',
  data() {
    return {
      tab: '0',
      query: { keyword: '', label: '', page: 1, size: 20 },
      list: [], total: 0, loading: false, selection: [],
      sources: [], staffSales: [],
      dlg: false, dlgTitle: '录入潜客', form: {}, saving: false,
      mtDlg: false, mtRow: null, mtList: [], mtForm: { record_type: 1, content: '' }, mtSaving: false,
      assignDlg: false, assignForm: { membership_id: null },
      Fmt: window.Fmt, DICT: window.DICT,
    };
  },
  template: `
  <div>
    <div class="card-box">
      <el-tabs v-model="tab" @tab-change="search">
        <el-tab-pane label="跟进中" name="0" />
        <el-tab-pane label="已转正" name="1" />
      </el-tabs>
      <div class="search-bar">
        <el-input v-model="query.keyword" placeholder="姓名/手机号" clearable style="width:180px" @keyup.enter="search" />
        <el-select v-model="query.label" placeholder="意向标签" clearable style="width:110px">
          <el-option :value="1" label="A · 高意向" /><el-option :value="2" label="B · 中意向" /><el-option :value="3" label="C · 低意向" />
        </el-select>
        <el-button type="primary" @click="search"><el-icon><Search /></el-icon>&nbsp;查询</el-button>
        <el-button @click="reset">重置</el-button>
        <div style="flex:1"></div>
        <el-button @click="exportCsv"><el-icon><Download /></el-icon>&nbsp;导出CSV</el-button>
        <el-button :disabled="!selection.length" @click="assignDlg = true; assignForm = { membership_id: null }">批量分配跟进顾问 ({{ selection.length }})</el-button>
        <el-button type="primary" plain @click="openAdd">录入潜客</el-button>
      </div>
      <el-table border :data="list" v-loading="loading" @selection-change="s => selection = s" stripe>
        <el-table-column type="selection" width="42" />
        <el-table-column prop="realname" label="姓名" width="110" />
        <el-table-column prop="phone" label="手机号" width="120" />
        <el-table-column label="性别" width="60"><template #default="{ row }">{{ DICT.gender[row.gender] }}</template></el-table-column>
        <el-table-column label="意向" width="70">
          <template #default="{ row }">
            <dict-tag v-if="row.label_levels" dict="labelLevel" :value="row.label_levels" />
            <span v-else class="text-muted">-</span>
          </template>
        </el-table-column>
        <el-table-column prop="source_name" label="来源" width="100" />
        <el-table-column prop="membership_name" label="跟进顾问" width="100" />
        <el-table-column label="最近维护" min-width="180">
          <template #default="{ row }">
            <div>{{ Fmt.time(row.last_maintain_time) }}</div>
            <div class="text-muted" v-if="row.last_maintain_record">{{ row.last_maintain_record }}</div>
          </template>
        </el-table-column>
        <el-table-column label="录入时间" width="120"><template #default="{ row }">{{ Fmt.date(row.insert_time) }}</template></el-table-column>
        <el-table-column label="操作" width="200" fixed="right">
          <template #default="{ row }">
            <template v-if="tab === '0'">
              <el-button link type="primary" size="small" @click="openEdit(row)">编辑</el-button>
              <el-button link type="primary" size="small" @click="openMaintain(row)">维护</el-button>
              <el-button link type="success" size="small" @click="convert(row)">转正</el-button>
            </template>
            <el-button v-else link type="primary" size="small" @click="$router.push('/members/' + row.vip_user_id)">会员档案</el-button>
          </template>
        </el-table-column>
      </el-table>
      <div class="pager">
        <el-pagination background layout="total, prev, pager, next" :total="total"
          v-model:current-page="query.page" v-model:page-size="query.size" @current-change="load" />
      </div>
    </div>

    <el-dialog v-model="dlg" :title="dlgTitle" width="560px" destroy-on-close>
      <el-form :model="form" label-width="90px">
        <el-row :gutter="14">
          <el-col :span="12"><el-form-item label="姓名" required><el-input v-model="form.realname" /></el-form-item></el-col>
          <el-col :span="12"><el-form-item label="手机号" required><el-input v-model="form.phone" :disabled="!!form.id" maxlength="11" /></el-form-item></el-col>
          <el-col :span="12"><el-form-item label="性别">
            <el-radio-group v-model="form.gender"><el-radio :value="1">男</el-radio><el-radio :value="2">女</el-radio><el-radio :value="0">未知</el-radio></el-radio-group>
          </el-form-item></el-col>
          <el-col :span="12"><el-form-item label="意向标签">
            <el-select v-model="form.label_levels" style="width:100%">
              <el-option :value="0" label="无" /><el-option :value="1" label="A · 高意向" /><el-option :value="2" label="B · 中意向" /><el-option :value="3" label="C · 低意向" />
            </el-select>
          </el-form-item></el-col>
          <el-col :span="12"><el-form-item label="来源渠道">
            <el-select v-model="form.source_id" clearable style="width:100%" @change="onSourceChange">
              <el-option v-for="s in sources" :key="s.id" :value="s.id" :label="s.title" />
            </el-select>
          </el-form-item></el-col>
          <el-col :span="12"><el-form-item label="跟进顾问">
            <el-select v-model="form.membership_id" clearable style="width:100%" @change="onSaleChange">
              <el-option v-for="s in staffSales" :key="s.id" :value="s.id" :label="s.realname" />
            </el-select>
          </el-form-item></el-col>
          <el-col :span="24"><el-form-item label="备注"><el-input v-model="form.remark" type="textarea" :rows="2" /></el-form-item></el-col>
        </el-row>
      </el-form>
      <template #footer>
        <el-button @click="dlg=false">取消</el-button>
        <el-button type="primary" :loading="saving" @click="save">保存</el-button>
      </template>
    </el-dialog>

    <el-dialog v-model="mtDlg" :title="'维护记录 - ' + (mtRow ? mtRow.realname : '')" width="640px" destroy-on-close>
      <el-form inline :model="mtForm" style="margin-bottom:6px">
        <el-form-item label="方式">
          <el-select v-model="mtForm.record_type" style="width:100px">
            <el-option v-for="(v,k) in DICT.maintainType" :key="k" :value="Number(k)" :label="v" />
          </el-select>
        </el-form-item>
        <el-form-item style="width:320px"><el-input v-model="mtForm.content" placeholder="填写跟进内容" /></el-form-item>
        <el-form-item><el-button type="primary" :loading="mtSaving" @click="saveMaintain">新增记录</el-button></el-form-item>
      </el-form>
      <el-table border :data="mtList" size="small" max-height="320">
        <el-table-column label="时间" width="140"><template #default="{ row }">{{ Fmt.time(row.insert_time) }}</template></el-table-column>
        <el-table-column label="方式" width="70"><template #default="{ row }">{{ DICT.maintainType[row.record_type] || '-' }}</template></el-table-column>
        <el-table-column prop="membership_name" label="会籍顾问" width="90" />
        <el-table-column prop="content" label="内容" min-width="200" show-overflow-tooltip />
      </el-table>
    </el-dialog>

    <el-dialog v-model="assignDlg" title="批量分配跟进顾问" width="420px">
      <el-form label-width="90px">
        <el-form-item label="跟进顾问">
          <el-select v-model="assignForm.membership_id" style="width:100%">
            <el-option v-for="s in staffSales" :key="s.id" :value="s.id" :label="s.realname" />
          </el-select>
        </el-form-item>
        <div class="text-muted" style="padding-left:90px">将为选中的 {{ selection.length }} 名潜客统一改派跟进顾问</div>
      </el-form>
      <template #footer>
        <el-button @click="assignDlg=false">取消</el-button>
        <el-button type="primary" @click="doAssign">确认分配</el-button>
      </template>
    </el-dialog>
  </div>`,
  methods: {
    async load() {
      this.loading = true;
      try {
        const d = await api.get('/potentials', Object.assign({ converted: this.tab }, this.query));
        this.list = d.list; this.total = d.total;
      } finally { this.loading = false; }
    },
    search() { this.query.page = 1; this.load(); },
    reset() { this.query = { keyword: '', label: '', page: 1, size: 20 }; this.load(); },
    exportCsv() {
      window.open(api.exportUrl('/potentials', Object.assign({ converted: this.tab }, this.query, { page: undefined, size: undefined })));
    },
    async loadDicts() {
      const [sources, staff] = await Promise.all([api.get('/sources'), api.get('/staff')]);
      this.sources = sources;
      this.staffSales = staff.filter(s => s.role === 'membership' && s.status === 1);
    },
    openAdd() { this.dlgTitle = '录入潜客'; this.form = { gender: 0, label_levels: 1 }; this.dlg = true; },
    openEdit(row) { this.dlgTitle = '编辑潜客 - ' + row.realname; this.form = JSON.parse(JSON.stringify(row)); this.dlg = true; },
    onSourceChange(v) { const s = this.sources.find(x => x.id === v); this.form.source_name = s ? s.title : ''; },
    onSaleChange(v) { const s = this.staffSales.find(x => x.id === v); this.form.membership_name = s ? s.realname : ''; },
    async save() {
      if (!this.form.realname || !this.form.phone) return ElementPlus.ElMessage.warning('请填写姓名与手机号');
      this.saving = true;
      try {
        if (this.form.id) await api.put('/potentials/' + this.form.id, this.form);
        else await api.post('/potentials', this.form);
        ElementPlus.ElMessage.success('保存成功');
        this.dlg = false;
        this.load();
      } catch (e) { /* 已提示 */ } finally { this.saving = false; }
    },
    async openMaintain(row) {
      this.mtRow = row;
      this.mtForm = { record_type: 1, content: '' };
      this.mtDlg = true;
      const d = await api.get('/maintain-records', { vip_user_id: row.id, vip_user_type: 2, size: 50 });
      this.mtList = d.list;
    },
    async saveMaintain() {
      if (!this.mtForm.content) return ElementPlus.ElMessage.warning('请填写内容');
      this.mtSaving = true;
      try {
        await api.post('/maintain-records', { vip_user_id: this.mtRow.id, vip_user_type: 2, record_type: this.mtForm.record_type, content: this.mtForm.content });
        ElementPlus.ElMessage.success('已记录');
        this.mtForm.content = '';
        const d = await api.get('/maintain-records', { vip_user_id: this.mtRow.id, vip_user_type: 2, size: 50 });
        this.mtList = d.list;
        this.load();
      } finally { this.mtSaving = false; }
    },
    convert(row) {
      ElementPlus.ElMessageBox.confirm('确定将潜客「' + row.realname + '」转为正式会员档案？', '潜客转正', { type: 'warning', confirmButtonText: '确认转正' })
        .then(async () => {
          const d = await api.post('/potentials/' + row.id + '/convert');
          ElementPlus.ElMessage.success('已转正');
          this.load();
          if (d && d.vip_id) this.$router.push('/members/' + d.vip_id);
        }).catch(() => {});
    },
    async doAssign() {
      if (!this.assignForm.membership_id) return ElementPlus.ElMessage.warning('请选择跟进顾问');
      const s = this.staffSales.find(x => x.id === this.assignForm.membership_id);
      await api.post('/members/assign', {
        ids: this.selection.map(x => x.id), type: 'potential',
        membership_id: this.assignForm.membership_id, membership_name: s ? s.realname : '',
      });
      ElementPlus.ElMessage.success('分配成功');
      this.assignDlg = false;
      this.load();
    },
  },
  mounted() { this.load(); this.loadDicts(); },
};
