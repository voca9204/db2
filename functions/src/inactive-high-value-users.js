const functions = require('firebase-functions');
const mariadb = require('mariadb');

// 데이터베이스 연결 설정
const dbConfig = {
  host: '211.248.190.46',
  user: 'hermes',
  password: 'mcygicng!022',
  database: 'hermes',
  connectionLimit: 5,
  connectTimeout: 10000 // 10초 타임아웃
};

// BigInt JSON 직렬화 처리
BigInt.prototype.toJSON = function() { 
  return this.toString() 
};

// 연결 풀 생성
let pool;

/**
 * 연결 풀을 초기화하고 반환합니다.
 */
function getPool() {
  if (!pool) {
    console.log('데이터베이스 연결 풀 초기화');
    pool = mariadb.createPool(dbConfig);
  }
  return pool;
}

/**
 * 데이터베이스 쿼리를 실행합니다.
 */
async function executeQuery(query, params = []) {
  let conn;
  try {
    conn = await getPool().getConnection();
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

/**
 * 고가치 사용자 목록을 조회합니다.
 */
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

/**
 * 비활성 고가치 사용자 목록을 조회합니다.
 */
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

/**
 * 이벤트 참여 사용자 목록을 조회합니다.
 */
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

/**
 * 이벤트 후 입금한 사용자 목록을 조회합니다.
 */
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

// 고가치 활성 사용자 조회 함수 (HTTP 트리거)
exports.activeUsers = functions.https.onRequest(async (req, res) => {
  try {
    // CORS 헤더 설정
    res.set('Access-Control-Allow-Origin', '*');
    
    // OPTIONS 요청 처리 (CORS preflight)
    if (req.method === 'OPTIONS') {
      res.set('Access-Control-Allow-Methods', 'GET');
      res.set('Access-Control-Allow-Headers', 'Content-Type');
      res.status(204).send('');
      return;
    }
    
    // 요청 파라미터 처리
    const limit = parseInt(req.query.limit) || 10;
    
    // 데이터 조회
    const result = await getHighValueUsers(limit);
    
    // 응답 반환
    if (result.success) {
      res.status(200).json({
        success: true,
        timestamp: new Date().toISOString(),
        data: result.result
      });
    } else {
      res.status(500).json({
        success: false,
        timestamp: new Date().toISOString(),
        error: result.error
      });
    }
  } catch (error) {
    console.error('함수 실행 오류:', error);
    res.status(500).json({
      success: false,
      timestamp: new Date().toISOString(),
      error: error.message
    });
  }
});

// 비활성 고가치 사용자 조회 함수 (HTTP 트리거)
exports.inactiveUsers = functions.https.onRequest(async (req, res) => {
  try {
    // CORS 헤더 설정
    res.set('Access-Control-Allow-Origin', '*');
    
    // OPTIONS 요청 처리 (CORS preflight)
    if (req.method === 'OPTIONS') {
      res.set('Access-Control-Allow-Methods', 'GET');
      res.set('Access-Control-Allow-Headers', 'Content-Type');
      res.status(204).send('');
      return;
    }
    
    // 요청 파라미터 처리
    const days = parseInt(req.query.days) || 30;
    const limit = parseInt(req.query.limit) || 10;
    
    // 데이터 조회
    const result = await getInactiveHighValueUsers(days, limit);
    
    // 응답 반환
    if (result.success) {
      res.status(200).json({
        success: true,
        timestamp: new Date().toISOString(),
        inactiveDays: days,
        data: result.result
      });
    } else {
      res.status(500).json({
        success: false,
        timestamp: new Date().toISOString(),
        error: result.error
      });
    }
  } catch (error) {
    console.error('함수 실행 오류:', error);
    res.status(500).json({
      success: false,
      timestamp: new Date().toISOString(),
      error: error.message
    });
  }
});

// 이벤트 참여 사용자 조회 함수 (HTTP 트리거)
exports.eventParticipants = functions.https.onRequest(async (req, res) => {
  try {
    // CORS 헤더 설정
    res.set('Access-Control-Allow-Origin', '*');
    
    // OPTIONS 요청 처리 (CORS preflight)
    if (req.method === 'OPTIONS') {
      res.set('Access-Control-Allow-Methods', 'GET');
      res.set('Access-Control-Allow-Headers', 'Content-Type');
      res.status(204).send('');
      return;
    }
    
    // 요청 파라미터 처리
    const limit = parseInt(req.query.limit) || 10;
    
    // 데이터 조회
    const result = await getEventParticipants(limit);
    
    // 응답 반환
    if (result.success) {
      res.status(200).json({
        success: true,
        timestamp: new Date().toISOString(),
        data: result.result
      });
    } else {
      res.status(500).json({
        success: false,
        timestamp: new Date().toISOString(),
        error: result.error
      });
    }
  } catch (error) {
    console.error('함수 실행 오류:', error);
    res.status(500).json({
      success: false,
      timestamp: new Date().toISOString(),
      error: error.message
    });
  }
});

// 이벤트 후 입금 사용자 조회 함수 (HTTP 트리거)
exports.depositAfterEvent = functions.https.onRequest(async (req, res) => {
  try {
    // CORS 헤더 설정
    res.set('Access-Control-Allow-Origin', '*');
    
    // OPTIONS 요청 처리 (CORS preflight)
    if (req.method === 'OPTIONS') {
      res.set('Access-Control-Allow-Methods', 'GET');
      res.set('Access-Control-Allow-Headers', 'Content-Type');
      res.status(204).send('');
      return;
    }
    
    // 요청 파라미터 처리
    const limit = parseInt(req.query.limit) || 10;
    
    // 데이터 조회
    const result = await getDepositAfterEvent(limit);
    
    // 응답 반환
    if (result.success) {
      res.status(200).json({
        success: true,
        timestamp: new Date().toISOString(),
        data: result.result
      });
    } else {
      res.status(500).json({
        success: false,
        timestamp: new Date().toISOString(),
        error: result.error
      });
    }
  } catch (error) {
    console.error('함수 실행 오류:', error);
    res.status(500).json({
      success: false,
      timestamp: new Date().toISOString(),
      error: error.message
    });
  }
});

// 대시보드 종합 데이터 조회 함수 (HTTP 트리거)
exports.inactiveUsersDashboard = functions.https.onRequest(async (req, res) => {
  try {
    // CORS 헤더 설정
    res.set('Access-Control-Allow-Origin', '*');
    
    // OPTIONS 요청 처리 (CORS preflight)
    if (req.method === 'OPTIONS') {
      res.set('Access-Control-Allow-Methods', 'GET');
      res.set('Access-Control-Allow-Headers', 'Content-Type');
      res.status(204).send('');
      return;
    }
    
    // 요청 파라미터 처리
    const days = parseInt(req.query.days) || 30;
    const limit = parseInt(req.query.limit) || 10;
    
    // 모든 데이터 병렬 조회
    const [activeUsersResult, inactiveUsersResult, eventParticipantsResult, depositAfterEventResult] = await Promise.all([
      getHighValueUsers(limit),
      getInactiveHighValueUsers(days, limit),
      getEventParticipants(limit),
      getDepositAfterEvent(limit)
    ]);
    
    // 오류 확인
    if (!activeUsersResult.success || !inactiveUsersResult.success || 
        !eventParticipantsResult.success || !depositAfterEventResult.success) {
      res.status(500).json({
        success: false,
        timestamp: new Date().toISOString(),
        error: "하나 이상의 쿼리에서 오류가 발생했습니다."
      });
      return;
    }
    
    // 종합 통계 계산
    const activeUsers = activeUsersResult.result;
    const inactiveUsers = inactiveUsersResult.result;
    const eventParticipants = eventParticipantsResult.result;
    const depositAfterEvent = depositAfterEventResult.result;
    
    // 간단한 통계 정보 생성
    const stats = {
      totalHighValueUsers: activeUsers.length,
      totalInactiveUsers: inactiveUsers.length,
      totalEventParticipants: eventParticipants.length,
      totalDepositUsers: depositAfterEvent.length,
      totalEventRewards: depositAfterEvent.reduce((sum, user) => sum + parseFloat(user.total_event_reward), 0),
      totalDepositsAfterEvent: depositAfterEvent.reduce((sum, user) => sum + parseFloat(user.deposit_after_event), 0),
      averageDepositPerUser: depositAfterEvent.length > 0 
        ? depositAfterEvent.reduce((sum, user) => sum + parseFloat(user.deposit_after_event), 0) / depositAfterEvent.length 
        : 0,
      conversionRate: eventParticipants.length > 0 
        ? (depositAfterEvent.length / eventParticipants.length * 100).toFixed(2) 
        : 0
    };
    
    // 응답 반환
    res.status(200).json({
      success: true,
      timestamp: new Date().toISOString(),
      inactiveDays: days,
      stats,
      data: {
        activeUsers,
        inactiveUsers,
        eventParticipants,
        depositAfterEvent
      }
    });
  } catch (error) {
    console.error('함수 실행 오류:', error);
    res.status(500).json({
      success: false,
      timestamp: new Date().toISOString(),
      error: error.message
    });
  }
});
