/**
 * 재시도 메커니즘 유틸리티 모듈
 */
const logger = require('./logger').createLogger('utils:retry');

/**
 * 지정된 횟수만큼 함수 실행을 재시도하는 유틸리티
 * @param {Function} fn - 실행할 함수
 * @param {number} maxRetries - 최대 재시도 횟수
 * @param {number} delayMs - 재시도 간 지연(밀리초)
 * @param {Function} shouldRetry - 재시도 여부 결정 함수
 * @returns {Promise} 함수 실행 결과
 */
exports.withRetry = async (fn, maxRetries = 3, delayMs = 1000, shouldRetry = (err) => true) => {
  let lastError;
  
  for (let attempt = 0; attempt <= maxRetries; attempt++) {
    try {
      return await fn();
    } catch (error) {
      lastError = error;
      
      // 재시도 여부 확인
      if (attempt >= maxRetries || !shouldRetry(error)) {
        break;
      }
      
      // 지수 백오프 지연 계산
      const delay = delayMs * Math.pow(2, attempt);
      logger.warn(`Retry attempt ${attempt + 1}/${maxRetries} after ${delay}ms`, { 
        error: error.message,
        attempt,
        delay
      });
      
      // 지연 후 재시도
      await new Promise(resolve => setTimeout(resolve, delay));
    }
  }
  
  throw lastError;
};
