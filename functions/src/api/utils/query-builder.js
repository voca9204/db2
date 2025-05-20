/**
 * 쿼리 빌더 유틸리티
 * SQL 쿼리를 동적으로 생성하는 유틸리티
 */

/**
 * SQL 쿼리를 동적으로 생성하는 클래스
 */
class QueryBuilder {
  /**
   * 쿼리 빌더 생성자
   * @param {string} baseQuery - 기본 쿼리 문자열 (예: "SELECT * FROM table")
   */
  constructor(baseQuery) {
    this.baseQuery = baseQuery;
    this.conditions = [];
    this.params = [];
    this.sorts = [];
    this.pagination = null;
  }

  /**
   * WHERE 조건 추가
   * @param {string} condition - 조건 문자열 (예: "column = ?")
   * @param {...*} params - 조건 매개변수
   * @return {QueryBuilder} 메서드 체이닝을 위한 인스턴스 반환
   */
  where(condition, ...params) {
    this.conditions.push(condition);
    this.params.push(...params);
    return this;
  }

  /**
   * OR 조건 추가
   * @param {Array<string>} conditions - 조건 문자열 배열
   * @param {Array<*>} params - 조건 매개변수 배열
   * @return {QueryBuilder} 메서드 체이닝을 위한 인스턴스 반환
   */
  orWhere(conditions, params) {
    if (conditions.length === 0) return this;
    
    const orCondition = `(${conditions.join(' OR ')})`;
    this.conditions.push(orCondition);
    this.params.push(...params);
    return this;
  }

  /**
   * ORDER BY 절 추가
   * @param {string} field - 정렬할 필드
   * @param {string} direction - 정렬 방향 (ASC 또는 DESC)
   * @return {QueryBuilder} 메서드 체이닝을 위한 인스턴스 반환
   */
  orderBy(field, direction = 'ASC') {
    // 잘못된 정렬 방향 처리
    const validDirection = ['ASC', 'DESC'].includes(direction.toUpperCase()) 
      ? direction.toUpperCase() 
      : 'ASC';
    
    this.sorts.push(`${field} ${validDirection}`);
    return this;
  }

  /**
   * LIMIT 및 OFFSET 절 추가
   * @param {number} limit - 결과 제한 수
   * @param {number} offset - 결과 시작 위치
   * @return {QueryBuilder} 메서드 체이닝을 위한 인스턴스 반환
   */
  limit(limit, offset = 0) {
    this.pagination = { limit, offset };
    return this;
  }

  /**
   * 그룹화 추가
   * @param {string} field - 그룹화할 필드
   * @return {QueryBuilder} 메서드 체이닝을 위한 인스턴스 반환
   */
  groupBy(field) {
    this.groupByField = field;
    return this;
  }

  /**
   * HAVING 조건 추가
   * @param {string} condition - HAVING 조건 문자열
   * @param {...*} params - 조건 매개변수
   * @return {QueryBuilder} 메서드 체이닝을 위한 인스턴스 반환
   */
  having(condition, ...params) {
    if (!this.havingConditions) {
      this.havingConditions = [];
    }
    
    this.havingConditions.push(condition);
    this.params.push(...params);
    return this;
  }

  /**
   * 최종 쿼리 빌드
   * @return {Object} 쿼리 문자열과 매개변수
   */
  build() {
    let query = this.baseQuery;
    
    // WHERE 절 추가
    if (this.conditions.length > 0) {
      query += ' WHERE ' + this.conditions.join(' AND ');
    }
    
    // GROUP BY 절 추가
    if (this.groupByField) {
      query += ` GROUP BY ${this.groupByField}`;
    }
    
    // HAVING 절 추가
    if (this.havingConditions && this.havingConditions.length > 0) {
      query += ' HAVING ' + this.havingConditions.join(' AND ');
    }
    
    // ORDER BY 절 추가
    if (this.sorts.length > 0) {
      query += ' ORDER BY ' + this.sorts.join(', ');
    }
    
    // LIMIT/OFFSET 절 추가
    if (this.pagination) {
      query += ` LIMIT ${this.pagination.limit} OFFSET ${this.pagination.offset}`;
    }
    
    return { query, params: this.params };
  }

  /**
   * 카운트 쿼리 빌드
   * @return {Object} 카운트 쿼리 문자열과 매개변수
   */
  buildCount() {
    // SELECT 절을 COUNT로 대체하는 정규식
    const countPattern = /^\s*SELECT\s+.+?\s+FROM/i;
    
    // 서브쿼리 사용 여부 결정 (GROUP BY 또는 HAVING이 있는 경우)
    const needsSubquery = this.groupByField || (this.havingConditions && this.havingConditions.length > 0);
    
    let countQuery;
    
    if (needsSubquery) {
      // 서브쿼리로 카운트 쿼리 빌드
      const subQuery = this.build().query;
      countQuery = `SELECT COUNT(*) as total FROM (${subQuery}) as countQuery`;
    } else {
      // 기본 쿼리에서 SELECT 절만 변경
      countQuery = this.baseQuery.replace(countPattern, 'SELECT COUNT(*) as total FROM');
      
      // WHERE 절 추가
      if (this.conditions.length > 0) {
        countQuery += ' WHERE ' + this.conditions.join(' AND ');
      }
    }
    
    return { query: countQuery, params: this.params };
  }
  
  /**
   * 쿼리 안전성 확인
   * @private
   */
  _validateQuery() {
    // SQL 인젝션 가능성이 있는 패턴 확인
    const dangerousPatterns = [
      /;\s*SELECT/i,   // 다중 쿼리
      /;\s*DELETE/i,   // DELETE 구문
      /;\s*DROP/i,     // DROP 구문
      /;\s*UPDATE/i,   // UPDATE 구문
      /;\s*INSERT/i,   // INSERT 구문
      /\/\*/i,         // 주석 시작
      /--/i            // 한 줄 주석
    ];
    
    // 기본 쿼리 및 조건에서 위험한 패턴 확인
    const allParts = [this.baseQuery, ...this.conditions];
    
    for (const part of allParts) {
      for (const pattern of dangerousPatterns) {
        if (pattern.test(part)) {
          throw new Error(`Potentially unsafe SQL detected: ${part}`);
        }
      }
    }
  }
}

module.exports = QueryBuilder;
