const mongoose = require('mongoose');

const NotificationSchema = new mongoose.Schema({
  recipient: {
    type: mongoose.Schema.ObjectId,
    ref: 'User',
    default: null
  },
  guestEmail: String,
  guestPhone: String,
  type: {
    type: String,
    enum: [
      'queue_joined', 'position_update', 'called', 'serving_now',
      'appointment_confirmed', 'appointment_reminder',
      'appointment_cancelled', 'ticket_cancelled',
      'staff_invite', 'review_request', 'system_alert'
    ],
    required: true
  },
  channels: [{
    type: String,
    enum: ['email', 'inApp', 'sms']
  }],
  title: String,
  body: String,
  data: mongoose.Schema.Types.Mixed,
  deliveryStatus: {
    email: {
      type: String,
      enum: ['pending', 'sent', 'failed', 'skipped']
    },
    inApp: {
      type: String,
      enum: ['pending', 'delivered', 'read','skipped']
    },
    sms: {
      type: String,
      enum: ['pending', 'sent', 'failed', 'skipped']
    }
  },
  readAt: Date
}, {
  timestamps: true,
  toJSON: { virtuals: true },
  toObject: { virtuals: true }
});

// Indexes
NotificationSchema.index({ recipient: 1, readAt: 1 });
NotificationSchema.index({ type: 1 });
NotificationSchema.index({ createdAt: 1 });

module.exports = mongoose.model('Notification', NotificationSchema);
