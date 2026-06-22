const express = require('express');
const { getUsers, updateUserStatus, getBusinesses, verifyBusiness, suspendBusiness, unsuspendBusiness, getAuditLogs } = require('../controllers/admin.controller');

const { protect, authorize } = require('../middleware/auth.middleware');

const router = express.Router();

router.use(protect);
router.use(authorize('super_admin'));

router.get('/users', getUsers);
router.put('/users/:id/status', updateUserStatus);

router.get('/businesses', getBusinesses);
router.put('/businesses/:id/verify', verifyBusiness);
router.put('/businesses/:id/suspend', suspendBusiness);
router.put('/businesses/:id/suspend', suspendBusiness);
router.put('/businesses/:id/unsuspend', unsuspendBusiness);
router.get('/audit-logs', getAuditLogs);

module.exports = router;
