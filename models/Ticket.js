const mongoose = require('mongoose');

const TicketSchema = new mongoose.Schema({
  ticketNumber: {
    type: String,
    required: true,
    trim: true
  },
  business: {
    type: mongoose.Schema.ObjectId,
    ref: 'Business',
    required: true
  },
  branch: {
    type: mongoose.Schema.ObjectId,
    ref: 'Branch',
    required: true
  },
  service: {
    type: mongoose.Schema.ObjectId,
    ref: 'Service',
    required: true
  },
  type: {
    type: String,
    enum: ['walk_in', 'appointment'],
    default: 'walk_in'
  },
  appointmentRef: {
    type: mongoose.Schema.ObjectId,
    ref: 'Appointment'
  },
  customer: {
    type: mongoose.Schema.ObjectId,
    ref: 'User',
    default: null
  },
  guestInfo: {
    name: String,
    phone: String,
    email: String
  },
  status: {
    type: String,
    enum: ['waiting', 'called', 'serving', 'served', 'skipped', 'cancelled', 'no_show'],
    default: 'waiting'
  },
  position: {
    type: Number,
    required: true
  },
  predictedWaitTime: {
    type: Number
  },
  actualWaitTime: {
    type: Number
  },
  actualServeTime: {
    type: Number
  },
  joinedAt: {
    type: Date,
    default: Date.now
  },
  calledAt: Date,
  servingStartAt: Date,
  completedAt: Date,
  // Abuse prevention
  ipAddress: String,
  deviceFingerprint: String,
  isAbuseFlagged: {
    type: Boolean,
    default: false
  },
  abuseReason: String,
  qrCodeUrl: String,
  shareableLink: String,
  staffNotes: String,
  servedBy: {
    type: mongoose.Schema.ObjectId,
    ref: 'User'
  },
  notificationsSent: [{
    channel: {
      type: String,
      enum: ['email', 'sms', 'inApp']
    },
    type: String,
    sentAt: {
      type: Date,
      default: Date.now
    }
  }]
}, {
  timestamps: true,
  toJSON: { virtuals: true },
  toObject: { virtuals: true }
});

// Indexes
TicketSchema.index({ business: 1, branch: 1, service: 1, status: 1 });
TicketSchema.index({ customer: 1 });
TicketSchema.index({ ticketNumber: 1 });
TicketSchema.index({ ipAddress: 1 });
TicketSchema.index({ deviceFingerprint: 1 });

module.exports = mongoose.model('Ticket', TicketSchema);
