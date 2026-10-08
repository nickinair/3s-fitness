const express = require('express');
const dayjs = require('dayjs');
const db = require('../db');
const { ok, BizError, page, logAction, lifecycleTick, sendCsv, now, CARD_KIND, CARD_STATUS, PAY_METHODS } = require('../util');
const { staffAuth } = require('../middleware/auth');

const r = express.Router();

// ---- 会员列表 ----
// status: active(在籍) / expired(过期召回池) / none(无卡) / all; 支持关键词/卡类型/业绩归属/教练筛选
r.get('/members', staffAuth(), async (req, res, next) => {
  try {
    await lifecycleTick();
    const { p, size, offset } = page(req);
    const { status = 'all', keyword = '', card_type_id, membership_id, coach_id, expire_within, club_id, quick, export: exp } = req.query;
    const cond = ['v.merchant_id=?', 'v.status=1']; const params = [req.user.mid];
    if (status === 'active') cond.push('v.expire_status=1');
    if (status === 'expired') cond.push('v.expire_status=2');
    if (status === 'none') cond.push('v.expire_status=0');
    // 顶部统计条点击下钻: 口径必须与下面 stats 的四个 SUM 完全一致, 否则数字与列表对不上
    if (quick === 'active') cond.push('v.expire_status=1');
    if (quick === 'today_expire') cond.push('v.expire_status=1 AND DATE(v.expire_time)=CURDATE()');
    if (quick === 'expired') cond.push('v.expire_status=2');
    if (quick === 'month_new') cond.push("v.insert_time >= DATE_FORMAT(CURDATE(), '%Y-%m-01')");
    if (keyword) { cond.push('(v.realname LIKE ? OR v.nickname LIKE ? OR v.phone LIKE ?)'); params.push(`%${keyword}%`, `%${keyword}%`, `%${keyword}%`); }
    if (membership_id) { cond.push('v.membership_id=?'); params.push(membership_id); }
    if (coach_id) { cond.push('v.coach_id=?'); params.push(coach_id); }
    if (card_type_id) { cond.push('EXISTS (SELECT 1 FROM biz_member_card c WHERE c.vip_id=v.id AND c.card_type_id=? AND c.status IN (0,1,3))'); params.push(card_type_id); }
    if (expire_within) { cond.push('v.expire_status=1 AND v.expire_time <= ?'); params.push(dayjs().add(Number(expire_within), 'day').format('YYYY-MM-DD 23:59:59')); }
    // 会员归属由开卡门店决定(纪要第九章): 按名下卡的归属门店筛选
    if (club_id && club_id !== 'all') { cond.push('EXISTS (SELECT 1 FROM biz_member_card mc WHERE mc.vip_id=v.id AND mc.club_id=?)'); params.push(club_id); }
    const where = cond.join(' AND ');
    const [{ total }] = await db.query(`SELECT COUNT(*) total FROM biz_vip_user v WHERE ${where}`, params);
    const rows = await db.query(
      `SELECT v.id,v.phone,v.realname,v.nickname,v.avatar,v.gender,v.birthday,v.source_name,v.membership_id,v.membership_name,
              v.coach_id,v.coach_name,v.points,v.expire_time,v.expire_status,v.last_sign_time,v.last_maintain_time,v.label_levels,
              v.is_black,v.remark,v.insert_time,
              (SELECT COUNT(*) FROM biz_member_card c WHERE c.vip_id=v.id AND c.status IN (0,1,3)) card_count,
              (SELECT GROUP_CONCAT(DISTINCT c.card_type_name SEPARATOR ' / ') FROM biz_member_card c WHERE c.vip_id=v.id AND c.status IN (0,1,3)) card_names,
              -- 所属门店 = 名下卡的开卡门店(分成按开卡店算); 在两个店都开过卡的会两个都列出来
              (SELECT GROUP_CONCAT(DISTINCT cl.name ORDER BY cl.id SEPARATOR ' / ') FROM biz_member_card c
                 JOIN biz_club cl ON cl.id=c.club_id WHERE c.vip_id=v.id) club_names,
              -- 剩余次数/总次数(所有有效卡汇总)
              (SELECT SUM(c.left_counts) FROM biz_member_card c WHERE c.vip_id=v.id AND c.status IN (0,1,3)) total_left_counts,
              (SELECT SUM(c.counts) FROM biz_member_card c WHERE c.vip_id=v.id AND c.status IN (0,1,3)) total_counts,
              -- 剩余价值(次卡/私教卡按 left_counts × unit_price; 储值卡按 left_money; 时间卡按 actual_money 按天摊)
              (SELECT ROUND(SUM(
                CASE WHEN c.card_kind IN (1,4) THEN c.left_counts * c.unit_price
                     WHEN c.card_kind = 3 THEN c.left_money + c.left_gift_money
                     WHEN c.card_kind = 2 THEN GREATEST(0, ROUND(c.actual_money * GREATEST(0, DATEDIFF(c.expire_time, NOW())) / GREATEST(1, c.expire_days), 2))
                     ELSE 0 END
              ), 2) FROM biz_member_card c WHERE c.vip_id=v.id AND c.status IN (0,1,3)) remaining_value,
              -- 最近开卡时间
              (SELECT MAX(c.open_card_time) FROM biz_member_card c WHERE c.vip_id=v.id AND c.status IN (0,1,3)) last_open_card_time,
              -- 经手人(最近一张卡的经手人)
              (SELECT c.ope_username FROM biz_member_card c WHERE c.vip_id=v.id AND c.status IN (0,1,3) ORDER BY c.id DESC LIMIT 1) ope_username,
              -- 实体卡号(所有有效卡, 逗号拼接)
              (SELECT GROUP_CONCAT(DISTINCT c.physical_card_no SEPARATOR ' / ') FROM biz_member_card c WHERE c.vip_id=v.id AND c.status IN (0,1,3) AND c.physical_card_no != '') physical_card_nos
       FROM biz_vip_user v WHERE ${where} ORDER BY v.id DESC ${exp ? '' : 'LIMIT ? OFFSET ?'}`,
      exp ? params : [...params, size, offset]);
    if (exp) {
      return sendCsv(res, `会员列表_${dayjs().format('YYYYMMDD')}`, [
        ['id', '会员ID'], ['realname', '姓名'], ['phone', '手机号'], ['club_names', '开卡门店'], ['card_names', '持有卡'],
        ['total_left_counts', '剩余次数'], ['total_counts', '总次数'], ['remaining_value', '剩余价值'],
        ['expire_time', '最近到期'], ['last_open_card_time', '开卡时间'],
        ['membership_name', '会籍顾问'], ['coach_name', '跟进教练'], ['ope_username', '经手人'],
        ['source_name', '来源'], ['physical_card_nos', '实体卡号'],
        ['last_sign_time', '最近签到'], ['insert_time', '创建时间'],
      ], rows);
    }
    const statsCond = ['v.merchant_id=?', 'v.status=1'];
    const statsParams = [req.user.mid];
    if (keyword) { statsCond.push('(v.realname LIKE ? OR v.nickname LIKE ? OR v.phone LIKE ?)'); statsParams.push(`%${keyword}%`, `%${keyword}%`, `%${keyword}%`); }
    if (membership_id) { statsCond.push('v.membership_id=?'); statsParams.push(membership_id); }
    if (coach_id) { statsCond.push('v.coach_id=?'); statsParams.push(coach_id); }
    if (card_type_id) { statsCond.push('EXISTS (SELECT 1 FROM biz_member_card c WHERE c.vip_id=v.id AND c.card_type_id=? AND c.status IN (0,1,3))'); statsParams.push(card_type_id); }
    if (expire_within) { statsCond.push('v.expire_status=1 AND v.expire_time <= ?'); statsParams.push(dayjs().add(Number(expire_within), 'day').format('YYYY-MM-DD 23:59:59')); }
    if (club_id && club_id !== 'all') { statsCond.push('EXISTS (SELECT 1 FROM biz_member_card mc WHERE mc.vip_id=v.id AND mc.club_id=?)'); statsParams.push(club_id); }

    // 顶部统计条
    const [stats] = await db.query(
      `SELECT IFNULL(SUM(v.expire_status=1), 0) active_count,
              IFNULL(SUM(v.expire_status=1 AND DATE(v.expire_time)=CURDATE()), 0) today_expire,
              IFNULL(SUM(v.expire_status=2), 0) expired_count,
              IFNULL(SUM(v.insert_time >= DATE_FORMAT(CURDATE(), '%Y-%m-01')), 0) month_new
       FROM biz_vip_user v WHERE ${statsCond.join(' AND ')}`, statsParams);
    res.json(ok({ list: rows, total, page: p, stats }));
  } catch (e) { next(e); }
});

// ---- 会员概况（结构统计）----
r.get('/members/overview', staffAuth(), async (req, res, next) => {
  try {
    const mid = req.user.mid;
    const [counts] = await db.query(
      `SELECT COUNT(*) total, SUM(expire_status=1) active, SUM(expire_status=2) expired, SUM(expire_status=0) none FROM biz_vip_user WHERE merchant_id=? AND status=1`, [mid]);
    const trend = await db.query(
      `SELECT DATE_FORMAT(insert_time,'%Y-%m') month, COUNT(*) cnt FROM biz_vip_user WHERE merchant_id=? AND status=1
       AND insert_time >= DATE_SUB(CURDATE(), INTERVAL 12 MONTH) GROUP BY 1 ORDER BY 1`, [mid]);
    const byCard = await db.query(
      `SELECT card_type_name name, COUNT(DISTINCT vip_id) cnt FROM biz_member_card WHERE merchant_id=? AND status IN (0,1,3) GROUP BY card_type_name ORDER BY cnt DESC`, [mid]);
    const bySource = await db.query(
      `SELECT IF(source_name='','未知',source_name) name, COUNT(*) cnt FROM biz_vip_user WHERE merchant_id=? AND status=1 GROUP BY 1 ORDER BY cnt DESC`, [mid]);
    if (req.query.export === 'csv') {
      const key = String(req.query.section || 'counts');
      const secs = {
        counts: { name: '会员构成', headers: [['name', '分类'], ['cnt', '人数']],
          rows: [['累计会员', counts.total], ['在籍会员', counts.active], ['已过期', counts.expired], ['无卡会员', counts.none]].map(x => ({ name: x[0], cnt: Number(x[1] || 0) })) },
        trend: { name: '新增会员趋势', headers: [['month', '月份'], ['cnt', '新增会员']], rows: trend },
        by_card: { name: '按卡类型', headers: [['name', '卡类型'], ['cnt', '持卡人数']], rows: byCard },
        by_source: { name: '按来源', headers: [['name', '来源'], ['cnt', '人数']], rows: bySource },
      };
      const sec = secs[key];
      if (!sec) throw new BizError('不支持导出的板块: ' + key);
      return sendCsv(res, `会员概况_${sec.name}_${dayjs().format('YYYYMMDD')}`, sec.headers, sec.rows);
    }
    res.json(ok({ counts, trend, byCard, bySource }));
  } catch (e) { next(e); }
});

// ---- 会员详情（档案+权益快照+卡+流水+维护+预约+签到）----
r.get('/members/:id', staffAuth(), async (req, res, next) => {
  try {
    await lifecycleTick();
    const v = await db.queryOne('SELECT * FROM biz_vip_user WHERE id=? AND merchant_id=?', [req.params.id, req.user.mid]);
    if (!v) throw new BizError('会员不存在');
    delete v.password;
    const cards = await db.query('SELECT * FROM biz_member_card WHERE vip_id=? ORDER BY FIELD(status,1,0,3,2,4,5), id DESC', [v.id]);
    const recharges = await db.query('SELECT * FROM biz_card_recharge WHERE vip_id=? ORDER BY id DESC LIMIT 50', [v.id]);
    const spends = await db.query('SELECT * FROM biz_card_spend WHERE vip_id=? ORDER BY id DESC LIMIT 50', [v.id]);
    const maintains = await db.query('SELECT * FROM biz_maintain_record WHERE vip_user_id=? AND vip_user_type=1 ORDER BY id DESC LIMIT 50', [v.id]);
    const checkins = await db.query('SELECT * FROM biz_checkin_record WHERE vip_id=? ORDER BY id DESC LIMIT 30', [v.id]);
    const ptBookings = await db.query('SELECT * FROM biz_ptrain_bespeak_record WHERE vip_id=? ORDER BY id DESC LIMIT 30', [v.id]);
    const groupBookings = await db.query('SELECT * FROM biz_syllabus_subscribe_record WHERE vip_id=? ORDER BY id DESC LIMIT 30', [v.id]);
    const contracts = await db.query('SELECT id,contract_num,title,sign_status,sign_time,insert_time FROM biz_club_contract WHERE vip_id=? AND hidden=0 ORDER BY id DESC', [v.id]);
    res.json(ok({ profile: v, cards, recharges, spends, maintains, checkins, ptBookings, groupBookings, contracts }));
  } catch (e) { next(e); }
});

// ---- 新增会员（手机号唯一, 重复提示合并）----
r.post('/members', staffAuth(), async (req, res, next) => {
  try {
    const b = req.body;
    if (!b.phone || !/^1\d{10}$/.test(b.phone)) throw new BizError('请输入正确的手机号');
    const exist = await db.queryOne('SELECT id, realname FROM biz_vip_user WHERE merchant_id=? AND phone=?', [req.user.mid, b.phone]);
    if (exist) throw new BizError(`手机号已存在会员档案「${exist.realname || '未命名'}」(ID:${exist.id})，请勿重复录入`, 1001);
    const bcrypt = require('bcryptjs');
    const id = await db.insert(
      `INSERT INTO biz_vip_user (merchant_id,phone,password,realname,nickname,gender,birthday,id_card_number,address,source_id,source_name,
        membership_id,membership_name,coach_id,coach_name,sub_coach_id,sub_coach_name,label_levels,remark)
       VALUES (?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?)`,
      [req.user.mid, b.phone, await bcrypt.hash('123456', 10), b.realname || '', b.nickname || b.realname || '', b.gender || 0,
        b.birthday || null, b.id_card_number || '', b.address || '', b.source_id || 0, b.source_name || '',
        b.membership_id || 0, b.membership_name || '', b.coach_id || 0, b.coach_name || '',
        b.sub_coach_id || 0, b.sub_coach_name || '', b.label_levels || 0, b.remark || '']);
    await db.exec('INSERT IGNORE INTO biz_user_club (vip_user_id, club_id) VALUES (?,?)', [id, req.clubId]);
    await logAction(req, '新增会员', `${b.realname} ${b.phone}`);
    res.json(ok({ id }));
  } catch (e) { next(e); }
});

// ---- 编辑会员 ----
r.put('/members/:id', staffAuth(), async (req, res, next) => {
  try {
    const b = req.body;
    await db.exec(
      `UPDATE biz_vip_user SET realname=?,nickname=?,gender=?,birthday=?,id_card_number=?,address=?,source_id=?,source_name=?,
        coach_id=?,coach_name=?,sub_coach_id=?,sub_coach_name=?,label_levels=?,remark=? WHERE id=? AND merchant_id=?`,
      [b.realname, b.nickname, b.gender || 0, b.birthday || null, b.id_card_number || '', b.address || '',
        b.source_id || 0, b.source_name || '', b.coach_id || 0, b.coach_name || '',
        b.sub_coach_id || 0, b.sub_coach_name || '', b.label_levels || 0, b.remark || '', req.params.id, req.user.mid]);
    // 主教练变更: 未总结的里程碑转给新主教练
    if (b.coach_id) await db.exec('UPDATE biz_milestone SET coach_id=?, coach_name=? WHERE vip_id=? AND merchant_id=? AND status=0', [b.coach_id, b.coach_name || '', req.params.id, req.user.mid]);
    await logAction(req, '编辑会员', `#${req.params.id} ${b.realname}`);
    res.json(ok());
  } catch (e) { next(e); }
});

// ---- 分配业绩归属/教练（批量改派, 历史业绩不重算）----
r.post('/members/assign', staffAuth('admin', 'manager', 'membership'), async (req, res, next) => {
  try {
    const { ids, membership_id, membership_name, coach_id, coach_name, type = 'member' } = req.body;
    if (!Array.isArray(ids) || !ids.length) throw new BizError('请选择对象');
    const table = type === 'potential' ? 'biz_user_potential' : 'biz_vip_user';
    if (membership_id != null) {
      await db.exec(`UPDATE ${table} SET membership_id=?, membership_name=? WHERE id IN (?) AND merchant_id=?`, [membership_id, membership_name || '', ids, req.user.mid]);
    }
    if (coach_id != null && type === 'member') {
      await db.exec(`UPDATE biz_vip_user SET coach_id=?, coach_name=? WHERE id IN (?) AND merchant_id=?`, [coach_id, coach_name || '', ids, req.user.mid]);
    }
    await logAction(req, '分配业绩归属/教练', `${type} x${ids.length} -> ${membership_name || coach_name || ''}`);
    res.json(ok());
  } catch (e) { next(e); }
});

// ---- 逻辑禁用/恢复（PRD: 会员删除仅做逻辑禁用, 历史消费与合同保留）----
r.post('/members/:id/disable', staffAuth('admin', 'manager'), async (req, res, next) => {
  try {
    const enable = req.body.enable ? 1 : 0;
    const v = await db.queryOne('SELECT realname FROM biz_vip_user WHERE id=? AND merchant_id=?', [req.params.id, req.user.mid]);
    if (!v) throw new BizError('会员不存在');
    await db.exec('UPDATE biz_vip_user SET status=? WHERE id=? AND merchant_id=?', [enable, req.params.id, req.user.mid]);
    await logAction(req, enable ? '恢复会员' : '禁用会员', `#${req.params.id} ${v.realname}（历史数据保留）`);
    res.json(ok());
  } catch (e) { next(e); }
});

// ---- 批量删除(逻辑禁用, 历史消费与合同保留) ----
r.post('/members/batch-disable', staffAuth('admin', 'manager'), async (req, res, next) => {
  try {
    const ids = (Array.isArray(req.body.ids) ? req.body.ids : []).map(Number).filter(Boolean);
    if (!ids.length) throw new BizError('请选择会员');
    const rows = await db.query('SELECT id, realname FROM biz_vip_user WHERE merchant_id=? AND id IN (?) AND status=1', [req.user.mid, ids]);
    if (!rows.length) throw new BizError('所选会员不存在或已删除');
    await db.exec('UPDATE biz_vip_user SET status=0 WHERE merchant_id=? AND id IN (?)', [req.user.mid, rows.map(x => x.id)]);
    await logAction(req, '批量删除会员', `${rows.length}人: ${rows.slice(0, 8).map(x => x.realname).join('、')}${rows.length > 8 ? '…' : ''}（历史数据保留）`);
    res.json(ok({ count: rows.length }));
  } catch (e) { next(e); }
});

// ---- 黑名单 ----
r.post('/members/:id/blacklist', staffAuth('admin', 'manager', 'reception'), async (req, res, next) => {
  try {
    const { is_black, reason = '' } = req.body;
    await db.exec('UPDATE biz_vip_user SET is_black=?, black_reason=? WHERE id=? AND merchant_id=?', [is_black ? 1 : 0, reason, req.params.id, req.user.mid]);
    await logAction(req, is_black ? '加入黑名单' : '移出黑名单', `会员#${req.params.id} ${reason}`);
    res.json(ok());
  } catch (e) { next(e); }
});

// ---- 潜在客户 ----
r.get('/potentials', staffAuth(), async (req, res, next) => {
  try {
    const { p, size, offset } = page(req);
    const { keyword = '', label, membership_id, converted } = req.query;
    const cond = ['merchant_id=?', 'status=1']; const params = [req.user.mid];
    cond.push(converted === '1' ? 'is_vip_user=1' : 'is_vip_user=0');
    if (keyword) { cond.push('(realname LIKE ? OR phone LIKE ?)'); params.push(`%${keyword}%`, `%${keyword}%`); }
    if (label) { cond.push('label_levels=?'); params.push(label); }
    if (membership_id) { cond.push('membership_id=?'); params.push(membership_id); }
    const where = cond.join(' AND ');
    const [{ total }] = await db.query(`SELECT COUNT(*) total FROM biz_user_potential WHERE ${where}`, params);
    const exp = req.query.export === 'csv';
    const rows = await db.query(`SELECT * FROM biz_user_potential WHERE ${where} ORDER BY id DESC ${exp ? '' : 'LIMIT ? OFFSET ?'}`,
      exp ? params : [...params, size, offset]);
    if (exp) {
      const LV = { 0: '无', 1: 'A', 2: 'B', 3: 'C' };
      rows.forEach(x => {
        x.label_text = LV[x.label_levels] || '';
        x.gender_text = x.gender === 1 ? '男' : (x.gender === 2 ? '女' : '');
        x.converted_text = x.is_vip_user ? '已转化' : '未转化';
        x.create_text = x.insert_time ? dayjs(x.insert_time).format('YYYY-MM-DD HH:mm') : '';
      });
      return sendCsv(res, `潜在客户_${dayjs().format('YYYYMMDD')}`, [
        ['realname', '姓名'], ['phone', '手机号'], ['gender_text', '性别'], ['label_text', '意向等级'],
        ['source_name', '来源'], ['membership_name', '业绩归属'], ['converted_text', '转化状态'],
        ['remark', '备注'], ['create_text', '录入时间'],
      ], rows);
    }
    res.json(ok({ list: rows, total, page: p }));
  } catch (e) { next(e); }
});

r.post('/potentials', staffAuth(), async (req, res, next) => {
  try {
    const b = req.body;
    if (!b.phone) throw new BizError('请输入手机号');
    const dupV = await db.queryOne('SELECT id,realname FROM biz_vip_user WHERE merchant_id=? AND phone=?', [req.user.mid, b.phone]);
    if (dupV) throw new BizError(`该手机号已是会员「${dupV.realname}」，无需录入潜客`);
    const dup = await db.queryOne('SELECT id FROM biz_user_potential WHERE merchant_id=? AND phone=? AND status=1 AND is_vip_user=0', [req.user.mid, b.phone]);
    if (dup) throw new BizError('该手机号潜客已存在');
    const id = await db.insert(
      `INSERT INTO biz_user_potential (merchant_id,club_id,realname,phone,gender,membership_id,membership_name,coach_id,source_id,source_name,label_levels,remark)
       VALUES (?,?,?,?,?,?,?,?,?,?,?,?)`,
      [req.user.mid, req.clubId, b.realname || '', b.phone, b.gender || 0, b.membership_id || 0, b.membership_name || '',
        b.coach_id || 0, b.source_id || 0, b.source_name || '', b.label_levels || 0, b.remark || '']);
    await logAction(req, '录入潜客', `${b.realname} ${b.phone}`);
    res.json(ok({ id }));
  } catch (e) { next(e); }
});

r.put('/potentials/:id', staffAuth(), async (req, res, next) => {
  try {
    const b = req.body;
    await db.exec(
      `UPDATE biz_user_potential SET realname=?,gender=?,membership_id=?,membership_name=?,source_id=?,source_name=?,label_levels=?,remark=? WHERE id=? AND merchant_id=?`,
      [b.realname, b.gender || 0, b.membership_id || 0, b.membership_name || '', b.source_id || 0, b.source_name || '',
        b.label_levels || 0, b.remark || '', req.params.id, req.user.mid]);
    res.json(ok());
  } catch (e) { next(e); }
});

// 潜客转正（成交开卡时自动调用, 也可手动）
r.post('/potentials/:id/convert', staffAuth(), async (req, res, next) => {
  try {
    const pot = await db.queryOne('SELECT * FROM biz_user_potential WHERE id=? AND merchant_id=?', [req.params.id, req.user.mid]);
    if (!pot) throw new BizError('潜客不存在');
    if (pot.is_vip_user) throw new BizError('该潜客已转正');
    let v = await db.queryOne('SELECT id FROM biz_vip_user WHERE merchant_id=? AND phone=?', [req.user.mid, pot.phone]);
    let vid;
    if (v) vid = v.id;
    else {
      const bcrypt = require('bcryptjs');
      vid = await db.insert(
        `INSERT INTO biz_vip_user (merchant_id,phone,password,realname,nickname,gender,source_id,source_name,membership_id,membership_name,coach_id,label_levels)
         VALUES (?,?,?,?,?,?,?,?,?,?,?,?)`,
        [req.user.mid, pot.phone, await bcrypt.hash('123456', 10), pot.realname, pot.realname, pot.gender,
          pot.source_id, pot.source_name, pot.membership_id, pot.membership_name, pot.coach_id, pot.label_levels]);
      await db.exec('INSERT IGNORE INTO biz_user_club (vip_user_id, club_id) VALUES (?,?)', [vid, req.clubId]);
    }
    await db.exec('UPDATE biz_user_potential SET is_vip_user=1, vip_user_id=? WHERE id=?', [vid, pot.id]);
    await logAction(req, '潜客转正', `${pot.realname} -> 会员#${vid}`);
    res.json(ok({ vip_id: vid }));
  } catch (e) { next(e); }
});

// ---- 维护记录 ----
r.get('/maintain-records', staffAuth(), async (req, res, next) => {
  try {
    const { p, size, offset } = page(req);
    const { vip_user_id, vip_user_type, membership_id } = req.query;
    const cond = ['merchant_id=?']; const params = [req.user.mid];
    if (vip_user_id) { cond.push('vip_user_id=? AND vip_user_type=?'); params.push(vip_user_id, vip_user_type || 1); }
    if (membership_id) { cond.push('membership_id=?'); params.push(membership_id); }
    const where = cond.join(' AND ');
    const [{ total }] = await db.query(`SELECT COUNT(*) total FROM biz_maintain_record WHERE ${where}`, params);
    const rows = await db.query(`SELECT * FROM biz_maintain_record WHERE ${where} ORDER BY id DESC LIMIT ? OFFSET ?`, [...params, size, offset]);
    res.json(ok({ list: rows, total }));
  } catch (e) { next(e); }
});

r.post('/maintain-records', staffAuth(), async (req, res, next) => {
  try {
    const b = req.body;
    if (!b.vip_user_id || !b.content) throw new BizError('请填写维护内容');
    const id = await db.insert(
      `INSERT INTO biz_maintain_record (merchant_id,club_id,vip_user_id,vip_user_type,membership_id,membership_name,record_type,content,is_todo,todo_time)
       VALUES (?,?,?,?,?,?,?,?,?,?)`,
      [req.user.mid, req.clubId, b.vip_user_id, b.vip_user_type || 1, req.user.uid, req.user.name,
        b.record_type || 1, b.content, b.is_todo || 0, b.todo_time || null]);
    const table = (b.vip_user_type || 1) === 2 ? 'biz_user_potential' : 'biz_vip_user';
    const extra = table === 'biz_user_potential' ? ', last_maintain_record=?' : '';
    const params = table === 'biz_user_potential' ? [String(b.content).slice(0, 250), b.vip_user_id] : [b.vip_user_id];
    await db.exec(`UPDATE ${table} SET last_maintain_time=NOW()${extra} WHERE id=?`, params);
    res.json(ok({ id }));
  } catch (e) { next(e); }
});

// 维护记录删除（误录纠正, 店长权限, 留操作日志）
r.delete('/maintain-records/:id', staffAuth('admin', 'manager'), async (req, res, next) => {
  try {
    const m = await db.queryOne('SELECT * FROM biz_maintain_record WHERE id=? AND merchant_id=?', [req.params.id, req.user.mid]);
    if (!m) throw new BizError('记录不存在');
    await db.exec('DELETE FROM biz_maintain_record WHERE id=?', [m.id]);
    await logAction(req, '删除维护记录', `#${m.id} ${String(m.content).slice(0, 50)}`);
    res.json(ok());
  } catch (e) { next(e); }
});

/* ============ 会员批量导入 ============
 * 前端把 CSV/Excel 粘贴内容解析成行数组后调用本接口
 * commit=false 只校验并回显预检结果; commit=true 才真正落库
 * 导入会员的初始登录密码 = 手机号后 6 位
 * 支持旧系统迁移: 原系统卡ID 去重、卡类型自动创建、业绩归属/经手人按文本保留、身高体重写入体测记录 */
const bcryptImp = require('bcryptjs');

const IMPORT_FIELDS = [
  { key: 'realname', names: ['姓名', '会员姓名', '真实姓名', '会员名', 'name', 'realname'] },
  { key: 'phone', names: ['手机号', '手机', '电话', '联系方式', 'phone', 'mobile'] },
  { key: 'gender', names: ['性别', 'gender'] },
  { key: 'birthday', names: ['生日', '出生日期', 'birthday'] },
  { key: 'card_title', names: ['卡类型', '会员卡', '卡名称', '卡种类', '会员卡名称', 'card'] },
  { key: 'card_kind', names: ['卡种', '会员卡类型'] },
  { key: 'counts', names: ['总次数', '总课时', '购买次数', '售卡时的总次数'] },
  { key: 'left_counts', names: ['剩余次数', '剩余课时', '次数', '余次'] },
  { key: 'left_money', names: ['余额', '储值余额', '剩余金额', '储值卡剩余本金'] },
  { key: 'left_gift_money', names: ['剩余赠送金额', '储值卡剩余赠送金额'] },
  { key: 'actual_money', names: ['实收金额', '实收', '金额', '消费金额', '售卡价格'] },
  { key: 'unit_price', names: ['单课价值', '单价', '课时单价'] },
  { key: 'open_date', names: ['开卡日期', '开卡时间', '购卡日期', '办卡日期'] },
  { key: 'start_date', names: ['开始时间', '开始日期', '启用日期'] },
  { key: 'expire_date', names: ['到期日期', '到期时间', '有效期至', '截止日期', '过期时间'] },
  { key: 'latest_open', names: ['最晚开卡时间', '最晚开卡日期'] },
  { key: 'status', names: ['状态', '卡状态'] },
  { key: 'pay_method', names: ['支付方式', '付款方式'] },
  { key: 'club', names: ['门店', '所属门店', '开卡门店', '会员卡所属门店'] },
  { key: 'coach', names: ['主教练', '教练'] },
  { key: 'membership', names: ['业绩归属', '会籍顾问', '顾问', '销售'] },
  { key: 'operator', names: ['经手人', '创建人', '操作人'] },
  { key: 'physical_card_no', names: ['实体卡号', '卡号'] },
  { key: 'ext_card_id', names: ['原系统卡ID', '会员卡ID', '旧卡ID'] },
  { key: 'id_card', names: ['身份证号', '身份证'] },
  { key: 'height', names: ['身高'] },
  { key: 'weight', names: ['体重'] },
  { key: 'address', names: ['地址', '住址'] },
  { key: 'source', names: ['来源', '来源渠道', '加入渠道'] },
  { key: 'remark', names: ['备注', '说明'] },
];
const KIND_BY_NAME = { '次卡': 1, '时间卡': 2, '储值卡': 3, '私教卡': 4 };
const STATUS_BY_NAME = { '待开卡': 0, '未开卡': 0, '使用中': 1, '正常': 1, '已过期': 2, '过期': 2, '已暂停': 3, '暂停': 3, '已停用': 4, '停用': 4, '已退卡': 5, '退卡': 5 };
const PAY_ALIAS = { '微信': 'wechat', '微信支付': 'wechat', '支付宝': 'alipay', '现金': 'cash', 'POS': 'pos', 'POS刷卡': 'pos', '刷卡': 'pos', '转账': 'transfer', '美团/大众': 'meituan', '美团': 'meituan', '大众点评': 'meituan', '其他': 'other', '储值卡抵扣': 'store' };

function normDate(v, endOfDay) {
  if (!v) return null;
  const s = String(v).trim().replace(/[./]/g, '-');
  if (!/^\d{4}-\d{1,2}-\d{1,2}/.test(s)) return null;
  const d = dayjs(s.length <= 10 ? s : s.slice(0, 19));
  if (!d.isValid()) return null;
  return endOfDay ? d.endOf('day').format('YYYY-MM-DD HH:mm:ss') : d.format('YYYY-MM-DD HH:mm:ss');
}
const numOr = (v, dft) => {
  if (v == null || String(v).trim() === '' || /^(nan|--|null|undefined)$/i.test(String(v).trim())) return dft;
  const n = Number(String(v).replace(/[^\d.-]/g, ''));
  return isNaN(n) ? dft : n;
};
const txt = (v) => { const s = String(v == null ? '' : v).trim(); return /^(nan|--|null|undefined)$/i.test(s) ? '' : s; };

// 预检 + 导入
r.post('/members/import', staffAuth('admin', 'manager', 'membership'), async (req, res, next) => {
  try {
    const mid = req.user.mid;
    const rows = Array.isArray(req.body.rows) ? req.body.rows : [];
    const commit = !!req.body.commit;
    const countRevenue = !!req.body.count_revenue;      // 是否计入收款流水(历史数据默认不计)
    const autoCat = req.body.auto_create_category !== false; // 卡类型不存在时自动创建(默认开)
    if (!rows.length) throw new BizError('没有可导入的数据');
    if (rows.length > 1000) throw new BizError('单次最多导入 1000 条，请分批');

    const [cats, clubs, coaches, staff, sources] = await Promise.all([
      db.query('SELECT id,title,card_kind,total_counts,expire_days,price,gift_money FROM biz_card_category WHERE merchant_id=?', [mid]),
      db.query('SELECT id,name FROM biz_club WHERE merchant_id=? AND status=1 ORDER BY sort, id', [mid]),
      db.query('SELECT id,realname FROM biz_club_coach WHERE merchant_id=? AND status=1', [mid]),
      db.query('SELECT id,realname FROM sys_user WHERE merchant_id=? AND status=1', [mid]),
      db.query('SELECT id,title FROM biz_user_source WHERE merchant_id=? AND status=1', [mid]),
    ]);
    // 名称匹配: 忽略 emoji/空格/大小写 (旧系统员工名常带表情, 如 "三七 🧸")
    const EMO = /[\u{1F300}-\u{1FAFF}\u{2600}-\u{27BF}\u{FE0F}\u{200D}\s]+/gu;
    const normName = (v) => { const raw = String(v || '').trim(); const n = raw.replace(EMO, '').toLowerCase(); return n || raw.toLowerCase(); };
    const byTitle = (list, k) => (v) => list.find(x => normName(x[k]) === normName(v));
    const findCat = byTitle(cats, 'title');
    const findClub = byTitle(clubs, 'name');
    const findCoach = byTitle(coaches, 'realname');
    const findStaff = byTitle(staff, 'realname');
    const findSource = byTitle(sources, 'title');
    const extIds = rows.map(x => txt(x && x.ext_card_id)).filter(Boolean);
    const existedExt = new Set(extIds.length
      ? (await db.query('SELECT ext_card_id FROM biz_member_card WHERE merchant_id=? AND ext_card_id IN (?)', [mid, extIds])).map(x => x.ext_card_id)
      : []);

    const seenExt = new Set();
    const newCats = new Map(); // title -> {kind}
    const out = [];
    for (let i = 0; i < rows.length; i++) {
      const raw = rows[i] || {};
      const item = { line: i + 1, realname: txt(raw.realname), phone: txt(raw.phone).replace(/\D/g, '') };
      const errs = []; const warns = [];
      if (!item.realname) errs.push('缺少姓名');
      if (!/^1[3-9]\d{9}$/.test(item.phone)) errs.push('手机号格式不正确');

      const exist = item.phone ? await db.queryOne('SELECT id,realname FROM biz_vip_user WHERE merchant_id=? AND phone=?', [mid, item.phone]) : null;
      item.member_action = exist ? '已有会员' : '新建会员';
      item.vip_id = exist ? exist.id : 0;

      item.ext_card_id = txt(raw.ext_card_id);
      if (item.ext_card_id && (existedExt.has(item.ext_card_id) || seenExt.has(item.ext_card_id))) {
        item.skip = true; warns.push(existedExt.has(item.ext_card_id) ? '原系统卡ID已导入过，跳过' : '文件内原系统卡ID重复，跳过');
      }
      if (item.ext_card_id) seenExt.add(item.ext_card_id);

      // 卡类型(可不填, 只导会员档案)
      item.card_title = txt(raw.card_title);
      let cat = null;
      if (item.card_title) {
        cat = findCat(item.card_title);
        if (!cat) {
          const kind = KIND_BY_NAME[txt(raw.card_kind)] || (/私教/.test(item.card_title) ? 4 : (/储值/.test(item.card_title) ? 3 : (/时间|月卡|年卡|季卡/.test(item.card_title) ? 2 : 1)));
          if (autoCat) {
            cat = newCats.get(item.card_title) || { id: 0, title: item.card_title, card_kind: kind, total_counts: 0, expire_days: 365, price: 0, gift_money: 0, _new: true };
            newCats.set(item.card_title, cat);
            warns.push(`卡类型「${item.card_title}」不存在，将自动创建为${CARD_KIND[kind]}`);
          } else errs.push(`卡类型「${item.card_title}」不存在`);
        }
      }
      item.club = txt(raw.club);
      const club = item.club ? findClub(item.club) : null;
      if (item.club && !club) errs.push(`门店「${item.club}」不存在`);
      item.coach = txt(raw.coach);
      const coach = item.coach ? findCoach(item.coach) : null;
      if (item.coach && !coach) errs.push(`教练「${item.coach}」不存在`);
      item.membership = txt(raw.membership);
      const ms = item.membership ? findStaff(item.membership) : null;
      if (item.membership && !ms) warns.push(`员工「${item.membership}」不在系统中，业绩归属按姓名文本保留`);
      const src = raw.source ? findSource(raw.source) : null;
      const gender = /女/.test(txt(raw.gender)) ? 2 : (/男/.test(txt(raw.gender)) ? 1 : 0);
      const birthday = raw.birthday ? ((normDate(raw.birthday) || '').slice(0, 10) || null) : null;
      const height = numOr(raw.height, 0), weight = numOr(raw.weight, 0);
      const pm = txt(raw.pay_method);
      const payMethod = PAY_ALIAS[pm] || (PAY_METHODS[pm] ? pm : (pm ? 'other' : 'import'));

      item.meta = {
        gender, birthday, height, weight,
        id_card: txt(raw.id_card), address: txt(raw.address),
        coach_id: coach ? coach.id : 0, coach_name: coach ? coach.realname : '',
        membership_id: ms ? ms.id : 0, membership_name: ms ? ms.realname : item.membership,
        operator: (() => { const o = txt(raw.operator); const st = o ? findStaff(o) : null; return st ? st.realname : o; })(),
        source_id: src ? src.id : 0, source_name: src ? src.title : txt(raw.source),
        remark: txt(raw.remark), club_id: club ? club.id : 0,
      };

      if (cat) {
        const counts = numOr(raw.counts, cat.total_counts || 0);
        const left = numOr(raw.left_counts, counts);
        if (left > counts && counts > 0) errs.push('剩余次数大于总次数');
        const openTime = normDate(raw.open_date) || normDate(raw.start_date) || now();
        const startTime = normDate(raw.start_date) || openTime;
        let expireTime = normDate(raw.expire_date, true);
        if (!expireTime) expireTime = dayjs(openTime).add(cat.expire_days || 365, 'day').endOf('day').format('YYYY-MM-DD HH:mm:ss');
        let status = STATUS_BY_NAME[txt(raw.status)];
        if (status == null) status = dayjs(expireTime).isBefore(dayjs()) ? 2 : 1;
        const actual = numOr(raw.actual_money, 0);
        const unit = numOr(raw.unit_price, counts > 0 ? +(actual / counts).toFixed(2) : 0);
        item.card = {
          cat, counts, left, status, unit, actual,
          left_money: numOr(raw.left_money, 0), left_gift_money: numOr(raw.left_gift_money, 0),
          openTime: status === 0 ? null : openTime, startTime: status === 0 ? null : startTime, expireTime,
          latestOpen: normDate(raw.latest_open) || (status === 0 ? expireTime : null),
          pay_method: payMethod,
          physical_card_no: txt(raw.physical_card_no),
        };
        const leftDesc = cat.card_kind === 3 ? `余额 ¥${item.card.left_money}` : (cat.card_kind === 2 ? '不限次' : `剩余 ${left}/${counts} 次`);
        item.card_desc = `${cat.title} · ${leftDesc} · ${CARD_STATUS[status]} · ${String(expireTime).slice(0, 10)}到期`;
      } else {
        item.card = null;
        item.card_desc = item.card_title ? '' : '仅建档，不开卡';
      }
      item.errors = errs; item.warnings = warns;
      item.ok = !errs.length;
      out.push(item);
    }

    const doRows = out.filter(x => x.ok && !x.skip);
    const stat = {
      total: out.length,
      ok: doRows.length,
      fail: out.filter(x => !x.ok).length,
      skip: out.filter(x => x.ok && x.skip).length,
      new_member: new Set(doRows.filter(x => x.member_action === '新建会员').map(x => x.phone)).size,
      exist_member: new Set(doRows.filter(x => x.member_action === '已有会员').map(x => x.phone)).size,
      with_card: doRows.filter(x => x.card).length,
      new_categories: [...newCats.keys()],
      warn: out.filter(x => x.warnings.length).length,
    };
    if (!commit) return res.json(ok({ preview: out, stat, password_rule: '手机号后6位' }));
    if (stat.fail) throw new BizError(`还有 ${stat.fail} 行未通过校验，请先修正后再导入`);

    // 先建缺失的卡类型
    for (const c of newCats.values()) {
      c.id = await db.insert(
        `INSERT INTO biz_card_category (merchant_id,club_id,card_kind,title,intro,expire_days,total_counts,price,online_sale,status,sort)
         VALUES (?,0,?,?,'由历史数据导入自动创建，请到卡类型配置补充规则',365,0,0,0,1,999)`,
        [mid, c.card_kind, c.title]);
    }

    let createdMember = 0, createdCard = 0, createdBody = 0;
    const phoneToVip = new Map();
    for (const it of doRows) {
      const meta = it.meta;
      const fallbackClub = meta.club_id || req.clubId;
      let vipId = it.vip_id || phoneToVip.get(it.phone) || 0;
      await db.tx(async (t) => {
        if (!vipId) {
          const pwd = await bcryptImp.hash(it.phone.slice(-6), 10); // 初始密码 = 手机号后6位
          vipId = await t.insert(
            `INSERT INTO biz_vip_user (merchant_id,phone,password,realname,nickname,gender,birthday,id_card_number,address,source_id,source_name,
              membership_id,membership_name,coach_id,coach_name,is_import,remark)
             VALUES (?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,1,?)`,
            [mid, it.phone, pwd, it.realname, it.realname, meta.gender, meta.birthday, meta.id_card, meta.address,
              meta.source_id, meta.source_name, meta.membership_id, meta.membership_name,
              meta.coach_id, meta.coach_name, meta.remark || '数据导入']);
          await t.exec('INSERT IGNORE INTO biz_user_club (vip_user_id, club_id) VALUES (?,?)', [vipId, fallbackClub]);
          phoneToVip.set(it.phone, vipId);
          createdMember++;
          if (meta.height > 0 || meta.weight > 0) {
            await t.insert(
              'INSERT INTO biz_body_record (merchant_id,club_id,vip_id,realname,record_date,height,weight,remark) VALUES (?,?,?,?,CURDATE(),?,?,?)',
              [mid, fallbackClub, vipId, it.realname, meta.height || null, meta.weight || null, '历史数据导入']);
            createdBody++;
          }
        } else {
          // 已有会员: 只补空字段, 不覆盖已有资料
          await t.exec(
            `UPDATE biz_vip_user SET realname=IF(realname='' OR realname IS NULL,?,realname),
               gender=IF(gender=0 AND ?>0,?,gender), birthday=IFNULL(birthday,?),
               id_card_number=IF(IFNULL(id_card_number,'')='' AND ?<>'',?,id_card_number),
               address=IF(IFNULL(address,'')='' AND ?<>'',?,address),
               coach_id=IF(coach_id=0 AND ?>0,?,coach_id), coach_name=IF(coach_name='' AND ?<>'',?,coach_name),
               membership_id=IF(membership_id=0 AND ?>0,?,membership_id), membership_name=IF(membership_name='' AND ?<>'',?,membership_name)
             WHERE id=?`,
            [it.realname, meta.gender, meta.gender, meta.birthday, meta.id_card, meta.id_card, meta.address, meta.address,
              meta.coach_id, meta.coach_id, meta.coach_name, meta.coach_name,
              meta.membership_id, meta.membership_id, meta.membership_name, meta.membership_name, vipId]);
        }

        if (it.card) {
          const c = it.card, cat = c.cat;
          const isStore = cat.card_kind === 3;
          const cn = it.ext_card_id ? `IM${it.ext_card_id}` : `IM${dayjs().format('YYYYMMDD')}${String(vipId).padStart(5, '0')}${String(Math.floor(Math.random() * 900) + 100)}`;
          const cardId = await t.insert(
            `INSERT INTO biz_member_card (merchant_id,club_id,vip_id,card_kind,card_type_id,card_type_name,counts,left_counts,
              sum_money,left_money,left_gift_money,unit_price,actual_money,retainage,open_card_mode,open_card_time,start_use_time,expire_time,expire_days,latest_open_time,
              contract_number,coach_id,coach_name,membership_id,membership_name,ope_user_id,ope_username,pay_method,realname,phone,source_port,remark,status,
              ext_card_id,physical_card_no)
             VALUES (?,?,?,?,?,?,?,?,?,?,?,?,?,0,1,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,3,?,?,?,?)`,
            [mid, c.cat.club_id || fallbackClub, vipId, cat.card_kind, cat.id, cat.title, c.counts, c.left,
              isStore ? c.left_money + c.left_gift_money : 0, isStore ? c.left_money : 0, isStore ? c.left_gift_money : 0, c.unit, c.actual,
              c.openTime, c.startTime, c.expireTime, cat.expire_days || 365, c.latestOpen,
              cn, meta.coach_id, meta.coach_name, meta.membership_id, meta.membership_name,
              req.user.uid, meta.operator || req.user.name, c.pay_method, it.realname, it.phone, meta.remark || '历史数据导入', c.status,
              it.ext_card_id, c.physical_card_no]);
          if (countRevenue && c.actual > 0) {
            await t.insert(
              `INSERT INTO biz_card_recharge (merchant_id,club_id,card_id,vip_id,card_kind,card_type_id,card_type_name,type,actual_money,gift_money,
                counts,expire_days,pay_method,membership_id,membership_name,ope_user_id,ope_username,realname,phone,contract_number,is_new_user,remark,insert_time)
               VALUES (?,?,?,?,?,?,?,1,?,0,?,?,?,?,?,?,?,?,?,?,0,?,?)`,
              [mid, fallbackClub, cardId, vipId, cat.card_kind, cat.id, cat.title, c.actual,
                c.counts, cat.expire_days || 365, c.pay_method, meta.membership_id, meta.membership_name, req.user.uid, meta.operator || req.user.name,
                it.realname, it.phone, cn, '历史数据导入', c.openTime || now()]);
          }
          createdCard++;
        }
      });
    }
    await lifecycleTick(true);
    await logAction(req, '会员导入', `共${stat.total}条: 新建会员${createdMember}人, 导入卡${createdCard}张, 新建卡类型${newCats.size}个`);
    res.json(ok({ created_member: createdMember, created_card: createdCard, created_body: createdBody, created_categories: [...newCats.keys()], skipped: stat.skip, total: stat.total, password_rule: '手机号后6位' }));
  } catch (e) { next(e); }
});

module.exports = r;
