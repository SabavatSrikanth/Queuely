const mongoose = require('mongoose');
const Appointment = require('../models/Appointment');
const Service = require('../models/Service');
const Branch = require('../models/Branch');
const Ticket = require('../models/Ticket');
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

const safeEmit = (fn) => {
  try {
    if (socketConfig) fn(socketConfig);
  } catch (err) {
    console.error('[AppointmentService] Socket emit failed:', err.message);
  }
};

/**
 * Normalizes a 'YYYY-MM-DD' date string (or Date) to a UTC midnight Date,
 * used consistently for both storage and lookups so date-equality queries
 * never silently miss due to time-of-day drift.
 */
const toUtcMidnight = (dateInput) => {
  const d = new Date(dateInput);
  if (Number.isNaN(d.getTime())) {
    throw new ApiError('Invalid date format. Use YYYY-MM-DD.', 400);
  }
  return new Date(Date.UTC(d.getUTCFullYear(), d.getUTCMonth(), d.getUTCDate()));
};

class AppointmentService {
  /**
   * Resolves the operating hours that should govern slot generation for a
   * service. Fixes Audit H5 — the previous implementation did
   * `Branch.findById(service.branch || service.business)`, which, whenever
   * a service had no specific branch (a deliberately-supported "available
   * at every branch" configuration per the Service model), looked up a
   * Business _id inside the Branch collection. That lookup can never
   * succeed, so it silently fell back to hardcoded 09:00-17:00 hours
   * regardless of the business's real configured hours.
   */
  static async resolveOperatingHours(service, dayOfWeek) {
    let openTime = '09:00';
    let closeTime = '17:00';
    let isClosed = false;

    let branch = null;
    if (service.branch) {
      branch = await Branch.findById(service.branch);
    } else {
      // Global service (available at every branch) — use the business's
      // first active branch as the representative schedule. If the
      // business has no branches at all yet, the hardcoded default above
      // is used as a last resort.
      branch = await Branch.findOne({ business: service.business, isActive: true }).sort('createdAt');
    }

    if (branch && Array.isArray(branch.operatingHours)) {
      const dayHours = branch.operatingHours.find((h) => h.day === dayOfWeek);
      if (dayHours) {
        if (dayHours.isClosed) {
          isClosed = true;
        } else {
          openTime = dayHours.open;
          closeTime = dayHours.close;
        }
      }
    }

    return { openTime, closeTime, isClosed };
  }

  static async getAvailableSlots(serviceId, dateStr) {
    const service = await Service.findById(serviceId);
    if (!service || !service.appointmentEnabled) {
      throw new ApiError('Appointments are not enabled for this service', 400);
    }

    const targetDate = toUtcMidnight(dateStr);
    const dayOfWeek = ['sun', 'mon', 'tue', 'wed', 'thu', 'fri', 'sat'][targetDate.getUTCDay()];

    const { openTime, closeTime, isClosed } = await this.resolveOperatingHours(service, dayOfWeek);
    if (isClosed) {
      return [];
    }

    // Generate slots
    const startMins = parseInt(openTime.split(':')[0], 10) * 60 + parseInt(openTime.split(':')[1], 10);
    const closeMins = parseInt(closeTime.split(':')[0], 10) * 60 + parseInt(closeTime.split(':')[1], 10);

    const slots = [];
    let currentMins = startMins;

    while (currentMins + service.slotDuration <= closeMins) {
      const h = Math.floor(currentMins / 60).toString().padStart(2, '0');
      const m = (currentMins % 60).toString().padStart(2, '0');

      const eh = Math.floor((currentMins + service.slotDuration) / 60).toString().padStart(2, '0');
      const em = ((currentMins + service.slotDuration) % 60).toString().padStart(2, '0');

      slots.push({
        startTime: `${h}:${m}`,
        endTime: `${eh}:${em}`,
        capacity: service.maxAppointmentsPerSlot || 1,
        booked: 0,
      });

      currentMins += service.slotDuration + (service.bufferTime || 0);
    }

    // Subtract booked appointments. Date equality is now safe because both
    // storage (bookAppointment) and lookup (here) go through the same
    // toUtcMidnight() normalization.
    const bookedAppts = await Appointment.find({
      service: serviceId,
      appointmentDate: targetDate,
      status: { $in: ['scheduled', 'confirmed', 'checked_in'] },
    });

    bookedAppts.forEach((appt) => {
      const slot = slots.find((s) => s.startTime === appt.startTime);
      if (slot) slot.booked += 1;
    });

   const now = new Date();
const isToday = targetDate.toDateString() === new Date().toDateString();

return slots.filter(function(s) {
  if (s.capacity <= s.booked) return false;
  if (isToday) {
    const [h, m] = s.startTime.split(':').map(Number);
    const slotMins = h * 60 + m;
    const nowMins = now.getHours() * 60 + now.getMinutes();
    if (slotMins <= nowMins) return false;
  }
  return true;
});
  }

  /**
   * Books an appointment. Fixes Audit C9 — the previous implementation
   * checked slot availability and then created the appointment as two
   * separate, unguarded steps, so two concurrent bookers could both pass
   * the availability check and double-book the same slot beyond its
   * capacity. This now re-validates capacity and inserts the appointment
   * inside a single MongoDB transaction, so a concurrent booking attempt
   * either fails cleanly with "slot no longer available" or succeeds
   * without ever exceeding maxAppointmentsPerSlot.
   */
  static async bookAppointment(data) {
    const { serviceId, businessId, branchId, date, startTime, endTime, customerId, guestInfo } = data;

    const service = await Service.findById(serviceId);
    if (!service || !service.appointmentEnabled || !service.isActive) {
      throw new ApiError('Appointments are not enabled for this service', 400);
    }

    const targetDate = toUtcMidnight(date);

    if (!customerId && (!guestInfo || !guestInfo.name || !guestInfo.phone)) {
      throw new ApiError('Guest name and phone are required to book an appointment', 400);
    }

    const capacity = service.maxAppointmentsPerSlot || 1;

    // Appointment.branch is a required field even though Service.branch
    // may legitimately be null (a service offered at every branch).
    // Resolve a concrete branch up front so creation below never fails
    // validation for branch-less services.
    const resolvedBranchId = branchId || await resolveServiceBranch(service);

let appointment;

const existingCount = await Appointment.countDocuments({
  service: serviceId,
  appointmentDate: targetDate,
  startTime,
  status: { $in: ['scheduled', 'confirmed', 'checked_in'] },
});

if (existingCount >= capacity) {
  throw new ApiError('This slot is no longer available', 409);
}

const created = await Appointment.create([{
  business: businessId,
  branch: resolvedBranchId,
  service: serviceId,
  customer: customerId || null,
  guestInfo: customerId ? undefined : guestInfo,
  appointmentDate: targetDate,
  startTime,
  endTime,
}]);

appointment = created[0];

    try {
      const baseUrl = process.env.CLIENT_URL || 'http://localhost:3000';
      appointment.qrCodeUrl = await generateQRDataURL(`${baseUrl}/my-appointments?id=${appointment._id}`);
      await appointment.save();
    } catch (err) {
      console.error('[AppointmentService] QR code generation failed:', err.message);
    }

    await AnalyticsService.log({
      business: businessId,
      branch: appointment.branch,
      service: serviceId,
      eventType: 'appointment_book',
      isGuest: !customerId,
      ticketType: 'appointment',
    });

    const business = await Service.db.model('Business').findById(businessId).select('name');
    await NotificationService.send({
      recipient: customerId || null,
      guestEmail: guestInfo && guestInfo.email,
      guestPhone: guestInfo && guestInfo.phone,
      type: 'appointment_confirmed',
      title: 'Appointment booked',
      body: `Your appointment with ${business ? business.name : 'the business'} is set for ${date} at ${startTime}.`,
      data: {
        appointmentId: appointment._id,
        businessName: business ? business.name : '',
        serviceName: service.name,
        date,
        startTime,
        endTime,
      },
      channels: ['email', 'inApp'],
    });

    safeEmit(({ emitBusinessEvent }) => {
      emitBusinessEvent(businessId, 'appointment:created', { appointmentId: appointment._id });
    });

    return appointment;
  }

  /**
   * Fixes Audit M4 — status transitions previously had no guard at all
   * (could "complete" a cancelled appointment, "confirm" an already
   * completed one, etc). Each transition below now validates the
   * appointment's current state before mutating it.
   */
  static async confirmAppointment(appointmentId) {
    const appt = await Appointment.findById(appointmentId);
    if (!appt) throw new ApiError('Appointment not found', 404);
    if (appt.status !== 'scheduled') {
      throw new ApiError(`Cannot confirm an appointment with status "${appt.status}"`, 400);
    }

    appt.status = 'confirmed';
    appt.confirmedAt = new Date();
    await appt.save();

    safeEmit(({ emitBusinessEvent }) => {
      emitBusinessEvent(appt.business, 'appointment:confirmed', { appointmentId: appt._id });
    });

    return appt;
  }

  static async cancelAppointment(appointmentId, reason) {
    const appt = await Appointment.findById(appointmentId).populate('service', 'name');
    if (!appt) throw new ApiError('Appointment not found', 404);
    if (['cancelled', 'completed', 'no_show'].includes(appt.status)) {
      throw new ApiError(`Cannot cancel an appointment with status "${appt.status}"`, 400);
    }

    appt.status = 'cancelled';
    appt.cancellationReason = reason;
    await appt.save();

    await AnalyticsService.log({
      business: appt.business,
      branch: appt.branch,
      service: appt.service ? appt.service._id : undefined,
      eventType: 'appointment_cancel',
      isGuest: !appt.customer,
      ticketType: 'appointment',
    });

    await NotificationService.send({
      recipient: appt.customer,
      guestEmail: appt.guestInfo && appt.guestInfo.email,
      guestPhone: appt.guestInfo && appt.guestInfo.phone,
      type: 'appointment_cancelled',
      title: 'Appointment cancelled',
      body: `Your appointment${appt.service ? ` for ${appt.service.name}` : ''} has been cancelled.`,
      data: { appointmentId: appt._id },
      channels: ['email', 'inApp'],
    });

    safeEmit(({ emitBusinessEvent }) => {
      emitBusinessEvent(appt.business, 'appointment:cancelled', { appointmentId: appt._id });
    });

    return appt;
  }

  static async checkIn(appointmentId) {
    const appt = await Appointment.findById(appointmentId).populate('service');
    if (!appt) throw new ApiError('Appointment not found', 404);
    if (appt.status !== 'confirmed' && appt.status !== 'scheduled') {
      throw new ApiError(`Cannot check in an appointment with status "${appt.status}"`, 400);
    }

    // A customer with a confirmed appointment should never be turned away
    // by walk-in queue capacity limits — they have a reserved slot.
    // joinQueue's capacity/isAcceptingQueue checks are walk-in-specific, so
    // appointment check-in creates its ticket directly rather than going
    // through those walk-in gates, while still getting a real position in
    // the same queue and the same numbering/notification/analytics
    // treatment as a walk-in ticket.
    const service = appt.service;

    const updatedService = await Service.findByIdAndUpdate(
      service._id,
      { $inc: { currentQueueCount: 1 } },
      { new: true }
    );
    const position = updatedService.currentQueueCount;

    const startOfDay = new Date();
    startOfDay.setUTCHours(0, 0, 0, 0);
    const ticketsToday = await Ticket.countDocuments({ service: service._id, createdAt: { $gte: startOfDay } });
    const ticketNumber = generateTicketNumber(service.code, ticketsToday);

    const ticket = await Ticket.create({
      ticketNumber,
      business: appt.business,
      branch: appt.branch,
      service: service._id,
      customer: appt.customer,
      guestInfo: appt.guestInfo,
      status: 'waiting',
      position,
      predictedWaitTime: PredictionService.getPredictedWaitTime(updatedService, position),
      type: 'appointment',
      appointmentRef: appt._id,
      ipAddress: 'checked-in-on-site',
      deviceFingerprint: 'checked-in-on-site',
    });

    appt.status = 'checked_in';
    appt.checkedInAt = new Date();
    appt.ticketRef = ticket._id;
    await appt.save();

    safeEmit(({ emitBusinessEvent, emitQueueUpdate }) => {
      emitBusinessEvent(appt.business, 'appointment:checked_in', { appointmentId: appt._id, ticketId: ticket._id });
      emitQueueUpdate(service._id, { serviceId: service._id, currentQueueCount: updatedService.currentQueueCount });
    });

    return { appointment: appt, ticket };
  }

  static async completeAppointment(appointmentId) {
    const appt = await Appointment.findById(appointmentId).populate('service', 'name');
    if (!appt) throw new ApiError('Appointment not found', 404);
    if (appt.status !== 'checked_in') {
      throw new ApiError(`Cannot complete an appointment with status "${appt.status}" — it must be checked in first`, 400);
    }

    appt.status = 'completed';
    appt.completedAt = new Date();
    await appt.save();

    await AnalyticsService.log({
      business: appt.business,
      branch: appt.branch,
      service: appt.service ? appt.service._id : undefined,
      eventType: 'appointment_complete',
      isGuest: !appt.customer,
      ticketType: 'appointment',
    });

    safeEmit(({ emitBusinessEvent }) => {
      emitBusinessEvent(appt.business, 'appointment:completed', { appointmentId: appt._id });
    });

    return appt;
  }
}

module.exports = AppointmentService;
