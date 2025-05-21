/**
 * 순수 베팅액(netBet) 기준 고가치 사용자 분석 쿼리 모듈
 */
const { executeQuery } = require('../database/query');
const logger = require('../utils/logger').createLogger('high-value-users:net-bet');

/**
 * 순수 베팅액(netBet) 기준 고가치 사용자 조회
 * @param {number} minNetBet - 최소 순수 베팅액 기준 (기본값: 50000)
 * @param {number} days - 분석할 일수 (기본값: 30일)
 * @param {number} limit - 결과 제한 수 (기본값: 100명)
 * @param {number} page - 페이지 번호 (기본값: 1, 페이지네이션 용)
 * @returns {Promise<Object>} 고가치 사용자 목록 및 요약 통계
 */
exports.getHighValueUsersByNetBet = async (minNetBet = 50000, days = 30, limit = 100, page = 1) => {
  const cutoffDate = new Date();
  cutoffDate.setDate(cutoffDate.getDate() - days);
  const cutoffDateStr = cutoffDate.toISOString().split('T')[0];
  
  // 페이지네이션을 위한 오프셋 계산
  const offset = (page - 1) * limit;
  
  // 총 결과 수 계산 쿼리
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
  
  // 사용자 데이터 조회 쿼리
  const dataQuery = `
    SELECT 
      p.userId, 
      SUM(gs.totalBet) AS total_betting,
      SUM(gs.netBet) AS net_betting,
      SUM(gs.winLoss) AS win_loss,
      SUM(CASE WHEN mf.type = 0 THEN mf.amount ELSE 0 END) AS total_deposits,
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
    LEFT JOIN 
      money_flows mf ON p.id = mf.player AND mf.createdAt >= ?
    GROUP BY 
      p.userId
    HAVING 
      SUM(gs.netBet) >= ?
    ORDER BY 
      net_betting DESC
    LIMIT ? OFFSET ?
  `;
  
  try {
    const timer = logger.startTimer('high-value-users-by-net-bet');
    
    logger.info('Executing high-value users by netBet query', {
      minNetBet, days, limit, page
    });
    
    // 총 결과 수 조회
    const countResults = await executeQuery(countQuery, [cutoffDateStr, minNetBet], {
      timeout: 20000
    });
    
    const totalCount = countResults[0]?.total_count || 0;
    const totalPages = Math.ceil(totalCount / limit);
    
    // 데이터 쿼리 실행
    const users = await executeQuery(dataQuery, [
      cutoffDateStr,
      cutoffDate.toISOString(),
      minNetBet,
      limit,
      offset
    ], {
      timeout: 45000,
      maxRetries: 2
    });
    
    // 결과 후처리
    const processedUsers = users.map(user => ({
      ...user,
      // 숫자 필드 변환
      total_betting: parseFloat(user.total_betting || 0),
      net_betting: parseFloat(user.net_betting || 0),
      win_loss: parseFloat(user.win_loss || 0),
      total_deposits: parseFloat(user.total_deposits || 0),
      active_days: parseInt(user.active_days || 0, 10),
      day_span: parseInt(user.day_span || 0, 10),
      // 파생 필드 계산
      activity_ratio: user.day_span > 0 ? parseFloat((user.active_days / user.day_span).toFixed(2)) : 0,
      betting_to_deposit_ratio: user.total_deposits > 0 ? 
        parseFloat((user.total_betting / user.total_deposits).toFixed(2)) : null
    }));
    
    // 요약 통계 계산
    const activeUsers = processedUsers.filter(u => u.user_status === 'active').length;
    const inactiveRecentUsers = processedUsers.filter(u => u.user_status === 'inactive_recent').length;
    const inactiveLongUsers = processedUsers.filter(u => u.user_status === 'inactive_long').length;
    
    const totalNetBetting = processedUsers.reduce((sum, u) => sum + u.net_betting, 0);
    const totalDeposits = processedUsers.reduce((sum, u) => sum + u.total_deposits, 0);
    const totalWinLoss = processedUsers.reduce((sum, u) => sum + u.win_loss, 0);
    
    const duration = timer.end();
    
    // 결과 반환
    return {
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
        total_deposits: Math.round(totalDeposits),
        total_win_loss: Math.round(totalWinLoss),
        average_net_betting: processedUsers.length > 0 ? 
          Math.round(totalNetBetting / processedUsers.length) : 0,
        average_deposits: processedUsers.length > 0 ? 
          Math.round(totalDeposits / processedUsers.length) : 0
      },
      users: processedUsers
    };
  } catch (error) {
    logger.error('Failed to execute high-value users by netBet query', error);
    throw new Error(`High-value users by netBet query failed: ${error.message}`);
  }
};
