const Service = require('../models/Service');
const Branch = require('../models/Branch');
const Business = require('../models/Business');
const asyncHandler = require('../utils/asyncHandler');
const ApiError = require('../utils/ApiError');
const ApiResponse = require('../utils/ApiResponse');

/**
 * Resolves whether req.user may manage services belonging to `service`.
 */
const canManageService = (req, service) =>
  req.user.role === 'super_admin' || String(req.user.businessId) === String(service.business);

/**
 * Fixes Audit C6 — mounted both nested (/api/branches/:branchId/services)
 * and flat (/api/services). Previously this always read
 * req.params.branchId even when mounted flat (always undefined), causing
 * Branch.findById(undefined) to always 404 — the entire endpoint was
 * permanently broken regardless of caller. It now also accepts
 * ?branch=/?business= query filters for flat-style calls (fixes Audit H6's
 * second half — business-detail.ejs calls `/api/services?business=...`).
 */
exports.getServices = asyncHandler(async (req, res, next) => {
  const branchId = req.params.branchId || req.query.branch;
  const businessId = req.query.business;

  if (branchId) {
    const branch = await Branch.findById(branchId);
    if (!branch) {
      return next(new ApiError('Branch not found', 404));
    }
    const services = await Service.find({
      business: branch.business,
      $or: [{ branch: branchId }, { branch: null }],
      isActive: true,
    });
    return res.status(200).json(new ApiResponse(200, services, 'Services fetched successfully'));
  }

  if (businessId) {
    const services = await Service.find({ business: businessId, isActive: true });
    return res.status(200).json(new ApiResponse(200, services, 'Services fetched successfully'));
  }

  return next(new ApiError('Provide a branch or business to list services for', 400));
});

exports.getService = asyncHandler(async (req, res, next) => {
  const service = await Service.findById(req.params.id);
  if (!service) {
    return next(new ApiError('Service not found', 404));
  }
  res.status(200).json(new ApiResponse(200, service, 'Service fetched successfully'));
});

exports.createService = asyncHandler(async (req, res, next) => {
  const branchId = req.params.branchId || req.body.branch || null;
  const businessId = req.body.business;

  let business;
  let branch = null;

  if (branchId) {
    branch = await Branch.findById(branchId);
    if (!branch) {
      return next(new ApiError('Branch not found', 404));
    }
    business = await Business.findById(branch.business);
  } else if (businessId) {
    // Global service (no specific branch) — still requires a business.
    business = await Business.findById(businessId);
  } else {
    return next(new ApiError('Provide a branch (nested route) or a business (for a branch-less, global service)', 400));
  }

  if (!business) {
    return next(new ApiError('Business not found', 404));
  }
  if (business.owner.toString() !== req.user.id && req.user.role !== 'super_admin') {
    return next(new ApiError('User not authorized to add a service to this business', 403));
  }

  const {
    name, description, code, estimatedServiceTime, slotDuration,
    bufferTime, maxAppointmentsPerSlot, maxQueueCapacity, walkinEnabled,
    appointmentEnabled, isAcceptingQueue, isActive,
  } = req.body;

  const service = await Service.create({
    business: business._id,
    branch: branch ? branch._id : null,
    name,
    description,
    code,
    estimatedServiceTime,
    slotDuration,
    bufferTime,
    maxAppointmentsPerSlot,
    maxQueueCapacity,
    walkinEnabled,
    appointmentEnabled,
    isAcceptingQueue,
    isActive,
  });

  res.status(201).json(new ApiResponse(201, service, 'Service created successfully'));
});

exports.updateService = asyncHandler(async (req, res, next) => {
  const service = await Service.findById(req.params.id);

  if (!service) {
    return next(new ApiError('Service not found', 404));
  }

  if (!canManageService(req, service)) {
    return next(new ApiError('User not authorized to update this service', 403));
  }

  // Never allow `business` (owning tenant) to be reassigned via this
  // endpoint — only the fields a business owner should actually be
  // editing day-to-day.
  const {
    name, description, code, estimatedServiceTime, slotDuration,
    bufferTime, maxAppointmentsPerSlot, maxQueueCapacity, walkinEnabled,
    appointmentEnabled, isAcceptingQueue, isActive, branch,
  } = req.body;
  const updates = {};
  [
    ['name', name], ['description', description], ['code', code],
    ['estimatedServiceTime', estimatedServiceTime], ['slotDuration', slotDuration],
    ['bufferTime', bufferTime], ['maxAppointmentsPerSlot', maxAppointmentsPerSlot],
    ['maxQueueCapacity', maxQueueCapacity], ['walkinEnabled', walkinEnabled],
    ['appointmentEnabled', appointmentEnabled], ['isAcceptingQueue', isAcceptingQueue],
    ['isActive', isActive], ['branch', branch],
  ].forEach(([key, value]) => {
    if (value !== undefined) updates[key] = value;
  });

  const updated = await Service.findByIdAndUpdate(req.params.id, updates, {
    new: true,
    runValidators: true,
  });

  res.status(200).json(new ApiResponse(200, updated, 'Service updated successfully'));
});

exports.deleteService = asyncHandler(async (req, res, next) => {
  const service = await Service.findById(req.params.id);

  if (!service) {
    return next(new ApiError('Service not found', 404));
  }

  if (!canManageService(req, service)) {
    return next(new ApiError('User not authorized to delete this service', 403));
  }

  await service.deleteOne();

  res.status(200).json(new ApiResponse(200, {}, 'Service deleted successfully'));
});

exports.toggleQueue = asyncHandler(async (req, res, next) => {
  const service = await Service.findById(req.params.id);

  if (!service) {
    return next(new ApiError('Service not found', 404));
  }

  if (!canManageService(req, service)) {
    return next(new ApiError('User not authorized to update this service', 403));
  }

  service.isAcceptingQueue = !service.isAcceptingQueue;
  await service.save();

  res.status(200).json(new ApiResponse(200, service, `Queue is now ${service.isAcceptingQueue ? 'open' : 'closed'}`));
});

exports.toggleAppointments = asyncHandler(async (req, res, next) => {
  const service = await Service.findById(req.params.id);

  if (!service) {
    return next(new ApiError('Service not found', 404));
  }

  if (!canManageService(req, service)) {
    return next(new ApiError('User not authorized to update this service', 403));
  }

  service.appointmentEnabled = !service.appointmentEnabled;
  await service.save();

  res.status(200).json(new ApiResponse(200, service, `Appointments are now ${service.appointmentEnabled ? 'enabled' : 'disabled'}`));
});

exports.getPrediction = asyncHandler(async (req, res, next) => {
  const service = await Service.findById(req.params.id);

  if (!service) {
    return next(new ApiError('Service not found', 404));
  }

  const currentHour = new Date().getUTCHours();
  const hourAvg = service.predictionModel.byHour[currentHour]?.avgTime || service.estimatedServiceTime;
  const globalAvg = service.predictionModel.historicalAvgTime;

  const blended = 0.6 * hourAvg + 0.4 * globalAvg;
  const predictedWait = (service.currentQueueCount + 1) * blended;

  res.status(200).json(new ApiResponse(200, { predictedWait: Math.round(predictedWait) }, 'Prediction fetched'));
});
