const Notification = require('../models/Notification');
const asyncHandler = require('../utils/asyncHandler');
const ApiError = require('../utils/ApiError');
const ApiResponse = require('../utils/ApiResponse');

exports.getNotifications = asyncHandler(async (req, res, next) => {
  const notifications = await Notification.find({ recipient: req.user.id })
    .sort('-createdAt')
    .limit(50);
  
  res.status(200).json(new ApiResponse(200, notifications, 'Notifications fetched'));
});

exports.markAsRead = asyncHandler(async (req, res, next) => {
  const notification = await Notification.findOneAndUpdate(
    { _id: req.params.id, recipient: req.user.id },
    { readAt: new Date(), 'deliveryStatus.inApp': 'read' },
    { new: true }
  );

  if (!notification) {
    return next(new ApiError('Notification not found', 404));
  }

  res.status(200).json(new ApiResponse(200, notification, 'Marked as read'));
});

exports.markAllAsRead = asyncHandler(async (req, res, next) => {
  await Notification.updateMany(
    { recipient: req.user.id, readAt: null },
    { readAt: new Date(), 'deliveryStatus.inApp': 'read' }
  );

  res.status(200).json(new ApiResponse(200, {}, 'All marked as read'));
});

exports.getUnreadCount = asyncHandler(async (req, res, next) => {
  const count = await Notification.countDocuments({ recipient: req.user.id, readAt: null });
  res.status(200).json(new ApiResponse(200, { unreadCount: count }, 'Unread count fetched'));
});
