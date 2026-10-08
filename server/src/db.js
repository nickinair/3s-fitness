const mysql = require('mysql2/promise');
const config = require('./config');

const pool = mysql.createPool(config.db);

// 云数据库/代理层会掐断空闲连接; 拿到失效连接时的查询错误做一次自动重试
const RETRYABLE = new Set(['PROTOCOL_CONNECTION_LOST', 'ECONNRESET', 'EPIPE', 'ETIMEDOUT', 'PROTOCOL_ENQUEUE_AFTER_FATAL_ERROR']);
const isStale = (e) => e && (RETRYABLE.has(e.code) || /Connection lost|closed state/i.test(e.message || ''));

async function run(sql, params) {
  try {
    return await pool.query(sql, params);
  } catch (e) {
    if (!isStale(e)) throw e;
    return pool.query(sql, params); // 池会丢弃死连接并新建
  }
}

async function query(sql, params = []) {
  const [rows] = await run(sql, params);
  return rows;
}

async function queryOne(sql, params = []) {
  const rows = await query(sql, params);
  return rows[0] || null;
}

async function insert(sql, params = []) {
  const [r] = await run(sql, params);
  return r.insertId;
}

async function exec(sql, params = []) {
  const [r] = await run(sql, params);
  return r;
}

// 取一个确认存活的连接（ping 失败则丢弃重取）
async function getLiveConnection() {
  for (let i = 0; i < 3; i++) {
    const conn = await pool.getConnection();
    try { await conn.ping(); return conn; } catch (e) { conn.destroy(); }
  }
  return pool.getConnection();
}

// 事务
async function tx(fn) {
  const conn = await getLiveConnection();
  try {
    await conn.beginTransaction();
    const helpers = {
      query: async (sql, params) => (await conn.query(sql, params))[0],
      queryOne: async (sql, params) => ((await conn.query(sql, params))[0][0] || null),
      insert: async (sql, params) => (await conn.query(sql, params))[0].insertId,
      exec: async (sql, params) => (await conn.query(sql, params))[0],
    };
    const result = await fn(helpers);
    await conn.commit();
    return result;
  } catch (e) {
    try { await conn.rollback(); } catch (_) {}
    throw e;
  } finally {
    conn.release();
  }
}

// 保活心跳: 让池里的空闲连接周期性走一次真实查询
setInterval(() => { pool.query('SELECT 1').catch(() => {}); }, 45 * 1000);

module.exports = { pool, query, queryOne, insert, exec, tx };
