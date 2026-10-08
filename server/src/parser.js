/* 训练计划智能解析: 把教练的一句话/语音转文字 解析为结构化动作列表
 * 示例: "今天练胸: 杠铃卧推4组12次60kg, 哑铃飞鸟3组15, 平板支撑3组60秒, 最后跑步机20分钟"
 * 规则引擎实现(离线可用); 后续可无缝替换为大模型 API */
const db = require('./db');

const CN_NUM = { 一: 1, 二: 2, 两: 2, 三: 3, 四: 4, 五: 5, 六: 6, 七: 7, 八: 8, 九: 9, 十: 10 };
function cnToNum(s) {
  if (/^\d+$/.test(s)) return parseInt(s);
  return CN_NUM[s] || null;
}

async function parsePlan(text, merchantId) {
  const actions = await db.query('SELECT id,name,part FROM biz_training_action WHERE merchant_id IN (0,?) AND status=1', [merchantId]);
  // 切分: 逗号/分号/顿号/换行/句号
  const segs = String(text || '')
    .replace(/[:：]/g, '，')
    .split(/[，,。；;、\n]+/)
    .map(s => s.trim())
    .filter(Boolean);

  const items = [];
  for (let seg of segs) {
    // 去掉引导词
    seg = seg.replace(/^(今天|本次|这节课|私教课|先|然后|接着|最后|再|做|练|安排)+/g, '').trim();
    if (!seg) continue;

    const item = { action_name: '', sets: null, reps: null, unit: '次', weight: '', rest: '', remark: '' };

    // 重量: 60kg / 60公斤 / 60磅
    const w = seg.match(/(\d+(?:\.\d+)?)\s*(kg|KG|公斤|磅|lb)/);
    if (w) { item.weight = w[1] + (/(磅|lb)/.test(w[2]) ? '磅' : 'kg'); seg = seg.replace(w[0], ''); }

    // 组间歇: 间歇60秒 / 休息1分钟
    const r = seg.match(/(?:间歇|休息)\s*([\d一二两三四五六七八九十]+)\s*(秒|分钟|分)/);
    if (r) { item.rest = cnToNum(r[1]) + (r[2] === '秒' ? '秒' : '分钟'); seg = seg.replace(r[0], ''); }

    // N组M次/个/秒  |  NxM / N×M / N*M
    let m = seg.match(/([\d一二两三四五六七八九十]+)\s*组\s*(?:[xX×*每]?\s*)?([\d一二两三四五六七八九十]+)?\s*(次|个|秒|下)?/);
    const mx = seg.match(/(\d+)\s*[xX×*]\s*(\d+)/);
    if (mx) { item.sets = parseInt(mx[1]); item.reps = parseInt(mx[2]); seg = seg.replace(mx[0], ''); }
    else if (m && m[1]) {
      item.sets = cnToNum(m[1]);
      if (m[2]) item.reps = cnToNum(m[2]);
      if (m[3] === '秒') item.unit = '秒';
      seg = seg.replace(m[0], '');
    }

    // 时长型: 20分钟 / 半小时 (有氧)
    const d = seg.match(/([\d一二两三四五六七八九十]+)\s*(分钟|分|小时)/);
    if (d && item.reps == null) {
      item.sets = item.sets || 1;
      item.reps = cnToNum(d[1]) * (d[2] === '小时' ? 60 : 1);
      item.unit = '分钟';
      seg = seg.replace(d[0], '');
    }
    // 单独 "M次"
    const onlyReps = seg.match(/([\d一二两三四五六七八九十]+)\s*(次|个)/);
    if (onlyReps && item.reps == null) { item.reps = cnToNum(onlyReps[1]); seg = seg.replace(onlyReps[0], ''); }

    // 剩余文本 = 动作名
    const name = seg.replace(/[\s\d]+$/g, '').replace(/^[\s]+/, '').trim();
    if (!name) continue;
    // 纯部位词(如"今天练胸"剥离后剩"胸")且无组次信息 → 是导语不是动作, 跳过
    const PART_WORDS = ['胸', '背', '肩', '腿', '臀', '核心', '手臂', '有氧', '腹', '腹肌', '上肢', '下肢', '全身'];
    if (PART_WORDS.includes(name) && item.sets == null && item.reps == null) continue;
    item.action_name = name;

    // 动作库模糊匹配 (纠正名称/带出部位)
    const hit = actions.find(a => a.name === name)
      || actions.find(a => a.name.includes(name) || name.includes(a.name))
      || actions.find(a => name.length >= 2 && (a.name.startsWith(name.slice(0, 2)) && a.name.length - name.length <= 3));
    if (hit) { item.action_name = hit.name; item.matched_action_id = hit.id; item.part = hit.part; }

    item.sets = item.sets || 3;
    if (item.reps == null) item.reps = item.unit === '分钟' ? 10 : 12;
    items.push(item);
  }
  return items;
}

// 将动作名与动作库匹配带出部位 — LLM 结果只做精确/包含匹配(名字已规范, 不猜), 匹配不上保留原名
async function matchActions(items, merchantId) {
  const actions = await db.query('SELECT id,name,part FROM biz_training_action WHERE merchant_id IN (0,?) AND status=1', [merchantId]);
  for (const item of items) {
    const name = item.action_name;
    const hit = actions.find(a => a.name === name)
      || actions.find(a => a.name.includes(name) || name.includes(a.name));
    if (hit) { item.action_name = hit.name; item.matched_action_id = hit.id; item.part = item.part || hit.part; }
  }
  return items;
}

/* 规则版标题生成: 未配置大模型 或 模型没给标题时兜底
 * 依据动作命中的部位 + 原文里的部位导语, 生成如"胸部训练日""胸+背训练日""有氧燃脂日" */
const PART_LABEL = { 胸: '胸部', 背: '背部', 肩: '肩部', 腿: '腿部', 臀: '臀部', 手臂: '手臂', 核心: '核心', 腹: '腹部', 有氧: '有氧', 拉伸: '拉伸放松', 全身: '全身' };
function buildTitle(items, text) {
  const order = [];
  const add = (p) => { if (p && PART_LABEL[p] && !order.includes(p)) order.push(p); };
  // 原文里的部位导语优先(如"今天练胸")
  const lead = String(text || '').match(/(?:练|训练|今天|本次)\s*(胸|背|肩|腿|臀|核心|腹肌|腹|手臂|有氧|全身)/g) || [];
  lead.forEach(x => add(x.replace(/[^胸背肩腿臀核心腹肌手臂有氧全身]/g, '').replace('腹肌', '腹')));
  (items || []).forEach(it => add(it.part));

  const main = order.filter(p => p !== '拉伸' && p !== '有氧');
  if (!main.length && order.includes('有氧')) return '有氧燃脂日';
  if (!main.length) return '综合训练日';
  if (main.length === 1) return PART_LABEL[main[0]] + '训练日';
  if (main.length === 2) return PART_LABEL[main[0]] + '+' + PART_LABEL[main[1]] + '训练日';
  return '全身综合训练日';
}

module.exports = { parsePlan, matchActions, buildTitle };
