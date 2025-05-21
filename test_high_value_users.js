/**
 * 고가치 사용자 분석 테스트 스크립트
 * 
 * 마이그레이션된 JOIN 조건으로 고가치 사용자를 검색하고 결과를 표시합니다.
 */

const mysql = require('mysql2/promise');

async function testHighValueUsers() {
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
  
  try {
    // 활성 고가치 사용자 조회 (수정된 JOIN 조건 사용)
    const minNetBet = 50000;
    const limit = 10;
    
    console.log(`활성 고가치 사용자 조회 (minNetBet=${minNetBet})...`);
    
    const activeUsersQuery = `
      SELECT 
        p.userId,
        COUNT(*) as loginCount,
        MAX(gs.gameDate) as lastActivity,
        DATEDIFF(CURRENT_DATE, MAX(gs.gameDate)) as inactiveDays,
        ROUND(SUM(gs.netBet)) as netBet
      FROM players p
      JOIN game_scores gs ON p.userId = gs.userId
      GROUP BY p.userId
      HAVING SUM(gs.netBet) >= ?
      ORDER BY netBet DESC
      LIMIT ?
    `;
    
    const [activeUsersRows] = await connection.query(activeUsersQuery, [minNetBet, limit]);
    console.log(`활성 고가치 사용자 검색 결과: ${activeUsersRows.length}명`);
    console.table(activeUsersRows);
    
    // 휴면 고가치 사용자 조회 (수정된 JOIN 조건 사용)
    const minInactiveDays = 30;
    
    console.log(`휴면 고가치 사용자 조회 (minNetBet=${minNetBet}, minInactiveDays=${minInactiveDays})...`);
    
    const dormantUsersQuery = `
      SELECT 
        p.userId,
        COUNT(*) as loginCount,
        MAX(gs.gameDate) as lastActivity,
        DATEDIFF(CURRENT_DATE, MAX(gs.gameDate)) as inactiveDays,
        ROUND(SUM(gs.netBet)) as netBet
      FROM players p
      JOIN game_scores gs ON p.userId = gs.userId
      GROUP BY