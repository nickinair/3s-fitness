/* 共享: 请求封装 / 登录态 / 字典 / 工具  (global: vant, dayjs) */
(function () {
  const Store = {
    get token() { return localStorage.getItem('m_token') || ''; },
    set token(v) { v ? localStorage.setItem('m_token', v) : localStorage.removeItem('m_token'); },
    get user() { try { return JSON.parse(localStorage.getItem('m_user') || 'null'); } catch (e) { return null; } },
    set user(v) { v ? localStorage.setItem('m_user', JSON.stringify(v)) : localStorage.removeItem('m_user'); },
    get type() { return localStorage.getItem('m_type') || ''; },
    set type(v) { v ? localStorage.setItem('m_type', v) : localStorage.removeItem('m_type'); },
    logout() { this.token = ''; this.user = null; this.type = ''; },
  };

  async function request(method, url, data, opt) {
    opt = opt || {};
    const headers = {};
    if (data != null) headers['Content-Type'] = 'application/json';
    if (Store.token) headers['Authorization'] = 'Bearer ' + Store.token;
    let res;
    try {
      res = await fetch('/api' + url, { method, headers, body: data != null ? JSON.stringify(data) : undefined });
    } catch (e) {
      vant.showToast('网络异常，请稍后重试');
      e.handled = true; throw e;
    }
    // 滑动续期: 后端在快到期时下发新 token, 悄悄换掉, 用户不会被登出
    const renew = res.headers.get('X-Renew-Token');
    if (renew) Store.token = renew;
    if (res.status === 401) {
      Store.logout();
      if (location.hash !== '#/login') { vant.showToast('登录已失效，请重新登录'); location.hash = '#/login'; }
      const e = new Error('未登录'); e.handled = true; throw e;
    }
    if (res.status === 403) {
      vant.showToast('无权限操作');
      const e = new Error('无权限'); e.handled = true; throw e;
    }
    let j = null;
    try { j = await res.json(); } catch (e) { /* ignore */ }
    if (!j || typeof j.code === 'undefined') {
      // 非 JSON 响应: 多为后端进程未启动/重启中, nginx 返回 502/504 页面; 带上状态码便于排查
      const busy = [502, 503, 504].includes(res.status);
      vant.showToast(busy ? '服务器正在重启或无响应，请稍后刷新(' + res.status + ')' : '服务异常(' + res.status + ')');
      const e = new Error('服务异常'); e.handled = true; throw e;
    }
    if (j.code !== 0) {
      if (!opt.silent) vant.showToast({ message: j.msg || '操作失败', duration: 2600 });
      const e = new Error(j.msg || '操作失败'); e.code = j.code; e.handled = true; throw e;
    }
    return j.data;
  }

  const API = {
    get: (u, o) => request('GET', u, null, o),
    post: (u, d, o) => request('POST', u, d == null ? {} : d, o),
    put: (u, d, o) => request('PUT', u, d == null ? {} : d, o),
    del: (u, o) => request('DELETE', u, null, o),
    delete: (u, o) => request('DELETE', u, null, o),
    upload: async (file) => {
      const fd = new FormData();
      fd.append('file', file);
      const res = await fetch('/api/upload', {
        method: 'POST',
        headers: Store.token ? { Authorization: 'Bearer ' + Store.token } : {},
        body: fd,
      });
      let j = null;
      try { j = await res.json(); } catch (e) {}
      if (!res.ok || !j || j.code !== 0) {
        throw new Error((j && j.msg) || ('上传失败(' + res.status + ')'));
      }
      return j.data && j.data.url;
    },
  };

  /* 字典: [文案, van-tag type] */
  const DICT = {
    cardKind: { 1: '次卡', 2: '时间卡', 3: '储值卡', 4: '私教卡' },
    cardStatus: { 0: ['待开卡', 'primary'], 1: ['使用中', 'success'], 2: ['已过期', 'default'], 3: ['已暂停', 'warning'], 4: ['已停用', 'danger'], 5: ['已退卡', 'default'] },
    ptStatus: { 0: ['待确认', 'warning'], 1: ['已确认', 'primary'], 2: ['已取消', 'default'], 3: ['已完成', 'success'], 4: ['已爽约', 'danger'] },
    groupStatus: { 0: ['候补中', 'warning'], 1: ['已预约', 'primary'], 2: ['已核销', 'success'], 3: ['已取消', 'default'], 4: ['已爽约', 'danger'] },
    signStatus: { 0: ['待签署', 'warning'], 1: ['已签署', 'success'] },
    expireStatus: { 0: ['无卡', 'default'], 1: ['在籍', 'success'], 2: ['已过期', 'danger'] },
    syllabusStatus: { 1: ['正常', 'primary'], 2: ['已取消', 'default'], 3: ['已结课', 'success'] },
    payMethod: { wechat: '微信支付', alipay: '支付宝', cash: '现金', pos: 'POS刷卡', transfer: '转账', store: '储值抵扣', meituan: '美团/大众', other: '其他', import: '历史导入' },
    rechargeType: { 1: '开卡', 2: '续卡', 3: '充值', 4: '退卡' },
    spendScene: { 1: '自由训练', 2: '私教消课', 3: '团课核销', 4: '储值消费', 5: '爽约扣次' },
    maintainType: { 1: '电话', 2: '到店', 3: '微信', 4: '其他' },
    roleName: { platform: '平台', admin: '管理员', manager: '管理员', membership: '管理员', reception: '管理员', coach: '教练' },
    gender: { 0: '保密', 1: '男', 2: '女' },
    labelLv: { 0: '无', 1: 'A类', 2: 'B类', 3: 'C类' },
    port: { 1: '前台签到', 2: '自助签到' },
    openMode: { 1: '立即开卡', 2: '首次使用时开卡', 3: '指定日期开卡' },
  };

  const WEEK = '日一二三四五六';
  const H = {
    num(v) { const n = Number(v || 0); return Math.abs(n % 1) > 0.004 ? n.toFixed(2) : String(Math.round(n)); },
    money(v) { return '¥' + H.num(v); },
    dateOf(s) { return s ? String(s).slice(0, 10) : ''; },
    time(s) { if (!s) return ''; const m = String(s).match(/(\d{1,2}):(\d{2})/); return m ? m[0] : String(s); },
    week(s) { return '周' + WEEK[dayjs(H.dateOf(s)).day()]; },
    day(s) { /* 人性化日期 */
      if (!s) return '';
      const d = dayjs(H.dateOf(s));
      const diff = d.startOf('day').diff(dayjs().startOf('day'), 'day');
      if (diff === 0) return '今天';
      if (diff === 1) return '明天';
      if (diff === 2) return '后天';
      if (diff === -1) return '昨天';
      if (diff > 2 && diff < 7) return '周' + WEEK[d.day()];
      return d.format(d.year() === dayjs().year() ? 'MM-DD' : 'YYYY-MM-DD');
    },
    dt(s) { if (!s) return ''; return H.day(s) + ' ' + H.time(String(s).slice(10)); },
    full(s) { return s ? String(s).slice(0, 16) : ''; },
    isPast(s) { return s ? dayjs(String(s)).isBefore(dayjs()) : false; },
    today() { return dayjs().format('YYYY-MM-DD'); },
    // 日期条: 前后各一个月(今天居中), 过去的日期带 past 标记
    monthDays() { return H.days(61, -30); },
    days(n, offset) { /* 日期条 */
      const arr = [];
      for (let i = 0; i < (n || 7); i++) {
        const d = dayjs().add(i + (offset || 0), 'day');
        const off = i + (offset || 0);
        arr.push({
          date: d.format('YYYY-MM-DD'),
          d: d.format('MM-DD'),
          w: off === 0 ? '今天' : (off === 1 ? '明天' : (off === -1 ? '昨天' : '周' + WEEK[d.day()])),
          past: off < 0,
        });
      }
      return arr;
    },
    stars(n) { let s = ''; for (let i = 0; i < (Number(n) || 1); i++) s += '★'; return s; },
    faceCls(card) { /* 卡面配色 */
      if (card.status >= 2 && card.status !== 3) return 'face-dead';
      return 'face-k' + (card.card_kind || 1);
    },
    cardLeft(c) { /* 卡剩余描述 */
      if (c.card_kind === 2) return '不限次 · 时间卡';
      if (c.card_kind === 3) return '余额 ' + H.money(c.left_money);
      return '剩余 ' + (c.left_counts == null ? '-' : c.left_counts) + ' 次';
    },
    cardExp(c) {
      if (c.status === 0) return c.latest_open_time ? '最晚 ' + H.dateOf(c.latest_open_time) + ' 前开卡' : '待开卡';
      return c.expire_time ? H.dateOf(c.expire_time) + ' 到期' : '';
    },
  };

  window.Store = Store;
  window.API = API;
  window.DICT = DICT;
  window.H = H;
  window.Pages = {};
})();
