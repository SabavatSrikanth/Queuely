const express = require('express');
const { body } = require('express-validator');
const {
  register, login, logout, getMe, updatePassword,
  forgotPassword, resetPassword, refreshToken,
  verifyOtp, resendOtp,
} = require('../controllers/auth.controller');
const { protect } = require('../middleware/auth.middleware');
const validate = require('../middleware/validate.middleware');

const router = express.Router();

const registerRules = [
  body('name').trim().isLength({ min: 2, max: 50 }).withMessage('Name must be 2-50 characters'),
  body('email').isEmail().withMessage('Please provide a valid email address').normalizeEmail(),
  body('password').isLength({ min: 8 }).withMessage('Password must be at least 8 characters'),
  body('phone').optional({ checkFalsy: true }).isString(),
  body('role').optional({ checkFalsy: true }).isIn(['customer', 'business_owner'])
    .withMessage('role must be either "customer" or "business_owner"'),
];

const loginRules = [
  body('email').isEmail().withMessage('Please provide a valid email address').normalizeEmail(),
  body('password').notEmpty().withMessage('Password is required'),
];

const otpRules = [
  body('email').isEmail().withMessage('Please provide a valid email address').normalizeEmail(),
  body('otp').notEmpty().withMessage('OTP is required').isLength({ min: 6, max: 6 }).withMessage('OTP must be 6 digits'),
];

router.post('/register', registerRules, validate, register);
router.post('/login', loginRules, validate, login);
router.post('/logout', protect, logout);
router.get('/me', protect, getMe);
router.put('/me/password', protect, updatePassword);
router.post('/refresh', refreshToken);

router.post('/verify-otp', otpRules, validate, verifyOtp);
router.post('/resend-otp', body('email').isEmail().withMessage('Valid email required').normalizeEmail(), validate, resendOtp);

router.post('/forgotpassword', body('email').isEmail().withMessage('Please provide a valid email address'), validate, forgotPassword);
router.put('/resetpassword/:token', body('password').isLength({ min: 8 }).withMessage('Password must be at least 8 characters'), validate, resetPassword);

module.exports = router;