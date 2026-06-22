const { validationResult } = require('express-validator');
const ApiError = require('../utils/ApiError');

/**
 * validate — runs after an array of express-validator check(...) rules.
 * Collects any validation errors and rejects the request with a single
 * 400 ApiError listing all of them, instead of letting bad input reach
 * the controller.
 */
const validate = (req, res, next) => {
  const errors = validationResult(req);

  if (!errors.isEmpty()) {
    const messages = errors.array().map((e) => e.msg);
    return next(new ApiError(messages.join(', '), 400, errors.array()));
  }

  next();
};

module.exports = validate;
