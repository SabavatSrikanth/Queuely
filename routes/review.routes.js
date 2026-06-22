const express = require('express');
const { getBusinessReviews, createReview, deleteReview } = require('../controllers/review.controller');
const { protect, authorize } = require('../middleware/auth.middleware');

const router = express.Router();

router.get('/business/:id', getBusinessReviews);
router.post('/ticket/:ticketId', protect, authorize('customer'), createReview);
router.delete('/:id', protect, authorize('super_admin'), deleteReview);

module.exports = router;
