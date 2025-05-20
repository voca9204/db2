/**
 * 이벤트 효과 분석 서비스
 * 이벤트 참여 및 전환율 분석 관련 비즈니스 로직
 */

const { executeQuery } = require('../../db');
const { buildQuery } = require('../utils/query-builder');
const { NotFoundError } = require('../middleware/error-handler');
const admin = require('firebase-admin');
const { getContextLogger } = require('../utils/logger');
const FirestoreRepository = require('../utils/firestore-repository');

// 컬럼 매핑
const COLUMN_MAPPING = {
  eventId: 'event_id',
  eventName: 'event_name',
  startDate: 'start_date',
  endDate: 'end_date',
  participantCount: 'participant_count',
  activeUserCount: 'active_user_count',
  dormantUserCount: 'dormant_user_count',
  conversionCount: 'conversion_count',
  conversionRate: 'conversion_rate',
};

/**
 * 이벤트 목록 조회
 * @param {Object} options 조회 옵션
 * @return {Promise<Object>} 이벤트 목록 및 메타데이터
 */
const getEvents = async (options = {}) => {
  const {
    startDate,
    endDate,
    status,
    sortBy = 'startDate',
    sortOrder = 'desc',
    page = 1,
    limit = 20,
  } = options;
  
  // 로거 초기화
  const logger = getContextLogger();
  
  // 캐시 사용 여부 설정
  const cacheEnabled = process.env.ENABLE_CACHE === 'true';
  const cacheTTL = parseInt(process.env.CACHE_TTL_SECONDS || '300', 10) * 1000; // 기본값 5분
  
  // 캐시 검사 (사용 가능한 경우)
  const cacheKey = `events_${JSON.stringify(options)}`;
  
  if (cacheEnabled) {
    try {
      const cachedResult = await getCachedResult(cacheKey);
      if (cachedResult) {
        logger.info(`Cache hit for ${cacheKey}`);
        return cachedResult;
      }
    } catch (error) {
      logger.warn(`Error checking cache: ${error.message}`);
    }
  }

  // 필터 조건 구성
  const filters = {};
  
  if (startDate) {
    filters.startDate = { gte: startDate };
  }
  
  if (endDate) {
    filters.endDate = { lte: endDate };
  }
  
  if (status) {
    filters.status = status;
  }

  // 기본 쿼리
  const baseQuery = `
    SELECT 
      e.id as eventId,
      e.name as eventName,
      e.description,
      e.start_date as startDate,
      e.end_date as endDate,
      e.status,
      e.reward_type as rewardType,
      e.reward_amount as rewardAmount,
      COUNT(DISTINCT pe.user_id) as participantCount
    FROM events e
    LEFT JOIN participant_events pe ON e.id = pe.event_id
    GROUP BY e.id, e.name, e.description, e.start_date, e.end_date, e.status, e.reward_type, e.reward_amount
  `;

  // 동적 쿼리 빌드
  const { query, countQuery, params } = buildQuery({
    baseQuery,
    filters,
    filterMapping: COLUMN_MAPPING,
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

  const result = {
    events: results,
    total,
    page: parseInt(page, 10),
    limit: parseInt(limit, 10),
    pages: Math.ceil(total / limit),
  };
  
  // 결과 캐싱 (사용 가능한 경우)
  if (cacheEnabled) {
    try {
      await cacheResult(cacheKey, result, cacheTTL);
      logger.debug(`Cached result for ${cacheKey} with TTL ${cacheTTL}ms`);
    } catch (error) {
      logger.warn(`Error caching result: ${error.message}`);
    }
  }

  return result;
};

/**
 * 이벤트 상세 정보 및 분석 조회
 * @param {number} eventId 이벤트 ID
 * @return {Promise<Object>} 이벤트 상세 정보 및 분석 결과
 */
const getEventAnalysis = async (eventId) => {
  // 로거 초기화
  const logger = getContextLogger();
  
  // 캐시 사용 여부 설정
  const cacheEnabled = process.env.ENABLE_CACHE === 'true';
  const cacheTTL = parseInt(process.env.CACHE_TTL_SECONDS || '300', 10) * 1000; // 기본값 5분
  
  // 캐시 검사 (사용 가능한 경우)
  const cacheKey = `eventAnalysis_${eventId}`;
  
  if (cacheEnabled) {
    try {
      const cachedResult = await getCachedResult(cacheKey);
      if (cachedResult) {
        logger.info(`Cache hit for ${cacheKey}`);
        return cachedResult;
      }
    } catch (error) {
      logger.warn(`Error checking cache: ${error.message}`);
    }
  }
  // 이벤트 정보 조회 쿼리
  const eventQuery = `
    SELECT 
      e.id as eventId,
      e.name as eventName,
      e.description,
      e.start_date as startDate,
      e.end_date as endDate,
      e.status,
      e.reward_type as rewardType,
      e.reward_amount as rewardAmount,
      COUNT(DISTINCT pe.user_id) as participantCount
    FROM events e
    LEFT JOIN participant_events pe ON e.id = pe.event_id
    WHERE e.id = ?
    GROUP BY e.id, e.name, e.description, e.start_date, e.end_date, e.status, e.reward_type, e.reward_amount
  `;

  const events = await executeQuery(eventQuery, [eventId]);
  
  if (events.length === 0) {
    throw new NotFoundError(`Event with ID ${eventId} not found`);
  }
  
  const event = events[0];
  
  // 30일 이상 휴면 상태였던 사용자 중 이벤트 참여자 수
  const dormantParticipantsQuery = `
    SELECT COUNT(DISTINCT pe.user_id) as dormantParticipantCount
    FROM participant_events pe
    JOIN (
      SELECT 
        u.id,
        DATEDIFF(pe.participation_date, MAX(g.date)) as inactiveDays
      FROM users u
      JOIN participant_events pe ON u.id = pe.user_id
      JOIN game_logs g ON u.id = g.user_id AND g.date < pe.participation_date
      WHERE pe.event_id = ?
      GROUP BY u.id, pe.participation_date
      HAVING inactiveDays >= 30
    ) as dormant_users ON pe.user_id = dormant_users.id
    WHERE pe.event_id = ?
  `;
  
  const dormantResult = await executeQuery(dormantParticipantsQuery, [eventId, eventId]);
  const dormantParticipantCount = dormantResult[0].dormantParticipantCount;
  
  // 이벤트 참여 후 30일 이내 입금한 사용자 수 (전환 지표)
  const conversionQuery = `
    SELECT COUNT(DISTINCT t.user_id) as conversionCount
    FROM transactions t
    JOIN participant_events pe ON t.user_id = pe.user_id
    WHERE 
      pe.event_id = ?
      AND t.type = 'deposit'
      AND t.date > pe.participation_date
      AND DATEDIFF(t.date, pe.participation_date) <= 30
  `;
  
  const conversionResult = await executeQuery(conversionQuery, [eventId]);
  const conversionCount = conversionResult[0].conversionCount;
  
  // 참여자 세그먼트 분석
  const participantSegmentQuery = `
    SELECT 
      CASE 
        WHEN inactiveDays < 0 THEN 'new_user'
        WHEN inactiveDays = 0 THEN 'active_same_day'
        WHEN inactiveDays <= 7 THEN 'active_week'
        WHEN inactiveDays <= 30 THEN 'active_month'
        WHEN inactiveDays <= 90 THEN 'inactive_3_months'
        WHEN inactiveDays <= 180 THEN 'inactive_6_months'
        WHEN inactiveDays <= 365 THEN 'inactive_year'
        ELSE 'inactive_over_year'
      END as segment,
      COUNT(DISTINCT user_id) as userCount
    FROM (
      SELECT 
        pe.user_id,
        DATEDIFF(pe.participation_date, IFNULL(MAX(g.date), '1970-01-01')) as inactiveDays
      FROM participant_events pe
      LEFT JOIN game_logs g ON pe.user_id = g.user_id AND g.date < pe.participation_date
      WHERE pe.event_id = ?
      GROUP BY pe.user_id, pe.participation_date
    ) as user_segments
    GROUP BY segment
    ORDER BY FIELD(
      segment, 
      'new_user', 'active_same_day', 'active_week', 'active_month', 
      'inactive_3_months', 'inactive_6_months', 'inactive_year', 'inactive_over_year'
    )
  `;
  
  const participantSegments = await executeQuery(participantSegmentQuery, [eventId]);
  
  // 입금 전환율 분석
  const conversionRateBySegmentQuery = `
    SELECT 
      segments.segment,
      COUNT(DISTINCT segments.user_id) as totalUsers,
      COUNT(DISTINCT t.user_id) as convertedUsers,
      ROUND(COUNT(DISTINCT t.user_id) / COUNT(DISTINCT segments.user_id) * 100, 2) as conversionRate
    FROM (
      SELECT 
        pe.user_id,
        CASE 
          WHEN inactiveDays < 0 THEN 'new_user'
          WHEN inactiveDays = 0 THEN 'active_same_day'
          WHEN inactiveDays <= 7 THEN 'active_week'
          WHEN inactiveDays <= 30 THEN 'active_month'
          WHEN inactiveDays <= 90 THEN 'inactive_3_months'
          WHEN inactiveDays <= 180 THEN 'inactive_6_months'
          WHEN inactiveDays <= 365 THEN 'inactive_year'
          ELSE 'inactive_over_year'
        END as segment
      FROM participant_events pe
      LEFT JOIN (
        SELECT 
          u.id,
          MAX(g.date) as last_active_date
        FROM users u
        JOIN game_logs g ON u.id = g.user_id
        GROUP BY u.id
      ) as activity ON pe.user_id = activity.id
      CROSS JOIN (
        SELECT DATEDIFF(pe2.participation_date, IFNULL(activity2.last_active_date, '1970-01-01')) as inactiveDays
        FROM participant_events pe2
        LEFT JOIN (
          SELECT 
            u2.id,
            MAX(g2.date) as last_active_date
          FROM users u2
          JOIN game_logs g2 ON u2.id = g2.user_id
          GROUP BY u2.id
        ) as activity2 ON pe2.user_id = activity2.id
        WHERE pe2.event_id = ?
        LIMIT 1
      ) as days
      WHERE pe.event_id = ?
    ) as segments
    LEFT JOIN transactions t ON 
      segments.user_id = t.user_id 
      AND t.type = 'deposit'
      AND t.date > (
        SELECT participation_date 
        FROM participant_events 
        WHERE user_id = segments.user_id AND event_id = ?
      )
      AND DATEDIFF(t.date, (
        SELECT participation_date 
        FROM participant_events 
        WHERE user_id = segments.user_id AND event_id = ?
      )) <= 30
    GROUP BY segments.segment
    ORDER BY FIELD(
      segments.segment, 
      'new_user', 'active_same_day', 'active_week', 'active_month', 
      'inactive_3_months', 'inactive_6_months', 'inactive_year', 'inactive_over_year'
    )
  `;
  
  const conversionRateBySegment = await executeQuery(conversionRateBySegmentQuery, [eventId, eventId, eventId, eventId]);
  
  // 분석 결과 종합
  const result = {
    ...event,
    analysis: {
      dormantParticipantCount,
      conversionCount,
      conversionRate: event.participantCount > 0 ? (conversionCount / event.participantCount * 100).toFixed(2) : 0,
      participantSegments,
      conversionRateBySegment,
    }
  };
  
  // 결과 캐싱 (사용 가능한 경우)
  if (cacheEnabled) {
    try {
      await cacheResult(cacheKey, result, cacheTTL);
      logger.debug(`Cached result for ${cacheKey} with TTL ${cacheTTL}ms`);
    } catch (error) {
      logger.warn(`Error caching result: ${error.message}`);
    }
  }
  
  return result;
};

/**
 * 이벤트 참여와 전환율 분석
 * @param {Object} options 분석 옵션
 * @return {Promise<Object>} 분석 결과
 */
const analyzeEventConversion = async (options = {}) => {
  const {
    startDate = null,
    endDate = null,
    minParticipants = 10,
  } = options;
  
  // 로거 초기화
  const logger = getContextLogger();
  
  // 캐시 사용 여부 설정
  const cacheEnabled = process.env.ENABLE_CACHE === 'true';
  const cacheTTL = parseInt(process.env.CACHE_TTL_SECONDS || '300', 10) * 1000; // 기본값 5분
  
  // 캐시 검사 (사용 가능한 경우)
  const cacheKey = `eventConversion_${JSON.stringify(options)}`;
  
  if (cacheEnabled) {
    try {
      const cachedResult = await getCachedResult(cacheKey);
      if (cachedResult) {
        logger.info(`Cache hit for ${cacheKey}`);
        return cachedResult;
      }
    } catch (error) {
      logger.warn(`Error checking cache: ${error.message}`);
    }
  }

  // 날짜 필터링 조건
  let dateFilter = '';
  const dateParams = [];
  
  if (startDate) {
    dateFilter += ' AND e.start_date >= ?';
    dateParams.push(startDate);
  }
  
  if (endDate) {
    dateFilter += ' AND e.end_date <= ?';
    dateParams.push(endDate);
  }

  // 이벤트별 전환율 분석 쿼리
  const eventConversionQuery = `
    SELECT 
      e.id as eventId,
      e.name as eventName,
      e.start_date as startDate,
      e.end_date as endDate,
      e.reward_type as rewardType,
      e.reward_amount as rewardAmount,
      COUNT(DISTINCT pe.user_id) as participantCount,
      SUM(CASE WHEN dormant_flag.is_dormant = 1 THEN 1 ELSE 0 END) as dormantUserCount,
      SUM(CASE WHEN dormant_flag.is_dormant = 0 THEN 1 ELSE 0 END) as activeUserCount,
      COUNT(DISTINCT conversion.user_id) as conversionCount,
      ROUND(COUNT(DISTINCT conversion.user_id) / COUNT(DISTINCT pe.user_id) * 100, 2) as conversionRate,
      ROUND(SUM(IFNULL(conversion.deposit_amount, 0)), 2) as totalDepositAmount,
      ROUND(SUM(IFNULL(conversion.deposit_amount, 0)) / NULLIF(COUNT(DISTINCT conversion.user_id), 0), 2) as avgDepositAmount
    FROM events e
    JOIN participant_events pe ON e.id = pe.event_id
    LEFT JOIN (
      SELECT 
        user_segments.user_id,
        user_segments.event_id,
        CASE WHEN user_segments.inactiveDays >= 30 THEN 1 ELSE 0 END as is_dormant
      FROM (
        SELECT 
          pe.user_id,
          pe.event_id,
          DATEDIFF(pe.participation_date, IFNULL(MAX(g.date), '1970-01-01')) as inactiveDays
        FROM participant_events pe
        LEFT JOIN game_logs g ON pe.user_id = g.user_id AND g.date < pe.participation_date
        GROUP BY pe.user_id, pe.event_id, pe.participation_date
      ) as user_segments
    ) as dormant_flag ON pe.user_id = dormant_flag.user_id AND pe.event_id = dormant_flag.event_id
    LEFT JOIN (
      SELECT 
        pe.user_id,
        pe.event_id,
        SUM(t.amount) as deposit_amount
      FROM participant_events pe
      JOIN transactions t ON 
        pe.user_id = t.user_id 
        AND t.type = 'deposit'
        AND t.date > pe.participation_date
        AND DATEDIFF(t.date, pe.participation_date) <= 30
      GROUP BY pe.user_id, pe.event_id
    ) as conversion ON pe.user_id = conversion.user_id AND pe.event_id = conversion.event_id
    WHERE 1=1 ${dateFilter}
    GROUP BY e.id, e.name, e.start_date, e.end_date, e.reward_type, e.reward_amount
    HAVING participantCount >= ?
    ORDER BY startDate DESC
  `;
  
  const params = [...dateParams, minParticipants];
  const eventConversions = await executeQuery(eventConversionQuery, params);
  
  // 전환율과 보상 금액의 상관관계 분석
  const rewardAnalysisQuery = `
    SELECT 
      e.reward_type as rewardType,
      ROUND(AVG(e.reward_amount), 2) as avgRewardAmount,
      ROUND(AVG(
        COUNT(DISTINCT t.user_id) / COUNT(DISTINCT pe.user_id) * 100
      ), 2) as avgConversionRate
    FROM events e
    JOIN participant_events pe ON e.id = pe.event_id
    LEFT JOIN (
      SELECT 
        pe.user_id,
        pe.event_id
      FROM participant_events pe
      JOIN transactions t ON 
        pe.user_id = t.user_id 
        AND t.type = 'deposit'
        AND t.date > pe.participation_date
        AND DATEDIFF(t.date, pe.participation_date) <= 30
      GROUP BY pe.user_id, pe.event_id
    ) as t ON pe.user_id = t.user_id AND pe.event_id = t.event_id
    WHERE 1=1 ${dateFilter}
    GROUP BY e.id, e.name
    HAVING COUNT(DISTINCT pe.user_id) >= ?
  `;
  
  const rewardAnalysis = await executeQuery(rewardAnalysisQuery, params);
  
  // 휴면 기간별 전환율 분석
  const dormancyAnalysisQuery = `
    SELECT 
      dormancy_period.period,
      COUNT(DISTINCT pe.user_id) as userCount,
      COUNT(DISTINCT t.user_id) as convertedCount,
      ROUND(COUNT(DISTINCT t.user_id) / COUNT(DISTINCT pe.user_id) * 100, 2) as conversionRate
    FROM participant_events pe
    JOIN (
      SELECT 
        user_segments.user_id,
        user_segments.event_id,
        CASE 
          WHEN user_segments.inactiveDays < 0 THEN 'new_user'
          WHEN user_segments.inactiveDays = 0 THEN '0_days'
          WHEN user_segments.inactiveDays <= 7 THEN '1-7_days'
          WHEN user_segments.inactiveDays <= 30 THEN '8-30_days'
          WHEN user_segments.inactiveDays <= 90 THEN '31-90_days'
          WHEN user_segments.inactiveDays <= 180 THEN '91-180_days'
          WHEN user_segments.inactiveDays <= 365 THEN '181-365_days'
          ELSE 'over_365_days'
        END as period
      FROM (
        SELECT 
          pe.user_id,
          pe.event_id,
          DATEDIFF(pe.participation_date, IFNULL(MAX(g.date), '1970-01-01')) as inactiveDays
        FROM participant_events pe
        JOIN events e ON pe.event_id = e.id
        LEFT JOIN game_logs g ON pe.user_id = g.user_id AND g.date < pe.participation_date
        WHERE 1=1 ${dateFilter}
        GROUP BY pe.user_id, pe.event_id, pe.participation_date
      ) as user_segments
    ) as dormancy_period ON pe.user_id = dormancy_period.user_id AND pe.event_id = dormancy_period.event_id
    JOIN events e ON pe.event_id = e.id
    LEFT JOIN (
      SELECT 
        pe.user_id,
        pe.event_id
      FROM participant_events pe
      JOIN transactions t ON 
        pe.user_id = t.user_id 
        AND t.type = 'deposit'
        AND t.date > pe.participation_date
        AND DATEDIFF(t.date, pe.participation_date) <= 30
      GROUP BY pe.user_id, pe.event_id
    ) as t ON pe.user_id = t.user_id AND pe.event_id = t.event_id
    GROUP BY dormancy_period.period
    ORDER BY FIELD(
      dormancy_period.period, 
      'new_user', '0_days', '1-7_days', '8-30_days', 
      '31-90_days', '91-180_days', '181-365_days', 'over_365_days'
    )
  `;
  
  const dormancyAnalysis = await executeQuery(dormancyAnalysisQuery, params);
  
  const result = {
    eventConversions,
    rewardAnalysis,
    dormancyAnalysis,
    summary: {
      totalEvents: eventConversions.length,
      avgConversionRate: eventConversions.length > 0
        ? eventConversions.reduce((sum, event) => sum + parseFloat(event.conversionRate), 0) / eventConversions.length
        : 0,
      bestEvent: eventConversions.length > 0
        ? eventConversions.reduce((best, event) => 
          parseFloat(event.conversionRate) > parseFloat(best.conversionRate) ? event : best, 
          eventConversions[0])
        : null,
    }
  };
  
  // 결과 캐싱 (사용 가능한 경우)
  if (cacheEnabled) {
    try {
      await cacheResult(cacheKey, result, cacheTTL);
      logger.debug(`Cached result for ${cacheKey} with TTL ${cacheTTL}ms`);
      
      // Firestore에도 분석 결과 저장 (배치 처리)
      const firestoreBatchSave = async () => {
        try {
          const resultsRepository = new FirestoreRepository('analysisResults');
          await resultsRepository.create({
            type: 'eventConversion',
            criteria: options,
            result: result,
            createdAt: admin.firestore.FieldValue.serverTimestamp()
          });
        } catch (error) {
          logger.warn(`Error saving result to Firestore: ${error.message}`);
        }
      };
      
      // 비동기 저장 (응답 지연 방지)
      firestoreBatchSave().catch(error => {
        logger.error(`Firestore batch save failed: ${error.message}`);
      });
    } catch (error) {
      logger.warn(`Error caching result: ${error.message}`);
    }
  }
  
  return result;
};

module.exports = {
  getEvents,
  getEventAnalysis,
  analyzeEventConversion,
};

/**
 * 캐시된 결과 조회 (Firebase Firestore 사용)
 * @param {string} key - 캐시 키
 * @return {Promise<Object|null>} 캐시된 결과 또는 null
 * @private
 */
async function getCachedResult(key) {
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
    getContextLogger().warn(`Error retrieving cached result for ${key}:`, error);
    return null;
  }
}

/**
 * 결과 캐싱 (Firebase Firestore 사용)
 * @param {string} key - 캐시 키
 * @param {Object} data - 캐싱할 데이터
 * @param {number} ttl - TTL (밀리초)
 * @return {Promise<void>}
 * @private
 */
async function cacheResult(key, data, ttl) {
  try {
    // 만료 시간 계산
    const expiresAt = admin.firestore.Timestamp.fromDate(
      new Date(Date.now() + ttl)
    );
    
    // Firestore에 캐시 저장
    await admin.firestore()
      .collection('cache')
      .doc(key)
      .set({
        data,
        createdAt: admin.firestore.FieldValue.serverTimestamp(),
        expiresAt,
        ttl
      });
    
    getContextLogger().debug(`Cached result for ${key} with TTL ${ttl}ms`);
  } catch (error) {
    getContextLogger().warn(`Error caching result for ${key}:`, error);
  }
}
