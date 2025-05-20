/**
 * 데이터베이스 연결 및 쿼리 실행 모듈
 * 서버리스 환경에 최적화된 연결 관리, 재시도 메커니즘, 모니터링 기능
 * 
 * 보안 강화, SSL 연결 지원, 자격 증명 암호화 지원 추가
 */

const mysql = require('mysql2/promise');
const { getDatabaseCredentials, getSafeCredentials, storeCredentials } = require('./src/utils/secrets');
const { getContextLogger } = require('./src/utils/logger');
const asyncHooks = require('async-hooks'); // 비동기 컨텍스트 추적용

// 데이터베이스 연결 풀 인스턴스 (전역 관리)
let pool = null;
let poolLastUsed = Date.now();

// 서버리스 환경 최적화 설정
const KEEPALIVE_INTERVAL_MS = 30000; // 30초마다 연결 유지
const IDLE_TIMEOUT_MS = 60000; // 1분 동안 미사용 시 연결 풀 해제
const CONNECTION_LIFETIME_MS = 5 * 60 * 1000; // 5분 후 연결 풀 새로고침

// 재시도 설정
const RETRY_ATTEMPTS = 3;
const RETRY_DELAY_MS = 500; // 서버리스 환경에서는 더 짧은 초기 지연
const MAX_RETRY_DELAY_MS = 5000; // 서버리스 환경에서는 최대 지연 시간 단축

// 연결 ID 추적 (디버깅용)
let connectionCounter = 0;

// 활성 쿼리 추적 (중단된 쿼리 모니터링)
const activeQueries = new Map();
const queryTimeoutMonitor = {
  intervalId: null,
  start: () => {
    if (queryTimeoutMonitor.intervalId) return;
    
    queryTimeoutMonitor.intervalId = setInterval(() => {
      const now = Date.now();
      
      activeQueries.forEach((query, id) => {
        const executionTime = now - query.startTime;
        
        // 장시간 실행 쿼리 로깅 (30초 이상)
        if (executionTime > 30000) {
          const logger = getContextLogger();
          logger.warn(`Long-running query detected (${executionTime}ms): ${query.sql.substring(0, 100)}...`);
          
          // 아주 장시간 실행 쿼리 중단 (서버리스 환경에서 중요)
          if (executionTime > 120000 && query.connection) {
            logger.error(`Terminating extremely long query (${executionTime}ms): ${query.sql.substring(0, 100)}...`);
            try {
              query.connection.destroy();
              activeQueries.delete(id);
            } catch (error) {
              logger.error(`Failed to terminate long-running query: ${error.message}`);
            }
          }
        }
      });
    }, 10000); // 10초마다 확인
  },
  stop: () => {
    if (queryTimeoutMonitor.intervalId) {
      clearInterval(queryTimeoutMonitor.intervalId);
      queryTimeoutMonitor.intervalId = null;
    }
  }
};

/**
 * 데이터베이스 연결 풀 생성
 * 서버리스 환경에 최적화된 설정
 * SSL 보안 연결 지원 추가
 * 
 * @return {Promise<mysql.Pool>} MySQL 연결 풀
 */
const createPool = async () => {
  const logger = getContextLogger();
  // 쿼리 모니터링 시작
  queryTimeoutMonitor.start();
  
  try {
    // 기존 풀 해제 (있는 경우)
    if (pool) {
      logger.info('Closing existing database connection pool');
      await pool.end();
      pool = null;
    }
    
    // 데이터베이스 자격 증명 가져오기 (비동기)
    const credentials = await getDatabaseCredentials();
    
    if (!credentials) {
      throw new Error('Failed to retrieve database credentials');
    }
    
    // 서버리스 환경에 맞게 최적화된 연결 풀 설정
    const poolConfig = {
      host: credentials.host,
      user: credentials.user,
      password: credentials.password,
      database: credentials.database,
      waitForConnections: true,
      connectionLimit: process.env.NODE_ENV === 'production' ? 5 : 10, // 서버리스 환경에서는 더 작은 연결 풀
      queueLimit: 10,
      enableKeepAlive: true,
      keepAliveInitialDelay: 10000, // 10초
      
      // 서버리스 환경에 맞게 낮은 타임아웃 설정
      connectTimeout: 5000, // 5초
      acquireTimeout: 10000, // 10초
      
      // 기본 트랜잭션 설정
      multipleStatements: false, // SQL Injection 방지
      
      // 문자열 유형 및 시간대 설정
      timezone: '+09:00', // 한국 시간대
      dateStrings: true,
      
      // 보안 연결 설정 (프로덕션 환경)
      ssl: process.env.NODE_ENV === 'production' ? {
        minVersion: 'TLSv1.2',
        rejectUnauthorized: true // 프로덕션에서는 인증서 검증 활성화
      } : undefined,
      
      // 디버깅 설정 (개발용)
      debug: process.env.NODE_ENV === 'development' && process.env.DB_DEBUG === 'true',
      
      // 성능 최적화 설정
      namedPlaceholders: true, // 명명된 파라미터 지원
    };
    
    // 풀 생성
    const newPool = mysql.createPool(poolConfig);
    
    // 연결 풀에 ID 할당 (디버깅용)
    newPool.poolId = `pool-${Date.now()}-${Math.floor(Math.random() * 1000)}`;
    
    // 연결 테스트 (더 안전한 방식 - 서버리스 환경에서 예외 처리 개선)
    try {
      logger.info('Creating database connection pool...', getSafeCredentials(poolConfig));
      const connection = await newPool.getConnection();
      
      // 서버 정보 확인
      const [serverInfo] = await connection.query('SELECT VERSION() as version');
      logger.info(`Database connection established successfully. MySQL version: ${serverInfo[0]?.version || 'unknown'}`);
      
      // 추가 보안 검증 (SSL 연결 확인)
      if (process.env.NODE_ENV === 'production') {
        const [sslStatus] = await connection.query('SHOW STATUS LIKE "Ssl_cipher"');
        
        if (sslStatus && sslStatus.length > 0 && sslStatus[0].Value) {
          logger.info(`Secure SSL connection established using ${sslStatus[0].Value}`);
        } else {
          logger.warn('SSL connection not established. Consider enabling SSL for production.');
        }
      }
      
      connection.release();
      
      // 연결 풀 생성 타임스탬프 저장
      newPool.createdAt = Date.now();
      poolLastUsed = Date.now();
      
      // 연결 유지 타이머 설정
      setupKeepAlive(newPool);
      
      return newPool;
    } catch (connError) {
      // 연결 테스트 실패
      logger.error(`Failed to connect to database: ${connError.message}`);
      
      // 풀 정리 시도
      try {
        await newPool.end();
      } catch (endError) {
        logger.warn(`Error ending pool after connection failure: ${endError.message}`);
      }
      
      throw connError;
    }
  } catch (error) {
    logger.error(`Failed to create database connection pool: ${error.message}`);
    throw error;
  }
};

/**
 * 연결 유지 타이머 설정
 * 서버리스 환경에서 연결이 끊기지 않도록 주기적으로 ping
 * 
 * @param {mysql.Pool} dbPool MySQL 연결 풀
 */
const setupKeepAlive = (dbPool) => {
  // 이전 타이머 정리
  if (dbPool.keepAliveTimer) {
    clearInterval(dbPool.keepAliveTimer);
  }
  
  // 주기적인 핑 설정
  dbPool.keepAliveTimer = setInterval(async () => {
    const logger = getContextLogger();
    const idle = Date.now() - poolLastUsed;
    
    // 일정 시간 동안 사용되지 않았다면 연결 풀 해제
    if (idle > IDLE_TIMEOUT_MS) {
      logger.info(`Connection pool idle for ${idle}ms, releasing resources`);
      clearInterval(dbPool.keepAliveTimer);
      
      try {
        await dbPool.end();
        pool = null;
      } catch (error) {
        logger.warn(`Error ending idle connection pool: ${error.message}`);
      }
      
      return;
    }
    
    // 연결 풀 수명이 초과되었다면 새로고침
    if (Date.now() - dbPool.createdAt > CONNECTION_LIFETIME_MS) {
      logger.info('Connection pool reached maximum lifetime, refreshing');
      clearInterval(dbPool.keepAliveTimer);
      
      // 비동기 연결 풀 재생성
      createPool().catch(error => {
        logger.error(`Failed to refresh connection pool: ${error.message}`);
      });
      
      return;
    }
    
    // 정상적인 KEEPALIVE 쿼리 실행
    try {
      const connection = await dbPool.getConnection();
      try {
        await connection.query('SELECT 1');
        logger.debug('Database keepalive ping successful');
      } finally {
        connection.release();
      }
    } catch (error) {
      logger.warn(`Keepalive ping failed: ${error.message}`);
      
      // 연결 풀 새로고침 시도
      try {
        await createPool();
      } catch (refreshError) {
        logger.error(`Failed to refresh connection pool after failed ping: ${refreshError.message}`);
      }
    }
  }, KEEPALIVE_INTERVAL_MS);
  
  // 함수 종료 시 타이머 정리를 위한 이벤트 리스너
  process.once('SIGTERM', async () => {
    clearInterval(dbPool.keepAliveTimer);
    if (pool) {
      try {
        await pool.end();
      } catch (error) {
        // 무시
      }
    }
  });
};

/**
 * 데이터베이스 연결 풀 가져오기 (필요시 생성)
 * 서버리스 환경에 최적화된 지연 초기화 패턴
 * 
 * @return {Promise<mysql.Pool>} MySQL 연결 풀
 */
const getPool = async () => {
  if (!pool) {
    pool = await createPool();
  }
  
  // 사용 타임스탬프 업데이트 (자원 관리용)
  poolLastUsed = Date.now();
  
  return pool;
};

/**
 * 지수적 지연 계산 (재시도 간격)
 * 서버리스 환경에 맞게 최적화
 * 
 * @param {number} attemptNumber 재시도 시도 번호
 * @return {number} 다음 재시도까지 지연 시간(ms)
 */
const calculateExponentialDelay = (attemptNumber) => {
  // 2^n * RETRY_DELAY_MS ms + 최대 250ms의 지터 (동시 재시도 방지)
  const delay = Math.min(
    Math.pow(1.5, attemptNumber) * RETRY_DELAY_MS + Math.floor(Math.random() * 250),
    MAX_RETRY_DELAY_MS
  );
  return delay;
};

/**
 * 재시도 로직으로 함수 실행
 * 서버리스 환경에 최적화된 오류 처리
 * 
 * @param {Function} fn 실행할 함수
 * @param {number} maxAttempts 최대 시도 횟수
 * @return {Promise<any>} 함수 실행 결과
 */
const withRetry = async (fn, maxAttempts = RETRY_ATTEMPTS) => {
  const logger = getContextLogger();
  let lastError = null;
  
  for (let attempt = 0; attempt < maxAttempts; attempt++) {
    try {
      return await fn();
    } catch (error) {
      lastError = error;
      
      // 복구 불가능한 오류는 즉시 재시도 중단
      if (
        error.code === 'ER_ACCESS_DENIED_ERROR' || // 인증 실패
        error.code === 'ER_BAD_DB_ERROR' || // 데이터베이스 없음
        error.fatal // 치명적 오류
      ) {
        logger.error(`Fatal database error (${error.code}), not retrying: ${error.message}`);
        throw error;
      }
      
      // 마지막 시도가 아니면 재시도
      if (attempt < maxAttempts - 1) {
        const delay = calculateExponentialDelay(attempt);
        logger.warn(`Database operation failed (${error.code}), attempt ${attempt + 1}/${maxAttempts}, retrying in ${delay}ms...`);
        await new Promise(resolve => setTimeout(resolve, delay));
        
        // 재시도 전 연결 풀 재생성 (필요시)
        if (error.code === 'PROTOCOL_CONNECTION_LOST' || 
            error.code === 'ECONNRESET' ||
            error.code === 'ETIMEDOUT') {
          logger.warn('Connection issue detected, recreating database connection pool before retry');
          pool = await createPool();
        }
      }
    }
  }
  
  // 모든 재시도 실패
  logger.error(`Database operation failed after ${maxAttempts} attempts: ${lastError.message}`);
  throw lastError;
};

/**
 * SQL 쿼리 실행
 * 서버리스 환경에 최적화된 성능 추적 및 오류 처리
 * 향상된 보안, 모니터링, 진단 기능 추가
 * 
 * @param {string} sql SQL 쿼리
 * @param {Array|Object} params 쿼리 파라미터 (배열 또는 명명된 객체)
 * @param {Object} options 추가 옵션
 * @return {Promise<Array>} 쿼리 결과
 */
const executeQuery = async (sql, params = [], options = {}) => {
  const logger = getContextLogger();
  const start = Date.now();
  const queryId = `q-${Date.now()}-${Math.floor(Math.random() * 10000).toString().padStart(4, '0')}`;
  const { 
    maxAttempts = RETRY_ATTEMPTS, 
    timeout = 10000,
    traceId = asyncHooks.executionAsyncId(), // 비동기 컨텍스트 추적
    secured = false // 민감한 쿼리 여부 (추가 보안 조치)
  } = options;
  
  // 활성 쿼리 기록 (중단된 쿼리 감지용)
  const queryEntry = {
    sql,
    startTime: start,
    connection: null, 
    traceId
  };
  activeQueries.set(queryId, queryEntry);
  
  // 쿼리 실행 종료 시 정리
  const cleanup = () => {
    activeQueries.delete(queryId);
  };
  
  // 민감한 정보 제외한 로깅 (서버리스 환경에서 생략 가능)
  const isVerboseLogging = process.env.DB_QUERY_LOGGING === 'verbose';
  
  if (isVerboseLogging) {
    // 민감 정보를 제외한 로깅 (프로덕션 환경에서 생략)
    const logParams = !secured ? params : (
      Array.isArray(params) 
        ? params.map(p => typeof p === 'string' && p.length > 30 ? `${p.substring(0, 27)}...` : p)
        : Object.fromEntries(Object.entries(params).map(([k, v]) => 
            [k, typeof v === 'string' && v.length > 30 ? `${v.substring(0, 27)}...` : v]
          ))
    );
    
    logger.debug(`[DB:${queryId}] Executing: ${sql.replace(/\s+/g, ' ').trim().substring(0, 200)}`);
    logger.debug(`[DB:${queryId}] Params: ${JSON.stringify(logParams).substring(0, 200)}`);
  } else {
    // 간소화된 로깅
    logger.debug(`[DB:${queryId}] Executing query (${sql.substring(0, 20)}...)`);
  }
  
  try {
    // 연결 풀 가져오기
    const dbPool = await withRetry(() => getPool(), maxAttempts);
    
    // SQL 인젝션 방지를 위한 기본 검증 (프로덕션 환경)
    if (process.env.NODE_ENV === 'production' && !secured) {
      const forbiddenPatterns = [
        /;\s*DELETE\s+FROM/i,
        /;\s*DROP\s+/i,
        /;\s*UPDATE\s+/i,
        /;\s*INSERT\s+INTO/i,
        /SLEEP\s*\(/i,
        /BENCHMARK\s*\(/i,
        /LOAD_FILE\s*\(/i,
        /INTO\s+OUTFILE/i,
        /INTO\s+DUMPFILE/i
      ];
      
      // 금지된 패턴 검사
      const hasForbiddenPattern = forbiddenPatterns.some(pattern => pattern.test(sql));
      
      if (hasForbiddenPattern) {
        cleanup();
        logger.error(`[DB:${queryId}] Possible SQL injection attempt detected`);
        throw new Error('Invalid SQL query detected');
      }
    }
    
    // 쿼리 실행 (재시도 로직 포함)
    const result = await withRetry(async () => {
      // 연결 가져오기
      const connection = await dbPool.getConnection();
      
      // 연결을 활성 쿼리에 연결 (필요시 중단용)
      queryEntry.connection = connection;
      
      try {
        // 서버리스 환경에 맞게 항상 타임아웃 설정
        const executionPromise = Array.isArray(params) 
          ? connection.execute(sql, params)
          : connection.execute(sql, params); // 명명된 파라미터용
          
        const timeoutPromise = new Promise((_, reject) => 
          setTimeout(() => reject(new Error(`Query timeout after ${timeout}ms`)), timeout)
        );
        
        return await Promise.race([executionPromise, timeoutPromise])
          .finally(() => {
            connection.release();
            queryEntry.connection = null;
          });
      } catch (error) {
        connection.release();
        queryEntry.connection = null;
        throw error;
      }
    }, maxAttempts);
    
    // 실행 시간 측정 및 로깅
    const duration = Date.now() - start;
    cleanup();
    
    // 성능 지표 로깅 (실행 시간에 따라 로그 레벨 조정)
    if (duration > 1000) {
      logger.warn(`[DB:${queryId}] Very slow query (${duration}ms): ${sql.replace(/\s+/g, ' ').trim().substring(0, 100)}...`);
      
      // 매우 느린 쿼리 전용 로깅 (선택적)
      if (duration > 3000 && process.env.NODE_ENV === 'production') {
        try {
          // Firestore에 느린 쿼리 로깅 (비동기 - 응답 지연 방지)
          const logSlowQuery = async () => {
            try {
              await admin.firestore().collection('slowQueries').add({
                sql: sql.substring(0, 1000),
                duration,
                timestamp: admin.firestore.FieldValue.serverTimestamp(),
                environment: process.env.NODE_ENV
              });
            } catch (error) {
              logger.warn(`Failed to log slow query to Firestore: ${error.message}`);
            }
          };
          
          // 비동기 실행 (응답 대기하지 않음)
          logSlowQuery();
        } catch (error) {
          // 로깅 실패는 무시
        }
      }
    } else if (duration > 500) {
      logger.info(`[DB:${queryId}] Slow query (${duration}ms): ${sql.replace(/\s+/g, ' ').trim().substring(0, 50)}...`);
    } else {
      logger.debug(`[DB:${queryId}] Query completed in ${duration}ms`);
    }
    
    return result[0]; // results 배열 반환
  } catch (error) {
    const duration = Date.now() - start;
    cleanup();
    
    // 서버리스 환경에 맞게 구조화된 오류 로깅
    logger.error(`[DB:${queryId}] Query error (${duration}ms):`, {
      message: error.message,
      code: error.code,
      sqlState: error.sqlState,
      sqlMessage: error.sqlMessage,
      query: sql.substring(0, 200) // 쿼리 앞부분만 로깅
    });
    
    // 오류 메시지에서 민감 정보 제거
    const sanitizedMessage = error.message.replace(/(password=)[^&]*/gi, '$1*****');
    
    // 구체적인 오류 유형 반환 및 개선된 오류 처리
    if (error.code === 'ER_DUP_ENTRY') {
      throw new Error(`Duplicate entry: ${sanitizedMessage}`);
    } else if (error.code === 'ER_NO_REFERENCED_ROW') {
      throw new Error(`Referenced resource does not exist: ${sanitizedMessage}`);
    } else if (error.message.includes('timeout')) {
      throw new Error(`Database query timeout: ${sanitizedMessage}`);
    } else if (error.code === 'ER_ACCESS_DENIED_ERROR') {
      throw new Error(`Database access denied: Check credentials configuration`);
    } else if (error.code === 'PROTOCOL_CONNECTION_LOST') {
      throw new Error(`Database connection lost: ${sanitizedMessage}`);
    } else if (error.code === 'ECONNREFUSED') {
      throw new Error(`Database connection refused: Check network configuration`);
    } else {
      throw new Error(`Database query failed: ${sanitizedMessage}`);
    }
  }
};

/**
 * 트랜잭션 실행
 * 서버리스 환경에 최적화된 트랜잭션 관리
 * 
 * @param {Function} callback 트랜잭션 내에서 실행할 콜백 함수
 * @param {Object} options 트랜잭션 옵션
 * @return {Promise<any>} 콜백 함수 결과
 */
const withTransaction = async (callback, options = {}) => {
  const logger = getContextLogger();
  const { timeout = 30000, maxAttempts = RETRY_ATTEMPTS } = options;
  const transactionId = Math.random().toString(36).substring(2, 10);
  const start = Date.now();
  
  logger.info(`[TX:${transactionId}] Starting database transaction`);
  
  // 연결 풀 가져오기 및 재시도 처리
  const pool = await withRetry(() => getPool(), maxAttempts);
  const connection = await pool.getConnection();
  
  // 트랜잭션 타임아웃 설정
  const timeoutId = setTimeout(() => {
    logger.error(`[TX:${transactionId}] Transaction timeout after ${timeout}ms`);
    
    // 연결 강제 해제 (다음 작업에서는 새 연결 사용)
    try {
      connection.destroy();
    } catch (e) {
      // 무시
    }
  }, timeout);
  
  try {
    await connection.beginTransaction();
    logger.debug(`[TX:${transactionId}] Transaction started`);
    
    const result = await callback(connection);
    
    await connection.commit();
    const duration = Date.now() - start;
    logger.info(`[TX:${transactionId}] Transaction committed successfully (${duration}ms)`);
    
    return result;
  } catch (error) {
    const duration = Date.now() - start;
    logger.error(`[TX:${transactionId}] Transaction failed after ${duration}ms: ${error.message}`);
    
    // 롤백 시도
    try {
      await connection.rollback();
      logger.info(`[TX:${transactionId}] Transaction rolled back successfully`);
    } catch (rollbackError) {
      logger.error(`[TX:${transactionId}] Failed to rollback transaction: ${rollbackError.message}`);
    }
    
    throw error;
  } finally {
    // 타임아웃 타이머 정리
    clearTimeout(timeoutId);
    
    // 연결 반환
    try {
      connection.release();
      logger.debug(`[TX:${transactionId}] Connection released`);
    } catch (e) {
      // 이미 연결이 해제되었거나 파괴된 경우 무시
      logger.debug(`[TX:${transactionId}] Connection already released or destroyed`);
    }
  }
};

// 단일 레코드 조회 편의 함수
const queryOne = async (sql, params = [], options = {}) => {
  const results = await executeQuery(sql, params, options);
  return results && results.length > 0 ? results[0] : null;
};

module.exports = {
  getPool,
  executeQuery,
  queryOne,
  withTransaction,
  createPool,
  withRetry,
};
