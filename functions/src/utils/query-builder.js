/**
 * 동적 SQL 쿼리 생성을 위한 유틸리티
 */

/**
 * WHERE 조건 생성
 * @param {Object} filters 필터 조건 객체
 * @param {Object} mapping 객체 키와 SQL 컬럼 매핑
 * @return {Object} SQL 조건문과 파라미터
 */
const buildWhereClause = (filters = {}, mapping = {}) => {
  const conditions = [];
  const params = [];

  // 빈 필터는 무시하고 유효한 필터만 처리
  Object.keys(filters).forEach(key => {
    if (filters[key] === undefined || filters[key] === null || filters[key] === '') {
      return;
    }

    const sqlColumn = mapping[key] || key;

    // 배열 처리 (IN 연산자)
    if (Array.isArray(filters[key])) {
      const placeholders = Array(filters[key].length).fill('?').join(',');
      conditions.push(`${sqlColumn} IN (${placeholders})`);
      params.push(...filters[key]);
      return;
    }

    // 객체 처리 (범위 조건 등)
    if (typeof filters[key] === 'object') {
      Object.keys(filters[key]).forEach(operator => {
        const value = filters[key][operator];
        if (value === undefined || value === null) return;

        // 연산자에 따른 조건 추가
        switch (operator) {
          case 'gt':
            conditions.push(`${sqlColumn} > ?`);
            params.push(value);
            break;
          case 'gte':
            conditions.push(`${sqlColumn} >= ?`);
            params.push(value);
            break;
          case 'lt':
            conditions.push(`${sqlColumn} < ?`);
            params.push(value);
            break;
          case 'lte':
            conditions.push(`${sqlColumn} <= ?`);
            params.push(value);
            break;
          case 'like':
            conditions.push(`${sqlColumn} LIKE ?`);
            params.push(`%${value}%`);
            break;
          case 'between':
            if (Array.isArray(value) && value.length === 2) {
              conditions.push(`${sqlColumn} BETWEEN ? AND ?`);
              params.push(value[0], value[1]);
            }
            break;
          default:
            break;
        }
      });
      return;
    }

    // 기본 동등 조건
    conditions.push(`${sqlColumn} = ?`);
    params.push(filters[key]);
  });

  const where = conditions.length ? `WHERE ${conditions.join(' AND ')}` : '';
  return { where, params };
};

/**
 * ORDER BY 절 생성
 * @param {string|Array} sortBy 정렬 필드
 * @param {string|Array} sortOrder 정렬 방향
 * @param {Object} mapping 객체 키와 SQL 컬럼 매핑
 * @return {string} SQL ORDER BY 절
 */
const buildOrderByClause = (sortBy = 'createdAt', sortOrder = 'desc', mapping = {}) => {
  // 배열로 변환
  const fields = Array.isArray(sortBy) ? sortBy : [sortBy];
  const orders = Array.isArray(sortOrder) ? sortOrder : [sortOrder];

  const sortClauses = fields.map((field, index) => {
    const sqlColumn = mapping[field] || field;
    const direction = (orders[index] || orders[0] || 'desc').toUpperCase();
    return `${sqlColumn} ${direction === 'DESC' ? 'DESC' : 'ASC'}`;
  });

  return sortClauses.length ? `ORDER BY ${sortClauses.join(', ')}` : '';
};

/**
 * LIMIT/OFFSET 절 생성
 * @param {number} page 페이지 번호
 * @param {number} limit 페이지당 항목 수
 * @return {string} SQL LIMIT/OFFSET 절
 */
const buildPaginationClause = (page = 1, limit = 10) => {
  const pageNum = parseInt(page, 10) || 1;
  const limitNum = parseInt(limit, 10) || 10;
  const offset = (pageNum - 1) * limitNum;
  return `LIMIT ${limitNum} OFFSET ${offset}`;
};

/**
 * 동적 쿼리 문자열 구성
 * @param {Object} options 쿼리 옵션
 * @param {string} options.baseQuery 기본 쿼리
 * @param {Object} options.filters 필터 조건
 * @param {Object} options.filterMapping 필터 매핑
 * @param {string|Array} options.sortBy 정렬 필드
 * @param {string|Array} options.sortOrder 정렬 방향
 * @param {Object} options.sortMapping 정렬 매핑
 * @param {number} options.page 페이지 번호
 * @param {number} options.limit 페이지당 항목 수
 * @param {boolean} options.paginate 페이지네이션 여부
 * @return {Object} SQL 쿼리와 파라미터
 */
const buildQuery = ({
  baseQuery,
  filters = {},
  filterMapping = {},
  sortBy = 'createdAt',
  sortOrder = 'desc',
  sortMapping = {},
  page = 1,
  limit = 10,
  paginate = true
}) => {
  const { where, params } = buildWhereClause(filters, filterMapping);
  const orderBy = buildOrderByClause(sortBy, sortOrder, sortMapping);
  const pagination = paginate ? buildPaginationClause(page, limit) : '';

  const query = `${baseQuery} ${where} ${orderBy} ${pagination}`.trim();
  
  // 총 항목 수를 구하기 위한 카운트 쿼리
  const countQuery = paginate ? `SELECT COUNT(*) as total FROM (${baseQuery} ${where}) as countTable` : null;
  
  return { query, countQuery, params };
};

module.exports = {
  buildWhereClause,
  buildOrderByClause,
  buildPaginationClause,
  buildQuery
};
