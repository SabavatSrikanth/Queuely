const express = require('express');
const { getNotifications, markAsRead, markAllAsRead, getUnreadCount } = require('../controllers/notification.controller');
const { protect } = require('../middleware/auth.middleware');

const router = express.Router();

router.use(protect);

router.get('/', getNotifications);
router.put('/read-all', markAllAsRead);
router.get('/unread-count', getUnreadCount);
router.put('/:id/read', markAsRead);

module.exports = router;
