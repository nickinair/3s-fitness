-- 添加用户自定义按钮配置表
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
) COMMENT='用户自定义按钮配置表';