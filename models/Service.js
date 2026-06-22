const mongoose = require('mongoose');

const ServiceSchema = new mongoose.Schema({
  business: {
    type: mongoose.Schema.ObjectId,
    ref: 'Business',
    required: true
  },
  branch: {
    type: mongoose.Schema.ObjectId,
    ref: 'Branch',
    default: null // null means available at all branches
  },
  name: {
    type: String,
    required: [true, 'Please add a service name'],
    trim: true,
    maxlength: [100, 'Name cannot be more than 100 characters']
  },
  description: {
    type: String,
    maxlength: [500, 'Description cannot be more than 500 characters']
  },
  code: {
    type: String,
    required: [true, 'Please add a service short code (e.g., CON)'],
    trim: true,
    maxlength: 10,
    uppercase: true
  },
  // Walk-in queue config
  walkinEnabled: {
    type: Boolean,
    default: true
  },
  estimatedServiceTime: {
    type: Number, // in minutes
    required: true,
    default: 15
  },
  maxQueueCapacity: {
    type: Number,
    default: 50
  },
  currentQueueCount: {
    type: Number,
    default: 0
  },
  isAcceptingQueue: {
    type: Boolean,
    default: true
  },
  // Appointment config
  appointmentEnabled: {
    type: Boolean,
    default: false
  },
  slotDuration: {
    type: Number,
    default: 30
  },
  bufferTime: {
    type: Number,
    default: 5
  },
  advanceBookingDays: {
    type: Number,
    default: 30
  },
  maxAppointmentsPerSlot: {
    type: Number,
    default: 1
  },
  // Staff
  staffAssigned: [{
    type: mongoose.Schema.ObjectId,
    ref: 'User'
  }],
  // Prediction model — EWMA
  predictionModel: {
    historicalAvgTime: { type: Number, default: 15 },
    recentAvgTime: { type: Number, default: 15 },
    ewmaAlpha: { type: Number, default: 0.3 },
    byHour: [{
      hour: Number,
      avgTime: Number,
      sampleCount: { type: Number, default: 0 }
    }],
    byDayOfWeek: [{
      day: Number,
      avgTime: Number,
      sampleCount: { type: Number, default: 0 }
    }],
    lastUpdatedAt: Date
  },
  isActive: {
    type: Boolean,
    default: true
  }
}, {
  timestamps: true,
  toJSON: { virtuals: true },
  toObject: { virtuals: true }
});

// Indexes
ServiceSchema.index({ business: 1 });
ServiceSchema.index({ branch: 1 });
ServiceSchema.index({ isActive: 1, isAcceptingQueue: 1 });

// Initialize prediction model structure on pre-save if new
ServiceSchema.pre('save', function(next) {
  if (this.isNew) {
    if (!this.predictionModel.byHour || this.predictionModel.byHour.length === 0) {
      this.predictionModel.byHour = Array.from({ length: 24 }, (_, i) => ({ hour: i, avgTime: this.estimatedServiceTime, sampleCount: 0 }));
    }
    if (!this.predictionModel.byDayOfWeek || this.predictionModel.byDayOfWeek.length === 0) {
      this.predictionModel.byDayOfWeek = Array.from({ length: 7 }, (_, i) => ({ day: i, avgTime: this.estimatedServiceTime, sampleCount: 0 }));
    }
    this.predictionModel.historicalAvgTime = this.estimatedServiceTime;
    this.predictionModel.recentAvgTime = this.estimatedServiceTime;
  }
  next();
});

module.exports = mongoose.model('Service', ServiceSchema);
