/* 会员登录底部弹层: 勾选会员协议 → 微信手机号快捷登录 → 后端匹配/创建会员档案并签发 token
 * 事件: success({ token, user }) / skip / password(账号密码或员工登录) */
const config = require('../../config');

Component({
  properties: {
    show: { type: Boolean, value: false },
  },
  data: {
    agreed: false, loading: false, shake: false,
    perks: [
      { t: '在线约课', icon: 'calendar-o' },
      { t: '私教预约', icon: 'friends-o' },
      { t: '训练计划', icon: 'todo-list-o' },
      { t: '成长里程碑', icon: 'medal-o' },
    ],
  },
  methods: {
    noop() {},
    toggleAgree() { this.setData({ agreed: !this.data.agreed }); },
    openAgreement() { wx.navigateTo({ url: '/pages/agreement/agreement' }); },
    needAgree() {
      wx.showToast({ title: '请先阅读并同意会员协议', icon: 'none' });
      this.setData({ shake: true });
      setTimeout(() => this.setData({ shake: false }), 500);
    },
    onMask() { this.triggerEvent('skip'); },
    onSkip() { this.triggerEvent('skip'); },
    onPassword() { this.triggerEvent('password'); },
    onPhone(e) {
      const detail = (e && e.detail) || {};
      if (!detail.code) {
        // 用户点了拒绝, 或账号未开通手机号快速验证能力
        if (!(detail.errMsg && detail.errMsg.indexOf('deny') > -1)) {
          wx.showToast({ title: '暂未获取到手机号，可使用账号密码登录', icon: 'none' });
        }
        return;
      }
      this.setData({ loading: true });
      wx.request({
        url: config.API_BASE + '/auth/member/wx-phone-login',
        method: 'POST',
        data: { code: detail.code },
        success: (res) => {
          const body = res.data || {};
          if (body.code === 0 && body.data && body.data.token) {
            wx.showToast({ title: '登录成功', icon: 'success' });
            this.triggerEvent('success', body.data);
          } else {
            wx.showModal({ title: '提示', content: body.msg || '快捷登录暂不可用，请使用账号密码登录', showCancel: false, confirmColor: '#000000' });
          }
        },
        fail: () => wx.showToast({ title: '网络异常，请稍后重试', icon: 'none' }),
        complete: () => this.setData({ loading: false }),
      });
    },
  },
});

