const mongoose = require('mongoose');

const AuditLogSchema = new mongoose.Schema({
  actor: {
    type: mongoose.Schema.ObjectId,
    ref: 'User'
  },
  actorSnapshot: {
    name: String,
    email: String,
    role: String
  },
  action: {
    type: String,
    required: true
  },
  resource: {
    type: String,
    required: true
  },
  resourceId: mongoose.Schema.ObjectId,
  changes: {
    before: mongoose.Schema.Types.Mixed,
    after: mongoose.Schema.Types.Mixed
  },
  meta: {
    ip: String,
    userAgent: String,
    requestId: String
  },
  severity: {
    type: String,
    enum: ['info', 'warning', 'critical'],
    default: 'info'
  }
}, {
  timestamps: true,
  toJSON: { virtuals: true },
  toObject: { virtuals: true }
});

// Indexes
AuditLogSchema.index({ actor: 1 });
AuditLogSchema.index({ action: 1 });
AuditLogSchema.index({ resource: 1, resourceId: 1 });
AuditLogSchema.index({ severity: 1 });
AuditLogSchema.index({ createdAt: 1 }, { expireAfterSeconds: 7776000 }); // 90 days TTL (can be disabled for critical)

module.exports = mongoose.model('AuditLog', AuditLogSchema);
