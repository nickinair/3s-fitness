/* 平台总后台 SPA */
(() => {
  const { createApp, ref, reactive, onMounted, nextTick } = Vue;
  const { createRouter, createWebHashHistory } = VueRouter;

  // ---------- 登录页 ----------
  const LoginPage = {
    template: `
      <div class="login-wrap">
        <div class="login-card">
          <div class="logo"><img src="/static/logo-black.png" alt="3S运动中心"><h1>平台总台</h1></div>
          <div class="sub">商户开通 · 经营总览 · 通知与监控</div>
          <el-form @keyup.enter="doLogin">
            <el-form-item><el-input v-model="form.username" placeholder="平台账号" size="large" /></el-form-item>
            <el-form-item><el-input v-model="form.password" type="password" show-password placeholder="密码" size="large" /></el-form-item>
            <el-button type="primary" size="large" style="width:100%" :loading="loading" @click="doLogin">登 录</el-button>
          </el-form>
        </div>
      </div>`,
    setup() {
      const form = reactive({ username: '', password: '' });
      const loading = ref(false);
      const doLogin = async () => {
        if (!form.username || !form.password) return ElementPlus.ElMessage.warning('请输入账号与密码');
        loading.value = true;
        try {
          const data = await api.post('/auth/login', form);
          if (data.user.role !== 'platform') { ElementPlus.ElMessage.error('该账号不是平台管理员，请前往商户后台登录'); return; }
          api.saveAuth(data.token, data.user);
          location.hash = '#/overview';
        } finally { loading.value = false; }
      };
      return { form, loading, doLogin };
    },
  };

  // ---------- 平台概览 ----------
  const OverviewPage = {
    template: `
      <div>
        <div class="stat-grid">
          <div class="stat-card"><div class="label">商户总数</div><div class="value">{{ s.merchants || 0 }}</div></div>
          <div class="stat-card"><div class="label">启用商户</div><div class="value">{{ s.active_merchants || 0 }}</div></div>
          <div class="stat-card"><div class="label">门店数</div><div class="value">{{ s.clubs || 0 }}</div></div>
          <div class="stat-card"><div class="label">会员总数</div><div class="value">{{ s.members || 0 }}</div></div>
          <div class="stat-card"><div class="label">员工数</div><div class="value">{{ s.staff || 0 }}</div></div>
          <div class="stat-card"><div class="label">本月平台流水</div><div class="value money">{{ fmtMoney(s.month_revenue) }}</div></div>
          <div class="stat-card"><div class="label">累计平台流水</div><div class="value money">{{ fmtMoney(s.total_revenue) }}</div></div>
        </div>
        <div class="card"><div class="card-title">近12月平台流水</div><div id="trendChart" class="chart"></div></div>
        <div class="card">
          <div class="card-title">商户经营概览（本月）</div>
          <el-table :data="byMerchant" stripe>
            <el-table-column prop="id" label="ID" width="70" />
            <el-table-column prop="name" label="商户名称" min-width="160" />
            <el-table-column prop="clubs" label="门店数" width="100" />
            <el-table-column prop="members" label="会员数" width="100" />
            <el-table-column label="本月流水" width="140"><template #default="{row}">{{ fmtMoney(row.month_revenue) }}</template></el-table-column>
          </el-table>
        </div>
      </div>`,
    setup() {
      const s = ref({}); const byMerchant = ref([]);
      onMounted(async () => {
        const data = await api.get('/platform/stats');
        s.value = data.stats; byMerchant.value = data.byMerchant;
        await nextTick();
        const chart = echarts.init(document.getElementById('trendChart'));
        chart.setOption({
          tooltip: { trigger: 'axis' },
          grid: { left: 60, right: 30, top: 30, bottom: 30 },
          xAxis: { type: 'category', data: data.trend.map(x => x.m) },
          yAxis: { type: 'value' },
          series: [{ type: 'line', smooth: true, data: data.trend.map(x => Number(x.money)), areaStyle: { opacity: .12 }, itemStyle: { color: getComputedStyle(document.documentElement).getPropertyValue('--brand').trim() } }],
        });
      });
      return { s, byMerchant, fmtMoney };
    },
  };

  // ---------- 商户管理 ----------
  const MerchantsPage = {
    template: `
      <div>
        <div class="card">
          <div class="toolbar">
            <div class="card-title" style="margin:0">商户列表</div>
            <el-button type="primary" @click="openCreate">+ 开通商户</el-button>
          </div>
          <el-table :data="list" stripe>
            <el-table-column type="expand">
              <template #default="{row}">
                <div style="padding:10px 40px">
                  <div style="display:flex;justify-content:space-between;align-items:center;margin-bottom:8px">
                    <b>门店列表</b>
                    <el-button size="small" @click="openAddClub(row)">+ 新增门店</el-button>
                  </div>
                  <el-table :data="row._clubs || []" size="small" border>
                    <el-table-column prop="id" label="ID" width="60" />
                    <el-table-column prop="name" label="门店名称" min-width="140" />
                    <el-table-column prop="address" label="地址" min-width="200" />
                    <el-table-column prop="phone" label="电话" width="130" />
                  </el-table>
                </div>
              </template>
            </el-table-column>
            <el-table-column prop="id" label="ID" width="60" />
            <el-table-column prop="name" label="商户名称" min-width="140" />
            <el-table-column prop="contact" label="联系人" width="90" />
            <el-table-column prop="phone" label="电话" width="120" />
            <el-table-column prop="admin_username" label="管理员账号" width="110" />
            <el-table-column prop="club_count" label="门店" width="70" />
            <el-table-column prop="member_count" label="会员" width="70" />
            <el-table-column label="服务到期" width="110"><template #default="{row}">{{ (row.expire_time||'').slice(0,10) || '—' }}</template></el-table-column>
            <el-table-column label="状态" width="90">
              <template #default="{row}">
                <el-switch :model-value="row.status===1" @change="v => toggle(row, v)" />
              </template>
            </el-table-column>
            <el-table-column label="操作" width="80">
              <template #default="{row}"><el-button link type="primary" @click="openEdit(row)">编辑</el-button></template>
            </el-table-column>
          </el-table>
        </div>

        <el-dialog v-model="createVisible" title="开通商户" width="520">
          <el-form label-width="110px">
            <el-form-item label="商户名称" required><el-input v-model="createForm.name" placeholder="如：星耀健身" /></el-form-item>
            <el-form-item label="联系人"><el-input v-model="createForm.contact" /></el-form-item>
            <el-form-item label="联系电话"><el-input v-model="createForm.phone" /></el-form-item>
            <el-form-item label="服务到期"><el-date-picker v-model="createForm.expire_time" type="date" value-format="YYYY-MM-DD 23:59:59" style="width:100%" /></el-form-item>
            <el-form-item label="首店名称"><el-input v-model="createForm.club_name" placeholder="默认：商户名·总店" /></el-form-item>
            <el-form-item label="首店地址"><el-input v-model="createForm.club_address" /></el-form-item>
            <el-form-item label="管理员账号" required><el-input v-model="createForm.admin_username" /></el-form-item>
            <el-form-item label="管理员密码"><el-input v-model="createForm.admin_password" placeholder="默认 admin123" /></el-form-item>
          </el-form>
          <template #footer>
            <el-button @click="createVisible=false">取消</el-button>
            <el-button type="primary" :loading="saving" @click="doCreate">开通</el-button>
          </template>
        </el-dialog>

        <el-dialog v-model="editVisible" title="编辑商户" width="480">
          <el-form label-width="100px">
            <el-form-item label="商户名称"><el-input v-model="editForm.name" /></el-form-item>
            <el-form-item label="联系人"><el-input v-model="editForm.contact" /></el-form-item>
            <el-form-item label="电话"><el-input v-model="editForm.phone" /></el-form-item>
            <el-form-item label="服务到期"><el-date-picker v-model="editForm.expire_time" type="date" value-format="YYYY-MM-DD 23:59:59" style="width:100%" /></el-form-item>
            <el-form-item label="备注"><el-input v-model="editForm.remark" type="textarea" /></el-form-item>
          </el-form>
          <template #footer>
            <el-button @click="editVisible=false">取消</el-button>
            <el-button type="primary" @click="doEdit">保存</el-button>
          </template>
        </el-dialog>

        <el-dialog v-model="clubVisible" title="新增门店" width="440">
          <el-form label-width="90px">
            <el-form-item label="门店名称" required><el-input v-model="clubForm.name" /></el-form-item>
            <el-form-item label="地址"><el-input v-model="clubForm.address" /></el-form-item>
            <el-form-item label="电话"><el-input v-model="clubForm.phone" /></el-form-item>
          </el-form>
          <template #footer>
            <el-button @click="clubVisible=false">取消</el-button>
            <el-button type="primary" @click="doAddClub">保存</el-button>
          </template>
        </el-dialog>
      </div>`,
    setup() {
      const list = ref([]);
      const createVisible = ref(false); const editVisible = ref(false); const clubVisible = ref(false);
      const saving = ref(false);
      const createForm = reactive({ name: '', contact: '', phone: '', expire_time: '', club_name: '', club_address: '', admin_username: '', admin_password: '' });
      const editForm = reactive({ id: 0, name: '', contact: '', phone: '', expire_time: '', status: 1, remark: '' });
      const clubForm = reactive({ merchant_id: 0, name: '', address: '', phone: '' });

      const load = async () => {
        list.value = await api.get('/platform/merchants');
        for (const m of list.value) m._clubs = await api.get(`/platform/merchants/${m.id}/clubs`);
      };
      const openCreate = () => { Object.keys(createForm).forEach(k => createForm[k] = ''); createVisible.value = true; };
      const doCreate = async () => {
        if (!createForm.name || !createForm.admin_username) return ElementPlus.ElMessage.warning('请填写商户名称与管理员账号');
        saving.value = true;
        try {
          await api.post('/platform/merchants', createForm);
          ElementPlus.ElMessage.success('商户已开通');
          createVisible.value = false; load();
        } finally { saving.value = false; }
      };
      const openEdit = (row) => { Object.assign(editForm, row); editVisible.value = true; };
      const doEdit = async () => {
        await api.put(`/platform/merchants/${editForm.id}`, editForm);
        ElementPlus.ElMessage.success('已保存'); editVisible.value = false; load();
      };
      const toggle = async (row, v) => {
        const label = v ? '启用' : '停用';
        try {
          await ElementPlus.ElMessageBox.confirm(`确认${label}商户「${row.name}」？停用后该商户所有账号无法登录。`, '提示', { type: 'warning' });
        } catch { return; }
        await api.put(`/platform/merchants/${row.id}`, { ...row, status: v ? 1 : 0 });
        ElementPlus.ElMessage.success(`已${label}`); load();
      };
      const openAddClub = (row) => { clubForm.merchant_id = row.id; clubForm.name = ''; clubForm.address = ''; clubForm.phone = ''; clubVisible.value = true; };
      const doAddClub = async () => {
        if (!clubForm.name) return ElementPlus.ElMessage.warning('请填写门店名称');
        await api.post(`/platform/merchants/${clubForm.merchant_id}/clubs`, clubForm);
        ElementPlus.ElMessage.success('门店已创建'); clubVisible.value = false; load();
      };
      onMounted(load);
      return { list, createVisible, editVisible, clubVisible, saving, createForm, editForm, clubForm,
        openCreate, doCreate, openEdit, doEdit, toggle, openAddClub, doAddClub };
    },
  };

  // ---------- 通知发布 ----------
  const NoticesPage = {
    template: `
      <div class="card">
        <div class="toolbar">
          <div class="card-title" style="margin:0">平台公告</div>
          <el-button type="primary" @click="visible=true">+ 发布公告</el-button>
        </div>
        <el-table :data="list" stripe>
          <el-table-column prop="id" label="ID" width="60" />
          <el-table-column prop="title" label="标题" min-width="180" />
          <el-table-column prop="content" label="内容" min-width="300" show-overflow-tooltip />
          <el-table-column label="接收商户" width="120"><template #default="{row}">{{ row.merchant_id ? ('商户#' + row.merchant_id) : '全部商户' }}</template></el-table-column>
          <el-table-column label="状态" width="80"><template #default="{row}"><el-tag :type="row.status===1?'success':'info'" size="small">{{ row.status===1?'展示中':'已下线' }}</el-tag></template></el-table-column>
          <el-table-column label="发布时间" width="150"><template #default="{row}">{{ fmtTime(row.insert_time) }}</template></el-table-column>
          <el-table-column label="操作" width="80">
            <template #default="{row}"><el-button v-if="row.status===1" link type="danger" @click="remove(row)">下线</el-button></template>
          </el-table-column>
        </el-table>

        <el-dialog v-model="visible" title="发布平台公告" width="520">
          <el-form label-width="90px">
            <el-form-item label="接收商户">
              <el-select v-model="form.merchant_id" style="width:100%">
                <el-option :value="0" label="全部商户" />
                <el-option v-for="m in merchants" :key="m.id" :value="m.id" :label="m.name" />
              </el-select>
            </el-form-item>
            <el-form-item label="标题" required><el-input v-model="form.title" /></el-form-item>
            <el-form-item label="内容" required><el-input v-model="form.content" type="textarea" :rows="5" /></el-form-item>
          </el-form>
          <template #footer>
            <el-button @click="visible=false">取消</el-button>
            <el-button type="primary" @click="publish">发布</el-button>
          </template>
        </el-dialog>
      </div>`,
    setup() {
      const list = ref([]); const merchants = ref([]); const visible = ref(false);
      const form = reactive({ merchant_id: 0, title: '', content: '' });
      const load = async () => { list.value = await api.get('/platform/notices'); };
      const publish = async () => {
        if (!form.title || !form.content) return ElementPlus.ElMessage.warning('请填写标题与内容');
        await api.post('/platform/notices', form);
        ElementPlus.ElMessage.success('已发布'); visible.value = false; form.title = ''; form.content = ''; load();
      };
      const remove = async (row) => {
        try { await ElementPlus.ElMessageBox.confirm(`确认下线公告「${row.title}」？`, '提示', { type: 'warning' }); } catch { return; }
        await api.del(`/platform/notices/${row.id}`); ElementPlus.ElMessage.success('已下线'); load();
      };
      onMounted(async () => { load(); merchants.value = await api.get('/platform/merchants'); });
      return { list, merchants, visible, form, publish, remove, fmtTime };
    },
  };

  // ---------- 日志监控 ----------
  const LogsPage = {
    template: `
      <div class="card">
        <div class="toolbar">
          <div class="card-title" style="margin:0">操作日志监控</div>
          <el-select v-model="merchantId" clearable placeholder="全部商户" style="width:200px" @change="load">
            <el-option v-for="m in merchants" :key="m.id" :value="m.id" :label="m.name" />
          </el-select>
        </div>
        <el-table :data="list" stripe size="small">
          <el-table-column prop="id" label="ID" width="70" />
          <el-table-column prop="merchant_name" label="商户" width="110"><template #default="{row}">{{ row.merchant_name || '平台' }}</template></el-table-column>
          <el-table-column prop="username" label="操作人" width="110" />
          <el-table-column prop="action" label="动作" width="130" />
          <el-table-column prop="detail" label="详情" min-width="300" show-overflow-tooltip />
          <el-table-column label="时间" width="150"><template #default="{row}">{{ fmtTime(row.insert_time) }}</template></el-table-column>
        </el-table>
      </div>`,
    setup() {
      const list = ref([]); const merchants = ref([]); const merchantId = ref(null);
      const load = async () => { list.value = await api.get('/platform/logs' + (merchantId.value ? `?merchant_id=${merchantId.value}` : '')); };
      onMounted(async () => { load(); merchants.value = await api.get('/platform/merchants'); });
      return { list, merchants, merchantId, load, fmtTime };
    },
  };

  // ---------- 布局 ----------
  const Layout = {
    template: `
      <div class="layout">
        <div class="sidebar">
          <div class="brand"><div class="badge">3S</div>3S运动中心 · 平台总台</div>
          <div v-for="m in menus" :key="m.path" class="menu-item" :class="{active: $route.path===m.path}" @click="$router.push(m.path)">
            <span>{{ m.icon }}</span><span>{{ m.title }}</span>
          </div>
        </div>
        <div class="main">
          <div class="topbar">
            <div class="title">{{ current }}</div>
            <div class="user">
              <span>{{ user?.realname || 'platform' }}</span>
              <el-button link type="danger" @click="logout">退出</el-button>
            </div>
          </div>
          <div class="content"><router-view /></div>
        </div>
      </div>`,
    setup() {
      const menus = [
        { path: '/overview', title: '平台概览', icon: '📊' },
        { path: '/merchants', title: '商户管理', icon: '🏢' },
        { path: '/notices', title: '通知发布', icon: '📢' },
        { path: '/logs', title: '日志监控', icon: '📋' },
      ];
      const route = VueRouter.useRoute();
      const user = api.user();
      const logout = () => { api.clearAuth(); location.hash = '#/login'; };
      return { menus, user, logout,
        get current() { return (menus.find(m => m.path === route.path) || {}).title || ''; } };
    },
  };

  const router = createRouter({
    history: createWebHashHistory(),
    routes: [
      { path: '/login', component: LoginPage },
      {
        path: '/', component: Layout, redirect: '/overview',
        children: [
          { path: 'overview', component: OverviewPage },
          { path: 'merchants', component: MerchantsPage },
          { path: 'notices', component: NoticesPage },
          { path: 'logs', component: LogsPage },
        ],
      },
    ],
  });
  router.beforeEach((to) => {
    if (to.path !== '/login' && !api.token()) return '/login';
  });

  const app = createApp({ template: '<router-view />' });
  app.use(router);
  app.use(ElementPlus, { locale: ElementPlusLocaleZhCn });
  app.mount('#app');
})();
