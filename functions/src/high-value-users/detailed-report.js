/**
 * 상세 고가치 사용자 분석 보고서 모듈
 */
const { executeQuery } = require('../database/query');
const { withRetry } = require('../utils/retry');
const logger = require('../utils/logger').createLogger('high-value-users:detailed');

/**
 * 고가치 사용자 상세 보고서 생성
 * @param {Object} options - 보고서 옵션
 * @param {number} options.days - 분석할 일수(기본 30일)
 * @param {number} options.minBetting - 최소 베팅 금액(고가치 사용자 임계값)
 * @param {number} options.limit - 결과 제한 수(선택적)
 * @param {boolean} options.includeEventAnalysis - 이벤트 분석 포함 여부(기본 true)
 * @param {boolean} options.includeDepositAnalysis - 입금 분석 포함 여부(기본 true)
 * @returns {Promise<Object>} 상세 보고서 객체
 */
exports.getDetailedHighValueUserReport = async (options = {}) => {
  const {
    days = 30,
    minBetting = 1000000,
    limit = null,
    includeEventAnalysis = true,
    includeDepositAnalysis = true
  } = options;
  
  logger.info('Generating detailed high value user report', { 
    days, minBetting, limit, includeEventAnalysis, includeDepositAnalysis 
  });
  
  const startTime = Date.now();
  
  try {
    // 결과 객체 초기화
    const report = {
      metadata: {
        generated_at: new Date().toISOString(),
        parameters: {
          days,
          minBetting,
          limit
        },
        execution_time_ms: 0
      },
      summary: await getHighValueUserSummary(days, minBetting),
      users: await getHighValueUserBaseData(days, minBetting, limit),
      user_segments: await getUserSegments(days, minBetting),
      dormant_distribution: await getDormantDistribution(days, minBetting)
    };
    
    // 옵션에 따라 추가 분석 수행
    if (includeEventAnalysis) {
      report.event_analysis = await getEventAnalysis(days, minBetting);
    }
    
    if (includeDepositAnalysis) {
      report.deposit_analysis = await getDepositAnalysis(days, minBetting);
    }
    
    // 실행 시간 계산
    const duration = Date.now() - startTime;
    report.metadata.execution_time_ms = duration;
    
    logger.info('Report generation completed', { 
      duration,
      userCount: report.users.length,
      segments: Object.keys(report.user_segments)
    });
    
    return report;
  } catch (error) {
    logger.error('Failed to generate high value user report', error);
    throw error;
  }
};
/**
 * 고가치 사용자 요약 정보 조회
 * @param {number} days - 분석 일수
 * @param {number} minBetting - 최소 베팅액
 * @returns {Promise<Object>} 요약 정보
 */
async function getHighValueUserSummary(days, minBetting) {
  const cutoffDate = new Date();
  cutoffDate.setDate(cutoffDate.getDate() - days);
  const cutoffDateStr = cutoffDate.toISOString().split('T')[0];
  
  const summaryQuery = `
    SELECT 
      COUNT(*) AS totalUsers,
      SUM(CASE WHEN DATEDIFF(NOW(), COALESCE(lastPlayDate, '1970-01-01')) <= 30 THEN 1 ELSE 0 END) AS activeUsers,
      SUM(CASE WHEN DATEDIFF(NOW(), COALESCE(lastPlayDate, '1970-01-01')) > 30 THEN 1 ELSE 0 END) AS dormantUsers,
      AVG(playDays) AS avgPlayDays,
      AVG(totalBetting) AS avgBetting,
      MAX(totalBetting) AS maxBetting
    FROM (
      SELECT 
        p.userId, 
        MAX(gs.gameDate) as lastPlayDate,
        COUNT(DISTINCT gs.gameDate) AS playDays,
        SUM(gs.totalBet) AS totalBetting
      FROM 
        players p
      JOIN 
        game_scores gs ON p.userId = gs.userId AND gs.gameDate >= ?
      GROUP BY 
        p.userId
      HAVING 
        totalBetting >= ?
    ) AS high_value_users
  `;

  const [summaryRows] = await executeQuery(summaryQuery, [cutoffDateStr, minBetting]);
  
  if (summaryRows.length === 0) {
    return {
      totalUsers: 0,
      activeUsers: 0,
      dormantUsers: 0,
      activePercentage: 0,
      dormantPercentage: 0,
      avgPlayDays: 0,
      avgBetting: 0,
      maxBetting: 0
    };
  }
  
  const summary = summaryRows[0];
  const totalUsers = summary.totalUsers || 0;
  
  return {
    totalUsers,
    activeUsers: summary.activeUsers || 0,
    dormantUsers: summary.dormantUsers || 0,
    activePercentage: totalUsers > 0 ? parseFloat(((summary.activeUsers / totalUsers) * 100).toFixed(1)) : 0,
    dormantPercentage: totalUsers > 0 ? parseFloat(((summary.dormantUsers / totalUsers) * 100).toFixed(1)) : 0,
    avgPlayDays: Math.round(summary.avgPlayDays || 0),
    avgBetting: Math.round(summary.avgBetting || 0),
    maxBetting: Math.round(summary.maxBetting || 0)
  };
}

/**
 * 고가치 사용자 기본 데이터 쿼리
 * @param {number} days - 분석 일수
 * @param {number} minBetting - 최소 베팅액
 * @param {number} limit - 제한 수
 * @returns {Promise<Array>} 사용자 목록
 */
async function getHighValueUserBaseData(days, minBetting, limit) {
  const cutoffDate = new Date();
  cutoffDate.setDate(cutoffDate.getDate() - days);
  const cutoffDateStr = cutoffDate.toISOString().split('T')[0];
  
  // 쿼리 구성
  let query = `
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
        WHEN DATEDIFF(NOW(), MAX(gs.gameDate)) <= 7 THEN 'active_recent'
        WHEN DATEDIFF(NOW(), MAX(gs.gameDate)) <= 30 THEN 'active'
        WHEN DATEDIFF(NOW(), MAX(gs.gameDate)) <= 90 THEN 'inactive_recent'
        ELSE 'inactive_long'
      END AS user_status
    FROM 
      players p
    JOIN 
      game_scores gs ON p.userId = gs.userId AND gs.gameDate >= ?
    LEFT JOIN 
      money_flows mf ON p.id = mf.player AND mf.createdAt >= ?
    WHERE
      p.status = 0  -- 활성 상태 플레이어만
    GROUP BY 
      p.userId
    HAVING 
      SUM(gs.totalBet) >= ?
    ORDER BY 
      total_betting DESC
  `;
  
  // 제한이 있으면 추가
  if (limit) {
    query += ` LIMIT ${parseInt(limit, 10)}`;
  }
  
  const params = [
    cutoffDateStr,
    cutoffDate.toISOString(),
    minBetting
  ];
  
  // 쿼리 실행
  const result = await executeQuery(query, params, { 
    timeout: 45000,
    maxRetries: 2
  });
  
  // 결과 후처리
  return result.map((user, index) => ({
    rank: index + 1,
    userId: user.userId,
    total_betting: parseFloat(user.total_betting || 0),
    net_betting: parseFloat(user.net_betting || 0),
    win_loss: parseFloat(user.win_loss || 0),
    total_deposits: parseFloat(user.total_deposits || 0),
    active_days: parseInt(user.active_days || 0, 10),
    day_span: parseInt(user.day_span || 0, 10),
    last_activity_date: user.last_activity_date,
    first_activity_date: user.first_activity_date,
    days_since_last_activity: user.last_activity_date ? 
      Math.round((new Date() - new Date(user.last_activity_date)) / (1000 * 60 * 60 * 24)) : null,
    status: user.user_status,
    activity_ratio: user.day_span > 0 ? parseFloat((user.active_days / user.day_span).toFixed(2)) : 0,
    betting_to_deposit_ratio: user.total_deposits > 0 ? 
      parseFloat((user.total_betting / user.total_deposits).toFixed(2)) : null
  }));
}
/**
 * 사용자 세그먼트 분석
 * @param {number} days - 분석 일수
 * @param {number} minBetting - 최소 베팅액
 * @returns {Promise<Object>} 세그먼트별 분석 결과
 */
async function getUserSegments(days, minBetting) {
  const users = await getHighValueUserBaseData(days, minBetting);
  
  // 세그먼트 정의
  const segments = {
    active_recent: users.filter(u => u.status === 'active_recent'),
    active: users.filter(u => u.status === 'active'),
    inactive_recent: users.filter(u => u.status === 'inactive_recent'),
    inactive_long: users.filter(u => u.status === 'inactive_long')
  };
  
  // 세그먼트별 통계 추가
  const result = {};
  
  Object.entries(segments).forEach(([key, userList]) => {
    if (userList.length === 0) {
      result[key] = {
        count: 0,
        percentage: 0,
        avg_betting: 0,
        avg_deposits: 0,
        avg_active_days: 0
      };
      return;
    }
    
    const totalBetting = userList.reduce((sum, u) => sum + u.total_betting, 0);
    const totalDeposits = userList.reduce((sum, u) => sum + u.total_deposits, 0);
    const totalActiveDays = userList.reduce((sum, u) => sum + u.active_days, 0);
    
    result[key] = {
      count: userList.length,
      percentage: parseFloat(((userList.length / users.length) * 100).toFixed(1)),
      avg_betting: Math.round(totalBetting / userList.length),
      avg_deposits: Math.round(totalDeposits / userList.length),
      avg_active_days: Math.round(totalActiveDays / userList.length),
      top_users: userList.slice(0, 5).map(u => u.userId)
    };
  });
  
  return result;
}

/**
 * 휴면 기간별 사용자 분포 분석
 * @param {number} days - 분석 일수
 * @param {number} minBetting - 최소 베팅액
 * @returns {Promise<Array>} 휴면 기간별 분포
 */
async function getDormantDistribution(days, minBetting) {
  const cutoffDate = new Date();
  cutoffDate.setDate(cutoffDate.getDate() - days);
  const cutoffDateStr = cutoffDate.toISOString().split('T')[0];
  
  const dormantQuery = `
    SELECT 
      CASE 
        WHEN inactiveDays BETWEEN 31 AND 60 THEN '31-60'
        WHEN inactiveDays BETWEEN 61 AND 90 THEN '61-90'
        WHEN inactiveDays BETWEEN 91 AND 180 THEN '91-180'
        WHEN inactiveDays BETWEEN 181 AND 365 THEN '181-365'
        WHEN inactiveDays > 365 THEN '365+'
      END AS dormant_period,
      COUNT(*) AS user_count,
      ROUND(COUNT(*) / SUM(COUNT(*)) OVER() * 100, 1) AS percentage
    FROM (
      SELECT 
        p.userId,
        DATEDIFF(NOW(), MAX(gs.gameDate)) AS inactiveDays,
        SUM(gs.totalBet) AS totalBetting
      FROM 
        players p
      JOIN 
        game_scores gs ON p.userId = gs.userId AND gs.gameDate >= ?
      GROUP BY 
        p.userId
      HAVING 
        totalBetting >= ? AND inactiveDays > 30
    ) AS dormant_users
    GROUP BY 
      dormant_period
    ORDER BY 
      MIN(inactiveDays)
  `;

  const results = await executeQuery(dormantQuery, [cutoffDateStr, minBetting]);
  
  return results.map(row => ({
    period: row.dormant_period,
    user_count: parseInt(row.user_count, 10),
    percentage: parseFloat(row.percentage)
  }));
}

/**
 * 이벤트 참여 분석
 * @param {number} days - 분석 일수
 * @param {number} minBetting - 최소 베팅액
 * @returns {Promise<Object>} 이벤트 분석 결과
 */
async function getEventAnalysis(days, minBetting) {
  try {
    const cutoffDate = new Date();
    cutoffDate.setDate(cutoffDate.getDate() - days);
    
    const eventQuery = `
      SELECT 
        p.userId,
        COUNT(DISTINCT pp.promotion) AS event_count,
        SUM(pp.reward) AS total_rewards,
        MAX(pp.appliedAt) AS last_event_date,
        DATEDIFF(NOW(), MAX(pp.appliedAt)) AS days_since_last_event,
        SUM(gs.totalBet) AS total_betting
      FROM players p
      JOIN promotion_players pp ON p.id = pp.player
      JOIN game_scores gs ON p.userId = gs.userId
      WHERE 
        pp.appliedAt IS NOT NULL
        AND pp.appliedAt >= ?
      GROUP BY 
        p.userId
      HAVING 
        total_betting >= ?
      ORDER BY 
        event_count DESC
    `;
    
    const eventUsers = await executeQuery(eventQuery, [
      cutoffDate.toISOString(),
      minBetting
    ]);
    
    // 이벤트 참여 사용자가 없으면 기본 결과 반환
    if (eventUsers.length === 0) {
      return {
        participants_count: 0,
        avg_events_per_user: 0,
        avg_reward_per_user: 0,
        total_rewards: 0,
        event_effectiveness: {
          deposit_conversion_rate: 0,
          avg_deposit_after_event: 0
        },
        top_participants: []
      };
    }
    
    // 이벤트 후 입금 분석
    const depositQuery = `
      SELECT 
        p.userId,
        SUM(CASE WHEN mf.createdAt > pp.appliedAt THEN mf.amount ELSE 0 END) AS deposit_after_event
      FROM 
        players p
      JOIN 
        promotion_players pp ON p.id = pp.player
      LEFT JOIN 
        money_flows mf ON p.id = mf.player AND mf.type = 0
      WHERE 
        pp.appliedAt IS NOT NULL
        AND pp.appliedAt >= ?
      GROUP BY 
        p.userId
    `;
    
    const depositResults = await executeQuery(depositQuery, [cutoffDate.toISOString()]);
    
    // 결과를 맵으로 변환
    const depositMap = {};
    depositResults.forEach(row => {
      depositMap[row.userId] = parseFloat(row.deposit_after_event || 0);
    });
    
    // 통계 계산
    const totalEvents = eventUsers.reduce((sum, u) => sum + parseInt(u.event_count, 10), 0);
    const totalRewards = eventUsers.reduce((sum, u) => sum + parseFloat(u.total_rewards || 0), 0);
    
    // 이벤트 후 입금한 사용자 수
    const usersWithDeposit = Object.values(depositMap).filter(amount => amount > 0).length;
    
    // 이벤트 후 총 입금액
    const totalDepositsAfterEvent = Object.values(depositMap).reduce((sum, amount) => sum + amount, 0);
    
    return {
      participants_count: eventUsers.length,
      avg_events_per_user: parseFloat((totalEvents / eventUsers.length).toFixed(1)),
      avg_reward_per_user: Math.round(totalRewards / eventUsers.length),
      total_rewards: Math.round(totalRewards),
      event_effectiveness: {
        deposit_conversion_rate: parseFloat(((usersWithDeposit / eventUsers.length) * 100).toFixed(1)),
        avg_deposit_after_event: usersWithDeposit > 0 ? Math.round(totalDepositsAfterEvent / usersWithDeposit) : 0
      },
      top_participants: eventUsers.slice(0, 10).map(u => ({
        userId: u.userId,
        event_count: parseInt(u.event_count, 10),
        total_rewards: Math.round(parseFloat(u.total_rewards || 0)),
        days_since_last_event: parseInt(u.days_since_last_event, 10),
        deposit_after_event: Math.round(depositMap[u.userId] || 0)
      }))
    };
  } catch (error) {
    logger.error('Failed to analyze event participation', error);
    
    // 오류 발생 시 기본 결과 반환
    return {
      error: error.message,
      participants_count: 0,
      avg_events_per_user: 0,
      avg_reward_per_user: 0,
      total_rewards: 0
    };
  }
}

/**
 * 입금 분석
 * @param {number} days - 분석 일수
 * @param {number} minBetting - 최소 베팅액
 * @returns {Promise<Object>} 입금 분석 결과
 */
async function getDepositAnalysis(days, minBetting) {
  try {
    const cutoffDate = new Date();
    cutoffDate.setDate(cutoffDate.getDate() - days);
    
    const depositQuery = `
      SELECT 
        p.userId,
        p.status AS player_status,
        COUNT(mf.id) AS deposit_count,
        SUM(mf.amount) AS total_deposits,
        AVG(mf.amount) AS avg_deposit,
        MAX(mf.amount) AS max_deposit,
        MIN(mf.createdAt) AS first_deposit_date,
        MAX(mf.createdAt) AS last_deposit_date,
        SUM(gs.totalBet) AS total_betting
      FROM 
        players p
      JOIN 
        money_flows mf ON p.id = mf.player AND mf.type = 0 AND mf.createdAt >= ?
      JOIN 
        game_scores gs ON p.userId = gs.userId AND gs.gameDate >= ?
      GROUP BY 
        p.userId, p.status
      HAVING 
        total_betting >= ?
      ORDER BY 
        total_deposits DESC
    `;
    
    const depositResults = await executeQuery(depositQuery, [
      cutoffDate.toISOString(),
      cutoffDateStr,
      minBetting
    ]);
    
    // 입금 기록이 없으면 기본 결과 반환
    if (depositResults.length === 0) {
      return {
        depositors_count: 0,
        total_deposits: 0,
        avg_deposit_per_user: 0,
        avg_deposit_amount: 0,
        max_deposit: 0,
        deposit_patterns: {
          avg_deposit_frequency: 0,
          deposit_to_betting_ratio: 0
        },
        top_depositors: []
      };
    }
    
    // 통계 계산
    const totalDeposits = depositResults.reduce((sum, r) => sum + parseFloat(r.total_deposits || 0), 0);
    const totalDepositCount = depositResults.reduce((sum, r) => sum + parseInt(r.deposit_count, 10), 0);
    const totalBetting = depositResults.reduce((sum, r) => sum + parseFloat(r.total_betting || 0), 0);
    
    return {
      depositors_count: depositResults.length,
      total_deposits: Math.round(totalDeposits),
      avg_deposit_per_user: Math.round(totalDeposits / depositResults.length),
      avg_deposit_amount: Math.round(totalDepositCount > 0 ? totalDeposits / totalDepositCount : 0),
      max_deposit: Math.round(Math.max(...depositResults.map(r => parseFloat(r.max_deposit || 0)))),
      deposit_patterns: {
        avg_deposit_frequency: parseFloat((totalDepositCount / depositResults.length).toFixed(1)),
        deposit_to_betting_ratio: parseFloat((totalBetting / totalDeposits).toFixed(2))
      },
      top_depositors: depositResults.slice(0, 10).map(r => ({
        userId: r.userId,
        deposit_count: parseInt(r.deposit_count, 10),
        total_deposits: Math.round(parseFloat(r.total_deposits || 0)),
        avg_deposit: Math.round(parseFloat(r.avg_deposit || 0)),
        max_deposit: Math.round(parseFloat(r.max_deposit || 0)),
        last_deposit_date: r.last_deposit_date
      }))
    };
  } catch (error) {
    logger.error('Failed to analyze deposits', error);
    
    // 오류 발생 시 기본 결과 반환
    return {
      error: error.message,
      depositors_count: 0,
      total_deposits: 0,
      avg_deposit_per_user: 0
    };
  }
}

module.exports = {
  getHighValueUserSummary,
  getHighValueUserBaseData,
  getUserSegments,
  getDormantDistribution,
  getEventAnalysis,
  getDepositAnalysis
};
