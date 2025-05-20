/**
 * 고가치 사용자 분석 서비스
 * 비즈니스 로직 및 데이터 접근 계층
 */

const { executeQuery } = require('../../db');
const { buildQuery } = require('../utils/query-builder');
const { NotFoundError } = require('../middleware/error-handler');

// 컬럼 매핑 - API 요청 매개변수를 데이터베이스 컬럼명으로 매핑
const COLUMN_MAPPING = {
  userId: 'user_id',
  userName: 'user_name',
  playDays: 'play_days',
  netBet: 'net_bet',
  lastActivity: 'last_activity',
  inactiveDays: 'inactive_days',
  createdAt: 'created_at',
};

/**
 * 활성 고가치 사용자 조회
 * @param {Object} options 조회 옵션
 * @return {Promise<Object>} 검색 결과 및 메타데이터
 */
const getActiveHighValueUsers = async (options = {}) => {
  const {
    minNetBet = 50000,
    minPlayDays = 7,
    maxInactiveDays = 30,
    sortBy = 'netBet',
    sortOrder = 'desc',
    page = 1,
    limit = 20,
  } = options;

  // 고가치 사용자 조회 기본 쿼리
  const baseQuery = `
    SELECT 
      u.id as userId,
      u.username as userName,
      COUNT(DISTINCT g.date) as playDays,
      SUM(g.net_bet) as netBet,
      MAX(g.date) as lastActivity,
      DATEDIFF(CURRENT_DATE, MAX(g.date)) as inactiveDays
    FROM users u
    JOIN game_logs g ON u.id = g.user_id
    GROUP BY u.id, u.username
    HAVING 
      playDays >= ${minPlayDays} 
      AND netBet >= ${minNetBet}
      AND inactiveDays <= ${maxInactiveDays}
  `;

  // 동적 쿼리 빌드
  const { query, countQuery, params } = buildQuery({
    baseQuery,
    sortBy,
    sortOrder,
    sortMapping: COLUMN_MAPPING,
    page,
    limit,
  });

  // 쿼리 실행
  const results = await executeQuery(query, params);
  
  // 총 레코드 수 조회
  const countResult = await executeQuery(countQuery, []);
  const total = countResult[0].total;

  return {
    users: results,
    total,
    page: parseInt(page, 10),
    limit: parseInt(limit, 10),
    pages: Math.ceil(total / limit),
  };
};

/**
 * 휴면 고가치 사용자 조회
 * @param {Object} options 조회 옵션
 * @return {Promise<Object>} 검색 결과 및 메타데이터
 */
const getDormantHighValueUsers = async (options = {}) => {
  const {
    minNetBet = 50000,
    minPlayDays = 7,
    minInactiveDays = 30,
    maxInactiveDays = null,
    sortBy = 'inactiveDays',
    sortOrder = 'desc',
    page = 1,
    limit = 20,
  } = options;

  // 휴면 고가치 사용자 조회 기본 쿼리
  let baseQuery = `
    SELECT 
      u.id as userId,
      u.username as userName,
      COUNT(DISTINCT g.date) as playDays,
      SUM(g.net_bet) as netBet,
      MAX(g.date) as lastActivity,
      DATEDIFF(CURRENT_DATE, MAX(g.date)) as inactiveDays
    FROM users u
    JOIN game_logs g ON u.id = g.user_id
    GROUP BY u.id, u.username
    HAVING 
      playDays >= ${minPlayDays} 
      AND netBet >= ${minNetBet}
      AND inactiveDays >= ${minInactiveDays}
  `;

  // 최대 휴면 기간 설정 (옵션)
  if (maxInactiveDays) {
    baseQuery += ` AND inactiveDays <= ${maxInactiveDays}`;
  }

  // 동적 쿼리 빌드
  const { query, countQuery, params } = buildQuery({
    baseQuery,
    sortBy,
    sortOrder,
    sortMapping: COLUMN_MAPPING,
    page,
    limit,
  });

  // 쿼리 실행
  const results = await executeQuery(query, params);
  
  // 총 레코드 수 조회
  const countResult = await executeQuery(countQuery, []);
  const total = countResult[0].total;

  return {
    users: results,
    total,
    page: parseInt(page, 10),
    limit: parseInt(limit, 10),
    pages: Math.ceil(total / limit),
  };
};

/**
 * 사용자 세그먼트 분석
 * @param {Object} options 분석 옵션
 * @return {Promise<Object>} 세그먼트 분석 결과
 */
const analyzeUserSegments = async (options = {}) => {
  const { minNetBet = 50000, minPlayDays = 7 } = options;

  // 전체 고가치 사용자 통계
  const totalStatsQuery = `
    SELECT 
      COUNT(*) as totalUsers,
      AVG(playDays) as avgPlayDays,
      AVG(netBet) as avgNetBet
    FROM (
      SELECT 
        u.id,
        COUNT(DISTINCT g.date) as playDays,
        SUM(g.net_bet) as netBet
      FROM users u
      JOIN game_logs g ON u.id = g.user_id
      GROUP BY u.id
      HAVING playDays >= ? AND netBet >= ?
    ) as high_value_users
  `;

  // 활성/휴면 사용자 분포
  const segmentDistributionQuery = `
    SELECT 
      CASE 
        WHEN inactiveDays <= 30 THEN 'active'
        WHEN inactiveDays <= 60 THEN 'inactive_30_60'
        WHEN inactiveDays <= 90 THEN 'inactive_60_90'
        WHEN inactiveDays <= 180 THEN 'inactive_90_180'
        WHEN inactiveDays <= 365 THEN 'inactive_180_365'
        ELSE 'inactive_365_plus'
      END as segment,
      COUNT(*) as userCount,
      AVG(playDays) as avgPlayDays,
      AVG(netBet) as avgNetBet
    FROM (
      SELECT 
        u.id,
        COUNT(DISTINCT g.date) as playDays,
        SUM(g.net_bet) as netBet,
        DATEDIFF(CURRENT_DATE, MAX(g.date)) as inactiveDays
      FROM users u
      JOIN game_logs g ON u.id = g.user_id
      GROUP BY u.id
      HAVING playDays >= ? AND netBet >= ?
    ) as high_value_users
    GROUP BY segment
    ORDER BY FIELD(segment, 'active', 'inactive_30_60', 'inactive_60_90', 'inactive_90_180', 'inactive_180_365', 'inactive_365_plus')
  `;

  // 쿼리 실행
  const totalStats = await executeQuery(totalStatsQuery, [minPlayDays, minNetBet]);
  const segmentDistribution = await executeQuery(segmentDistributionQuery, [minPlayDays, minNetBet]);

  return {
    criteria: {
      minNetBet,
      minPlayDays,
    },
    totalStats: totalStats[0],
    segmentDistribution,
  };
};

/**
 * 사용자 ID로 사용자 상세 정보 조회
 * @param {number} userId 사용자 ID
 * @return {Promise<Object>} 사용자 상세 정보
 */
const getUserDetails = async (userId) => {
  const userQuery = `
    SELECT 
      u.id as userId,
      u.username as userName,
      u.email,
      u.created_at as createdAt,
      COUNT(DISTINCT g.date) as playDays,
      SUM(g.net_bet) as netBet,
      MAX(g.date) as lastActivity,
      DATEDIFF(CURRENT_DATE, MAX(g.date)) as inactiveDays
    FROM users u
    LEFT JOIN game_logs g ON u.id = g.user_id
    WHERE u.id = ?
    GROUP BY u.id, u.username, u.email, u.created_at
  `;

  const users = await executeQuery(userQuery, [userId]);
  
  if (users.length === 0) {
    throw new NotFoundError(`User with ID ${userId} not found`);
  }
  
  const user = users[0];
  
  // 사용자 게임 활동 내역 조회
  const activityQuery = `
    SELECT 
      date,
      COUNT(*) as sessionCount,
      SUM(net_bet) as totalNetBet,
      SUM(win_amount) as totalWinAmount
    FROM game_logs
    WHERE user_id = ?
    GROUP BY date
    ORDER BY date DESC
    LIMIT 30
  `;
  
  const activityHistory = await executeQuery(activityQuery, [userId]);
  
  // 사용자 이벤트 참여 내역 조회
  const eventsQuery = `
    SELECT 
      e.id as eventId,
      e.name as eventName,
      pe.participation_date as participationDate,
      pe.reward_amount as rewardAmount
    FROM events e
    JOIN participant_events pe ON e.id = pe.event_id
    WHERE pe.user_id = ?
    ORDER BY pe.participation_date DESC
    LIMIT 10
  `;
  
  const eventParticipation = await executeQuery(eventsQuery, [userId]);
  
  return {
    ...user,
    activityHistory,
    eventParticipation,
  };
};

/**
 * 비활성 사용자 재활성화 대상 추천
 * @param {Object} options 조회 옵션
 * @return {Promise<Object>} 추천 대상 사용자 및 메타데이터
 */
const getReactivationTargets = async (options = {}) => {
  const {
    minNetBet = 50000,
    minPlayDays = 7,
    minInactiveDays = 30,
    maxInactiveDays = 365,
    page = 1,
    limit = 20,
  } = options;

  // 재활성화 점수 계산 쿼리
  // - 과��� 활동 수준 (playDays)
  // - 과거 베팅 규모 (netBet)
  // - 휴면 기간 (inactiveDays)
  // - 이벤트 참여 내역
  // - 승패 경향 등을 고려한 점수 계산
  const baseQuery = `
    SELECT 
      u.id as userId,
      u.username as userName,
      COUNT(DISTINCT g.date) as playDays,
      SUM(g.net_bet) as netBet,
      MAX(g.date) as lastActivity,
      DATEDIFF(CURRENT_DATE, MAX(g.date)) as inactiveDays,
      COUNT(DISTINCT pe.event_id) as eventCount,
      (
        (COUNT(DISTINCT g.date) * 0.3) + 
        (SUM(g.net_bet) / 100000 * 0.4) + 
        (CASE 
          WHEN DATEDIFF(CURRENT_DATE, MAX(g.date)) BETWEEN 30 AND 90 THEN 10
          WHEN DATEDIFF(CURRENT_DATE, MAX(g.date)) BETWEEN 91 AND 180 THEN 7
          WHEN DATEDIFF(CURRENT_DATE, MAX(g.date)) BETWEEN 181 AND 365 THEN 5
          ELSE 3
        END) +
        (COUNT(DISTINCT pe.event_id) * 0.5)
      ) as reactivationScore
    FROM users u
    JOIN game_logs g ON u.id = g.user_id
    LEFT JOIN participant_events pe ON u.id = pe.user_id
    GROUP BY u.id, u.username
    HAVING 
      playDays >= ${minPlayDays} 
      AND netBet >= ${minNetBet}
      AND inactiveDays BETWEEN ${minInactiveDays} AND ${maxInactiveDays}
  `;

  // 동적 쿼리 빌드
  const { query, countQuery, params } = buildQuery({
    baseQuery,
    sortBy: 'reactivationScore',
    sortOrder: 'desc',
    page,
    limit,
  });

  // 쿼리 실행
  const results = await executeQuery(query, params);
  
  // 총 레코드 수 조회
  const countResult = await executeQuery(countQuery, []);
  const total = countResult[0].total;

  return {
    users: results,
    total,
    page: parseInt(page, 10),
    limit: parseInt(limit, 10),
    pages: Math.ceil(total / limit),
  };
};

module.exports = {
  getActiveHighValueUsers,
  getDormantHighValueUsers,
  analyzeUserSegments,
  getUserDetails,
  getReactivationTargets,
};
