/**
 * 간소화된 고가치 사용자 조회 함수
 * 데이터베이스 호환성 문제를 해결하기 위해 최소한의 기능만 구현
 */
const functions = require('firebase-functions');
const mysql = require('mysql2/promise');

// 연결 풀 생성 함수
const createPool = () => {
  return mysql.createPool({
    host: '211.248.190.46',
    user: 'hermes',
    password: 'mcygicng!022',
    database: 'hermes',
    waitForConnections: true,
    connectionLimit: 5,
    queueLimit: 0
  });
};

// 고가치 사용자 조회 함수
exports.getHighValueUsers = functions.https.onRequest(async (req, res) => {
  // CORS 처리
  res.set('Access-Control-Allow-Origin', '*');
  
  if (req.method === 'OPTIONS') {
    // CORS preflight 응답
    res.set('Access-Control-Allow-Methods', 'GET');
    res.set('Access-Control-Allow-Headers', 'Content-Type');
    res.status(204).send('');
    return;
  }
  
  try {
    // 파라미터 파싱
    const minNetBet = parseInt(req.query.minNetBet || '50000', 10);
    const days = parseInt(req.query.days || '30', 10);
    const limit = parseInt(req.query.limit || '100', 10);
    const page = parseInt(req.query.page || '1', 10);
    
    // 입력값 검증
    if (isNaN(minNetBet) || minNetBet < 0) {
      return res.status(400).json({ error: 'Invalid minNetBet parameter' });
    }
    if (isNaN(days) || days <= 0) {
      return res.status(400).json({ error: 'Invalid days parameter' });
    }
    if (isNaN(limit) || limit <= 0 || limit > 500) {
      return res.status(400).json({ error: 'Invalid limit parameter (must be between 1 and 500)' });
    }
    if (isNaN(page) || page <= 0) {
      return res.status(400).json({ error: 'Invalid page parameter' });
    }
    
    // 날짜 계산
    const cutoffDate = new Date();
    cutoffDate.setDate(cutoffDate.getDate() - days);
    const cutoffDateStr = cutoffDate.toISOString().split('T')[0];
    
    // 페이지네이션 계산
    const offset = (page - 1) * limit;
    
    // 풀 생성
    const pool = createPool();
    
    try {
      // 총 결과 수 쿼리
      const countQuery = `
        SELECT COUNT(*) AS total_count
        FROM (
          SELECT 
            p.userId
          FROM 
            players p
          JOIN 
            game_scores gs ON p.userId = gs.userId AND gs.gameDate >= ?
          GROUP BY 
            p.userId
          HAVING 
            SUM(gs.netBet) >= ?
        ) AS high_value_users
      `;
      
      // 데이터 쿼리
      const dataQuery = `
        SELECT 
          p.userId, 
          SUM(gs.totalBet) AS total_betting,
          SUM(gs.netBet) AS net_betting,
          SUM(gs.winLoss) AS win_loss,
          COUNT(DISTINCT gs.gameDate) AS active_days,
          MAX(gs.gameDate) AS last_activity_date,
          MIN(gs.gameDate) AS first_activity_date,
          DATEDIFF(MAX(gs.gameDate), MIN(gs.gameDate)) + 1 AS day_span,
          CASE
            WHEN MAX(gs.gameDate) >= DATE_SUB(CURRENT_DATE, INTERVAL 7 DAY) THEN 'active'
            WHEN MAX(gs.gameDate) >= DATE_SUB(CURRENT_DATE, INTERVAL 30 DAY) THEN 'inactive_recent'
            ELSE 'inactive_long'
          END AS user_status
        FROM 
          players p
        JOIN 
          game_scores gs ON p.userId = gs.userId AND gs.gameDate >= ?
        GROUP BY 
          p.userId
        HAVING 
          SUM(gs.netBet) >= ?
        ORDER BY 
          net_betting DESC
        LIMIT ? OFFSET ?
      `;
      
      // 쿼리 실행
      const startTime = Date.now();
      const [countResults] = await pool.query(countQuery, [cutoffDateStr, minNetBet]);
      const [users] = await pool.query(dataQuery, [cutoffDateStr, minNetBet, limit, offset]);
      
      // 결과 처리
      const totalCount = countResults[0]?.total_count || 0;
      const totalPages = Math.ceil(totalCount / limit);
      
      // 결과 변환
      const processedUsers = users.map(user => ({
        ...user,
        total_betting: parseFloat(user.total_betting || 0),
        net_betting: parseFloat(user.net_betting || 0),
        win_loss: parseFloat(user.win_loss || 0),
        active_days: parseInt(user.active_days || 0, 10),
        day_span: parseInt(user.day_span || 0, 10),
        activity_ratio: user.day_span > 0 ? parseFloat((user.active_days / user.day_span).toFixed(2)) : 0
      }));
      
      // 요약 통계
      const activeUsers = processedUsers.filter(u => u.user_status === 'active').length;
      const inactiveRecentUsers = processedUsers.filter(u => u.user_status === 'inactive_recent').length;
      const inactiveLongUsers = processedUsers.filter(u => u.user_status === 'inactive_long').length;
      
      const totalNetBetting = processedUsers.reduce((sum, u) => sum + u.net_betting, 0);
      const totalWinLoss = processedUsers.reduce((sum, u) => sum + u.win_loss, 0);
      
      // 실행 시간
      const duration = Date.now() - startTime;
      
      // 응답 반환
      res.json({
        meta: {
          criteria: { minNetBet, days, limit, page },
          execution_time_ms: duration,
          timestamp: new Date().toISOString()
        },
        pagination: {
          total_count: totalCount,
          total_pages: totalPages,
          current_page: page,
          page_size: limit,
          has_next_page: page < totalPages,
          has_previous_page: page > 1
        },
        summary: {
          user_count: processedUsers.length,
          active_users: activeUsers,
          inactive_recent_users: inactiveRecentUsers,
          inactive_long_users: inactiveLongUsers,
          total_net_betting: Math.round(totalNetBetting),
          total_win_loss: Math.round(totalWinLoss),
          average_net_betting: processedUsers.length > 0 ? 
            Math.round(totalNetBetting / processedUsers.length) : 0
        },
        users: processedUsers
      });
    } finally {
      // 풀 종료
      await pool.end();
    }
  } catch (error) {
    console.error('Error in high-value users function:', error);
    res.status(500).json({ 
      error: 'Internal server error', 
      message: error.message 
    });
  }
});
