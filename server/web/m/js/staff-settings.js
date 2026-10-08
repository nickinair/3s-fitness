/* 员工端-系统设置: 门店信息 / 员工与角色 / 公告 / 首页Banner (对应 PC server/web/admin/js/pages/settings.js 的 SettingsClub / SettingsStaff / SettingsNotices / SettingsBanners) */

/* ============ 门店信息 ============ */
window.Pages.StaffSettingsClub = {
  data() {
    return { clubs: [], loading: false, showForm: false, form: {}, saving: false };
  },
  computed: {
    canEdit() { return ['admin', 'manager'].includes((Store.user || {}).role); },
  },
  template: [
    '<div class="page">',
    '  <m-nav title="门店信息"></m-nav>',
    '  <div class="sec-title">门店列表（{{ clubs.length }}）<span v-if="canEdit" class="more brand-text" @click="openAdd"><van-icon name="add-o"/> 新增门店</span></div>',
    '  <div v-if="loading" style="text-align:center;padding:50px 0"><van-loading color="#0d5e56">加载中...</van-loading></div>',
    '  <template v-else>',
    '    <van-empty v-if="!clubs.length" description="暂无门店"/>',
    '    <div v-for="c in clubs" :key="c.id" class="rec-item" @click="canEdit && openEdit(c)">',
    '      <div class="head"><span class="name">{{ c.name }}</span><van-icon v-if="canEdit" name="edit" color="#969799"/></div>',
    '      <div class="muted mt4">{{ c.address || \'未填写地址\' }}</div>',
    '      <div class="muted mt4">{{ c.phone || \'未填写电话\' }} · {{ c.open_time || \'未设置营业时间\' }}</div>',
    '      <div class="muted mt4" v-if="c.intro">{{ c.intro }}</div>',
    '    </div>',
    '  </template>',
    '  <van-popup v-model:show="showForm" position="bottom" round safe-area-inset-bottom>',
    '    <div class="pop-scroll">',
    '      <div class="pop-head">{{ form.id ? (\'编辑门店 - \' + (form.name || \'\')) : \'新增门店\' }}</div>',
    '      <van-field v-model="form.name" label="门店名称" placeholder="必填" required/>',
    '      <van-field v-model="form.address" label="地址" placeholder="选填"/>',
    '      <van-field v-model="form.phone" label="电话" placeholder="选填"/>',
    '      <van-field v-model="form.open_time" label="营业时间" placeholder="如 06:30-22:30"/>',
    '      <van-field v-model="form.sort" type="digit" label="排序" placeholder="数字小的排在前面"/>',
    '      <van-field v-model="form.intro" type="textarea" rows="3" label="门店简介" placeholder="选填" :border="false"/>',
    '      <div class="mt12"><van-button type="primary" block round :loading="saving" @click="save">保存</van-button></div>',
    '    </div>',
    '  </van-popup>',
    '</div>',
  ].join('\n'),
  methods: {
    async load() {
      this.loading = true;
      try { this.clubs = await API.get('/clubs'); }
      finally { this.loading = false; }
    },
    openEdit(row) { this.form = JSON.parse(JSON.stringify(row)); this.showForm = true; },
    openAdd() {
      this.form = { name: '', address: '', phone: '', open_time: '06:30-22:30', intro: '', sort: 0 };
      this.showForm = true;
    },
    async save() {
      if (!this.form.name) return vant.showToast('请填写门店名称');
      this.saving = true;
      try {
        if (this.form.id) {
          await API.put('/clubs/' + this.form.id, this.form);
          vant.showToast({ message: '保存成功', icon: 'success' });
        } else {
          await API.post('/clubs', this.form);
          vant.showToast({ message: '门店已创建', icon: 'success' });
        }
        this.showForm = false;
        this.load();
      } finally { this.saving = false; }
    },
  },
  mounted() { this.load(); },
};

/* ============ 员工与角色 ============ */
window.Pages.StaffSettingsStaff = {
  data() {
    return {
      list: [], clubs: [], loading: false,
      showForm: false, form: {}, saving: false,
      roleShow: false, clubShow: false,
      pwdShow: false, pwdRow: null, pwdValue: '123456', pwdSaving: false,
    };
  },
  computed: {
    canEdit() { return ['admin', 'manager'].includes((Store.user || {}).role); },
    roleCols() {
      const cols = [
        { text: '管理员', value: 'manager' },
        { text: '教练', value: 'coach' },
      ];
      // 历史账号沿用的细分权限, 仅在编辑这类账号时出现, 避免被改成别的权限
      const legacy = { membership: '管理员（原会籍）', reception: '管理员（原前台）', admin: '管理员（超级）' };
      if (legacy[this.form.role]) cols.push({ text: legacy[this.form.role], value: this.form.role });
      return cols;
    },
    clubCols() { return this.clubs.map(c => ({ text: c.name, value: c.id })); },
  },
  template: [
    '<div class="page">',
    '  <m-nav title="员工与角色"></m-nav>',
    '  <div class="sec-title">员工列表（{{ list.length }}）<span v-if="canEdit" class="more brand-text" @click="openAdd"><van-icon name="add-o"/> 新增员工</span></div>',
    '  <div v-if="loading" style="text-align:center;padding:50px 0"><van-loading color="#0d5e56">加载中...</van-loading></div>',
    '  <template v-else>',
    '    <van-empty v-if="!list.length" description="暂无员工"/>',
    '    <div v-for="s in list" :key="s.id" class="rec-item">',
    '      <div class="head">',
    '        <span class="name">{{ s.realname }} <span class="muted" style="font-weight:400">{{ s.username }}</span></span>',
    '        <d-tag dict="roleName" :v="s.role"></d-tag>',
    '      </div>',
    '      <div class="muted mt4">{{ s.phone || \'未填写手机号\' }} · {{ clubName(s.club_id) }}</div>',
    '      <div class="muted mt4">',
    '        <van-tag :type="s.status===1?\'success\':\'default\'" plain size="small">{{ s.status===1 ? \'在职\' : \'停用\' }}</van-tag>',
    '        <span style="margin-left:6px">{{ H.dateOf(s.insert_time) }} 创建</span>',
    '      </div>',
    '      <div class="foot" v-if="canEdit">',
    '        <van-button size="small" round plain @click="openEdit(s)">编辑</van-button>',
    '        <van-button size="small" round plain @click="openResetPwd(s)">重置密码</van-button>',
    '        <van-button size="small" round :type="s.status===1?\'danger\':\'primary\'" plain @click="toggle(s)">{{ s.status===1 ? \'停用\' : \'启用\' }}</van-button>',
    '      </div>',
    '    </div>',
    '  </template>',
    '  <van-popup v-model:show="showForm" position="bottom" round safe-area-inset-bottom>',
    '    <div class="pop-scroll">',
    '      <div class="pop-head">{{ form.id ? (\'编辑员工 - \' + (form.realname || \'\')) : \'新增员工\' }}</div>',
    '      <van-field v-model="form.username" label="账号" placeholder="必填" required :disabled="!!form.id"/>',
    '      <van-field v-if="!form.id" v-model="form.password" label="初始密码" placeholder="默认 123456"/>',
    '      <van-field v-model="form.realname" label="姓名" placeholder="必填" required/>',
    '      <van-field v-model="form.phone" type="tel" maxlength="11" label="手机号" placeholder="选填"/>',
    '      <van-field v-model="form.base_salary" type="number" label="固定工资" placeholder="元/月，选填"/>',
    '      <van-field v-model="form.sales_rate" type="number" label="销售提成%" placeholder="按本人业绩归属的开卡金额"/>',
    '      <van-field v-model="form.course_rate" type="number" label="课程提成%" placeholder="教练按私教消课金额"/>',
    '      <van-field :model-value="roleName(form.role)" label="角色" placeholder="必填" readonly is-link required @click="roleShow=true"/>',
    '      <van-field :model-value="clubName(form.club_id)" label="所属门店" placeholder="选填" readonly is-link @click="clubShow=true" :border="false"/>',
    '      <div class="mt12"><van-button type="primary" block round :loading="saving" @click="save">保存</van-button></div>',
    '    </div>',
    '  </van-popup>',
    '  <van-popup v-model:show="roleShow" position="bottom" round><van-picker :columns="roleCols" @confirm="onRole" @cancel="roleShow=false" confirm-button-text="确定"/></van-popup>',
    '  <van-popup v-model:show="clubShow" position="bottom" round><van-picker :columns="clubCols" @confirm="onClub" @cancel="clubShow=false" confirm-button-text="确定"/></van-popup>',
    '  <van-popup v-model:show="pwdShow" position="bottom" round safe-area-inset-bottom>',
    '    <div class="pop-scroll">',
    '      <div class="pop-head">重置密码 - {{ pwdRow && pwdRow.realname }}</div>',
    '      <van-field v-model="pwdValue" label="新密码" placeholder="默认 123456" :border="false"/>',
    '      <div class="mt12"><van-button type="primary" block round :loading="pwdSaving" @click="confirmReset">确认重置</van-button></div>',
    '    </div>',
    '  </van-popup>',
    '</div>',
  ].join('\n'),
  methods: {
    clubName(id) { const c = this.clubs.find(x => x.id === id); return c ? c.name : (id ? '#' + id : '全部门店'); },
    roleName(r) { return DICT.roleName[r] || r || ''; },
    async load() {
      this.loading = true;
      try { this.list = await API.get('/staff'); }
      finally { this.loading = false; }
    },
    openAdd() {
      this.form = { username: '', password: '', realname: '', phone: '', role: 'reception', club_id: this.clubs.length ? this.clubs[0].id : 0, base_salary: 0, sales_rate: 0, course_rate: 0 };
      this.showForm = true;
    },
    openEdit(row) { this.form = JSON.parse(JSON.stringify(row)); this.showForm = true; },
    onRole(v) { this.form.role = v.selectedOptions[0].value; this.roleShow = false; },
    onClub(v) { this.form.club_id = v.selectedOptions[0].value; this.clubShow = false; },
    async save() {
      if (!this.form.username || !this.form.realname || !this.form.role) return vant.showToast('请填写完整');
      this.saving = true;
      try {
        if (this.form.id) await API.put('/staff/' + this.form.id, this.form);
        else await API.post('/staff', this.form);
        vant.showToast({ message: '保存成功', icon: 'success' });
        this.showForm = false;
        this.load();
      } finally { this.saving = false; }
    },
    openResetPwd(row) { this.pwdRow = row; this.pwdValue = '123456'; this.pwdShow = true; },
    async confirmReset() {
      if (!this.pwdRow) return;
      this.pwdSaving = true;
      try {
        await API.post('/staff/' + this.pwdRow.id + '/reset-password', { password: this.pwdValue || '123456' });
        vant.showToast({ message: '密码已重置', icon: 'success' });
        this.pwdShow = false;
      } finally { this.pwdSaving = false; }
    },
    async toggle(row) {
      const status = row.status === 1 ? 0 : 1;
      try {
        await vant.showConfirmDialog({
          title: status ? '启用员工' : '停用员工',
          message: (status ? '启用' : '停用') + '员工「' + row.realname + '」？',
          confirmButtonColor: '#0d5e56',
        });
      } catch (e) { return; }
      await API.put('/staff/' + row.id, { realname: row.realname, phone: row.phone, role: row.role, club_id: row.club_id, status });
      vant.showToast({ message: '已' + (status ? '启用' : '停用'), icon: 'success' });
      this.load();
    },
  },
  async mounted() {
    try { this.clubs = await API.get('/clubs', { silent: true }); } catch (e) { /* ignore */ }
    this.load();
  },
};

/* ============ 公告 ============ */
window.Pages.StaffNotices = {
  data() {
    return { list: [], loading: false, showForm: false, form: { title: '', content: '' }, saving: false };
  },
  computed: {
    canEdit() { return ['admin', 'manager'].includes((Store.user || {}).role); },
  },
  template: [
    '<div class="page">',
    '  <m-nav title="公告"></m-nav>',
    '  <div class="sec-title">公告列表（{{ list.length }}）<span v-if="canEdit" class="more brand-text" @click="openAdd"><van-icon name="add-o"/> 发布公告</span></div>',
    '  <div v-if="loading" style="text-align:center;padding:50px 0"><van-loading color="#0d5e56">加载中...</van-loading></div>',
    '  <template v-else>',
    '    <van-empty v-if="!list.length" description="暂无公告"/>',
    '    <div v-for="n in list" :key="n.id" class="rec-item">',
    '      <div class="head">',
    '        <van-tag :type="n.scope===1?\'danger\':\'primary\'" plain size="small">{{ n.scope===1 ? \'平台公告\' : \'门店公告\' }}</van-tag>',
    '        <span class="muted">{{ H.full(n.insert_time) }}</span>',
    '      </div>',
    '      <div style="font-size:15px;font-weight:600;color:#1f2329;margin-top:8px">{{ n.title }}</div>',
    '      <div class="muted mt4" style="white-space:pre-wrap">{{ n.content }}</div>',
    '      <div class="foot" v-if="canEdit && n.scope===2">',
    '        <van-button size="small" round plain type="danger" @click="offline(n)">下线</van-button>',
    '      </div>',
    '    </div>',
    '  </template>',
    '  <van-popup v-model:show="showForm" position="bottom" round safe-area-inset-bottom>',
    '    <div class="pop-scroll">',
    '      <div class="pop-head">发布公告</div>',
    '      <van-field v-model="form.title" label="标题" placeholder="必填" required/>',
    '      <van-field v-model="form.content" type="textarea" rows="5" label="内容" placeholder="必填" required :border="false"/>',
    '      <div class="mt12"><van-button type="primary" block round :loading="saving" @click="save">发布</van-button></div>',
    '    </div>',
    '  </van-popup>',
    '</div>',
  ].join('\n'),
  methods: {
    async load() {
      this.loading = true;
      try { this.list = await API.get('/notices'); }
      finally { this.loading = false; }
    },
    openAdd() { this.form = { title: '', content: '' }; this.showForm = true; },
    async save() {
      if (!this.form.title || !this.form.content) return vant.showToast('请填写标题与内容');
      this.saving = true;
      try {
        await API.post('/notices', this.form);
        vant.showToast({ message: '已发布', icon: 'success' });
        this.showForm = false;
        this.load();
      } finally { this.saving = false; }
    },
    async offline(row) {
      try {
        await vant.showConfirmDialog({ title: '下线公告', message: '确定下线公告「' + row.title + '」？会员端将不再展示。', confirmButtonColor: '#0d5e56' });
      } catch (e) { return; }
      await API.del('/notices/' + row.id);
      vant.showToast({ message: '已下线', icon: 'success' });
      this.load();
    },
  },
  mounted() { this.load(); },
};

/* ============ 首页 Banner ============ */
window.Pages.StaffBanners = {
  data() {
    return { list: [], loading: false, showForm: false, form: {}, saving: false, fileList: [] };
  },
  computed: {
    canEdit() { return ['admin', 'manager'].includes((Store.user || {}).role); },
  },
  template: [
    '<div class="page">',
    '  <m-nav title="首页 Banner"></m-nav>',
    '  <div class="sec-title">Banner 列表（{{ list.length }}）<span v-if="canEdit" class="more brand-text" @click="openAdd"><van-icon name="add-o"/> 新增 Banner</span></div>',
    '  <div class="muted" style="margin:-4px 12px 10px">展示在会员端小程序首页轮播位；未上传图片时会员端以品牌渐变底展示标题文字</div>',
    '  <div v-if="loading" style="text-align:center;padding:50px 0"><van-loading color="#0d5e56">加载中...</van-loading></div>',
    '  <template v-else>',
    '    <van-empty v-if="!list.length" description="暂无 Banner"/>',
    '    <div v-for="b in list" :key="b.id" class="rec-item">',
    '      <div class="flex">',
    '        <img v-if="b.image && b.image.indexOf(\'/uploads\')===0" :src="b.image" style="width:96px;height:40px;object-fit:cover;border-radius:8px;flex-shrink:0"/>',
    '        <div v-else class="banner-g0" style="width:96px;height:40px;border-radius:8px;flex-shrink:0;display:flex;align-items:center;justify-content:center;color:#fff;font-size:11px;text-align:center;padding:0 4px">{{ b.title || \'渐变底\' }}</div>',
    '        <div class="flex1" style="margin-left:12px;min-width:0">',
    '          <div class="name" style="font-size:14px">{{ b.title || \'（无标题）\' }}</div>',
    '          <div class="muted mt4">排序 {{ b.sort }}</div>',
    '        </div>',
    '        <van-switch v-if="canEdit" :model-value="b.status===1" size="20" @update:model-value="v => toggleStatus(b,v)"/>',
    '        <van-tag v-else :type="b.status===1?\'success\':\'default\'" plain size="small">{{ b.status===1?\'展示中\':\'已隐藏\' }}</van-tag>',
    '      </div>',
    '      <div class="foot" v-if="canEdit">',
    '        <van-button size="small" round plain @click="openEdit(b)">编辑</van-button>',
    '        <van-button size="small" round plain type="danger" @click="del(b)">删除</van-button>',
    '      </div>',
    '    </div>',
    '  </template>',
    '  <van-popup v-model:show="showForm" position="bottom" round safe-area-inset-bottom>',
    '    <div class="pop-scroll">',
    '      <div class="pop-head">{{ form.id ? \'编辑 Banner\' : \'新增 Banner\' }}</div>',
    '      <van-field v-model="form.title" label="标题" placeholder="如：年卡限时6.8折"/>',
    '      <van-field label="图片" :border="false">',
    '        <template #input><van-uploader v-model="fileList" :max-count="1" :after-read="afterRead" @delete="onDeleteImg" accept="image/*"/></template>',
    '      </van-field>',
    '      <div class="muted" style="margin:-6px 16px 10px">建议 1080×360，≤5MB；可不传（用渐变底+标题）</div>',
    '      <van-field label="排序" :border="false"><template #input><van-stepper v-model="form.sort" min="0" integer button-size="24"/></template></van-field>',
    '      <div class="mt12"><van-button type="primary" block round :loading="saving" @click="save">保存</van-button></div>',
    '    </div>',
    '  </van-popup>',
    '</div>',
  ].join('\n'),
  methods: {
    async load() {
      this.loading = true;
      try { this.list = await API.get('/banners'); }
      finally { this.loading = false; }
    },
    openAdd() {
      this.form = { title: '', image: '', link: '', sort: this.list.length + 1, status: 1 };
      this.fileList = [];
      this.showForm = true;
    },
    openEdit(row) {
      this.form = JSON.parse(JSON.stringify(row));
      this.fileList = (row.image && row.image.indexOf('/uploads') === 0) ? [{ url: row.image, isImage: true }] : [];
      this.showForm = true;
    },
    async afterRead(fileObj) {
      const file = Array.isArray(fileObj) ? fileObj[0] : fileObj;
      file.status = 'uploading';
      file.message = '上传中...';
      try {
        const fd = new FormData();
        fd.append('file', file.file);
        const resp = await fetch('/api/upload', { method: 'POST', headers: { Authorization: 'Bearer ' + Store.token }, body: fd });
        const j = await resp.json();
        if (j.code !== 0) throw new Error(j.msg || '上传失败');
        this.form.image = j.data.url;
        file.url = j.data.url;
        file.status = 'done';
        file.message = '';
      } catch (e) {
        file.status = 'failed';
        file.message = '上传失败';
        vant.showToast(e.message || '上传失败');
      }
    },
    onDeleteImg() { this.form.image = ''; },
    async save() {
      if (!this.form.title && !this.form.image) return vant.showToast('请填写标题或上传图片');
      this.saving = true;
      try {
        if (this.form.id) await API.put('/banners/' + this.form.id, this.form);
        else await API.post('/banners', this.form);
        vant.showToast({ message: '已保存', icon: 'success' });
        this.showForm = false;
        this.load();
      } finally { this.saving = false; }
    },
    async toggleStatus(row, v) {
      await API.put('/banners/' + row.id, Object.assign({}, row, { status: v ? 1 : 0 }));
      this.load();
    },
    async del(row) {
      try {
        await vant.showConfirmDialog({ title: '删除 Banner', message: '确定删除该 Banner？', confirmButtonColor: '#0d5e56' });
      } catch (e) { return; }
      await API.del('/banners/' + row.id);
      vant.showToast({ message: '已删除', icon: 'success' });
      this.load();
    },
  },
  mounted() { this.load(); },
};

/* ============================================================
 * 本文件定义的页面 / 建议路由 (需由 m/js/app.js 统一接入路由表):
 *   window.Pages.StaffSettingsClub  -> /staff/settings-club   门店信息(列表+新增+编辑)
 *   window.Pages.StaffSettingsStaff -> /staff/settings-staff  员工与角色(列表+新增/编辑/停用启用+重置密码)
 *   window.Pages.StaffNotices       -> /staff/notices         公告(列表+发布+下线)
 *   window.Pages.StaffBanners       -> /staff/banners         首页Banner(列表+新增/编辑/删除/上下架, 图片经 /upload 接口)
 * ============================================================ */
