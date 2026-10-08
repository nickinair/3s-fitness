/* 用户自定义面板布局: 按用户 + 场景(scope) 持久化入口 key 顺序。
   员工工作台(staff_workbench) / 会员首页常用功能(member_home) 共用。
   items 为入口 key 字符串数组(顺序即展示顺序); 保存空数组 = 清除记录、恢复默认。 */
const db = require('./db');
const { BizError } = require('./util');

const MAX_ITEMS = 40;

async function saveWidget(userId, scope, raw) {
  if (!Array.isArray(raw)) throw new BizError('布局数据格式错误');
  const items = [...new Set(raw.map((k) => String(k || '').trim()).filter(Boolean))];
  if (items.length > MAX_ITEMS) throw new BizError(`功能数量超出上限(${MAX_ITEMS})`);
  if (items.some((k) => k.length > 32)) throw new BizError('存在非法功能标识');
  const exists = await db.queryOne('SELECT id FROM sys_user_widget WHERE user_id=? AND scope=?', [userId, scope]);
  if (!items.length) {
    if (exists) await db.exec('DELETE FROM sys_user_widget WHERE user_id=? AND scope=?', [userId, scope]);
    return [];
  }
  const json = JSON.stringify(items);
  if (exists) await db.exec('UPDATE sys_user_widget SET items=? WHERE id=?', [json, exists.id]);
  else await db.insert('INSERT INTO sys_user_widget (user_id, scope, items) VALUES (?,?,?)', [userId, scope, json]);
  return items;
}

// 返回 null 表示该用户没有自定义布局(前端回退到角色默认)
async function loadWidget(userId, scope) {
  const row = await db.queryOne('SELECT items FROM sys_user_widget WHERE user_id=? AND scope=?', [userId, scope]);
  if (!row) return null;
  try {
    // mysql2 会自动把 JSON 列解析为 JS 值, 兼容字符串/数组两种返回形态
    const items = typeof row.items === 'string' ? JSON.parse(row.items) : row.items;
    return Array.isArray(items) ? items : null;
  } catch (e) { return null; }
}

module.exports = { saveWidget, loadWidget, MAX_ITEMS };
