const config = require('../../config');

/* 业务页容器(web-view 承载 H5)。注意: 微信 6.7.2 起 web-view 页面不支持 navigationStyle: custom,
   一定会显示原生导航栏, 所以沉浸式视频首页放在原生页 pages/home 里。 */
Page({
  data: { url: '' },
  onLoad(options) {
    options = options || {};
    // 支持通过路径参数或扫码 scene 参数直达指定页面
    // 例如: pages/index/index?path=checkin 或 scene=checkin -> https://3s-fitness.cn/m/#/checkin
    let base = config.H5_URL;
    const query = ['mp=1'];                       // 告诉 H5: 运行在小程序里(回首页/登录/退出要切回原生首页)
    if (options.token) {
      query.push('token=' + encodeURIComponent(decodeURIComponent(options.token)));
      query.push('type=' + (options.type || 'member'));
    }
    base += (base.includes('?') ? '&' : '?') + query.join('&');
    let hashPath = '';
    if (options.path) hashPath = decodeURIComponent(options.path);
    else if (options.scene) hashPath = decodeURIComponent(options.scene);
    if (hashPath) {
      if (!hashPath.startsWith('/')) hashPath = '/' + hashPath;
      base += '#' + hashPath;
    }
    this.setData({ url: base });
  },
  // 开启右上角菜单「转发给朋友」与「分享到朋友圈」
  onShareAppMessage(options) {
    // options.webViewUrl 为当前用户正在浏览的 H5 完整 URL，提取 hash 路由使好友点开直达对应页
    let hash = '';
    if (options && options.webViewUrl) {
      const idx = options.webViewUrl.indexOf('#/');
      if (idx !== -1) hash = options.webViewUrl.slice(idx + 2);
    }
    // 首页 / 登录页 / 空地址统一分享原生首页
    const path = (!hash || hash.startsWith('login') || hash.startsWith('?'))
      ? '/pages/home/home'
      : '/pages/index/index?path=' + encodeURIComponent(hash);
    return { title: '3S运动中心 · 享受自我蜕变的快乐健身', path };
  },
  onShareTimeline() {
    return { title: '3S运动中心 · 享受自我蜕变的快乐健身' };
  },
});
