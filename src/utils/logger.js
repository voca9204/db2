/**
 * Logging Utility for Serverless Environment
 * 
 * Provides a centralized logging mechanism optimized for serverless 
 * applications with Firebase Functions.
 */

// Configure log levels based on environment
const LOG_LEVELS = {
  ERROR: 0,
  WARN: 1,
  INFO: 2,
  DEBUG: 3
};

// Default to INFO level in production, DEBUG in development
const DEFAULT_LOG_LEVEL = process.env.NODE_ENV === 'production' 
  ? LOG_LEVELS.INFO 
  : LOG_LEVELS.DEBUG;

// Get configured log level or use default
const CURRENT_LOG_LEVEL = (() => {
  const configLevel = process.env.LOG_LEVEL;
  if (!configLevel) return DEFAULT_LOG_LEVEL;
  
  const level = LOG_LEVELS[configLevel.toUpperCase()];
  return level !== undefined ? level : DEFAULT_LOG_LEVEL;
})();

/**
 * Format log message with metadata
 * 
 * @param {string} level - Log level
 * @param {string} message - Log message
 * @param {Object} meta - Additional metadata
 * @returns {Object} Formatted log object
 */
function formatLog(level, message, meta = {}) {
  return {
    timestamp: new Date().toISOString(),
    level,
    message,
    environment: process.env.NODE_ENV || 'development',
    function: process.env.FUNCTION_TARGET || 'local',
    ...meta
  };
}

/**
 * Logger instance with methods for each log level
 */
const logger = {
  /**
   * Log error message
   * 
   * @param {string} message - Error message
   * @param {Object} meta - Additional metadata
   */
  error: (message, meta = {}) => {
    if (CURRENT_LOG_LEVEL >= LOG_LEVELS.ERROR) {
      // Handle Error objects specially
      if (meta.error instanceof Error) {
        meta.errorMessage = meta.error.message;
        meta.errorStack = meta.error.stack;
        meta.errorName = meta.error.name;
        meta.errorCode = meta.error.code;
        
        // Remove circular reference to the error object
        const { error, ...metaWithoutError } = meta;
        meta = metaWithoutError;
      }
      
      console.error(JSON.stringify(formatLog('ERROR', message, meta)));
    }
  },
  
  /**
   * Log warning message
   * 
   * @param {string} message - Warning message
   * @param {Object} meta - Additional metadata
   */
  warn: (message, meta = {}) => {
    if (CURRENT_LOG_LEVEL >= LOG_LEVELS.WARN) {
      console.warn(JSON.stringify(formatLog('WARN', message, meta)));
    }
  },
  
  /**
   * Log info message
   * 
   * @param {string} message - Info message
   * @param {Object} meta - Additional metadata
   */
  info: (message, meta = {}) => {
    if (CURRENT_LOG_LEVEL >= LOG_LEVELS.INFO) {
      console.info(JSON.stringify(formatLog('INFO', message, meta)));
    }
  },
  
  /**
   * Log debug message
   * 
   * @param {string} message - Debug message
   * @param {Object} meta - Additional metadata
   */
  debug: (message, meta = {}) => {
    if (CURRENT_LOG_LEVEL >= LOG_LEVELS.DEBUG) {
      console.debug(JSON.stringify(formatLog('DEBUG', message, meta)));
    }
  },
  
  /**
   * Create a child logger with additional context
   * 
   * @param {Object} context - Additional context to include in all logs
   * @returns {Object} Child logger
   */
  child: (context = {}) => {
    return {
      error: (message, meta = {}) => logger.error(message, { ...context, ...meta }),
      warn: (message, meta = {}) => logger.warn(message, { ...context, ...meta }),
      info: (message, meta = {}) => logger.info(message, { ...context, ...meta }),
      debug: (message, meta = {}) => logger.debug(message, { ...context, ...meta }),
    };
  }
};

module.exports = { logger, LOG_LEVELS };
