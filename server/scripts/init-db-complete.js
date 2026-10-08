const mysql = require('mysql2/promise');
require('dotenv').config();
const bcrypt = require('bcryptjs');

async function initDatabase() {
  console.log('开始初始化数据库...');

  const connection = await mysql.createConnection({
    host: process.env.DB_HOST || 'localhost',
    port: process.env.DB_PORT || 3306,
    user: process.env.DB_USER || 'root',
    password: process.env.DB_PASSWORD || 'root',
    multipleStatements: true
  });

  try {
    // 创建数据库
    await connection.query(`
      CREATE DATABASE IF NOT EXISTS fitness_app DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;
      USE fitness_app;
    `);

    console.log('数据库创建成功或已存在');

    // 读取并执行 SQL 文件
    const fs = require('fs');
    let schemaSql = fs.readFileSync('./scripts/schema.sql', 'utf8');

    // 检查是否存在sys_user_button_configs表
    if (!schemaSql.includes('sys_user_button_configs')) {
      // 添加到文件末尾
      const additionalSchema = `

-- ============ 用户自定义按钮配置 ============

CREATE TABLE IF NOT EXISTS sys_user_button_configs (
  id INT AUTO_INCREMENT PRIMARY KEY,
  user_id INT NOT NULL COMMENT '用户ID',
  role VARCHAR(50) NOT NULL COMMENT '角色：admin, coach, member',
  page_type VARCHAR(100) NOT NULL COMMENT '页面类型：admin-dashboard, coach-dashboard, member-home等',
  button_config JSON NOT NULL COMMENT '按钮配置JSON：[{id, title, icon, url, sort_order, enabled}]',
  created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
  updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
  UNIQUE KEY uk_user_role_page (user_id, role, page_type),
  INDEX idx_user_id (user_id),
  INDEX idx_role (role)
) ENGINE=InnoDB COMMENT='用户自定义按钮配置表';
      `;
      schemaSql += additionalSchema;
    }

    await connection.query(schemaSql);
    console.log('数据表创建成功');

    // 检查是否存在初始数据
    const [existingUsers] = await connection.query('SELECT COUNT(*) as count FROM sys_user LIMIT 1');

    if (existingUsers[0].count === 0) {
      console.log('正在插入初始数据...');

      // 插入默认商户
      await connection.query(`
        INSERT INTO sys_merchant (name, contact, phone, status, expire_time, remark)
        VALUES ('测试商户', '管理员', '13800138000', 1, '2025-12-31', '测试商户');
      `);

      // 获取商户ID
      const [merchant] = await connection.query('SELECT id FROM sys_merchant LIMIT 1');
      const merchantId = merchant[0].id;

      // 插入门店
      await connection.query(`
        INSERT INTO biz_club (merchant_id, name, address, phone, status)
        VALUES (${merchantId}, '测试门店', '测试地址', '023-12345678', 1);
      `);

      // 获取门店ID
      const [club] = await connection.query('SELECT id FROM biz_club LIMIT 1');
      const clubId = club[0].id;

      // 插入默认管理员账户
      const hashedPassword = await bcrypt.hash('admin123', 10);

      await connection.query(`
        INSERT INTO sys_user (merchant_id, club_id, username, password, realname, role, status)
        VALUES (${merchantId}, ${clubId}, 'admin', '${hashedPassword}', '系统管理员', 'admin', 1);
      `);

      console.log('初始数据插入成功');
    } else {
      console.log('检测到已有数据，跳过初始数据插入');
    }

    console.log('数据库初始化完成！');
  } catch (error) {
    console.error('数据库初始化失败:', error);
    throw error;
  } finally {
    await connection.end();
  }
}

if (require.main === module) {
  initDatabase().catch(console.error);
}

module.exports = initDatabase;