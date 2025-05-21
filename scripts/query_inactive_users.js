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

// 고가치 사용자 식별 쿼리
async function getHighValueUsers(limit = 10) {
  const query = `
    SELECT 
      p.userId, 
      SUM(gs.totalBet) as total_bet, 
      SUM(gs.winLoss) as win_loss,
      COUNT(DISTINCT DATE(gs.gameDate)) as activity_days,
      MAX(gs.gameDate) as last_activity_date
    FROM 
      players p
    JOIN 
      game_scores gs ON p.userId = gs.userId
    WHERE 
      p.status = 0
    GROUP BY 
      p.userId
    HAVING 
      SUM(gs.totalBet) > 1000000
    ORDER BY 
      total_bet DESC
    LIMIT ?
  `;
  
  return executeQuery(query, [limit]);
}

// 비활성 고가치 사용자 식별 쿼리
async function getInactiveHighValueUsers(inactiveDays = 30, limit = 10) {
  const query = `
    SELECT 
      p.userId, 
      SUM(gs.totalBet) as total_bet, 
      SUM(gs.winLoss) as win_loss,
      COUNT(DISTINCT DATE(gs.gameDate)) as activity_days,
      MAX(gs.gameDate) as last_activity_date,
      DATEDIFF(CURRENT_DATE, MAX(gs.gameDate)) as days_inactive
    FROM 
      players p
    JOIN 
      game_scores gs ON p.userId = gs.userId
    WHERE 
      p.status = 0
    GROUP BY 
      p.userId
    HAVING 
      SUM(gs.totalBet) > 1000000 
      AND DATEDIFF(CURRENT_DATE, MAX(gs.gameDate)) >= ?
    ORDER BY 
      days_inactive ASC, total_bet DESC
    LIMIT ?
  `;
  
  return executeQuery(query, [inactiveDays, limit]);
}

// 이벤트 참여 사용자 조회 쿼리
async function getEventParticipants(limit = 10) {
  const query = `
    SELECT 
      p.userId, 
      COUNT(*) as event_count,
      SUM(pp.reward) as total_reward,
      MIN(pp.appliedAt) as first_event_date,
      MAX(pp.appliedAt) as last_event_date
    FROM 
      players p
    JOIN 
      promotion_players pp ON p.id = pp.player
    WHERE 
      pp.appliedAt IS NOT NULL
    GROUP BY 
      p.userId
    ORDER BY 
      event_count DESC
    LIMIT ?
  `;
  
  return executeQuery(query, [limit]);
}

// 이벤트 후 입금한 사용자 조회 쿼리
async function getDepositAfterEvent(limit = 10) {
  const query = `
    SELECT 
      p.userId,
      COUNT(*) AS event_count,
      SUM(pp.reward) AS total_event_reward,
      MIN(pp.appliedAt) AS first_event_date,
      SUM(CASE WHEN mf.createdAt > pp.appliedAt THEN mf.amount ELSE 0 END) AS deposit_after_event,
      COUNT(DISTINCT CASE WHEN mf.createdAt > pp.appliedAt THEN mf.id ELSE NULL END) AS deposit_count_after_event
    FROM 
      players p
    JOIN 
      promotion_players pp ON p.id = pp.player
    LEFT JOIN 
      money_flows mf ON p.id = mf.player AND mf.type = 0
    WHERE 
      pp.appliedAt IS NOT NULL
    GROUP BY 
      p.userId
    HAVING 
      deposit_after_event > 0
    ORDER BY 
      deposit_after_event DESC
    LIMIT ?
  `;
  
  return executeQuery(query, [limit]);
}

// 비활성 고가치 사용자 중 이벤트 후 재활성화된 사용자 조회
async function getReactivatedUsers(inactiveDays = 30, limit = 10) {
  const query = `
    WITH inactive_high_value_users AS (
      SELECT 
        p.id,
        p.userId,
        MAX(gs.gameDate) as last_activity_date,
        SUM(gs.totalBet) as total_bet
      FROM 
        players p
      JOIN 
        game_scores gs ON p.userId = gs.userId
      GROUP BY 
        p.id, p.userId
      HAVING 
        total_bet > 1000000
        AND DATEDIFF((SELECT MIN(pp.appliedAt) FROM promotion_players pp WHERE pp.player = p.id AND pp.appliedAt IS NOT NULL), MAX(gs.gameDate)) >= ?
    )
    SELECT 
      ihvu.userId,
      ihvu.last_activity_date,
      ihvu.total_bet,
      MIN(pp.appliedAt) as first_event_date,
      MIN(gs2.gameDate) as first_activity_after_event,
      DATEDIFF(MIN(gs2.gameDate), MIN(pp.appliedAt)) as days_to_reactivation,
      SUM(CASE WHEN gs2.gameDate > pp.appliedAt THEN gs2.totalBet ELSE 0 END) as bet_after_event,
      SUM(CASE WHEN mf.createdAt > pp.appliedAt THEN mf.amount ELSE 0 END) as deposit_after_event
    FROM 
      inactive_high_value_users ihvu
    JOIN 
      promotion_players pp ON ihvu.id = pp.player
    JOIN 
      game_scores gs2 ON ihvu.userId = gs2.userId AND gs2.gameDate > pp.appliedAt
    LEFT JOIN 
      money_flows mf ON ihvu.id = mf.player AND mf.type = 0 AND mf.createdAt > pp.appliedAt
    WHERE 
      pp.appliedAt IS NOT NULL
    GROUP BY 
      ihvu.userId, ihvu.last_activity_date, ihvu.total_bet
    HAVING 
      bet_after_event > 0
    ORDER BY 
      deposit_after_event DESC
    LIMIT ?
  `;
  
  return executeQuery(query, [inactiveDays, limit]);
}

// 실행할 함수 선택 및 실행
async function main() {
  try {
    console.log('고가치 사용자 식별 쿼리 실행 중...');
    const highValueUsers = await getHighValueUsers(5);
    if (highValueUsers.success) {
      console.log('\n== 고가치 사용자 목록 ==');
      console.log(JSON.stringify(highValueUsers.result, null, 2));
    }
    
    console.log('\n비활성 고가치 사용자 식별 쿼리 실행 중...');
    const inactiveUsers = await getInactiveHighValueUsers(30, 5);
    if (inactiveUsers.success) {
      console.log('\n== 비활성 고가치 사용자 목록 ==');
      console.log(JSON.stringify(inactiveUsers.result, null, 2));
    }
    
    console.log('\n이벤트 참여 사용자 조회 쿼리 실행 중...');
    const eventUsers = await getEventParticipants(5);
    if (eventUsers.success) {
      console.log('\n== 이벤트 참여 사용자 목록 ==');
      console.log(JSON.stringify(eventUsers.result, null, 2));
    }
    
    console.log('\n이벤트 후 입금한 사용자 조회 쿼리 실행 중...');
    const depositUsers = await getDepositAfterEvent(5);
    if (depositUsers.success) {
      console.log('\n== 이벤트 후 입금한 사용자 목록 ==');
      console.log(JSON.stringify(depositUsers.result, null, 2));
    }
    
    console.log('\n비활성 상태에서 이벤트 후 재활성화된 사용자 조회 중...');
    const reactivatedUsers = await getReactivatedUsers(30, 5);
    if (reactivatedUsers.success) {
      console.log('\n== 이벤트 후 재활성화된 사용자 목록 ==');
      console.log(JSON.stringify(reactivatedUsers.result, null, 2));
    }
    
  } catch (error) {
    console.error('실행 중 오류 발생:', error);
  } finally {
    // 연결 풀 종료
    pool.end();
  }
}

// 스크립트 실행
main();
