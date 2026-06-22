const express = require('express');
const { getBusinessAnalytics, getHeatmap, getForecast } = require('../controllers/analytics.controller');
const { protect, authorize } = require('../middleware/auth.middleware');

const router = express.Router();

router.use(protect);

router.get('/business/:id', authorize('business_owner', 'super_admin'), getBusinessAnalytics);
router.get('/business/:id/heatmap', authorize('business_owner', 'super_admin'), getHeatmap);
router.get('/business/:id/forecast', authorize('business_owner', 'super_admin'), getForecast);

module.exports = router;
