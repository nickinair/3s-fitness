const config = require('../../config');

const PATH_TITLES = {
  '/schedule': '约课',
  '/coaches': '私教教练',
  '/buy': '购卡',
  '/mine': '我的',
  '/complete-profile': '完善档案 · 领专属积分',
  '/training-photos': '训练风采',
  '/profile': '编辑资料',
  '/my-cards': '我的会员卡',
  '/my-bookings': '我的预约',
  '/pending-confirms': '待确认消课',
  '/checkin': '到店签到',
  '/contracts': '我的合同',
  '/milestones': '我的里程碑',
  '/meals': '饮食日记',
  '/plans': '训练计划',
  '/security': '账号与安全',
  '/guide': '使用引导',
  '/login': '登录',
  '/staff': '工作台',
  '/staff/mine': '我的',
  '/staff/checkin': '快速签到',
  '/staff/opencard': '快速开卡',
  '/staff/book': '代约课',
  '/staff/members': '会员列表',
  '/staff/potential': '录入潜客',
  '/staff/sales': '顾问业绩',
  '/staff/schedule': '我的课表',
  '/staff/bookings': '预约管理',
  '/staff/students': '我的学员',
  '/staff/perf': '教练业绩',
  '/staff/rests': '休息设置',
  '/staff/profile': '我的主页',
  '/staff/dashboard': '数据看板',
  '/staff/report': '报表',
  '/staff/report-detail': '导出明细',
  '/staff/my-perf': '我的业绩',
  '/staff/group-today': '今日团课核销',
  '/staff/today': '今日预约',
  '/staff/plans': '训练计划',
  '/staff/plan-edit': '训练计划',
  '/staff/milestones': '里程碑总结',
  '/staff/intents': '购卡意向',
  '/staff/cards': '会员卡列表',
  '/staff/contracts': '合同管理',
  '/staff/members-overview': '会员概况',
  '/staff/finance-monthly': '月度经营报表',
  '/staff/recharges': '收款明细',
  '/staff/spends': '耗卡明细',
  '/staff/card-balance': '剩余卡价值',
  '/staff/coach-consume': '教练消耗统计',
  '/staff/pt-records': '消课记录',
  '/staff/checkin-records': '签到记录',
  '/staff/checkin-report': '签到报表',
  '/staff/sms-logs': '短信记录',
  '/staff/op-logs': '操作日志',
  '/staff/schedule-admin': '排课表',
  '/staff/group-courses': '团课课程库',
  '/staff/classrooms': '教室管理',
  '/staff/pt-courses': '私教课程',
  '/staff/card-categories': '卡类型配置',
  '/staff/training-actions': '动作库',
  '/staff/coaches': '教练档案',
  '/staff/sources': '来源渠道',
  '/staff/settings-club': '门店信息',
  '/staff/settings-staff': '员工与角色',
  '/staff/notices': '公告',
  '/staff/banners': '首页 Banner',
  '/staff/segment/low_lesson': '课时不足',
  '/staff/segment/birthday_week': '会员生日',
  '/staff/segment/trained_10': '当月满10次',
  '/staff/segment/trained_50': '半年满50次',
  '/staff/segment/trained_20': '半年满50次',
  '/staff/segment/timecard_active': '有效期卡',
  '/staff/segment/timecard_expired': '过期期卡',
};

function resolveTitle(hashPath) {
  if (!hashPath) return '';
  if (hashPath.indexOf('edit=1') !== -1) return '常用功能管理';
  const clean = hashPath.split('?')[0];
  if (PATH_TITLES[clean]) return PATH_TITLES[clean];
  if (clean.indexOf('/coach/') === 0) return '教练主页';
  if (clean.indexOf('/card/') === 0) return '会员卡详情';
  if (clean.indexOf('/contract/') === 0) return '合同详情';
  if (clean.indexOf('/plan/') === 0) return '计划详情';
  if (clean.indexOf('/staff/member/') === 0) return '会员详情';
  if (clean.indexOf('/staff/segment/') === 0) return '会员名单';
  if (clean.indexOf('/staff/group/') === 0) return '预约名单';
  if (clean.indexOf('/staff/card/') === 0) return '会员卡详情';
  return '';
}

/* 业务页容器(web-view 承载 H5)。注意: 微信 6.7.2 起 web-view 页面不支持 navigationStyle: custom,
   一定会显示原生导航栏, 所以沉浸式视频首页放在原生页 pages/home 里。 */
Page({
  data: { url: '' },
  onLoad(options) {
    options = options || {};
    // 支持通过路径参数或扫码 scene 参数直达指定页面
    // 例如: pages/index/index?path=checkin 或 scene=checkin -> https://3s-fitness.cn/m/#/checkin
    let base = config.H5_URL;
    const query = ['mp=1', '_v=20261110_2'];      // 告诉 H5: 运行在小程序里 + 版本号防 web-view 缓存旧 HTML
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
      const title = resolveTitle(hashPath);
      if (title) wx.setNavigationBarTitle({ title });
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
