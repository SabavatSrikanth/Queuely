const Business = require('../models/Business');
const asyncHandler = require('../utils/asyncHandler');
const ApiError = require('../utils/ApiError');
const ApiResponse = require('../utils/ApiResponse');
const { uniqueSlug } = require('../utils/slugify');

// Fields a business_owner may set when creating or updating their own
// business. Deliberately excludes `plan`, `features`, `isVerified`,
// `averageRating`, `owner`, and `isActive` — those are either
// system-derived, billing-derived, or admin-controlled, and must never be
// settable directly by the business owner themselves. Fixes Audit M3,
// where the previous implementation spread the entire req.body straight
// into Business.create()/findByIdAndUpdate(), letting any business owner
// set isVerified:true or plan:"enterprise" on themselves.
const OWNER_WRITABLE_FIELDS = [
  'name', 'description', 'category', 'address', 'contact', 'logo', 'coverImage',
];

const pickFields = (source, allowedFields) => {
  const result = {};
  for (const field of allowedFields) {
    if (Object.prototype.hasOwnProperty.call(source, field)) {
      result[field] = source[field];
    }
  }
  return result;
};

exports.getBusinesses = asyncHandler(async (req, res, next) => {
  const filter = { isActive: true };
  if (req.query.category) filter.category = req.query.category;

  const page = Math.max(parseInt(req.query.page, 10) || 1, 1);
  const limit = Math.min(parseInt(req.query.limit, 10) || 50, 100);
  const skip = (page - 1) * limit;

  const [businesses, total] = await Promise.all([
    Business.find(filter).skip(skip).limit(limit).sort('-createdAt'),
    Business.countDocuments(filter),
  ]);

  res.status(200).json(new ApiResponse(200, businesses, 'Businesses fetched successfully', {
    page, limit, total, pages: Math.ceil(total / limit),
  }));
});

exports.getBusinessBySlug = asyncHandler(async (req, res, next) => {
  const business = await Business.findOne({ slug: req.params.slug, isActive: true });
  if (!business) {
    return next(new ApiError('Business not found', 404));
  }
  res.status(200).json(new ApiResponse(200, business, 'Business fetched successfully'));
});

exports.getBusinessById = asyncHandler(async (req, res, next) => {
  const business = await Business.findById(req.params.id);
  if (!business) {
    return next(new ApiError('Business not found', 404));
  }
  res.status(200).json(new ApiResponse(200, business, 'Business fetched successfully'));
});

/**
 * Fixes Audit M3 — `slug` is a required, unique field on Business, but
 * nothing previously generated it (unlike Branch, which has a pre-save
 * slugify hook), so creation 400'd unless the client happened to supply
 * one manually. It's now auto-generated from `name`, de-duplicated via
 * uniqueSlug() (an existing-but-previously-unused utility).
 */
exports.createBusiness = asyncHandler(async (req, res, next) => {
  if (req.user.businessId) {
    return next(new ApiError('You already own a business. Each owner may create only one business.', 400));
  }

  const data = pickFields(req.body, OWNER_WRITABLE_FIELDS);
  if (!data.name) {
    return next(new ApiError('Business name is required', 400));
  }

  data.slug = await uniqueSlug(data.name, async (candidate) => {
    const existing = await Business.findOne({ slug: candidate });
    return !!existing;
  });
  data.owner = req.user.id;

  const business = await Business.create(data);

  // Update user's businessId and role if necessary
  req.user.businessId = business._id;
  if (req.user.role === 'customer') {
    req.user.role = 'business_owner';
  }
  await req.user.save();

  res.status(201).json(new ApiResponse(201, business, 'Business created successfully'));
});

exports.updateBusiness = asyncHandler(async (req, res, next) => {
  const business = await Business.findById(req.params.id);

  if (!business) {
    return next(new ApiError('Business not found', 404));
  }

  // Make sure user is owner
  if (business.owner.toString() !== req.user.id && req.user.role !== 'super_admin') {
    return next(new ApiError('User not authorized to update this business', 403));
  }

  const updates = pickFields(req.body, OWNER_WRITABLE_FIELDS);

  // Renaming a business re-derives its slug, kept unique and excluding
  // the business's own current document from the collision check.
  if (updates.name && updates.name !== business.name) {
    updates.slug = await uniqueSlug(updates.name, async (candidate) => {
      const existing = await Business.findOne({ slug: candidate, _id: { $ne: business._id } });
      return !!existing;
    });
  }

  const updated = await Business.findByIdAndUpdate(req.params.id, updates, {
    new: true,
    runValidators: true,
  });

  res.status(200).json(new ApiResponse(200, updated, 'Business updated successfully'));
});

exports.deleteBusiness = asyncHandler(async (req, res, next) => {
  const business = await Business.findById(req.params.id);

  if (!business) {
    return next(new ApiError('Business not found', 404));
  }

  if (business.owner.toString() !== req.user.id && req.user.role !== 'super_admin') {
    return next(new ApiError('User not authorized to delete this business', 403));
  }

  await business.deleteOne();

  res.status(200).json(new ApiResponse(200, {}, 'Business deleted successfully'));
});
