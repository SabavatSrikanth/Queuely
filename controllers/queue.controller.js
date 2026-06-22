const QueueService = require('../services/queue.service');
const Ticket = require('../models/Ticket');
const Service = require('../models/Service');
const asyncHandler = require('../utils/asyncHandler');
const ApiError = require('../utils/ApiError');
const ApiResponse = require('../utils/ApiResponse');
const { generateFingerprint } = require('../utils/deviceFingerprint');

exports.joinQueue = asyncHandler(async (req, res, next) => {
  // Resolve business/branch from the service itself rather than trusting
  // arbitrary values in the request body — businessId/branchId previously
  // came straight from req.body with no verification that they actually
  // matched the service being joined.
  const service = await Service.findById(req.params.serviceId);
  if (!service) {
    return next(new ApiError('Service not found', 404));
  }

  const data = {
    serviceId: req.params.serviceId,
    businessId: service.business,
    branchId: service.branch,
    customerId: req.user ? req.user.id : null,
    guestInfo: req.body.guestInfo || { name: req.user ? req.user.name : 'Guest', phone: '' },
    ipAddress: req.ip,
    // A client-supplied header is not a real device fingerprint (it's
    // trivially spoofable) — derive one server-side from request
    // characteristics instead (Audit L4).
    deviceFingerprint: generateFingerprint(req),
  };

  if (!data.customerId && (!data.guestInfo || !data.guestInfo.name || !data.guestInfo.phone)) {
    return next(new ApiError('Guest name and phone are required to join the queue', 400));
  }

  const ticket = await QueueService.joinQueue(data);

  res.status(201).json(new ApiResponse(201, ticket, 'Successfully joined queue'));
});

exports.getLiveQueueState = asyncHandler(async (req, res, next) => {
  const state = await QueueService.getLiveQueueState(req.params.serviceId);
  res.status(200).json(new ApiResponse(200, state, 'Live queue state fetched'));
});

exports.getTicketStatus = asyncHandler(async (req, res, next) => {
  const ticket = await Ticket.findById(req.params.ticketId).populate('service', 'name estimatedServiceTime');
  if (!ticket) {
    return next(new ApiError('Ticket not found', 404));
  }
  res.status(200).json(new ApiResponse(200, ticket, 'Ticket fetched successfully'));
});

exports.callNext = asyncHandler(async (req, res, next) => {
  const staffId = req.user.id;
  const ticket = await QueueService.callNext(req.params.serviceId, staffId);
  res.status(200).json(new ApiResponse(200, ticket, `Ticket ${ticket.ticketNumber} called`));
});

exports.serveTicket = asyncHandler(async (req, res, next) => {
  const ticket = await QueueService.serve(req.params.ticketId);
  res.status(200).json(new ApiResponse(200, ticket, `Serving ticket ${ticket.ticketNumber}`));
});

exports.markServed = asyncHandler(async (req, res, next) => {
  const ticket = await QueueService.markServed(req.params.ticketId);
  res.status(200).json(new ApiResponse(200, ticket, `Ticket ${ticket.ticketNumber} completed`));
});

exports.skipTicket = asyncHandler(async (req, res, next) => {
  // Staff are authorized at the route layer (authorize('staff', ...)); we
  // additionally confirm the ticket belongs to the staff member's own
  // business so staff at Business A cannot skip Business B's tickets.
  const ticket = await Ticket.findById(req.params.ticketId);
  if (!ticket) return next(new ApiError('Ticket not found', 404));

  if (req.user.role !== 'super_admin' && String(ticket.business) !== String(req.user.businessId)) {
    return next(new ApiError('You are not authorized to manage this ticket', 403));
  }

  const updated = await QueueService.skipOrCancel(req.params.ticketId, 'skipped');
  res.status(200).json(new ApiResponse(200, updated, `Ticket ${updated.ticketNumber} skipped`));
});

/**
 * Cancel a ticket. Reachable by:
 *  - the customer who owns it (req.user.id matches ticket.customer)
 *  - the guest who created it (device fingerprint matches)
 *  - staff/manager/owner/admin of the ticket's own business
 * Anyone else gets a 403. Previously this endpoint had no authorization
 * at all (Audit C4).
 */
exports.cancelTicket = asyncHandler(async (req, res, next) => {
  const ticket = await Ticket.findById(req.params.ticketId);
  if (!ticket) return next(new ApiError('Ticket not found', 404));

  const staffRoles = ['staff', 'branch_manager', 'business_owner', 'super_admin'];
  const isStaffOfThisBusiness =
    req.user &&
    staffRoles.includes(req.user.role) &&
    (req.user.role === 'super_admin' || String(ticket.business) === String(req.user.businessId));

  let ownership = null;
  if (!isStaffOfThisBusiness) {
    ownership = {
      userId: req.user ? req.user.id : undefined,
      deviceFingerprint: generateFingerprint(req),
    };
  }

  const updated = await QueueService.skipOrCancel(req.params.ticketId, 'cancelled', ownership);
  res.status(200).json(new ApiResponse(200, updated, `Ticket ${updated.ticketNumber} cancelled`));
});

exports.markNoShow = asyncHandler(async (req, res, next) => {
  const ticket = await Ticket.findById(req.params.ticketId);
  if (!ticket) return next(new ApiError('Ticket not found', 404));

  if (req.user.role !== 'super_admin' && String(ticket.business) !== String(req.user.businessId)) {
    return next(new ApiError('You are not authorized to manage this ticket', 403));
  }

  const updated = await QueueService.skipOrCancel(req.params.ticketId, 'no_show');
  res.status(200).json(new ApiResponse(200, updated, `Ticket ${updated.ticketNumber} marked as no-show`));
});

exports.getMyTickets = asyncHandler(async (req, res, next) => {
  const tickets = await Ticket.find({ customer: req.user.id })
    .populate('business', 'name')
    .populate('service', 'name')
    .sort('-createdAt');
  res.status(200).json(new ApiResponse(200, tickets, 'Tickets fetched successfully'));
});
