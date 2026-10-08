const express = require('express');
const dayjs = require('dayjs');
const db = require('../db');
const { ok, BizError, page, now, logAction, lifecycleTick, activateCard, sendCsv } = require('../util');
const { staffAuth } = require('../middleware/auth');

const r = express.Router();

// 时间段判断 "06:30-22:30"
function inTimeRange(range) {
  if (!range) return true;
  const [from, to] = range.split('-');
  if (!from || !to) return true;
  const cur = dayjs().format('HH:mm');
  return cur >= from && cur <= to;
}

// 签到核心逻辑（共享: 前台代签 / 会员自助）
async function doCheckin({ mid, clubId, vipId, cardId, opeUserId, opeUsername, port, storeFee }) {
  await lifecycleTick(true);
  const vip = await db.queryOne('SELECT * FROM biz_vip_user WHERE id=? AND merchant_id=?', [vipId, mid]);
  if (!vip) throw new BizError('会员不存在');
  if (vip.is_black) throw new BizError(`⚠️ 黑名单会员，禁止入场（${vip.black_reason || ''}）`);
  // 未出场的重复签到拦截
  const open = await db.queryOne(
    'SELECT id FROM biz_checkin_record WHERE vip_id=? AND club_id=? AND check_out_time IS NULL AND check_in_time>=?',
    [vipId, clubId, dayjs().format('YYYY-MM-DD 00:00:00')]);
  if (open) throw new BizError('该会员已在场内（未出场），请勿重复签到');

  // 选卡: 指定卡 or 自动 (时间卡优先 > 次卡 > 储值卡)
  let card = null;
  if (cardId) {
    card = await db.queryOne('SELECT * FROM biz_member_card WHERE id=? AND vip_id=?', [cardId, vipId]);
    if (!card) throw new BizError('会员卡不存在');
  } else {
    const cards = await db.query(
      `SELECT * FROM biz_member_card WHERE vip_id=? AND status IN (0,1) AND card_kind IN (1,2,3) ORDER BY FIELD(card_kind,2,1,3), expire_time`, [vipId]);
    card = cards.find(c => c.card_kind === 2) || cards.find(c => c.card_kind === 1 && c.left_counts > 0) || cards.find(c => c.card_kind === 3 && Number(c.left_money) > 0);
    if (!card) throw new BizError('该会员没有可用于入场的有效卡（时间卡/次卡/储值卡）');
  }
  if (card.status === 0) card = await activateCard(card.id); // 首次使用开卡
  if (card.status !== 1) throw new BizError(`该卡当前${['待开卡', '使用中', '已过期', '已暂停', '已停用', '已退卡'][card.status]}，无法签到`);
  const cat = await db.queryOne('SELECT * FROM biz_card_category WHERE id=?', [card.card_type_id]);
  if (cat && cat.free_train_time_range && !inTimeRange(cat.free_train_time_range)) {
    throw new BizError(`该卡入场时段为 ${cat.free_train_time_range}，当前不可入场`);
  }

  let deductInfo = '';
  await db.tx(async (t) => {
    if (card.card_kind === 1) { // 次卡扣1
      if (card.left_counts < 1) throw new BizError('该卡剩余次数不足');
      await t.exec('UPDATE biz_member_card SET left_counts=left_counts-1 WHERE id=? AND left_counts>=1', [card.id]);
      await t.insert(
        `INSERT INTO biz_card_spend (merchant_id,club_id,card_id,vip_id,card_kind,card_type_name,scene,costs,unit_price,spend_money,
          ope_user_id,ope_username,realname,phone) VALUES (?,?,?,?,1,?,1,1,?,?,?,?,?,?)`,
        [mid, card.club_id, card.id, vipId, card.card_type_name, card.unit_price, card.unit_price, opeUserId, opeUsername, vip.realname, vip.phone]);
      deductInfo = `扣1次，剩余${card.left_counts - 1}次`;
    } else if (card.card_kind === 2) { // 时间卡: 不扣次, 当日首签写摊销耗卡
      const [{ n }] = await t.query(
        `SELECT COUNT(*) n FROM biz_card_spend WHERE card_id=? AND scene=1 AND DATE(insert_time)=CURDATE()`, [card.id]);
      if (n === 0 && card.expire_days > 0) {
        const daily = +(Number(card.actual_money) / card.expire_days).toFixed(2);
        await t.insert(
          `INSERT INTO biz_card_spend (merchant_id,club_id,card_id,vip_id,card_kind,card_type_name,scene,costs,unit_price,spend_money,
            ope_user_id,ope_username,realname,phone,remark) VALUES (?,?,?,?,2,?,1,0,?,?,?,?,?,?,'时间卡按天摊销')`,
          [mid, card.club_id, card.id, vipId, card.card_type_name, daily, daily, opeUserId, opeUsername, vip.realname, vip.phone]);
      }
      deductInfo = `有效期至 ${dayjs(card.expire_time).format('YYYY-MM-DD')}`;
    } else if (card.card_kind === 3) { // 储值卡: 扣单次费用
      const fee = Number(storeFee != null ? storeFee : 30);
      if (Number(card.left_money) < fee) throw new BizError('储值卡余额不足');
      await t.exec('UPDATE biz_member_card SET left_money=left_money-? WHERE id=?', [fee, card.id]);
      await t.insert(
        `INSERT INTO biz_card_spend (merchant_id,club_id,card_id,vip_id,card_kind,card_type_name,scene,costs,unit_price,spend_money,
          ope_user_id,ope_username,realname,phone,remark) VALUES (?,?,?,?,3,?,1,0,?,?,?,?,?,?,'单次入场费')`,
        [mid, card.club_id, card.id, vipId, card.card_type_name, fee, fee, opeUserId, opeUsername, vip.realname, vip.phone]);
      deductInfo = `扣¥${fee}，余额¥${(Number(card.left_money) - fee).toFixed(2)}`;
    }
    const recId = await t.insert(
      `INSERT INTO biz_checkin_record (merchant_id,club_id,vip_id,realname,phone,card_id,card_kind,card_type_name,ope_user_id,ope_username,port)
       VALUES (?,?,?,?,?,?,?,?,?,?,?)`,
      [mid, clubId, vipId, vip.realname, vip.phone, card.id, card.card_kind, card.card_type_name, opeUserId, opeUsername, port]);
    await t.exec('UPDATE biz_vip_user SET last_sign_time=NOW() WHERE id=?', [vipId]);
    return recId;
  });
  return { card_type_name: card.card_type_name, deduct_info: deductInfo, realname: vip.realname };
}

// 前台快速签到
r.post('/checkin', staffAuth(), async (req, res, next) => {
  try {
    const result = await doCheckin({
      mid: req.user.mid, clubId: req.clubId, vipId: req.body.vip_id, cardId: req.body.card_id,
      opeUserId: req.user.uid, opeUsername: req.user.name, port: 1, storeFee: req.body.store_fee,
    });
    await logAction(req, '前台签到', `${result.realname} ${result.card_type_name}`);
    res.json(ok(result));
  } catch (e) { next(e); }
});

// 出场
r.post('/checkin/:id/out', staffAuth(), async (req, res, next) => {
  try {
    await db.exec('UPDATE biz_checkin_record SET check_out_time=NOW(), ring_status=IF(ring_status=1,2,ring_status) WHERE id=? AND merchant_id=?',
      [req.params.id, req.user.mid]);
    res.json(ok());
  } catch (e) { next(e); }
});

// 手环借还
r.post('/checkin/:id/ring', staffAuth(), async (req, res, next) => {
  try {
    const { ring_no, ring_status } = req.body;
    await db.exec('UPDATE biz_checkin_record SET ring_no=?, ring_status=? WHERE id=? AND merchant_id=?',
      [ring_no || '', ring_status, req.params.id, req.user.mid]);
    res.json(ok());
  } catch (e) { next(e); }
});

// 签到记录
r.get('/checkins', staffAuth(), async (req, res, next) => {
  try {
    const { p, size, offset } = page(req);
    const { date, keyword, in_gym } = req.query;
    const cond = ['merchant_id=?']; const params = [req.user.mid];
    if (req.clubScope) { cond.push('club_id=?'); params.push(req.clubScope); }
    if (date) { cond.push('DATE(check_in_time)=?'); params.push(date); }
    if (keyword) { cond.push('(realname LIKE ? OR phone LIKE ?)'); params.push(`%${keyword}%`, `%${keyword}%`); }
    if (in_gym === '1') cond.push('check_out_time IS NULL');
    const where = cond.join(' AND ');
    const [{ total }] = await db.query(`SELECT COUNT(*) total FROM biz_checkin_record WHERE ${where}`, params);
    const exp = req.query.export === 'csv';
    const rows = await db.query(`SELECT * FROM biz_checkin_record WHERE ${where} ORDER BY id DESC ${exp ? '' : 'LIMIT ? OFFSET ?'}`,
      exp ? params : [...params, size, offset]);
    if (exp) {
      rows.forEach(x => {
        x.in_text = x.check_in_time ? dayjs(x.check_in_time).format('YYYY-MM-DD HH:mm') : '';
        x.out_text = x.check_out_time ? dayjs(x.check_out_time).format('YYYY-MM-DD HH:mm') : '未离场';
        x.mins = x.check_in_time && x.check_out_time ? dayjs(x.check_out_time).diff(dayjs(x.check_in_time), 'minute') : '';
      });
      return sendCsv(res, `签到流水_${date || dayjs().format('YYYYMMDD')}`, [
        ['realname', '会员'], ['phone', '手机号'], ['card_type_name', '卡类型'],
        ['in_text', '签到时间'], ['out_text', '离场时间'], ['mins', '停留(分钟)'], ['ring_no', '手环号'],
      ], rows);
    }
    res.json(ok({ list: rows, total }));
  } catch (e) { next(e); }
});

// 签到报表（时段分布）
r.get('/checkin-report', staffAuth(), async (req, res, next) => {
  try {
    const from = req.query.from || dayjs().subtract(29, 'day').format('YYYY-MM-DD');
    const to = req.query.to || dayjs().format('YYYY-MM-DD');
    const byDay = await db.query(
      `SELECT DATE(check_in_time) d, COUNT(*) cnt FROM biz_checkin_record WHERE merchant_id=?${req.clubScope ? ' AND club_id=?' : ''} AND DATE(check_in_time) BETWEEN ? AND ? GROUP BY 1 ORDER BY 1`,
      [req.user.mid, ...(req.clubScope ? [req.clubScope] : []), from, to]);
    const byHour = await db.query(
      `SELECT HOUR(check_in_time) h, COUNT(*) cnt FROM biz_checkin_record WHERE merchant_id=?${req.clubScope ? ' AND club_id=?' : ''} AND DATE(check_in_time) BETWEEN ? AND ? GROUP BY 1 ORDER BY 1`,
      [req.user.mid, ...(req.clubScope ? [req.clubScope] : []), from, to]);
    if (req.query.export === 'csv') {
      const key = String(req.query.section || 'by_day');
      const secs = {
        by_day: { name: '按日签到', headers: [['d', '日期'], ['cnt', '签到人次']], rows: byDay.map(x => ({ d: dayjs(x.d).format('YYYY-MM-DD'), cnt: x.cnt })) },
        by_hour: { name: '时段分布', headers: [['h', '时段'], ['cnt', '签到人次']], rows: byHour.map(x => ({ h: String(x.h).padStart(2, '0') + ':00', cnt: x.cnt })) },
      };
      const sec = secs[key];
      if (!sec) throw new BizError('不支持导出的板块: ' + key);
      return sendCsv(res, `签到报表_${sec.name}_${from}_${to}`, sec.headers, sec.rows);
    }
    res.json(ok({ byDay, byHour }));
  } catch (e) { next(e); }
});

module.exports = r;
module.exports.doCheckin = doCheckin;
