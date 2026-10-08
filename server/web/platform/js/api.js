// 平台总后台 API 封装
const TOKEN_KEY = 'fit_platform_token';
const USER_KEY = 'fit_platform_user';

const api = {
  token() { return localStorage.getItem(TOKEN_KEY) || ''; },
  user() { try { return JSON.parse(localStorage.getItem(USER_KEY) || 'null'); } catch { return null; } },
  saveAuth(token, user) { localStorage.setItem(TOKEN_KEY, token); localStorage.setItem(USER_KEY, JSON.stringify(user)); },
  clearAuth() { localStorage.removeItem(TOKEN_KEY); localStorage.removeItem(USER_KEY); },

  async request(method, url, body) {
    const headers = { 'Content-Type': 'application/json' };
    if (this.token()) headers.Authorization = 'Bearer ' + this.token();
    const resp = await fetch('/api' + url, { method, headers, body: body ? JSON.stringify(body) : undefined });
    // 滑动续期
    const renew = resp.headers.get('X-Renew-Token');
    if (renew) localStorage.setItem(TOKEN_KEY, renew);
    if (resp.status === 401 || resp.status === 403) {
      if (resp.status === 401) { this.clearAuth(); location.hash = '#/login'; }
      const j = await resp.json().catch(() => ({ msg: '无权限' }));
      ElementPlus.ElMessage.error(j.msg || '无权限');
      throw new Error(j.msg);
    }
    const j = await resp.json();
    if (j.code !== 0) { ElementPlus.ElMessage.error(j.msg || '请求失败'); throw new Error(j.msg); }
    return j.data;
  },
  get(url) { return this.request('GET', url); },
  post(url, body) { return this.request('POST', url, body); },
  put(url, body) { return this.request('PUT', url, body); },
  del(url) { return this.request('DELETE', url); },
};

const fmtMoney = (v) => '¥' + Number(v || 0).toLocaleString('zh-CN', { maximumFractionDigits: 2 });
const fmtTime = (v) => (v ? String(v).slice(0, 16) : '—');
