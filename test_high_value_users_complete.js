/**
 * 고가치 사용자 분석 테스트 스크립트
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
    // 최소 유효배팅 금액 설정
    const minNetBet = 50000;
    const limit = 10;
    
    // 1. 활성 고가치 사용자 조회 (수정된 JOIN 조건 사용)
    console.log(`\n활성 고가치 사용자 조회 (minNetBet=${minNetBet})...`);
    
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
    
    // 2. 휴면 고가치 사용자 조회 (수정된 JOIN 조건 사용)
    const minInactiveDays = 30;
    
    console.log(`\n휴면 고가치 사용자 조회 (minNetBet=${minNetBet}, minInactiveDays=${minInactiveDays})...`);
    
    const dormantUsersQuery = `
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
        AND DATEDIFF(CURRENT_DATE, MAX(gs.gameDate)) >= ?
      ORDER BY netBet DESC
      LIMIT ?
    `;
    
    const [dormantUsersRows] = await connection.query(dormantUsersQuery, [minNetBet, minInactiveDays, limit]);
    console.log(`휴면 고가치 사용자 검색 결과: ${dormantUsersRows.length}명`);
    console.table(dormantUsersRows);
    
    // 3. 테스트: 이전 JOIN 조건(p.id = gs.userId)과 새 JOIN 조건(p.userId = gs.userId) 비교
    console.log('\nJOIN 조건 비교 테스트...');
    
    // 이전 JOIN 조건
    const oldJoinCountQuery = `
      SELECT COUNT(*) as count 
      FROM players p
      JOIN game_scores gs ON p.id = gs.userId
    `;
    const [oldJoinResult] = await connection.query(oldJoinCountQuery);
    console.log('이전 JOIN 조건(p.id = gs.userId)으로 검색된 레코드 수:', oldJoinResult[0].count);
    
    // 새 JOIN 조건
    const newJoinCountQuery = `
      SELECT COUNT(*) as count 
      FROM players p
      JOIN game_scores gs ON p.userId = gs.userId
    `;
    const [newJoinResult] = await connection.query(newJoinCountQuery);
    console.log('새 JOIN 조건(p.userId = gs.userId)으로 검색된 레코드 수:', newJoinResult[0].count);
    
    console.log(`JOIN 조건 변경으로 인한 데이터 증가: ${newJoinResult[0].count - oldJoinResult[0].count}개`);
    
    // 4. 고가치 사용자 통계
    console.log('\n고가치 사용자 통계 (minNetBet >= 50000)...');
    
    const statsQuery = `
      SELECT 
        COUNT(*) as totalUsers,
        SUM(CASE WHEN inactiveDays < 30 THEN 1 ELSE 0 END) as activeUsers,
        SUM(CASE WHEN inactiveDays >= 30 THEN 1 ELSE 0 END) as dormantUsers,
        ROUND(AVG(netBet)) as avgNetBet,
        MAX(netBet) as maxNetBet,
        MIN(netBet) as minNetBet
      FROM (
        SELECT 
          p.userId,
          COUNT(*) as loginCount,
          MAX(gs.gameDate) as lastActivity,
          DATEDIFF(CURRENT_DATE, MAX(gs.gameDate)) as inactiveDays,
          ROUND(SUM(gs.netBet)) as netBet
        FROM players p
        JOIN game_scores gs ON p.userId = gs.userId
        GROUP BY p.userId
        HAVING SUM(gs.netBet) >= ${minNetBet}
      ) as high_value_users
    `;
    
    const [statsResult] = await connection.query(statsQuery);
    console.log('고가치 사용자 통계:');
    console.table(statsResult);

    // 5. 이벤트 참여 및 베팅 관계 분석
    console.log('\n이벤트 참여 및 베팅 관계 분석...');
    
    // 이벤트 지급 완료된 사용자 조회
    const eventUsersQuery = `
      SELECT 
        p.userId,
        COUNT(DISTINCT pp.promotion) as eventCount,
        SUM(pp.reward) as totalReward,
        MAX(pp.appliedAt) as lastEventDate,
        DATEDIFF(CURRENT_DATE, MAX(pp.appliedAt)) as daysSinceLastEvent
      FROM players p
      JOIN promotion_players pp ON p.id = pp.player
      WHERE pp.appliedAt IS NOT NULL
      GROUP BY p.userId
      ORDER BY eventCount DESC
      LIMIT 10
    `;
    
    try {
      const [eventUsersRows] = await connection.query(eventUsersQuery);
      console.log(`이벤트 참여 사용자 검색 결과: ${eventUsersRows.length}명`);
      console.table(eventUsersRows);
      
      // 추가: 이벤트 참여 후 입금 현황
      if (eventUsersRows.length > 0) {
        const sampleUserId = eventUsersRows[0].userId;
        
        console.log(`\n샘플 사용자(${sampleUserId})의 이벤트 참여 후 입금 현황...`);
        
        const userDepositQuery = `
          SELECT 
            p.userId,
            DATE(mf.createdAt) as depositDate,
            SUM(mf.amount) as depositAmount,
            COUNT(*) as depositCount
          FROM players p
          JOIN money_flows mf ON p.id = mf.player
          JOIN promotion_players pp ON p.id = pp.player
          WHERE p.userId = ?
            AND mf.type = 0 -- 입금
            AND mf.createdAt > pp.appliedAt -- 이벤트 지급 이후
            AND pp.appliedAt IS NOT NULL
          GROUP BY p.userId, depositDate
          ORDER BY depositDate
        `;
        
        const [userDepositRows] = await connection.query(userDepositQuery, [sampleUserId]);
        console.log(`이벤트 지급 후 입금 기록: ${userDepositRows.length}건`);
        console.table(userDepositRows);
      }
    } catch (error) {
      console.error('이벤트 분석 오류:', error);
    }
    
  } catch (error) {
    console.error('조회 오류:', error);
  } finally {
    // 연결 해제
    connection.release();
    console.log('\n데이터베이스 연결 해제');
    process.exit(0);
  }
}

// 스크립트 실행
testHighValueUsers();

// 스크립트 실행
testHighValueUsers();
