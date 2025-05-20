// /users/sinclair/projects/db2/functions/tests/fixed-query-test.js

const mysql = require('mysql2/promise');

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

async function testFixedQueries() {
  const pool = mysql.createPool(DB_CONFIG);
  
  try {
    // 연결 가져오기
    const connection = await pool.getConnection();
    
    try {
      // 수정된 고가치 사용자 쿼리 (minNetBet=50000, 올바른 조인 조건 적용)
      console.log("\n--- 수정된 고가치 사용자 쿼리 (minNetBet=50000) ---");
      const fixedQuery = `
        SELECT 
          p.userId,
          COUNT(*) as loginCount,
          MAX(gs.gameDate) as lastActivity,
          DATEDIFF(CURRENT_DATE, MAX(gs.gameDate)) as inactiveDays,
          ROUND(SUM(gs.netBet)) as netBet
        FROM players p
        JOIN game_scores gs ON p.userId = gs.userId
        GROUP BY p.userId
        HAVING SUM(gs.netBet) >= 50000
        ORDER BY inactiveDays ASC
        LIMIT 10
      `;
      
      const [fixedResults] = await connection.query(fixedQuery);
      console.log(`결과 수: ${fixedResults.length}`);
      console.log("결과 목록:");
      fixedResults.forEach((row, index) => {
        console.log(`${index + 1}. userId: ${row.userId}, inactiveDays: ${row.inactiveDays}, netBet: ${row.netBet}`);
      });
      
      // 제한 조건 추가된 쿼리 (활성 플레이어만, 비활성 기간 제한)
      console.log("\n--- 제한 조건 추가 쿼리 (활성 플레이어 + 30일 이상 비활성) ---");
      const enhancedQuery = `
        SELECT 
          p.userId,
          COUNT(*) as loginCount,
          MAX(gs.gameDate) as lastActivity,
          DATEDIFF(CURRENT_DATE, MAX(gs.gameDate)) as inactiveDays,
          ROUND(SUM(gs.netBet)) as netBet
        FROM players p
        JOIN game_scores gs ON p.userId = gs.userId
        WHERE p.status = 0  -- 활성 플레이어만
        GROUP BY p.userId
        HAVING 
          SUM(gs.netBet) >= 50000
          AND DATEDIFF(CURRENT_DATE, MAX(gs.gameDate)) >= 30  -- 30일 이상 비활성
        ORDER BY inactiveDays ASC
        LIMIT 10
      `;
      
      const [enhancedResults] = await connection.query(enhancedQuery);
      console.log(`결과 수: ${enhancedResults.length}`);
      console.log("결과 목록:");
      enhancedResults.forEach((row, index) => {
        console.log(`${index + 1}. userId: ${row.userId}, inactiveDays: ${row.inactiveDays}, netBet: ${row.netBet}`);
      });
      
    } finally {
      connection.release();
    }
  } finally {
    // 풀 종료
    await pool.end();
  }
}

testFixedQueries()
  .then(() => console.log('Fixed queries test completed'))
  .catch(err => console.error('Error testing fixed queries:', err));
