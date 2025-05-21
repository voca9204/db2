/**
 * 데이터베이스 연결 모듈
 */
const mysql = require('mysql2/promise');
const functions = require('firebase-functions');
const { withRetry } = require('../utils/retry');
const logger = require('../utils/logger').createLogger('database:connection');

// 전역 연결 풀 (싱글턴)
let pool = null;

/**
 * 데이터베이스 연결 설정 가져오기
 * @returns {Object} 데이터베이스 설정
 */
function getDbConfig() {
  try {
    return {
      host: functions.config().database?.host || '211.248.190.46',
      user: functions.config().database?.user || 'hermes',
      password: functions.config().database?.password || 'mcygicng!022',
      database: functions.config().database?.name || 'hermes',
      waitForConnections: true,
      connectionLimit: parseInt(functions.config().database?.connection_limit, 10) || 5,
      queueLimit: 0,
      connectTimeout: 10000,
      acquireTimeout: 15000,
      enableKeepAlive: true,
      keepAliveInitialDelay: 10000,
      timezone: '+09:00' // 한국 시간대
    };
  } catch (error) {
    logger.error('Error loading database config from Firebase config', error);
    
    // 기본 설정 반환
    return {
      host: '211.248.190.46',
      user: 'hermes',
      password: 'mcygicng!022',
      database: 'hermes',
      waitForConnections: true,
      connectionLimit: 5,
      queueLimit: 0,
      connectTimeout: 10000,
      acquireTimeout: 15000,
      enableKeepAlive: true,
      keepAliveInitialDelay: 10000,
      timezone: '+09:00'
    };
  }
}

/**
 * 데이터베이스 연결 풀 초기화
 * @returns {Object} 데이터베이스 연결 풀
 */
function initializeConnectionPool() {
  if (!pool) {
    const dbConfig = getDbConfig();
    
    logger.info('Initializing database connection pool', {
      host: dbConfig.host,
      user: dbConfig.user,
      database: dbConfig.database,
      connectionLimit: dbConfig.connectionLimit
    });
    
    pool = mysql.createPool(dbConfig);
    
    // 연결 유효성 확인을 위한 주기적 쿼리 설정
    setInterval(async () => {
      try {
        const connection = await pool.getConnection();
        try {
          await connection.query('SELECT 1');
          logger.info('Keepalive query executed successfully');
        } finally {
          connection.release();
        }
      } catch (error) {
        logger.error('Keepalive query failed', error);
      }
    }, 5 * 60 * 1000); // 5분마다 실행
  }
  
  return pool;
}

/**
 * 데이터베이스 연결 가져오기
 * @returns {Promise<Object>} 데이터베이스 연결
 */
exports.getConnection = async () => {
  if (!pool) {
    pool = initializeConnectionPool();
  }
  
  try {
    return await pool.getConnection();
  } catch (error) {
    logger.error('Failed to get database connection', error);
    throw new Error(`Database connection failed: ${error.message}`);
  }
};
