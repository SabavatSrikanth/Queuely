const express = require('express');
const { getBusinesses, getBusinessBySlug, getBusinessById, createBusiness, updateBusiness, deleteBusiness } = require('../controllers/business.controller');
const { protect, authorize } = require('../middleware/auth.middleware');

const router = express.Router();

router.route('/')
  .get(getBusinesses)
  .post(protect, createBusiness);

// Slug lookup (public, customer-facing pages use this)
router.route('/slug/:slug')
  .get(getBusinessBySlug);

router.route('/:id')
  .get(getBusinessById)
  .put(protect, authorize('business_owner', 'super_admin'), updateBusiness)
  .delete(protect, authorize('business_owner', 'super_admin'), deleteBusiness);

module.exports = router;
