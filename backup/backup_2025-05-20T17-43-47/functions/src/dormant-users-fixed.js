/**
 * dormantUsers API 모듈 - 수정된 JOIN 조건 적용
 * 
 * 이 모듈은 고가치 휴면 사용자를 조회하는 Firebase Function을 제공합니다.
 * JOIN 조건이 p.userId = gs.userId로 수정되어 올바른 데이터가 반환됩니다.
 */

const functions = require('firebase-functions');
const mariadb = require('mariadb');

// 데이터베이스 연결 설정
const dbConfig = {
  host: process.env.DB_HOST || '211.248.190.46',
  user: process.env.DB_USER || 'hermes',
  password: process.env.DB_PASSWORD || 'mcygicng!022',
  database: process.env.DB_NAME || 'hermes',
  connectionLimit: 5,
  connectTimeout: 10000
};

// 데이터베이스 연결 풀 (싱글턴)
let pool;
function getPool() {
  if (!pool) {
    console.log('Creating MariaDB connection pool...');
    functions.logger.info('Creating MariaDB connection pool...');
    pool = mariadb.createPool(dbConfig);
  }
  return pool;
}

/**
 * 고가치 휴면 사용자 조회 함수
 */
exports.dormantUsers = functions.https.onRequest(async (req, res) => {
  // CORS 헤더 설정
  res.set('Access-Control-Allow-Origin', '*');
  res.set('Access-Control-Allow-Methods', 'GET, POST');
  res.set('Access-Control-Allow-Headers', 'Content-Type');
  
  // OPTIONS 요청 (preflight) 처리
  if (req.method === 'OPTIONS') {
    res.status(204).send('');
    return;
  }
  
  // 요청 파라미터 추출
  const minNetBet = req.query.minNetBet ? parseInt(req.query.minNetBet) : 1000;
  const minInactiveDays = req.query.minInactiveDays ? parseInt(req.query.minInactiveDays) : 30;
  const limit = req.query.limit ? parseInt(req.query.limit) : 10;
  
  functions.logger.info('고가치 휴면 사용자 조회 함수 실행', {
    minNetBet,
    minInactiveDays,
    limit,
    query: req.query
  });
  
  let conn;
  try {
    // 데이터베이스 연결
    const pool = getPool();
    conn = await pool.getConnection();
    functions.logger.info('Database connection established');
    
    // 쿼리 실행 - 수정된 JOIN 조건 적용
    const query = `
      SELECT 
        p.userId,
        COUNT(*) as loginCount,
        MAX(gs.gameDate) as lastActivity,
        DATEDIFF(CURRENT_DATE, MAX(gs.gameDate)) as inactiveDays,
        ROUND(SUM(gs.netBet)) as netBet
      FROM players p
      JOIN game_scores gs ON p.userId = gs.userId  /* 수정된 JOIN 조건 */
      GROUP BY p.userId
      HAVING SUM(gs.netBet) >= ?
      AND DATEDIFF(CURRENT_DATE, MAX(gs.gameDate)) >= ?
      ORDER BY inactiveDays DESC
      LIMIT ?
    `;
    
    // 총 레코드 수 확인 쿼리
    const countQuery = `
      SELECT 
        COUNT(*) as totalCount
      FROM (
        SELECT 
          p.userId,
          SUM(gs.netBet) as totalNetBet,
          DATEDIFF(CURRENT_DATE, MAX(gs.gameDate)) as inactiveDays
        FROM players p
        JOIN game_scores gs ON p.userId = gs.userId  /* 수정된 JOIN 조건 */
        GROUP BY p.userId
        HAVING SUM(gs.netBet) >= ?
        AND DATEDIFF(CURRENT_DATE, MAX(gs.gameDate)) >= ?
      ) as subquery
    `;
    
    const start = Date.now();
    const results = await conn.query(query, [minNetBet, minInactiveDays, limit]);
    const [countResult] = await conn.query(countQuery, [minNetBet, minInactiveDays]);
    const executionTime = Date.now() - start;
    
    functions.logger.info(`Query executed in ${executionTime}ms, returned ${results.length} results`);
    functions.logger.info(`Total matching records: ${countResult?.totalCount || 0}`);
    
    // 결과 반환
    res.status(200).json({
      success: true,
      message: "Dormant high-value users retrieved from database",
      params: {
        minNetBet,
        minInactiveDays,
        limit
      },
      data: results,
      count: results.length,
      totalCount: countResult?.totalCount || 0,
      timestamp: new Date().toISOString()
    });
    
  } catch (error) {
    functions.logger.error('Database error:', error);
    res.status(500).json({
      success: false,
      message: "Error retrieving dormant high-value users",
      error: error.message,
      timestamp: new Date().toISOString()
    });
  } finally {
    if (conn) {
      try {
        conn.release();
        functions.logger.info('Database connection released');
      } catch (err) {
        functions.logger.error('Error releasing connection:', err);
      }
    }
  }
});
