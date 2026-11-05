/* 会员首页(原生页)
 * 为什么是原生页: 微信客户端 6.7.2 起 navigationStyle: custom 对 web-view 页面无效, 承载 H5 的页面一定带白色原生导航栏。
 * 要像 M Stand 那样让视频铺到状态栏, 首页只能用原生实现; 其余业务页仍由 pages/index(web-view) 承载 H5。
 * 登录态: H5 登录成功后 reLaunch 到本页并带上 token, 本页存进 storage; 打开 H5 子页面时再把 token 传回去。 */
const config = require('../../config');

const ORIGIN = config.API_BASE.replace(/\/api\/?$/, '');
const QUICKS = {
  checkin: { t: '到店签到', s: '扫码快速入场', icon: 'aim', to: 'checkin' },
  bookings: { t: '我的预约', s: '已约课程', icon: 'clock-o', to: 'my-bookings' },
  cards: { t: '我的卡', s: '余额与有效期', icon: 'credit-pay', to: 'my-cards' },
  contracts: { t: '我的合同', s: '在线签署', icon: 'notes-o', to: 'contracts' },
  plans: { t: '训练计划', s: '教练专属定制', icon: 'todo-list-o', to: 'plans' },
  milestones: { t: '里程碑', s: '成长记录', icon: 'medal-o', to: 'milestones' },
  pending: { t: '待确认消课', s: '私教课确认', icon: 'passed', to: 'pending-confirms' },
  photos: { t: '训练风采', s: '蜕变相册', icon: 'photograph', to: 'training-photos' },
};
const QUICK_DEFAULT = ['checkin', 'bookings', 'cards', 'contracts', 'plans', 'milestones', 'pending'];
const VIDEOS = ['dumbbell', 'hanteln2', 'MR8_8170', '21Run01'].map(n => ({
  src: ORIGIN + '/static/videos/' + n + '.mp4', poster: ORIGIN + '/static/videos/' + n + '-poster.jpg',
}));
const CLIP_SEC = 8;
const FADE_MS = 900;
const KIND_NAME = { 1: '次卡', 2: '时间卡', 3: '储值卡', 4: '私教卡' };
// 卡面: [底色 rgb, 右侧实景照片]; 与 H5 app.css 的 .vip-face.face-k* 保持一致
const FACE = {
  4: ['18,18,18', 'dumbbell'], 1: ['30,34,38', 'hanteln2'], 2: ['10,10,10', '21Run01'], 3: ['34,30,27', 'MR8_8170'],
};
const BANNER_BG = [['0,0,0', 'dumbbell'], ['21,24,27', 'hanteln2'], ['10,10,10', '21Run01']];
const WEEK = '日一二三四五六';

function pad(n) { return (n < 10 ? '0' : '') + n; }
function dateOf(s) { return s ? String(s).slice(0, 10) : ''; }
function parseDay(s) { const m = String(s || '').match(/(\d{4})-(\d{2})-(\d{2})/); return m ? new Date(+m[1], +m[2] - 1, +m[3]) : null; }
function humanDay(s) {
  const d = parseDay(s); if (!d) return '';
  const t = new Date(); t.setHours(0, 0, 0, 0);
  const diff = Math.round((d - t) / 86400000);
  if (diff === 0) return '今天'; if (diff === 1) return '明天'; if (diff === 2) return '后天'; if (diff === -1) return '昨天';
  if (diff > 2 && diff < 7) return '周' + WEEK[d.getDay()];
  return (d.getFullYear() === t.getFullYear() ? '' : d.getFullYear() + '-') + pad(d.getMonth() + 1) + '-' + pad(d.getDate());
}
function hm(s) { const m = String(s || '').slice(10).match(/(\d{1,2}):(\d{2})/); return m ? m[0] : ''; }
function money(v) { const n = Number(v || 0); return '¥' + (Math.abs(n % 1) > 0.004 ? n.toFixed(2) : String(Math.round(n))); }
function photoBg(rgb, img) {
  return 'background-image:linear-gradient(160deg, rgba(255,255,255,.10) 0%, rgba(255,255,255,0) 38%),'
    + 'linear-gradient(90deg, rgb(' + rgb + ') 32%, rgba(' + rgb + ',.62) 62%, rgba(' + rgb + ',.12) 100%)'
    + (img ? ',url(' + ORIGIN + '/static/videos/' + img + '-poster.jpg)' : '')
    + ';background-size:100% 100%,100% 100%' + (img ? ',auto 100%' : '')
    + ';background-position:0 0,0 0' + (img ? ',right center' : '')
    + ';background-repeat:no-repeat;background-color:rgb(' + rgb + ');';
}
function titleLines(t) {
  const s = String(t || '').trim(); if (!s) return [''];
  const i = s.search(/[，,。！!·、\s]/);
  if (i > 2 && i < s.length - 2) return [s.slice(0, i), s.slice(i + 1)];
  if (s.length > 9) return [s.slice(0, Math.ceil(s.length / 2)), s.slice(Math.ceil(s.length / 2))];
  return [s];
}

Page({
  data: {
    staff: false, logged: false, home: null, loginShow: false,
    name: '欢迎来到3S', initial: '3S', nextText: '登录后即可在线约课', isMember: false,
    clubText: '加入3S会员 开启你的蜕变之旅', clubAct: '登录/注册',
    quicks: [], banners: [], notices: [], cards: [],
    capTop: 24, capH: 32, capRight: 100, heroH: 0,
    videos: VIDEOS, layerIdx: [0, 1], layer: 0, vIdx: 0, played: false,
    icoRatio: 1, thumbW: 100, thumbX: 0,
  },

  onLoad(options) {
    options = options || {};
    if (options.logout) { wx.removeStorageSync('mp_token'); wx.removeStorageSync('mp_type'); }
    if (options.token) {
      wx.setStorageSync('mp_token', decodeURIComponent(options.token));
      wx.setStorageSync('mp_type', options.type || 'member');
    }
    // 员工账号: 员工端没有原生首页, 直接进 H5 工作台
    if (wx.getStorageSync('mp_token') && wx.getStorageSync('mp_type') === 'staff') {
      this.setData({ staff: true });
      wx.redirectTo({ url: this.h5Url('staff') });
      return;
    }
    try {
      const win = wx.getWindowInfo ? wx.getWindowInfo() : wx.getSystemInfoSync();
      const cap = wx.getMenuButtonBoundingClientRect();
      this.winW = win.windowWidth;
      if (cap && cap.top) this.setData({ capTop: cap.top, capH: cap.height, capRight: win.windowWidth - cap.left + 8 });
    } catch (e) { /* 用默认值 */ }
    this.renderQuicks(QUICK_DEFAULT, {});
  },

  onReady() {
    if (this.data.staff) return;
    this.vctx = [wx.createVideoContext('v0', this), wx.createVideoContext('v1', this)];
    this.vctx[0].play();
    this.fitHero();
  },

  onShow() {
    if (this.data.staff) return;
    this.load();
    if (this.vctx) this.vctx[this.data.layer].play();
  },

  onHide() { if (this.vctx) this.vctx.forEach(v => v.pause()); },
  onUnload() { clearTimeout(this.fadeT); },

  /* ---------- 数据 ---------- */
  token() { return wx.getStorageSync('mp_token') || ''; },
  request(path, method, data) {
    return new Promise((resolve, reject) => {
      const token = this.token();
      wx.request({
        url: config.API_BASE + path, method: method || 'GET', data,
        header: token ? { Authorization: 'Bearer ' + token } : {},
        success: (res) => {
          const h = res.header || {};
          const renew = h['X-Renew-Token'] || h['x-renew-token'];
          if (renew) wx.setStorageSync('mp_token', renew);
          if (res.statusCode === 401) {
            wx.removeStorageSync('mp_token'); wx.removeStorageSync('mp_type');
            this.setLoggedOut();
            return reject(new Error('401'));
          }
          const body = res.data || {};
          if (body.code === 0) resolve(body.data); else reject(new Error(body.msg || 'error'));
        },
        fail: reject,
      });
    });
  },

  load() {
    if (!this.token()) { this.setLoggedOut(); return; }
    this.request('/member/workbench').then(d => {
      if (d && Array.isArray(d.items) && d.items.length) this.layout = d.items;
      this.renderQuicks(this.layout || QUICK_DEFAULT, this.badges || {});
    }).catch(() => {});
    this.request('/member/home').then(h => this.renderHome(h)).catch(() => {});
  },

  setLoggedOut() {
    this.layout = null; this.badges = {};
    this.setData({
      logged: false, home: null, name: '欢迎来到3S', initial: '3S', nextText: '登录后即可在线约课', isMember: false,
      clubText: '加入3S会员 开启你的蜕变之旅', clubAct: '登录/注册', banners: [], notices: [], cards: [],
    });
    this.renderQuicks(QUICK_DEFAULT, {});
    this.fitHero();
  },

  renderHome(h) {
    h = h || {};
    const v = h.vip || {};
    const name = v.realname || v.nickname || '会员';
    const cards = (h.cards || []).map(c => {
      const dead = c.status >= 2 && c.status !== 3;
      const f = dead ? ['168,168,168', ''] : (FACE[c.card_kind] || FACE[1]);
      let leftText = '剩余 ' + (c.left_counts == null ? '-' : c.left_counts) + ' 次';
      if (c.card_kind === 2) leftText = '不限次 · 时间卡';
      if (c.card_kind === 3) leftText = '余额 ' + money(c.left_money);
      const expText = c.status === 0
        ? (c.latest_open_time ? '最晚 ' + dateOf(c.latest_open_time) + ' 前开卡' : '待开卡')
        : (c.expire_time ? dateOf(c.expire_time) + ' 到期' : '');
      return { id: c.id, card_type_name: c.card_type_name, kindName: KIND_NAME[c.card_kind] || '', leftText, expText, cls: dead ? 'dead' : '', bg: photoBg(f[0], f[1]), raw: c };
    });
    const isMember = cards.length > 0;
    let nextText = '近一周预约 ' + (h.upcoming || 0) + ' 节';
    if (h.nextLesson) {
      nextText = '下一节 ' + humanDay(h.nextLesson.start_time) + ' ' + hm(h.nextLesson.start_time)
        + (h.nextLesson.coach_name ? ' · ' + h.nextLesson.coach_name : '');
    }
    const banners = (h.banners || []).map((b, i) => {
      const img = b.image ? String(b.image) : '';
      const hasImg = img.indexOf('/uploads') === 0 || img.indexOf('/static') === 0 || img.indexOf('http') === 0;
      const g = BANNER_BG[i % 3];
      const bg = hasImg
        ? 'background-image:linear-gradient(100deg, rgba(0,0,0,.72) 0%, rgba(0,0,0,.42) 52%, rgba(0,0,0,.16) 100%),url(' + (img.indexOf('http') === 0 ? img : ORIGIN + img) + ');background-size:100% 100%,cover;background-position:center;'
        : 'background-image:linear-gradient(90deg, rgb(' + g[0] + ') 30%, rgba(' + g[0] + ',.6) 58%, rgba(' + g[0] + ',.08) 100%),url(' + ORIGIN + '/static/videos/' + g[1] + '-poster.jpg);background-size:100% 100%,auto 100%;background-position:0 0,right center;background-repeat:no-repeat;';
      return { id: b.id, link: b.link || '', hasImg, bg, lines: titleLines(b.title) };
    });
    const notices = (h.notices || []).map(n => ({ id: n.id, title: n.title, content: n.content, day: humanDay(n.insert_time) }));
    this.badges = { contracts: h.pendingContract || 0, plans: h.newPlan || 0, pending: h.pendingConfirm || 0 };
    this.setData({
      logged: true, home: h, name, initial: name.slice(0, 1), nextText, isMember,
      clubText: isMember ? cards[0].card_type_name + ' · ' + cards[0].leftText : '加入3S会员 开启你的蜕变之旅',
      clubAct: isMember ? '我的会员卡' : '去买卡',
      cards, banners, notices,
    });
    this.renderQuicks(this.layout || QUICK_DEFAULT, this.badges);
    this.fitHero();
  },

  renderQuicks(keys, badges) {
    const quicks = keys.filter(k => QUICKS[k]).map(k => Object.assign({ key: k, badge: badges[k] || 0 }, QUICKS[k]));
    this.setData({ quicks }, () => this.measureIcons());
  },

  /* ---------- 布局 ---------- */
  // 首屏高度: 让「上滑探索更多精彩」正好落在底部导航上方(与 H5 fitHero 同一算法)
  fitHero() {
    wx.nextTick(() => {
      wx.createSelectorQuery().in(this)
        .select('#hero').boundingClientRect()
        .select('#hint').boundingClientRect()
        .select('#tabbar').boundingClientRect()
        .exec(([hero, hint, tab]) => {
          if (!hero || !hint || !tab) return;
          const below = hint.bottom - hero.bottom;
          const h = Math.round(tab.top - 4 - below);
          const heroH = Math.max(300, Math.min(h, 820));
          if (Math.abs(heroH - this.data.heroH) > 1) this.setData({ heroH });
        });
    });
  },
  measureIcons() {
    wx.createSelectorQuery().in(this).select('#icons').fields({ size: true, scrollOffset: true }).exec(([r]) => {
      if (!r) return;
      this.icoW = r.width;
      this.updateThumb(r.scrollLeft || 0, r.scrollWidth || r.width);
    });
  },
  onIconScroll(e) { this.updateThumb(e.detail.scrollLeft, e.detail.scrollWidth); },
  updateThumb(left, scrollWidth) {
    const w = this.icoW || this.winW || 375;
    const ratio = Math.min(1, w / Math.max(1, scrollWidth));
    const max = scrollWidth - w;
    const pos = max > 0 ? left / max : 0;
    const tw = Math.max(0.25, ratio);
    this.setData({ icoRatio: ratio, thumbW: tw * 100, thumbX: pos * (1 - tw) / tw * 100 });
  },
  scrollMore() { wx.pageScrollTo({ selector: '#more', duration: 300 }); },

  /* ---------- 视频轮播: 两个 video 交替淡入淡出 ---------- */
  onPlay(e) { if (!this.data.played && +e.currentTarget.dataset.k === this.data.layer) this.setData({ played: true }); },
  onTime(e) {
    const k = +e.currentTarget.dataset.k;
    if (k !== this.data.layer || this.switching || VIDEOS.length < 2) return;
    if (e.detail.currentTime >= CLIP_SEC) this.nextVideo();
  },
  onEnded(e) {
    const k = +e.currentTarget.dataset.k;
    if (k !== this.data.layer) return;
    if (VIDEOS.length < 2) { this.vctx[k].seek(0); this.vctx[k].play(); return; }
    this.nextVideo();
  },
  nextVideo() {
    if (this.switching || !this.vctx) return;
    this.switching = true;
    const cur = this.data.layer, nxt = 1 - cur;
    this.vctx[nxt].seek(0);
    this.vctx[nxt].play();
    this.setData({ layer: nxt, vIdx: this.data.layerIdx[nxt] });
    clearTimeout(this.fadeT);
    this.fadeT = setTimeout(() => {
      this.vctx[cur].pause();
      const idx = this.data.layerIdx.slice();
      idx[cur] = (this.data.layerIdx[nxt] + 1) % VIDEOS.length;   // 淡出的那层换成再下一段, 提前加载
      this.setData({ layerIdx: idx });
      this.switching = false;
    }, FADE_MS);
  },

  /* ---------- 跳转 ---------- */
  h5Url(path) {
    const t = this.token();
    const type = wx.getStorageSync('mp_type') || 'member';
    return '/pages/index/index?path=' + encodeURIComponent(path || '')
      + (t ? '&token=' + encodeURIComponent(t) + '&type=' + type : '');
  },
  goPath(e) {
    const path = e.currentTarget.dataset.path;
    if (!this.token()) { this.openLogin(); return; }
    wx.navigateTo({ url: this.h5Url(path) });
  },
  /* ---------- 登录弹层 ---------- */
  openLogin() { this.setData({ loginShow: true }); },
  closeLogin() { this.setData({ loginShow: false }); },
  onLoginOk(e) {
    const d = e.detail || {};
    wx.setStorageSync('mp_token', d.token);
    wx.setStorageSync('mp_type', 'member');
    this.setData({ loginShow: false });
    this.load();
  },
  // 账号密码 / 员工登录: 走 H5 登录页, 登录成功后 H5 会 reLaunch 回本页并带上 token
  goPwdLogin() {
    this.setData({ loginShow: false });
    wx.navigateTo({ url: '/pages/index/index?path=login' });
  },
  onHiTap() { this.goPath({ currentTarget: { dataset: { path: 'my-bookings' } } }); },
  onClubBar() {
    if (!this.token()) { this.openLogin(); return; }
    wx.navigateTo({ url: this.h5Url(this.data.isMember ? 'my-cards' : 'buy') });
  },
  onBanner(e) {
    const l = String(e.currentTarget.dataset.link || '');
    if (l.indexOf('/') === 0) this.goPath({ currentTarget: { dataset: { path: l.slice(1) } } });
  },
  onNotice(e) {
    const n = this.data.notices[e.currentTarget.dataset.i];
    if (n) wx.showModal({ title: n.title, content: n.content || '', showCancel: false, confirmText: '知道了', confirmColor: '#000000' });
  },

  onShareAppMessage() { return { title: '3S运动中心 · 享受自我蜕变的快乐健身', path: '/pages/home/home' }; },
  onShareTimeline() { return { title: '3S运动中心 · 享受自我蜕变的快乐健身' }; },
});
