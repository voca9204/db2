/**
 * 오류 처리 미들웨어
 * 모든 API 오류를 일관되게 처리하기 위한 미들웨어
 */

const { getContextLogger } = require('../../utils/logger');
const ResponseWrapper = require('../utils/response-wrapper');

/**
 * 사용자 정의 API 오류 클래스
 */
class ApiError extends Error {
  /**
   * 생성자
   * 
   * @param {string} message - 오류 메시지
   * @param {number} statusCode - HTTP 상태 코드
   * @param {Array} errors - 상세 오류 목록
   */
  constructor(message, statusCode = 500, errors = []) {
    super(message);
    this.name = this.constructor.name;
    this.statusCode = statusCode;
    this.errors = errors;
    Error.captureStackTrace(this, this.constructor);
  }
}

/**
 * 리소스 찾기 실패 오류
 */
class NotFoundError extends ApiError {
  /**
   * 생성자
   * 
   * @param {string} message - 오류 메시지
   * @param {Array} errors - 상세 오류 목록
   */
  constructor(message = 'Resource not found', errors = []) {
    super(message, 404, errors);
  }
}

/**
 * 유효성 검사 실패 오류
 */
class ValidationError extends ApiError {
  /**
   * 생성자
   * 
   * @param {string} message - 오류 메시지
   * @param {Array} errors - 상세 오류 목록
   */
  constructor(message = 'Validation failed', errors = []) {
    super(message, 400, errors);
  }
}

/**
 * 인증 실패 오류
 */
class AuthenticationError extends ApiError {
  /**
   * 생성자
   * 
   * @param {string} message - 오류 메시지
   * @param {Array} errors - 상세 오류 목록
   */
  constructor(message = 'Authentication required', errors = []) {
    super(message, 401, errors);
  }
}

/**
 * 권한 부족 오류
 */
class AuthorizationError extends ApiError {
  /**
   * 생성자
   * 
   * @param {string} message - 오류 메시지
   * @param {Array} errors - 상세 오류 목록
   */
  constructor(message = 'Access denied', errors = []) {
    super(message, 403, errors);
  }
}

/**
 * 중복 리소스 오류
 */
class DuplicateResourceError extends ApiError {
  /**
   * 생성자
   * 
   * @param {string} message - 오류 메시지
   * @param {Array} errors - 상세 오류 목록
   */
  constructor(message = 'Resource already exists', errors = []) {
    super(message, 409, errors);
  }
}

/**
 * 데이터베이스 오류
 */
class DatabaseError extends ApiError {
  /**
   * 생성자
   * 
   * @param {string} message - 오류 메시지
   * @param {Array} errors - 상세 오류 목록
   */
  constructor(message = 'Database operation failed', errors = []) {
    super(message, 500, errors);
  }
}

/**
 * 외부 서비스 오류
 */
class ExternalServiceError extends ApiError {
  /**
   * 생성자
   * 
   * @param {string} message - 오류 메시지
   * @param {number} statusCode - HTTP 상태 코드
   * @param {Array} errors - 상세 오류 목록
   */
  constructor(message = 'External service error', statusCode = 502, errors = []) {
    super(message, statusCode, errors);
  }
}

/**
 * 전역 오류 처리 미들웨어
 * 모든 오류를 캐치하여 일관된 형식으로 응답
 * 
 * @param {Error} err - 발생한 오류
 * @param {Request} req - Express 요청 객체
 * @param {Response} res - Express 응답 객체
 * @param {Function} next - 다음 미들웨어 함수
 */
const errorHandler = (err, req, res, next) => {
  const logger = getContextLogger();
  
  // 기본 상태 코드와 오류 메시지
  let statusCode = 500;
  let message = 'Internal Server Error';
  let errors = [];
  
  // API 오류 처리
  if (err instanceof ApiError) {
    statusCode = err.statusCode;
    message = err.message;
    errors = err.errors;
    
    // 4xx 오류는 경고 레벨로 로깅
    if (statusCode >= 400 && statusCode < 500) {
      logger.warn(`API Error (${statusCode}): ${message}`, {
        path: req.path,
        method: req.method,
        errors
      });
    } else {
      // 5xx 오류는 에러 레벨로 로깅
      logger.error(`Server Error (${statusCode}): ${message}`, {
        path: req.path,
        method: req.method,
        errors,
        stack: err.stack
      });
    }
  }
  // Express 검증 오류 처리
  else if (err.name === 'ValidationError') {
    statusCode = 400;
    message = 'Validation failed';
    
    // Joi 검증 오류 변환
    if (err.details) {
      errors = err.details.map(detail => ({
        field: detail.context?.key || 'unknown',
        message: detail.message
      }));
    } else {
      errors = [{ message: err.message }];
    }
    
    logger.warn(`Validation Error: ${message}`, {
      path: req.path,
      method: req.method,
      errors
    });
  }
  // Firebase 오류 처리
  else if (err.code && err.code.startsWith('auth/')) {
    statusCode = 401;
    message = 'Authentication failed';
    errors = [{ message: err.message, code: err.code }];
    
    logger.warn(`Authentication Error: ${message}`, {
      path: req.path,
      method: req.method,
      code: err.code
    });
  }
  // 데이터베이스 오류 처리
  else if (err.code && (
    err.code.startsWith('ER_') || 
    err.code === 'ECONNREFUSED' || 
    err.code === 'PROTOCOL_CONNECTION_LOST'
  )) {
    statusCode = 500;
    message = 'Database operation failed';
    
    // 민감 정보 제거
    const sanitizedMessage = err.message.replace(/(password=)[^&]*/gi, '$1*****');
    errors = [{ message: sanitizedMessage, code: err.code }];
    
    logger.error(`Database Error: ${err.code}`, {
      path: req.path,
      method: req.method,
      error: sanitizedMessage,
      stack: err.stack
    });
  }
  // 기타 오류 처리
  else {
    logger.error(`Unhandled Error: ${err.message}`, {
      path: req.path,
      method: req.method,
      stack: err.stack
    });
    
    // 프로덕션 환경에서는 일반 오류 메시지 사용
    if (process.env.NODE_ENV === 'production') {
      message = 'Internal Server Error';
    } else {
      // 개발 환경에서는 상세 오류 메시지 포함
      message = err.message || 'Internal Server Error';
      errors = [{ message, stack: err.stack }];
    }
  }
  
  // 오류 응답 전송
  const response = ResponseWrapper.error(message, statusCode, errors);
  
  // 개발 환경에서만 스택 정보 포함
  if (process.env.NODE_ENV !== 'production') {
    response.stack = err.stack;
  }
  
  res.status(statusCode).json(response);
};

/**
 * 리소스를 찾을 수 없는 경우 처리 미들웨어
 * 
 * @param {Request} req - Express 요청 객체
 * @param {Response} res - Express 응답 객체
 * @param {Function} next - 다음 미들웨어 함수
 */
const notFoundHandler = (req, res, next) => {
  const logger = getContextLogger();
  
  logger.warn(`Not Found: ${req.method} ${req.originalUrl}`);
  
  res.status(404).json(ResponseWrapper.error(
    `Resource not found: ${req.originalUrl}`,
    404
  ));
};

module.exports = {
  ApiError,
  NotFoundError,
  ValidationError,
  AuthenticationError,
  AuthorizationError,
  DuplicateResourceError,
  DatabaseError,
  ExternalServiceError,
  errorHandler,
  notFoundHandler
};
