// routes/userButtonConfig.js
const express = require('express');
const router = express.Router();
const UserButtonConfigController = require('../controllers/userButtonConfigController');

// 获取可用的按钮列表(必须写在 /:userId/:role/:pageType 之前, 否则会被它匹配走)
router.get('/available-buttons/:role/:pageType', UserButtonConfigController.getAvailableButtons);

// 获取用户的按钮配置
router.get('/:userId/:role/:pageType', UserButtonConfigController.getUserButtonConfig);

// 保存用户的按钮配置
router.post('/save', UserButtonConfigController.saveUserButtonConfig);

module.exports = router;