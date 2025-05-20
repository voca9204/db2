/**
 * 고가치 사용자 분석 서비스
 * 비즈니스 로직 및 데이터 접근 계층
 */

const BaseService = require('./base.service');
const { executeQuery } = require('../../../db');
const { getContextLogger } = require('../../utils/logger');
const QueryBuilder = require('../utils/query-builder');
const FirestoreRepository = require('../utils/firestore-repository');
const admin = require('firebase-admin');
const { NotFoundError } = require('../utils/error-handler');

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
 * 고가치 사용자 분석 서비스 클래스
 */
class HighValueUserService extends BaseService {
  /**
   * 서비스 생성자
   */
  constructor() {
    super('users', COLUMN_MAPPING);
    this.logger = getContextLogger();
    
    // 캐시 설정
    this.cacheEnabled = process.env.ENABLE_CACHE === 'true';
    this.cacheTTL = parseInt(process.env.CACHE_TTL_SECONDS || '300', 10) * 1000; // 기본값 5분
    
    // Firestore 리포지토리 초기화 (분석 결과 캐싱용)
    this.resultsRepository = new FirestoreRepository('analysisResults');
  }

  /**
 * 활성 고가치 사용자 조회
 * @param {Object} options - 조회 옵션
 * @return {Promise<Object>} 검색 결과 및 메타데이터
 */
async getActiveHighValueUsers(options = {}) {
  const {
    minNetBet = 50000,
    minPlayDays = 7,
    maxInactiveDays = 30,
    sortBy = 'netBet',
    sortOrder = 'desc',
    page = 1,
    limit = 20,
    includeDepositInfo = false
  } = options;

  // 캐시 검사 (사용 가능한 경우)
  const cacheKey = `activeHighValueUsers_${JSON.stringify(options)}`;
  
  if (this.cacheEnabled) {
    try {
      const cachedResult = await this._getCachedResult(cacheKey);
      if (cachedResult) {
        this.logger.info(`Cache hit for ${cacheKey}`);
        return cachedResult;
      }
    } catch (error) {
      this.logger.warn(`Error checking cache: ${error.message}`);
    }
  }

  // 서버리스 환경에서 CPU 및 메모리 소비 제한을 위한 최적화된 쿼리
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
  const queryBuilder = new QueryBuilder(baseQuery);
  
  // 정렬 추가
  const sortColumn = COLUMN_MAPPING[sortBy] || sortBy;
  queryBuilder.orderBy(sortColumn, sortOrder.toUpperCase());
  
  // 페이지네이션 추가
  const offset = (page - 1) * limit;
  queryBuilder.limit(limit, offset);
  
  // 쿼리 빌드
  const { query, params } = queryBuilder.build();
  const countQuery = queryBuilder.buildCount().query;

  // 쿼리 실행
  this.logger.debug('Executing activeHighValueUsers query');
  
  try {
    // 서버리스 환경에서는 병렬 요청으로 성능 최적화
    const [results, countResult] = await Promise.all([
      executeQuery(query, params),
      executeQuery(countQuery, [])
    ]);
    
    const total = countResult[0].total;
    
    // 입금 정보 요청된 경우 포함
    let usersWithDeposits = results;
    
    if (includeDepositInfo) {
      const userIds = results.map(user => user.userId);
      
      if (userIds.length > 0) {
        // 최근 입금 정보 조회 (최근 3개월)
        const depositQuery = `
          SELECT 
            user_id as userId,
            COUNT(*) as depositCount,
            SUM(amount) as totalDeposits,
            MAX(deposit_date) as lastDepositDate
          FROM deposits
          WHERE user_id IN (${userIds.map(() => '?').join(',')})
          AND deposit_date >= DATE_SUB(CURRENT_DATE, INTERVAL 90 DAY)
          GROUP BY user_id
        `;
        
        const depositResults = await executeQuery(depositQuery, userIds);
        
        // 사용자별 입금 정보 매핑
        const depositMap = new Map();
        depositResults.forEach(deposit => {
          depositMap.set(deposit.userId, deposit);
        });
        
        // 사용자 정보에 입금 정보 추가
        usersWithDeposits = results.map(user => {
          const depositInfo = depositMap.get(user.userId) || {
            depositCount: 0,
            totalDeposits: 0,
            lastDepositDate: null
          };
          
          return {
            ...user,
            depositInfo
          };
        });
      }
    }
    
    const result = {
      users: usersWithDeposits,
      total,
      page: parseInt(page, 10),
      limit: parseInt(limit, 10),
      pages: Math.ceil(total / limit),
    };
    
    // 결과 캐싱 (사용 가능한 경우)
    if (this.cacheEnabled) {
      try {
        await this._cacheResult(cacheKey, result);
      } catch (error) {
        this.logger.warn(`Error caching result: ${error.message}`);
      }
    }
    
    return result;
  } catch (error) {
    this.logger.error('Error executing activeHighValueUsers query:', error);
    throw error;
  }
}

  /**
 * 휴면 고가치 사용자 조회
 * @param {Object} options - 조회 옵션
 * @return {Promise<Object>} 검색 결과 및 메타데이터
 */
async getDormantHighValueUsers(options = {}) {
  const {
    minNetBet = 50000,
    minPlayDays = 7,
    minInactiveDays = 30,
    maxInactiveDays = null,
    sortBy = 'inactiveDays',
    sortOrder = 'desc',
    page = 1,
    limit = 20,
    includeDepositInfo = false
  } = options;

  // 캐시 검사 (사용 가능한 경우)
  const cacheKey = `dormantHighValueUsers_${JSON.stringify(options)}`;
  
  if (this.cacheEnabled) {
    try {
      const cachedResult = await this._getCachedResult(cacheKey);
      if (cachedResult) {
        this.logger.info(`Cache hit for ${cacheKey}`);
        return cachedResult;
      }
    } catch (error) {
      this.logger.warn(`Error checking cache: ${error.message}`);
    }
  }

  // 서버리스 환경에서 CPU 및 메모리 소비 제한을 위한 최적화된 쿼리
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
  const queryBuilder = new QueryBuilder(baseQuery);
  
  // 정렬 추가
  const sortColumn = COLUMN_MAPPING[sortBy] || sortBy;
  queryBuilder.orderBy(sortColumn, sortOrder.toUpperCase());
  
  // 페이지네이션 추가
  const offset = (page - 1) * limit;
  queryBuilder.limit(limit, offset);
  
  // 쿼리 빌드
  const { query, params } = queryBuilder.build();
  const countQuery = queryBuilder.buildCount().query;

  // 쿼리 실행
  this.logger.debug('Executing dormantHighValueUsers query');
  
  try {
    // 서버리스 환경에서는 병렬 요청으로 성능 최적화
    const [results, countResult] = await Promise.all([
      executeQuery(query, params),
      executeQuery(countQuery, [])
    ]);
    
    const total = countResult[0].total;
    
    // 입금 정보 요청된 경우 포함
    let usersWithDeposits = results;
    
    if (includeDepositInfo) {
      const userIds = results.map(user => user.userId);
      
      if (userIds.length > 0) {
        // 최근 입금 정보 조회 (최근 1년)
        const depositQuery = `
          SELECT 
            user_id as userId,
            COUNT(*) as depositCount,
            SUM(amount) as totalDeposits,
            MAX(deposit_date) as lastDepositDate
          FROM deposits
          WHERE user_id IN (${userIds.map(() => '?').join(',')})
          AND deposit_date >= DATE_SUB(CURRENT_DATE, INTERVAL 365 DAY)
          GROUP BY user_id
        `;
        
        const depositResults = await executeQuery(depositQuery, userIds);
        
        // 사용자별 입금 정보 매핑
        const depositMap = new Map();
        depositResults.forEach(deposit => {
          depositMap.set(deposit.userId, deposit);
        });
        
        // 사용자 정보에 입금 정보 추가
        usersWithDeposits = results.map(user => {
          const depositInfo = depositMap.get(user.userId) || {
            depositCount: 0,
            totalDeposits: 0,
            lastDepositDate: null
          };
          
          return {
            ...user,
            depositInfo
          };
        });
      }
    }
    
    const result = {
      users: usersWithDeposits,
      total,
      page: parseInt(page, 10),
      limit: parseInt(limit, 10),
      pages: Math.ceil(total / limit),
    };
    
    // 결과 캐싱 (사용 가능한 경우)
    if (this.cacheEnabled) {
      try {
        await this._cacheResult(cacheKey, result);
      } catch (error) {
        this.logger.warn(`Error caching result: ${error.message}`);
      }
    }
    
    return result;
  } catch (error) {
    this.logger.error('Error executing dormantHighValueUsers query:', error);
    throw error;
  }
}

  /**
 * 사용자 세그먼트 분석
 * @param {Object} options - 분석 옵션
 * @return {Promise<Object>} 세그먼트 분석 결과
 */
async analyzeUserSegments(options = {}) {
  const { 
    minNetBet = 50000, 
    minPlayDays = 7,
    timeRange = 'all'
  } = options;

  // 캐시 검사 (사용 가능한 경우)
  const cacheKey = `userSegments_${JSON.stringify(options)}`;
  
  if (this.cacheEnabled) {
    try {
      const cachedResult = await this._getCachedResult(cacheKey);
      if (cachedResult) {
        this.logger.info(`Cache hit for ${cacheKey}`);
        return cachedResult;
      }
    } catch (error) {
      this.logger.warn(`Error checking cache: ${error.message}`);
    }
  }
  
  // 시간 범위에 따른 추가 조건
  let timeCondition = '';
  const timeParams = [];
  
  if (timeRange !== 'all') {
    const days = parseInt(timeRange.replace('d', ''), 10);
    timeCondition = 'AND g.date >= DATE_SUB(CURRENT_DATE, INTERVAL ? DAY)';
    timeParams.push(days);
  }

  try {
    // 서버리스 환경에 최적화된 병렬 쿼리 실행
    // 쿼리 정의
    const totalStatsQuery = `
      SELECT 
        COUNT(*) as totalUsers,
        AVG(playDays) as avgPlayDays,
        AVG(netBet) as avgNetBet,
        AVG(DATEDIFF(CURRENT_DATE, lastActivity)) as avgInactiveDays
      FROM (
        SELECT 
          u.id,
          COUNT(DISTINCT g.date) as playDays,
          SUM(g.net_bet) as netBet,
          MAX(g.date) as lastActivity
        FROM users u
        JOIN game_logs g ON u.id = g.user_id
        WHERE 1=1 ${timeCondition}
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
        AVG(netBet) as avgNetBet,
        MIN(lastActivity) as oldestActivity,
        MAX(lastActivity) as newestActivity
      FROM (
        SELECT 
          u.id,
          COUNT(DISTINCT g.date) as playDays,
          SUM(g.net_bet) as netBet,
          MAX(g.date) as lastActivity,
          DATEDIFF(CURRENT_DATE, MAX(g.date)) as inactiveDays
        FROM users u
        JOIN game_logs g ON u.id = g.user_id
        WHERE 1=1 ${timeCondition}
        GROUP BY u.id
        HAVING playDays >= ? AND netBet >= ?
      ) as high_value_users
      GROUP BY segment
      ORDER BY FIELD(segment, 'active', 'inactive_30_60', 'inactive_60_90', 'inactive_90_180', 'inactive_180_365', 'inactive_365_plus')
    `;

    // 베팅 금액별 분포
    const betDistributionQuery = `
      SELECT 
        CASE 
          WHEN netBet < 100000 THEN 'tier_1_under_100k'
          WHEN netBet < 500000 THEN 'tier_2_100k_500k'
          WHEN netBet < 1000000 THEN 'tier_3_500k_1m'
          WHEN netBet < 5000000 THEN 'tier_4_1m_5m'
          ELSE 'tier_5_over_5m'
        END as betTier,
        COUNT(*) as userCount,
        AVG(playDays) as avgPlayDays,
        AVG(inactiveDays) as avgInactiveDays
      FROM (
        SELECT 
          u.id,
          COUNT(DISTINCT g.date) as playDays,
          SUM(g.net_bet) as netBet,
          DATEDIFF(CURRENT_DATE, MAX(g.date)) as inactiveDays
        FROM users u
        JOIN game_logs g ON u.id = g.user_id
        WHERE 1=1 ${timeCondition}
        GROUP BY u.id
        HAVING playDays >= ? AND netBet >= ?
      ) as high_value_users
      GROUP BY betTier
      ORDER BY FIELD(betTier, 'tier_1_under_100k', 'tier_2_100k_500k', 'tier_3_500k_1m', 'tier_4_1m_5m', 'tier_5_over_5m')
    `;

    // 이벤트 참여 분포
    const eventParticipationQuery = `
      SELECT 
        CASE 
          WHEN event_count = 0 THEN 'no_events'
          WHEN event_count = 1 THEN 'one_event'
          WHEN event_count <= 3 THEN 'few_events'
          WHEN event_count <= 10 THEN 'regular_events'
          ELSE 'frequent_events'
        END as eventParticipation,
        COUNT(*) as userCount,
        AVG(playDays) as avgPlayDays,
        AVG(netBet) as avgNetBet,
        AVG(inactiveDays) as avgInactiveDays
      FROM (
        SELECT 
          u.id,
          COUNT(DISTINCT g.date) as playDays,
          SUM(g.net_bet) as netBet,
          DATEDIFF(CURRENT_DATE, MAX(g.date)) as inactiveDays,
          COUNT(DISTINCT pe.event_id) as event_count
        FROM users u
        JOIN game_logs g ON u.id = g.user_id
        LEFT JOIN participant_events pe ON u.id = pe.user_id
        WHERE 1=1 ${timeCondition}
        GROUP BY u.id
        HAVING playDays >= ? AND netBet >= ?
      ) as high_value_users
      GROUP BY eventParticipation
      ORDER BY FIELD(eventParticipation, 'no_events', 'one_event', 'few_events', 'regular_events', 'frequent_events')
    `;
    
    // 병렬 쿼리 실행 (서버리스 환경에서 성능 최적화)
    const [totalStats, segmentDistribution, betDistribution, eventParticipation] = await Promise.all([
      executeQuery(totalStatsQuery, [...timeParams, minPlayDays, minNetBet]),
      executeQuery(segmentDistributionQuery, [...timeParams, minPlayDays, minNetBet]),
      executeQuery(betDistributionQuery, [...timeParams, minPlayDays, minNetBet]),
      executeQuery(eventParticipationQuery, [...timeParams, minPlayDays, minNetBet])
    ]);
    
    // 결과 조합
    const result = {
      criteria: {
        minNetBet,
        minPlayDays,
        timeRange
      },
      analysisTimestamp: new Date().toISOString(),
      totalStats: totalStats[0],
      segmentDistribution,
      betDistribution,
      eventParticipation
    };
    
    // 결과 캐싱 (사용 가능한 경우)
    if (this.cacheEnabled) {
      try {
        await this._cacheResult(cacheKey, result);
        
        // Firestore에도 분석 결과 저장 (배치 처리)
        const firestoreBatchSave = async () => {
          try {
            await this.resultsRepository.create({
              type: 'userSegments',
              criteria: result.criteria,
              result: result,
              createdAt: admin.firestore.FieldValue.serverTimestamp()
            });
          } catch (error) {
            this.logger.warn(`Error saving result to Firestore: ${error.message}`);
          }
        };
        
        // 비동기 저장 (응답 지연 방지)
        firestoreBatchSave().catch(error => {
          this.logger.error(`Firestore batch save failed: ${error.message}`);
        });
      } catch (error) {
        this.logger.warn(`Error caching result: ${error.message}`);
      }
    }
    
    return result;
  } catch (error) {
    this.logger.error('Error executing analyzeUserSegments query:', error);
    throw error;
  }
}

  /**
   * 사용자 ID로 사용자 상세 정보 조회
   * @param {number} userId - 사용자 ID
   * @param {Object} options - 조회 옵션
   * @return {Promise<Object>} 사용자 상세 정보
   */
  async getUserDetails(userId, options = {}) {
    const {
      includeActivity = true,
      includeEvents = true,
      activityDays = 30
    } = options;

    // 캐시 키에는 옵션을 포함
    const cacheKey = `userDetails_${userId}_${JSON.stringify(options)}`;
    
    if (this.cacheEnabled) {
      try {
        const cachedResult = await this._getCachedResult(cacheKey);
        if (cachedResult) {
          this.logger.info(`Cache hit for ${cacheKey}`);
          return cachedResult;
        }
      } catch (error) {
        this.logger.warn(`Error checking cache: ${error.message}`);
      }
    }

    // 사용자 기본 정보 쿼리
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

    try {
      // 사용자 기본 정보 조회
      const users = await executeQuery(userQuery, [userId]);
      
      if (users.length === 0) {
        throw new NotFoundError(`User with ID ${userId} not found`);
      }
      
      const user = users[0];
      let activityHistory = [];
      let eventParticipation = [];
      
      // 사용자 게임 활동 내역 조회 (요청된 경우)
      if (includeActivity) {
        const activityQuery = `
          SELECT 
            date,
            COUNT(*) as sessionCount,
            SUM(net_bet) as totalNetBet,
            SUM(win_amount) as totalWinAmount
          FROM game_logs
          WHERE user_id = ?
          AND date >= DATE_SUB(CURRENT_DATE, INTERVAL ? DAY)
          GROUP BY date
          ORDER BY date DESC
        `;
        
        activityHistory = await executeQuery(activityQuery, [userId, activityDays]);
      }
      
      // 사용자 이벤트 참여 내역 조회 (요청된 경우)
      if (includeEvents) {
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
        
        eventParticipation = await executeQuery(eventsQuery, [userId]);
      }
      
      // 결과 조합
      const result = {
        ...user,
        activityHistory,
        eventParticipation,
      };
      
      // 결과 캐싱 (사용 가능한 경우)
      if (this.cacheEnabled) {
        try {
          await this._cacheResult(cacheKey, result);
        } catch (error) {
          this.logger.warn(`Error caching result: ${error.message}`);
        }
      }
      
      return result;
    } catch (error) {
      if (error instanceof NotFoundError) {
        throw error;
      }
      
      this.logger.error(`Error retrieving user details for user ${userId}:`, error);
      throw error;
    }
  }

  /**
 * 비활성 사용자 재활성화 대상 추천
 * @param {Object} options - 조회 옵션
 * @return {Promise<Object>} 추천 대상 사용자 및 메타데이터
 */
async getReactivationTargets(options = {}) {
  const {
    minNetBet = 50000,
    minPlayDays = 7,
    minInactiveDays = 30,
    maxInactiveDays = 365,
    eventTypes = null,
    includeEventHistory = false,
    page = 1,
    limit = 20,
  } = options;

  // 캐시 검사 (사용 가능한 경우)
  const cacheKey = `reactivationTargets_${JSON.stringify(options)}`;
  
  if (this.cacheEnabled) {
    try {
      const cachedResult = await this._getCachedResult(cacheKey);
      if (cachedResult) {
        this.logger.info(`Cache hit for ${cacheKey}`);
        return cachedResult;
      }
    } catch (error) {
      this.logger.warn(`Error checking cache: ${error.message}`);
    }
  }

  // 이벤트 유형 필터 조건 생성
  let eventTypeCondition = '';
  const eventParams = [];
  
  if (eventTypes && Array.isArray(eventTypes) && eventTypes.length > 0) {
    const placeholders = eventTypes.map(() => '?').join(', ');
    eventTypeCondition = `AND e.event_type IN (${placeholders})`;
    eventParams.push(...eventTypes);
  }

  // 서버리스 환경에 최적화된 쿼리
  // 재활성화 점수 계산 쿼리 (병렬 실행을 위해 단순화)
  const baseQuery = `
    SELECT 
      u.id as userId,
      u.username as userName,
      COUNT(DISTINCT g.date) as playDays,
      SUM(g.net_bet) as netBet,
      MAX(g.date) as lastActivity,
      DATEDIFF(CURRENT_DATE, MAX(g.date)) as inactiveDays,
      COUNT(DISTINCT pe.event_id) as eventCount,
      SUM(g.win_amount) as totalWinAmount,
      (
        (COUNT(DISTINCT g.date) * 0.3) + 
        (SUM(g.net_bet) / 100000 * 0.4) + 
        (CASE 
          WHEN DATEDIFF(CURRENT_DATE, MAX(g.date)) BETWEEN 30 AND 90 THEN 10
          WHEN DATEDIFF(CURRENT_DATE, MAX(g.date)) BETWEEN 91 AND 180 THEN 7
          WHEN DATEDIFF(CURRENT_DATE, MAX(g.date)) BETWEEN 181 AND 365 THEN 5
          ELSE 3
        END) +
        (COUNT(DISTINCT pe.event_id) * 0.5) +
        (CASE WHEN SUM(g.win_amount) > SUM(g.net_bet) THEN 2 ELSE 0 END)
      ) as reactivationScore
    FROM users u
    JOIN game_logs g ON u.id = g.user_id
    LEFT JOIN participant_events pe ON u.id = pe.user_id
    LEFT JOIN events e ON pe.event_id = e.id
    WHERE 1=1 ${eventTypeCondition}
    GROUP BY u.id, u.username
    HAVING 
      playDays >= ${minPlayDays} 
      AND netBet >= ${minNetBet}
      AND inactiveDays BETWEEN ${minInactiveDays} AND ${maxInactiveDays}
  `;

  // 동적 쿼리 빌드
  const queryBuilder = new QueryBuilder(baseQuery);
  
  // 정렬 추가 (재활성화 점수 기준)
  queryBuilder.orderBy('reactivationScore', 'DESC');
  
  // 페이지네이션 추가
  const offset = (page - 1) * limit;
  queryBuilder.limit(limit, offset);
  
  // 쿼리 빌드
  const { query, params } = queryBuilder.build();
  
  // 파라미터 병합
  const queryParams = [...eventParams, ...params];
  
  // 카운트 쿼리 빌드
  const countQuery = queryBuilder.buildCount().query;
  const countParams = [...eventParams];

  // 쿼리 실행
  this.logger.debug('Executing reactivationTargets query');
  
  try {
    // 서버리스 환경에서는 병렬 요청으로 성능 최적화
    const [results, countResult] = await Promise.all([
      executeQuery(query, queryParams),
      executeQuery(countQuery, countParams)
    ]);
    
    const total = countResult[0].total;
    
    // 이벤트 참여 내역 포함 (요청된 경우)
    let usersWithEventHistory = results;
    
    if (includeEventHistory) {
      const userIds = results.map(user => user.userId);
      
      if (userIds.length > 0) {
        // 최근 참여 이벤트 조회
        const eventQuery = `
          SELECT 
            pe.user_id as userId,
            e.id as eventId,
            e.name as eventName,
            e.event_type as eventType,
            pe.participation_date as participationDate,
            pe.reward_amount as rewardAmount
          FROM participant_events pe
          JOIN events e ON pe.event_id = e.id
          WHERE pe.user_id IN (${userIds.map(() => '?').join(',')})
          ORDER BY pe.participation_date DESC
        `;
        
        const eventResults = await executeQuery(eventQuery, userIds);
        
        // 사용자별 이벤트 참여 내역 그룹화
        const eventMap = new Map();
        eventResults.forEach(event => {
          if (!eventMap.has(event.userId)) {
            eventMap.set(event.userId, []);
          }
          eventMap.get(event.userId).push(event);
        });
        
        // 사용자 정보에 이벤트 참여 내역 추가
        usersWithEventHistory = results.map(user => {
          const eventHistory = eventMap.get(user.userId) || [];
          
          return {
            ...user,
            eventHistory: eventHistory.slice(0, 5) // 최근 5개만 포함
          };
        });
      }
    }
    
    // 재활성화 추천 이벤트 추가
    const usersWithRecommendations = usersWithEventHistory.map(user => {
      // 재활성화 전략 결정 - 점수 및 특성에 따라 맞춤형 이벤트 추천
      let recommendedStrategy;
      
      if (user.totalWinAmount > user.netBet) {
        // 승률이 높은 사용자 - 승리 기반 이벤트 추천
        recommendedStrategy = 'winning_boost';
      } else if (user.eventCount > 3) {
        // 이벤트 참여도 높은 사용자 - 이벤트 참여 보상 강화
        recommendedStrategy = 'event_incentive';
      } else if (user.inactiveDays > 180) {
        // 장기 휴면 사용자 - 복귀 보너스 강화
        recommendedStrategy = 'comeback_bonus';
      } else {
        // 기본 추천 전략
        recommendedStrategy = 'personalized_offer';
      }
      
      return {
        ...user,
        recommendedStrategy,
        recommendationReason: getRecommendationReason(recommendedStrategy, user)
      };
    });
    
    const result = {
      users: usersWithRecommendations,
      total,
      page: parseInt(page, 10),
      limit: parseInt(limit, 10),
      pages: Math.ceil(total / limit),
    };
    
    // 결과 캐싱 (사용 가능한 경우)
    if (this.cacheEnabled) {
      try {
        await this._cacheResult(cacheKey, result);
      } catch (error) {
        this.logger.warn(`Error caching result: ${error.message}`);
      }
    }
    
    return result;
  } catch (error) {
    this.logger.error('Error executing reactivationTargets query:', error);
    throw error;
  }
}

/**
 * 사용자에게 추천 이유 생성
 * @param {string} strategy - 추천 전략
 * @param {Object} user - 사용자 정보
 * @return {string} 추천 이유
 * @private
 */
function getRecommendationReason(strategy, user) {
  switch (strategy) {
    case 'winning_boost':
      return `이 사용자는 게임에서 승리했던 경험이 많습니다 (순이익: ${formatNumber(user.totalWinAmount - user.netBet)}). 승리 기회를 강조한 이벤트가 효과적일 것입니다.`;
    case 'event_incentive':
      return `이전에 ${user.eventCount}개의 이벤트에 참여한 경험이 있어 이벤트 참여도가 높습니다. 보상이 강화된 이벤트를 제공하세요.`;
    case 'comeback_bonus':
      return `장기간 (${user.inactiveDays}일) 비활성 상태였지만 과거 활동 수준이 높았습니다 (베팅액: ${formatNumber(user.netBet)}). 특별 복귀 보너스를 제공하세요.`;
    case 'personalized_offer':
      return `이 사용자는 평균 ${Math.round(user.netBet / user.playDays).toLocaleString()}의 일일 베팅액을 가지고 있습니다. 개인화된 프로모션을 제공하세요.`;
    default:
      return '맞춤형 재활성화 전략을 추천합니다.';
  }
}

/**
 * 숫자 포맷팅 (천 단위 구분)
 * @param {number} num - 포맷팅할 숫자
 * @return {string} 포맷팅된 문자열
 * @private
 */
function formatNumber(num) {
  return num.toLocaleString();
}

  /**
   * 캐시된 결과 조회 (Firebase 메모리 또는 Firestore 사용)
   * @param {string} key - 캐시 키
   * @return {Promise<Object|null>} 캐시된 결과 또는 null
   * @private
   */
  async _getCachedResult(key) {
    try {
      // Firestore에서 캐시 결과 조회
      const cacheDoc = await admin.firestore()
        .collection('cache')
        .doc(key)
        .get();
      
      if (cacheDoc.exists) {
        const cachedData = cacheDoc.data();
        
        // 캐시 만료 여부 확인
        if (cachedData.expiresAt && cachedData.expiresAt.toDate() > new Date()) {
          return cachedData.data;
        }
      }
      
      return null;
    } catch (error) {
      this.logger.warn(`Error retrieving cached result for ${key}:`, error);
      return null;
    }
  }

  /**
   * 결과 캐싱 (Firebase 메모리 또는 Firestore 사용)
   * @param {string} key - 캐시 키
   * @param {Object} data - 캐싱할 데이터
   * @return {Promise<void>}
   * @private
   */
  async _cacheResult(key, data) {
    try {
      // 만료 시간 계산
      const expiresAt = admin.firestore.Timestamp.fromDate(
        new Date(Date.now() + this.cacheTTL)
      );
      
      // Firestore에 캐시 저장
      await admin.firestore()
        .collection('cache')
        .doc(key)
        .set({
          data,
          createdAt: admin.firestore.FieldValue.serverTimestamp(),
          expiresAt,
          ttl: this.cacheTTL
        });
      
      this.logger.debug(`Cached result for ${key} with TTL ${this.cacheTTL}ms`);
    } catch (error) {
      this.logger.warn(`Error caching result for ${key}:`, error);
    }
  }
}

// 모듈 내보내기
module.exports = HighValueUserService;
