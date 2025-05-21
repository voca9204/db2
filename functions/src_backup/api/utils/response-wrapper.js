/**
 * 응답 래퍼 유틸리티
 * 일관된 API 응답 형식을 위한 표준 래퍼 클래스
 */

/**
 * 응답 래퍼 클래스
 * API 요청에 대한 일관된 응답 형식을 제공
 */
class ResponseWrapper {
  /**
   * 성공 응답 생성
   * 
   * @param {*} data - 응답 데이터
   * @param {string} message - 성공 메시지
   * @param {Object} meta - 추가 메타데이터
   * @return {Object} 성공 응답 객체
   */
  static success(data = null, message = 'Success', meta = {}) {
    return {
      success: true,
      message,
      data,
      meta,
      timestamp: new Date().toISOString()
    };
  }
  
  /**
   * 오류 응답 생성
   * 
   * @param {string} message - 오류 메시지
   * @param {number} statusCode - HTTP 상태 코드
   * @param {Array} errors - 상세 오류 목록
   * @return {Object} 오류 응답 객체
   */
  static error(message = 'Error', statusCode = 500, errors = []) {
    return {
      success: false,
      message,
      errors,
      statusCode,
      timestamp: new Date().toISOString()
    };
  }
  
  /**
   * 페이지네이션 응답 생성
   * 
   * @param {Array} data - 페이지네이션된 데이터
   * @param {Object} pagination - 페이지네이션 정보
   * @param {string} message - 응답 메시지
   * @return {Object} 페이지네이션 응답 객체
   */
  static paginated(data, pagination, message = 'Success') {
    return {
      success: true,
      message,
      data,
      pagination: {
        page: pagination.page,
        limit: pagination.limit,
        total: pagination.total,
        pages: Math.ceil(pagination.total / pagination.limit)
      },
      timestamp: new Date().toISOString()
    };
  }
  
  /**
   * 생성 성공 응답
   * 
   * @param {*} data - 생성된 리소스 데이터
   * @param {string} resourceName - 리소스 이름
   * @return {Object} 생성 성공 응답 객체
   */
  static created(data, resourceName = 'Resource') {
    return ResponseWrapper.success(
      data,
      `${resourceName} created successfully`,
      { resourceId: data.id || null }
    );
  }
  
  /**
   * 업데이트 성공 응답
   * 
   * @param {*} data - 업데이트된 리소스 데이터
   * @param {string} resourceName - 리소스 이름
   * @return {Object} 업데이트 성공 응답 객체
   */
  static updated(data, resourceName = 'Resource') {
    return ResponseWrapper.success(
      data,
      `${resourceName} updated successfully`,
      { resourceId: data.id || null }
    );
  }
  
  /**
   * 삭제 성공 응답
   * 
   * @param {number|string} id - 삭제된 리소스 ID
   * @param {string} resourceName - 리소스 이름
   * @return {Object} 삭제 성공 응답 객체
   */
  static deleted(id, resourceName = 'Resource') {
    return ResponseWrapper.success(
      null,
      `${resourceName} deleted successfully`,
      { resourceId: id }
    );
  }
  
  /**
   * 리소스 찾기 실패 응답
   * 
   * @param {string} resourceName - 리소스 이름
   * @param {number|string} id - 찾을 수 없는 리소스 ID
   * @return {Object} 리소스 찾기 실패 응답 객체
   */
  static notFound(resourceName = 'Resource', id = null) {
    const message = id 
      ? `${resourceName} with ID ${id} not found`
      : `${resourceName} not found`;
      
    return ResponseWrapper.error(message, 404);
  }
  
  /**
   * 유효성 검사 실패 응답
   * 
   * @param {Array} errors - 유효성 검사 오류 목록
   * @param {string} message - 오류 메시지
   * @return {Object} 유효성 검사 실패 응답 객체
   */
  static validationFailed(errors, message = 'Validation failed') {
    return ResponseWrapper.error(message, 400, errors);
  }
  
  /**
   * 인증 실패 응답
   * 
   * @param {string} message - 오류 메시지
   * @return {Object} 인증 실패 응답 객체
   */
  static unauthorized(message = 'Authentication required') {
    return ResponseWrapper.error(message, 401);
  }
  
  /**
   * 권한 부족 응답
   * 
   * @param {string} message - 오류 메시지
   * @return {Object} 권한 부족 응답 객체
   */
  static forbidden(message = 'Access denied') {
    return ResponseWrapper.error(message, 403);
  }
  
  /**
   * 비어있는 응답
   * 
   * @return {Object} 비어있는 응답 객체
   */
  static noContent() {
    return {
      success: true,
      message: 'No Content',
      timestamp: new Date().toISOString()
    };
  }
  
  /**
   * 서버 오류 응답
   * 
   * @param {string} message - 오류 메시지
   * @param {Error} error - 예외 객체
   * @return {Object} 서버 오류 응답 객체
   */
  static serverError(message = 'Internal Server Error', error = null) {
    const response = ResponseWrapper.error(message, 500);
    
    // 개발 환경에서만 오류 스택 포함
    if (error && process.env.NODE_ENV === 'development') {
      response.stack = error.stack;
    }
    
    return response;
  }
  
  /**
   * 분석 결과 응답
   * 
   * @param {*} data - 분석 데이터
   * @param {Object} meta - 분석 메타데이터
   * @param {string} message - 응답 메시지
   * @return {Object} 분석 결과 응답 객체
   */
  static analysis(data, meta = {}, message = 'Analysis completed successfully') {
    return ResponseWrapper.success(data, message, {
      ...meta,
      analysisTimestamp: new Date().toISOString()
    });
  }
  
  /**
   * 일괄 처리 응답
   * 
   * @param {Array} results - 일괄 처리 결과 배열
   * @param {Object} summary - 일괄 처리 요약 정보
   * @param {string} message - 응답 메시지
   * @return {Object} 일괄 처리 응답 객체
   */
  static batch(results, summary = {}, message = 'Batch operation completed') {
    return ResponseWrapper.success(results, message, {
      summary: {
        total: results.length,
        ...summary
      }
    });
  }
}

module.exports = ResponseWrapper;
