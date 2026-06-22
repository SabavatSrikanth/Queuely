const mongoose = require('mongoose');
const slugify = require('slugify');

const BranchSchema = new mongoose.Schema({
  business: {
    type: mongoose.Schema.ObjectId,
    ref: 'Business',
    required: true
  },
  name: {
    type: String,
    required: [true, 'Please add a branch name'],
    trim: true,
    maxlength: [100, 'Name cannot be more than 100 characters']
  },
  slug: String,
  description: {
    type: String,
    maxlength: [500, 'Description cannot be more than 500 characters']
  },
  isHeadquarters: {
    type: Boolean,
    default: false
  },
  address: {
    street: String,
    city: String,
    state: String,
    country: String,
    coordinates: {
      type: {
        type: String,
        enum: ['Point']
      },
      coordinates: {
        type: [Number],
        index: '2dsphere'
      }
    }
  },
  contact: {
    phone: String,
    email: String
  },
  operatingHours: [{
    day: {
      type: String,
      enum: ['mon', 'tue', 'wed', 'thu', 'fri', 'sat', 'sun']
    },
    open: String,
    close: String,
    isClosed: {
      type: Boolean,
      default: false
    }
  }],
  manager: {
    type: mongoose.Schema.ObjectId,
    ref: 'User'
  },
  staff: [{
    type: mongoose.Schema.ObjectId,
    ref: 'User'
  }],
  isActive: {
    type: Boolean,
    default: true
  },
  isOpen: {
    type: Boolean,
    default: true
  }
}, {
  timestamps: true,
  toJSON: { virtuals: true },
  toObject: { virtuals: true }
});

// Create unique compound index
BranchSchema.index({ business: 1, slug: 1 }, { unique: true });

// Create slug from name
BranchSchema.pre('save', function(next) {
  if (this.isModified('name')) {
    this.slug = slugify(this.name, { lower: true });
  }
  next();
});

module.exports = mongoose.model('Branch', BranchSchema);
