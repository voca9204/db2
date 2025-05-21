/**
 * 오류 처리 유틸리티
 * API 오류 클래스 및 오류 핸들러
 */

/**
 * 기본 API 오류 클래스
 */
class ApiError extends Error {
  /**
   * 생성자
   * @param {string} message - 오류 메시지
   * @param {number} statusCode - HTTP 상태 코드
   * @param {*} details - 추가 오류 세부 정보
   */
  constructor(message, statusCode, details = null) {
    super(message);
    this.name = this.constructor.name;
    this.statusCode = statusCode;
    this.details = details;
    
    // 스택 추적 캡처
    Error.captureStackTrace(this, this.constructor);
  }
}

/**
 * 400 Bad Request - 잘못된 요청 오류
 */
class BadRequestError extends ApiError {
  constructor(message = 'Bad request', details = null) {
    super(message, 400, details);
  }
}

/**
 * 401 Unauthorized - 인증 오류
 */
class UnauthorizedError extends ApiError {
  constructor(message = 'Authentication required', details = null) {
    super(message, 401, details);
  }
}

/**
 * 403 Forbidden - 권한 없음 오류
 */
class ForbiddenError extends ApiError {
  constructor(message = 'Access denied', details = null) {
    super(message, 403, details);
  }
}

/**
 * 404 Not Found - 리소스 없음 오류
 */
class NotFoundError extends ApiError {
  constructor(message = 'Resource not found', details = null) {
    super(message, 404, details);
  }
}

/**
 * 409 Conflict - 리소스 충돌 오류
 */
class ConflictError extends ApiError {
  constructor(message = 'Resource conflict', details = null) {
    super(message, 409, details);
  }
}

/**
 * 422 Unprocessable Entity - 유효성 검사 오류
 */
class ValidationError extends ApiError {
  constructor(message = 'Validation error', details = null) {
    super(message, 422, details);
  }
}

/**
 * 429 Too Many Requests - 속도 제한 오류
 */
class TooManyRequestsError extends ApiError {
  constructor(message = 'Too many requests', details = null) {
    super(message, 429, details);
  }
}

/**
 * 500 Internal Server Error - 서버 오류
 */
class ServerError extends ApiError {
  constructor(message = 'Internal server error', details = null) {
    super(message, 500, details);
  }
}

/**
 * 503 Service Unavailable - 서비스 불가 오류
 */
class ServiceUnavailableError extends ApiError {
  constructor(message = 'Service temporarily unavailable', details = null) {
    super(message, 503, details);
  }
}

module.exports = {
  ApiError,
  BadRequestError,
  UnauthorizedError,
  ForbiddenError,
  NotFoundError,
  ConflictError,
  ValidationError,
  TooManyRequestsError,
  ServerError,
  ServiceUnavailableError
};
