const express = require('express');
const { getBranches, getBranch, createBranch, updateBranch, deleteBranch, toggleBranchStatus } = require('../controllers/branch.controller');
const { protect, authorize } = require('../middleware/auth.middleware');

const router = express.Router({ mergeParams: true });

router.route('/')
  .get(getBranches)
  .post(protect, authorize('business_owner', 'super_admin'), createBranch);

router.route('/:id')
  .get(getBranch)
  .put(protect, authorize('business_owner', 'branch_manager', 'super_admin'), updateBranch)
  .delete(protect, authorize('business_owner', 'super_admin'), deleteBranch);

router.put('/:id/toggle', protect, authorize('business_owner', 'branch_manager', 'super_admin'), toggleBranchStatus);

module.exports = router;
