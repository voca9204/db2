const mariadb = require('mariadb');

// 데이터베이스 연결 정보
const dbConfig = {
  host: '211.248.190.46',
  user: 'hermes',
  password: 'mcygicng!022',
  database: 'hermes',
  connectionLimit: 5
};

// BigInt JSON 직렬화 처리
BigInt.prototype.toJSON = function() { 
  return this.toString() 
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

// 테이블 구조 확인 함수들
async function describeTable(tableName) {
  return executeQuery(`DESCRIBE ${tableName}`);
}

// 예제 쿼리: 게임 스코어 테이블 구조 조회
async function checkGameScoresStructure() {
  return describeTable('game_scores');
}

// 예제 쿼리: 플레이어 테이블 구조 조회
async function checkPlayersStructure() {
  return describeTable('players');
}

// 예제 쿼리: 프로모션 플레이어 테이블 구조 조회
async function checkPromotionPlayersStructure() {
  return describeTable('promotion_players');
}

// 예제 쿼리: 머니 플로우 테이블 구조 조회
async function checkMoneyFlowsStructure() {
  return describeTable('money_flows');
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
    
    // 테이블 구조 확인
    console.log('\n게임 스코어 테이블 구조:');
    const gameScoresStructure = await checkGameScoresStructure();
    console.log(JSON.stringify(gameScoresStructure.result, null, 2));
    
    console.log('\n플레이어 테이블 구조:');
    const playersStructure = await checkPlayersStructure();
    console.log(JSON.stringify(playersStructure.result, null, 2));
    
    console.log('\n프로모션 플레이어 테이블 구조:');
    const promotionPlayersStructure = await checkPromotionPlayersStructure();
    console.log(JSON.stringify(promotionPlayersStructure.result, null, 2));
    
    console.log('\n머니 플로우 테이블 구조:');
    const moneyFlowsStructure = await checkMoneyFlowsStructure();
    console.log(JSON.stringify(moneyFlowsStructure.result, null, 2));
    
  } catch (error) {
    console.error('실행 중 오류 발생:', error);
  } finally {
    // 연결 풀 종료
    pool.end();
  }
}

// 스크립트 실행
main();
