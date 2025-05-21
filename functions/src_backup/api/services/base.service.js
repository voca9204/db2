/**
 * 기본 서비스 클래스
 * 모든 서비스의 기본이 되는 추상 클래스
 */

const { executeQuery } = require('../../../db');
const { getContextLogger } = require('../../utils/logger');
const QueryBuilder = require('../utils/query-builder');

/**
 * 모든 서비스의 기본 클래스
 * 공통 데이터 접근 및 비즈니스 로직 제공
 */
class BaseService {
  /**
   * 서비스 생성자
   * @param {string} tableName - 데이터베이스 테이블 이름
   * @param {Object} columnMapping - API 필드와 DB 컬럼 매핑
   */
  constructor(tableName, columnMapping = {}) {
    this.tableName = tableName;
    this.columnMapping = columnMapping;
    this.logger = getContextLogger();
  }

  /**
   * 데이터베이스에서 모든 레코드 조회
   * @param {Object} options - 조회 옵션 (정렬, 페이지네이션 등)
   * @return {Promise<Object>} 조회 결과 및 메타데이터
   */
  async findAll(options = {}) {
    const { 
      sortBy = 'id', 
      sortOrder = 'asc',
      page = 1,
      limit = 20,
      ...filters
    } = options;

    // 기본 쿼리 생성
    const baseQuery = `SELECT * FROM ${this.tableName}`;
    
    // 쿼리 빌더 생성
    const queryBuilder = new QueryBuilder(baseQuery);
    
    // 필터 조건 추가
    Object.entries(filters).forEach(([key, value]) => {
      if (value !== undefined && value !== null) {
        const column = this.columnMapping[key] || key;
        queryBuilder.where(`${column} = ?`, value);
      }
    });
    
    // 정렬 추가
    const sortColumn = this.columnMapping[sortBy] || sortBy;
    queryBuilder.orderBy(sortColumn, sortOrder.toUpperCase());
    
    // 페이지네이션 추가
    const offset = (page - 1) * limit;
    queryBuilder.limit(limit, offset);
    
    // 쿼리 빌드
    const { query, params } = queryBuilder.build();
    const countQuery = queryBuilder.buildCount().query;
    
    // 데이터 조회
    this.logger.debug('Executing query:', query);
    this.logger.debug('With parameters:', params);
    
    const results = await executeQuery(query, params);
    
    // 총 레코드 수 조회
    const countResult = await executeQuery(countQuery, params);
    const total = countResult[0].total;
    
    return {
      data: results,
      total,
      page: parseInt(page, 10),
      limit: parseInt(limit, 10),
      pages: Math.ceil(total / limit)
    };
  }

  /**
   * ID로 특정 레코드 조회
   * @param {number|string} id - 조회할 레코드 ID
   * @return {Promise<Object>} 조회 결과
   */
  async findById(id) {
    const query = `SELECT * FROM ${this.tableName} WHERE id = ?`;
    
    this.logger.debug(`Finding record with ID ${id} in ${this.tableName}`);
    
    const results = await executeQuery(query, [id]);
    
    if (results.length === 0) {
      const error = new Error(`Record with ID ${id} not found in ${this.tableName}`);
      error.statusCode = 404;
      throw error;
    }
    
    return results[0];
  }

  /**
   * 새 레코드 생성
   * @param {Object} data - 생성할 레코드 데이터
   * @return {Promise<Object>} 생성된 레코드
   */
  async create(data) {
    // 데이터베이스 컬럼 매핑
    const mappedData = {};
    
    Object.entries(data).forEach(([key, value]) => {
      const column = this.columnMapping[key] || key;
      mappedData[column] = value;
    });
    
    // SQL 쿼리 구성
    const columns = Object.keys(mappedData);
    const placeholders = columns.map(() => '?').join(', ');
    const values = Object.values(mappedData);
    
    const query = `INSERT INTO ${this.tableName} (${columns.join(', ')}) VALUES (${placeholders})`;
    
    this.logger.debug('Executing insert query:', query);
    this.logger.debug('With values:', values);
    
    // 쿼리 실행
    const result = await executeQuery(query, values);
    
    // 생성된 레코드 조회
    const insertId = result.insertId;
    return this.findById(insertId);
  }

  /**
   * 레코드 업데이트
   * @param {number|string} id - 업데이트할 레코드 ID
   * @param {Object} data - 업데이트할 데이터
   * @return {Promise<Object>} 업데이트된 레코드
   */
  async update(id, data) {
    // 데이터베이스 컬럼 매핑
    const mappedData = {};
    
    Object.entries(data).forEach(([key, value]) => {
      const column = this.columnMapping[key] || key;
      mappedData[column] = value;
    });
    
    // SQL 쿼리 구성
    const setClause = Object.keys(mappedData)
      .map(column => `${column} = ?`)
      .join(', ');
    
    const values = [...Object.values(mappedData), id];
    
    const query = `UPDATE ${this.tableName} SET ${setClause} WHERE id = ?`;
    
    this.logger.debug('Executing update query:', query);
    this.logger.debug('With values:', values);
    
    // 쿼리 실행
    await executeQuery(query, values);
    
    // 업데이트된 레코드 조회
    return this.findById(id);
  }

  /**
   * 레코드 삭제
   * @param {number|string} id - 삭제할 레코드 ID
   * @return {Promise<Object>} 삭제 결과
   */
  async delete(id) {
    const query = `DELETE FROM ${this.tableName} WHERE id = ?`;
    
    this.logger.debug(`Deleting record with ID ${id} from ${this.tableName}`);
    
    // 삭제 전 레코드 존재 확인
    const record = await this.findById(id);
    
    // 쿼리 실행
    await executeQuery(query, [id]);
    
    return { id, deleted: true };
  }

  /**
   * 복잡한 조건으로 레코드 조회
   * @param {Object} options - 조회 옵션 및 조건
   * @return {Promise<Object>} 조회 결과 및 메타데이터
   */
  async query(options = {}) {
    const { 
      select = '*',
      filters = {},
      sort = { field: 'id', direction: 'asc' },
      page = 1,
      limit = 20,
      joins = []
    } = options;
    
    // 선택할 필드 목록
    const selectFields = Array.isArray(select) 
      ? select.map(field => this.columnMapping[field] || field).join(', ') 
      : select;
    
    // 기본 쿼리 생성
    let baseQuery = `SELECT ${selectFields} FROM ${this.tableName}`;
    
    // JOIN 절 추가 (있는 경우)
    if (joins.length > 0) {
      joins.forEach(join => {
        baseQuery += ` ${join.type || 'LEFT'} JOIN ${join.table} ON ${join.condition}`;
      });
    }
    
    // 쿼리 빌더 생성
    const queryBuilder = new QueryBuilder(baseQuery);
    
    // 필터 조건 추가
    this._applyFilters(queryBuilder, filters);
    
    // 정렬 추가
    const sortField = this.columnMapping[sort.field] || sort.field;
    queryBuilder.orderBy(sortField, sort.direction.toUpperCase());
    
    // 페이지네이션 추가
    const offset = (page - 1) * limit;
    queryBuilder.limit(limit, offset);
    
    // 쿼리 빌드
    const { query, params } = queryBuilder.build();
    const countQuery = queryBuilder.buildCount().query;
    
    // 데이터 조회
    this.logger.debug('Executing complex query:', query);
    this.logger.debug('With parameters:', params);
    
    const results = await executeQuery(query, params);
    
    // 총 레코드 수 조회
    const countResult = await executeQuery(countQuery, params);
    const total = countResult[0].total;
    
    return {
      data: results,
      total,
      page: parseInt(page, 10),
      limit: parseInt(limit, 10),
      pages: Math.ceil(total / limit)
    };
  }

  /**
   * 필터 조건을 쿼리 빌더에 적용
   * @param {QueryBuilder} queryBuilder - 쿼리 빌더 인스턴스
   * @param {Object} filters - 필터 조건
   * @private
   */
  _applyFilters(queryBuilder, filters) {
    Object.entries(filters).forEach(([field, condition]) => {
      const column = this.columnMapping[field] || field;
      
      // 객체 형태의 조건 (연산자 포함)
      if (typeof condition === 'object' && condition !== null) {
        Object.entries(condition).forEach(([operator, value]) => {
          if (value !== undefined && value !== null) {
            switch (operator) {
              case 'eq':
                queryBuilder.where(`${column} = ?`, value);
                break;
              case 'ne':
                queryBuilder.where(`${column} != ?`, value);
                break;
              case 'gt':
                queryBuilder.where(`${column} > ?`, value);
                break;
              case 'gte':
                queryBuilder.where(`${column} >= ?`, value);
                break;
              case 'lt':
                queryBuilder.where(`${column} < ?`, value);
                break;
              case 'lte':
                queryBuilder.where(`${column} <= ?`, value);
                break;
              case 'like':
                queryBuilder.where(`${column} LIKE ?`, `%${value}%`);
                break;
              case 'in':
                if (Array.isArray(value) && value.length > 0) {
                  const placeholders = value.map(() => '?').join(', ');
                  queryBuilder.where(`${column} IN (${placeholders})`, ...value);
                }
                break;
              case 'between':
                if (Array.isArray(value) && value.length === 2) {
                  queryBuilder.where(`${column} BETWEEN ? AND ?`, value[0], value[1]);
                }
                break;
              default:
                this.logger.warn(`Unknown operator: ${operator}`);
            }
          }
        });
      } else if (condition !== undefined && condition !== null) {
        // 직접적인 값 비교
        queryBuilder.where(`${column} = ?`, condition);
      }
    });
  }

  /**
   * 서비스 특화 메서드 (자식 클래스에서 구현)
   */
}

module.exports = BaseService;
