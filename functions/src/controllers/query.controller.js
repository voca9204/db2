/**
 * 범용 쿼리 API 컨트롤러
 * 다양한 분석 요청을 처리하는 재사용 가능한 API
 */

const { executeQuery } = require('../../db');
const { success, error, paginated } = require('../utils/response');
const { buildQuery } = require('../utils/query-builder');
const { ValidationError } = require('../middleware/error-handler');
const Joi = require('joi');

// 쿼리 요청 유효성 검사 스키마
const querySchema = Joi.object({
  // 분석 유형 (필수)
  analysisType: Joi.string().required().valid(
    'userActivity', 
    'eventPerformance', 
    'conversionRate',
    'dormantUsers',
    'valueSegmentation',
    'reactivationTarget'
  ),
  
  // 필터링 매개변수 (옵션)
  filters: Joi.object({
    // 날짜 범위
    startDate: Joi.date().iso(),
    endDate: Joi.date().iso().min(Joi.ref('startDate')),
    
    // 사용자 필터
    minNetBet: Joi.number().min(0),
    maxNetBet: Joi.number().min(Joi.ref('minNetBet')),
    minPlayDays: Joi.number().min(1),
    maxPlayDays: Joi.number().min(Joi.ref('minPlayDays')),
    
    // 활동/휴면 필터
    minInactiveDays: Joi.number().min(0),
    maxInactiveDays: Joi.number().min(Joi.ref('minInactiveDays')),
    
    // 이벤트 필터
    eventId: Joi.number().integer().min(1),
    eventType: Joi.string(),
    
    // 기타 필터
    userId: Joi.number().integer().min(1),
    username: Joi.string(),
    status: Joi.string(),
  }).default({}),
  
  // 정렬 옵션
  sortBy: Joi.string().default('createdAt'),
  sortOrder: Joi.string().valid('asc', 'desc').default('desc'),
  
  // 페이지네이션
  page: Joi.number().integer().min(1).default(1),
  limit: Joi.number().integer().min(1).max(100).default(20),
  
  // 계산 옵션
  calculations: Joi.array().items(
    Joi.string().valid('count', 'sum', 'avg', 'min', 'max')
  ).default(['count']),
  
  // 집계 필드
  aggregateBy: Joi.array().items(Joi.string()),
  
  // 출력 형식 옵션
  format: Joi.string().valid('default', 'chart', 'table').default('default'),
}).options({ stripUnknown: true });

/**
 * 쿼리 매개변수를 사용하여 SQL 쿼리 생성
 * @param {string} analysisType 분석 유형
 * @param {Object} options 쿼리 옵션
 * @return {Object} SQL 쿼리 및 파라미터
 */
const buildAnalyticsQuery = (analysisType, options) => {
  const {
    filters = {},
    sortBy = 'createdAt',
    sortOrder = 'desc',
    page = 1,
    limit = 20,
    calculations = ['count'],
    aggregateBy = [],
  } = options;
  
  // 분석 유형에 따른 기본 쿼리 설정
  let baseQuery;
  let filterMapping = {};
  let sortMapping = {};
  
  switch (analysisType) {
    case 'userActivity':
      baseQuery = `
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
      `;
      
      filterMapping = {
        minNetBet: { column: 'netBet', operator: '>=' },
        maxNetBet: { column: 'netBet', operator: '<=' },
        minPlayDays: { column: 'playDays', operator: '>=' },
        maxPlayDays: { column: 'playDays', operator: '<=' },
        minInactiveDays: { column: 'inactiveDays', operator: '>=' },
        maxInactiveDays: { column: 'inactiveDays', operator: '<=' },
      };
      
      sortMapping = {
        userId: 'userId',
        userName: 'userName',
        playDays: 'playDays',
        netBet: 'netBet',
        lastActivity: 'lastActivity',
        inactiveDays: 'inactiveDays',
      };
      break;
      
    case 'eventPerformance':
      baseQuery = `
        SELECT 
          e.id as eventId,
          e.name as eventName,
          e.start_date as startDate,
          e.end_date as endDate,
          COUNT(DISTINCT pe.user_id) as participantCount,
          SUM(CASE WHEN DATEDIFF(pe.participation_date, MAX(g.date)) >= 30 THEN 1 ELSE 0 END) as dormantParticipantCount,
          COUNT(DISTINCT t.user_id) as conversionCount,
          ROUND(COUNT(DISTINCT t.user_id) / COUNT(DISTINCT pe.user_id) * 100, 2) as conversionRate
        FROM events e
        LEFT JOIN participant_events pe ON e.id = pe.event_id
        LEFT JOIN game_logs g ON pe.user_id = g.user_id AND g.date < pe.participation_date
        LEFT JOIN transactions t ON pe.user_id = t.user_id 
                              AND t.type = 'deposit' 
                              AND t.date > pe.participation_date 
                              AND DATEDIFF(t.date, pe.participation_date) <= 30
        GROUP BY e.id, e.name, e.start_date, e.end_date
      `;
      
      filterMapping = {
        startDate: { column: 'e.start_date', operator: '>=' },
        endDate: { column: 'e.end_date', operator: '<=' },
        eventType: { column: 'e.type', operator: '=' },
        status: { column: 'e.status', operator: '=' },
      };
      
      sortMapping = {
        eventId: 'eventId',
        eventName: 'eventName',
        startDate: 'startDate',
        endDate: 'endDate',
        participantCount: 'participantCount',
        conversionRate: 'conversionRate',
      };
      break;
      
    // 다른 분석 유형에 대한 쿼리...
    case 'dormantUsers':
      // 휴면 사용자 분석 쿼리...
      break;
      
    case 'conversionRate':
      // 전환율 분석 쿼리...
      break;
      
    case 'valueSegmentation':
      // 가치 기반 세그먼트 분석 쿼리...
      break;
      
    case 'reactivationTarget':
      // 재활성화 대상 분석 쿼리...
      break;
      
    default:
      throw new Error(`Unsupported analysis type: ${analysisType}`);
  }
  
  // HAVING 절 구성 (필요시)
  let havingConditions = [];
  let havingParams = [];
  
  // filterMapping에서 집계 후 필터링이 필요한 조건 처리
  Object.keys(filterMapping).forEach(key => {
    if (filters[key] !== undefined) {
      const { column, operator } = filterMapping[key];
      havingConditions.push(`${column} ${operator} ?`);
      havingParams.push(filters[key]);
    }
  });
  
  const having = havingConditions.length 
    ? `HAVING ${havingConditions.join(' AND ')}` 
    : '';
  
  // 최종 쿼리 구성
  baseQuery = `${baseQuery} ${having}`;
  
  // 동적 쿼리 빌드
  return buildQuery({
    baseQuery,
    filters,
    filterMapping,
    sortBy,
    sortOrder,
    sortMapping,
    page,
    limit,
  });
};

/**
 * 범용 분석 쿼리 API
 * @param {Request} req 요청 객체
 * @param {Response} res 응답 객체
 * @param {NextFunction} next 다음 미들웨어
 */
const executeAnalyticsQuery = async (req, res, next) => {
  try {
    // 요청 본문 유효성 검사
    const { error: validationErr, value: options } = querySchema.validate(req.body);
    
    if (validationErr) {
      throw new ValidationError('Invalid query parameters', validationErr.details);
    }
    
    // 분석 유형 추출
    const { analysisType, filters, sortBy, sortOrder, page, limit, format } = options;
    
    // 쿼리 빌드
    const { query, countQuery, params } = buildAnalyticsQuery(
      analysisType, 
      { filters, sortBy, sortOrder, page, limit }
    );
    
    // 쿼리 실행
    console.log(`Executing ${analysisType} query:`, query);
    console.log('With parameters:', params);
    
    const results = await executeQuery(query, params);
    
    // 총 레코드 수 조회
    const countResult = await executeQuery(countQuery, []);
    const total = countResult[0].total;
    
    // 결과 포맷팅 (필요시)
    let formattedResults = results;
    
    if (format === 'chart') {
      // 차트 데이터 포맷으로 변환
      formattedResults = {
        labels: results.map(item => item[sortBy] || ''),
        datasets: [
          {
            label: 'Value',
            data: results.map(item => {
              // 첫 번째 숫자 필드 찾기
              const numericField = Object.keys(item).find(
                key => typeof item[key] === 'number' && key !== sortBy
              );
              return item[numericField] || 0;
            }),
          }
        ]
      };
    }
    
    // 응답 반환
    return res.json(paginated(
      formattedResults,
      page,
      limit,
      total,
      `${analysisType} query executed successfully`
    ));
  } catch (err) {
    next(err);
  }
};

module.exports = {
  executeAnalyticsQuery,
};
