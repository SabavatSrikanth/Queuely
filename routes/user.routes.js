const express = require('express');
const { getUsers, getUser, updateUser, deleteUser } = require('../controllers/user.controller');
const { protect, authorize } = require('../middleware/auth.middleware');

const router = express.Router();

router.use(protect); // All routes below require auth

router.route('/')
  .get(authorize('super_admin'), getUsers); // Only super_admin can get all users here

router.route('/:id')
  .get(getUser)
  .put(updateUser)
  .delete(deleteUser);

module.exports = router;
