/* 系统设置：门店信息 / 员工管理 / 来源渠道 / 公告 / 操作日志 */

window.AppPages.SettingsClub = {
  name: 'SettingsClubPage',
  data() {
    return { clubs: [], loading: false, dlg: false, form: {}, saving: false };
  },
  template: `
  <div>
    <div class="card-box">
      <div class="box-title">门店信息
        <el-button type="primary" @click="openAdd">新增门店</el-button>
      </div>
      <el-table border :data="clubs" v-loading="loading" stripe>
        <el-table-column prop="id" label="ID" width="60" />
        <el-table-column prop="name" label="门店名称" min-width="150" />
        <el-table-column prop="address" label="地址" min-width="200" show-overflow-tooltip />
        <el-table-column prop="phone" label="电话" width="130" />
        <el-table-column prop="open_time" label="营业时间" width="140" />
        <el-table-column prop="sort" label="排序" width="70" />
        <el-table-column label="操作" width="80" fixed="right">
          <template #default="{ row }"><el-button link type="primary" size="small" @click="openEdit(row)">编辑</el-button></template>
        </el-table-column>
      </el-table>
    </div>
    <el-dialog v-model="dlg" :title="form.id ? ('编辑门店 - ' + (form.name || '')) : '新增门店'" width="520px" destroy-on-close>
      <el-form :model="form" label-width="90px">
        <el-form-item label="门店名称" required><el-input v-model="form.name" /></el-form-item>
        <el-form-item label="地址"><el-input v-model="form.address" /></el-form-item>
        <el-form-item label="电话"><el-input v-model="form.phone" /></el-form-item>
        <el-form-item label="营业时间"><el-input v-model="form.open_time" placeholder="如 06:30-22:30" /></el-form-item>
        <el-form-item label="排序"><el-input-number v-model="form.sort" :min="0" :max="999" /><span class="muted" style="margin-left:8px">数字小的排在前面，会员约课时默认选中第一个</span></el-form-item>
        <el-form-item label="门店简介"><el-input v-model="form.intro" type="textarea" :rows="3" /></el-form-item>
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
      try { this.clubs = await api.get('/clubs'); }
      finally { this.loading = false; }
    },
    openEdit(row) { this.form = JSON.parse(JSON.stringify(row)); this.dlg = true; },
    openAdd() {
      this.form = { name: '', address: '', phone: '', open_time: '06:30-22:30', intro: '', sort: 0 };
      this.dlg = true;
    },
    async save() {
      if (!this.form.name) return ElementPlus.ElMessage.warning('请填写门店名称');
      this.saving = true;
      try {
        if (this.form.id) {
          await api.put('/clubs/' + this.form.id, this.form);
          ElementPlus.ElMessage.success('保存成功');
        } else {
          await api.post('/clubs', this.form);
          ElementPlus.ElMessage.success('门店已创建，可在「员工与角色」为其配置店长与员工');
        }
        this.dlg = false;
        this.load();
      } finally { this.saving = false; }
    },
  },
  mounted() { this.load(); },
};

/* ============ 员工与角色 ============ */
window.AppPages.SettingsStaff = {
  name: 'SettingsStaffPage',
  data() {
    return {
      list: [], clubs: [], loading: false,
      dlg: false, form: {}, saving: false,
      Fmt: window.Fmt, DICT: window.DICT,
    };
  },
  template: `
  <div>
    <div class="card-box">
      <div class="box-title">员工与角色
        <el-button type="primary" size="default" @click="openAdd">新增员工</el-button>
      </div>
      <el-table border :data="list" v-loading="loading" stripe>
        <el-table-column prop="username" label="账号" width="130" />
        <el-table-column prop="realname" label="姓名" width="130" />
        <el-table-column label="角色" width="110"><template #default="{ row }"><dict-tag dict="role" :value="row.role" /></template></el-table-column>
        <el-table-column prop="phone" label="手机号" width="130" />
        <el-table-column label="所属门店" min-width="140"><template #default="{ row }">{{ clubName(row.club_id) }}</template></el-table-column>
        <el-table-column label="状态" width="80">
          <template #default="{ row }">
            <el-tag :type="row.status === 1 ? 'success' : 'info'" size="small">{{ row.status === 1 ? '在职' : '停用' }}</el-tag>
          </template>
        </el-table-column>
        <el-table-column label="创建时间" width="120"><template #default="{ row }">{{ Fmt.date(row.insert_time) }}</template></el-table-column>
        <el-table-column label="操作" width="200" fixed="right">
          <template #default="{ row }">
            <el-button link type="primary" size="small" @click="openEdit(row)">编辑</el-button>
            <el-button link type="warning" size="small" @click="resetPwd(row)">重置密码</el-button>
            <el-button v-if="row.status === 1" link type="danger" size="small" @click="toggle(row, 0)">停用</el-button>
            <el-button v-else link type="success" size="small" @click="toggle(row, 1)">启用</el-button>
          </template>
        </el-table-column>
      </el-table>
    </div>

    <el-dialog v-model="dlg" :title="form.id ? '编辑员工 - ' + form.realname : '新增员工'" width="480px" destroy-on-close>
      <el-form :model="form" label-width="90px">
        <el-form-item label="账号" required><el-input v-model="form.username" :disabled="!!form.id" /></el-form-item>
        <el-form-item label="初始密码" v-if="!form.id"><el-input v-model="form.password" placeholder="默认 123456" /></el-form-item>
        <el-form-item label="姓名" required><el-input v-model="form.realname" /></el-form-item>
        <el-form-item label="手机号"><el-input v-model="form.phone" maxlength="11" /></el-form-item>
        <el-form-item label="角色" required>
          <el-select v-model="form.role" style="width:100%">
            <el-option value="manager" label="管理员" />
            <el-option value="coach" label="教练" />
            <!-- 历史账号沿用的细分权限, 仅在编辑这类账号时出现, 避免被改成别的权限 -->
            <el-option v-if="form.role==='membership'" value="membership" label="管理员（原会籍）" />
            <el-option v-if="form.role==='reception'" value="reception" label="管理员（原前台）" />
            <el-option v-if="form.role==='admin'" value="admin" label="管理员（超级）" />
          </el-select>
        </el-form-item>
        <el-form-item label="固定工资">
          <el-input-number v-model="form.base_salary" :min="0" :precision="2" controls-position="right" style="width:160px" /><span style="margin-left:6px">元/月</span>
        </el-form-item>
        <el-form-item label="销售提成">
          <el-input-number v-model="form.sales_rate" :min="0" :max="100" :precision="2" controls-position="right" style="width:160px" /><span style="margin-left:6px">%（按本人业绩归属的开卡金额）</span>
        </el-form-item>
        <el-form-item label="课程提成">
          <el-input-number v-model="form.course_rate" :min="0" :max="100" :precision="2" controls-position="right" style="width:160px" /><span style="margin-left:6px">%（教练按私教消课金额）</span>
        </el-form-item>
        <div class="text-muted" style="margin:-8px 0 12px 90px;font-size:12px">以上三项用于「我的业绩」页面计算收入，不影响其他统计</div>
        <el-form-item label="所属门店">
          <el-select v-model="form.club_id" style="width:100%">
            <el-option v-for="c in clubs" :key="c.id" :value="c.id" :label="c.name" />
          </el-select>
        </el-form-item>
      </el-form>
      <template #footer>
        <el-button @click="dlg=false">取消</el-button>
        <el-button type="primary" :loading="saving" @click="save">保存</el-button>
      </template>
    </el-dialog>
  </div>`,
  methods: {
    clubName(id) { const c = this.clubs.find(x => x.id === id); return c ? c.name : (id ? '#' + id : '全部门店'); },
    async load() {
      this.loading = true;
      try { this.list = await api.get('/staff'); }
      finally { this.loading = false; }
    },
    openAdd() { this.form = { username: '', password: '', realname: '', phone: '', role: 'reception', club_id: this.clubs.length ? this.clubs[0].id : 1 , base_salary: 0, sales_rate: 0, course_rate: 0 }; this.dlg = true; },
    openEdit(row) { this.form = JSON.parse(JSON.stringify(row)); this.dlg = true; },
    async save() {
      if (!this.form.username || !this.form.realname || !this.form.role) return ElementPlus.ElMessage.warning('请填写完整');
      this.saving = true;
      try {
        if (this.form.id) await api.put('/staff/' + this.form.id, this.form);
        else await api.post('/staff', this.form);
        ElementPlus.ElMessage.success('保存成功');
        this.dlg = false;
        this.load();
      } finally { this.saving = false; }
    },
    resetPwd(row) {
      ElementPlus.ElMessageBox.prompt('为「' + row.realname + '」设置新密码：', '重置密码', {
        inputValue: '123456', confirmButtonText: '确认重置', cancelButtonText: '取消',
      }).then(async ({ value }) => {
        await api.post('/staff/' + row.id + '/reset-password', { password: value || '123456' });
        ElementPlus.ElMessage.success('密码已重置');
      }).catch(() => {});
    },
    toggle(row, status) {
      ElementPlus.ElMessageBox.confirm((status ? '启用' : '停用') + '员工「' + row.realname + '」？', status ? '启用员工' : '停用员工', { type: 'warning' })
        .then(async () => {
          await api.put('/staff/' + row.id, { realname: row.realname, phone: row.phone, role: row.role, club_id: row.club_id, status });
          ElementPlus.ElMessage.success('已' + (status ? '启用' : '停用'));
          this.load();
        }).catch(() => {});
    },
  },
  async mounted() {
    this.clubs = await api.get('/clubs');
    this.load();
  },
};

/* ============ 来源渠道 ============ */
window.AppPages.SettingsSources = {
  name: 'SettingsSourcesPage',
  data() {
    return { list: [], loading: false, form: { title: '', sort: 0 }, saving: false };
  },
  template: `
  <div>
    <div class="card-box" style="max-width:640px">
      <div class="box-title">来源渠道管理</div>
      <el-form inline style="margin-bottom:8px">
        <el-form-item label="渠道名称"><el-input v-model="form.title" placeholder="如：抖音团购" style="width:180px" /></el-form-item>
        <el-form-item label="排序"><el-input-number v-model="form.sort" :min="0" style="width:110px" /></el-form-item>
        <el-form-item><el-button type="primary" :loading="saving" @click="add">新增渠道</el-button></el-form-item>
      </el-form>
      <el-table border :data="list" v-loading="loading" stripe>
        <el-table-column prop="id" label="ID" width="70" />
        <el-table-column prop="title" label="渠道名称" min-width="160" />
        <el-table-column prop="sort" label="排序" width="80" />
        <el-table-column label="操作" width="120">
          <template #default="{ row }">
            <el-button link type="primary" size="small" @click="edit(row)">编辑</el-button>
            <el-button link type="danger" size="small" @click="del(row)">删除</el-button>
          </template>
        </el-table-column>
      </el-table>
    </div>
  </div>`,
  methods: {
    async load() {
      this.loading = true;
      try { this.list = await api.get('/sources'); }
      finally { this.loading = false; }
    },
    async add() {
      if (!this.form.title) return ElementPlus.ElMessage.warning('请填写渠道名称');
      this.saving = true;
      try {
        await api.post('/sources', this.form);
        ElementPlus.ElMessage.success('已新增');
        this.form = { title: '', sort: 0 };
        this.load();
      } finally { this.saving = false; }
    },
    edit(row) {
      ElementPlus.ElMessageBox.prompt('修改渠道名称', '编辑渠道', { inputValue: row.title, confirmButtonText: '保存' })
        .then(async ({ value }) => {
          if (!value) return;
          await api.put('/sources/' + row.id, { title: value, sort: row.sort });
          ElementPlus.ElMessage.success('已保存');
          this.load();
        }).catch(() => {});
    },
    del(row) {
      ElementPlus.ElMessageBox.confirm('确定删除渠道「' + row.title + '」？', '删除渠道', { type: 'warning' })
        .then(async () => {
          await api.del('/sources/' + row.id);
          ElementPlus.ElMessage.success('已删除');
          this.load();
        }).catch(() => {});
    },
  },
  mounted() { this.load(); },
};

/* ============ 公告 ============ */
window.AppPages.SettingsNotices = {
  name: 'SettingsNoticesPage',
  data() {
    return {
      list: [], loading: false,
      dlg: false, form: { title: '', content: '' }, saving: false,
      Fmt: window.Fmt,
    };
  },
  template: `
  <div>
    <div class="card-box">
      <div class="box-title">公告
        <el-button type="primary" size="default" @click="dlg = true; form = { title: '', content: '' }">发布公告</el-button>
      </div>
      <el-table border :data="list" v-loading="loading" stripe>
        <el-table-column label="范围" width="90">
          <template #default="{ row }">
            <el-tag :type="row.scope === 1 ? 'danger' : 'primary'" size="small">{{ row.scope === 1 ? '平台公告' : '门店公告' }}</el-tag>
          </template>
        </el-table-column>
        <el-table-column prop="title" label="标题" min-width="180" />
        <el-table-column prop="content" label="内容" min-width="280" show-overflow-tooltip />
        <el-table-column label="发布时间" width="150"><template #default="{ row }">{{ Fmt.time(row.insert_time) }}</template></el-table-column>
        <el-table-column label="操作" width="80">
          <template #default="{ row }">
            <el-button v-if="row.scope === 2" link type="danger" size="small" @click="offline(row)">下线</el-button>
            <span v-else class="text-muted">—</span>
          </template>
        </el-table-column>
      </el-table>
    </div>
    <el-dialog v-model="dlg" title="发布公告" width="520px" destroy-on-close>
      <el-form :model="form" label-width="70px">
        <el-form-item label="标题" required><el-input v-model="form.title" /></el-form-item>
        <el-form-item label="内容" required><el-input v-model="form.content" type="textarea" :rows="5" /></el-form-item>
      </el-form>
      <template #footer>
        <el-button @click="dlg=false">取消</el-button>
        <el-button type="primary" :loading="saving" @click="save">发布</el-button>
      </template>
    </el-dialog>
  </div>`,
  methods: {
    async load() {
      this.loading = true;
      try { this.list = await api.get('/notices'); }
      finally { this.loading = false; }
    },
    async save() {
      if (!this.form.title || !this.form.content) return ElementPlus.ElMessage.warning('请填写标题与内容');
      this.saving = true;
      try {
        await api.post('/notices', this.form);
        ElementPlus.ElMessage.success('已发布');
        this.dlg = false;
        this.load();
      } finally { this.saving = false; }
    },
    offline(row) {
      ElementPlus.ElMessageBox.confirm('确定下线公告「' + row.title + '」？会员端将不再展示。', '下线公告', { type: 'warning' })
        .then(async () => {
          await api.del('/notices/' + row.id);
          ElementPlus.ElMessage.success('已下线');
          this.load();
        }).catch(() => {});
    },
  },
  mounted() { this.load(); },
};

/* ============ 首页 Banner 管理 ============ */
window.AppPages.SettingsBanners = {
  name: 'SettingsBannersPage',
  data() {
    return {
      list: [], loading: false,
      dlg: false, form: {}, saving: false, uploading: false,
    };
  },
  template: `
  <div>
    <div class="card-box">
      <div class="box-title">会员端首页 Banner
        <el-button type="primary" @click="openAdd">新增 Banner</el-button>
      </div>
      <div class="text-muted" style="margin:-6px 0 12px;font-size:12px">展示在会员端小程序首页轮播位。标题文字会叠加在图片上显示，图片本身不带文字，所以改标题不用换图。未设置图片时以品牌渐变底展示标题</div>
      <el-table border :data="list" v-loading="loading" stripe>
        <el-table-column label="图片" width="175">
          <template #default="{ row }">
            <img v-if="row.image" :src="row.image" style="width:150px;height:60px;object-fit:cover;border-radius:6px;background:#0c1c1a" />
            <div v-else style="width:128px;height:48px;border-radius:6px;background:linear-gradient(120deg,#f2994a,#f2c94c);color:#fff;display:flex;align-items:center;justify-content:center;font-size:12px">{{ row.title || '渐变底' }}</div>
          </template>
        </el-table-column>
        <el-table-column prop="title" label="标题" min-width="160" />
        <el-table-column prop="sort" label="排序" width="70" />
        <el-table-column label="状态" width="90">
          <template #default="{ row }">
            <el-switch :model-value="row.status === 1" @change="v => toggle(row, v)" />
          </template>
        </el-table-column>
        <el-table-column label="操作" width="120" fixed="right">
          <template #default="{ row }">
            <el-button link type="primary" size="small" @click="openEdit(row)">编辑</el-button>
            <el-button link type="danger" size="small" @click="del(row)">删除</el-button>
          </template>
        </el-table-column>
      </el-table>
    </div>
    <el-dialog v-model="dlg" :title="form.id ? '编辑 Banner' : '新增 Banner'" width="480px" destroy-on-close>
      <el-form :model="form" label-width="80px">
        <el-form-item label="标题"><el-input v-model="form.title" placeholder="如：年卡限时6.8折" /></el-form-item>
        <el-form-item label="图片">
          <div style="width:100%">
            <img v-if="form.image" :src="form.image" style="width:100%;max-height:120px;object-fit:cover;border-radius:8px;margin-bottom:8px" />
            <el-upload :show-file-list="false" :http-request="doUpload" accept="image/*">
              <el-button :loading="uploading">{{ form.image ? '更换图片' : '上传图片' }}</el-button>
              <span class="text-muted" style="margin-left:8px;font-size:12px">建议 1080×360，≤5MB；可不传（用渐变底+标题）</span>
            </el-upload>
          </div>
        </el-form-item>
        <el-form-item label="排序"><el-input-number v-model="form.sort" :min="0" style="width:140px" /></el-form-item>
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
      try { this.list = await api.get('/banners'); }
      finally { this.loading = false; }
    },
    openAdd() { this.form = { title: '', image: '', link: '', sort: (this.list.length + 1), status: 1 }; this.dlg = true; },
    openEdit(row) { this.form = JSON.parse(JSON.stringify(row)); this.dlg = true; },
    async doUpload(opt) {
      this.uploading = true;
      try {
        const fd = new FormData();
        fd.append('file', opt.file);
        const resp = await fetch('/api/upload', { method: 'POST', headers: { Authorization: 'Bearer ' + Auth.getToken() }, body: fd });
        const j = await resp.json();
        if (j.code !== 0) throw new Error(j.msg);
        this.form.image = j.data.url;
        ElementPlus.ElMessage.success('图片已上传');
      } catch (e) { ElementPlus.ElMessage.error(e.message || '上传失败'); }
      finally { this.uploading = false; }
    },
    async save() {
      if (!this.form.title && !this.form.image) return ElementPlus.ElMessage.warning('请填写标题或上传图片');
      this.saving = true;
      try {
        if (this.form.id) await api.put('/banners/' + this.form.id, this.form);
        else await api.post('/banners', this.form);
        ElementPlus.ElMessage.success('已保存');
        this.dlg = false;
        this.load();
      } finally { this.saving = false; }
    },
    async toggle(row, v) {
      await api.put('/banners/' + row.id, Object.assign({}, row, { status: v ? 1 : 0 }));
      this.load();
    },
    del(row) {
      ElementPlus.ElMessageBox.confirm('确定删除该 Banner？', '删除', { type: 'warning' })
        .then(async () => { await api.del('/banners/' + row.id); ElementPlus.ElMessage.success('已删除'); this.load(); })
        .catch(() => {});
    },
  },
  mounted() { this.load(); },
};

/* ============ 操作日志 ============ */
window.AppPages.SettingsLogs = {
  name: 'SettingsLogsPage',
  data() {
    return { list: [], loading: false, Fmt: window.Fmt, DICT: window.DICT };
  },
  template: `
  <div>
    <div class="card-box">
      <div class="box-title">操作日志（近200条）</div>
      <el-table border :data="list" v-loading="loading" stripe size="small">
        <el-table-column label="时间" width="150"><template #default="{ row }">{{ Fmt.time(row.insert_time) }}</template></el-table-column>
        <el-table-column prop="username" label="操作人" width="120" />
        <el-table-column prop="action" label="操作" width="130" />
        <el-table-column prop="detail" label="详情" min-width="280" show-overflow-tooltip />
      </el-table>
    </div>
  </div>`,
  methods: {
    async load() {
      this.loading = true;
      try { this.list = await api.get('/logs'); }
      finally { this.loading = false; }
    },
  },
  mounted() { this.load(); },
};
