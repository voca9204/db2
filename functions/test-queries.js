const mysql = require('mysql2/promise');

async function testActiveUsersQuery() {
  try {
    // 데이터베이스 연결 설정
    const dbConfig = {
      host: '211.248.190.46',
      user: 'hermes',
      password: 'mcygicng!022',
      database: 'hermes',
      waitForConnections: true,
      connectionLimit: 2,
      queueLimit: 0,
      connectTimeout: 10000
    };
    
    console.log('데이터베이스 연결 시도...');
    const pool = mysql.createPool(dbConfig);
    const connection = await pool.getConnection();
    console.log('데이터베이스 연결 성공');
    
    // 활성 사용자 쿼리 (900일 이내)
    console.log('활성 사용자 쿼리 실행 중 (900일 이내)...');
    const minNetBet = 1000;
    const activeQuery = `
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
      LIMIT 10
    `;
    
    const [activeRows] = await connection.query(activeQuery, [minNetBet]);
    console.log(`활성 사용자 쿼리 결과: ${activeRows.length}개 행 반환됨`);
    console.log('활성 사용자 첫 번째 결과:', activeRows[0]);
    
    // 비활성 사용자 쿼리 (30일 이상)
    console.log('비활성 사용자 쿼리 실행 중 (30일 이상)...');
    const dormantQuery = `
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
      AND DATEDIFF(CURRENT_DATE, MAX(gs.gameDate)) >= 30
      ORDER BY inactiveDays DESC
      LIMIT 10
    `;
    
    const [dormantRows] = await connection.query(dormantQuery, [minNetBet]);
    console.log(`비활성 사용자 쿼리 결과: ${dormantRows.length}개 행 반환됨`);
    console.log('비활성 사용자 첫 번째 결과:', dormantRows[0]);
    
    // 연결 해제
    connection.release();
    console.log('데이터베이스 연결 해제');
    
    process.exit(0);
  } catch (error) {
    console.error('오류 발생:', error);
    process.exit(1);
  }
}

testActiveUsersQuery();
