/* 登录页 */
window.AppPages.Login = {
  name: 'LoginPage',
  data() {
    return {
      form: { username: '', password: '' },
      loading: false,
    };
  },
  template: `
  <div class="login-wrap">
    <div class="login-card">
      <div class="login-logo">
        <div class="badge">3S</div>
        <h1>3S运动中心 · 管理后台</h1>
      </div>
      <div class="login-sub">门店运营 · 会员经营 · 教练服务 一站式工作台</div>
      <el-form :model="form" size="large" @keyup.enter="doLogin">
        <el-form-item>
          <el-input v-model="form.username" placeholder="员工账号" clearable>
            <template #prefix><el-icon><User /></el-icon></template>
          </el-input>
        </el-form-item>
        <el-form-item>
          <el-input v-model="form.password" type="password" placeholder="密码" show-password>
            <template #prefix><el-icon><Lock /></el-icon></template>
          </el-input>
        </el-form-item>
        <el-form-item class="mb0">
          <el-button type="primary" style="width:100%" :loading="loading" @click="doLogin">登 录</el-button>
        </el-form-item>
      </el-form>
    </div>
  </div>`,
  methods: {
    async doLogin() {
      if (!this.form.username || !this.form.password) {
        ElementPlus.ElMessage.warning('请输入账号与密码');
        return;
      }
      this.loading = true;
      try {
        const d = await api.post('/auth/login', this.form);
        if (d.user.role === 'platform') {
          ElementPlus.ElMessage.warning('平台账号请登录平台总台');
          this.loading = false;
          return;
        }
        Auth.setToken(d.token);
        Auth.setUser(d.user);
        Auth.setClubId(d.user.club_id || 1);
        ElementPlus.ElMessage.success('欢迎回来，' + (d.user.realname || d.user.username));
        this.$router.replace('/dashboard');
      } catch (e) { /* 已提示 */ } finally {
        this.loading = false;
      }
    },
  },
};
