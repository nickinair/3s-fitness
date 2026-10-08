/* 教练档案 / 私教课程类型 / 休息管理 */

window.AppPages.Coaches = {
  name: 'CoachesPage',
  data() {
    return {
      list: [], loading: false,
      drawer: false, form: {}, saving: false, uploading: '',
      Fmt: window.Fmt, DICT: window.DICT,
    };
  },
  template: `
  <div>
    <div class="card-box">
      <div class="box-title">教练档案
        <el-button type="primary" @click="openAdd">新增教练</el-button>
      </div>
      <el-table border :data="list" v-loading="loading" stripe>
        <el-table-column label="教练" width="150">
          <template #default="{ row }">
            <div style="display:flex;align-items:center;gap:8px">
              <div class="avatar-circle" style="width:36px;height:36px;font-size:15px">{{ (row.realname || '?').slice(0,1) }}</div>
              <div>
                <div style="font-weight:600">{{ row.realname }}</div>
                <div class="text-muted" v-if="row.nickname">{{ row.nickname }}</div>
              </div>
            </div>
          </template>
        </el-table-column>
        <el-table-column label="课时单价" width="100">
          <template #default="{ row }">
            <span class="money" v-if="Number(row.lesson_price) > 0">{{ Fmt.money(row.lesson_price) }}/节</span>
            <span v-else class="text-muted">未设置</span>
          </template>
        </el-table-column>
        <el-table-column prop="good_at" label="擅长" width="180" show-overflow-tooltip />
        <el-table-column prop="desc" label="简介" min-width="200" show-overflow-tooltip />
        <el-table-column prop="sort" label="排序" width="60" />
        <el-table-column label="状态" width="80">
          <template #default="{ row }">
            <el-tag :type="row.status === 1 ? 'success' : 'info'" size="small">{{ row.status === 1 ? '在职' : '离职' }}</el-tag>
          </template>
        </el-table-column>
        <el-table-column label="操作" width="100" fixed="right">
          <template #default="{ row }"><el-button link type="primary" size="small" @click="openEdit(row)">编辑档案</el-button></template>
        </el-table-column>
      </el-table>
    </div>

    <el-drawer v-model="drawer" :title="form.id ? ('编辑教练档案 - ' + (form.realname || '')) : '新增教练'" size="520px" destroy-on-close>
      <el-form :model="form" label-width="90px">
        <template v-if="!form.id">
          <div class="form-section-title">登录账号（员工端/后台登录用）</div>
          <el-form-item label="登录账号" required><el-input v-model="form.username" placeholder="如 coach04" /></el-form-item>
          <el-form-item label="初始密码"><el-input v-model="form.password" placeholder="默认 admin123" /></el-form-item>
          <el-form-item label="手机号"><el-input v-model="form.phone" maxlength="11" /></el-form-item>
          <div class="form-section-title">教练档案（会员端展示）</div>
        </template>
        <el-form-item label="姓名" required><el-input v-model="form.realname" /></el-form-item>
        <el-form-item label="昵称"><el-input v-model="form.nickname" /></el-form-item>
        <el-form-item label="课时单价">
          <el-input-number v-model="form.lesson_price" :min="0" :precision="2" controls-position="right" style="width:160px" />
          <span style="margin-left:6px">元/节</span>
        </el-form-item>
        <div class="text-muted" style="margin:-8px 0 12px 90px;font-size:12px">仅用于内部核算与业绩统计，不展示给会员</div>
        <el-form-item label="头像">
          <el-upload :show-file-list="false" accept="image/*" :before-upload="f => upImg(f, 'avatar')">
            <el-button :loading="uploading==='avatar'">{{ form.avatar ? '更换头像' : '上传头像' }}</el-button>
          </el-upload>
          <img v-if="form.avatar" :src="form.avatar" style="width:52px;height:52px;border-radius:50%;object-fit:cover;margin-left:12px;vertical-align:middle" />
        </el-form-item>
        <el-form-item label="主页背景">
          <el-upload :show-file-list="false" accept="image/*" :before-upload="f => upImg(f, 'cover')">
            <el-button :loading="uploading==='cover'">{{ form.cover ? '更换背景' : '上传背景' }}</el-button>
          </el-upload>
          <img v-if="form.cover" :src="form.cover" style="width:120px;height:52px;border-radius:6px;object-fit:cover;margin-left:12px;vertical-align:middle" />
          <div class="text-muted" style="font-size:12px">教练也可以在员工端「我的主页」自行上传</div>
        </el-form-item>
        <el-form-item label="擅长"><el-input v-model="form.good_at" placeholder="如：增肌塑形 · 体态矫正" /></el-form-item>
        <el-form-item label="简介"><el-input v-model="form.desc" type="textarea" :rows="2" /></el-form-item>
        <el-form-item label="详细介绍"><el-input v-model="form.detail" type="textarea" :rows="5" placeholder="认证资质 / 执教经历 / 教学风格等" /></el-form-item>
        <el-form-item label="排序"><el-input-number v-model="form.sort" :min="0" style="width:160px" /></el-form-item>
        <el-form-item label="在职状态" v-if="form.id"><el-switch v-model="form.status" :active-value="1" :inactive-value="0" active-text="在职" inactive-text="离职" /></el-form-item>
      </el-form>
      <template #footer>
        <el-button @click="drawer=false">取消</el-button>
        <el-button type="primary" :loading="saving" @click="save">{{ form.id ? '保存' : '创建教练' }}</el-button>
      </template>
    </el-drawer>
  </div>`,
  methods: {
    async load() {
      this.loading = true;
      try { this.list = await api.get('/coaches'); }
      finally { this.loading = false; }
    },
    openEdit(row) {
      this.form = JSON.parse(JSON.stringify(row));
      // v2: 编辑必须回传 lesson_price，否则会被清零
      this.form.lesson_price = Number(this.form.lesson_price || 0);
      this.drawer = true;
    },
    openAdd() {
      this.form = { username: '', password: '', phone: '', realname: '', nickname: '', good_at: '', desc: '', detail: '', avatar: '', cover: '', lesson_price: 0, sort: (this.list.length + 1), status: 1 };
      this.drawer = true;
    },
    async upImg(file, field) {
      if (file.size > 5 * 1024 * 1024) { ElementPlus.ElMessage.warning('图片不能超过 5MB'); return false; }
      this.uploading = field;
      try {
        const fd = new FormData(); fd.append('file', file);
        const resp = await fetch('/api/upload', { method: 'POST', headers: { Authorization: 'Bearer ' + Auth.getToken() }, body: fd });
        const j = await resp.json();
        if (j.code !== 0) throw new Error(j.msg || '上传失败');
        this.form[field] = j.data.url;
        ElementPlus.ElMessage.success('已上传');
      } catch (e) { ElementPlus.ElMessage.error(e.message || '上传失败'); }
      finally { this.uploading = ''; }
      return false;
    },
    async save() {
      if (!this.form.realname) return ElementPlus.ElMessage.warning('请填写教练姓名');
      if (!this.form.id && !this.form.username) return ElementPlus.ElMessage.warning('请填写登录账号');
      this.saving = true;
      try {
        if (this.form.id) {
          await api.put('/coaches/' + this.form.id, this.form);
          ElementPlus.ElMessage.success('保存成功');
        } else {
          await api.post('/coaches', this.form);
          ElementPlus.ElMessageBox.alert(
            `教练「${this.form.realname}」已创建。\n登录账号：${this.form.username}\n初始密码：${this.form.password || 'admin123'}\n可用于登录员工端(H5)与管理后台。`,
            '创建成功', { type: 'success', confirmButtonText: '知道了' });
        }
        this.drawer = false;
        this.load();
      } finally { this.saving = false; }
    },
  },
  mounted() { this.load(); },
};

/* ============ 私教课程类型 ============ */
window.AppPages.PtCourses = {
  name: 'PtCoursesPage',
  data() {
    return {
      list: [], loading: false, coaches: [], ptCards: [],
      dlg: false, form: {}, saving: false,
      Fmt: window.Fmt, DICT: window.DICT,
    };
  },
  template: `
  <div>
    <div class="card-box">
      <div class="box-title">私教课程类型
        <el-button type="primary" size="default" @click="openAdd">新增私教课程</el-button>
      </div>
      <el-table border :data="list" v-loading="loading" stripe>
        <el-table-column prop="title" label="课程名称" min-width="140" />
        <el-table-column prop="duration" label="时长(分钟)" width="100" />
        <el-table-column label="授课教练" min-width="180">
          <template #default="{ row }">
            <span v-if="!parseIds(row.coach_ids).length" class="text-muted">全部教练</span>
            <el-tag v-for="id in parseIds(row.coach_ids)" :key="id" size="small" style="margin-right:4px">{{ coachName(id) }}</el-tag>
          </template>
        </el-table-column>
        <el-table-column label="适用私教卡" min-width="180">
          <template #default="{ row }">
            <span v-if="!parseIds(row.card_scope).length" class="text-muted">全部私教卡</span>
            <el-tag v-for="id in parseIds(row.card_scope)" :key="id" type="warning" size="small" style="margin-right:4px">{{ cardName(id) }}</el-tag>
          </template>
        </el-table-column>
        <el-table-column prop="sort" label="排序" width="60" />
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

    <el-dialog v-model="dlg" :title="form.id ? '编辑私教课程' : '新增私教课程'" width="560px" destroy-on-close>
      <el-form :model="form" label-width="100px">
        <el-form-item label="课程名称" required><el-input v-model="form.title" /></el-form-item>
        <el-form-item label="时长(分钟)"><el-input-number v-model="form.duration" :min="15" :step="15" style="width:160px" /></el-form-item>
        <el-form-item label="授课教练">
          <el-select v-model="form.coach_ids" multiple clearable style="width:100%" placeholder="不选 = 全部教练可授">
            <el-option v-for="c in coaches" :key="c.id" :value="c.id" :label="c.realname" />
          </el-select>
        </el-form-item>
        <el-form-item label="适用私教卡">
          <el-select v-model="form.card_scope" multiple clearable style="width:100%" placeholder="不选 = 全部私教卡可约">
            <el-option v-for="c in ptCards" :key="c.id" :value="c.id" :label="c.title" />
          </el-select>
        </el-form-item>
        <el-form-item label="简介"><el-input v-model="form.intro" type="textarea" :rows="2" /></el-form-item>
        <el-form-item label="排序"><el-input-number v-model="form.sort" :min="0" style="width:160px" /></el-form-item>
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
    coachName(id) { const c = this.coaches.find(x => x.id === id); return c ? c.realname : '#' + id; },
    cardName(id) { const c = this.ptCards.find(x => x.id === id); return c ? c.title : '#' + id; },
    async load() {
      this.loading = true;
      try { this.list = await api.get('/ptrain-courses'); }
      finally { this.loading = false; }
    },
    async loadDicts() {
      const [coaches, cards] = await Promise.all([api.get('/coaches'), api.get('/card-categories')]);
      this.coaches = coaches;
      this.ptCards = cards;
    },
    openAdd() {
      this.form = { title: '', duration: 60, coach_ids: [], card_scope: [], intro: '', sort: 0, status: 1 };
      this.dlg = true;
    },
    openEdit(row) {
      this.form = Object.assign(JSON.parse(JSON.stringify(row)), {
        coach_ids: this.parseIds(row.coach_ids), card_scope: this.parseIds(row.card_scope),
      });
      this.dlg = true;
    },
    async save() {
      if (!this.form.title) return ElementPlus.ElMessage.warning('请填写课程名称');
      this.saving = true;
      try {
        if (this.form.id) await api.put('/ptrain-courses/' + this.form.id, this.form);
        else await api.post('/ptrain-courses', this.form);
        ElementPlus.ElMessage.success('保存成功');
        this.dlg = false;
        this.load();
      } finally { this.saving = false; }
    },
  },
  mounted() { this.load(); this.loadDicts(); },
};

/* ============ 教练休息管理 ============ */
window.AppPages.CoachRests = {
  name: 'CoachRestsPage',
  data() {
    return {
      query: { coach_id: '', from: dayjs().format('YYYY-MM-DD'), to: dayjs().add(14, 'day').format('YYYY-MM-DD') },
      list: [], loading: false, coaches: [],
      dlg: false, form: {}, saving: false,
      Fmt: window.Fmt,
      isCoach: (Auth.getUser() || {}).role === 'coach',
    };
  },
  template: `
  <div>
    <div class="card-box">
      <div class="search-bar">
        <el-select v-if="!isCoach" v-model="query.coach_id" placeholder="全部教练" clearable style="width:130px">
          <el-option v-for="c in coaches" :key="c.id" :value="c.id" :label="c.realname" />
        </el-select>
        <el-date-picker v-model="query.from" type="date" value-format="YYYY-MM-DD" placeholder="开始日期" style="width:140px" />
        <span class="text-muted">至</span>
        <el-date-picker v-model="query.to" type="date" value-format="YYYY-MM-DD" placeholder="结束日期" style="width:140px" />
        <el-button type="primary" @click="load"><el-icon><Search /></el-icon>&nbsp;查询</el-button>
        <div style="flex:1"></div>
        <el-button type="primary" plain @click="openAdd">新增休息</el-button>
      </div>
      <el-table border :data="list" v-loading="loading" stripe>
        <el-table-column label="教练" width="120"><template #default="{ row }">{{ coachName(row.coach_id) }}</template></el-table-column>
        <el-table-column label="日期" width="120"><template #default="{ row }">{{ Fmt.date(row.rest_date) }}</template></el-table-column>
        <el-table-column label="时段" width="140">
          <template #default="{ row }">{{ row.from_time ? row.from_time + ' - ' + row.to_time : '全天休息' }}</template>
        </el-table-column>
        <el-table-column prop="remark" label="备注" min-width="160" show-overflow-tooltip />
        <el-table-column label="操作" width="80" fixed="right">
          <template #default="{ row }"><el-button link type="danger" size="small" @click="del(row)">删除</el-button></template>
        </el-table-column>
      </el-table>
    </div>

    <el-dialog v-model="dlg" title="新增休息" width="440px" destroy-on-close>
      <el-form :model="form" label-width="90px">
        <el-form-item label="教练" required v-if="!isCoach">
          <el-select v-model="form.coach_id" style="width:100%">
            <el-option v-for="c in coaches" :key="c.id" :value="c.id" :label="c.realname" />
          </el-select>
        </el-form-item>
        <el-form-item label="日期" required>
          <el-date-picker v-model="form.rest_date" type="date" value-format="YYYY-MM-DD" style="width:100%" />
        </el-form-item>
        <el-form-item label="休息方式">
          <el-radio-group v-model="form.allDay">
            <el-radio :value="true">全天</el-radio><el-radio :value="false">指定时段</el-radio>
          </el-radio-group>
        </el-form-item>
        <el-form-item label="时段" v-if="!form.allDay">
          <el-time-select v-model="form.from_time" start="08:00" end="21:00" step="00:30" placeholder="开始" style="width:120px" />
          <span style="margin:0 6px">-</span>
          <el-time-select v-model="form.to_time" start="08:00" end="21:00" step="00:30" placeholder="结束" style="width:120px" />
        </el-form-item>
        <el-form-item label="备注"><el-input v-model="form.remark" /></el-form-item>
      </el-form>
      <template #footer>
        <el-button @click="dlg=false">取消</el-button>
        <el-button type="primary" :loading="saving" @click="save">保存</el-button>
      </template>
    </el-dialog>
  </div>`,
  methods: {
    coachName(id) { const c = this.coaches.find(x => x.id === id); return c ? c.realname : '#' + id; },
    async load() {
      this.loading = true;
      try { this.list = await api.get('/coach-rests', this.query); }
      finally { this.loading = false; }
    },
    openAdd() {
      this.form = { coach_id: null, rest_date: dayjs().format('YYYY-MM-DD'), allDay: true, from_time: '', to_time: '', remark: '' };
      this.dlg = true;
    },
    async save() {
      if (!this.isCoach && !this.form.coach_id) return ElementPlus.ElMessage.warning('请选择教练');
      if (!this.form.rest_date) return ElementPlus.ElMessage.warning('请选择日期');
      if (!this.form.allDay && (!this.form.from_time || !this.form.to_time)) return ElementPlus.ElMessage.warning('请选择休息时段');
      this.saving = true;
      try {
        await api.post('/coach-rests', {
          coach_id: this.form.coach_id, rest_date: this.form.rest_date,
          from_time: this.form.allDay ? '' : this.form.from_time,
          to_time: this.form.allDay ? '' : this.form.to_time,
          remark: this.form.remark,
        });
        ElementPlus.ElMessage.success('已添加休息');
        this.dlg = false;
        this.load();
      } finally { this.saving = false; }
    },
    del(row) {
      ElementPlus.ElMessageBox.confirm('确定删除该休息记录？', '删除休息', { type: 'warning' })
        .then(async () => {
          await api.del('/coach-rests/' + row.id);
          ElementPlus.ElMessage.success('已删除');
          this.load();
        }).catch(() => {});
    },
  },
  async mounted() {
    this.coaches = await api.get('/coaches');
    this.load();
  },
};
