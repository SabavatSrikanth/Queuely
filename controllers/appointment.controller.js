const AppointmentService = require('../services/appointment.service');
const Appointment = require('../models/Appointment');
const Service = require('../models/Service');
const asyncHandler = require('../utils/asyncHandler');
const ApiError = require('../utils/ApiError');
const ApiResponse = require('../utils/ApiResponse');

const staffRoles = ['staff', 'branch_manager', 'business_owner', 'super_admin'];

/**
 * Returns true if req.user is staff of the business that owns `appt`.
 */
const isStaffOfAppointmentBusiness = (req, appt) =>
  req.user &&
  staffRoles.includes(req.user.role) &&
  (req.user.role === 'super_admin' || String(req.user.businessId) === String(appt.business));

exports.getAvailableSlots = asyncHandler(async (req, res, next) => {
  const { date } = req.query;
  if (!date) {
    return next(new ApiError('Please provide a date query parameter (YYYY-MM-DD)', 400));
  }
  const slots = await AppointmentService.getAvailableSlots(req.params.serviceId, date);
  res.status(200).json(new ApiResponse(200, slots, 'Available slots fetched'));
});

exports.bookAppointment = asyncHandler(async (req, res, next) => {
  const service = await Service.findById(req.params.serviceId);
  if (!service) {
    return next(new ApiError('Service not found', 404));
  }

  const { date, startTime, endTime } = req.body;
  if (!date || !startTime || !endTime) {
    return next(new ApiError('date, startTime, and endTime are required', 400));
  }

  const data = {
    serviceId: req.params.serviceId,
    businessId: service.business,
    branchId: service.branch,
    date,
    startTime,
    endTime,
    customerId: req.user ? req.user.id : null,
    guestInfo: req.body.guestInfo,
  };

  const appointment = await AppointmentService.bookAppointment(data);
  res.status(201).json(new ApiResponse(201, appointment, 'Appointment booked successfully'));
});

exports.getMyAppointments = asyncHandler(async (req, res, next) => {
  const appointments = await Appointment.find({ customer: req.user.id })
    .populate('business', 'name')
    .populate('service', 'name')
    .sort('appointmentDate startTime');
  res.status(200).json(new ApiResponse(200, appointments, 'Appointments fetched'));
});

/**
 * Fixes Audit C5 — previously any authenticated user could fetch any
 * appointment by ID, leaking guest contact info and business details that
 * weren't theirs. Now restricted to the appointment's own customer or
 * staff/owner/admin of the owning business.
 */
exports.getAppointment = asyncHandler(async (req, res, next) => {
  const appt = await Appointment.findById(req.params.id)
    .populate('business', 'name')
    .populate('service', 'name');
  if (!appt) return next(new ApiError('Appointment not found', 404));

  const isOwner = appt.customer && req.user && String(appt.customer) === String(req.user.id);
  if (!isOwner && !isStaffOfAppointmentBusiness(req, appt)) {
    return next(new ApiError('Not authorized to view this appointment', 403));
  }

  res.status(200).json(new ApiResponse(200, appt, 'Appointment fetched'));
});

exports.confirmAppointment = asyncHandler(async (req, res, next) => {
  const existing = await Appointment.findById(req.params.id);
  if (!existing) return next(new ApiError('Appointment not found', 404));
  if (!isStaffOfAppointmentBusiness(req, existing)) {
    return next(new ApiError('Not authorized to manage this appointment', 403));
  }

  const appt = await AppointmentService.confirmAppointment(req.params.id);
  res.status(200).json(new ApiResponse(200, appt, 'Appointment confirmed'));
});

/**
 * Fixes Audit C5 — cancellation previously had no ownership check at all;
 * any authenticated user could cancel any other customer's appointment.
 */
exports.cancelAppointment = asyncHandler(async (req, res, next) => {
  const existing = await Appointment.findById(req.params.id);
  if (!existing) return next(new ApiError('Appointment not found', 404));

  const isOwner = existing.customer && String(existing.customer) === String(req.user.id);
  if (!isOwner && !isStaffOfAppointmentBusiness(req, existing)) {
    return next(new ApiError('Not authorized to cancel this appointment', 403));
  }

  const appt = await AppointmentService.cancelAppointment(req.params.id, req.body.reason);
  res.status(200).json(new ApiResponse(200, appt, 'Appointment cancelled'));
});

exports.checkInAppointment = asyncHandler(async (req, res, next) => {
  const existing = await Appointment.findById(req.params.id);
  if (!existing) return next(new ApiError('Appointment not found', 404));
  if (!isStaffOfAppointmentBusiness(req, existing)) {
    return next(new ApiError('Not authorized to manage this appointment', 403));
  }

  const result = await AppointmentService.checkIn(req.params.id);
  res.status(200).json(new ApiResponse(200, result, 'Checked in successfully'));
});

exports.completeAppointment = asyncHandler(async (req, res, next) => {
  const existing = await Appointment.findById(req.params.id);
  if (!existing) return next(new ApiError('Appointment not found', 404));
  if (!isStaffOfAppointmentBusiness(req, existing)) {
    return next(new ApiError('Not authorized to manage this appointment', 403));
  }

  const appt = await AppointmentService.completeAppointment(req.params.id);
  res.status(200).json(new ApiResponse(200, appt, 'Appointment completed'));
});

exports.getBusinessAppointments = asyncHandler(async (req, res, next) => {
  if (req.user.role !== 'super_admin' && String(req.user.businessId) !== String(req.params.id)) {
    return next(new ApiError('Not authorized to view this business\u2019s appointments', 403));
  }

  const query = { business: req.params.id };

  // Fixes part of the brittle date-equality filter: normalizes the
  // incoming query date the same way appointmentDate is stored
  // (UTC midnight), so the filter actually matches stored documents.
  if (req.query.date) {
    const d = new Date(req.query.date);
    if (!Number.isNaN(d.getTime())) {
      query.appointmentDate = new Date(Date.UTC(d.getUTCFullYear(), d.getUTCMonth(), d.getUTCDate()));
    }
  }
  if (req.query.status) query.status = req.query.status;

  const appts = await Appointment.find(query)
    .populate('service', 'name')
    .populate('customer', 'name email phone')
    .sort('appointmentDate startTime');
  res.status(200).json(new ApiResponse(200, appts, 'Business appointments fetched'));
});
