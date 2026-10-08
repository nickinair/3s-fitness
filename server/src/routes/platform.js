const express = require('express');
const bcrypt = require('bcryptjs');
const dayjs = require('dayjs');
const db = require('../db');
const { ok, BizError, page, logAction } = require('../util');
const { staffAuth } = require('../middleware/auth');

const r = express.Router();
r.use(staffAuth('platform'));

// 平台概览
r.get('/stats', async (req, res, next) => {
  try {
    const [row] = await db.query(
      `SELECT
        (SELECT COUNT(*) FROM sys_merchant) merchants,
        (SELECT COUNT(*) FROM sys_merchant WHERE status=1) active_merchants,
        (SELECT COUNT(*) FROM biz_club) clubs,
        (SELECT COUNT(*) FROM biz_vip_user WHERE status=1) members,
        (SELECT COUNT(*) FROM sys_user WHERE merchant_id>0) staff,
        (SELECT COALESCE(SUM(actual_money),0) FROM biz_card_recharge WHERE DATE_FORMAT(insert_time,'%Y-%m')=DATE_FORMAT(NOW(),'%Y-%m')) month_revenue,
        (SELECT COALESCE(SUM(actual_money),0) FROM biz_card_recharge) total_revenue`);
    const trend = await db.query(
      `SELECT DATE_FORMAT(insert_time,'%Y-%m') m, SUM(actual_money) money FROM biz_card_recharge
       WHERE insert_time >= DATE_SUB(CURDATE(), INTERVAL 12 MONTH) GROUP BY 1 ORDER BY 1`);
    const byMerchant = await db.query(
      `SELECT m.id, m.name,
        (SELECT COUNT(*) FROM biz_club c WHERE c.merchant_id=m.id) clubs,
        (SELECT COUNT(*) FROM biz_vip_user v WHERE v.merchant_id=m.id AND v.status=1) members,
        (SELECT COALESCE(SUM(rc.actual_money),0) FROM biz_card_recharge rc WHERE rc.merchant_id=m.id AND DATE_FORMAT(rc.insert_time,'%Y-%m')=DATE_FORMAT(NOW(),'%Y-%m')) month_revenue
       FROM sys_merchant m ORDER BY m.id`);
    res.json(ok({ stats: row, trend, byMerchant }));
  } catch (e) { next(e); }
});

// 商户列表
r.get('/merchants', async (req, res, next) => {
  try {
    const rows = await db.query(
      `SELECT m.*,
        (SELECT COUNT(*) FROM biz_club c WHERE c.merchant_id=m.id) club_count,
        (SELECT COUNT(*) FROM biz_vip_user v WHERE v.merchant_id=m.id AND v.status=1) member_count,
        (SELECT username FROM sys_user u WHERE u.merchant_id=m.id AND u.role='admin' LIMIT 1) admin_username
       FROM sys_merchant m ORDER BY m.id DESC`);
    res.json(ok(rows));
  } catch (e) { next(e); }
});

// 开通商户（商户 + 首店 + 管理员账号）
r.post('/merchants', async (req, res, next) => {
  try {
    const { name, contact, phone, expire_time, club_name, club_address, admin_username, admin_password } = req.body;
    if (!name || !admin_username) throw new BizError('请填写商户名称与管理员账号');
    const dup = await db.queryOne('SELECT id FROM sys_user WHERE username=?', [admin_username]);
    if (dup) throw new BizError('管理员账号名已存在');
    const result = await db.tx(async (t) => {
      const mid = await t.insert('INSERT INTO sys_merchant (name,contact,phone,status,expire_time) VALUES (?,?,?,1,?)',
        [name, contact || '', phone || '', expire_time || dayjs().add(1, 'year').format('YYYY-MM-DD 23:59:59')]);
      const clubId = await t.insert('INSERT INTO biz_club (merchant_id,name,address) VALUES (?,?,?)',
        [mid, club_name || `${name}·总店`, club_address || '']);
      await t.insert('INSERT INTO sys_user (merchant_id,club_id,username,password,realname,role) VALUES (?,0,?,?,?,\'admin\')',
        [mid, admin_username, await bcrypt.hash(admin_password || 'admin123', 10), `${name}管理员`]);
      await t.exec('INSERT INTO biz_user_source (merchant_id,title,sort) VALUES (?,\'自然到店\',1),(?,\'朋友介绍\',2),(?,\'线上渠道\',3)', [mid, mid, mid]);
      return { merchant_id: mid, club_id: clubId };
    });
    await logAction(req, '开通商户', name);
    res.json(ok(result));
  } catch (e) { next(e); }
});

r.put('/merchants/:id', async (req, res, next) => {
  try {
    const { name, contact, phone, status, expire_time, remark } = req.body;
    await db.exec('UPDATE sys_merchant SET name=?,contact=?,phone=?,status=?,expire_time=?,remark=? WHERE id=?',
      [name, contact || '', phone || '', status != null ? status : 1, expire_time || null, remark || '', req.params.id]);
    await logAction(req, '更新商户', `#${req.params.id} ${name} status=${status}`);
    res.json(ok());
  } catch (e) { next(e); }
});

// 商户门店
r.get('/merchants/:id/clubs', async (req, res, next) => {
  try {
    res.json(ok(await db.query('SELECT * FROM biz_club WHERE merchant_id=? ORDER BY sort, id', [req.params.id])));
  } catch (e) { next(e); }
});
r.post('/merchants/:id/clubs', async (req, res, next) => {
  try {
    const id = await db.insert('INSERT INTO biz_club (merchant_id,name,address,phone) VALUES (?,?,?,?)',
      [req.params.id, req.body.name, req.body.address || '', req.body.phone || '']);
    res.json(ok({ id }));
  } catch (e) { next(e); }
});

// 平台公告
r.get('/notices', async (req, res, next) => {
  try {
    res.json(ok(await db.query('SELECT * FROM sys_notice WHERE scope=1 ORDER BY id DESC LIMIT 100')));
  } catch (e) { next(e); }
});
r.post('/notices', async (req, res, next) => {
  try {
    const id = await db.insert('INSERT INTO sys_notice (scope,merchant_id,title,content) VALUES (1,?,?,?)',
      [req.body.merchant_id || 0, req.body.title, req.body.content]);
    res.json(ok({ id }));
  } catch (e) { next(e); }
});
r.delete('/notices/:id', async (req, res, next) => {
  try {
    await db.exec('UPDATE sys_notice SET status=0 WHERE id=?', [req.params.id]);
    res.json(ok());
  } catch (e) { next(e); }
});

// 日志监控（全平台）
r.get('/logs', async (req, res, next) => {
  try {
    const { merchant_id } = req.query;
    const cond = []; const params = [];
    if (merchant_id) { cond.push('l.merchant_id=?'); params.push(merchant_id); }
    const rows = await db.query(
      `SELECT l.*, m.name merchant_name FROM sys_log l LEFT JOIN sys_merchant m ON m.id=l.merchant_id
       ${cond.length ? 'WHERE ' + cond.join(' AND ') : ''} ORDER BY l.id DESC LIMIT 300`, params);
    res.json(ok(rows));
  } catch (e) { next(e); }
});

module.exports = r;
