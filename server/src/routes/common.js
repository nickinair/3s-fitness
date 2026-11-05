const express = require('express');
const dayjs = require('dayjs');
const db = require('../db');
const { ok, fail, BizError, logAction, sendCsv } = require('../util');
const { staffAuth, parseToken } = require('../middleware/auth');

const r = express.Router();

// 我的门店列表
r.get('/clubs', staffAuth(), async (req, res, next) => {
  try {
    const rows = await db.query('SELECT id,name,address,phone,intro,open_time,sort,status FROM biz_club WHERE merchant_id=? ORDER BY sort, id', [req.user.mid]);
    res.json(ok(rows));
  } catch (e) { next(e); }
});

// 新增门店
r.post('/clubs', staffAuth('admin', 'manager'), async (req, res, next) => {
  try {
    const { name, address, phone, intro, open_time, sort } = req.body;
    if (!name) throw new BizError('请填写门店名称');
    const dup = await db.queryOne('SELECT id FROM biz_club WHERE merchant_id=? AND name=?', [req.user.mid, name]);
    if (dup) throw new BizError('已存在同名门店');
    const id = await db.insert(
      'INSERT INTO biz_club (merchant_id,name,address,phone,intro,open_time,sort) VALUES (?,?,?,?,?,?,?)',
      [req.user.mid, name, address || '', phone || '', intro || '', open_time || '06:00-22:00', Number(sort) || 0]);
    await logAction(req, '新增门店', name);
    res.json(ok({ id }));
  } catch (e) { next(e); }
});

// 更新门店信息
r.put('/clubs/:id', staffAuth('admin', 'manager'), async (req, res, next) => {
  try {
    const { name, address, phone, intro, open_time, sort } = req.body;
    await db.exec('UPDATE biz_club SET name=?,address=?,phone=?,intro=?,open_time=?,sort=? WHERE id=? AND merchant_id=?',
      [name, address, phone, intro, open_time, Number(sort) || 0, req.params.id, req.user.mid]);
    await logAction(req, '更新门店信息', name);
    res.json(ok());
  } catch (e) { next(e); }
});

// 来源渠道
r.get('/sources', staffAuth(), async (req, res, next) => {
  try {
    res.json(ok(await db.query('SELECT * FROM biz_user_source WHERE merchant_id=? AND status=1 ORDER BY sort', [req.user.mid])));
  } catch (e) { next(e); }
});
r.post('/sources', staffAuth('admin', 'manager'), async (req, res, next) => {
  try {
    const id = await db.insert('INSERT INTO biz_user_source (merchant_id,title,sort) VALUES (?,?,?)', [req.user.mid, req.body.title, req.body.sort || 0]);
    res.json(ok({ id }));
  } catch (e) { next(e); }
});
r.put('/sources/:id', staffAuth('admin', 'manager'), async (req, res, next) => {
  try {
    await db.exec('UPDATE biz_user_source SET title=?, sort=? WHERE id=? AND merchant_id=?',
      [req.body.title, req.body.sort || 0, req.params.id, req.user.mid]);
    res.json(ok());
  } catch (e) { next(e); }
});
r.delete('/sources/:id', staffAuth('admin', 'manager'), async (req, res, next) => {
  try {
    await db.exec('UPDATE biz_user_source SET status=0 WHERE id=? AND merchant_id=?', [req.params.id, req.user.mid]);
    res.json(ok());
  } catch (e) { next(e); }
});

// ============ 图片上传（banner/头像/卡面图）============
const multer = require('multer');
const path = require('path');
const fs = require('fs');
const uploadDir = path.join(__dirname, '..', '..', 'web', 'uploads');
if (!fs.existsSync(uploadDir)) fs.mkdirSync(uploadDir, { recursive: true });
const upload = multer({
  storage: multer.diskStorage({
    destination: uploadDir,
    filename: (req, file, cb) => {
      const ext = (path.extname(file.originalname) || '.jpg').toLowerCase();
      cb(null, `${Date.now()}_${Math.random().toString(36).slice(2, 8)}${ext}`);
    },
  }),
  limits: { fileSize: 5 * 1024 * 1024 },
  fileFilter: (req, file, cb) => {
    cb(null, /image\/(jpeg|png|gif|webp)/.test(file.mimetype));
  },
});
r.post('/upload', (req, res, next) => {
  const u = parseToken(req);
  if (!u) return res.status(401).json(fail('未登录或登录已过期', 401));
  req.user = u;
  next();
}, upload.single('file'), async (req, res, next) => {
  try {
    if (!req.file) throw new BizError('请选择图片文件（jpg/png/gif/webp，≤5MB）');
    res.json(ok({ url: '/uploads/' + req.file.filename }));
  } catch (e) { next(e); }
});

// ============ 首页 Banner 管理 ============
r.get('/banners', staffAuth(), async (req, res, next) => {
  try {
    res.json(ok(await db.query('SELECT * FROM biz_club_banner WHERE merchant_id=? ORDER BY sort, id', [req.user.mid])));
  } catch (e) { next(e); }
});
r.post('/banners', staffAuth('admin', 'manager'), async (req, res, next) => {
  try {
    const b = req.body;
    if (!b.title && !b.image) throw new BizError('请填写标题或上传图片');
    const id = await db.insert('INSERT INTO biz_club_banner (merchant_id,club_id,image,title,link,sort,status) VALUES (?,?,?,?,?,?,?)',
      [req.user.mid, b.club_id || 0, b.image || '', b.title || '', b.link || '', b.sort || 0, b.status != null ? b.status : 1]);
    await logAction(req, '新增Banner', b.title || b.image);
    res.json(ok({ id }));
  } catch (e) { next(e); }
});
r.put('/banners/:id', staffAuth('admin', 'manager'), async (req, res, next) => {
  try {
    const b = req.body;
    await db.exec('UPDATE biz_club_banner SET image=?,title=?,link=?,sort=?,status=? WHERE id=? AND merchant_id=?',
      [b.image || '', b.title || '', b.link || '', b.sort || 0, b.status != null ? b.status : 1, req.params.id, req.user.mid]);
    res.json(ok());
  } catch (e) { next(e); }
});
r.delete('/banners/:id', staffAuth('admin', 'manager'), async (req, res, next) => {
  try {
    await db.exec('DELETE FROM biz_club_banner WHERE id=? AND merchant_id=?', [req.params.id, req.user.mid]);
    await logAction(req, '删除Banner', `#${req.params.id}`);
    res.json(ok());
  } catch (e) { next(e); }
});

// 员工管理
r.get('/staff', staffAuth(), async (req, res, next) => {
  try {
    const rows = await db.query(
      `SELECT id,club_id,username,realname,phone,role,status,base_salary,sales_rate,course_rate,insert_time FROM sys_user WHERE merchant_id=? ORDER BY id`, [req.user.mid]);
    res.json(ok(rows));
  } catch (e) { next(e); }
});
r.post('/staff', staffAuth('admin', 'manager'), async (req, res, next) => {
  try {
    const bcrypt = require('bcryptjs');
    const { username, password, realname, phone, role, club_id, base_salary, sales_rate, course_rate } = req.body;
    if (!username || !realname || !role) throw new BizError('请填写完整');
    const exist = await db.queryOne('SELECT id FROM sys_user WHERE username=?', [username]);
    if (exist) throw new BizError('账号名已存在');
    const id = await db.insert('INSERT INTO sys_user (merchant_id,club_id,username,password,realname,phone,role,base_salary,sales_rate,course_rate) VALUES (?,?,?,?,?,?,?,?,?,?)',
      [req.user.mid, club_id || req.clubId, username, await bcrypt.hash(password || '123456', 10), realname, phone || '', role,
        Number(base_salary) || 0, Number(sales_rate) || 0, Number(course_rate) || 0]);
    if (role === 'coach') {
      await db.insert('INSERT INTO biz_club_coach (merchant_id,club_id,user_id,realname) VALUES (?,?,?,?)',
        [req.user.mid, club_id || req.clubId, id, realname]);
    }
    await logAction(req, '新增员工', `${realname}(${role})`);
    res.json(ok({ id }));
  } catch (e) { next(e); }
});
r.put('/staff/:id', staffAuth('admin', 'manager'), async (req, res, next) => {
  try {
    const { realname, phone, role, club_id, status, base_salary, sales_rate, course_rate } = req.body;
    await db.exec('UPDATE sys_user SET realname=?,phone=?,role=?,club_id=?,status=?,base_salary=?,sales_rate=?,course_rate=? WHERE id=? AND merchant_id=?',
      [realname, phone, role, club_id, status, Number(base_salary) || 0, Number(sales_rate) || 0, Number(course_rate) || 0, req.params.id, req.user.mid]);
    await logAction(req, '更新员工', realname);
    res.json(ok());
  } catch (e) { next(e); }
});
r.post('/staff/:id/reset-password', staffAuth('admin', 'manager'), async (req, res, next) => {
  try {
    const bcrypt = require('bcryptjs');
    await db.exec('UPDATE sys_user SET password=? WHERE id=? AND merchant_id=?',
      [await bcrypt.hash(req.body.password || '123456', 10), req.params.id, req.user.mid]);
    res.json(ok());
  } catch (e) { next(e); }
});

// 公告（商户看平台的 + 自己发的）
r.get('/notices', staffAuth(), async (req, res, next) => {
  try {
    const rows = await db.query(
      `SELECT * FROM sys_notice WHERE status=1 AND (scope=1 AND merchant_id IN (0,?) OR scope=2 AND merchant_id=?) ORDER BY insert_time DESC LIMIT 50`,
      [req.user.mid, req.user.mid]);
    res.json(ok(rows));
  } catch (e) { next(e); }
});
r.post('/notices', staffAuth('admin', 'manager'), async (req, res, next) => {
  try {
    const id = await db.insert('INSERT INTO sys_notice (scope,merchant_id,title,content) VALUES (2,?,?,?)',
      [req.user.mid, req.body.title, req.body.content]);
    res.json(ok({ id }));
  } catch (e) { next(e); }
});
r.delete('/notices/:id', staffAuth('admin', 'manager'), async (req, res, next) => {
  try {
    const rst = await db.exec('UPDATE sys_notice SET status=0 WHERE id=? AND scope=2 AND merchant_id=?', [req.params.id, req.user.mid]);
    if (!rst.affectedRows) throw new BizError('仅能下线本商户发布的公告');
    res.json(ok());
  } catch (e) { next(e); }
});

// 操作日志
r.get('/logs', staffAuth('admin', 'manager'), async (req, res, next) => {
  try {
    if (req.query.export === 'csv') {
      // 导出走全量(不截断200条), 并带出门店名
      // 与前端筛选保持一致: from/to/keyword(操作人/动作/详情)
      const cond = ['l.merchant_id=?']; const params = [req.user.mid];
      if (req.query.from) { cond.push('l.insert_time>=?'); params.push(req.query.from + ' 00:00:00'); }
      if (req.query.to) { cond.push('l.insert_time<=?'); params.push(req.query.to + ' 23:59:59'); }
      if (req.query.keyword) {
        cond.push('(l.username LIKE ? OR l.action LIKE ? OR l.detail LIKE ?)');
        const k = `%${req.query.keyword}%`; params.push(k, k, k);
      }
      const all = await db.query(
        `SELECT l.*, c.name club_name FROM sys_log l LEFT JOIN biz_club c ON c.id=l.club_id
         WHERE ${cond.join(' AND ')} ORDER BY l.id DESC`, params);
      all.forEach(x => {
        x.insert_time_label = x.insert_time ? dayjs(x.insert_time).format('YYYY-MM-DD HH:mm') : '';
        x.club_name = x.club_name || '全部门店';
      });
      return sendCsv(res, `操作日志_${dayjs().format('YYYYMMDD')}`, [
        ['insert_time_label', '时间'], ['username', '操作人'], ['action', '动作'], ['detail', '详情'], ['club_name', '门店'],
      ], all);
    }
    const rows = await db.query('SELECT * FROM sys_log WHERE merchant_id=? ORDER BY id DESC LIMIT 200', [req.user.mid]);
    res.json(ok(rows));
  } catch (e) { next(e); }
});

// ============ 工作台自定义布局 (按员工持久化; 空数组 = 恢复角色默认) ============
const widget = require('../widget');
r.get('/workbench', staffAuth(), async (req, res, next) => {
  try {
    res.json(ok({ items: await widget.loadWidget(req.user.uid, 'staff_workbench') }));
  } catch (e) { next(e); }
});
r.put('/workbench', staffAuth(), async (req, res, next) => {
  try {
    const items = await widget.saveWidget(req.user.uid, 'staff_workbench', req.body.items);
    await logAction(req, '自定义工作台', items.length ? `${items.length} 个功能` : '恢复默认');
    res.json(ok({ items }));
  } catch (e) { next(e); }
});

module.exports = r;
