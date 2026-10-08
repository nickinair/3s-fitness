const express = require('express');
const dayjs = require('dayjs');
const db = require('../db');
const { ok, BizError, page, now, logAction, lifecycleTick, sendCsv, contractTemplate, PAY_METHODS } = require('../util');
const { staffAuth } = require('../middleware/auth');

const r = express.Router();

// ============ 卡类型（商品模板）============

r.get('/card-categories', staffAuth(), async (req, res, next) => {
  try {
    const { kind, status } = req.query;
    const cond = ['merchant_id=?']; const params = [req.user.mid];
    if (kind) { cond.push('card_kind=?'); params.push(kind); }
    if (status != null && status !== '') { cond.push('status=?'); params.push(status); }
    const rows = await db.query(`SELECT * FROM biz_card_category WHERE ${cond.join(' AND ')} ORDER BY sort, id`, params);
    res.json(ok(rows));
  } catch (e) { next(e); }
});

const CAT_FIELDS = ['card_kind', 'title', 'intro', 'expire_days', 'total_counts', 'price', 'original_price', 'gift_money',
  'course_permission', 'book_limit_day', 'book_limit_week', 'book_limit_month30', 'advance_book_limit',
  'free_cancel_total', 'free_cancel_month_overtime', 'noshow_limit_30d', 'pause_times', 'pause_max_days',
  'open_card_mode', 'latest_open_days', 'book_time_range', 'group_advance_range', 'cancel_deadline_hours',
  'free_train_time_range', 'online_sale', 'purchase_limit', 'student_only', 'cover_img', 'sort', 'status',
  'milestone_type', 'milestone_interval'];

r.post('/card-categories', staffAuth('admin', 'manager'), async (req, res, next) => {
  try {
    const b = req.body;
    if (!b.title || !b.card_kind) throw new BizError('请填写卡名称与卡种');
    const vals = CAT_FIELDS.map(f => b[f] != null ? b[f] : null);
    const id = await db.insert(
      `INSERT INTO biz_card_category (merchant_id, club_id, ${CAT_FIELDS.join(',')})
       VALUES (?,?,${CAT_FIELDS.map(() => '?').join(',')})`,
      [req.user.mid, b.club_id || 0, ...vals]);
    await logAction(req, '新增卡类型', b.title);
    res.json(ok({ id }));
  } catch (e) { next(e); }
});

r.put('/card-categories/:id', staffAuth('admin', 'manager'), async (req, res, next) => {
  try {
    const b = req.body;
    const sets = []; const params = [];
    for (const f of CAT_FIELDS) if (b[f] !== undefined) { sets.push(`${f}=?`); params.push(b[f]); }
    if (!sets.length) return res.json(ok());
    params.push(req.params.id, req.user.mid);
    await db.exec(`UPDATE biz_card_category SET ${sets.join(',')} WHERE id=? AND merchant_id=?`, params);
    await logAction(req, '更新卡类型', `#${req.params.id}`);
    res.json(ok());
  } catch (e) { next(e); }
});

// ============ 开卡（四通道同一骨架）============
// body: { vip_id | new_member:{realname,phone,...}, card_type_id, actual_money, pay_method, open_card_mode, open_date, membership_id, coach_id, remark, retainage }
r.post('/cards/open', staffAuth(), async (req, res, next) => {
  try {
    const b = req.body;
    const mid = req.user.mid;
    const cat = await db.queryOne('SELECT * FROM biz_card_category WHERE id=? AND merchant_id=?', [b.card_type_id, mid]);
    if (!cat) throw new BizError('卡类型不存在');
    if (cat.status !== 1) throw new BizError('该卡类型已下架');

    // 会员: 已有 or 快速建档(无档先建档)
    let vip;
    if (b.vip_id) {
      vip = await db.queryOne('SELECT * FROM biz_vip_user WHERE id=? AND merchant_id=?', [b.vip_id, mid]);
      if (!vip) throw new BizError('会员不存在');
    } else if (b.new_member && b.new_member.phone) {
      const nm = b.new_member;
      vip = await db.queryOne('SELECT * FROM biz_vip_user WHERE merchant_id=? AND phone=?', [mid, nm.phone]);
      if (!vip) {
        const bcrypt = require('bcryptjs');
        const vid = await db.insert(
          `INSERT INTO biz_vip_user (merchant_id,phone,password,realname,nickname,gender,source_id,source_name,membership_id,membership_name)
           VALUES (?,?,?,?,?,?,?,?,?,?)`,
          [mid, nm.phone, await bcrypt.hash('123456', 10), nm.realname || '', nm.realname || '', nm.gender || 0,
            nm.source_id || 0, nm.source_name || '', b.membership_id || 0, b.membership_name || '']);
        await db.exec('INSERT IGNORE INTO biz_user_club (vip_user_id, club_id) VALUES (?,?)', [vid, req.clubId]);
        vip = await db.queryOne('SELECT * FROM biz_vip_user WHERE id=?', [vid]);
      }
    } else throw new BizError('请选择会员或填写新会员信息');

    if (vip.is_black) throw new BizError(`该会员在黑名单中(${vip.black_reason})，禁止购卡`);
    if (cat.purchase_limit > 0) {
      const [{ n }] = await db.query('SELECT COUNT(*) n FROM biz_member_card WHERE vip_id=? AND card_type_id=? AND status!=5', [vip.id, cat.id]);
      if (n >= cat.purchase_limit) throw new BizError(`该卡每人限购${cat.purchase_limit}张`);
    }

    const actual = Number(b.actual_money != null ? b.actual_money : cat.price);
    if (isNaN(actual) || actual < 0) throw new BizError('实收金额不合法');
    const retainage = Number(b.retainage || 0);
    const counts = cat.total_counts;
    const unit = counts > 0 ? +(actual / counts).toFixed(2) : 0;
    const isStore = cat.card_kind === 3;
    const sum = isStore ? actual + Number(cat.gift_money) : 0;

    // 开卡方式: 1立即 2首次使用 3指定日期
    const mode = b.open_card_mode || cat.open_card_mode || 1;
    let status = 1, openTime = now(), expireTime = dayjs().add(cat.expire_days, 'day').endOf('day').format('YYYY-MM-DD HH:mm:ss');
    let latestOpen = null;
    if (mode === 2) { status = 0; openTime = null; expireTime = null; latestOpen = dayjs().add(cat.latest_open_days || 30, 'day').format('YYYY-MM-DD HH:mm:ss'); }
    if (mode === 3) {
      if (!b.open_date) throw new BizError('请选择开卡日期');
      const od = dayjs(b.open_date);
      if (od.isAfter(dayjs())) { status = 0; openTime = null; latestOpen = od.format('YYYY-MM-DD HH:mm:ss'); expireTime = null; }
      else { openTime = od.format('YYYY-MM-DD HH:mm:ss'); expireTime = od.add(cat.expire_days, 'day').endOf('day').format('YYYY-MM-DD HH:mm:ss'); }
    }

    // 业绩归属(纪要2.4「谁开的卡即归属谁」): 表单未指定时默认=开卡经手人
    const membershipId = b.membership_id != null && b.membership_id !== '' ? b.membership_id : req.user.uid;
    const membershipName = b.membership_id != null && b.membership_id !== '' ? (b.membership_name || '') : req.user.name;
    const cn = `HT${dayjs().format('YYYYMMDDHHmmss')}${String(Math.floor(Math.random() * 900) + 100)}`;
    const payLabel = PAY_METHODS[b.pay_method] || b.pay_method || '现金';
    // 开卡门店(店属性): 卡在哪个店购买即归属该店, 后续流水统计跟随卡 (2026-09-07需求会)
    let openClubId = req.clubId;
    if (b.club_id) {
      const club = await db.queryOne('SELECT id FROM biz_club WHERE id=? AND merchant_id=? AND status=1', [b.club_id, mid]);
      if (!club) throw new BizError('开卡门店不存在');
      openClubId = club.id;
    }
    req.clubId = openClubId;

    const result = await db.tx(async (t) => {
      const cardId = await t.insert(
        `INSERT INTO biz_member_card (merchant_id,club_id,vip_id,card_kind,card_type_id,card_type_name,counts,left_counts,
          sum_money,left_money,unit_price,actual_money,retainage,open_card_mode,open_card_time,start_use_time,expire_time,expire_days,latest_open_time,
          contract_number,coach_id,coach_name,membership_id,membership_name,ope_user_id,ope_username,pay_method,realname,phone,source_port,remark,status)
         VALUES (?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?)`,
        [mid, req.clubId, vip.id, cat.card_kind, cat.id, cat.title, counts, counts, sum, sum, unit, actual, retainage,
          mode, openTime, openTime, expireTime, cat.expire_days, latestOpen, cn,
          b.coach_id || vip.coach_id || 0, b.coach_name || vip.coach_name || '', membershipId, membershipName,
          req.user.uid, req.user.name, b.pay_method || 'cash', vip.realname, vip.phone, 1, b.remark || '', status]);
      // 是否新用户首单
      const first = await t.queryOne('SELECT COUNT(*) n FROM biz_card_recharge WHERE vip_id=? AND actual_money>0', [vip.id]);
      const rechargeId = await t.insert(
        `INSERT INTO biz_card_recharge (merchant_id,club_id,card_id,vip_id,card_kind,card_type_id,card_type_name,type,actual_money,gift_money,
          counts,expire_days,pay_method,membership_id,membership_name,ope_user_id,ope_username,realname,phone,contract_number,is_new_user,remark)
         VALUES (?,?,?,?,?,?,?,1,?,?,?,?,?,?,?,?,?,?,?,?,?,?)`,
        [mid, req.clubId, cardId, vip.id, cat.card_kind, cat.id, cat.title, actual, isStore ? cat.gift_money : 0,
          counts, cat.expire_days, b.pay_method || 'cash', membershipId, membershipName, req.user.uid, req.user.name,
          vip.realname, vip.phone, cn, first.n === 0 ? 1 : 0, b.remark || '']);
      const content = contractTemplate({
        realname: vip.realname, phone: vip.phone, catTitle: cat.title, actual, counts,
        expireDays: cat.expire_days, payLabel, time: now(),
        retainage, clubName: ((await t.queryOne('SELECT name FROM biz_club WHERE id=?', [req.clubId])) || {}).name || '',
      });
      const contractId = await t.insert(
        `INSERT INTO biz_club_contract (merchant_id,club_id,contract_num,card_id,recharge_id,vip_id,realname,phone,title,type,content,sign_status)
         VALUES (?,?,?,?,?,?,?,?,?,1,?,0)`,
        [mid, req.clubId, cn, cardId, rechargeId, vip.id, vip.realname, vip.phone, `${cat.title}购卡合同`, content]);
      // 潜客自动转正
      await t.exec('UPDATE biz_user_potential SET is_vip_user=1, vip_user_id=? WHERE merchant_id=? AND phone=? AND is_vip_user=0', [vip.id, mid, vip.phone]);
      // 购卡意向自动核销
      if (b.intent_id) {
        // 从「购卡意向 → 去开卡」进来的: 认这一条意向, 哪怕最终换了张别的卡也算跟进完成,
        // 换卡时把实际开的卡记进备注, 免得对不上账。
        await t.exec(
          `UPDATE biz_card_intent SET status=1, handle_user=?, handle_time=NOW(),
             handle_remark=CASE WHEN card_type_id=? THEN handle_remark ELSE ? END
           WHERE id=? AND merchant_id=? AND vip_id=? AND status=0`,
          [req.user.name, cat.id, `实际开卡：${cat.title}`, b.intent_id, mid, vip.id]);
      } else {
        await t.exec('UPDATE biz_card_intent SET status=1, handle_user=?, handle_time=NOW() WHERE merchant_id=? AND vip_id=? AND card_type_id=? AND status=0',
          [req.user.name, mid, vip.id, cat.id]);
      }
      return { cardId, rechargeId, contractId, contract_number: cn };
    });
    await lifecycleTick(true);
    // 购卡成功短信
    await require('../sms').send(mid, {
      vipId: vip.id, realname: vip.realname, phone: vip.phone, scene: 'buy_card',
      params: { name: vip.realname, card: cat.title, counts: cat.total_counts },
    });
    await logAction(req, '开卡', `${vip.realname} ${cat.title} ¥${actual}`);
    res.json(ok(result));
  } catch (e) { next(e); }
});

// ============ 续卡（同卡追加, 业绩归续卡经手人）============
r.post('/cards/:id/renew', staffAuth(), async (req, res, next) => {
  try {
    const b = req.body;
    const card = await db.queryOne('SELECT * FROM biz_member_card WHERE id=? AND merchant_id=?', [req.params.id, req.user.mid]);
    if (!card) throw new BizError('会员卡不存在');
    if ([4, 5].includes(card.status)) throw new BizError('该卡已停用/退卡，不能续费');
    const addCounts = parseInt(b.add_counts || 0);
    const addDays = parseInt(b.add_days || 0);
    const actual = Number(b.actual_money || 0);
    if (addCounts <= 0 && addDays <= 0 && !(card.card_kind === 3 && actual > 0)) throw new BizError('请填写续费内容');
    const cn = `HT${dayjs().format('YYYYMMDDHHmmss')}${String(Math.floor(Math.random() * 900) + 100)}`;
    const membershipId = b.membership_id || req.user.uid;
    const membershipName = b.membership_name || req.user.name;
    const giftMoney = Number(b.gift_money || 0);

    await db.tx(async (t) => {
      // 到期基准: 已过期从今天续, 未过期顺延
      const base = card.expire_time && dayjs(card.expire_time).isAfter(dayjs()) ? dayjs(card.expire_time) : dayjs();
      const newExpire = addDays > 0 ? base.add(addDays, 'day').endOf('day').format('YYYY-MM-DD HH:mm:ss') : card.expire_time;
      const newCounts = card.counts + addCounts;
      const newLeft = card.left_counts + addCounts;
      const newActual = Number(card.actual_money) + actual;
      const newUnit = newCounts > 0 ? +(newActual / newCounts).toFixed(2) : 0;
      const storeAdd = card.card_kind === 3 ? actual + giftMoney : 0;
      await t.exec(
        `UPDATE biz_member_card SET counts=?, left_counts=?, actual_money=?, unit_price=?,
          sum_money=sum_money+?, left_money=left_money+?, expire_time=?, is_renew_card=1,
          status=IF(status=2,1,status), membership_id=?, membership_name=? WHERE id=?`,
        [newCounts, newLeft, newActual, newUnit, storeAdd, storeAdd, newExpire, membershipId, membershipName, card.id]);
      const rechargeId = await t.insert(
        `INSERT INTO biz_card_recharge (merchant_id,club_id,card_id,vip_id,card_kind,card_type_id,card_type_name,type,actual_money,gift_money,
          counts,expire_days,pay_method,membership_id,membership_name,ope_user_id,ope_username,realname,phone,contract_number,remark)
         VALUES (?,?,?,?,?,?,?,2,?,?,?,?,?,?,?,?,?,?,?,?,?)`,
        [req.user.mid, card.club_id, card.id, card.vip_id, card.card_kind, card.card_type_id, card.card_type_name,
          actual, giftMoney, addCounts, addDays, b.pay_method || 'cash', membershipId, membershipName,
          req.user.uid, req.user.name, card.realname, card.phone, cn, b.remark || '续卡']);
      const content = contractTemplate({
        realname: card.realname, phone: card.phone, catTitle: `${card.card_type_name}（续费）`, actual,
        counts: addCounts, expireDays: addDays, payLabel: PAY_METHODS[b.pay_method] || '现金', time: now(),
        clubName: ((await t.queryOne('SELECT name FROM biz_club WHERE id=?', [card.club_id])) || {}).name || '',
      });
      await t.insert(
        `INSERT INTO biz_club_contract (merchant_id,club_id,contract_num,card_id,recharge_id,vip_id,realname,phone,title,type,content,sign_status)
         VALUES (?,?,?,?,?,?,?,?,?,1,?,0)`,
        [req.user.mid, card.club_id, cn, card.id, rechargeId, card.vip_id, card.realname, card.phone, `${card.card_type_name}续费合同`, content]);
    });
    await lifecycleTick(true);
    await logAction(req, '续卡', `${card.realname} ${card.card_type_name} +¥${actual}`);
    res.json(ok());
  } catch (e) { next(e); }
});

// ============ 暂停（请假）/ 恢复 ============
r.post('/cards/:id/pause', staffAuth(), async (req, res, next) => {
  try {
    const card = await db.queryOne('SELECT * FROM biz_member_card WHERE id=? AND merchant_id=?', [req.params.id, req.user.mid]);
    if (!card) throw new BizError('会员卡不存在');
    if (card.status !== 1) throw new BizError('仅使用中的卡可以暂停');
    const cat = await db.queryOne('SELECT * FROM biz_card_category WHERE id=?', [card.card_type_id]);
    if (cat && cat.pause_times > 0 && card.pause_used_times >= cat.pause_times) throw new BizError(`该卡最多可暂停${cat.pause_times}次，已用完`);
    if (cat && cat.pause_times === 0) throw new BizError('该卡类型不支持暂停');
    const days = parseInt(req.body.days || 0);
    if (days <= 0) throw new BizError('请填写暂停天数');
    if (cat && cat.pause_max_days > 0 && days > cat.pause_max_days) throw new BizError(`单次最长暂停${cat.pause_max_days}天`);
    const start = now();
    const end = dayjs().add(days, 'day').format('YYYY-MM-DD HH:mm:ss');
    // 有效期顺延
    const newExpire = card.expire_time ? dayjs(card.expire_time).add(days, 'day').format('YYYY-MM-DD HH:mm:ss') : null;
    await db.exec('UPDATE biz_member_card SET status=3, suspend_start_time=?, suspend_end_time=?, expire_time=?, pause_used_times=pause_used_times+1 WHERE id=?',
      [start, end, newExpire, card.id]);
    await logAction(req, '暂停会员卡', `${card.realname} ${card.card_type_name} ${days}天`);
    res.json(ok());
  } catch (e) { next(e); }
});

r.post('/cards/:id/resume', staffAuth(), async (req, res, next) => {
  try {
    const card = await db.queryOne('SELECT * FROM biz_member_card WHERE id=? AND merchant_id=?', [req.params.id, req.user.mid]);
    if (!card || card.status !== 3) throw new BizError('该卡不在暂停状态');
    // 提前恢复: 未用完的暂停天数从到期时间扣回
    const unusedDays = Math.max(0, dayjs(card.suspend_end_time).diff(dayjs(), 'day'));
    const newExpire = card.expire_time ? dayjs(card.expire_time).subtract(unusedDays, 'day').format('YYYY-MM-DD HH:mm:ss') : null;
    await db.exec('UPDATE biz_member_card SET status=1, suspend_start_time=NULL, suspend_end_time=NULL, expire_time=? WHERE id=?', [newExpire, card.id]);
    await logAction(req, '恢复会员卡', `${card.realname} ${card.card_type_name}`);
    res.json(ok());
  } catch (e) { next(e); }
});

// ============ 停卡/禁用 与 启用 ============
r.post('/cards/:id/stop', staffAuth('admin', 'manager'), async (req, res, next) => {
  try {
    const card = await db.queryOne('SELECT * FROM biz_member_card WHERE id=? AND merchant_id=?', [req.params.id, req.user.mid]);
    if (!card) throw new BizError('会员卡不存在');
    if ([5].includes(card.status)) throw new BizError('已退卡不能操作');
    await db.exec('UPDATE biz_member_card SET status=4, remark=CONCAT(remark, ?) WHERE id=?', [` [停卡:${req.body.reason || ''}]`, card.id]);
    await lifecycleTick(true);
    await logAction(req, '停卡', `${card.realname} ${card.card_type_name} ${req.body.reason || ''}`);
    res.json(ok());
  } catch (e) { next(e); }
});
r.post('/cards/:id/enable', staffAuth('admin', 'manager'), async (req, res, next) => {
  try {
    const card = await db.queryOne('SELECT * FROM biz_member_card WHERE id=? AND merchant_id=?', [req.params.id, req.user.mid]);
    if (!card || card.status !== 4) throw new BizError('该卡不在停用状态');
    const st = card.expire_time && dayjs(card.expire_time).isBefore(dayjs()) ? 2 : 1;
    await db.exec('UPDATE biz_member_card SET status=? WHERE id=?', [st, card.id]);
    await lifecycleTick(true);
    res.json(ok());
  } catch (e) { next(e); }
});

// ============ 退卡（按剩余价值, 负向流水冲减, 店长审核=店长角色才可操作）============
r.post('/cards/:id/refund', staffAuth('admin', 'manager'), async (req, res, next) => {
  try {
    const card = await db.queryOne('SELECT * FROM biz_member_card WHERE id=? AND merchant_id=?', [req.params.id, req.user.mid]);
    if (!card) throw new BizError('会员卡不存在');
    if (card.status === 5) throw new BizError('该卡已退卡');
    const { cardRemainValue, CARD_KIND } = require('../util');
    const remain = cardRemainValue(card);
    // 退节数: 计次卡可只退一部分, 不传则按整张剩余退
    const isCount = Number(card.counts) > 0;
    let refundCounts = isCount ? Number(req.body.refund_counts) : 0;
    if (isCount) {
      if (!Number.isFinite(refundCounts) || refundCounts <= 0) refundCounts = Number(card.left_counts || 0);
      if (refundCounts > Number(card.left_counts || 0)) throw new BizError(`最多只能退 ${card.left_counts} 次`);
    }
    // 退部分次数时剩余价值按比例折算
    const suggest = isCount && refundCounts < Number(card.left_counts || 0)
      ? Math.round(refundCounts * Number(card.unit_price || 0) * 100) / 100
      : remain;
    const amount = req.body.refund_money === '' || req.body.refund_money == null
      ? suggest : Number(req.body.refund_money);
    if (isNaN(amount) || amount < 0) throw new BizError('请填写退款金额');
    if (amount > Number(card.actual_money)) throw new BizError('退款金额不能超过实收金额');
    // 退款与系统算出的剩余价值不一致时在备注里留痕, 便于财务核对
    const diffNote = Math.abs(amount - suggest) > 0.01 ? ` (应退¥${suggest}, 实退¥${amount})` : '';
    await db.tx(async (t) => {
      // 只退部分次数: 扣减剩余次数, 卡继续可用; 退完或非计次卡: 整张作废
      const partial = isCount && refundCounts < Number(card.left_counts || 0);
      if (partial) {
        await t.exec('UPDATE biz_member_card SET left_counts=left_counts-?, remark=CONCAT(remark, ?) WHERE id=?',
          [refundCounts, ` [退${refundCounts}次:¥${amount}${diffNote} ${req.body.reason || ''}]`, card.id]);
      } else {
        await t.exec('UPDATE biz_member_card SET status=5, left_counts=0, remark=CONCAT(remark, ?) WHERE id=?',
          [` [退卡:¥${amount}${diffNote} ${req.body.reason || ''}]`, card.id]);
      }
      await t.insert(
        `INSERT INTO biz_card_recharge (merchant_id,club_id,card_id,vip_id,card_kind,card_type_id,card_type_name,type,actual_money,
          pay_method,membership_id,membership_name,ope_user_id,ope_username,realname,phone,remark)
         VALUES (?,?,?,?,?,?,?,4,?,?,?,?,?,?,?,?,?)`,
        [req.user.mid, card.club_id, card.id, card.vip_id, card.card_kind, card.card_type_id, card.card_type_name,
          -amount, req.body.pay_method || 'cash', card.membership_id, card.membership_name,
          req.user.uid, req.user.name, card.realname, card.phone,
          `${partial ? `退${refundCounts}次` : '退卡'} ${req.body.reason || ''}`.trim()]);
    });
    await lifecycleTick(true);
    await logAction(req, '退卡', `${card.realname} ${card.card_type_name} ${isCount ? `退${refundCounts}次 ` : ''}退¥${amount}${diffNote}`);
    res.json(ok());
  } catch (e) { next(e); }
});

// ============ 改卡/补卡信息（走操作日志留痕）============
r.put('/cards/:id', staffAuth('admin', 'manager'), async (req, res, next) => {
  try {
    const card = await db.queryOne('SELECT * FROM biz_member_card WHERE id=? AND merchant_id=?', [req.params.id, req.user.mid]);
    if (!card) throw new BizError('会员卡不存在');
    const b = req.body;
    const sets = []; const params = []; const changes = [];
    if (b.expire_time !== undefined) { sets.push('expire_time=?'); params.push(b.expire_time); changes.push(`有效期 ${card.expire_time}→${b.expire_time}`); }
    if (b.left_counts !== undefined) { sets.push('left_counts=?'); params.push(b.left_counts); changes.push(`剩余次数 ${card.left_counts}→${b.left_counts}`); }
    if (b.left_money !== undefined) { sets.push('left_money=?'); params.push(b.left_money); changes.push(`余额 ${card.left_money}→${b.left_money}`); }
    if (b.membership_id !== undefined) { sets.push('membership_id=?, membership_name=?'); params.push(b.membership_id, b.membership_name || ''); changes.push(`业绩归属→${b.membership_name}`); }
    if (b.coach_id !== undefined) { sets.push('coach_id=?, coach_name=?'); params.push(b.coach_id, b.coach_name || ''); changes.push(`服务教练→${b.coach_name}`); }
    if (b.remark !== undefined) { sets.push('remark=?'); params.push(b.remark); }
    if (!sets.length) return res.json(ok());
    params.push(card.id);
    await db.exec(`UPDATE biz_member_card SET ${sets.join(',')} WHERE id=?`, params);
    await lifecycleTick(true);
    await logAction(req, '改卡', `卡#${card.id} ${card.realname}: ${changes.join('; ')} 原因:${b.reason || ''}`);
    res.json(ok());
  } catch (e) { next(e); }
});

// ============ 会员卡列表 ============
r.get('/cards', staffAuth(), async (req, res, next) => {
  try {
    await lifecycleTick();
    const { p, size, offset } = page(req);
    const { vip_id, status, kind, keyword, card_type_id, expire_within, export: exp } = req.query;
    const cond = ['merchant_id=?']; const params = [req.user.mid];
    if (vip_id) { cond.push('vip_id=?'); params.push(vip_id); }
    if (status != null && status !== '') { cond.push('status=?'); params.push(status); }
    if (kind) { cond.push('card_kind=?'); params.push(kind); }
    if (card_type_id) { cond.push('card_type_id=?'); params.push(card_type_id); }
    if (keyword) { cond.push('(realname LIKE ? OR phone LIKE ?)'); params.push(`%${keyword}%`, `%${keyword}%`); }
    if (expire_within) { cond.push('status=1 AND expire_time<=?'); params.push(dayjs().add(Number(expire_within), 'day').format('YYYY-MM-DD 23:59:59')); }
    const where = cond.join(' AND ');
    const [{ total }] = await db.query(`SELECT COUNT(*) total FROM biz_member_card WHERE ${where}`, params);
    const rows = await db.query(`SELECT * FROM biz_member_card WHERE ${where} ORDER BY id DESC ${exp ? '' : 'LIMIT ? OFFSET ?'}`,
      exp ? params : [...params, size, offset]);
    if (exp) {
      return sendCsv(res, `会员卡列表_${dayjs().format('YYYYMMDD')}`, [
        ['id', '卡ID'], ['realname', '会员'], ['phone', '手机号'], ['card_type_name', '卡类型'], ['counts', '总次数'], ['left_counts', '剩余次数'],
        ['left_money', '余额'], ['actual_money', '实收金额'], ['open_card_time', '开卡时间'], ['expire_time', '到期时间'], ['membership_name', '业绩归属'],
      ], rows);
    }
    res.json(ok({ list: rows, total, page: p }));
  } catch (e) { next(e); }
});

r.get('/cards/:id', staffAuth(), async (req, res, next) => {
  try {
    const card = await db.queryOne('SELECT * FROM biz_member_card WHERE id=? AND merchant_id=?', [req.params.id, req.user.mid]);
    if (!card) throw new BizError('会员卡不存在');
    const recharges = await db.query('SELECT * FROM biz_card_recharge WHERE card_id=? ORDER BY id DESC', [card.id]);
    const spends = await db.query('SELECT * FROM biz_card_spend WHERE card_id=? ORDER BY id DESC LIMIT 100', [card.id]);
    const cat = await db.queryOne('SELECT * FROM biz_card_category WHERE id=?', [card.card_type_id]);
    res.json(ok({ card, recharges, spends, category: cat }));
  } catch (e) { next(e); }
});

// ============ 合同 ============
r.get('/contracts', staffAuth(), async (req, res, next) => {
  try {
    const { p, size, offset } = page(req);
    const { keyword, sign_status } = req.query;
    const cond = ['merchant_id=?', 'hidden=0']; const params = [req.user.mid];
    if (keyword) { cond.push('(realname LIKE ? OR phone LIKE ? OR contract_num LIKE ?)'); params.push(`%${keyword}%`, `%${keyword}%`, `%${keyword}%`); }
    if (sign_status != null && sign_status !== '') { cond.push('sign_status=?'); params.push(sign_status); }
    const where = cond.join(' AND ');
    const [{ total }] = await db.query(`SELECT COUNT(*) total FROM biz_club_contract WHERE ${where}`, params);
    const rows = await db.query(
      `SELECT id,contract_num,card_id,vip_id,realname,phone,title,type,sign_status,sign_time,insert_time FROM biz_club_contract WHERE ${where} ORDER BY id DESC LIMIT ? OFFSET ?`,
      [...params, size, offset]);
    res.json(ok({ list: rows, total }));
  } catch (e) { next(e); }
});

// 待签署数量(工作台角标/合同页提示用)
r.get('/contracts/pending-count', staffAuth(), async (req, res, next) => {
  try {
    const [{ n }] = await db.query('SELECT COUNT(*) n FROM biz_club_contract WHERE merchant_id=? AND hidden=0 AND sign_status=0', [req.user.mid]);
    res.json(ok({ count: n }));
  } catch (e) { next(e); }
});

// 店内当面签: 员工把设备递给会员手写, 签名与会员自签存同一个字段,
// 另记 sign_source=2 与经办人, 事后能分清是谁见证的。
r.post('/contracts/:id/sign', staffAuth(), async (req, res, next) => {
  try {
    const c = await db.queryOne('SELECT * FROM biz_club_contract WHERE id=? AND merchant_id=? AND hidden=0', [req.params.id, req.user.mid]);
    if (!c) throw new BizError('合同不存在');
    if (c.sign_status === 1) throw new BizError('合同已签署');
    if (!req.body.sign_img) throw new BizError('请先手写签名');
    await db.exec(
      'UPDATE biz_club_contract SET sign_status=1, sign_img=?, sign_time=NOW(), sign_source=2, sign_by=? WHERE id=?',
      [req.body.sign_img, req.user.name, c.id]);
    res.json(ok());
  } catch (e) { next(e); }
});

r.get('/contracts/:id', staffAuth(), async (req, res, next) => {
  try {
    const c = await db.queryOne('SELECT * FROM biz_club_contract WHERE id=? AND merchant_id=?', [req.params.id, req.user.mid]);
    if (!c) throw new BizError('合同不存在');
    res.json(ok(c));
  } catch (e) { next(e); }
});

module.exports = r;
