/* 会员端-账号与安全: 手机号 / 登录密码, 均需先做身份验证(手机验证码 或 原密码) */
window.Pages.MemberSecurity = {
  data() {
    return {
      info: null, loading: true,
      step: 'home',      // home | pick | code | pwd | newPhone | newPwd
      target: '',        // phone | password
      ticket: '',
      vCode: '', vPwd: '',
      newPhone: '', newCode: '',
      pwd1: '', pwd2: '',
      sending: false, left: 0, timer: null, submitting: false,
    };
  },
  computed: {
    title() {
      return { home: '账号与安全', pick: '身份验证', code: '手机验证码验证', pwd: '原密码验证', newPhone: '更换手机号', newPwd: '修改登录密码' }[this.step];
    },
    codeTip() { return this.info ? '验证码将发送至 ' + this.info.phone_mask : ''; },
  },
  template: [
    '<div class="page">',
    '  <van-nav-bar class="m-nav" :title="title" left-arrow :border="false" @click-left="back"/>',
    '  <div v-if="loading" style="text-align:center;padding:60px 0"><van-loading color="var(--brand)">加载中...</van-loading></div>',

    /* ---- 账号与安全首页 ---- */
    '  <template v-else-if="step===\'home\'">',
    '    <div class="card-box" style="padding:4px 8px;margin-top:12px">',
    '      <van-cell title="手机号" :value="info.phone_mask" is-link @click="start(\'phone\')"/>',
    '      <van-cell title="登录密码" :value="info.has_password ? \'已设置\' : \'未设置\'" is-link :border="false" @click="start(\'password\')"/>',
    '    </div>',
    '    <div class="muted" style="padding:6px 20px">更换手机号后，下次请使用新手机号登录。</div>',
    '  </template>',

    /* ---- 选择验证方式 ---- */
    '  <template v-else-if="step===\'pick\'">',
    '    <div class="muted" style="padding:16px 20px 6px">请先进行身份验证</div>',
    '    <div class="card-box" style="padding:4px 8px;margin-top:0">',
    '      <van-cell title="手机验证码验证" is-link @click="toCode"/>',
    '      <van-cell title="原密码验证" is-link :border="false" @click="step=\'pwd\'" v-if="info.has_password"/>',
    '    </div>',
    '  </template>',

    /* ---- 验证码验证 ---- */
    '  <template v-else-if="step===\'code\'">',
    '    <div class="muted" style="padding:16px 20px 6px">{{ codeTip }}</div>',
    '    <div class="card-box" style="padding:4px 8px;margin-top:0">',
    '      <van-field v-model="vCode" type="digit" maxlength="6" label="验证码" placeholder="请输入6位验证码" :border="false">',
    '        <template #button><van-button size="small" type="primary" plain round :disabled="left>0||sending" @click="sendCode(\'verify\')">{{ left>0 ? left+\'s\' : \'获取验证码\' }}</van-button></template>',
    '      </van-field>',
    '    </div>',
    '    <div style="margin:20px 16px"><van-button type="primary" block round :loading="submitting" :disabled="vCode.length<6" @click="doVerify(\'code\')">下一步</van-button></div>',
    '  </template>',

    /* ---- 原密码验证 ---- */
    '  <template v-else-if="step===\'pwd\'">',
    '    <div class="muted" style="padding:16px 20px 6px">请输入当前登录密码</div>',
    '    <div class="card-box" style="padding:4px 8px;margin-top:0">',
    '      <van-field v-model="vPwd" type="password" label="原密码" placeholder="请输入原密码" :border="false"/>',
    '    </div>',
    '    <div style="margin:20px 16px"><van-button type="primary" block round :loading="submitting" :disabled="!vPwd" @click="doVerify(\'password\')">下一步</van-button></div>',
    '  </template>',

    /* ---- 换绑新手机号 ---- */
    '  <template v-else-if="step===\'newPhone\'">',
    '    <div class="muted" style="padding:16px 20px 6px">当前手机号 {{ info.phone_mask }}，请输入要更换的新手机号</div>',
    '    <div class="card-box" style="padding:4px 8px;margin-top:0">',
    '      <van-field v-model="newPhone" type="tel" maxlength="11" label="新手机号" placeholder="请输入新手机号"/>',
    '      <van-field v-model="newCode" type="digit" maxlength="6" label="验证码" placeholder="请输入6位验证码" :border="false">',
    '        <template #button><van-button size="small" type="primary" plain round :disabled="left>0||sending||newPhone.length!==11" @click="sendCode(\'new_phone\')">{{ left>0 ? left+\'s\' : \'获取验证码\' }}</van-button></template>',
    '      </van-field>',
    '    </div>',
    '    <div style="margin:20px 16px"><van-button type="primary" block round :loading="submitting" :disabled="newPhone.length!==11||newCode.length<6" @click="savePhone">确认更换</van-button></div>',
    '  </template>',

    /* ---- 设置新密码 ---- */
    '  <template v-else-if="step===\'newPwd\'">',
    '    <div class="muted" style="padding:16px 20px 6px">请设置新的登录密码（至少6位）</div>',
    '    <div class="card-box" style="padding:4px 8px;margin-top:0">',
    '      <van-field v-model="pwd1" type="password" label="新密码" placeholder="至少6位"/>',
    '      <van-field v-model="pwd2" type="password" label="确认密码" placeholder="请再次输入" :border="false"/>',
    '    </div>',
    '    <div style="margin:20px 16px"><van-button type="primary" block round :loading="submitting" :disabled="pwd1.length<6||!pwd2" @click="savePwd">确认修改</van-button></div>',
    '  </template>',
    '</div>',
  ].join('\n'),
  methods: {
    back() {
      if (this.step === 'home') return this.$router.back();
      if (this.step === 'pick') return this.reset();
      if (this.step === 'code' || this.step === 'pwd') { this.step = 'pick'; return; }
      this.step = 'pick'; this.ticket = '';
    },
    reset() {
      this.step = 'home'; this.target = ''; this.ticket = '';
      this.vCode = ''; this.vPwd = ''; this.newPhone = ''; this.newCode = ''; this.pwd1 = ''; this.pwd2 = '';
      this.stopTimer();
    },
    start(t) { this.target = t; this.step = 'pick'; },
    toCode() { this.step = 'code'; if (!this.left) this.sendCode('verify'); },
    stopTimer() { if (this.timer) { clearInterval(this.timer); this.timer = null; } this.left = 0; },
    tick() {
      this.stopTimer(); this.left = 60;
      this.timer = setInterval(() => { if (--this.left <= 0) this.stopTimer(); }, 1000);
    },
    async sendCode(scene) {
      this.sending = true;
      try {
        const d = await API.post('/member/security/send-code', scene === 'new_phone' ? { scene, phone: this.newPhone } : { scene });
        this.tick();
        if (d && d.mock_code) {
          // 演示环境: 短信为模拟发送, 直接提示验证码
          vant.showDialog({ title: '演示环境验证码', message: '验证码 ' + d.mock_code + '\n（已同时记入后台短信记录）', confirmButtonColor: 'var(--brand)' });
          if (scene === 'new_phone') this.newCode = d.mock_code; else this.vCode = d.mock_code;
        } else {
          vant.showToast('验证码已发送至 ' + (d && d.sent_to || ''));
        }
      } finally { this.sending = false; }
    },
    async doVerify(method) {
      this.submitting = true;
      try {
        const body = { purpose: this.target, method };
        if (method === 'password') body.password = this.vPwd; else body.code = this.vCode;
        const d = await API.post('/member/security/verify', body);
        this.ticket = d.ticket;
        this.stopTimer();
        this.step = this.target === 'phone' ? 'newPhone' : 'newPwd';
      } finally { this.submitting = false; }
    },
    async savePhone() {
      this.submitting = true;
      try {
        const d = await API.post('/member/security/phone', { ticket: this.ticket, phone: this.newPhone, code: this.newCode });
        this.info.phone = d.phone; this.info.phone_mask = d.phone_mask;
        const u = Store.user || {}; u.phone = d.phone; Store.user = u;
        vant.showToast({ message: '手机号已更换', icon: 'success' });
        this.reset();
      } finally { this.submitting = false; }
    },
    async savePwd() {
      if (this.pwd1 !== this.pwd2) return vant.showToast('两次输入的密码不一致');
      this.submitting = true;
      try {
        await API.post('/member/security/password', { ticket: this.ticket, password: this.pwd1 });
        this.info.has_password = true;
        vant.showToast({ message: '密码已修改', icon: 'success' });
        this.reset();
      } finally { this.submitting = false; }
    },
  },
  async mounted() {
    try { this.info = await API.get('/member/security'); }
    finally { this.loading = false; }
  },
  beforeUnmount() { this.stopTimer(); },
};
