const jwt = require('jsonwebtoken');
const config = require('../config');
const { fail } = require('../util');

const TOKEN_TTL_DAYS = 30;
// 剩余有效期不足这个天数就自动续签, 只要在有效期内用过一次就不会被踢出去
const RENEW_BEFORE_DAYS = 20;

function sign(payload) {
  // 重签时要去掉旧的 iat/exp, 否则 jsonwebtoken 会报重复字段
  const { iat, exp, ...rest } = payload;
  return jwt.sign(rest, config.jwtSecret, { expiresIn: `${TOKEN_TTL_DAYS}d` });
}

/* 滑动续期: 快到期时用「数据库里的最新信息」重签一枚, 通过响应头下发给前端。
   顺带解决角色/教练身份变更后必须重新登录才生效的问题。 */
async function maybeRenew(req, res, u) {
  try {
    const leftMs = (u.exp || 0) * 1000 - Date.now();
    if (leftMs > RENEW_BEFORE_DAYS * 86400000) return;
    const db = require('../db');
    let payload;
    if (u.type === 'staff') {
      const su = await db.queryOne('SELECT id,realname,role,merchant_id,club_id,status FROM sys_user WHERE id=?', [u.uid]);
      if (!su || su.status !== 1) return;                 // 已停用的账号不再续期, 让它自然过期
      const c = await db.queryOne('SELECT id FROM biz_club_coach WHERE user_id=? AND status=1', [su.id]);
      payload = { type: 'staff', uid: su.id, name: su.realname, role: su.role, mid: su.merchant_id, cid: su.club_id, coachId: c ? c.id : 0 };
    } else {
      const v = await db.queryOne('SELECT id,realname,merchant_id,status FROM biz_vip_user WHERE id=?', [u.vip]);
      if (!v || v.status !== 1) return;
      payload = { type: 'member', vip: v.id, name: v.realname, mid: v.merchant_id };
    }
    res.setHeader('X-Renew-Token', sign(payload));
  } catch (e) { /* 续期失败不影响本次请求 */ }
}

function parseToken(req) {
  const h = req.headers.authorization || '';
  const token = h.startsWith('Bearer ') ? h.slice(7) : (req.query.token || '');
  if (!token) return null;
  try { return jwt.verify(token, config.jwtSecret); } catch { return null; }
}

// 商户首个门店(缓存): 写操作需要确定门店而请求未指定时的兜底
const firstClubCache = {};
async function firstClubOf(mid) {
  if (!mid) return 1;
  if (firstClubCache[mid]) return firstClubCache[mid];
  const db = require('../db');
  const c = await db.queryOne('SELECT id FROM biz_club WHERE merchant_id=? AND status=1 ORDER BY id LIMIT 1', [mid]);
  firstClubCache[mid] = c ? c.id : 1;
  return firstClubCache[mid];
}

// 员工端鉴权 (platform/admin/manager/membership/reception/coach)
// req.clubScope: 读数据的门店口径, null=全部门店 (仅 admin/platform 可用)
// req.clubId:    写数据用的确定门店
function staffAuth(...roles) {
  return async (req, res, next) => {
    const u = parseToken(req);
    if (!u || u.type !== 'staff') return res.status(401).json(fail('未登录或登录已过期', 401));
    if (roles.length && !roles.includes(u.role)) return res.status(403).json(fail('无权限执行此操作', 403));
    req.user = u;
    await maybeRenew(req, res, u);
    const hc = parseInt(req.headers['x-club-id']);
    try {
      if (u.role === 'admin' || u.role === 'platform') {
        req.clubScope = hc || null; // 未指定或 all = 全部门店
        req.clubId = hc || u.cid || await firstClubOf(u.mid);
      } else {
        req.clubId = u.cid || hc || await firstClubOf(u.mid);
        req.clubScope = req.clubId;
      }
    } catch (e) { req.clubId = u.cid || hc || 1; req.clubScope = req.clubId; }
    next();
  };
}

// 会员端鉴权
function memberAuth(req, res, next) {
  const u = parseToken(req);
  if (!u || u.type !== 'member') return res.status(401).json(fail('未登录或登录已过期', 401));
  req.user = u;
  maybeRenew(req, res, u);
  const hc = parseInt(req.headers['x-club-id']);
  Promise.resolve(hc || firstClubOf(u.mid)).then(c => { req.clubId = c; next(); }).catch(() => { req.clubId = hc || 1; next(); });
}

module.exports = { sign, parseToken, staffAuth, memberAuth, firstClubOf, TOKEN_TTL_DAYS };
