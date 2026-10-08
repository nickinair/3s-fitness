/* 登录 / 注册 (会员) + 员工登录 */
window.Pages.Login = {
  data() {
    return {
      mode: 'member',            // member | staff
      tab: 'login',              // login | register
      phone: '', password: '',
      username: '', spassword: '',
      reg: { phone: '', realname: '', password: '', gender: 1 },
      loading: false,
    };
  },
  template: [
    '<div class="page login-page">',
    '  <div class="login-hero">',
    '    <img class="login-logo" src="/static/logo.png" alt="3S运动中心 FITNESS">',
    '    <p>这是一场享受自我蜕变的快乐健身</p>',
    '  </div>',
    '  <div class="login-card">',
    '    <van-tabs v-model:active="mode" color="#0d5e56" title-active-color="#0d5e56">',
    '      <van-tab title="会员登录" name="member">',
    '        <div style="padding:16px 8px 0">',
    '          <van-tabs v-model:active="tab" type="card" color="#0d5e56" style="margin-bottom:16px">',
    '            <van-tab title="登录" name="login"></van-tab>',
    '            <van-tab title="注册 / 绑定" name="register"></van-tab>',
    '          </van-tabs>',
    '          <template v-if="tab===\'login\'">',
    '            <van-field v-model="phone" type="tel" maxlength="11" label="手机号" placeholder="请输入手机号" clearable />',
    '            <van-field v-model="password" type="password" label="密码" placeholder="请输入密码" clearable @keyup.enter="doMemberLogin" />',
    '            <div style="padding:20px 16px 0">',
    '              <van-button type="primary" block round :loading="loading" @click="doMemberLogin">登 录</van-button>',
    '            </div>',
    '          </template>',
    '          <template v-else>',
    '            <van-field v-model="reg.phone" type="tel" maxlength="11" label="手机号" placeholder="已有门店档案将自动绑定" clearable />',
    '            <van-field v-model="reg.realname" label="姓名" placeholder="请输入真实姓名" clearable />',
    '            <van-field v-model="reg.password" type="password" label="设置密码" placeholder="至少6位" clearable />',
    '            <van-field label="性别">',
    '              <template #input>',
    '                <van-radio-group v-model="reg.gender" direction="horizontal">',
    '                  <van-radio :name="1">男</van-radio><van-radio :name="2">女</van-radio>',
    '                </van-radio-group>',
    '              </template>',
    '            </van-field>',
    '            <div class="muted" style="padding:8px 16px 0">注册即代表微信绑定：若手机号已有门店档案，将自动绑定该档案并设置登录密码。</div>',
    '            <div style="padding:16px 16px 0">',
    '              <van-button type="primary" block round :loading="loading" @click="doRegister">注册并登录</van-button>',
    '            </div>',
    '          </template>',
    '        </div>',
    '      </van-tab>',
    '      <van-tab title="员工登录" name="staff">',
    '        <div style="padding:16px 8px 0">',
    '          <van-field v-model="username" label="员工账号" placeholder="请输入员工账号" clearable />',
    '          <van-field v-model="spassword" type="password" label="密码" placeholder="请输入密码" clearable @keyup.enter="doStaffLogin" />',
    '          <div style="padding:20px 16px 0">',
    '            <van-button type="primary" block round :loading="loading" @click="doStaffLogin">员工登录</van-button>',
    '          </div>',
    '        </div>',
    '      </van-tab>',
    '    </van-tabs>',
    '  </div>',
    '</div>',
  ].join('\n'),
  methods: {
    async doMemberLogin() {
      if (!this.phone) return vant.showToast('请输入手机号');
      if (!this.password) return vant.showToast('请输入密码');
      this.loading = true;
      try {
        const data = await API.post('/auth/member/login', { phone: this.phone, password: this.password });
        this.enter(data, 'member');
      } finally { this.loading = false; }
    },
    async doRegister() {
      const r = this.reg;
      if (!/^1\d{10}$/.test(r.phone)) return vant.showToast('请输入正确的手机号');
      if (!r.password || r.password.length < 6) return vant.showToast('密码至少6位');
      this.loading = true;
      try {
        const data = await API.post('/auth/member/register', { phone: r.phone, realname: r.realname, password: r.password, gender: r.gender });
        vant.showToast('注册成功，已自动绑定档案');
        this.enter(data, 'member');
      } finally { this.loading = false; }
    },
    async doStaffLogin() {
      if (!this.username || !this.spassword) return vant.showToast('请输入账号与密码');
      this.loading = true;
      try {
        const data = await API.post('/auth/login', { username: this.username, password: this.spassword });
        if (data.user.role === 'platform') { vant.showToast('平台账号请使用平台端登录'); return; }
        this.enter(data, 'staff');
      } finally { this.loading = false; }
    },
    enter(data, type) {
      Store.token = data.token;
      Store.user = data.user;
      Store.type = type;
      this.$router.replace(type === 'member' ? '/' : '/staff');
    },
  },
};
