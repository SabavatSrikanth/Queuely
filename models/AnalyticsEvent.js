const mongoose = require('mongoose');

const AnalyticsEventSchema = new mongoose.Schema({
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
  eventType: {
    type: String,
    enum: ['join', 'call', 'serve', 'skip', 'cancel', 'no_show', 'appointment_book', 'appointment_complete', 'appointment_cancel'],
    required: true
  },
  date: Date,
  hour: Number,
  dayOfWeek: Number,
  weekNumber: Number,
  month: Number,
  year: Number,
  waitTime: Number,
  serveTime: Number,
  isGuest: Boolean,
  ticketType: {
    type: String,
    enum: ['walk_in', 'appointment']
  }
}, {
  timestamps: true,
  toJSON: { virtuals: true },
  toObject: { virtuals: true }
});

// Pre-save to extract time components
AnalyticsEventSchema.pre('save', function(next) {
  if (this.isNew) {
    const d = this.date || new Date();
    this.date = new Date(Date.UTC(d.getUTCFullYear(), d.getUTCMonth(), d.getUTCDate()));
    this.hour = d.getUTCHours();
    this.dayOfWeek = d.getUTCDay();
    this.month = d.getUTCMonth();
    this.year = d.getUTCFullYear();
    
    // Calculate ISO week number
    const target = new Date(d.valueOf());
    const dayNr = (d.getUTCDay() + 6) % 7;
    target.setUTCDate(target.getUTCDate() - dayNr + 3);
    const firstThursday = target.valueOf();
    target.setUTCMonth(0, 1);
    if (target.getUTCDay() !== 4) {
      target.setUTCMonth(0, 1 + ((4 - target.getUTCDay()) + 7) % 7);
    }
    this.weekNumber = 1 + Math.ceil((firstThursday - target) / 604800000);
  }
  next();
});

// Indexes
AnalyticsEventSchema.index({ business: 1, date: 1 });
AnalyticsEventSchema.index({ business: 1, hour: 1, dayOfWeek: 1 });
AnalyticsEventSchema.index({ service: 1, eventType: 1, date: 1 });

module.exports = mongoose.model('AnalyticsEvent', AnalyticsEventSchema);
