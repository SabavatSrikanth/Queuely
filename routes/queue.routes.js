const express = require('express');
const { joinQueue, getLiveQueueState, getTicketStatus, callNext, serveTicket, markServed, skipTicket, cancelTicket, markNoShow, getMyTickets } = require('../controllers/queue.controller');
const { protect, authorize, attachUser } = require('../middleware/auth.middleware');

const router = express.Router();

// Public routes
router.post('/join/:serviceId', attachUser, joinQueue); // Public — guests or logged-in customers
router.get('/:serviceId/live', getLiveQueueState);
router.get('/ticket/:ticketId', getTicketStatus);

// Authenticated Customer routes
router.get('/my-tickets', protect, authorize('customer'), getMyTickets);

// Cancel is reachable by guests (who never logged in) as well as customers,
// so it can't require `protect`. attachUser performs *soft* auth — it
// populates req.user when a valid session exists but never blocks the
// request — while the controller/service enforce real ownership before
// any ticket is mutated (fixes Audit C4 — this route previously had zero
// authorization, letting anyone cancel anyone else's ticket).
router.put('/cancel/:ticketId', attachUser, cancelTicket);

// Staff/Manager routes
router.put('/call-next/:serviceId', protect, authorize('staff', 'branch_manager', 'business_owner', 'super_admin'), callNext);
router.put('/serving/:ticketId', protect, authorize('staff', 'branch_manager', 'business_owner', 'super_admin'), serveTicket);
router.put('/served/:ticketId', protect, authorize('staff', 'branch_manager', 'business_owner', 'super_admin'), markServed);
router.put('/skip/:ticketId', protect, authorize('staff', 'branch_manager', 'business_owner', 'super_admin'), skipTicket);
router.put('/no-show/:ticketId', protect, authorize('staff', 'branch_manager', 'business_owner', 'super_admin'), markNoShow);

module.exports = router;
