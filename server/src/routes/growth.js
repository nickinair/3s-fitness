/* 会员成长域: 体测记录 / 里程碑 / 动作库 / 训练计划(AI解析) / 购卡意向 / 短信记录 */
const express = require('express');
const dayjs = require('dayjs');
const db = require('../db');
const sms = require('../sms');
const { parsePlan } = require('../parser');
const { ok, BizError, page, logAction, sendCsv } = require('../util');
const { staffAuth } = require('../middleware/auth');

const r = express.Router();

/* ---- 导出用中文字典 (与 web/admin/js/api.js dicts 保持一致) ---- */
const MILESTONE_TYPE = { 1: '按课时', 2: '按天数' };
const MILESTONE_STATUS = { 0: '待总结', 1: '已总结' };
const INTENT_STATUS = { 0: '待跟进', 1: '已开卡', 2: '已关闭' };
const SMS_SCENE = { buy_card: '购卡成功', lesson_done: '销课确认', card_low: '卡将耗尽', milestone: '里程碑', plan_push: '计划推送', intent: '意向确认', booking_ok: '预约成功', verify_code: '安全验证码' };
const SMS_STATUS = { 0: '模拟', 1: '成功', 2: '失败' };
const fmtMin = (v) => (v ? dayjs(v).format('YYYY-MM-DD HH:mm') : '');

/* ============ 里程碑核心逻辑 (供消课/巡检调用) ============ */
// 按课时里程碑: 消课后调用, 累计私教课时跨节点则生成
async function checkLessonMilestone(vipId, cardId) {
  const vip = await db.queryOne('SELECT * FROM biz_vip_user WHERE id=?', [vipId]);
  if (!vip) return;
  const [{ total }] = await db.query('SELECT COALESCE(SUM(costs),0) total FROM biz_ptrain_record WHERE vip_id=? AND type IN (1,3)', [vipId]);
  // 间隔取本次扣卡的卡类型配置, 无则默认10
  let interval = 10;
  if (cardId) {
    const cat = await db.queryOne(
      `SELECT cc.milestone_type, cc.milestone_interval FROM biz_member_card mc JOIN biz_card_category cc ON cc.id=mc.card_type_id WHERE mc.id=?`, [cardId]);
    if (cat && cat.milestone_type === 1 && cat.milestone_interval > 0) interval = cat.milestone_interval;
    if (cat && cat.milestone_type === 0) return; // 该卡种关闭里程碑
  }
  const node = Math.floor(total / interval) * interval;
  if (node < interval) return;
  // 总结责任人: 主教练; 未设主教练时兜底为最近一次上课的教练, 避免里程碑无人认领
  let coachId = vip.coach_id || 0, coachName = vip.coach_name || '';
  if (!coachId) {
    const last = await db.queryOne('SELECT coach_id, coach_name FROM biz_ptrain_record WHERE vip_id=? ORDER BY id DESC LIMIT 1', [vipId]);
    if (last) { coachId = last.coach_id; coachName = last.coach_name; }
  }
  const rst = await db.exec(
    `INSERT IGNORE INTO biz_milestone (merchant_id,club_id,vip_id,realname,phone,coach_id,coach_name,type,node_value,card_id,card_type_name)
     VALUES (?,?,?,?,?,?,?,1,?,0,'')`,
    [vip.merchant_id, 0, vip.id, vip.realname, vip.phone, coachId, coachName, node]);
  if (rst.affectedRows > 0) {
    await sms.send(vip.merchant_id, { vipId: vip.id, realname: vip.realname, phone: vip.phone, scene: 'milestone', params: { name: vip.realname, node, unit: '节课' } });
  }
}

// 按天数里程碑 + 卡将耗尽短信 (由 lifecycleTick 周期调用)
async function dailyGrowthTick() {
  // 期限卡按天数里程碑
  const cards = await db.query(
    `SELECT mc.id, mc.merchant_id, mc.club_id, mc.vip_id, mc.realname, mc.phone, mc.card_type_name, mc.open_card_time,
            cc.milestone_interval, v.coach_id, v.coach_name
     FROM biz_member_card mc
     JOIN biz_card_category cc ON cc.id=mc.card_type_id AND cc.milestone_type=2 AND cc.milestone_interval>0
     JOIN biz_vip_user v ON v.id=mc.vip_id
     WHERE mc.status=1 AND mc.open_card_time IS NOT NULL`);
  for (const c of cards) {
    const days = dayjs().diff(dayjs(c.open_card_time), 'day');
    const node = Math.floor(days / c.milestone_interval) * c.milestone_interval;
    if (node < c.milestone_interval) continue;
    const rst = await db.exec(
      `INSERT IGNORE INTO biz_milestone (merchant_id,club_id,vip_id,realname,phone,coach_id,coach_name,type,node_value,card_id,card_type_name)
       VALUES (?,?,?,?,?,?,?,2,?,?,?)`,
      [c.merchant_id, c.club_id, c.vip_id, c.realname, c.phone, c.coach_id || 0, c.coach_name || '', node, c.id, c.card_type_name]);
    if (rst.affectedRows > 0) {
      await sms.send(c.merchant_id, { vipId: c.vip_id, realname: c.realname, phone: c.phone, scene: 'milestone', params: { name: c.realname, node, unit: '天' } });
    }
  }
  // 卡将耗尽: 次卡/私教卡剩余<=2次; 时间卡剩余<=7天
  const low = await db.query(
    `SELECT * FROM biz_member_card WHERE status=1 AND (
       (card_kind IN (1,4) AND left_counts<=2 AND left_counts>=0 AND counts>0) OR
       (card_kind=2 AND expire_time IS NOT NULL AND expire_time<=DATE_ADD(NOW(), INTERVAL 7 DAY)))`);
  for (const c of low) {
    const detail = c.card_kind === 2 ? `将于${dayjs(c.expire_time).format('M月D日')}到期` : `仅剩${c.left_counts}节`;
    await sms.sendOnce(c.merchant_id, {
      vipId: c.vip_id, realname: c.realname, phone: c.phone, scene: 'card_low',
      params: { name: c.realname, card: c.card_type_name, detail },
    }, 7);
  }
}

/* ============ 体测记录 ============ */
r.get('/body-records', staffAuth(), async (req, res, next) => {
  try {
    if (!req.query.vip_id) throw new BizError('缺少会员ID');
    const rows = await db.query('SELECT * FROM biz_body_record WHERE vip_id=? AND merchant_id=? ORDER BY record_date, id', [req.query.vip_id, req.user.mid]);
    res.json(ok(rows));
  } catch (e) { next(e); }
});

r.post('/body-records', staffAuth(), async (req, res, next) => {
  try {
    const b = req.body;
    if (!b.vip_id || !b.record_date) throw new BizError('请选择会员与日期');
    const vip = await db.queryOne('SELECT * FROM biz_vip_user WHERE id=? AND merchant_id=?', [b.vip_id, req.user.mid]);
    if (!vip) throw new BizError('会员不存在');
    const coach = req.user.role === 'coach' ? await db.queryOne('SELECT id,realname FROM biz_club_coach WHERE id=?', [req.user.coachId]) : null;
    const id = await db.insert(
      `INSERT INTO biz_body_record (merchant_id,club_id,vip_id,realname,coach_id,coach_name,record_date,height,weight,body_fat,muscle,bust,waist,hip,remark)
       VALUES (?,?,?,?,?,?,?,?,?,?,?,?,?,?,?)`,
      [req.user.mid, req.clubId, vip.id, vip.realname, coach ? coach.id : 0, coach ? coach.realname : req.user.name,
        b.record_date, b.height || null, b.weight || null, b.body_fat || null, b.muscle || null, b.bust || null, b.waist || null, b.hip || null, b.remark || '']);
    await logAction(req, '录入体测', `${vip.realname} ${b.record_date} 体重${b.weight || '-'}kg`);
    res.json(ok({ id }));
  } catch (e) { next(e); }
});

r.delete('/body-records/:id', staffAuth('admin', 'manager', 'coach'), async (req, res, next) => {
  try {
    await db.exec('DELETE FROM biz_body_record WHERE id=? AND merchant_id=?', [req.params.id, req.user.mid]);
    res.json(ok());
  } catch (e) { next(e); }
});

/* ============ 里程碑 ============ */
r.get('/milestones', staffAuth(), async (req, res, next) => {
  try {
    const { p, size, offset } = page(req);
    const { status, vip_id, keyword } = req.query;
    const exp = req.query.export === 'csv';
    const cond = ['merchant_id=?']; const params = [req.user.mid];
    // 教练看: 指派给自己的 + 未指派但会员主教练是自己的
    if (req.user.role === 'coach') { cond.push('(coach_id=? OR (coach_id=0 AND vip_id IN (SELECT id FROM biz_vip_user WHERE coach_id=?)))'); params.push(req.user.coachId, req.user.coachId); }
    if (status != null && status !== '') { cond.push('status=?'); params.push(status); }
    if (vip_id) { cond.push('vip_id=?'); params.push(vip_id); }
    if (keyword) { cond.push('(realname LIKE ? OR phone LIKE ?)'); params.push(`%${keyword}%`, `%${keyword}%`); }
    const where = cond.join(' AND ');
    const [{ total }] = await db.query(`SELECT COUNT(*) total FROM biz_milestone WHERE ${where}`, params);
    const rows = await db.query(`SELECT * FROM biz_milestone WHERE ${where} ORDER BY status, id DESC ${exp ? '' : 'LIMIT ? OFFSET ?'}`,
      exp ? params : [...params, size, offset]);
    if (exp) {
      rows.forEach(x => {
        x.type_label = MILESTONE_TYPE[x.type] || '';
        x.status_label = MILESTONE_STATUS[x.status] || '';
        x.node_label = x.type === 1 ? `第${x.node_value}节课` : `第${x.node_value}天`;
        x.summary_time_label = fmtMin(x.summary_time);
        x.insert_time_label = fmtMin(x.insert_time);
      });
      return sendCsv(res, `里程碑_${dayjs().format('YYYYMMDD')}`, [
        ['id', '里程碑ID'], ['realname', '会员姓名'], ['phone', '手机号'], ['coach_name', '教练'],
        ['type_label', '类型'], ['node_label', '节点'], ['card_type_name', '关联卡'], ['status_label', '状态'],
        ['summary', '训练总结'], ['summary_time_label', '总结时间'], ['insert_time_label', '生成时间'],
      ], rows);
    }
    res.json(ok({ list: rows, total }));
  } catch (e) { next(e); }
});

r.get('/milestones/pending-count', staffAuth(), async (req, res, next) => {
  try {
    const cond = ['merchant_id=?', 'status=0']; const params = [req.user.mid];
    if (req.user.role === 'coach') { cond.push('(coach_id=? OR (coach_id=0 AND vip_id IN (SELECT id FROM biz_vip_user WHERE coach_id=?)))'); params.push(req.user.coachId, req.user.coachId); }
    const [{ n }] = await db.query(`SELECT COUNT(*) n FROM biz_milestone WHERE ${cond.join(' AND ')}`, params);
    res.json(ok({ count: n }));
  } catch (e) { next(e); }
});

// 教练填写训练总结
r.post('/milestones/:id/summary', staffAuth(), async (req, res, next) => {
  try {
    const m = await db.queryOne('SELECT * FROM biz_milestone WHERE id=? AND merchant_id=?', [req.params.id, req.user.mid]);
    if (!m) throw new BizError('里程碑不存在');
    if (req.user.role === 'coach' && m.coach_id !== req.user.coachId) {
      const v = await db.queryOne('SELECT coach_id FROM biz_vip_user WHERE id=?', [m.vip_id]);
      if (!(m.coach_id === 0 && v && v.coach_id === req.user.coachId)) throw new BizError('仅该会员的主教练可填写总结');
    }
    if (!req.body.summary) throw new BizError('请填写总结内容');
    await db.exec('UPDATE biz_milestone SET status=1, summary=?, summary_time=NOW(), coach_id=IF(coach_id=0,?,coach_id), coach_name=IF(coach_name="",?,coach_name) WHERE id=?',
      [req.body.summary, req.user.role === 'coach' ? req.user.coachId : 0, req.user.name, m.id]);
    await logAction(req, '里程碑总结', `${m.realname} 第${m.node_value}${m.type === 1 ? '节' : '天'}`);
    res.json(ok());
  } catch (e) { next(e); }
});

/* ============ 动作库 ============ */
r.get('/training-actions', staffAuth(), async (req, res, next) => {
  try {
    const { part, keyword } = req.query;
    const cond = ['merchant_id IN (0,?)', 'status=1']; const params = [req.user.mid];
    if (part) { cond.push('part=?'); params.push(part); }
    if (keyword) { cond.push('name LIKE ?'); params.push(`%${keyword}%`); }
    const rows = await db.query(`SELECT * FROM biz_training_action WHERE ${cond.join(' AND ')} ORDER BY merchant_id DESC, part, id`, params);
    res.json(ok(rows));
  } catch (e) { next(e); }
});

r.post('/training-actions', staffAuth(), async (req, res, next) => {
  try {
    const b = req.body;
    if (!b.name) throw new BizError('请填写动作名称');
    const dup = await db.queryOne('SELECT id FROM biz_training_action WHERE merchant_id IN (0,?) AND name=? AND status=1', [req.user.mid, b.name]);
    if (dup) throw new BizError('该动作已存在');
    const id = await db.insert('INSERT INTO biz_training_action (merchant_id,name,part,equipment,description,is_custom) VALUES (?,?,?,?,?,1)',
      [req.user.mid, b.name, b.part || '', b.equipment || '', b.description || '']);
    res.json(ok({ id }));
  } catch (e) { next(e); }
});

r.put('/training-actions/:id', staffAuth(), async (req, res, next) => {
  try {
    const b = req.body;
    const rst = await db.exec('UPDATE biz_training_action SET name=?,part=?,equipment=?,description=? WHERE id=? AND merchant_id=?',
      [b.name, b.part || '', b.equipment || '', b.description || '', req.params.id, req.user.mid]);
    if (!rst.affectedRows) throw new BizError('系统预置动作不可修改');
    res.json(ok());
  } catch (e) { next(e); }
});

r.delete('/training-actions/:id', staffAuth(), async (req, res, next) => {
  try {
    const rst = await db.exec('UPDATE biz_training_action SET status=0 WHERE id=? AND merchant_id=?', [req.params.id, req.user.mid]);
    if (!rst.affectedRows) throw new BizError('系统预置动作不可删除');
    res.json(ok());
  } catch (e) { next(e); }
});

/* ============ 训练计划 ============ */
// 智能解析: 优先豆包大模型, 失败/未配置回落本地规则引擎
r.post('/training-plans/parse', staffAuth(), async (req, res, next) => {
  try {
    if (!req.body.text) throw new BizError('请输入描述内容');
    const ai = require('../ai');
    const { matchActions, buildTitle } = require('../parser');
    let items = null;
    let title = '';
    if (ai.llmEnabled()) {
      try {
        const r = await ai.llmParse(req.body.text);
        items = await matchActions(r.items, req.user.mid);
        title = r.title || '';
      } catch (e) { console.error('[ai] 豆包解析失败, 回落规则引擎:', e.message); }
    }
    if (!items || !items.length) items = await parsePlan(req.body.text, req.user.mid);
    if (!items.length) throw new BizError('未能识别出动作，请换个说法，如“卧推4组12次，深蹲5组8次”');
    if (!title) title = buildTitle(items, req.body.text);
    res.json(ok({ items, title }));
  } catch (e) { next(e); }
});

// AI 能力状态 (前端据此展示引擎标识/启用录音)
r.get('/ai/status', staffAuth(), async (req, res, next) => {
  try {
    const ai = require('../ai');
    res.json(ok({ llm: ai.llmEnabled(), asr: ai.asrEnabled(), model: ai.llmEnabled() ? ai.CFG.arkModel : '' }));
  } catch (e) { next(e); }
});

// 语音识别 (浏览器录音 WAV → 火山引擎极速识别)
r.post('/asr/recognize', staffAuth(), async (req, res, next) => {
  try {
    const { audio_base64, format = 'wav' } = req.body;
    if (!audio_base64) throw new BizError('缺少音频数据');
    if (audio_base64.length > 8 * 1024 * 1024) throw new BizError('录音过长，请控制在1分钟内');
    const ai = require('../ai');
    if (!ai.asrEnabled()) throw new BizError('未配置语音识别服务');
    const text = await ai.asrRecognize(audio_base64, format);
    res.json(ok({ text }));
  } catch (e) {
    if (e.biz) return next(e);
    next(new BizError(e.message || '语音识别失败'));
  }
});

r.get('/training-plans', staffAuth(), async (req, res, next) => {
  try {
    const { p, size, offset } = page(req);
    const { vip_id, coach_id, is_template, keyword } = req.query;
    const cond = ['merchant_id=?', 'status=1']; const params = [req.user.mid];
    if (req.user.role === 'coach') { cond.push('coach_id=?'); params.push(req.user.coachId); }
    else if (coach_id) { cond.push('coach_id=?'); params.push(coach_id); }
    if (vip_id) { cond.push('vip_id=?'); params.push(vip_id); }
    if (is_template != null && is_template !== '') { cond.push('is_template=?'); params.push(is_template); }
    if (keyword) { cond.push('(title LIKE ? OR realname LIKE ?)'); params.push(`%${keyword}%`, `%${keyword}%`); }
    const where = cond.join(' AND ');
    const [{ total }] = await db.query(`SELECT COUNT(*) total FROM biz_training_plan WHERE ${where}`, params);
    const rows = await db.query(`SELECT * FROM biz_training_plan WHERE ${where} ORDER BY id DESC LIMIT ? OFFSET ?`, [...params, size, offset]);
    res.json(ok({ list: rows, total }));
  } catch (e) { next(e); }
});

r.get('/training-plans/:id', staffAuth(), async (req, res, next) => {
  try {
    const plan = await db.queryOne('SELECT * FROM biz_training_plan WHERE id=? AND merchant_id=?', [req.params.id, req.user.mid]);
    if (!plan) throw new BizError('计划不存在');
    res.json(ok(plan));
  } catch (e) { next(e); }
});

r.post('/training-plans', staffAuth(), async (req, res, next) => {
  try {
    const b = req.body;
    if (!b.title) throw new BizError('请填写计划标题');
    if (!Array.isArray(b.items) || !b.items.length) throw new BizError('请添加至少一个动作');
    let coachId = req.user.coachId || 0, coachName = req.user.name;
    if (req.user.role !== 'coach' && b.coach_id) {
      const c = await db.queryOne('SELECT id,realname FROM biz_club_coach WHERE id=?', [b.coach_id]);
      if (c) { coachId = c.id; coachName = c.realname; }
    }
    let vipName = '';
    if (b.vip_id) {
      const v = await db.queryOne('SELECT realname FROM biz_vip_user WHERE id=? AND merchant_id=?', [b.vip_id, req.user.mid]);
      if (!v) throw new BizError('会员不存在');
      vipName = v.realname;
    }
    const id = await db.insert(
      `INSERT INTO biz_training_plan (merchant_id,club_id,coach_id,coach_name,vip_id,realname,title,plan_date,items,note,is_template)
       VALUES (?,?,?,?,?,?,?,?,?,?,?)`,
      [req.user.mid, req.clubId, coachId, coachName, b.vip_id || 0, vipName, b.title,
        b.plan_date || null, JSON.stringify(b.items), b.note || '', b.is_template ? 1 : 0]);
    res.json(ok({ id }));
  } catch (e) { next(e); }
});

r.put('/training-plans/:id', staffAuth(), async (req, res, next) => {
  try {
    const plan = await db.queryOne('SELECT * FROM biz_training_plan WHERE id=? AND merchant_id=?', [req.params.id, req.user.mid]);
    if (!plan) throw new BizError('计划不存在');
    if (req.user.role === 'coach' && plan.coach_id !== req.user.coachId) throw new BizError('只能编辑自己的计划');
    const b = req.body;
    await db.exec('UPDATE biz_training_plan SET title=?,plan_date=?,items=?,note=?,is_template=? WHERE id=?',
      [b.title, b.plan_date || null, JSON.stringify(b.items || []), b.note || '', b.is_template ? 1 : 0, plan.id]);
    res.json(ok());
  } catch (e) { next(e); }
});

r.delete('/training-plans/:id', staffAuth(), async (req, res, next) => {
  try {
    const plan = await db.queryOne('SELECT * FROM biz_training_plan WHERE id=? AND merchant_id=?', [req.params.id, req.user.mid]);
    if (!plan) throw new BizError('计划不存在');
    if (req.user.role === 'coach' && plan.coach_id !== req.user.coachId) throw new BizError('只能删除自己的计划');
    await db.exec('UPDATE biz_training_plan SET status=0 WHERE id=?', [plan.id]);
    res.json(ok());
  } catch (e) { next(e); }
});

// 推送给会员 (站内可见 + 短信触达)
r.post('/training-plans/:id/push', staffAuth(), async (req, res, next) => {
  try {
    const plan = await db.queryOne('SELECT * FROM biz_training_plan WHERE id=? AND merchant_id=?', [req.params.id, req.user.mid]);
    if (!plan) throw new BizError('计划不存在');
    if (!plan.vip_id) throw new BizError('模板无需推送，请先关联会员');
    const vip = await db.queryOne('SELECT * FROM biz_vip_user WHERE id=?', [plan.vip_id]);
    await db.exec('UPDATE biz_training_plan SET pushed=1 WHERE id=?', [plan.id]);
    await sms.send(req.user.mid, {
      vipId: vip.id, realname: vip.realname, phone: vip.phone, scene: 'plan_push',
      params: { name: vip.realname, coach: plan.coach_name, title: plan.title },
    });
    res.json(ok({ msg: '已推送，会员可在小程序「训练计划」中查看' }));
  } catch (e) { next(e); }
});

/* ============ 购卡意向 ============ */
r.get('/card-intents', staffAuth(), async (req, res, next) => {
  try {
    const { p, size, offset } = page(req);
    const { status, keyword } = req.query;
    const exp = req.query.export === 'csv';
    const cond = ['merchant_id=?']; const params = [req.user.mid];
    if (status != null && status !== '') { cond.push('status=?'); params.push(status); }
    if (keyword) { cond.push('(realname LIKE ? OR phone LIKE ?)'); params.push(`%${keyword}%`, `%${keyword}%`); }
    const where = cond.join(' AND ');
    const [{ total }] = await db.query(`SELECT COUNT(*) total FROM biz_card_intent WHERE ${where}`, params);
    const rows = await db.query(`SELECT * FROM biz_card_intent WHERE ${where} ORDER BY status, id DESC ${exp ? '' : 'LIMIT ? OFFSET ?'}`,
      exp ? params : [...params, size, offset]);
    if (exp) {
      rows.forEach(x => {
        x.status_label = INTENT_STATUS[x.status] || '';
        x.handle_time_label = fmtMin(x.handle_time);
        x.insert_time_label = fmtMin(x.insert_time);
      });
      return sendCsv(res, `购卡意向_${dayjs().format('YYYYMMDD')}`, [
        ['id', '意向ID'], ['realname', '会员'], ['phone', '手机号'], ['card_type_name', '意向卡'], ['price', '卡价'],
        ['remark', '会员备注'], ['status_label', '状态'], ['handle_user', '处理人'], ['handle_time_label', '处理时间'],
        ['handle_remark', '处理备注'], ['insert_time_label', '提交时间'],
      ], rows);
    }
    res.json(ok({ list: rows, total }));
  } catch (e) { next(e); }
});

r.get('/card-intents/pending-count', staffAuth(), async (req, res, next) => {
  try {
    const [{ n }] = await db.query('SELECT COUNT(*) n FROM biz_card_intent WHERE merchant_id=? AND status=0', [req.user.mid]);
    res.json(ok({ count: n }));
  } catch (e) { next(e); }
});

// 「去开卡」带参用: 只回这一条意向, 避免把会员姓名/手机号放进 URL
r.get('/card-intents/:id', staffAuth(), async (req, res, next) => {
  try {
    const it = await db.queryOne('SELECT * FROM biz_card_intent WHERE id=? AND merchant_id=?', [req.params.id, req.user.mid]);
    if (!it) throw new BizError('意向不存在');
    res.json(ok(it));
  } catch (e) { next(e); }
});

r.post('/card-intents/:id/close', staffAuth(), async (req, res, next) => {
  try {
    await db.exec('UPDATE biz_card_intent SET status=2, handle_user=?, handle_time=NOW(), handle_remark=? WHERE id=? AND merchant_id=? AND status=0',
      [req.user.name, req.body.remark || '', req.params.id, req.user.mid]);
    res.json(ok());
  } catch (e) { next(e); }
});

/* ============ 短信记录 ============ */
r.get('/sms-logs', staffAuth('admin', 'manager'), async (req, res, next) => {
  try {
    const { p, size, offset } = page(req);
    const { scene, keyword } = req.query;
    const exp = req.query.export === 'csv';
    const cond = ['merchant_id=?']; const params = [req.user.mid];
    if (scene) { cond.push('scene=?'); params.push(scene); }
    if (keyword) { cond.push('(realname LIKE ? OR phone LIKE ?)'); params.push(`%${keyword}%`, `%${keyword}%`); }
    const where = cond.join(' AND ');
    const [{ total }] = await db.query(`SELECT COUNT(*) total FROM biz_sms_log WHERE ${where}`, params);
    const rows = await db.query(`SELECT * FROM biz_sms_log WHERE ${where} ORDER BY id DESC ${exp ? '' : 'LIMIT ? OFFSET ?'}`,
      exp ? params : [...params, size, offset]);
    if (exp) {
      rows.forEach(x => {
        x.scene_label = SMS_SCENE[x.scene] || x.scene || '';
        x.status_label = SMS_STATUS[x.status] || '';
        x.insert_time_label = fmtMin(x.insert_time);
      });
      return sendCsv(res, `短信记录_${dayjs().format('YYYYMMDD')}`, [
        ['id', '记录ID'], ['phone', '手机号'], ['realname', '会员'], ['scene_label', '场景'],
        ['content', '内容'], ['status_label', '状态'], ['insert_time_label', '发送时间'],
      ], rows);
    }
    // 本月用量 (腾讯云免费额度200条/月)
    const [{ monthCount }] = await db.query(
      `SELECT COUNT(*) monthCount FROM biz_sms_log WHERE merchant_id=? AND DATE_FORMAT(insert_time,'%Y-%m')=DATE_FORMAT(NOW(),'%Y-%m')`, [req.user.mid]);
    res.json(ok({ list: rows, total, monthCount }));
  } catch (e) { next(e); }
});

module.exports = r;
module.exports.checkLessonMilestone = checkLessonMilestone;
module.exports.dailyGrowthTick = dailyGrowthTick;
