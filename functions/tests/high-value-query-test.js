// /users/sinclair/projects/db2/functions/tests/high-value-query-test.js

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

async function testHighValueQuery() {
  const pool = mysql.createPool(DB_CONFIG);
  
  try {
    // 연결 가져오기
    const connection = await pool.getConnection();
    
    try {
      // 테스트 1: 기본 쿼리 (minNetBet=50000)
      console.log("\n--- 테스트 1: 기본 쿼리 (minNetBet=50000) ---");
      const basicQuery = `
        SELECT 
          p.userId,
          COUNT(*) as loginCount,
          MAX(gs.gameDate) as lastActivity,
          DATEDIFF(CURRENT_DATE, MAX(gs.gameDate)) as inactiveDays,
          ROUND(SUM(gs.netBet)) as netBet
        FROM players p
        JOIN game_scores gs ON p.id = gs.userId
        GROUP BY p.userId
        HAVING SUM(gs.netBet) >= 50000
        ORDER BY inactiveDays ASC
        LIMIT 10
      `;
      
      const [basicResults] = await connection.query(basicQuery);
      console.log(`결과 수: ${basicResults.length}`);
      if (basicResults.length > 0) {
        console.log("첫 번째 결과:", basicResults[0]);
      } else {
        console.log("결과 없음");
      }
      
      // 테스트 2: 조인 조건 변경 (p.userId = gs.userId)
      console.log("\n--- 테스트 2: 조인 조건 변경 (p.userId = gs.userId) ---");
      const modifiedJoinQuery = `
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
      
      const [modifiedJoinResults] = await connection.query(modifiedJoinQuery);
      console.log(`결과 수: ${modifiedJoinResults.length}`);
      if (modifiedJoinResults.length > 0) {
        console.log("첫 번째 결과:", modifiedJoinResults[0]);
      } else {
        console.log("결과 없음");
      }
      
      // 테스트 3: minNetBet 값 낮추기 (1000)
      console.log("\n--- 테스트 3: minNetBet 값 낮추기 (1000) ---");
      const lowerThresholdQuery = `
        SELECT 
          p.userId,
          COUNT(*) as loginCount,
          MAX(gs.gameDate) as lastActivity,
          DATEDIFF(CURRENT_DATE, MAX(gs.gameDate)) as inactiveDays,
          ROUND(SUM(gs.netBet)) as netBet
        FROM players p
        JOIN game_scores gs ON p.id = gs.userId
        GROUP BY p.userId
        HAVING SUM(gs.netBet) >= 1000
        ORDER BY inactiveDays ASC
        LIMIT 10
      `;
      
      const [lowerThresholdResults] = await connection.query(lowerThresholdQuery);
      console.log(`결과 수: ${lowerThresholdResults.length}`);
      if (lowerThresholdResults.length > 0) {
        console.log("첫 번째 결과:", lowerThresholdResults[0]);
      } else {
        console.log("결과 없음");
      }
      
      // 테스트 4: totalBet 필드 사용
      console.log("\n--- 테스트 4: totalBet 필드 사용 (minTotalBet=50000) ---");
      const totalBetQuery = `
        SELECT 
          p.userId,
          COUNT(*) as loginCount,
          MAX(gs.gameDate) as lastActivity,
          DATEDIFF(CURRENT_DATE, MAX(gs.gameDate)) as inactiveDays,
          ROUND(SUM(gs.totalBet)) as totalBet
        FROM players p
        JOIN game_scores gs ON p.id = gs.userId
        GROUP BY p.userId
        HAVING SUM(gs.totalBet) >= 50000
        ORDER BY inactiveDays ASC
        LIMIT 10
      `;
      
      const [totalBetResults] = await connection.query(totalBetQuery);
      console.log(`결과 수: ${totalBetResults.length}`);
      if (totalBetResults.length > 0) {
        console.log("첫 번째 결과:", totalBetResults[0]);
      } else {
        console.log("결과 없음");
      }
      
    } finally {
      connection.release();
    }
  } finally {
    // 풀 종료
    await pool.end();
  }
}

testHighValueQuery()
  .then(() => console.log('High value query tests completed'))
  .catch(err => console.error('Error testing high value queries:', err));
