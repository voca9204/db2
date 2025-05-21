/**
 * 로깅 유틸리티 모듈
 */
const functions = require('firebase-functions');

/**
 * 구조화된 로깅 클래스
 */
class Logger {
  /**
   * 로거 인스턴스 생성
   * @param {string} moduleName - 모듈 이름
   */
  constructor(moduleName) {
    this.moduleName = moduleName;
  }
  
  /**
   * 내부 로깅 구현
   * @param {string} level - 로그 레벨 (info, warn, error 등)
   * @param {string} message - 로그 메시지
   * @param {Object} data - 추가 데이터
   * @private
   */
  _log(level, message, data = {}) {
    const logData = {
      module: this.moduleName,
      timestamp: new Date().toISOString(),
      ...data
    };
    
    functions.logger[level](message, logData);
  }
  
  /**
   * 정보 로그
   * @param {string} message - 로그 메시지
   * @param {Object} data - 추가 데이터
   */
  info(message, data) {
    this._log('info', message, data);
  }
  
  /**
   * 경고 로그
   * @param {string} message - 로그 메시지
   * @param {Object} data - 추가 데이터
   */
  warn(message, data) {
    this._log('warn', message, data);
  }
  
  /**
   * 오류 로그
   * @param {string} message - 로그 메시지
   * @param {Error} error - 오류 객체
   * @param {Object} data - 추가 데이터
   */
  error(message, error, data = {}) {
    const errorData = {
      errorMessage: error.message,
      stack: error.stack,
      ...data
    };
    
    this._log('error', message, errorData);
  }
  
  /**
   * 타이머 시작
   * @param {string} label - 타이머 레이블
   * @returns {Object} 타이머 객체
   */
  startTimer(label) {
    const start = Date.now();
    return {
      end: () => {
        const duration = Date.now() - start;
        this.info(`Timer [${label}] completed`, { duration, label });
        return duration;
      }
    };
  }
}

/**
 * 로거 인스턴스 생성
 * @param {string} moduleName - 모듈 이름
 * @returns {Logger} 로거 인스턴스
 */
exports.createLogger = (moduleName) => new Logger(moduleName);
