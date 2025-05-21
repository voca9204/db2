/**
 * 페이지네이션을 지원하는 고가치 사용자 분석 쿼리 모듈
 */
const { executeQuery } = require('../database/query');
const logger = require('../utils/logger').createLogger('high-value-users:paginated');

/**
 * 페이지네이션을 지원하는 고가치 사용자 쿼리
 * @param {number} days - 분석할 일수
 * @param {number} page - 페이지 번호(1부터 시작)
 * @param {number} pageSize - 페이지 크기
 * @param {number} minBetting - 최소 베팅 금액
 * @returns {Promise<Object>} 페이지네이션 정보와 결과
 */
exports.getPaginatedHighValueUsers = async (days = 30, page = 1, pageSize = 20, minBetting = 1000000) => {
  const cutoffDate = new Date();
  cutoffDate.setDate(cutoffDate.getDate() - days);
  const cutoffDateStr = cutoffDate.toISOString().split('T')[0];
  
  // 총 결과 수 구하기
  const countQuery = `
    SELECT COUNT(*) AS total_count
    FROM (
      SELECT 
        p.userId
      FROM 
        players p
      LEFT JOIN 
        game_scores gs ON p.userId = gs.userId AND gs.gameDate >= ?
      GROUP BY 
        p.userId
      HAVING 
        SUM(gs.totalBet) >= ?
    ) AS high_value_users
  `;
  
  // 페이지네이션된 데이터 쿼리
  const dataQuery = `
    SELECT 
      p.userId, 
      SUM(gs.totalBet) AS total_betting,
      SUM(gs.netBet) AS net_betting,
      SUM(gs.winLoss) AS win_loss,
      SUM(CASE WHEN mf.type = 0 THEN mf.amount ELSE 0 END) AS total_deposits,
      COUNT(DISTINCT gs.gameDate) AS active_days,
      MAX(gs.gameDate) AS last_activity_date,
      CASE
        WHEN MAX(gs.gameDate) >= DATE_SUB(CURRENT_DATE, INTERVAL 7 DAY) THEN 'active'
        ELSE 'inactive'
      END AS user_status
    FROM 
      players p
    LEFT JOIN 
      game_scores gs ON p.userId = gs.userId AND gs.gameDate >= ?
    LEFT JOIN 
      money_flows mf ON p.id = mf.player AND mf.createdAt >= ?
    GROUP BY 
      p.userId
    HAVING 
      SUM(gs.totalBet) >= ?
    ORDER BY 
      total_betting DESC
    LIMIT ? OFFSET ?
  `;
  
  try {
    logger.info('Executing paginated high-value users query', {
      days, page, pageSize, minBetting
    });
    
    // 총 결과 수 구하기
    const countTimer = logger.startTimer('count-query');
    const countResults = await executeQuery(countQuery, [cutoffDateStr, minBetting]);
    countTimer.end();
    
    const totalCount = countResults[0]?.total_count || 0;
    
    // 페이지네이션 파라미터 계산
    const offset = (page - 1) * pageSize;
    const totalPages = Math.ceil(totalCount / pageSize);
    
    // 데이터 쿼리 실행
    const dataTimer = logger.startTimer('data-query');
    const users = await executeQuery(dataQuery, [
      cutoffDateStr,
      cutoffDate.toISOString(),
      minBetting,
      pageSize,
      offset
    ]);
    dataTimer.end();
    
    logger.info('Paginated query completed', {
      totalCount,
      totalPages,
      currentPage: page,
      resultCount: users.length
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
      // 파생 필드 계산
      betting_to_deposit_ratio: user.total_deposits > 0 ? 
        parseFloat((user.total_betting / user.total_deposits).toFixed(2)) : null
    }));
    
    return {
      pagination: {
        total_count: totalCount,
        total_pages: totalPages,
        current_page: page,
        page_size: pageSize,
        has_next_page: page < totalPages,
        has_previous_page: page > 1
      },
      users: processedUsers
    };
  } catch (error) {
    logger.error('Failed to execute paginated high-value users query', error);
    throw new Error(`Paginated high-value users query failed: ${error.message}`);
  }
};
