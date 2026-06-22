const { v4: uuidv4 } = require('uuid');

const requestIdMiddleware = (req, res, next) => {
  if (req.headers['x-request-id']) {
    req.id = req.headers['x-request-id'];
  } else {
    req.id = uuidv4();
  }
  
  res.setHeader('X-Request-Id', req.id);
  next();
};

module.exports = requestIdMiddleware;
