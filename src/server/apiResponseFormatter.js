/**
 * API Response Formatter - Standardizes all API responses
 * Ensures consistent format across all endpoints
 */

/**
 * Error codes for structured error responses
 */
export const ErrorCodes = {
  // Validation errors (4xx)
  INVALID_REQUEST: 'INVALID_REQUEST',
  MISSING_PARAMETER: 'MISSING_PARAMETER',
  INVALID_PARAMETER: 'INVALID_PARAMETER',
  
  // Resource errors (4xx)
  NOT_FOUND: 'NOT_FOUND',
  RESOURCE_NOT_FOUND: 'RESOURCE_NOT_FOUND',
  LAW_NOT_FOUND: 'LAW_NOT_FOUND',
  EVENT_NOT_FOUND: 'EVENT_NOT_FOUND',
  IMPROVEMENT_NOT_FOUND: 'IMPROVEMENT_NOT_FOUND',
  EMPIRE_NOT_FOUND: 'EMPIRE_NOT_FOUND',
  
  // Game logic errors (4xx)
  INSUFFICIENT_RESOURCES: 'INSUFFICIENT_RESOURCES',
  INSUFFICIENT_INFLUENCE: 'INSUFFICIENT_INFLUENCE',
  INSUFFICIENT_SUPPLY: 'INSUFFICIENT_SUPPLY',
  INSUFFICIENT_CREDITS: 'INSUFFICIENT_CREDITS',
  LAW_ALREADY_ENACTED: 'LAW_ALREADY_ENACTED',
  LAW_ON_COOLDOWN: 'LAW_ON_COOLDOWN',
  GAME_OVER: 'GAME_OVER',
  INVALID_GAME_STATE: 'INVALID_GAME_STATE',
  
  // Business logic errors (4xx)
  INVALID_ACTION: 'INVALID_ACTION',
  ACTION_NOT_ALLOWED: 'ACTION_NOT_ALLOWED',
  ACTION_INVALID_STATE: 'ACTION_INVALID_STATE',
  
  // Server errors (5xx)
  INTERNAL_SERVER_ERROR: 'INTERNAL_SERVER_ERROR',
  DATABASE_ERROR: 'DATABASE_ERROR',
  UNKNOWN_ERROR: 'UNKNOWN_ERROR'
};

/**
 * HTTP status codes for error codes
 */
export const ErrorCodeToStatus = {
  [ErrorCodes.INVALID_REQUEST]: 400,
  [ErrorCodes.MISSING_PARAMETER]: 400,
  [ErrorCodes.INVALID_PARAMETER]: 400,
  [ErrorCodes.NOT_FOUND]: 404,
  [ErrorCodes.RESOURCE_NOT_FOUND]: 404,
  [ErrorCodes.LAW_NOT_FOUND]: 404,
  [ErrorCodes.EVENT_NOT_FOUND]: 404,
  [ErrorCodes.IMPROVEMENT_NOT_FOUND]: 404,
  [ErrorCodes.EMPIRE_NOT_FOUND]: 404,
  [ErrorCodes.INSUFFICIENT_RESOURCES]: 400,
  [ErrorCodes.INSUFFICIENT_INFLUENCE]: 400,
  [ErrorCodes.INSUFFICIENT_SUPPLY]: 400,
  [ErrorCodes.INSUFFICIENT_CREDITS]: 400,
  [ErrorCodes.LAW_ALREADY_ENACTED]: 400,
  [ErrorCodes.LAW_ON_COOLDOWN]: 400,
  [ErrorCodes.GAME_OVER]: 400,
  [ErrorCodes.INVALID_GAME_STATE]: 400,
  [ErrorCodes.INVALID_ACTION]: 400,
  [ErrorCodes.ACTION_NOT_ALLOWED]: 403,
  [ErrorCodes.ACTION_INVALID_STATE]: 400,
  [ErrorCodes.INTERNAL_SERVER_ERROR]: 500,
  [ErrorCodes.DATABASE_ERROR]: 500,
  [ErrorCodes.UNKNOWN_ERROR]: 500
};

/**
 * Format a success response
 * @param {*} data - The response data
 * @param {Object} options - Additional options (notification, turn, etc)
 * @returns {Object} Formatted response
 */
export function formatSuccess(data, options = {}) {
  return {
    success: true,
    data,
    ...(options.notification && { notification: options.notification }),
    ...(options.turn !== undefined && { turn: options.turn }),
    timestamp: Date.now()
  };
}

/**
 * Format an error response
 * @param {string} errorCode - Error code constant
 * @param {string} message - Human-readable error message
 * @param {Object} details - Additional error details
 * @returns {Object} Formatted error response
 */
export function formatError(errorCode, message, details = {}) {
  return {
    success: false,
    error: {
      code: errorCode,
      message,
      ...(Object.keys(details).length > 0 && { details })
    },
    timestamp: Date.now()
  };
}

/**
 * Express middleware for sending formatted responses
 * Adds response helper methods
 */
export function apiResponseMiddleware(req, res, next) {
  // Add helper method for success responses
  res.sendSuccess = function(data, options = {}) {
    const statusCode = options.statusCode || 200;
    return this.status(statusCode).json(formatSuccess(data, options));
  };

  // Add helper method for error responses
  res.sendError = function(errorCode, message, details = {}, statusCode = null) {
    const status = statusCode || ErrorCodeToStatus[errorCode] || 500;
    return this.status(status).json(formatError(errorCode, message, details));
  };

  next();
}

/**
 * Helper function to create error objects with context
 */
export function createGameError(code, message, context = {}) {
  const error = new Error(message);
  error.code = code;
  error.context = context;
  return error;
}
