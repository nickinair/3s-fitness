/* 共享 API 封装与字典 */
(function () {
  const TOKEN_KEY = 'fit_admin_token';
  const USER_KEY = 'fit_admin_user';
  const CLUB_KEY = 'fit_admin_club';

  function getToken() { return localStorage.getItem(TOKEN_KEY) || ''; }
  function setToken(t) { localStorage.setItem(TOKEN_KEY, t); }
  function getUser() { try { return JSON.parse(localStorage.getItem(USER_KEY) || 'null'); } catch (e) { return null; } }
  function setUser(u) { localStorage.setItem(USER_KEY, JSON.stringify(u)); }
  function getClubId() { return localStorage.getItem(CLUB_KEY) || ''; }
  function setClubId(id) { localStorage.setItem(CLUB_KEY, id == null ? '' : String(id)); }
  function logout() {
    localStorage.removeItem(TOKEN_KEY);
    localStorage.removeItem(USER_KEY);
    location.hash = '#/login';
  }

  function buildQuery(params) {
    if (!params) return '';
    const qs = Object.entries(params)
      .filter(([, v]) => v !== undefined && v !== null && v !== '')
      .map(([k, v]) => encodeURIComponent(k) + '=' + encodeURIComponent(v))
      .join('&');
    return qs ? '?' + qs : '';
  }

  async function request(method, url, data) {
    const headers = {};
    const token = getToken();
    if (token) headers['Authorization'] = 'Bearer ' + token;
    const user = getUser();
    if (user && user.role === 'admin' && getClubId()) headers['X-Club-Id'] = getClubId();
    let fullUrl = '/api' + url;
    let body;
    if (method === 'GET' || method === 'DELETE') {
      fullUrl += buildQuery(data);
    } else {
      headers['Content-Type'] = 'application/json';
      body = JSON.stringify(data || {});
    }
    let res;
    try {
      res = await fetch(fullUrl, { method, headers, body });
    } catch (e) {
      ElementPlus.ElMessage.error('网络异常，请检查服务是否可用');
      e.handled = true; return Promise.reject(e);
    }
    // 滑动续期: 后端快到期时下发新 token, 静默替换, 不打断使用
    const renew = res.headers.get('X-Renew-Token');
    if (renew) setToken(renew);
    if (res.status === 401) {
      logout();
      const e = new Error('未登录'); e.handled = true; return Promise.reject(e);
    }
    if (res.status === 403) {
      ElementPlus.ElMessage.error('无权限执行此操作');
      const e = new Error('无权限'); e.handled = true; return Promise.reject(e);
    }
    let json;
    try { json = await res.json(); } catch (e) {
      ElementPlus.ElMessage.error('服务响应异常');
      e.handled = true; return Promise.reject(e);
    }
    if (json.code !== 0) {
      ElementPlus.ElMessage.error(json.msg || '请求失败');
      return Promise.reject(Object.assign(new Error(json.msg || '请求失败'), { code: json.code, handled: true }));
    }
    return json.data;
  }

  const api = {
    get: (url, params) => request('GET', url, params),
    post: (url, data) => request('POST', url, data),
    put: (url, data) => request('PUT', url, data),
    del: (url, params) => request('DELETE', url, params),
    exportUrl(url, params) {
      const p = Object.assign({}, params, { export: 'csv', token: getToken() });
      return '/api' + url + buildQuery(p);
    },
  };

  /* ============ 字典 ============ */
  const DICT = {
    cardKind: { 1: '次卡', 2: '时间卡', 3: '储值卡', 4: '私教卡' },
    cardKindTag: { 1: 'primary', 2: 'success', 3: 'warning', 4: 'danger' },
    cardStatus: { 0: '待开卡', 1: '使用中', 2: '已过期', 3: '已暂停', 4: '已停用', 5: '已退卡' },
    cardStatusTag: { 0: 'info', 1: 'success', 2: 'danger', 3: 'warning', 4: 'info', 5: 'info' },
    expireStatus: { 0: '无卡', 1: '在籍', 2: '已过期' },
    expireStatusTag: { 0: 'info', 1: 'success', 2: 'danger' },
    ptStatus: { 0: '待确认', 1: '已确认', 2: '已取消', 3: '已完成', 4: '已爽约' },
    ptStatusTag: { 0: 'warning', 1: 'primary', 2: 'info', 3: 'success', 4: 'danger' },
    ptConfirm: { 0: '', 1: '待学员确认消课', 2: '已确认消课' },
    groupBookStatus: { 0: '候补', 1: '已约', 2: '已核销', 3: '已取消', 4: '已爽约' },
    groupBookStatusTag: { 0: 'warning', 1: 'primary', 2: 'success', 3: 'info', 4: 'danger' },
    rechargeType: { 1: '开卡', 2: '续卡', 3: '充值', 4: '退卡' },
    rechargeTypeTag: { 1: 'success', 2: 'primary', 3: 'warning', 4: 'danger' },
    spendScene: { 1: '自由训练', 2: '私教消课', 3: '团课核销', 4: '储值消费', 5: '爽约扣次' },
    spendSceneTag: { 1: 'info', 2: 'danger', 3: 'primary', 4: 'warning', 5: 'danger' },
    payMethod: { wechat: '微信', alipay: '支付宝', cash: '现金', pos: '刷卡', transfer: '转账', meituan: '美团/大众', other: '其他', import: '历史导入' },
    payMethodTag: { wechat: 'success', alipay: 'primary', cash: 'warning', pos: 'info', transfer: 'info' },
    maintainType: { 1: '电话', 2: '到店', 3: '微信', 4: '其他' },
    labelLevel: { 0: '无', 1: 'A', 2: 'B', 3: 'C' },
    labelLevelTag: { 0: 'info', 1: 'danger', 2: 'warning', 3: 'info' },
    syllabusStatus: { 1: '正常', 2: '已取消', 3: '已结课' },
    syllabusStatusTag: { 1: 'success', 2: 'info', 3: 'primary' },
    role: { platform: '平台', admin: '管理员', manager: '管理员', membership: '管理员', reception: '管理员', coach: '教练' },
    roleTag: { admin: 'danger', manager: 'warning', membership: 'primary', reception: 'success', coach: 'info', platform: 'danger' },
    staffStatus: { 0: '已停用', 1: '在职' },
    signStatus: { 0: '待签署', 1: '已签署' },
    signStatusTag: { 0: 'warning', 1: 'success' },
    gender: { 0: '未知', 1: '男', 2: '女' },
    openCardMode: { 1: '立即开卡', 2: '首次使用开卡', 3: '指定日期开卡' },
    yesNo: { 0: '否', 1: '是' },
    /* v2 */
    milestoneType: { 0: '关闭', 1: '按课时', 2: '按天数' },
    milestoneStatus: { 0: '待总结', 1: '已总结' },
    milestoneStatusTag: { 0: 'warning', 1: 'success' },
    intentStatus: { 0: '待跟进', 1: '已开卡', 2: '已关闭' },
    intentStatusTag: { 0: 'warning', 1: 'success', 2: 'info' },
    smsScene: { buy_card: '购卡成功', lesson_done: '销课确认', card_low: '卡将耗尽', milestone: '里程碑', plan_push: '计划推送', intent: '意向确认', booking_ok: '预约成功', verify_code: '安全验证码' },
    smsSceneTag: { buy_card: 'success', lesson_done: 'primary', card_low: 'warning', milestone: 'danger', plan_push: 'info', intent: 'success', booking_ok: 'primary', verify_code: 'info' },
    smsStatus: { 0: '模拟', 1: '成功', 2: '失败' },
    smsStatusTag: { 0: 'info', 1: 'success', 2: 'danger' },
  };

  /* ============ 格式化 ============ */
  function fmtMoney(v, withSign) {
    if (v === null || v === undefined || v === '') return '¥0';
    const n = Number(v);
    if (isNaN(n)) return String(v);
    const s = (Math.round(n * 100) / 100).toLocaleString('zh-CN', { minimumFractionDigits: 0, maximumFractionDigits: 2 });
    return (withSign && n > 0 ? '+' : '') + '¥' + s;
  }
  function fmtTime(t) {
    if (!t) return '-';
    const d = dayjs(t);
    return d.isValid() ? d.format('YYYY-MM-DD HH:mm') : String(t);
  }
  function fmtDate(t) {
    if (!t) return '-';
    const d = dayjs(t);
    return d.isValid() ? d.format('YYYY-MM-DD') : String(t);
  }
  // 昨日对比: 返回 {diff, pct, dir}
  function dayDiff(today, yesterday) {
    const a = Number(today || 0); const b = Number(yesterday || 0);
    const diff = a - b;
    return { diff, dir: diff > 0 ? 'up' : diff < 0 ? 'down' : 'flat' };
  }

  window.Auth = { getToken, setToken, getUser, setUser, getClubId, setClubId, logout, TOKEN_KEY, USER_KEY };
  window.api = api;
  window.DICT = DICT;
  function fmtNum(v) { const n = Number(v); return isNaN(n) ? String(v) : n.toLocaleString('zh-CN', { maximumFractionDigits: 2 }); }
  window.Fmt = { money: fmtMoney, time: fmtTime, date: fmtDate, dayDiff, num: fmtNum };
  window.AppPages = {};
})();
