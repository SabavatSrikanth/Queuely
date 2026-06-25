const express = require('express');
const { getUsers, getUser, updateUser, deleteUser, inviteStaff, getStaff, removeStaff } = require('../controllers/user.controller');
const { protect, authorize } = require('../middleware/auth.middleware');

const router = express.Router();

router.use(protect);

router.route('/')
  .get(authorize('super_admin'), getUsers);

router.get('/staff', authorize('business_owner'), getStaff);
router.post('/staff/invite', authorize('business_owner'), inviteStaff);
router.delete('/staff/:id', authorize('business_owner'), removeStaff);

router.route('/:id')
  .get(getUser)
  .put(updateUser)
  .delete(deleteUser);

module.exports = router;