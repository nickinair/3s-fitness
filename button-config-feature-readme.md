# 健身房管理系统 - 自定义按钮配置功能

## 功能概述

本功能允许管理员、教练和会员自定义其界面面板上的功能按钮，包括添加、排序、启用/禁用等功能。

## 技术架构

### 前端优化
1. **拖拽性能优化**：
   - 使用 `will-change: transform` 和 `transform: translateZ(0)` 启用硬件加速
   - 实现防抖机制减少不必要的计算
   - 优化的 FLIP 动画技术提供流畅的拖拽体验
   - 改进的事件处理机制避免页面滚动干扰

2. **按钮配置管理页面**：
   - 提供直观的界面让用户添加、删除和排序按钮
   - 按角色（管理员、教练、会员）和页面类型分类管理
   - 拖拽排序功能，实时反馈

### 后端实现
1. **数据库结构**：
   - `sys_user_button_configs` 表存储用户自定义按钮配置
   - 支持按角色（admin、coach、member）和页面类型进行配置
   - JSON 格式存储按钮配置，灵活扩展

2. **API 接口**：
   - `GET /api/userButtonConfig/:userId/:role/:pageType` - 获取用户按钮配置
   - `POST /api/userButtonConfig/save` - 保存用户按钮配置
   - `GET /api/userButtonConfig/available-buttons/:role/:pageType` - 获取可用按钮列表

## 文件结构

```
server/
├── scripts/
│   ├── schema.sql                 # 数据库结构（已更新）
│   ├── init-db-complete.js        # 数据库初始化脚本（已更新）
│   └── add_user_button_config.sql # 新增表结构
├── src/
│   ├── controllers/
│   │   └── userButtonConfigController.js # 控制器
│   ├── routes/
│   │   └── userButtonConfig.js    # 路由
│   └── app.js                     # 主应用（已更新路由）
└── web/
    ├── m/
    │   ├── css/
    │   │   └── app.css            # 样式优化（已更新）
    │   └── js/
    │       └── wb-edit.js         # 优化的拖拽功能（已更新）
    └── admin/
        └── button-config.html     # 按钮配置管理页面
```

## 安装和部署

### 1. 数据库更新
运行以下命令更新数据库结构：

```bash
# 使用数据库初始化脚本
node scripts/init-db-complete.js
```

### 2. 启动应用
```bash
./start.sh
```

### 3. 访问管理页面
访问 `http://localhost:8090/admin/button-config.html` 进行按钮配置管理

## API 使用示例

### 获取按钮配置
```javascript
fetch('/api/userButtonConfig/1/admin/admin-dashboard')
  .then(response => response.json())
  .then(data => console.log(data));
```

### 保存按钮配置
```javascript
fetch('/api/userButtonConfig/save', {
  method: 'POST',
  headers: {
    'Content-Type': 'application/json',
  },
  body: JSON.stringify({
    userId: 1,
    role: 'admin',
    pageType: 'admin-dashboard',
    buttonConfig: [
      { id: 'members', title: '会员管理', icon: 'user', url: '/admin/members', sortOrder: 1, enabled: true },
      { id: 'cards', title: '卡券管理', icon: 'credit-card', url: '/admin/cards', sortOrder: 2, enabled: true }
    ]
  })
})
.then(response => response.json())
.then(data => console.log(data));
```

## 性能优化说明

1. **拖拽性能提升**：
   - 添加了硬件加速属性（`will-change`, `transform: translateZ(0)`）
   - 防抖机制减少不必要的重新计算
   - 优化的事件监听和内存管理
   - 更高效的DOM操作

2. **渲染性能提升**：
   - 减少重排和重绘
   - 优化的FLIP动画技术
   - 缓存计算结果减少重复计算

## 注意事项

1. 拖拽功能现已大幅优化，应具有流畅的用户体验
2. 按钮配置按角色和页面类型分别存储，确保数据隔离
3. 所有按钮配置变更都会保存到数据库中，下次访问时自动加载
4. 支持多种图标和URL配置，适应不同业务需求

## 未来扩展

1. 可以进一步扩展按钮配置的元数据（如权限、条件显示等）
2. 可以添加按钮的快速模板功能
3. 可以集成更多的用户界面定制功能