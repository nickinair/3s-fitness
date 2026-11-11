/**
 * 动作库 × 动作示意图
 *  - 新动作进入动作库(手动新增 / 训练计划存为模板时自动补录)后, 自动给它配一张示意图:
 *      1) 先按内置名称规则匹配(与前端 /static/action-figs.js 同一套);
 *      2) 规则认不出来(如「TRX划船」「弹力带侧走」)时让 AI 理解动作, 从现有图形里选最接近的一种, 实在不像就不配;
 *    同时顺手补全空着的部位/器械/说明。结果存在 biz_training_action.fig_key, 前后端都按它显示。
 *  - 管理者可以在动作库里手动改图(fig_manual=1 后不再被 AI 覆盖)。
 */
const db = require('./db');
const AF = require('../web/static/action-figs.js');

const PARTS = ['胸', '背', '肩', '手臂', '腿', '臀', '核心', '有氧', '拉伸'];
const EQUIPS = ['杠铃', '哑铃', '壶铃', '器械', '绳索', '自重', '弹力带', '其他'];

let colsReady = null;
function ensureCols() {
  if (!colsReady) {
    colsReady = (async () => {
      const add = async (ddl) => { try { await db.exec(`ALTER TABLE biz_training_action ADD COLUMN ${ddl}`); } catch (e) { if (!/Duplicate column/i.test(e.message)) throw e; } };
      await add("fig_key VARCHAR(32) NULL COMMENT '动作示意图类型(空串=不画, NULL=未识别)'");
      await add("fig_manual TINYINT NOT NULL DEFAULT 0 COMMENT '1=人工指定示意图, AI 不再覆盖'");
    })().catch((e) => { colsReady = null; throw e; });
  }
  return colsReady;
}

// AI 归类: 返回 {fig, part, equipment, description}; 未配置模型或失败时返回 null
async function aiClassify({ name, part, equipment, description }) {
  let shared;
  try { shared = require('./routes/ai-assistant').shared; } catch (e) { return null; }
  if (!shared || !shared.CFG || !shared.CFG.keys.length) return null;
  const list = AF.keys.map(k => `${k}=${AF.labels[k]}`).join('\n');
  const prompt = `你是专业健身教练。请判断下面这个健身动作，在给定的示意图类型里选一个「动作模式最接近」的（看身体姿势和发力方式，器械不同没关系，比如「TRX划船」选 seated_row 或 bent_row，「弹力带深蹲」选 squat）；如果都不像，fig 填 none。
同时补全部位、器械和一句话动作说明（不超过40字）。
动作名：${name}
已知部位：${part || '未知'}；已知器械：${equipment || '未知'}；已知说明：${description || '无'}
示意图类型：
${list}
只输出 JSON：{"fig":"类型或none","part":"${PARTS.join('/')}之一","equipment":"${EQUIPS.join('/')}之一","description":"..."}`;
  try {
    const { message } = await shared.llm([{ role: 'user', content: prompt }], { json: true, maxTokens: 300, temperature: 0.1, timeout: 20000 });
    const o = JSON.parse(String(message.content || '{}').replace(/^```json|```$/g, ''));
    return {
      fig: AF.keys.includes(o.fig) ? o.fig : '',
      part: PARTS.includes(o.part) ? o.part : '',
      equipment: EQUIPS.includes(o.equipment) ? o.equipment : '',
      description: String(o.description || '').slice(0, 120),
    };
  } catch (e) {
    console.error('[action-fig] ai classify failed:', e.message);
    return null;
  }
}

// 给一个动作配示意图(并补全空字段); force=true 时即使已识别过也重新识别(改了名字)
async function assignFig(actionId, { force = false } = {}) {
  await ensureCols();
  const a = await db.queryOne('SELECT * FROM biz_training_action WHERE id=?', [actionId]);
  if (!a || a.fig_manual) return a ? a.fig_key : null;
  if (a.fig_key != null && !force) return a.fig_key;
  let fig = AF.ruleKey(a.name) || '';
  let ai = null;
  if (!fig || !a.part || !a.equipment) ai = a.merchant_id > 0 ? await aiClassify(a) : null;
  if (!fig && ai) fig = ai.fig;
  await db.exec(
    `UPDATE biz_training_action SET fig_key=?, part=IF(part='' OR part IS NULL, ?, part), equipment=IF(equipment='' OR equipment IS NULL, ?, equipment),
            description=IF(description='' OR description IS NULL, ?, description) WHERE id=?`,
    [fig, (ai && ai.part) || a.part || '', (ai && ai.equipment) || a.equipment || '', (ai && ai.description) || a.description || '', a.id]);
  return fig;
}

// 训练计划存为模板时: 计划里动作库还没有的动作, 自动补进本店动作库并配图
async function addPlanActions(mid, items) {
  await ensureCols();
  const names = [...new Set((items || []).map(it => String((it && it.action_name) || '').trim()).filter(n => n && n.length <= 30))];
  const added = [];
  for (const name of names) {
    const exist = await db.queryOne('SELECT id FROM biz_training_action WHERE merchant_id IN (0,?) AND name=? AND status=1', [mid, name]);
    if (exist) continue;
    const it = items.find(x => String(x.action_name || '').trim() === name) || {};
    const id = await db.insert('INSERT INTO biz_training_action (merchant_id,name,part,equipment,description,is_custom) VALUES (?,?,?,?,?,1)',
      [mid, name, PARTS.includes(it.part) ? it.part : '', '', '']);
    added.push(id);
  }
  for (const id of added) await assignFig(id).catch(e => console.error('[action-fig] assign:', e.message));
  return added.length;
}

// 历史数据: 还没识别过的动作补识别(每次少量, 后台进行)
let backfilling = false;
async function backfill(mid, limit = 10) {
  if (backfilling) return;
  backfilling = true;
  try {
    await ensureCols();
    const rows = await db.query('SELECT id FROM biz_training_action WHERE merchant_id IN (0,?) AND status=1 AND fig_key IS NULL ORDER BY merchant_id, id LIMIT ?', [mid, limit]);
    for (const r of rows) await assignFig(r.id).catch(() => {});
  } finally { backfilling = false; }
}

// 实际生效的示意图: 人工指定 > 内置名称规则(随代码更新, 能修正以前存下的旧结果) > 存下的 AI 识别结果
function effectiveFig(row) {
  if (row.fig_manual) return row.fig_key || '';
  const k = AF.ruleKey(row.name);
  return k || (row.fig_key == null ? null : row.fig_key);
}

// 前端用的「动作名 → 示意图」表: 只需要本店自定义动作(系统预置动作前端规则就能认)
async function figMap(mid) {
  await ensureCols();
  const rows = await db.query('SELECT name, fig_key, fig_manual FROM biz_training_action WHERE merchant_id=? AND status=1 AND fig_key IS NOT NULL', [mid]);
  const map = {};
  rows.forEach((r) => { map[r.name] = effectiveFig(r) || ''; });
  return map;
}

module.exports = { effectiveFig, ensureCols, assignFig, addPlanActions, backfill, figMap, aiClassify };
