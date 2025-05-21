/**
 * 고급 필터링 및 정렬 유틸리티
 * 재사용 가능한 데이터 필터링, 정렬, 검색 로직
 */

const { getContextLogger } = require('../../utils/logger');
const QueryBuilder = require('./query-builder');

/**
 * 필터 연산자 매핑
 * API에서 사용하는 연산자와 SQL 연산자 매핑
 */
const OPERATORS = {
  eq: '=',           // 같음
  ne: '!=',          // 다름
  gt: '>',           // 초과
  gte: '>=',         // 이상
  lt: '<',           // 미만
  lte: '<=',         // 이하
  like: 'LIKE',      // 패턴 검색
  in: 'IN',          // 목록에 포함
  notIn: 'NOT IN',   // 목록에 미포함
  isNull: 'IS NULL', // NULL 여부
  isNotNull: 'IS NOT NULL', // NOT NULL 여부
  between: 'BETWEEN' // 범위 검색
};

/**
 * 필터 구문 생성 (단일 필터)
 * 
 * @param {string} field - 필드명
 * @param {Object} filter - 필터 값과 연산자
 * @param {Object} columnMapping - 컬럼 매핑 정보
 * @return {Object} 필터 구문과 파라미터
 */
const buildFilterCondition = (field, filter, columnMapping = {}) => {
  const logger = getContextLogger();
  
  // 필드명 매핑 (API 필드 → DB 컬럼)
  const column = columnMapping[field] || field;
  
  // 필터 값과 연산자 추출
  let operator = 'eq';
  let value = filter;
  
  // 고급 필터링 (연산자 포함)
  if (typeof filter === 'object' && filter !== null) {
    const keys = Object.keys(filter);
    if (keys.length === 0) return null;
    
    // 연산자 확인
    operator = keys[0];
    value = filter[operator];
    
    // 지원하지 않는 연산자 체크
    if (!OPERATORS[operator]) {
      logger.warn(`Unsupported filter operator: ${operator}`);
      return null;
    }
  }
  
  // 연산자에 따른 처리
  switch (operator) {
    case 'eq':
      return { condition: `${column} = ?`, params: [value] };
      
    case 'ne':
      return { condition: `${column} != ?`, params: [value] };
      
    case 'gt':
      return { condition: `${column} > ?`, params: [value] };
      
    case 'gte':
      return { condition: `${column} >= ?`, params: [value] };
      
    case 'lt':
      return { condition: `${column} < ?`, params: [value] };
      
    case 'lte':
      return { condition: `${column} <= ?`, params: [value] };
      
    case 'like':
      return { condition: `${column} LIKE ?`, params: [`%${value}%`] };
      
    case 'in':
      if (!Array.isArray(value) || value.length === 0) return null;
      return { 
        condition: `${column} IN (${value.map(() => '?').join(',')})`, 
        params: value 
      };
      
    case 'notIn':
      if (!Array.isArray(value) || value.length === 0) return null;
      return { 
        condition: `${column} NOT IN (${value.map(() => '?').join(',')})`, 
        params: value 
      };
      
    case 'isNull':
      return { condition: `${column} IS NULL`, params: [] };
      
    case 'isNotNull':
      return { condition: `${column} IS NOT NULL`, params: [] };
      
    case 'between':
      if (!Array.isArray(value) || value.length !== 2) return null;
      return { condition: `${column} BETWEEN ? AND ?`, params: value };
      
    default:
      logger.warn(`Unhandled filter operator: ${operator}`);
      return null;
  }
};

/**
 * 다수의 필터 조건 생성
 * 
 * @param {Object} filters - 필터 객체
 * @param {Object} columnMapping - 컬럼 매핑 정보
 * @return {Object} 필터 구문과 파라미터
 */
const buildFilterConditions = (filters, columnMapping = {}) => {
  if (!filters || Object.keys(filters).length === 0) {
    return { conditions: [], params: [] };
  }
  
  const conditions = [];
  const params = [];
  
  // 각 필터에 대한 조건 생성
  Object.entries(filters).forEach(([field, filter]) => {
    const result = buildFilterCondition(field, filter, columnMapping);
    
    if (result) {
      conditions.push(result.condition);
      params.push(...result.params);
    }
  });
  
  return { conditions, params };
};

/**
 * 시간 범위 필터 조건 생성
 * 
 * @param {Object} timeRange - 시간 범위 객체 {startDate, endDate}
 * @param {string} dateField - 날짜 필드명
 * @param {Object} columnMapping - 컬럼 매핑 정보
 * @return {Object} 필터 구문과 파라미터
 */
const buildTimeRangeCondition = (timeRange, dateField = 'created_at', columnMapping = {}) => {
  if (!timeRange) return { conditions: [], params: [] };
  
  const { startDate, endDate } = timeRange;
  const dateColumn = columnMapping[dateField] || dateField;
  const conditions = [];
  const params = [];
  
  if (startDate) {
    conditions.push(`${dateColumn} >= ?`);
    params.push(startDate);
  }
  
  if (endDate) {
    conditions.push(`${dateColumn} <= ?`);
    params.push(endDate);
  }
  
  return { conditions, params };
};

/**
 * 정렬 구문 생성
 * 
 * @param {Object} sorting - 정렬 객체 {column, direction}
 * @return {string} 정렬 구문
 */
const buildSortingClause = (sorting) => {
  if (!sorting || !sorting.column) return '';
  
  return `ORDER BY ${sorting.column} ${sorting.direction || 'ASC'}`;
};

/**
 * 페이지네이션 구문 생성
 * 
 * @param {Object} pagination - 페이지네이션 객체 {limit, offset}
 * @return {string} 페이지네이션 구문
 */
const buildPaginationClause = (pagination) => {
  if (!pagination) return '';
  
  const { limit, offset } = pagination;
  return `LIMIT ${limit} OFFSET ${offset}`;
};

/**
 * 키워드 검색 조건 생성
 * 
 * @param {string} keyword - 검색 키워드
 * @param {Array} searchFields - 검색 대상 필드 배열
 * @param {Object} columnMapping - 컬럼 매핑 정보
 * @return {Object} 검색 구문과 파라미터
 */
const buildSearchCondition = (keyword, searchFields = [], columnMapping = {}) => {
  if (!keyword || !searchFields || searchFields.length === 0) {
    return { condition: '', params: [] };
  }
  
  // 각 필드에 대한 LIKE 조건 생성
  const conditions = searchFields.map(field => {
    const column = columnMapping[field] || field;
    return `${column} LIKE ?`;
  });
  
  // 모든 검색 필드에 동일한 키워드 적용
  const params = Array(searchFields.length).fill(`%${keyword}%`);
  
  return {
    condition: `(${conditions.join(' OR ')})`,
    params
  };
};

/**
 * 완전한 쿼리 빌드
 * 
 * @param {string} baseQuery - 기본 쿼리
 * @param {Object} options - 쿼리 옵션
 * @return {Object} 완성된 쿼리와 파라미터
 */
const buildQuery = (baseQuery, options = {}) => {
  const {
    filters = {},
    timeRange = null,
    dateField = 'created_at',
    sorting = null,
    pagination = null,
    keyword = null,
    searchFields = [],
    columnMapping = {}
  } = options;
  
  // 쿼리 빌더 초기화
  const queryBuilder = new QueryBuilder(baseQuery);
  
  // 필터 조건 적용
  const { conditions: filterConditions, params: filterParams } = buildFilterConditions(filters, columnMapping);
  filterConditions.forEach((condition, index) => {
    queryBuilder.andWhere(condition, ...filterParams.slice(
      index === 0 ? 0 : filterParams.length - index, 
      index === 0 ? filterParams.length / filterConditions.length : filterParams.length
    ));
  });
  
  // 시간 범위 조건 적용
  const { conditions: timeConditions, params: timeParams } = buildTimeRangeCondition(timeRange, dateField, columnMapping);
  timeConditions.forEach(condition => {
    queryBuilder.andWhere(condition, ...timeParams);
  });
  
  // 키워드 검색 조건 적용
  if (keyword && searchFields.length > 0) {
    const { condition: searchCondition, params: searchParams } = buildSearchCondition(keyword, searchFields, columnMapping);
    if (searchCondition) {
      queryBuilder.andWhere(searchCondition, ...searchParams);
    }
  }
  
  // 정렬 적용
  if (sorting && sorting.column) {
    queryBuilder.orderBy(sorting.column, sorting.direction);
  }
  
  // 페이지네이션 적용
  if (pagination && pagination.limit) {
    queryBuilder.limit(pagination.limit, pagination.offset || 0);
  }
  
  // 최종 쿼리 빌드
  return queryBuilder.build();
};

module.exports = {
  OPERATORS,
  buildFilterCondition,
  buildFilterConditions,
  buildTimeRangeCondition,
  buildSortingClause,
  buildPaginationClause,
  buildSearchCondition,
  buildQuery
};
