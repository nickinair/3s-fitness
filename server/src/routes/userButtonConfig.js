// routes/userButtonConfig.js
const express = require('express');
const router = express.Router();
const UserButtonConfigController = require('../controllers/userButtonConfigController');

// 获取用户的按钮配置
router.get('/:userId/:role/:pageType', UserButtonConfigController.getUserButtonConfig);

// 保存用户的按钮配置
router.post('/save', UserButtonConfigController.saveUserButtonConfig);

// 获取可用的按钮列表
router.get('/available-buttons/:role/:pageType', UserButtonConfigController.getAvailableButtons);

module.exports = router;