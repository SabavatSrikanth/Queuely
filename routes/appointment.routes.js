const express = require('express');
const { getAvailableSlots, bookAppointment, getMyAppointments, getAppointment, confirmAppointment, cancelAppointment, checkInAppointment, completeAppointment, getBusinessAppointments } = require('../controllers/appointment.controller');
const { protect, authorize, attachUser } = require('../middleware/auth.middleware');

const router = express.Router();

router.get('/slots/:serviceId', getAvailableSlots);
router.post('/book/:serviceId', attachUser, bookAppointment); // Open to guests; attachUser attributes it to a logged-in customer when present

router.get('/my', protect, authorize('customer'), getMyAppointments);
router.get('/business/:id', protect, authorize('business_owner', 'branch_manager', 'staff', 'super_admin'), getBusinessAppointments);
router.get('/:id', protect, getAppointment);

router.put('/:id/confirm', protect, authorize('business_owner', 'branch_manager', 'staff', 'super_admin'), confirmAppointment);
router.put('/:id/cancel', protect, cancelAppointment);
router.put('/:id/check-in', protect, authorize('business_owner', 'branch_manager', 'staff', 'super_admin'), checkInAppointment);
router.put('/:id/complete', protect, authorize('business_owner', 'branch_manager', 'staff', 'super_admin'), completeAppointment);

module.exports = router;
