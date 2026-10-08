/* 动作库 */
window.AppPages.TrainingActions = {
  name: 'TrainingActionsPage',
  data() {
    return {
      part: '全部',
      parts: ['全部', '胸', '背', '肩', '手臂', '腿', '臀', '核心', '有氧', '拉伸'],
      keyword: '',
      list: [], loading: false,
      dlg: false, form: {}, saving: false,
      Fmt: window.Fmt, DICT: window.DICT,
    };
  },
  template: `
  <div>
    <div class="card-box">
      <el-tabs v-model="part" @tab-change="load">
        <el-tab-pane v-for="p in parts" :key="p" :label="p" :name="p" />
      </el-tabs>
      <div class="search-bar">
        <el-input v-model="keyword" placeholder="动作名称关键词" clearable style="width:190px" @keyup.enter="load" @clear="load" />
        <el-button type="primary" @click="load"><el-icon><Search /></el-icon>&nbsp;查询</el-button>
        <div style="flex:1"></div>
        <el-button type="primary" plain @click="openAdd">新增自定义动作</el-button>
      </div>
      <el-table border :data="list" v-loading="loading" stripe>
        <el-table-column prop="name" label="动作名称" min-width="150">
          <template #default="{ row }"><span style="font-weight:600">{{ row.name }}</span></template>
        </el-table-column>
        <el-table-column label="部位" width="90">
          <template #default="{ row }"><el-tag size="small">{{ row.part }}</el-tag></template>
        </el-table-column>
        <el-table-column prop="equipment" label="器械" width="110">
          <template #default="{ row }">{{ row.equipment || '-' }}</template>
        </el-table-column>
        <el-table-column prop="description" label="说明" min-width="200" show-overflow-tooltip>
          <template #default="{ row }">{{ row.description || '-' }}</template>
        </el-table-column>
        <el-table-column label="来源" width="100">
          <template #default="{ row }">
            <el-tag :type="row.merchant_id > 0 ? 'warning' : 'info'" size="small">{{ row.merchant_id > 0 ? '自定义' : '系统预置' }}</el-tag>
          </template>
        </el-table-column>
        <el-table-column label="操作" width="120" fixed="right">
          <template #default="{ row }">
            <template v-if="row.merchant_id > 0">
              <el-button link type="primary" size="small" @click="openEdit(row)">编辑</el-button>
              <el-button link type="danger" size="small" @click="del(row)">删除</el-button>
            </template>
            <span v-else class="text-muted" style="font-size:12px">—</span>
          </template>
        </el-table-column>
      </el-table>
    </div>

    <el-dialog v-model="dlg" :title="form.id ? '编辑动作 - ' + form.name : '新增自定义动作'" width="480px" destroy-on-close>
      <el-form :model="form" label-width="80px">
        <el-form-item label="动作名称" required><el-input v-model="form.name" placeholder="如：绳索面拉" /></el-form-item>
        <el-form-item label="部位" required>
          <el-select v-model="form.part" style="width:100%">
            <el-option v-for="p in parts.slice(1)" :key="p" :value="p" :label="p" />
          </el-select>
        </el-form-item>
        <el-form-item label="器械"><el-input v-model="form.equipment" placeholder="如：龙门架 / 哑铃 / 自重" /></el-form-item>
        <el-form-item label="说明"><el-input v-model="form.description" type="textarea" :rows="3" placeholder="动作要点、注意事项" /></el-form-item>
      </el-form>
      <template #footer>
        <el-button @click="dlg=false">取消</el-button>
        <el-button type="primary" :loading="saving" @click="save">保存</el-button>
      </template>
    </el-dialog>
  </div>`,
  methods: {
    async load() {
      this.loading = true;
      try {
        this.list = await api.get('/training-actions', {
          part: this.part === '全部' ? undefined : this.part,
          keyword: this.keyword || undefined,
        });
      } finally { this.loading = false; }
    },
    openAdd() {
      this.form = { name: '', part: this.part === '全部' ? '胸' : this.part, equipment: '', description: '' };
      this.dlg = true;
    },
    openEdit(row) { this.form = JSON.parse(JSON.stringify(row)); this.dlg = true; },
    async save() {
      if (!this.form.name) return ElementPlus.ElMessage.warning('请填写动作名称');
      if (!this.form.part) return ElementPlus.ElMessage.warning('请选择部位');
      this.saving = true;
      try {
        if (this.form.id) await api.put('/training-actions/' + this.form.id, this.form);
        else await api.post('/training-actions', this.form);
        ElementPlus.ElMessage.success('保存成功');
        this.dlg = false;
        this.load();
      } finally { this.saving = false; }
    },
    del(row) {
      ElementPlus.ElMessageBox.confirm('确定删除自定义动作「' + row.name + '」？', '删除动作', { type: 'warning' })
        .then(async () => {
          await api.del('/training-actions/' + row.id);
          ElementPlus.ElMessage.success('已删除');
          this.load();
        }).catch(() => {});
    },
  },
  mounted() { this.load(); },
};
