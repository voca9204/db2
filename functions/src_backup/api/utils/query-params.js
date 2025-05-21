/**
 * 공통 쿼리 파라미터 처리 모듈
 * 모든 API 엔드포인트에서 재사용 가능한 쿼리 파라미터 처리 로직
 */

const Joi = require('joi');
const { ValidationError } = require('../utils/error-handler');

/**
 * 기본 페이지네이션 스키마
 * 모든 목록 API에서 사용 가능한 공통 페이지네이션 파라미터
 */
const paginationSchema = Joi.object({
  page: Joi.number().integer().min(1).default(1)
    .description('현재 페이지 번호 (1부터 시작)'),
    
  limit: Joi.number().integer().min(1).max(100).default(20)
    .description('페이지당 항목 수 (최대 100)'),
});

/**
 * 기본 정렬 스키마
 * 모든 목록 API에서 사용 가능한 공통 정렬 파라미터
 */
const sortingSchema = Joi.object({
  sortBy: Joi.string()
    .description('정렬 기준 컬럼'),
    
  sortOrder: Joi.string().valid('asc', 'desc').default('desc')
    .description('정렬 방향 (asc: 오름차순, desc: 내림차순)'),
});

/**
 * 기본 시간 범위 스키마
 * 데이터 조회 시 사용할 수 있는 공통 시간 범위 파라미터
 */
const timeRangeSchema = Joi.object({
  startDate: Joi.date().iso()
    .description('조회 시작 날짜 (ISO 형식: YYYY-MM-DD)'),
    
  endDate: Joi.date().iso().min(Joi.ref('startDate'))
    .description('조회 종료 날짜 (ISO 형식: YYYY-MM-DD)'),
    
  timeRange: Joi.string().valid('today', 'yesterday', '7d', '30d', '90d', '1y', 'all')
    .description('미리 정의된 시간 범위 (startDate, endDate가 없을 때 사용)'),
});

/**
 * 공통 리스트 API 스키마
 * 페이지네이션, 정렬, 시간 범위를 포함한 완전한 쿼리 스키마
 * 
 * @param {Object} customSchema - 추가적인 커스텀 스키마
 * @return {Object} 완성된 Joi 스키마
 */
const createListQuerySchema = (customSchema = {}) => {
  return Joi.object().keys({
    ...paginationSchema.keys(),
    ...sortingSchema.keys(),
    ...timeRangeSchema.keys(),
    ...customSchema
  });
};

/**
 * 요청에서 페이지네이션 정보 추출
 * 
 * @param {Object} query - 요청 쿼리 객체
 * @return {Object} 페이지네이션 설정 객체
 */
const extractPagination = (query) => {
  const { page = 1, limit = 20 } = query;
  return {
    page: parseInt(page, 10),
    limit: parseInt(limit, 10),
    offset: (parseInt(page, 10) - 1) * parseInt(limit, 10)
  };
};

/**
 * 요청에서 정렬 정보 추출
 * 
 * @param {Object} query - 요청 쿼리 객체
 * @param {Object} columnMapping - 컬럼 매핑 정보 (API 필드명 → DB 컬럼명)
 * @return {Object} 정렬 설정 객체
 */
const extractSorting = (query, columnMapping = {}) => {
  const { sortBy, sortOrder = 'desc' } = query;
  
  if (!sortBy) return null;
  
  // API 필드명을 DB 컬럼명으로 변환
  const dbColumn = columnMapping[sortBy] || sortBy;
  
  return {
    column: dbColumn,
    direction: sortOrder.toUpperCase()
  };
};

/**
 * 요청에서 시간 범위 정보 추출
 * 
 * @param {Object} query - 요청 쿼리 객체
 * @return {Object} 시간 범위 설정 객체
 */
const extractTimeRange = (query) => {
  const { startDate, endDate, timeRange } = query;
  
  // 시작일/종료일이 직접 지정된 경우
  if (startDate && endDate) {
    return { startDate, endDate };
  }
  
  // 미리 정의된 시간 범위 사용
  if (timeRange) {
    const now = new Date();
    let start = new Date();
    
    switch (timeRange) {
      case 'today':
        start.setHours(0, 0, 0, 0);
        return { startDate: start, endDate: now };
        
      case 'yesterday':
        start.setDate(start.getDate() - 1);
        start.setHours(0, 0, 0, 0);
        const end = new Date(start);
        end.setHours(23, 59, 59, 999);
        return { startDate: start, endDate: end };
        
      case '7d':
        start.setDate(start.getDate() - 7);
        return { startDate: start, endDate: now };
        
      case '30d':
        start.setDate(start.getDate() - 30);
        return { startDate: start, endDate: now };
        
      case '90d':
        start.setDate(start.getDate() - 90);
        return { startDate: start, endDate: now };
        
      case '1y':
        start.setFullYear(start.getFullYear() - 1);
        return { startDate: start, endDate: now };
        
      case 'all':
        return { startDate: null, endDate: null };
        
      default:
        return { startDate: null, endDate: null };
    }
  }
  
  // 기본값은 전체 기간
  return { startDate: null, endDate: null };
};

/**
 * 요청 객체에서 모든 필터 파라미터 추출
 * 
 * @param {Object} query - 요청 쿼리 객체
 * @param {Array} skipKeys - 필터에서 제외할 키 배열
 * @return {Object} 필터 객체
 */
const extractFilters = (query, skipKeys = ['page', 'limit', 'sortBy', 'sortOrder', 'startDate', 'endDate', 'timeRange']) => {
  const filters = {};
  
  // 쿼리 객체에서 필터 추출
  Object.keys(query).forEach(key => {
    if (!skipKeys.includes(key) && query[key] !== undefined && query[key] !== null && query[key] !== '') {
      filters[key] = query[key];
    }
  });
  
  return filters;
};

/**
 * 모든 쿼리 파라미터 통합 처리
 * 
 * @param {Object} query - 요청 쿼리 객체
 * @param {Object} columnMapping - 컬럼 매핑 정보
 * @return {Object} 처리된 쿼리 파라미터 객체
 */
const processQueryParams = (query, columnMapping = {}) => {
  return {
    pagination: extractPagination(query),
    sorting: extractSorting(query, columnMapping),
    timeRange: extractTimeRange(query),
    filters: extractFilters(query)
  };
};

/**
 * 쿼리 스키마 유효성 검사
 * 
 * @param {Object} schema - Joi 검증 스키마
 * @param {Object} query - 검증할 쿼리 객체
 * @return {Object} 검증된 쿼리 객체
 */
const validateQuerySchema = (schema, query) => {
  const { error, value } = schema.validate(query, { 
    abortEarly: false,
    stripUnknown: false,
    allowUnknown: true
  });
  
  if (error) {
    const errors = error.details.map(detail => ({
      field: detail.context?.key || 'unknown',
      message: detail.message
    }));
    
    throw new ValidationError('Query parameter validation failed', errors);
  }
  
  return value;
};

module.exports = {
  paginationSchema,
  sortingSchema,
  timeRangeSchema,
  createListQuerySchema,
  extractPagination,
  extractSorting,
  extractTimeRange,
  extractFilters,
  processQueryParams,
  validateQuerySchema
};
