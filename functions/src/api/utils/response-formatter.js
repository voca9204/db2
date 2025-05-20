/**
 * 응답 포맷터 유틸리티
 * 일관된 API 응답 형식을 제공하는 유틸리티
 */

/**
 * 성공 응답 포맷
 * @param {*} data - 응답 데이터
 * @param {string} message - 성공 메시지
 * @return {Object} 표준화된 성공 응답 객체
 */
const formatSuccess = (data, message = 'Success') => {
  return {
    success: true,
    message,
    data,
    timestamp: new Date().toISOString()
  };
};

/**
 * 오류 응답 포맷
 * @param {string} message - 오류 메시지
 * @param {*} errors - 상세 오류 정보 (선택 사항)
 * @param {number} statusCode - HTTP 상태 코드
 * @return {Object} 표준화된 오류 응답 객체
 */
const formatError = (message = 'Error', errors = null, statusCode = 500) => {
  return {
    success: false,
    message,
    errors,
    statusCode,
    timestamp: new Date().toISOString()
  };
};

/**
 * 페이지네이션 응답 포맷
 * @param {Array} data - 페이지네이션된 데이터 배열
 * @param {number} page - 현재 페이지 번호
 * @param {number} limit - 페이지당 항목 수
 * @param {number} total - 전체 항목 수
 * @param {string} message - 성공 메시지
 * @return {Object} 표준화된 페이지네이션 응답 객체
 */
const formatPaginated = (data, page, limit, total, message = 'Success') => {
  return {
    success: true,
    message,
    data,
    pagination: {
      page,
      limit,
      total,
      pages: Math.ceil(total / limit),
      hasNextPage: page * limit < total,
      hasPrevPage: page > 1
    },
    timestamp: new Date().toISOString()
  };
};

/**
 * 분석 결과 포맷
 * @param {*} data - 분석 결과 데이터
 * @param {Object} metadata - 분석 관련 메타데이터
 * @param {string} message - 성공 메시지
 * @return {Object} 표준화된 분석 결과 응답 객체
 */
const formatAnalytics = (data, metadata = {}, message = 'Analysis completed successfully') => {
  return {
    success: true,
    message,
    data,
    metadata: {
      ...metadata,
      analyzedAt: new Date().toISOString()
    },
    timestamp: new Date().toISOString()
  };
};

/**
 * 집계 결과 포맷
 * @param {Object} aggregations - 집계 결과 객체
 * @param {Object} filters - 적용된 필터 조건
 * @param {string} message - 성공 메시지
 * @return {Object} 표준화된 집계 결과 응답 객체
 */
const formatAggregation = (aggregations, filters = {}, message = 'Aggregation completed successfully') => {
  return {
    success: true,
    message,
    aggregations,
    filters,
    timestamp: new Date().toISOString()
  };
};

/**
 * 작업 상태 포맷
 * @param {string} jobId - 작업 ID
 * @param {string} status - 작업 상태
 * @param {*} result - 작업 결과 (완료된 경우)
 * @param {Object} metadata - 작업 메타데이터
 * @return {Object} 표준화된 작업 상태 응답 객체
 */
const formatJobStatus = (jobId, status, result = null, metadata = {}) => {
  return {
    success: true,
    jobId,
    status,
    result,
    metadata: {
      ...metadata,
      updatedAt: new Date().toISOString()
    },
    timestamp: new Date().toISOString()
  };
};

module.exports = {
  formatSuccess,
  formatError,
  formatPaginated,
  formatAnalytics,
  formatAggregation,
  formatJobStatus
};
