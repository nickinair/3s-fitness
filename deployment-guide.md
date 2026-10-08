# 健身房管理系统 - 自定义按钮配置功能部署说明

## 更新内容

本次更新包括：
1. 优化拖拽性能，解决卡顿问题
2. 添加用户自定义按钮配置功能
3. 新增数据库表结构支持

## 文件变更

### 前端文件
- `server/web/m/js/wb-edit.js` - 优化拖拽性能
- `server/web/m/css/app.css` - 添加硬件加速样式
- `server/web/admin/button-config.html` - 按钮配置管理页面

### 后端文件
- `server/src/controllers/userButtonConfigController.js` - 按钮配置控制器
- `server/src/routes/userButtonConfig.js` - 按钮配置路由
- `server/src/app.js` - 注册新路由
- `server/scripts/schema.sql` - 更新数据库结构

### 工具脚本
- `server/scripts/init-db-complete.js` - 更新的数据库初始化脚本
- `button-config-feature-readme.md` - 功能说明文档

## 部署步骤

### 1. 数据库更新
由于系统连接到远程腾讯云数据库，请联系系统管理员执行以下SQL语句：

```sql
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
) ENGINE=InnoDB COMMENT='用户自定义按钮配置表';
```

### 2. 服务器部署
将以下文件部署到服务器：

```
server/web/m/js/wb-edit.js
server/web/m/css/app.css
server/web/admin/button-config.html
server/src/controllers/userButtonConfigController.js
server/src/routes/userButtonConfig.js
server/src/app.js
```

### 3. 重启服务
重启服务器使更改生效：
```bash
./stop.sh
./start.sh
```

## 功能验证

### 拖拽性能优化验证
1. 进入员工工作台或会员首页
2. 进入编辑模式
3. 尝试拖拽按钮，应感觉流畅无卡顿

### 按钮配置功能验证
1. 访问 `http://your-server:8090/admin/button-config.html`
2. 选择角色（管理员/教练/会员）
3. 选择页面类型
4. 尝试添加、删除和排序按钮
5. 点击保存配置

## API 接口

### 获取按钮配置
```
GET /api/userButtonConfig/:userId/:role/:pageType
```

### 保存按钮配置
```
POST /api/userButtonConfig/save
Content-Type: application/json
{
  "userId": 1,
  "role": "admin",
  "pageType": "admin-dashboard",
  "buttonConfig": [...]
}
```

### 获取可用按钮
```
GET /api/userButtonConfig/available-buttons/:role/:pageType
```

## 注意事项

1. 数据库更新必须在远程服务器上执行，不能在本地执行
2. 确保服务器已安装必要的依赖包（dotenv, bcryptjs）
3. 重启服务前确认所有文件已正确部署
4. 如果遇到问题，请检查服务器日志

## 回滚计划

如果出现问题，可以：
1. 恢复旧版的 `wb-edit.js` 和 `app.css` 文件
2. 从 `app.js` 中移除按钮配置路由
3. 删除数据库中的 `sys_user_button_configs` 表
4. 重启服务