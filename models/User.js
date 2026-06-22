/**
 * @file models/User.js
 * @description Mongoose model for User — covers all roles in the system:
 *   super_admin, business_owner, branch_manager, staff, customer.
 *   Includes password hashing via bcryptjs pre-save hook and helper instance methods.
 */

const mongoose = require("mongoose");
const bcrypt = require("bcryptjs");
const jwt = require("jsonwebtoken");
const crypto = require("crypto");

const SALT_ROUNDS = 12;

// ---------------------------------------------------------------------------
// Notification Preferences Sub-Schema
// ---------------------------------------------------------------------------
const notificationPreferencesSchema = new mongoose.Schema(
  {
    email: { type: Boolean, default: true },
    inApp: { type: Boolean, default: true },
    sms: { type: Boolean, default: false },
  },
  { _id: false }
);

// ---------------------------------------------------------------------------
// User Schema
// ---------------------------------------------------------------------------
const userSchema = new mongoose.Schema(
  {
    // Core identity
    name: {
      type: String,
      required: [true, "Name is required"],
      trim: true,
      minlength: [2, "Name must be at least 2 characters"],
      maxlength: [50, "Name cannot exceed 50 characters"],
    },
    
email: {
  type: String,
  required: [true, "Email is required"],
  lowercase: true,
  trim: true,
  match: [/^\S+@\S+\.\S+$/, "Please provide a valid email address"],
},

    password: {
      type: String,
      required: [true, "Password is required"],
      minlength: [8, "Password must be at least 8 characters"],
      select: false, // Never returned in queries by default
    },

    phone: {
      type: String,
      trim: true,
    },

    avatar: {
      type: String,
      default: null, // Cloudinary URL or null
    },

    // Authorization
    role: {
      type: String,
      enum: {
        values: [
          "super_admin",
          "business_owner",
          "branch_manager",
          "staff",
          "customer",
        ],
        message: "Role '{VALUE}' is not supported",
      },
      default: "customer",
    },

    // Business / Branch association (populated for non-customer roles)
    businessId: {
      type: mongoose.Schema.Types.ObjectId,
      ref: "Business",
      default: null,
    },

    branchId: {
      type: mongoose.Schema.Types.ObjectId,
      ref: "Branch",
      default: null,
    },

    // Services this staff member is assigned to
    assignedServices: [
      {
        type: mongoose.Schema.Types.ObjectId,
        ref: "Service",
      },
    ],

    // Email verification
    isEmailVerified: {
      type: Boolean,
      default: false,
    },
    emailVerifyToken: {
      type: String,
      select: false,
    },
    emailVerifyExpiry: {
      type: Date,
      select: false,
    },

    // Password reset
    passwordResetToken: {
      type: String,
      select: false,
    },
    passwordResetExpiry: {
      type: Date,
      select: false,
    },

    // Account status
    isActive: {
      type: Boolean,
      default: true,
    },

    lastLoginAt: {
      type: Date,
    },

    // Per-user notification channel preferences
    notificationPreferences: {
      type: notificationPreferencesSchema,
      default: () => ({}),
    },
  },
  {
    timestamps: true, // createdAt + updatedAt
  }
);

// ---------------------------------------------------------------------------
// Indexes
// ---------------------------------------------------------------------------
userSchema.index({ email: 1 }, { unique: true });
userSchema.index({ businessId: 1 });
userSchema.index({ branchId: 1 });
userSchema.index({ role: 1 });

// ---------------------------------------------------------------------------
// Pre-save Hook — Hash password only when it has been modified
// ---------------------------------------------------------------------------
userSchema.pre("save", async function (next) {
  // Skip hashing if the password field hasn't changed
  if (!this.isModified("password")) return next();

  try {
    const salt = await bcrypt.genSalt(SALT_ROUNDS);
    this.password = await bcrypt.hash(this.password, salt);
    next();
  } catch (err) {
    next(err);
  }
});

// ---------------------------------------------------------------------------
// Instance Methods
// ---------------------------------------------------------------------------

/**
 * comparePassword
 * Compares a plain-text candidate password against the stored bcrypt hash.
 * NOTE: You must explicitly select the password field in your query,
 *       e.g. User.findOne({ email }).select('+password')
 *
 * @param {string} candidatePassword - The plain-text password to verify
 * @returns {Promise<boolean>} true if passwords match, false otherwise
 */
userSchema.methods.comparePassword = async function (candidatePassword) {
  return bcrypt.compare(candidatePassword, this.password);
};

userSchema.methods.matchPassword = async function (candidatePassword) {
  return bcrypt.compare(candidatePassword, this.password);
};

userSchema.methods.getSignedJwtToken = function () {
  return jwt.sign({ id: this._id, role: this.role }, process.env.JWT_SECRET, {
    expiresIn: process.env.JWT_EXPIRES_IN || '15m'
  });
};

userSchema.methods.getSignedRefreshToken = function () {
  return jwt.sign(
    { id: this._id, type: "refresh" },
    process.env.JWT_REFRESH_SECRET || process.env.JWT_SECRET,
    { expiresIn: process.env.JWT_REFRESH_EXPIRES_IN || '30d' }
  );
};

/**
 * getResetPasswordToken
 * Generates a plaintext token to email to the user, while storing only its
 * SHA-256 hash + an expiry on the document. The plaintext token is never
 * persisted, so a database leak alone cannot be used to reset accounts.
 *
 * @returns {string} plaintext token to send via email (not saved to DB)
 */
userSchema.methods.getResetPasswordToken = function () {
  const resetToken = crypto.randomBytes(32).toString("hex");

  this.passwordResetToken = crypto
    .createHash("sha256")
    .update(resetToken)
    .digest("hex");

  this.passwordResetExpiry = Date.now() + 30 * 60 * 1000; // 30 minutes

  return resetToken;
};

/**
 * getAvatarUrl
 * Returns the stored Cloudinary avatar URL, or falls back to a UI-Avatars
 * generated URL using the user's name initials.
 *
 * @returns {string} A publicly accessible avatar URL
 */
userSchema.methods.getAvatarUrl = function () {
  if (this.avatar) return this.avatar;

  // Build initials-based avatar via UI-Avatars (no API key needed)
  const encodedName = encodeURIComponent(this.name || "User");
  return `https://ui-avatars.com/api/?name=${encodedName}&background=6366f1&color=ffffff&size=128&bold=true&rounded=true`;
};

// ---------------------------------------------------------------------------
// Export
// ---------------------------------------------------------------------------
const User = mongoose.model("User", userSchema);
module.exports = User;
