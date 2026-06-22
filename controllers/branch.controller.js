const Branch = require('../models/Branch');
const Business = require('../models/Business');
const asyncHandler = require('../utils/asyncHandler');
const ApiError = require('../utils/ApiError');
const ApiResponse = require('../utils/ApiResponse');

/**
 * Fixes Audit C6 — this router is mounted both nested
 * (/api/businesses/:businessId/branches) and flat (/api/branches). When
 * nested, req.params.businessId is populated by Express directly. When
 * flat, we fall back to a ?business= query filter so existing flat-style
 * frontend calls keep working. Previously this always read
 * req.params.businessId even when mounted flat (where it was always
 * undefined), which silently returned every branch of every business.
 */
exports.getBranches = asyncHandler(async (req, res, next) => {
  const businessId = req.params.businessId || req.query.business;
  const filter = { isActive: true };
  if (businessId) filter.business = businessId;

  const branches = await Branch.find(filter).populate('business', 'name slug');
  res.status(200).json(new ApiResponse(200, branches, 'Branches fetched successfully'));
});

exports.getBranch = asyncHandler(async (req, res, next) => {
  const branch = await Branch.findById(req.params.id).populate('business', 'name slug');
  if (!branch) {
    return next(new ApiError('Branch not found', 404));
  }
  res.status(200).json(new ApiResponse(200, branch, 'Branch fetched successfully'));
});

exports.createBranch = asyncHandler(async (req, res, next) => {
  const businessId = req.params.businessId || req.body.business;
  if (!businessId) {
    return next(new ApiError('businessId is required to create a branch', 400));
  }

  const business = await Business.findById(businessId);
  if (!business) {
    return next(new ApiError('Business not found', 404));
  }

  if (business.owner.toString() !== req.user.id && req.user.role !== 'super_admin') {
    return next(new ApiError('User not authorized to add a branch to this business', 403));
  }

  // Whitelist creatable fields — req.body was previously spread wholesale,
  // which (combined with the businessId bug) was moot in practice since
  // the route never worked at all, but is fixed here as part of the
  // broader mass-assignment hardening (Audit M3 applies to this resource too).
  const { name, address, contact, operatingHours, isActive } = req.body;
  const branch = await Branch.create({
    business: businessId,
    name,
    address,
    contact,
    operatingHours,
    isActive,
  });

  res.status(201).json(new ApiResponse(201, branch, 'Branch created successfully'));
});

exports.updateBranch = asyncHandler(async (req, res, next) => {
  let branch = await Branch.findById(req.params.id);

  if (!branch) {
    return next(new ApiError('Branch not found', 404));
  }

  // Make sure user is owner, the branch's own manager, or a super_admin
  const business = await Business.findById(branch.business);
  if (business.owner.toString() !== req.user.id && req.user.role !== 'super_admin' && branch.manager?.toString() !== req.user.id) {
    return next(new ApiError('User not authorized to update this branch', 403));
  }

  // Whitelist updatable fields — never let `business` (owning tenant) or
  // `slug` be overwritten via this endpoint.
  const { name, address, contact, operatingHours, manager, isActive, isOpen } = req.body;
  const updates = {};
  if (name !== undefined) updates.name = name;
  if (address !== undefined) updates.address = address;
  if (contact !== undefined) updates.contact = contact;
  if (operatingHours !== undefined) updates.operatingHours = operatingHours;
  if (manager !== undefined) updates.manager = manager;
  if (isActive !== undefined) updates.isActive = isActive;
  if (isOpen !== undefined) updates.isOpen = isOpen;

  branch = await Branch.findByIdAndUpdate(req.params.id, updates, {
    new: true,
    runValidators: true,
  });

  res.status(200).json(new ApiResponse(200, branch, 'Branch updated successfully'));
});

exports.deleteBranch = asyncHandler(async (req, res, next) => {
  const branch = await Branch.findById(req.params.id);

  if (!branch) {
    return next(new ApiError('Branch not found', 404));
  }

  const business = await Business.findById(branch.business);
  if (business.owner.toString() !== req.user.id && req.user.role !== 'super_admin') {
    return next(new ApiError('User not authorized to delete this branch', 403));
  }

  await branch.deleteOne();

  res.status(200).json(new ApiResponse(200, {}, 'Branch deleted successfully'));
});

/**
 * Fixes a previously-missing authorization check — any authenticated
 * staff/manager/owner role could toggle ANY branch's open/closed status
 * regardless of which business it belonged to.
 */
exports.toggleBranchStatus = asyncHandler(async (req, res, next) => {
  const branch = await Branch.findById(req.params.id);

  if (!branch) {
    return next(new ApiError('Branch not found', 404));
  }

  const business = await Business.findById(branch.business);
  const isOwner = business && business.owner.toString() === req.user.id;
  const isManager = branch.manager && branch.manager.toString() === req.user.id;

  if (!isOwner && !isManager && req.user.role !== 'super_admin') {
    return next(new ApiError('User not authorized to update this branch', 403));
  }

  branch.isOpen = !branch.isOpen;
  await branch.save();

  res.status(200).json(new ApiResponse(200, branch, `Branch is now ${branch.isOpen ? 'open' : 'closed'}`));
});
