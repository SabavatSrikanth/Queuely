/**
 * Standardized API response wrapper
 */
class ApiResponse {
  constructor(statusCode, data, message = 'Success', pagination = null) {
    this.success = statusCode < 400;
    this.statusCode = statusCode;
    this.message = message;
    this.data = data;
    if (pagination) this.pagination = pagination;
  }
}

module.exports = ApiResponse;
