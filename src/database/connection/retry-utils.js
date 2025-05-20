/**
 * Retry Utility for Serverless Database Operations
 * 
 * Provides utility functions for implementing retry logic with exponential backoff
 * for database operations in serverless environments.
 */

const { logger } = require('../../utils/logger');

// Default retry configuration
const DEFAULT_RETRY_CONFIG = {
  maxRetries: 5,
  initialDelay: 100, // ms
  maxDelay: 10000, // ms
  factor: 2,
  retryableErrors: [
    'ECONNRESET', 
    'PROTOCOL_CONNECTION_LOST', 
    'ECONNREFUSED',
    'ETIMEDOUT',
    'ER_LOCK_DEADLOCK',
    'ER_LOCK_TIMEOUT',
    'ER_TOO_MANY_CONNECTIONS'
  ]
};

/**
 * Check if an error is retryable based on configuration
 * 
 * @param {Error} error - The error to check
 * @param {Object} config - Retry configuration
 * @returns {boolean} Whether the error is retryable
 */
function isRetryableError(error, config = DEFAULT_RETRY_CONFIG) {
  if (!error) return false;
  
  // Check error code against list of retryable errors
  if (error.code && config.retryableErrors.includes(error.code)) {
    return true;
  }
  
  // Check error message for known transient error patterns
  if (error.message) {
    const errorMsg = error.message.toLowerCase();
    if (
      errorMsg.includes('deadlock') ||
      errorMsg.includes('timeout') ||
      errorMsg.includes('connection') ||
      errorMsg.includes('reset') ||
      errorMsg.includes('too many connections')
    ) {
      return true;
    }
  }
  
  return false;
}

/**
 * Calculate backoff delay using exponential strategy
 * 
 * @param {number} retryCount - Current retry attempt number
 * @param {Object} config - Retry configuration
 * @returns {number} Delay in milliseconds before next retry
 */
function calculateBackoff(retryCount, config = DEFAULT_RETRY_CONFIG) {
  // Calculate exponential backoff with jitter
  const exponentialDelay = Math.min(
    config.initialDelay * Math.pow(config.factor, retryCount),
    config.maxDelay
  );
  
  // Add jitter (±10%) to prevent synchronized retries
  const jitter = 0.1;
  const jitterRange = exponentialDelay * jitter;
  const jitterAmount = Math.random() * jitterRange * 2 - jitterRange;
  
  return Math.max(0, Math.floor(exponentialDelay + jitterAmount));
}

/**
 * Execute an async function with retry logic and exponential backoff
 * 
 * @param {Function} fn - Async function to execute
 * @param {Object} config - Retry configuration
 * @returns {Promise<*>} Results of the function execution
 */
async function withRetry(fn, config = DEFAULT_RETRY_CONFIG) {
  const retryConfig = { ...DEFAULT_RETRY_CONFIG, ...config };
  let retryCount = 0;
  
  while (true) {
    try {
      return await fn();
    } catch (error) {
      // Check if we should retry this error
      if (!isRetryableError(error, retryConfig) || retryCount >= retryConfig.maxRetries) {
        // Don't retry - either not a retryable error or exceeded max retries
        logger.error('Operation failed, not retrying', {
          error,
          retryCount,
          maxRetries: retryConfig.maxRetries
        });
        throw error;
      }
      
      // Increment retry counter
      retryCount++;
      
      // Calculate backoff delay
      const delay = calculateBackoff(retryCount, retryConfig);
      
      // Log retry attempt
      logger.warn(`Operation failed, retrying in ${delay}ms (${retryCount}/${retryConfig.maxRetries})`, {
        error: error.message,
        errorCode: error.code,
        delay,
        retryCount
      });
      
      // Wait before retrying
      await new Promise(resolve => setTimeout(resolve, delay));
    }
  }
}

/**
 * Creates a retryable version of an async function
 * 
 * @param {Function} fn - Original function to make retryable
 * @param {Object} config - Retry configuration
 * @returns {Function} Wrapped function with retry logic
 */
function makeRetryable(fn, config = DEFAULT_RETRY_CONFIG) {
  return async (...args) => {
    return withRetry(() => fn(...args), config);
  };
}

module.exports = {
  withRetry,
  makeRetryable,
  isRetryableError,
  calculateBackoff,
  DEFAULT_RETRY_CONFIG
};
