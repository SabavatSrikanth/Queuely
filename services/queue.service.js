const Ticket = require('../models/Ticket');
const Service = require('../models/Service');
const PredictionService = require('./prediction.service');
const AnalyticsService = require('./analytics.service');
const NotificationService = require('./notification.service');
const { generateTicketNumber } = require('../utils/generateTicketNumber');
const { generateQRDataURL } = require('../utils/generateQRCode');
const { resolveServiceBranch } = require('../utils/resolveServiceBranch');
const ApiError = require('../utils/ApiError');
let socketConfig;
try {
  socketConfig = require('../config/socket');
} catch (e) {
  socketConfig = null;
}

/**
 * Safely emit a socket event without ever throwing — sockets are a
 * best-effort real-time layer and must never break the underlying
 * queue operation if Socket.io isn't initialized (e.g. in tests/seed scripts).
 */
const safeEmit = (fn) => {
  try {
    if (socketConfig) fn(socketConfig);
  } catch (err) {
    console.error('[QueueService] Socket emit failed:', err.message);
  }
};

/**
 * Serializes a ticket + a fresh queue snapshot for the given service into
 * the shape the live-queue / queue-manager frontends expect.
 */
const buildQueueSnapshot = async (serviceId) => {
  const service = await Service.findById(serviceId);
  if (!service) return null;

  const calling = await Ticket.findOne({ service: serviceId, status: { $in: ['called', 'serving'] } })
    .sort({ calledAt: -1 })
    .select('ticketNumber status calledAt');

  const waitingCount = await Ticket.countDocuments({ service: serviceId, status: 'waiting' });

return {
    serviceId: service._id,
    serviceName: service.name,
    isAcceptingQueue: service.isAcceptingQueue,
    appointmentEnabled: service.appointmentEnabled,
    estimatedWaitTime: waitingCount * (service.estimatedServiceTime || 15),
    currentQueueCount: service.currentQueueCount,
    waitingCount,
    nowServing: calling ? { ticketId: calling._id, ticketNumber: calling.ticketNumber, status: calling.status } : null,
    updatedAt: new Date(),
  };
};

/**
 * Decrements the position of every waiting ticket whose position was
 * greater than the one that just left the queue, then pushes a
 * 'ticket:position' update to each affected ticket's room — this is what
 * powers the live position countdown on the public ticket-status page.
 */
const decrementPositionsAndNotify = async (serviceId, vacatedPosition, service) => {
  await Ticket.updateMany(
    { service: serviceId, status: 'waiting', position: { $gt: vacatedPosition } },
    { $inc: { position: -1 } }
  );

  const affected = await Ticket.find({ service: serviceId, status: 'waiting', position: { $lte: vacatedPosition } })
    .select('_id position');

  safeEmit(({ emitTicketUpdate }) => {
    affected.forEach((t) => {
      emitTicketUpdate(t._id, 'ticket:position', {
        position: t.position,
        estimatedWait: PredictionService.getPredictedWaitTime(service, t.position),
      });
    });
  });
};

class QueueService {
  /**
   * Customer/guest joins the walk-in queue for a service.
   * Uses an atomic $inc on the Service document to assign positions,
   * eliminating the read-then-save race that previously allowed two
   * concurrent joiners to receive the same queue position (Audit C9).
   */
  static async joinQueue(data) {
    const { serviceId, businessId, branchId, customerId, guestInfo, ipAddress, deviceFingerprint } = data;

    const serviceCheck = await Service.findById(serviceId);
    if (!serviceCheck) {
      throw new ApiError('Service not found', 404);
    }
    if (!serviceCheck.isActive || !serviceCheck.isAcceptingQueue || !serviceCheck.walkinEnabled) {
      throw new ApiError('Service is not accepting queue joins at the moment', 400);
    }
    if (serviceCheck.currentQueueCount >= serviceCheck.maxQueueCapacity) {
      throw new ApiError('Queue is currently at maximum capacity', 503);
    }

    // Duplicate-join guard
    if (customerId) {
      const existing = await Ticket.findOne({
        service: serviceId,
        customer: customerId,
        status: { $in: ['waiting', 'called', 'serving'] },
      });
      if (existing) throw new ApiError('You are already in this queue', 400);
    } else if (guestInfo && guestInfo.phone) {
      const existing = await Ticket.findOne({
        service: serviceId,
        'guestInfo.phone': guestInfo.phone,
        status: { $in: ['waiting', 'called', 'serving'] },
      });
      if (existing) throw new ApiError('This phone number is already in the queue', 400);
    }

    // Atomically reserve the next queue slot. findOneAndUpdate + $inc is a
    // single atomic operation in MongoDB, so concurrent joiners each get a
    // distinct, correctly-incremented currentQueueCount with no lost updates.
    const service = await Service.findOneAndUpdate(
      {
        _id: serviceId,
        isActive: true,
        isAcceptingQueue: true,
        currentQueueCount: { $lt: serviceCheck.maxQueueCapacity },
      },
      { $inc: { currentQueueCount: 1 } },
      { new: true }
    );

    if (!service) {
      // Lost the race for the last slot, or state changed between checks.
      throw new ApiError('Queue is currently at maximum capacity', 503);
    }

    const position = service.currentQueueCount;

    // Ticket.branch is a required field even though Service.branch may
    // legitimately be null (a service offered at every branch). Resolve a
    // concrete branch now so ticket creation below never fails validation
    // for branch-less services, and so analytics events are attributed to
    // a real branch.
    const resolvedBranchId = branchId || await resolveServiceBranch(service);

    // Per-service, per-day sequential ticket numbering (fixes Audit C7 — the
    // previous call site omitted the `count` argument entirely, producing
    // "<CODE>-0NaN" for every single ticket).
    const startOfDay = new Date();
    startOfDay.setUTCHours(0, 0, 0, 0);
    const ticketsToday = await Ticket.countDocuments({
      service: serviceId,
      createdAt: { $gte: startOfDay },
    });
    const ticketNumber = generateTicketNumber(service.code, ticketsToday);

    const predictedWaitTime = PredictionService.getPredictedWaitTime(service, position);

    const ticket = await Ticket.create({
      ticketNumber,
      business: businessId,
      branch: resolvedBranchId,
      service: serviceId,
      customer: customerId || null,
      guestInfo: customerId ? undefined : guestInfo,
      status: 'waiting',
      position,
      predictedWaitTime,
      ipAddress,
      deviceFingerprint,
    });

    // Generate a QR code pointing at the public ticket-status page so the
    // customer can scan/save it (Audit L4 — util existed but was never used).
    try {
      const baseUrl = process.env.CLIENT_URL || 'http://localhost:3000';
      ticket.qrCodeUrl = await generateQRDataURL(`${baseUrl}/ticket-status/${ticket._id}`);
      ticket.shareableLink = `${baseUrl}/ticket-status/${ticket._id}`;
      await ticket.save();
    } catch (err) {
      console.error('[QueueService] QR code generation failed:', err.message);
    }

    await AnalyticsService.log({
      business: businessId,
      branch: ticket.branch,
      service: serviceId,
      eventType: 'join',
      isGuest: !customerId,
      ticketType: 'walk_in',
    });

    await NotificationService.send({
      recipient: customerId || null,
      guestEmail: guestInfo && guestInfo.email,
      guestPhone: guestInfo && guestInfo.phone,
      type: 'queue_joined',
      title: 'You\u2019re in the queue',
      body: `Your ticket number is ${ticket.ticketNumber}. Estimated wait: ${predictedWaitTime} min.`,
      data: {
        ticketId: ticket._id,
        ticketNumber: ticket.ticketNumber,
        serviceName: service.name,
        position,
        estimatedWait: predictedWaitTime,
        ticketUrl: ticket.shareableLink || '#',
      },
      channels: ['email', 'inApp'],
    });

    safeEmit(({ emitQueueUpdate }) => {
      buildQueueSnapshot(serviceId).then((snapshot) => {
        if (snapshot) emitQueueUpdate(serviceId, snapshot);
      });
    });

    return ticket;
  }

  /**
   * Staff calls the next waiting customer. Guards against calling a new
   * ticket while one is already called/serving for the same service
   * (Audit C9/C10 — previously nothing prevented multiple simultaneous
   * "called" tickets for one service).
   */
  static async callNext(serviceId, staffId) {
    const alreadyActive = await Ticket.findOne({
      service: serviceId,
      status: { $in: ['called', 'serving'] },
    });
    if (alreadyActive) {
      throw new ApiError(
        `Ticket ${alreadyActive.ticketNumber} is already ${alreadyActive.status}. Mark it done or skip it before calling the next one.`,
        409
      );
    }

    const ticket = await Ticket.findOneAndUpdate(
      { service: serviceId, status: 'waiting' },
      { status: 'called', calledAt: new Date(), servedBy: staffId },
      { sort: { position: 1 }, new: true }
    ).populate('service');

    if (!ticket) {
      throw new ApiError('No waiting tickets in the queue', 404);
    }

    const business = await Service.db.model('Business').findById(ticket.business).select('name');

    await NotificationService.send({
      recipient: ticket.customer,
      guestEmail: ticket.guestInfo && ticket.guestInfo.email,
      guestPhone: ticket.guestInfo && ticket.guestInfo.phone,
      type: 'called',
      title: 'You\u2019re being called!',
      body: `Ticket ${ticket.ticketNumber} — please proceed to the counter now.`,
      data: {
        ticketId: ticket._id,
        ticketNumber: ticket.ticketNumber,
        serviceName: ticket.service ? ticket.service.name : '',
        businessName: business ? business.name : '',
        ticketUrl: ticket.shareableLink || '#',
      },
      channels: ['email', 'sms', 'inApp'],
    });

    safeEmit(({ emitTicketUpdate, emitQueueUpdate }) => {
      emitTicketUpdate(ticket._id, 'ticket:called', {
        ticketId: ticket._id,
        ticketNumber: ticket.ticketNumber,
        status: ticket.status,
      });
      buildQueueSnapshot(serviceId).then((snapshot) => {
        if (snapshot) emitQueueUpdate(serviceId, snapshot);
      });
    });

    return ticket;
  }

  static async serve(ticketId) {
    const ticket = await Ticket.findById(ticketId);
    if (!ticket) throw new ApiError('Ticket not found', 404);
    if (ticket.status !== 'called') throw new ApiError('Ticket must be called before serving', 400);

    ticket.status = 'serving';
    ticket.servingStartAt = new Date();
    await ticket.save();

    safeEmit(({ emitTicketUpdate }) => {
      emitTicketUpdate(ticket._id, 'ticket:status', { ticketId: ticket._id, status: ticket.status });
    });

    return ticket;
  }

  /**
   * Marks a ticket as fully served. Computes both the true wait time
   * (join -> called) and the serve duration (serving -> completed)
   * separately — the previous implementation only computed serve
   * duration but mislabeled it as `actualWaitTime`.
   */
  static async markServed(ticketId) {
    const ticket = await Ticket.findById(ticketId).populate('service');
    if (!ticket) throw new ApiError('Ticket not found', 404);
    if (ticket.status !== 'serving') throw new ApiError('Ticket must be serving before marking as served', 400);

    ticket.status = 'served';
    ticket.completedAt = new Date();
    ticket.actualWaitTime = ticket.calledAt
      ? Math.round((ticket.calledAt - ticket.joinedAt) / 60000)
      : undefined;
    ticket.actualServeTime = ticket.servingStartAt
      ? Math.round((ticket.completedAt - ticket.servingStartAt) / 60000)
      : 0;
    await ticket.save();

    const service = ticket.service;
    service.currentQueueCount = Math.max(0, service.currentQueueCount - 1);
    await PredictionService.updateModel(service, ticket.actualServeTime, ticket.completedAt);

    // totalServed is a Business-level counter, not a Service field — increment
    // it atomically rather than as part of the Service document save above.
    await Service.db.model('Business').updateOne(
      { _id: ticket.business },
      { $inc: { totalServed: 1 } }
    );

    // Decrement positions of remaining waiting tickets and notify them of
    // their new position/estimated wait in real time.
    await decrementPositionsAndNotify(service._id, ticket.position, service);

    await AnalyticsService.log({
      business: ticket.business,
      branch: ticket.branch,
      service: service._id,
      eventType: 'serve',
      waitTime: ticket.actualWaitTime,
      serveTime: ticket.actualServeTime,
      isGuest: !ticket.customer,
      ticketType: ticket.type,
    });

    safeEmit(({ emitTicketUpdate, emitQueueUpdate }) => {
      emitTicketUpdate(ticket._id, 'ticket:status', { ticketId: ticket._id, status: ticket.status });
      buildQueueSnapshot(service._id).then((snapshot) => {
        if (snapshot) emitQueueUpdate(service._id, snapshot);
      });
    });

    return ticket;
  }

  /**
   * Skips, cancels, or marks a ticket as no-show.
   * @param {string} ticketId
   * @param {string} status - 'skipped' | 'cancelled' | 'no_show'
   * @param {object|null} [ownership] - Pass this to enforce that the caller
   *   actually owns the ticket (Audit C4). Required whenever a customer/guest
   *   (not staff) is cancelling their own ticket:
   *     { userId } for a logged-in customer, or
   *     { deviceFingerprint } for a guest.
   *   Staff/manager/owner/admin callers are authorized by the controller
   *   (role + business match) and should omit this parameter (pass null).
   */
  static async skipOrCancel(ticketId, status, ownership = null) {
    const ticket = await Ticket.findById(ticketId).populate('service');
    if (!ticket) throw new ApiError('Ticket not found', 404);

    if (['served', 'cancelled', 'no_show', 'skipped'].includes(ticket.status)) {
      throw new ApiError(`Ticket is already ${ticket.status}`, 400);
    }

    // Ownership enforcement for customer/guest-initiated cancellation (Audit C4).
    if (ownership) {
      const isOwner =
        (ticket.customer && ownership.userId && ticket.customer.toString() === ownership.userId.toString()) ||
        (!ticket.customer && ownership.deviceFingerprint && ticket.deviceFingerprint === ownership.deviceFingerprint);

      if (!isOwner) {
        throw new ApiError('You are not authorized to cancel this ticket', 403);
      }
    }

    const oldPosition = ticket.position;
    ticket.status = status;

    ticket.completedAt = new Date();
    await ticket.save();

    const service = ticket.service;
    service.currentQueueCount = Math.max(0, service.currentQueueCount - 1);
    await service.save();

    // Decrement positions of remaining waiting tickets and notify them of
    // their new position/estimated wait in real time.
    await decrementPositionsAndNotify(service._id, oldPosition, service);

    await AnalyticsService.log({
      business: ticket.business,
      branch: ticket.branch,
      service: service._id,
      eventType: status === 'no_show' ? 'no_show' : status === 'cancelled' ? 'cancel' : 'skip',
      isGuest: !ticket.customer,
      ticketType: ticket.type,
    });

    if (status === 'cancelled') {
      await NotificationService.send({
        recipient: ticket.customer,
        guestEmail: ticket.guestInfo && ticket.guestInfo.email,
        guestPhone: ticket.guestInfo && ticket.guestInfo.phone,
        type: 'ticket_cancelled',
        title: 'Your ticket was cancelled',
        body: `Ticket ${ticket.ticketNumber} has been cancelled.`,
        data: { ticketId: ticket._id },
        channels: ['email', 'inApp'],
      });
    }

    safeEmit(({ emitTicketUpdate, emitQueueUpdate }) => {
      emitTicketUpdate(ticket._id, 'ticket:status', { ticketId: ticket._id, status: ticket.status });
      buildQueueSnapshot(service._id).then((snapshot) => {
        if (snapshot) emitQueueUpdate(service._id, snapshot);
      });
    });

    return ticket;
  }

  /**
   * Returns a live snapshot of a service's queue — used by the public
   * live-queue page and the business queue-manager dashboard.
   */
  static async getLiveQueueState(serviceId) {
    const snapshot = await buildQueueSnapshot(serviceId);
    if (!snapshot) throw new ApiError('Service not found', 404);
    return snapshot;
  }
}

module.exports = QueueService;
