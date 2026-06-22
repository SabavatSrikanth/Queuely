/**
 * @file models/Business.js
 * @description Mongoose model for Business — top-level entity in the system.
 *   Each Business can have multiple Branches, Services, Staff, etc.
 *   Supports 2dsphere geo-indexing for location-based queries.
 */

const mongoose = require("mongoose");

// ---------------------------------------------------------------------------
// Coordinates Sub-Schema (GeoJSON Point)
// ---------------------------------------------------------------------------
const coordinatesSchema = new mongoose.Schema(
  {
    type: {
      type: String,
      default: "Point",
      enum: ["Point"], // Only Point geometry is supported
    },
    coordinates: {
      type: [Number], // [longitude, latitude]
      default: [0, 0],
    },
  },
  { _id: false }
);

// ---------------------------------------------------------------------------
// Address Sub-Schema
// ---------------------------------------------------------------------------
const addressSchema = new mongoose.Schema(
  {
    street: { type: String, trim: true },
    city: { type: String, required: [true, "City is required"], trim: true },
    state: { type: String, trim: true },
    country: {
      type: String,
      required: [true, "Country is required"],
      trim: true,
      default: "India",
    },
    coordinates: {
      type: coordinatesSchema,
      default: () => ({}), // Defaults to { type: 'Point', coordinates: [0,0] }
    },
  },
  { _id: false }
);

// ---------------------------------------------------------------------------
// Contact Sub-Schema
// ---------------------------------------------------------------------------
const contactSchema = new mongoose.Schema(
  {
    phone: { type: String, trim: true },
    email: { type: String, trim: true, lowercase: true },
    website: { type: String, trim: true },
  },
  { _id: false }
);

// ---------------------------------------------------------------------------
// Plan Feature Flags Sub-Schema
// Controlled by the SaaS plan; features are unlocked per plan tier.
// ---------------------------------------------------------------------------
const featuresSchema = new mongoose.Schema(
  {
    multiBranch: { type: Boolean, default: false },
    appointments: { type: Boolean, default: false },
    smsNotifications: { type: Boolean, default: false },
    customBranding: { type: Boolean, default: false },
  },
  { _id: false }
);

// ---------------------------------------------------------------------------
// Business Schema
// ---------------------------------------------------------------------------
const businessSchema = new mongoose.Schema(
  {
    name: {
      type: String,
      required: [true, "Business name is required"],
      trim: true,
      minlength: [3, "Business name must be at least 3 characters"],
      maxlength: [100, "Business name cannot exceed 100 characters"],
    },

    // URL-friendly unique identifier generated from the name
slug: {
  type: String,
  required: [true, "Slug is required"],
  trim: true,
  lowercase: true,
},

    description: {
      type: String,
      maxlength: [1000, "Description cannot exceed 1000 characters"],
    },

    category: {
      type: String,
      required: [true, "Business category is required"],
      enum: {
        values: [
          "healthcare",
          "government",
          "salon_beauty",
          "banking",
          "education",
          "retail",
          "legal",
          "fitness",
          "food_beverage",
          "other",
        ],
        message: "Category '{VALUE}' is not supported",
      },
    },

    // The business owner user account
    owner: {
      type: mongoose.Schema.Types.ObjectId,
      ref: "User",
      required: [true, "Business owner is required"],
    },

    // Cloudinary URLs
    logo: { type: String, default: null },
    coverImage: { type: String, default: null },

    address: {
      type: addressSchema,
      default: () => ({}),
    },

    contact: {
      type: contactSchema,
      default: () => ({}),
    },

    // Subscription plan
    plan: {
      type: String,
      enum: {
        values: ["free", "starter", "pro", "enterprise"],
        message: "Plan '{VALUE}' is not valid",
      },
      default: "free",
    },

    // Features unlocked for this business based on plan
    features: {
      type: featuresSchema,
      default: () => ({}),
    },

    // Admin verification flag (e.g. KYC verified)
    isVerified: { type: Boolean, default: false },

    isActive: { type: Boolean, default: true },

    // Aggregate stats — updated reactively via Review model post-save hook
    averageRating: {
      type: Number,
      default: 0,
      min: [0, "Rating cannot be negative"],
      max: [5, "Rating cannot exceed 5"],
    },
    totalReviews: { type: Number, default: 0 },

    // Cumulative counters
    totalServed: { type: Number, default: 0 }, // All-time tickets served
    totalBranches: { type: Number, default: 0 },
  },
  {
    timestamps: true,
  }
);

// ---------------------------------------------------------------------------
// Indexes
// ---------------------------------------------------------------------------
businessSchema.index({ slug: 1 }, { unique: true });
businessSchema.index({ "address.coordinates": "2dsphere" }); // Geo queries
businessSchema.index({ category: 1 });
businessSchema.index({ isVerified: 1 });
businessSchema.index({ owner: 1 });

// ---------------------------------------------------------------------------
// Export
// ---------------------------------------------------------------------------
const Business = mongoose.model("Business", businessSchema);
module.exports = Business;
