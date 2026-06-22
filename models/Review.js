const mongoose = require('mongoose');

const ReviewSchema = new mongoose.Schema({
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
  ticket: {
    type: mongoose.Schema.ObjectId,
    ref: 'Ticket',
    required: true
  },
  customer: {
    type: mongoose.Schema.ObjectId,
    ref: 'User',
    required: true
  },
  rating: {
    type: Number,
    min: 1,
    max: 5,
    required: [true, 'Please add a rating between 1 and 5']
  },
  comment: {
    type: String,
    maxlength: 500
  }
}, {
  timestamps: true,
  toJSON: { virtuals: true },
  toObject: { virtuals: true }
});

// Prevent user from submitting more than one review per ticket
ReviewSchema.index({ ticket: 1, customer: 1 }, { unique: true });

// Static method to get avg rating and save
ReviewSchema.statics.getAverageRating = async function(businessId) {
  const obj = await this.aggregate([
    {
      $match: { business: businessId }
    },
    {
      $group: {
        _id: '$business',
        averageRating: { $avg: '$rating' },
        totalReviews: { $sum: 1 }
      }
    }
  ]);

  try {
    await this.model('Business').findByIdAndUpdate(businessId, {
      averageRating: obj[0] ? obj[0].averageRating : 0,
      totalReviews: obj[0] ? obj[0].totalReviews : 0
    });
  } catch (err) {
    console.error(err);
  }
};

// Call getAverageRating after save
ReviewSchema.post('save', function() {
  this.constructor.getAverageRating(this.business);
});

// Call getAverageRating before remove (Mongoose 8: use deleteOne document middleware,
// since Document#remove() was removed in Mongoose 8 and this hook would never fire otherwise)
ReviewSchema.pre('deleteOne', { document: true, query: false }, function(next) {
  this.constructor.getAverageRating(this.business);
  next();
});

module.exports = mongoose.model('Review', ReviewSchema);
