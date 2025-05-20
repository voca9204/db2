/**
 * 데이터베이스 연결 테스트 함수
 * 
 * 데이터베이스 연결이 정상적으로 수립되는지 테스트합니다.
 */

const functions = require('firebase-functions');
const mysql = require('mysql2/promise');
const cors = require('cors')({ origin: true });

// 데이터베이스 연결 설정
const DB_CONFIG = {
  host: process.env.DB_HOST || '211.248.190.46',
  user: process.env.DB_USER || 'hermes',
  password: process.env.DB_PASSWORD || 'mcygicng!022',
  database: process.env.DB_NAME || 'hermes',
  waitForConnections: true,
  connectionLimit: 2,
  queueLimit: 0,
  connectTimeout: 10000
};

/**
 * 데이터베이스 연결 테스트 함수
 */
exports.testDbConnection = functions.https.onRequest((req, res) => {
  cors(req, res, async () => {
    console.log('데이터베이스 연결 테스트 시작');
    
    try {
      // 연결 풀 생성
      console.log('연결 풀 생성 시도...');
      console.log('DB 설정:', {
        host: DB_CONFIG.host,
        user: DB_CONFIG.user,
        database: DB_CONFIG.database,
        connectionLimit: DB_CONFIG.connectionLimit
      });
      
      const pool = mysql.createPool(DB_CONFIG);
      
      // 연결 테스트
      console.log('연결 가져오기 시도...');
      const connection = await pool.getConnection();
      console.log('연결 성공!');
      
      // 간단한 쿼리 실행
      console.log('기본 쿼리 실행 시도...');
      const [rows] = await connection.query('SELECT 1 as test');
      console.log('쿼리 결과:', rows);
      
      // 간단한 테이블 정보 확인
      console.log('테이블 정보 확인 시도...');
      const [tables] = await connection.query('SHOW TABLES');
      // JavaScript에서 결과를 5개로 제한
      const limitedTables = tables.slice(0, 5);
      console.log('테이블 목록 (최대 5개):', limitedTables);
      
      // 연결 반환
      connection.release();
      console.log('연결 반환 완료');
      
      // 결과 반환
      res.status(200).json({
        success: true,
        message: '데이터베이스 연결 테스트 성공',
        tables: limitedTables.map(table => Object.values(table)[0])
      });
    } catch (error) {
      console.error('데이터베이스 연결 테스트 오류:', error);
      
      // 자세한 오류 정보 반환
      res.status(500).json({
        success: false,
        message: '데이터베이스 연결 실패',
        error: {
          name: error.name,
          message: error.message,
          code: error.code,
          errno: error.errno,
          sqlState: error.sqlState,
          sqlMessage: error.sqlMessage
        }
      });
    }
  });
});
