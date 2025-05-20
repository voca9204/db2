/**
 * 기본 리포지토리 클래스
 * 데이터 접근 계층(DAL)의 기본 구현
 */

const { executeQuery } = require('../../../db');
const { getContextLogger } = require('../../utils/logger');
const { DatabaseError, NotFoundError } = require('../../api/middleware/error-handler');
const QueryBuilder = require('../../api/utils/query-builder');

/**
 * 기본 리포지토리 클래스
 * 데이터베이스 테이블에 대한 CRUD 작업 제공
 */
class BaseRepository {
  /**
   * 생성자
   * 
   * @param {string} tableName - 데이터베이스 테이블명
   * @param {Object} columnMapping - API 필드와 DB 컬럼 간 매핑 정보
   */
  constructor(tableName, columnMapping = {}) {
    this.tableName = tableName;
    this.columnMapping = columnMapping;
    this.logger = getContextLogger();
    this.primaryKey = 'id'; // 기본 기본 키
  }
  
  /**
   * API 필드명을 DB 컬럼명으로 변환
   * 
   * @param {string} field - API 필드명
   * @return {string} DB 컬럼명
   */
  mapToColumn(field) {
    return this.columnMapping[field] || field;
  }
  
  /**
   * DB 컬럼명을 API 필드명으로 변환
   * 
   * @param {string} column - DB 컬럼명
   * @return {string} API 필드명
   */
  mapToField(column) {
    // 역방향 매핑 계산
    if (!this._reverseMapping) {
      this._reverseMapping = Object.entries(this.columnMapping).reduce((acc, [field, col]) => {
        acc[col] = field;
        return acc;
      }, {});
    }
    
    return this._reverseMapping[column] || column;
  }
  
  /**
   * DB 결과를 API 응답 형식으로 변환
   * 
   * @param {Object} dbResult - 데이터베이스 결과 객체
   * @return {Object} API 응답 객체
   */
  mapToApiModel(dbResult) {
    if (!dbResult) return null;
    
    const apiModel = {};
    
    // 각 DB 컬럼을 API 필드로 변환
    Object.entries(dbResult).forEach(([column, value]) => {
      const field = this.mapToField(column);
      apiModel[field] = value;
    });
    
    return apiModel;
  }
  
  /**
   * API 모델을 DB 모델로 변환
   * 
   * @param {Object} apiModel - API 모델 객체
   * @return {Object} DB 모델 객체
   */
  mapToDbModel(apiModel) {
    if (!apiModel) return null;
    
    const dbModel = {};
    
    // 각 API 필드를 DB 컬럼으로 변환
    Object.entries(apiModel).forEach(([field, value]) => {
      const column = this.mapToColumn(field);
      dbModel[column] = value;
    });
    
    return dbModel;
  }
  
  /**
   * ID로 단일 항목 조회
   * 
   * @param {number|string} id - 항목 ID
   * @param {Object} options - 조회 옵션
   * @return {Promise<Object>} 조회된 항목
   * @throws {NotFoundError} 항목을 찾을 수 없는 경우
   */
  async findById(id, options = {}) {
    try {
      const { fields = ['*'] } = options;
      
      // 필드 매핑
      const columns = fields.map(field => {
        if (field === '*') return '*';
        return this.mapToColumn(field);
      });
      
      // 쿼리 빌드 및 실행
      const query = `
        SELECT ${columns.join(', ')}
        FROM ${this.tableName}
        WHERE ${this.primaryKey} = ?
        LIMIT 1
      `;
      
      const results = await executeQuery(query, [id]);
      
      if (!results || results.length === 0) {
        throw new NotFoundError(`${this.tableName} with ID ${id} not found`);
      }
      
      return this.mapToApiModel(results[0]);
    } catch (error) {
      if (error instanceof NotFoundError) {
        throw error;
      }
      
      this.logger.error(`Error finding ${this.tableName} by ID ${id}:`, error);
      throw new DatabaseError(`Failed to find ${this.tableName}`);
    }
  }
  
  /**
   * 여러 조건으로 단일 항목 조회
   * 
   * @param {Object} filters - 조회 필터
   * @param {Object} options - 조회 옵션
   * @return {Promise<Object>} 조회된 항목
   * @throws {NotFoundError} 항목을 찾을 수 없는 경우
   */
  async findOne(filters = {}, options = {}) {
    try {
      const { fields = ['*'] } = options;
      
      // 필드 매핑
      const columns = fields.map(field => {
        if (field === '*') return '*';
        return this.mapToColumn(field);
      });
      
      // 쿼리 빌더 초기화
      const queryBuilder = new QueryBuilder(`
        SELECT ${columns.join(', ')}
        FROM ${this.tableName}
      `);
      
      // 필터 조건 적용
      Object.entries(filters).forEach(([field, value]) => {
        const column = this.mapToColumn(field);
        queryBuilder.andWhere(`${column} = ?`, value);
      });
      
      // 단일 항목 제한
      queryBuilder.limit(1);
      
      // 쿼리 실행
      const { query, params } = queryBuilder.build();
      const results = await executeQuery(query, params);
      
      if (!results || results.length === 0) {
        throw new NotFoundError(`${this.tableName} not found`);
      }
      
      return this.mapToApiModel(results[0]);
    } catch (error) {
      if (error instanceof NotFoundError) {
        throw error;
      }
      
      this.logger.error(`Error finding ${this.tableName}:`, error);
      throw new DatabaseError(`Failed to find ${this.tableName}`);
    }
  }
  
  /**
   * 모든 항목 조회
   * 
   * @param {Object} options - 조회 옵션
   * @return {Promise<Object>} 조회된 항목 목록 및 메타데이터
   */
  async findAll(options = {}) {
    try {
      const {
        fields = ['*'],
        filters = {},
        sorting = null,
        pagination = { page: 1, limit: 20 }
      } = options;
      
      // 필드 매핑
      const columns = fields.map(field => {
        if (field === '*') return '*';
        return this.mapToColumn(field);
      });
      
      // 쿼리 빌더 초기화
      const queryBuilder = new QueryBuilder(`
        SELECT ${columns.join(', ')}
        FROM ${this.tableName}
      `);
      
      // 필터 조건 적용
      Object.entries(filters).forEach(([field, value]) => {
        const column = this.mapToColumn(field);
        
        if (value === null) {
          queryBuilder.andWhere(`${column} IS NULL`);
        } else if (Array.isArray(value)) {
          queryBuilder.andWhere(`${column} IN (${value.map(() => '?').join(',')})`, ...value);
        } else {
          queryBuilder.andWhere(`${column} = ?`, value);
        }
      });
      
      // 정렬 적용
      if (sorting && sorting.field) {
        const sortColumn = this.mapToColumn(sorting.field);
        const sortDirection = (sorting.direction || 'asc').toUpperCase();
        queryBuilder.orderBy(sortColumn, sortDirection);
      }
      
      // 페이지네이션 설정
      const { page = 1, limit = 20 } = pagination;
      const offset = (page - 1) * limit;
      queryBuilder.limit(limit, offset);
      
      // 쿼리 실행
      const { query, params } = queryBuilder.build();
      const results = await executeQuery(query, params);
      
      // 전체 항목 수 조회 쿼리
      const countQueryBuilder = new QueryBuilder(`
        SELECT COUNT(*) AS total
        FROM ${this.tableName}
      `);
      
      // 필터 조건 적용 (정렬 및 페이지네이션 제외)
      Object.entries(filters).forEach(([field, value]) => {
        const column = this.mapToColumn(field);
        
        if (value === null) {
          countQueryBuilder.andWhere(`${column} IS NULL`);
        } else if (Array.isArray(value)) {
          countQueryBuilder.andWhere(`${column} IN (${value.map(() => '?').join(',')})`, ...value);
        } else {
          countQueryBuilder.andWhere(`${column} = ?`, value);
        }
      });
      
      // 전체 항목 수 조회
      const { query: countQuery, params: countParams } = countQueryBuilder.build();
      const countResults = await executeQuery(countQuery, countParams);
      const total = countResults[0]?.total || 0;
      
      // API 모델로 변환
      const items = results.map(result => this.mapToApiModel(result));
      
      return {
        items,
        total,
        page: parseInt(page, 10),
        limit: parseInt(limit, 10),
        pages: Math.ceil(total / limit)
      };
    } catch (error) {
      this.logger.error(`Error finding all ${this.tableName}:`, error);
      throw new DatabaseError(`Failed to find ${this.tableName} records`);
    }
  }
  
  /**
   * 새 항목 생성
   * 
   * @param {Object} data - 생성할 항목 데이터
   * @param {Object} options - 생성 옵션
   * @return {Promise<Object>} 생성된 항목
   */
  async create(data, options = {}) {
    try {
      // API 모델을 DB 모델로 변환
      const dbModel = this.mapToDbModel(data);
      
      // 컬럼 및 값 추출
      const columns = Object.keys(dbModel);
      const values = Object.values(dbModel);
      
      // 생성 시간 자동 설정
      if (!dbModel.created_at && !columns.includes('created_at')) {
        columns.push('created_at');
        values.push(new Date());
      }
      
      // 쿼리 빌드 및 실행
      const query = `
        INSERT INTO ${this.tableName} (${columns.join(', ')})
        VALUES (${columns.map(() => '?').join(', ')})
      `;
      
      const result = await executeQuery(query, values);
      const insertId = result.insertId;
      
      // 생성된 항목 조회
      return this.findById(insertId);
    } catch (error) {
      this.logger.error(`Error creating ${this.tableName}:`, error);
      throw new DatabaseError(`Failed to create ${this.tableName}`);
    }
  }
  
  /**
   * 항목 업데이트
   * 
   * @param {number|string} id - 업데이트할 항목 ID
   * @param {Object} data - 업데이트할 데이터
   * @param {Object} options - 업데이트 옵션
   * @return {Promise<Object>} 업데이트된 항목
   * @throws {NotFoundError} 항목을 찾을 수 없는 경우
   */
  async update(id, data, options = {}) {
    try {
      // 기존 항목 확인 (없으면 NotFoundError 발생)
      await this.findById(id);
      
      // API 모델을 DB 모델로 변환
      const dbModel = this.mapToDbModel(data);
      
      // 빈 업데이트 데이터 처리
      if (Object.keys(dbModel).length === 0) {
        return this.findById(id);
      }
      
      // 업데이트 시간 자동 설정
      if (!dbModel.updated_at && !Object.keys(dbModel).includes('updated_at')) {
        dbModel.updated_at = new Date();
      }
      
      // 쿼리 빌드 및 실행
      const query = `
        UPDATE ${this.tableName}
        SET ${Object.keys(dbModel).map(column => `${column} = ?`).join(', ')}
        WHERE ${this.primaryKey} = ?
      `;
      
      const params = [...Object.values(dbModel), id];
      await executeQuery(query, params);
      
      // 업데이트된 항목 조회
      return this.findById(id);
    } catch (error) {
      if (error instanceof NotFoundError) {
        throw error;
      }
      
      this.logger.error(`Error updating ${this.tableName} with ID ${id}:`, error);
      throw new DatabaseError(`Failed to update ${this.tableName}`);
    }
  }
  
  /**
   * 항목 삭제
   * 
   * @param {number|string} id - 삭제할 항목 ID
   * @param {Object} options - 삭제 옵션
   * @return {Promise<boolean>} 삭제 성공 여부
   * @throws {NotFoundError} 항목을 찾을 수 없는 경우
   */
  async delete(id, options = {}) {
    try {
      // 기존 항목 확인 (없으면 NotFoundError 발생)
      await this.findById(id);
      
      // 쿼리 빌드 및 실행
      const query = `
        DELETE FROM ${this.tableName}
        WHERE ${this.primaryKey} = ?
      `;
      
      await executeQuery(query, [id]);
      
      return true;
    } catch (error) {
      if (error instanceof NotFoundError) {
        throw error;
      }
      
      this.logger.error(`Error deleting ${this.tableName} with ID ${id}:`, error);
      throw new DatabaseError(`Failed to delete ${this.tableName}`);
    }
  }
  
  /**
   * 여러 항목 삭제
   * 
   * @param {Array} ids - 삭제할 항목 ID 배열
   * @param {Object} options - 삭제 옵션
   * @return {Promise<number>} 삭제된 항목 수
   */
  async deleteMany(ids, options = {}) {
    try {
      if (!Array.isArray(ids) || ids.length === 0) {
        return 0;
      }
      
      // 쿼리 빌드 및 실행
      const query = `
        DELETE FROM ${this.tableName}
        WHERE ${this.primaryKey} IN (${ids.map(() => '?').join(', ')})
      `;
      
      const result = await executeQuery(query, ids);
      
      return result.affectedRows || 0;
    } catch (error) {
      this.logger.error(`Error deleting multiple ${this.tableName}:`, error);
      throw new DatabaseError(`Failed to delete ${this.tableName} records`);
    }
  }
  
  /**
   * 조건부 삭제
   * 
   * @param {Object} filters - 삭제 조건
   * @param {Object} options - 삭제 옵션
   * @return {Promise<number>} 삭제된 항목 수
   */
  async deleteWhere(filters, options = {}) {
    try {
      if (!filters || Object.keys(filters).length === 0) {
        throw new Error('Filters are required for deleteWhere operation');
      }
      
      // 쿼리 빌더 초기화
      const queryBuilder = new QueryBuilder(`
        DELETE FROM ${this.tableName}
      `);
      
      // 필터 조건 적용
      Object.entries(filters).forEach(([field, value]) => {
        const column = this.mapToColumn(field);
        
        if (value === null) {
          queryBuilder.andWhere(`${column} IS NULL`);
        } else if (Array.isArray(value)) {
          queryBuilder.andWhere(`${column} IN (${value.map(() => '?').join(',')})`, ...value);
        } else {
          queryBuilder.andWhere(`${column} = ?`, value);
        }
      });
      
      // 쿼리 실행
      const { query, params } = queryBuilder.build();
      const result = await executeQuery(query, params);
      
      return result.affectedRows || 0;
    } catch (error) {
      this.logger.error(`Error deleting ${this.tableName} with filters:`, error);
      throw new DatabaseError(`Failed to delete ${this.tableName} records`);
    }
  }
  
  /**
   * 존재 여부 확인
   * 
   * @param {number|string} id - 확인할 항목 ID
   * @return {Promise<boolean>} 존재 여부
   */
  async exists(id) {
    try {
      // 쿼리 빌드 및 실행
      const query = `
        SELECT 1
        FROM ${this.tableName}
        WHERE ${this.primaryKey} = ?
        LIMIT 1
      `;
      
      const results = await executeQuery(query, [id]);
      
      return results && results.length > 0;
    } catch (error) {
      this.logger.error(`Error checking existence of ${this.tableName} with ID ${id}:`, error);
      throw new DatabaseError(`Failed to check existence of ${this.tableName}`);
    }
  }
  
  /**
   * 항목 수 조회
   * 
   * @param {Object} filters - 조회 필터
   * @return {Promise<number>} 항목 수
   */
  async count(filters = {}) {
    try {
      // 쿼리 빌더 초기화
      const queryBuilder = new QueryBuilder(`
        SELECT COUNT(*) AS total
        FROM ${this.tableName}
      `);
      
      // 필터 조건 적용
      Object.entries(filters).forEach(([field, value]) => {
        const column = this.mapToColumn(field);
        
        if (value === null) {
          queryBuilder.andWhere(`${column} IS NULL`);
        } else if (Array.isArray(value)) {
          queryBuilder.andWhere(`${column} IN (${value.map(() => '?').join(',')})`, ...value);
        } else {
          queryBuilder.andWhere(`${column} = ?`, value);
        }
      });
      
      // 쿼리 실행
      const { query, params } = queryBuilder.build();
      const results = await executeQuery(query, params);
      
      return results[0]?.total || 0;
    } catch (error) {
      this.logger.error(`Error counting ${this.tableName}:`, error);
      throw new DatabaseError(`Failed to count ${this.tableName} records`);
    }
  }
  
  /**
   * 사용자 정의 쿼리 실행
   * 
   * @param {string} sql - SQL 쿼리
   * @param {Array} params - 쿼리 파라미터
   * @param {Object} options - 쿼리 옵션
   * @return {Promise<Array>} 쿼리 결과
   */
  async executeRawQuery(sql, params = [], options = {}) {
    try {
      const { mapResults = true } = options;
      
      // 쿼리 실행
      const results = await executeQuery(sql, params);
      
      // 결과 매핑 (옵션에 따라)
      if (mapResults && Array.isArray(results)) {
        return results.map(result => this.mapToApiModel(result));
      }
      
      return results;
    } catch (error) {
      this.logger.error(`Error executing raw query for ${this.tableName}:`, error);
      throw new DatabaseError(`Failed to execute custom query for ${this.tableName}`);
    }
  }
}

module.exports = BaseRepository;
