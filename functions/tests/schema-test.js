// /users/sinclair/projects/db2/functions/tests/schema-test.js

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

async function verifyTableSchema() {
  const pool = mysql.createPool(DB_CONFIG);
  
  try {
    // 연결 가져오기
    const connection = await pool.getConnection();
    
    try {
      // 1. game_scores 테이블의 netBet 필드 확인
      console.log("\n--- Game_scores netBet 필드 확인 ---");
      const [netBetField] = await connection.query("SHOW COLUMNS FROM game_scores LIKE 'netBet'");
      console.log(netBetField);
      
      // 2. netBet 값의 기본 통계 확인
      console.log("\n--- NetBet 기본 통계 ---");
      const [netBetStats] = await connection.query(`
        SELECT 
          MIN(netBet) as min_value,
          MAX(netBet) as max_value,
          AVG(netBet) as avg_value,
          COUNT(*) as total_count,
          COUNT(CASE WHEN netBet >= 50000 THEN 1 END) as high_value_count
        FROM game_scores
      `);
      console.log(netBetStats[0]);
      
      // 3. 사용자별 넷베팅 합계 확인 (top 10)
      console.log("\n--- 사용자별 netBet 합계 (상위 10명) ---");
      const [topNetBetUsers] = await connection.query(`
        SELECT userId, SUM(netBet) as total_netBet
        FROM game_scores
        GROUP BY userId
        ORDER BY total_netBet DESC
        LIMIT 10
      `);
      console.log(topNetBetUsers);
      
      // 4. netBet >= 50000인 사용자 수 확인
      console.log("\n--- netBet >= 50000인 사용자 수 ---");
      const [highValueUsers] = await connection.query(`
        SELECT COUNT(*) as count
        FROM (
          SELECT userId
          FROM game_scores
          GROUP BY userId
          HAVING SUM(netBet) >= 50000
        ) as high_value_users
      `);
      console.log(highValueUsers[0]);
      
      // 5. 플레이어 테이블과 게임스코어 테이블 간의 조인 테스트
      console.log("\n--- players와 game_scores 조인 테스트 (p.id = gs.userId) ---");
      const [joinTest1] = await connection.query(`
        SELECT COUNT(*) as count
        FROM players p
        JOIN game_scores gs ON p.id = gs.userId
      `);
      console.log(joinTest1[0]);
      
      console.log("\n--- players와 game_scores 조인 테스트 (p.userId = gs.userId) ---");
      const [joinTest2] = await connection.query(`
        SELECT COUNT(*) as count
        FROM players p
        JOIN game_scores gs ON p.userId = gs.userId
      `);
      console.log(joinTest2[0]);
      
    } finally {
      connection.release();
    }
  } finally {
    // 풀 종료
    await pool.end();
  }
}

verifyTableSchema()
  .then(() => console.log('Schema verification completed'))
  .catch(err => console.error('Error verifying schema:', err));
