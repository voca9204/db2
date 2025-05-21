/**
 * 데이터베이스 쿼리 실행 모듈
 */
const { getConnection } = require('./connection');
const { withRetry } = require('../utils/retry');
const logger = require('../utils/logger').createLogger('database:query');

/**
 * SQL 쿼리 실행 함수
 * @param {string} queryString - 실행할 SQL 쿼리
 * @param {Array} params - 쿼리 파라미터
 * @param {Object} options - 추가 옵션
 * @param {number} options.timeout - 쿼리 타임아웃(ms)
 * @param {number} options.maxRetries - 최대 재시도 횟수
 * @returns {Promise<Array>} 쿼리 결과
 */
exports.executeQuery = async (queryString, params = [], options = {}) => {
  const { timeout = 30000, maxRetries = 3 } = options;
  
  return withRetry(
    async () => {
      const connection = await getConnection();
      
      try {
        // 로깅
        logger.info('Executing query', {
          query: queryString.substring(0, 100) + (queryString.length > 100 ? '...' : ''),
          paramCount: params.length
        });
        
        // 타임아웃은 데이터베이스 기본값 사용 (설정 시도 생략)
        // logger.info('Using default database timeout settings');
        
        // 쿼리 실행
        const startTime = Date.now();
        const [results] = await connection.query(queryString, params);
        const duration = Date.now() - startTime;
        
        // 성능 로깅
        logger.info('Query executed successfully', {
          duration,
          rowCount: results.length
        });
        
        return results;
      } catch (error) {
        logger.error('Query execution failed', error, {
          query: queryString.substring(0, 100) + (queryString.length > 100 ? '...' : '')
        });
        throw error;
      } finally {
        // 연결 반환
        connection.release();
      }
    },
    maxRetries,
    1000,
    // 일시적인 DB 오류에만 재시도
    (error) => {
      const retryableErrors = [
        'ECONNRESET',
        'ETIMEDOUT',
        'PROTOCOL_CONNECTION_LOST',
        'ER_LOCK_DEADLOCK',
        'ER_LOCK_WAIT_TIMEOUT'
      ];
      
      const shouldRetry = retryableErrors.some(code => 
        error.code === code || (error.message && error.message.includes(code))
      );
      
      logger.info('Determining if error is retryable', {
        errorCode: error.code,
        shouldRetry
      });
      
      return shouldRetry;
    }
  );
};

/**
 * 트랜잭션 실행 함수
 * @param {Function} callback - 트랜잭션 내에서 실행할 콜백 함수
 * @returns {Promise<any>} 콜백 함수의 반환값
 */
exports.executeTransaction = async (callback) => {
  const connection = await getConnection();
  
  try {
    logger.info('Starting transaction');
    
    await connection.beginTransaction();
    
    const result = await callback(connection);
    
    await connection.commit();
    logger.info('Transaction committed successfully');
    
    return result;
  } catch (error) {
    logger.error('Transaction failed, rolling back', error);
    
    try {
      await connection.rollback();
      logger.info('Transaction rolled back successfully');
    } catch (rollbackError) {
      logger.error('Transaction rollback failed', rollbackError);
    }
    
    throw error;
  } finally {
    connection.release();
  }
};
