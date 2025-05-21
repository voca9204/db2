/**
 * 데이터베이스 API 컨트롤러
 * 데이터베이스 연결 및 관리 기능
 */

const { getPool, executeQuery } = require('../../db');
const { success, error } = require('../utils/response');
const { getSafeCredentials } = require('../utils/secrets');
const { ValidationError } = require('../middleware/error-handler');

/**
 * 데이터베이스 연결 상태 확인
 * @param {Request} req 요청 객체
 * @param {Response} res 응답 객체
 * @param {NextFunction} next 다음 미들웨어
 */
const checkConnectionStatus = async (req, res, next) => {
  try {
    const start = Date.now();
    
    // 간단한 쿼리 실행으로 연결 확인
    const result = await executeQuery('SELECT 1 as connection_test');
    const duration = Date.now() - start;
    
    // 데이터베이스 버전 정보 조회
    const dbInfo = await executeQuery(`
      SELECT 
        VERSION() as version,
        DATABASE() as current_database,
        @@hostname as hostname,
        @@max_connections as max_connections,
        @@wait_timeout as wait_timeout
    `);
    
    // 응답 반환
    return res.json(success({
      connected: true,
      responseTime: `${duration}ms`,
      databaseInfo: dbInfo[0],
      timestamp: new Date().toISOString()
    }, 'Database connection is working properly'));
  } catch (err) {
    console.error('Database connection check failed:', err);
    
    // 안전한 오류 메시지 반환 (민감 정보 제거)
    const sanitizedMessage = err.message.replace(/(password=)[^&]*/gi, '$1*****');
    
    return res.status(500).json(error(
      'Database connection failed', 
      500, 
      { message: sanitizedMessage }
    ));
  }
};

/**
 * 테이블 구조 정보 조회
 * @param {Request} req 요청 객체
 * @param {Response} res 응답 객체
 * @param {NextFunction} next 다음 미들웨어
 */
const getTableInfo = async (req, res, next) => {
  try {
    const { tableName } = req.params;
    
    // 테이블명 유효성 검사 (SQL 인젝션 방지)
    if (!/^[a-zA-Z0-9_]+$/.test(tableName)) {
      throw new ValidationError('Invalid table name format');
    }
    
    // 테이블 존재 여부 확인
    const tableExists = await executeQuery(
      "SELECT COUNT(*) as count FROM information_schema.tables WHERE table_schema = DATABASE() AND table_name = ?",
      [tableName]
    );
    
    if (tableExists[0].count === 0) {
      return res.status(404).json(error(`Table '${tableName}' not found`));
    }
    
    // 테이블 구조 조회
    const columns = await executeQuery(
      "SELECT column_name, column_type, is_nullable, column_key, column_default, extra, column_comment " +
      "FROM information_schema.columns " +
      "WHERE table_schema = DATABASE() AND table_name = ? " +
      "ORDER BY ordinal_position",
      [tableName]
    );
    
    // 테이블 인덱스 조회
    const indexes = await executeQuery(
      "SELECT index_name, GROUP_CONCAT(column_name ORDER BY seq_in_index) as columns, index_type, non_unique " +
      "FROM information_schema.statistics " +
      "WHERE table_schema = DATABASE() AND table_name = ? " +
      "GROUP BY index_name, index_type, non_unique",
      [tableName]
    );
    
    // 레코드 수 조회 (대량 테이블에서는 추정치)
    const countQuery = `SELECT COUNT(*) as total_rows FROM ${tableName}`;
    let rowCount;
    try {
      const countResult = await executeQuery(countQuery);
      rowCount = countResult[0].total_rows;
    } catch (countError) {
      console.warn(`Failed to get exact row count for ${tableName}:`, countError);
      rowCount = 'Unknown (table too large)';
    }
    
    // 응답 반환
    return res.json(success({
      tableName,
      columns,
      indexes,
      rowCount,
      timestamp: new Date().toISOString()
    }, `Table structure for '${tableName}'`));
  } catch (err) {
    next(err);
  }
};

/**
 * 데이터베이스 테이블 목록 조회
 * @param {Request} req 요청 객체
 * @param {Response} res 응답 객체
 * @param {NextFunction} next 다음 미들웨어
 */
const listTables = async (req, res, next) => {
  try {
    // 테이블 목록 조회
    const tables = await executeQuery(
      "SELECT table_name, engine, table_rows, data_length, index_length, " +
      "create_time, update_time, table_comment " +
      "FROM information_schema.tables " +
      "WHERE table_schema = DATABASE() " +
      "ORDER BY table_name"
    );
    
    // 데이터 크기 포맷팅 (바이트 -> 사람이 읽기 쉬운 형식)
    const formattedTables = tables.map(table => ({
      ...table,
      data_size: formatBytes(table.data_length),
      index_size: formatBytes(table.index_length),
      total_size: formatBytes(table.data_length + table.index_length)
    }));
    
    // 응답 반환
    return res.json(success({
      tables: formattedTables,
      totalTables: tables.length,
      timestamp: new Date().toISOString()
    }, 'Database tables retrieved successfully'));
  } catch (err) {
    next(err);
  }
};

/**
 * 바이트 크기를 사람이 읽기 쉬운 형식으로 변환
 * @param {number} bytes 바이트 크기
 * @param {number} decimals 소수점 자릿수
 * @return {string} 포맷된 크기 문자열
 */
const formatBytes = (bytes, decimals = 2) => {
  if (bytes === 0) return '0 Bytes';
  
  const k = 1024;
  const dm = decimals < 0 ? 0 : decimals;
  const sizes = ['Bytes', 'KB', 'MB', 'GB', 'TB', 'PB', 'EB', 'ZB', 'YB'];
  
  const i = Math.floor(Math.log(bytes) / Math.log(k));
  
  return parseFloat((bytes / Math.pow(k, i)).toFixed(dm)) + ' ' + sizes[i];
};

module.exports = {
  checkConnectionStatus,
  getTableInfo,
  listTables,
};
