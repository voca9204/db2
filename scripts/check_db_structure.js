const mariadb = require('mariadb');

// 데이터베이스 연결 정보
const dbConfig = {
  host: '211.248.190.46',
  user: 'hermes',
  password: 'mcygicng!022',
  database: 'hermes',
  connectionLimit: 5
};

// 연결 풀 생성
const pool = mariadb.createPool(dbConfig);

async function testConnection() {
  let conn;
  try {
    conn = await pool.getConnection();
    console.log('데이터베이스 연결 성공!');
    
    // 간단한 테스트 쿼리 실행
    const result = await conn.query('SELECT 1 as test');
    console.log('쿼리 테스트 결과:', result);
    
    return { success: true, result };
  } catch (error) {
    console.error('데이터베이스 연결 오류:', error);
    return { success: false, error: error.message };
  } finally {
    if (conn) {
      conn.release();
      console.log('데이터베이스 연결 해제');
    }
  }
}

// 테이블 구조 확인 쿼리
async function showTables() {
  return executeQuery("SHOW TABLES");
}

async function describeTable(tableName) {
  return executeQuery(`DESCRIBE ${tableName}`);
}

// 간단한 쿼리 실행 함수
async function executeQuery(query, params = []) {
  let conn;
  try {
    conn = await pool.getConnection();
    console.log('쿼리 실행 시작:', query);
    console.log('파라미터:', params);
    
    const result = await conn.query(query, params);
    console.log(`쿼리 실행 완료: ${result.length || result.affectedRows || 0} 행 영향받음`);
    
    return { success: true, result };
  } catch (error) {
    console.error('쿼리 실행 오류:', error);
    return { success: false, error: error.message };
  } finally {
    if (conn) {
      conn.release();
    }
  }
}

// 고가치 사용자 식별 위한 게임 스코어 테이블 구조 확인
async function checkGameScoresTable() {
  return executeQuery("SELECT * FROM game_scores LIMIT 1");
}

// 고가치 사용자 식별 위한 플레이어 테이블 구조 확인
async function checkPlayersTable() {
  return executeQuery("SELECT * FROM players LIMIT 1");
}

// 프로모션 플레이어 테이블 구조 확인
async function checkPromotionPlayersTable() {
  return executeQuery("SELECT * FROM promotion_players LIMIT 1");
}

// 머니 플로우 테이블 구조 확인
async function checkMoneyFlowsTable() {
  return executeQuery("SELECT * FROM money_flows LIMIT 1");
}

// 간단한 활성 사용자 조회 쿼리
async function getActiveUsers(limit = 5) {
  const query = `
    SELECT userId, status 
    FROM players 
    WHERE status = 0 
    LIMIT ?
  `;
  
  return executeQuery(query, [limit]);
}

// 실행할 함수 선택 및 실행
async function main() {
  try {
    // 데이터베이스 연결 테스트
    const connectionTest = await testConnection();
    if (!connectionTest.success) {
      console.error('데이터베이스 연결 테스트 실패');
      return;
    }
    
    // 테이블 목록 확인
    console.log('\n테이블 목록:');
    const tables = await showTables();
    console.log(JSON.stringify(tables.result, null, 2));
    
    // 주요 테이블 구조 확인
    console.log('\n게임 스코어 테이블 확인:');
    const gameScores = await checkGameScoresTable();
    console.log(JSON.stringify(gameScores.result, null, 2));
    
    console.log('\n플레이어 테이블 확인:');
    const players = await checkPlayersTable();
    console.log(JSON.stringify(players.result, null, 2));
    
    console.log('\n프로모션 플레이어 테이블 확인:');
    const promotionPlayers = await checkPromotionPlayersTable();
    console.log(JSON.stringify(promotionPlayers.result, null, 2));
    
    console.log('\n머니 플로우 테이블 확인:');
    const moneyFlows = await checkMoneyFlowsTable();
    console.log(JSON.stringify(moneyFlows.result, null, 2));
    
    // 간단한 활성 사용자 조회
    console.log('\n활성 사용자 목록:');
    const activeUsers = await getActiveUsers();
    console.log(JSON.stringify(activeUsers.result, null, 2));
    
  } catch (error) {
    console.error('실행 중 오류 발생:', error);
  } finally {
    // 연결 풀 종료
    pool.end();
  }
}

// 스크립트 실행
main();
