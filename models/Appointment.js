const mongoose = require('mongoose');

const AppointmentSchema = new mongoose.Schema({
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
  appointmentDate: {
    type: Date,
    required: true
  },
  startTime: {
    type: String,
    required: true
  },
  endTime: {
    type: String,
    required: true
  },
  slotIndex: {
    type: Number
  },
  status: {
    type: String,
    enum: ['scheduled', 'confirmed', 'checked_in', 'serving', 'completed', 'cancelled', 'no_show'],
    default: 'scheduled'
  },
  ticketRef: {
    type: mongoose.Schema.ObjectId,
    ref: 'Ticket'
  },
  reminderSent: {
    type: Boolean,
    default: false
  },
  confirmationSent: {
    type: Boolean,
    default: false
  },
  cancellationReason: String,
  notes: String,
  qrCodeUrl: String,
  bookedAt: {
    type: Date,
    default: Date.now
  },
  confirmedAt: Date,
  checkedInAt: Date,
  completedAt: Date
}, {
  timestamps: true,
  toJSON: { virtuals: true },
  toObject: { virtuals: true }
});

// Indexes
AppointmentSchema.index({ business: 1, branch: 1, service: 1, appointmentDate: 1 });
AppointmentSchema.index({ customer: 1 });
AppointmentSchema.index({ status: 1 });
AppointmentSchema.index({ appointmentDate: 1 });

module.exports = mongoose.model('Appointment', AppointmentSchema);
