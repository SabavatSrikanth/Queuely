const express = require('express');
const { getServices, getService, createService, updateService, deleteService, toggleQueue, toggleAppointments, getPrediction } = require('../controllers/service.controller');
const { protect, authorize } = require('../middleware/auth.middleware');

const router = express.Router({ mergeParams: true });

router.route('/')
  .get(getServices)
  .post(protect, authorize('business_owner', 'branch_manager', 'super_admin'), createService);

router.route('/:id')
  .get(getService)
  .put(protect, authorize('business_owner', 'branch_manager', 'super_admin'), updateService)
  .delete(protect, authorize('business_owner', 'super_admin'), deleteService);

router.put('/:id/toggle-queue', protect, authorize('business_owner', 'branch_manager', 'staff', 'super_admin'), toggleQueue);
router.put('/:id/toggle-appointments', protect, authorize('business_owner', 'branch_manager', 'super_admin'), toggleAppointments);
router.get('/:id/prediction', getPrediction);

module.exports = router;
