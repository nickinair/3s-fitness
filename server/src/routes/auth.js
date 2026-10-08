const express = require('express');
const bcrypt = require('bcryptjs');
const db = require('../db');
const { ok, BizError, logAction } = require('../util');
const { sign, staffAuth, memberAuth, parseToken } = require('../middleware/auth');

const r = express.Router();

// 员工/管理端登录
r.post('/login', async (req, res, next) => {
  try {
    const { username, password } = req.body;
    if (!username || !password) throw new BizError('请输入账号与密码');
    const u = await db.queryOne('SELECT * FROM sys_user WHERE username=?', [username]);
    if (!u || !(await bcrypt.compare(password, u.password))) throw new BizError('账号或密码错误');
    if (u.status !== 1) throw new BizError('账号已被停用');
    if (u.merchant_id) {
      const m = await db.queryOne('SELECT status FROM sys_merchant WHERE id=?', [u.merchant_id]);
      if (!m || m.status !== 1) throw new BizError('商户已停用，请联系平台');
    }
    // 只要建了教练档案就绑定教练身份(不限角色): 管理员/店长同时带教时, 学员、课表、消课、
    // 训练计划等教练功能才能拿到本人的 coachId。纯管理岗(无档案)仍为 0, 由页面的教练选择器兜底。
    const c = await db.queryOne('SELECT id FROM biz_club_coach WHERE user_id=? AND status=1', [u.id]);
    const coachId = c ? c.id : 0;
    const token = sign({ type: 'staff', uid: u.id, name: u.realname, role: u.role, mid: u.merchant_id, cid: u.club_id, coachId });
    req.user = { uid: u.id, name: u.realname, mid: u.merchant_id, cid: u.club_id };
    await logAction(req, '登录', `${u.realname}(${u.role}) 登录系统`);
    res.json(ok({
      token,
      user: { id: u.id, username: u.username, realname: u.realname, role: u.role, merchant_id: u.merchant_id, club_id: u.club_id, coach_id: coachId },
    }));
  } catch (e) { next(e); }
});

// 会员登录（手机号+密码, 模拟微信手机号快捷登录）
r.post('/member/login', async (req, res, next) => {
  try {
    const { phone, password } = req.body;
    if (!phone) throw new BizError('请输入手机号');
    const v = await db.queryOne('SELECT * FROM biz_vip_user WHERE phone=? AND status=1', [phone]);
    if (!v) throw new BizError('该手机号未注册，请先注册');
    if (!(await bcrypt.compare(password || '', v.password))) throw new BizError('手机号或密码错误');
    const token = sign({ type: 'member', vip: v.id, name: v.realname, mid: v.merchant_id });
    res.json(ok({ token, user: memberProfile(v) }));
  } catch (e) { next(e); }
});

// 会员注册（对应 PRD 微信绑定: 手机号匹配已有档案则直接绑定）
r.post('/member/register', async (req, res, next) => {
  try {
    const { phone, realname, password, gender } = req.body;
    if (!phone || !/^1\d{10}$/.test(phone)) throw new BizError('请输入正确的手机号');
    if (!password || password.length < 6) throw new BizError('密码至少6位');
    const bcryptPwd = await bcrypt.hash(password, 10);
    let v = await db.queryOne('SELECT * FROM biz_vip_user WHERE merchant_id=1 AND phone=?', [phone]);
    if (v) {
      // 已有档案(门店录入) → 绑定并设置密码
      await db.exec('UPDATE biz_vip_user SET password=?, realname=IF(realname="",?,realname), nickname=IF(nickname="",?,nickname) WHERE id=?',
        [bcryptPwd, realname || '', realname || '', v.id]);
    } else {
      const id = await db.insert(
        `INSERT INTO biz_vip_user (merchant_id, phone, password, realname, nickname, gender, source_id, source_name)
         VALUES (1,?,?,?,?,?,0,'小程序注册')`, [phone, bcryptPwd, realname || '', realname || '', gender || 0]);
      await db.exec('INSERT IGNORE INTO biz_user_club (vip_user_id, club_id) VALUES (?,1)', [id]);
      v = await db.queryOne('SELECT * FROM biz_vip_user WHERE id=?', [id]);
    }
    v = await db.queryOne('SELECT * FROM biz_vip_user WHERE merchant_id=1 AND phone=?', [phone]);
    const token = sign({ type: 'member', vip: v.id, name: v.realname, mid: v.merchant_id });
    res.json(ok({ token, user: memberProfile(v) }));
  } catch (e) { next(e); }
});

function memberProfile(v) {
  return {
    id: v.id, phone: v.phone, realname: v.realname, nickname: v.nickname, avatar: v.avatar,
    gender: v.gender, birthday: v.birthday, points: v.points, expire_status: v.expire_status,
    expire_time: v.expire_time, is_black: v.is_black,
  };
}

// 当前登录信息
r.get('/me', (req, res) => {
  const u = parseToken(req);
  if (!u) return res.json(ok(null));
  res.json(ok(u));
});

// 修改密码（员工）
r.post('/change-password', staffAuth(), async (req, res, next) => {
  try {
    const { old_password, new_password } = req.body;
    if (!new_password || new_password.length < 6) throw new BizError('新密码至少6位');
    const u = await db.queryOne('SELECT * FROM sys_user WHERE id=?', [req.user.uid]);
    if (!(await bcrypt.compare(old_password || '', u.password))) throw new BizError('原密码错误');
    await db.exec('UPDATE sys_user SET password=? WHERE id=?', [await bcrypt.hash(new_password, 10), u.id]);
    res.json(ok());
  } catch (e) { next(e); }
});

module.exports = r;
