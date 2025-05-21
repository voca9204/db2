/**
 * 응답 헬퍼 유틸리티 함수
 */

/**
 * 성공 응답 생성
 * @param {any} data 응답 데이터
 * @param {string} message 응답 메시지
 * @param {number} statusCode HTTP 상태 코드
 * @return {Object} 포맷된 응답 객체
 */
const success = (data = null, message = 'Success', statusCode = 200) => ({
  success: true,
  statusCode,
  message,
  data,
  timestamp: new Date().toISOString(),
});

/**
 * 에러 응답 생성
 * @param {string} message 에러 메시지
 * @param {number} statusCode HTTP 상태 코드
 * @param {any} errors 추가 에러 정보
 * @return {Object} 포맷된 에러 응답 객체
 */
const error = (message = 'An error occurred', statusCode = 500, errors = null) => ({
  success: false,
  statusCode,
  message,
  errors,
  timestamp: new Date().toISOString(),
});

/**
 * 페이지네이션 응답 생성
 * @param {Array} data 페이지네이션된 데이터
 * @param {number} page 현재 페이지
 * @param {number} limit 페이지당 항목 수
 * @param {number} total 총 항목 수
 * @param {string} message 응답 메시지
 * @return {Object} 포맷된 페이지네이션 응답
 */
const paginated = (data, page, limit, total, message = 'Paginated results') => ({
  success: true,
  statusCode: 200,
  message,
  data,
  pagination: {
    page: parseInt(page, 10),
    limit: parseInt(limit, 10),
    total,
    pages: Math.ceil(total / limit),
    hasNext: page < Math.ceil(total / limit),
    hasPrev: page > 1,
  },
  timestamp: new Date().toISOString(),
});

module.exports = {
  success,
  error,
  paginated,
};
