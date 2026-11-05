const config = require('../../config');

const ORIGIN = config.API_BASE.replace(/\/api\/?$/, '');

Page({
  data: {
    show: false,
    poster: ORIGIN + '/static/videos/hanteln2-poster.jpg',
  },
  onReady() {
    // 先渲染背景再弹出, 有从底部滑上来的动效
    setTimeout(() => this.setData({ show: true }), 60);
  },
  onLoginOk(e) {
    const d = e.detail || {};
    wx.reLaunch({ url: '/pages/home/home?type=member&token=' + encodeURIComponent(d.token) });
  },
  // 放弃 / 点遮罩: 收起弹层后返回上一页; 没有上一页就回首页
  onSkip() {
    this.setData({ show: false });
    setTimeout(() => {
      if (getCurrentPages().length > 1) wx.navigateBack();
      else wx.reLaunch({ url: '/pages/home/home' });
    }, 280);
  },
  // 账号密码 / 员工登录: 从 H5 登录页点过来的直接返回; 否则打开 H5 登录页
  onPassword() {
    const pages = getCurrentPages();
    const prev = pages.length > 1 ? pages[pages.length - 2] : null;
    if (prev && prev.route === 'pages/index/index') wx.navigateBack();
    else wx.redirectTo({ url: '/pages/index/index?path=login' });
  },
});
