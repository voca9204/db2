/**
 * 로그 유틸리티 모듈
 */

const colors = require('colors/safe');

// 로그 레벨
const LOG_LEVELS = {
  DEBUG: 0,
  INFO: 1,
  WARN: 2,
  ERROR: 3,
  SILENT: 4
};

// 기본 설정
let logConfig = {
  level: LOG_LEVELS.INFO,
  colors: true
};

/**
 * 로거 설정
 * @param {Object} options 로거 옵션
 */
function setupLogger(options = {}) {
  if (options.verbose) {
    logConfig.level = LOG_LEVELS.DEBUG;
  } else if (options.silent) {
    logConfig.level = LOG_LEVELS.SILENT;
  }
  
  if (options.colors !== undefined) {
    logConfig.colors = options.colors;
  }
}

/**
 * 로그 함수
 */
const log = {
  debug: (msg) => {
    if (logConfig.level <= LOG_LEVELS.DEBUG) {
      console.log(logConfig.colors ? colors.gray(`[DEBUG] ${msg}`) : `[DEBUG] ${msg}`);
    }
  },
  
  info: (msg) => {
    if (logConfig.level <= LOG_LEVELS.INFO) {
      console.log(logConfig.colors ? colors.cyan(`[INFO] ${msg}`) : `[INFO] ${msg}`);
    }
  },
  
  warn: (msg) => {
    if (logConfig.level <= LOG_LEVELS.WARN) {
      console.log(logConfig.colors ? colors.yellow(`[WARN] ${msg}`) : `[WARN] ${msg}`);
    }
  },
  
  error: (msg) => {
    if (logConfig.level <= LOG_LEVELS.ERROR) {
      console.log(logConfig.colors ? colors.red(`[ERROR] ${msg}`) : `[ERROR] ${msg}`);
    }
  },
  
  success: (msg) => {
    if (logConfig.level <= LOG_LEVELS.INFO) {
      console.log(logConfig.colors ? colors.green(`[SUCCESS] ${msg}`) : `[SUCCESS] ${msg}`);
    }
  }
};

module.exports = {
  setupLogger,
  log,
  LOG_LEVELS
};