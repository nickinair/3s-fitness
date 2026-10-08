/* AI 能力接入: 豆包(火山方舟)大模型解析 + 火山引擎语音识别
 * 密钥配置(二选一, env 优先):
 *   1) 环境变量: ARK_API_KEY / ARK_MODEL, VOLC_ASR_APP_ID / VOLC_ASR_ACCESS_TOKEN
 *   2) server/secrets.json: { "ark_api_key":"", "ark_model":"", "volc_asr_app_id":"", "volc_asr_access_token":"" }
 * 未配置时: 解析回落到本地规则引擎, 语音回落到浏览器识别 */
const fs = require('fs');
const path = require('path');
const crypto = require('crypto');

function loadSecrets() {
  try { return JSON.parse(fs.readFileSync(path.join(__dirname, '..', 'secrets.json'), 'utf8')); } catch { return {}; }
}
const S = loadSecrets();
const CFG = {
  arkApiKey: process.env.ARK_API_KEY || S.ark_api_key || '',
  arkModel: process.env.ARK_MODEL || S.ark_model || '',
  arkBaseUrl: process.env.ARK_BASE_URL || S.ark_base_url || 'https://ark.cn-beijing.volces.com/api/v3',
  asrAppId: process.env.VOLC_ASR_APP_ID || S.volc_asr_app_id || '',
  asrToken: process.env.VOLC_ASR_ACCESS_TOKEN || S.volc_asr_access_token || '',
  asrResourceId: process.env.VOLC_ASR_RESOURCE_ID || S.volc_asr_resource_id || 'volc.bigasr.auc_turbo',
};

const llmEnabled = () => !!(CFG.arkApiKey && CFG.arkModel);
const asrEnabled = () => !!(CFG.asrAppId && CFG.asrToken);

/* ============ 豆包: 训练计划解析 ============ */
const PARSE_SYSTEM = `你是健身教练助手。把教练口述/输入的训练安排解析为JSON对象，不输出任何其他文字。
返回格式: {"title":"训练计划标题","actions":[动作对象...]}
每个动作对象: {"action_name":"动作规范名(简洁中文)","sets":组数整数,"reps":次数整数,"unit":"次"或"秒"或"分钟","weight":"重量如60kg,没有则空串","rest":"组间歇如90秒,没有则空串","remark":"补充说明,没有则空串"}
规则: 未说明组数默认3; 未说明次数默认12; 平板支撑等计时动作unit用"秒"; 跑步/单车等有氧时长unit用"分钟"且sets为1、reps为分钟数; 忽略"今天练胸"这类部位导语; 动作名口语化的要规范化(如"卧推"→"杠铃卧推")。
title 规则: 4-12个汉字, 概括本次训练的主要部位或目标, 不要带日期和人名, 例如"胸部训练日""背部+二头强化""下肢力量训练""有氧燃脂日"。`;

async function llmParse(text) {
  const resp = await fetch(`${CFG.arkBaseUrl}/chat/completions`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${CFG.arkApiKey}` },
    body: JSON.stringify({
      model: CFG.arkModel,
      messages: [
        { role: 'system', content: PARSE_SYSTEM },
        { role: 'user', content: String(text).slice(0, 2000) },
      ],
      temperature: 0.1,
      max_tokens: 2000,
    }),
    signal: AbortSignal.timeout(20000),
  });
  if (!resp.ok) throw new Error(`ARK HTTP ${resp.status}: ${(await resp.text()).slice(0, 200)}`);
  const data = await resp.json();
  const content = data.choices && data.choices[0] && data.choices[0].message && data.choices[0].message.content || '';
  const { arr, title } = extractJson(content);
  if (!Array.isArray(arr) || !arr.length) throw new Error('LLM 解析结果为空');
  const items = arr.map(x => ({
    action_name: String(x.action_name || '').slice(0, 40),
    sets: Math.max(1, parseInt(x.sets) || 3),
    reps: Math.max(1, parseInt(x.reps) || 12),
    unit: ['次', '秒', '分钟'].includes(x.unit) ? x.unit : '次',
    weight: String(x.weight || '').slice(0, 20),
    rest: String(x.rest || '').slice(0, 20),
    remark: String(x.remark || '').slice(0, 100),
  })).filter(x => x.action_name);
  return { items, title };
}

// 从模型输出里取出动作数组与标题: 兼容 {title,actions} 对象与纯数组两种返回
function extractJson(content) {
  const os = content.indexOf('{'); const oe = content.lastIndexOf('}');
  if (os >= 0 && oe > os) {
    try {
      const obj = JSON.parse(content.slice(os, oe + 1));
      if (obj && Array.isArray(obj.actions)) {
        return { arr: obj.actions, title: String(obj.title || '').replace(/[\r\n"']/g, '').trim().slice(0, 30) };
      }
    } catch { /* 继续按数组解析 */ }
  }
  const as = content.indexOf('['); const ae = content.lastIndexOf(']');
  if (as < 0 || ae <= as) throw new Error('LLM 未返回 JSON');
  return { arr: JSON.parse(content.slice(as, ae + 1)), title: '' };
}

/* ============ 火山引擎: 豆包录音文件识别 2.0 (标准版: 提交+轮询) ============ */
function asrHeaders(reqId) {
  return {
    'Content-Type': 'application/json',
    'X-Api-App-Key': CFG.asrAppId,
    'X-Api-Access-Key': CFG.asrToken,
    'X-Api-Resource-Id': CFG.asrResourceId,
    'X-Api-Request-Id': reqId,
    'X-Api-Sequence': '-1',
  };
}

async function asrRecognize(audioBase64, format = 'wav') {
  if (!asrEnabled()) throw new Error('未配置语音识别服务');
  const reqId = crypto.randomUUID();
  const submit = await fetch('https://openspeech.bytedance.com/api/v3/auc/bigmodel/submit', {
    method: 'POST',
    headers: asrHeaders(reqId),
    body: JSON.stringify({
      user: { uid: 'fitness-app' },
      audio: { format, data: audioBase64 },
      request: { model_name: 'bigmodel', enable_punc: true },
    }),
    signal: AbortSignal.timeout(20000),
  });
  const sCode = submit.headers.get('x-api-status-code');
  if (sCode !== '20000000') {
    const msg = submit.headers.get('x-api-message') || `HTTP ${submit.status}`;
    throw new Error(`语音识别失败: ${msg} (code ${sCode || submit.status})`);
  }
  // 轮询查询结果 (短录音通常 1-3 秒出)
  for (let i = 0; i < 25; i++) {
    await new Promise(r => setTimeout(r, i < 5 ? 600 : 1200));
    const q = await fetch('https://openspeech.bytedance.com/api/v3/auc/bigmodel/query', {
      method: 'POST', headers: asrHeaders(reqId), body: '{}', signal: AbortSignal.timeout(15000),
    });
    const code = q.headers.get('x-api-status-code');
    if (code === '20000000') {
      const body = await q.json().catch(() => ({}));
      const text = (body.result && (body.result.text || (body.result.utterances || []).map(u => u.text).join(''))) || '';
      if (!text) throw new Error('未识别到语音内容，请靠近麦克风重试');
      return text;
    }
    if (code !== '20000001' && code !== '20000002') {
      throw new Error(`语音识别失败: ${q.headers.get('x-api-message') || code}`);
    }
  }
  throw new Error('语音识别超时，请重试');
}

module.exports = { llmEnabled, asrEnabled, llmParse, asrRecognize, CFG };
