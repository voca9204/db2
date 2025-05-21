/**
 * 고가치 활성 사용자 조회 Firebase Function
 */
const functions = require('firebase-functions');
const mariadb = require('mariadb');

// 데이터베이스 연결 설정 (실제 환경에서는 환경 변수 사용 권장)
const dbConfig = {
  host: '211.248.190.46',
  user: 'hermes',
  password: 'mcygicng!022',
  database: 'hermes',
  connectionLimit: 5,
  connectTimeout: 10000
};

// 데이터베이스 연결 풀 생성
let pool;
function getPool() {
  if (!pool) {
    functions.logger.info('데이터베이스 연결 풀 생성');
    pool = mariadb.createPool(dbConfig);
  }
  return pool;
}

// 고가치 활성 사용자 조회 함수
exports.activeUsers = functions.https.onRequest(async (req, res) => {
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
  const limit = req.query.limit ? parseInt(req.query.limit) : 10;
  
  functions.logger.info('고가치 활성 사용자 조회 함수 실행', {
    minNetBet,
    limit
  });
  
  let conn;
  try {
    // 데이터베이스 연결
    const pool = getPool();
    conn = await pool.getConnection();
    functions.logger.info('데이터베이스 연결 성공');
    
    // 쿼리 실행
    const query = `
      SELECT 
        p.userId,
        COUNT(*) as loginCount,
        MAX(gs.gameDate) as lastActivity,
        DATEDIFF(CURRENT_DATE, MAX(gs.gameDate)) as inactiveDays,
        ROUND(SUM(gs.netBet)) as netBet
      FROM players p
      JOIN game_scores gs ON p.id = gs.userId
      GROUP BY p.userId
      HAVING SUM(gs.netBet) >= ?
      AND DATEDIFF(CURRENT_DATE, MAX(gs.gameDate)) < 900
      ORDER BY lastActivity DESC
      LIMIT ?
    `;
    
    const start = Date.now();
    const results = await conn.query(query, [minNetBet, limit]);
    const executionTime = Date.now() - start;
    
    functions.logger.info(`쿼리 실행 완료: ${executionTime}ms, 결과 ${results.length}개`);
    
    // 결과 반환
    res.status(200).json({
      success: true,
      message: "Active high-value users retrieved from database",
      params: {
        minNetBet,
        limit
      },
      data: results,
      count: results.length,
      timestamp: new Date().toISOString()
    });
    
  } catch (error) {
    functions.logger.error('데이터베이스 오류:', error);
    res.status(500).json({
      success: false,
      message: "Error retrieving active high-value users",
      error: error.message,
      timestamp: new Date().toISOString()
    });
  } finally {
    if (conn) {
      try {
        conn.release();
        functions.logger.info('데이터베이스 연결 해제');
      } catch (err) {
        functions.logger.error('연결 해제 오류:', err);
      }
    }
  }
});
