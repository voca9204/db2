const mysql = require('mysql2/promise');

async function testQuery() {
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
    
    // 테이블 구조 확인
    console.log('game_scores 테이블 구조 확인 중...');
    const [columns] = await connection.query(`
      SHOW COLUMNS FROM game_scores
    `);
    console.log('game_scores 테이블 컬럼:', columns.map(col => col.Field));
    
    // 테이블 샘플 데이터 확인
    console.log('테이블 샘플 데이터 확인 중...');
    const [samplePlayer] = await connection.query(`
      SELECT * FROM players LIMIT 1
    `);
    console.log('players 샘플 데이터:', samplePlayer[0]);
    
    const [sampleGameScore] = await connection.query(`
      SELECT * FROM game_scores LIMIT 1
    `);
    console.log('game_scores 샘플 데이터:', sampleGameScore[0]);
    
    // 기본 테스트 쿼리
    console.log('기본 테스트 쿼리 실행 (필터 최소화)...');
    const testQuery = `
      SELECT 
        p.userId,
        COUNT(*) as loginCount,
        MAX(gs.gameDate) as lastActivity,
        DATEDIFF(CURRENT_DATE, MAX(gs.gameDate)) as inactiveDays,
        ROUND(SUM(gs.netBet)) as netBet
      FROM players p
      JOIN game_scores gs ON p.id = gs.userId
      GROUP BY p.userId
      LIMIT 10
    `;
    
    const [testRows] = await connection.query(testQuery);
    console.log(`기본 테스트 쿼리 결과: ${testRows.length}개 행`);
    if (testRows.length > 0) {
      console.log('테스트 쿼리 첫 번째 결과:', testRows[0]);
    }
    
    // 실제 쿼리 (minNetBet만 적용)
    console.log('minNetBet 필터링만 적용한 쿼리 실행 중...');
    const minNetBet = 1000;
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
      LIMIT 10
    `;
    
    const [rows] = await connection.query(query, [minNetBet]);
    console.log(`최종 쿼리 결과: ${rows.length}개 행 반환됨`);
    if (rows.length > 0) {
      rows.forEach((row, index) => {
        console.log(`결과 ${index + 1}:`, row);
      });
    }
    
    // 연결 해제
    connection.release();
    console.log('데이터베이스 연결 해제');
    
    process.exit(0);
  } catch (error) {
    console.error('오류 발생:', error);
    process.exit(1);
  }
}

testQuery();
