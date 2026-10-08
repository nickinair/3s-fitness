/* 团课课程库 + 教室管理 */

window.AppPages.GroupCourses = {
  name: 'GroupCoursesPage',
  data() {
    return {
      list: [], loading: false, groupCards: [],
      dlg: false, form: {}, saving: false,
      Fmt: window.Fmt, DICT: window.DICT,
    };
  },
  template: `
  <div>
    <div class="card-box">
      <div class="box-title">团课课程库
        <div style="display:flex;align-items:center;gap:10px">
          <el-button size="default" @click="exportCsv"><el-icon><Download /></el-icon>&nbsp;导出CSV</el-button>
          <el-button type="primary" size="default" @click="openAdd">新增团课</el-button>
        </div>
      </div>
      <el-table border :data="list" v-loading="loading" stripe>
        <el-table-column prop="title" label="课程名称" min-width="130" />
        <el-table-column prop="duration" label="时长(分钟)" width="100" />
        <el-table-column label="难度" width="130">
          <template #default="{ row }"><el-rate :model-value="row.difficulty" disabled /></template>
        </el-table-column>
        <el-table-column prop="deduct_num" label="耗卡次数" width="90" />
        <el-table-column label="适用卡" min-width="180">
          <template #default="{ row }">
            <span v-if="!parseIds(row.card_scope).length" class="text-muted">全部卡种</span>
            <el-tag v-for="id in parseIds(row.card_scope)" :key="id" size="small" style="margin-right:4px">{{ cardName(id) }}</el-tag>
          </template>
        </el-table-column>
        <el-table-column prop="tags" label="标签" width="120" show-overflow-tooltip />
        <el-table-column label="状态" width="80">
          <template #default="{ row }">
            <el-tag :type="row.status === 1 ? 'success' : 'info'" size="small">{{ row.status === 1 ? '启用' : '停用' }}</el-tag>
          </template>
        </el-table-column>
        <el-table-column label="操作" width="80" fixed="right">
          <template #default="{ row }"><el-button link type="primary" size="small" @click="openEdit(row)">编辑</el-button></template>
        </el-table-column>
      </el-table>
    </div>

    <el-dialog v-model="dlg" :title="form.id ? '编辑团课' : '新增团课'" width="560px" destroy-on-close>
      <el-form :model="form" label-width="100px">
        <el-form-item label="课程名称" required><el-input v-model="form.title" /></el-form-item>
        <el-form-item label="时长(分钟)"><el-input-number v-model="form.duration" :min="15" :step="15" style="width:160px" /></el-form-item>
        <el-form-item label="难度星级"><el-rate v-model="form.difficulty" /></el-form-item>
        <el-form-item label="耗卡次数"><el-input-number v-model="form.deduct_num" :min="0" style="width:160px" /></el-form-item>
        <el-form-item label="适用卡">
          <el-select v-model="form.card_scope" multiple clearable style="width:100%" placeholder="不选 = 全部卡种可约">
            <el-option v-for="c in groupCards" :key="c.id" :value="c.id" :label="c.title + '（' + DICT.cardKind[c.card_kind] + '）'" />
          </el-select>
        </el-form-item>
        <el-form-item label="标签"><el-input v-model="form.tags" placeholder="逗号分隔，如：燃脂,搏击" /></el-form-item>
        <el-form-item label="简介"><el-input v-model="form.intro" type="textarea" :rows="2" /></el-form-item>
        <el-form-item label="状态"><el-switch v-model="form.status" :active-value="1" :inactive-value="0" active-text="启用" inactive-text="停用" /></el-form-item>
      </el-form>
      <template #footer>
        <el-button @click="dlg=false">取消</el-button>
        <el-button type="primary" :loading="saving" @click="save">保存</el-button>
      </template>
    </el-dialog>
  </div>`,
  methods: {
    parseIds(v) { try { return JSON.parse(v || '[]'); } catch (e) { return []; } },
    cardName(id) { const c = this.groupCards.find(x => x.id === id); return c ? c.title : '#' + id; },
    async load() {
      this.loading = true;
      try { this.list = await api.get('/group-courses'); }
      finally { this.loading = false; }
    },
    exportCsv() { window.open(api.exportUrl('/group-courses', {})); },
    async loadDicts() {
      const cats = await api.get('/card-categories');
      this.groupCards = cats;
    },
    openAdd() {
      this.form = { title: '', duration: 60, difficulty: 3, deduct_num: 1, card_scope: [], tags: '', intro: '', status: 1 };
      this.dlg = true;
    },
    openEdit(row) {
      this.form = Object.assign(JSON.parse(JSON.stringify(row)), { card_scope: this.parseIds(row.card_scope) });
      this.dlg = true;
    },
    async save() {
      if (!this.form.title) return ElementPlus.ElMessage.warning('请填写课程名称');
      this.saving = true;
      try {
        if (this.form.id) await api.put('/group-courses/' + this.form.id, this.form);
        else await api.post('/group-courses', this.form);
        ElementPlus.ElMessage.success('保存成功');
        this.dlg = false;
        this.load();
      } finally { this.saving = false; }
    },
  },
  mounted() { this.load(); this.loadDicts(); },
};

/* ============ 教室管理 ============ */
window.AppPages.Classrooms = {
  name: 'ClassroomsPage',
  data() {
    return {
      list: [], loading: false,
      dlg: false, form: {}, saving: false,
    };
  },
  template: `
  <div>
    <div class="card-box">
      <div class="box-title">教室管理
        <el-button type="primary" size="default" @click="openAdd">新增教室</el-button>
      </div>
      <el-table border :data="list" v-loading="loading" stripe>
        <el-table-column prop="id" label="ID" width="70" />
        <el-table-column prop="title" label="教室名称" min-width="160" />
        <el-table-column prop="capacity" label="容纳人数" width="110" />
        <el-table-column label="操作" width="120" fixed="right">
          <template #default="{ row }">
            <el-button link type="primary" size="small" @click="openEdit(row)">编辑</el-button>
            <el-button link type="danger" size="small" @click="disable(row)">停用</el-button>
          </template>
        </el-table-column>
      </el-table>
    </div>

    <el-dialog v-model="dlg" :title="form.id ? '编辑教室' : '新增教室'" width="400px" destroy-on-close>
      <el-form :model="form" label-width="90px">
        <el-form-item label="教室名称" required><el-input v-model="form.title" /></el-form-item>
        <el-form-item label="容纳人数"><el-input-number v-model="form.capacity" :min="1" style="width:160px" /></el-form-item>
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
      try { this.list = await api.get('/classrooms'); }
      finally { this.loading = false; }
    },
    openAdd() { this.form = { title: '', capacity: 20 }; this.dlg = true; },
    openEdit(row) { this.form = JSON.parse(JSON.stringify(row)); this.dlg = true; },
    async save() {
      if (!this.form.title) return ElementPlus.ElMessage.warning('请填写教室名称');
      this.saving = true;
      try {
        if (this.form.id) await api.put('/classrooms/' + this.form.id, this.form);
        else await api.post('/classrooms', this.form);
        ElementPlus.ElMessage.success('保存成功');
        this.dlg = false;
        this.load();
      } finally { this.saving = false; }
    },
    disable(row) {
      ElementPlus.ElMessageBox.confirm('确定停用教室「' + row.title + '」？', '停用教室', { type: 'warning' })
        .then(async () => {
          await api.put('/classrooms/' + row.id, { title: row.title, capacity: row.capacity, status: 0 });
          ElementPlus.ElMessage.success('已停用');
          this.load();
        }).catch(() => {});
    },
  },
  mounted() { this.load(); },
};
