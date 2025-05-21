/**
 * 간소화된 고가치 사용자 분석 쿼리 모듈
 */
const { executeQuery } = require('../database/query');
const logger = require('../utils/logger').createLogger('high-value-users:simplified');

/**
 * 간소화된 고가치 사용자 분석 쿼리 실행
 * @param {number} days - 분석할 일수(기본 30일)
 * @param {number} limit - 결과 제한 수(기본 100명)
 * @param {number} minBetting - 최소 베팅 금액(고가치 사용자 임계값)
 * @returns {Promise<Array>} 고가치 사용자 목록
 */
exports.getSimplifiedHighValueUsers = async (days = 30, limit = 100, minBetting = 1000000) => {
  const cutoffDate = new Date();
  cutoffDate.setDate(cutoffDate.getDate() - days);
  const cutoffDateStr = cutoffDate.toISOString().split('T')[0];
  
  const query = `
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
      total_betting >= ?
    ORDER BY 
      total_betting DESC
    LIMIT ?
  `;
  
  const params = [
    cutoffDateStr,
    cutoffDate.toISOString(),
    minBetting,
    limit
  ];
  
  try {
    logger.info('Executing simplified high-value users query', {
      days, limit, minBetting
    });
    
    const startTime = Date.now();
    const results = await executeQuery(query, params, {
      timeout: 30000,
      maxRetries: 2
    });
    
    const duration = Date.now() - startTime;
    logger.info('Query completed successfully', {
      duration,
      resultCount: results.length
    });
    
    // 결과 후처리
    return results.map(user => ({
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
  } catch (error) {
    logger.error('Failed to execute simplified high-value users query', error);
    throw new Error(`Simplified high-value users query failed: ${error.message}`);
  }
};
