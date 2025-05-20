/**
 * API 응답 포맷 유틸리티
 * 표준화된 응답 형식 생성
 */

/**
 * 성공 응답 형식 생성
 * @param {*} data - 응답 데이터
 * @param {string} message - 성공 메시지
 * @return {Object} 형식화된 응답 객체
 */
const success = (data, message = 'Success') => {
  return {
    success: true,
    message,
    data
  };
};

/**
 * 오류 응답 형식 생성
 * @param {string} message - 오류 메시지
 * @param {*} details - 오류 세부 정보
 * @return {Object} 형식화된 오류 응답 객체
 */
const error = (message = 'Error', details = null) => {
  return {
    success: false,
    message,
    details
  };
};

/**
 * 페이지네이션된 응답 형식 생성
 * @param {Array} data - 페이지 데이터
 * @param {number} page - 현재 페이지 번호
 * @param {number} limit - 페이지당 항목 수
 * @param {number} total - 전체 항목 수
 * @param {string} message - 성공 메시지
 * @return {Object} 형식화된 페이지네이션 응답 객체
 */
const paginated = (data, page, limit, total, message = 'Success') => {
  return {
    success: true,
    message,
    data,
    pagination: {
      page,
      limit,
      total,
      pages: Math.ceil(total / limit)
    }
  };
};

module.exports = {
  success,
  error,
  paginated
};
