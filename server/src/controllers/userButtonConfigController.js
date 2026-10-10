// src/controllers/userButtonConfigController.js
const db = require('../db');

class UserButtonConfigController {
  // 获取用户的按钮配置
  static async getUserButtonConfig(req, res) {
    try {
      const { userId, role, pageType } = req.params;

      const sql = `
        SELECT button_config
        FROM sys_user_button_configs
        WHERE user_id = ? AND role = ? AND page_type = ?
      `;

      const rows = await db.query(sql, [userId, role, pageType]);

      if (rows.length > 0) {
        res.json({
          code: 0,
          success: true,
          data: rows[0].button_config
        });
      } else {
        // 返回默认配置
        res.json({
          code: 0,
          success: true,
          data: this.getDefaultButtonConfig(role, pageType)
        });
      }
      console.error('[ERROR] 获取按钮配置错误:', error);
      res.status(500).json({
        code: 500,
        success: false,
        msg: '服务器内部错误: ' + error.message
      });
    }
  }

  // 保存用户的按钮配置
  static async saveUserButtonConfig(req, res) {
    try {
      const { userId, role, pageType, buttonConfig } = req.body;

      // 验证必要参数
      if (!userId || !role || !pageType || !buttonConfig) {
        return res.status(400).json({
          success: false,
          message: '缺少必要参数'
        });
      }

      // 验证按钮配置格式
      if (!Array.isArray(buttonConfig)) {
        return res.status(400).json({
          success: false,
          message: '按钮配置必须是数组格式'
        });
      }

      // 验证每个按钮的格式
      for (let button of buttonConfig) {
        if (typeof button !== 'object' || !button.id || !button.title) {
          return res.status(400).json({
            success: false,
            message: '按钮配置格式错误'
          });
        }
      }

      const sql = `
        INSERT INTO sys_user_button_configs (user_id, role, page_type, button_config)
        VALUES (?, ?, ?, ?)
        ON DUPLICATE KEY UPDATE
        button_config = ?, updated_at = CURRENT_TIMESTAMP
      `;

      await db.query(sql, [userId, role, pageType, JSON.stringify(buttonConfig), JSON.stringify(buttonConfig)]);

      res.json({
        code: 0,
        success: true,
        message: '保存成功'
      });
    } catch (error) {
      console.error('[ERROR] 保存按钮配置错误:', error);
      res.status(500).json({
        code: 500,
        success: false,
        msg: '服务器内部错误: ' + error.message
      });
    }
  }

  // 获取可用的按钮列表
  static getAvailableButtons(req, res) {
    try {
      const { role, pageType } = req.params;

      const availableButtons = this.getAvailableButtonsConfig(role, pageType);

      res.json({
        code: 0,
        success: true,
        data: availableButtons
      });
    } catch (error) {
      console.error('[ERROR] 获取可用按钮错误:', error);
      res.status(500).json({
        code: 500,
        success: false,
        msg: '服务器内部错误: ' + error.message
      });
    }
  }

  // 获取默认按钮配置
  static getDefaultButtonConfig(role, pageType) {
    const defaults = {
      admin: {
        'admin-dashboard': [
          { id: 'members', title: '会员管理', icon: 'user', url: '/admin/members', sortOrder: 1, enabled: true },
          { id: 'cards', title: '卡券管理', icon: 'credit-card', url: '/admin/cards', sortOrder: 2, enabled: true },
          { id: 'coaches', title: '教练管理', icon: 'users', url: '/admin/coaches', sortOrder: 3, enabled: true },
          { id: 'courses', title: '课程管理', icon: 'calendar', url: '/admin/courses', sortOrder: 4, enabled: true },
          { id: 'finance', title: '财务管理', icon: 'dollar-sign', url: '/admin/finance', sortOrder: 5, enabled: true },
          { id: 'reports', title: '数据报表', icon: 'bar-chart-2', url: '/admin/reports', sortOrder: 6, enabled: true }
        ]
      },
      coach: {
        'coach-dashboard': [
          { id: 'my-students', title: '我的学员', icon: 'users', url: '/coach/students', sortOrder: 1, enabled: true },
          { id: 'my-schedule', title: '我的课表', icon: 'calendar', url: '/coach/schedule', sortOrder: 2, enabled: true },
          { id: 'course-checkin', title: '课程签到', icon: 'check-circle', url: '/coach/checkin', sortOrder: 3, enabled: true },
          { id: 'performance', title: '业绩统计', icon: 'trending-up', url: '/coach/performance', sortOrder: 4, enabled: true }
        ]
      },
      member: {
        'member-home': [
          { id: 'my-cards', title: '我的卡券', icon: 'credit-card', url: '/member/cards', sortOrder: 1, enabled: true },
          { id: 'my-schedule', title: '我的预约', icon: 'calendar', url: '/member/schedule', sortOrder: 2, enabled: true },
          { id: 'course-list', title: '课程列表', icon: 'list', url: '/member/courses', sortOrder: 3, enabled: true },
          { id: 'sign-in', title: '签到打卡', icon: 'map-pin', url: '/member/checkin', sortOrder: 4, enabled: true },
          { id: 'my-profile', title: '个人资料', icon: 'user', url: '/member/profile', sortOrder: 5, enabled: true }
        ]
      }
    };

    return defaults[role] && defaults[role][pageType] ? defaults[role][pageType] : [];
  }

  // 获取可用的按钮列表
  static getAvailableButtonsConfig(role, pageType) {
    const allButtons = {
      admin: {
        'admin-dashboard': [
          { id: 'members', title: '会员管理', icon: 'user', url: '/admin/members' },
          { id: 'cards', title: '卡券管理', icon: 'credit-card', url: '/admin/cards' },
          { id: 'coaches', title: '教练管理', icon: 'users', url: '/admin/coaches' },
          { id: 'courses', title: '课程管理', icon: 'calendar', url: '/admin/courses' },
          { id: 'finance', title: '财务管理', icon: 'dollar-sign', url: '/admin/finance' },
          { id: 'reports', title: '数据报表', icon: 'bar-chart-2', url: '/admin/reports' },
          { id: 'settings', title: '系统设置', icon: 'settings', url: '/admin/settings' },
          { id: 'employees', title: '员工管理', icon: 'users', url: '/admin/employees' },
          { id: 'clubs', title: '场馆管理', icon: 'home', url: '/admin/clubs' },
          { id: 'contracts', title: '合同管理', icon: 'file-text', url: '/admin/contracts' }
        ]
      },
      coach: {
        'coach-dashboard': [
          { id: 'my-students', title: '我的学员', icon: 'users', url: '/coach/students' },
          { id: 'my-schedule', title: '我的课表', icon: 'calendar', url: '/coach/schedule' },
          { id: 'course-checkin', title: '课程签到', icon: 'check-circle', url: '/coach/checkin' },
          { id: 'performance', title: '业绩统计', icon: 'trending-up', url: '/coach/performance' },
          { id: 'messages', title: '消息通知', icon: 'message-square', url: '/coach/messages' },
          { id: 'attendance', title: '考勤管理', icon: 'clock', url: '/coach/attendance' }
        ]
      },
      member: {
        'member-home': [
          { id: 'my-cards', title: '我的卡券', icon: 'credit-card', url: '/member/cards' },
          { id: 'my-schedule', title: '我的预约', icon: 'calendar', url: '/member/schedule' },
          { id: 'course-list', title: '课程列表', icon: 'list', url: '/member/courses' },
          { id: 'sign-in', title: '签到打卡', icon: 'map-pin', url: '/member/checkin' },
          { id: 'my-profile', title: '个人资料', icon: 'user', url: '/member/profile' },
          { id: 'contracts', title: '我的合同', icon: 'file-text', url: '/member/contracts' },
          { id: 'messages', title: '消息通知', icon: 'message-square', url: '/member/messages' },
          { id: 'achievements', title: '运动成就', icon: 'trophy', url: '/member/achievements' }
        ]
      }
    };

    return allButtons[role] && allButtons[role][pageType] ? allButtons[role][pageType] : [];
  }
}

module.exports = UserButtonConfigController;