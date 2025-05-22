/**
 * API 응답 처리 표준화 모듈
 * 
 * 이 모듈은 API 응답의 구조와 형식을 표준화하여 일관된 API 응답을 제공합니다.
 */

/**
 * 성공 응답 표준화
 * @param {object} data - 응답 데이터
 * @param {string} message - 응답 메시지
 * @param {object} meta - 추가 메타데이터
 * @returns {object} 표준화된 성공 응답 객체
 */
function success(data, message = '요청이 성공적으로 처리되었습니다.', meta = {}) {
  return {
    success: true,
    message,
    data: normalizeData(data),
    meta: {
      timestamp: new Date().toISOString(),
      ...meta
    }
  };
}

/**
 * 오류 응답 표준화
 * @param {string} message - 오류 메시지
 * @param {number} status - HTTP 상태 코드
 * @param {object} details - 상세 오류 정보 (개발 모드에서만 표시)
 * @returns {object} 표준화된 오류 응답 객체
 */
function error(message = '처리 중 오류가 발생했습니다.', status = 500, details = null) {
  const isDevelopment = process.env.NODE_ENV === 'development';
  
  return {
    success: false,
    message,
    status,
    meta: {
      timestamp: new Date().toISOString(),
      ...(isDevelopment && details ? { details } : {})
    }
  };
}

/**
 * 페이지네이션 응답 생성
 * @param {Array} data - 데이터 배열
 * @param {object} pagination - 페이지네이션 정보
 * @param {string} message - 응답 메시지
 * @param {object} meta - 추가 메타데이터
 * @returns {object} 페이지네이션이 포함된 표준화된 응답 객체
 */
function paginated(data, pagination, message = '요청이 성공적으로 처리되었습니다.', meta = {}) {
  return {
    success: true,
    message,
    data: normalizeData(data),
    pagination: {
      total: pagination.total || 0,
      count: data.length,
      page: pagination.page || 1,
      pages: pagination.pages || 1,
      limit: pagination.limit || data.length
    },
    meta: {
      timestamp: new Date().toISOString(),
      ...meta
    }
  };
}

/**
 * 데이터 표준화 (BigInt 등의 특수 유형 처리)
 * @param {*} data - 표준화할 데이터
 * @returns {*} 표준화된 데이터
 */
function normalizeData(data) {
  if (data === null || data === undefined) {
    return null;
  }
  
  // BigInt 처리
  if (typeof data === 'bigint') {
    return Number(data);
  }
  
  // 배열 처리
  if (Array.isArray(data)) {
    return data.map(item => normalizeData(item));
  }
  
  // 객체 처리
  if (typeof data === 'object' && data !== null) {
    const result = {};
    for (const key in data) {
      if (Object.prototype.hasOwnProperty.call(data, key)) {
        // 배열 내 순환 참조를 방지하기 위한 특별 처리
        if (key === '_rows' || key === '_fields') {
          continue;
        }
        
        const value = data[key];
        
        // BigInt 처리
        if (typeof value === 'bigint') {
          result[key] = Number(value);
        } 
        // 날짜 처리
        else if (value instanceof Date) {
          result[key] = value.toISOString();
        } 
        // 중첩 객체 재귀 처리
        else if (typeof value === 'object' && value !== null) {
          result[key] = normalizeData(value);
        } 
        // 기타 값은 그대로 유지
        else {
          result[key] = value;
        }
      }
    }
    return result;
  }
  
  // 기본 값은 그대로 반환
  return data;
}

/**
 * CSV 응답 설정
 * @param {object} res - Express 응답 객체
 * @param {string} filename - 파일명
 */
function setCsvHeaders(res, filename) {
  res.setHeader('Content-Type', 'text/csv; charset=utf-8');
  res.setHeader('Content-Disposition', `attachment; filename=${filename}`);
}

module.exports = {
  success,
  error,
  paginated,
  normalizeData,
  setCsvHeaders
};
