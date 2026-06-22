const Branch = require('../models/Branch');
const ApiError = require('./ApiError');

/**
 * Resolves a concrete Branch ObjectId for a service.
 *
 * Service.branch is allowed to be null by design — it means "this service
 * is offered at every branch of the business" (see models/Service.js).
 * However, Ticket.branch and Appointment.branch are both `required: true`,
 * so creating a ticket/appointment for a branch-less service with a raw
 * `null` branch would fail Mongoose validation. This resolves the
 * business's first active branch as the representative branch to record
 * against in that case.
 *
 * Throws if the service has no branch AND the business has no active
 * branch at all (nothing sensible to fall back to).
 *
 * @param {object} service - a Service document (must have .branch, .business)
 * @returns {Promise<mongoose.Types.ObjectId>}
 */
const resolveServiceBranch = async (service) => {
  if (service.branch) return service.branch;

  const fallback = await Branch.findOne({ business: service.business, isActive: true }).sort('createdAt');
  if (!fallback) {
    throw new ApiError(
      'This service has no specific branch and the business has no active branch configured. Add a branch before accepting bookings.',
      400
    );
  }
  return fallback._id;
};

module.exports = { resolveServiceBranch };
