/**
 * 에러 처리 미들웨어
 * 서버리스 환경에 최적화됨
 */

const { error } = require('../utils/response');
const { getContextLogger } = require('../utils/logger');

// 서버리스 환경에서 오류 추적 지원을 위한 옵션
const ERROR_REPORTING_ENABLED = process.env.NODE_ENV === 'production';
const ERROR_DETAILS_IN_PROD = process.env.ERROR_DETAILS_IN_PROD === 'true';

/**
 * 서버리스 환경에서 오류 보고 (Error Reporting)
 * @param {Error} err 오류 객체
 * @param {Object} request 요청 정보
 */
const reportError = (err, request) => {
  if (!ERROR_REPORTING_ENABLED) return;
  
  try {
    // 서버리스 환경에서는 Google Cloud Error Reporting에 자동 통합됨
    // 구조화된 로깅 형식에 맞게 오류 출력
    console.error({
      severity: 'ERROR',
      message: err.message || 'Unknown error',
      stack: err.stack,
      httpRequest: {
        method: request.method,
        url: request.originalUrl,
        status: err.statusCode || 500,
        userAgent: request.get('user-agent'),
        remoteIp: request.ip,
        referrer: request.get('referrer'),
      },
      context: {
        user: request.user?.uid || 'anonymous',
        requestId: request.requestId,
      },
      errorInfo: {
        name: err.name,
        code: err.code,
        details: err.details,
      }
    });
  } catch (reportingError) {
    // 오류 보고 중 오류가 발생해도 무시 (메인 에러 처리에 영향 없게)
    console.warn('Error occurred during error reporting:', reportingError.message);
  }
};

/**
 * 안전한 오류 포맷팅
 * 서버리스 환경에서 메모리 및 응답 크기 최적화
 */
const formatErrorResponse = (err, includeDetails) => {
  // 기본 오류 정보
  const errorResponse = {
    message: err.message || 'Internal server error',
    code: err.code,
    status: err.statusCode || 500,
  };
  
  // 추가 오류 상세 정보 (개발 환경 또는 명시적 활성화 시)
  if (includeDetails) {
    // 스택 트레이스 포함 (길이 제한)
    if (err.stack) {
      // 스택 트레이스 최대 10줄로 제한
      errorResponse.stack = err.stack
        .split('\n')
        .slice(0, 10)
        .join('\n');
      
      // 프로덕션 환경에서는 더 짧게 제한
      if (process.env.NODE_ENV === 'production') {
        errorResponse.stack = err.stack
          .split('\n')
          .slice(0, 3)
          .join('\n') + '\n  ...';
      }
    }
    
    // 유효성 검증 오류 상세 정보 (Joi)
    if (err.details) {
      errorResponse.details = Array.isArray(err.details) ? 
        err.details.slice(0, 10) : // 최대 10개 오류까지만 포함
        err.details;
    }
    
    // 그 외 추가 정보
    if (err.name) errorResponse.name = err.name;
    if (err.type) errorResponse.type = err.type;
  }
  
  return errorResponse;
};

/**
 * 글로벌 에러 핸들러 - 서버리스 최적화
 * @param {Error} err 에러 객체
 * @param {Request} req 요청 객체
 * @param {Response} res 응답 객체
 * @param {NextFunction} next Express 다음 미들웨어
 * @return {Response} 에러 응답
 */
const errorHandler = (err, req, res, next) => {
  const logger = getContextLogger();
  
  // 오류 로깅
  logger.error(`Error occurred: ${err.message}`, {
    error: err.name, 
    stack: err.stack,
    path: req.originalUrl,
    method: req.method
  });
  
  // 클라우드 오류 보고 서비스에 보고
  reportError(err, req);
  
  // 오류 종류에 따른 처리
  let statusCode = err.statusCode || 500;
  let message = err.message || 'Internal server error';
  
  // 오류 유형별 처리
  switch (err.name) {
    case 'ValidationError':
      statusCode = 400;
      message = 'Validation error';
      break;
      
    case 'UnauthorizedError':
      statusCode = 401;
      message = 'Authentication required';
      break;
      
    case 'ForbiddenError':
      statusCode = 403;
      message = 'Insufficient permissions';
      break;
      
    case 'NotFoundError':
      statusCode = 404;
      message = err.message || 'Resource not found';
      break;
      
    // 데이터베이스 오류 처리
    case 'SequelizeUniqueConstraintError':
    case 'SequelizeForeignKeyConstraintError':
    case 'DatabaseError':
      if (err.code === 'ER_DUP_ENTRY') {
        statusCode = 409;
        message = 'Duplicate entry';
      } else if (err.code === 'ER_NO_REFERENCED_ROW') {
        statusCode = 400;
        message = 'Referenced resource does not exist';
      } else {
        statusCode = 500;
        message = 'Database error';
      }
      break;
      
    default:
      // Firebase, Google Cloud 특수 오류 처리
      if (err.code === 'RESOURCE_EXHAUSTED') {
        statusCode = 429; // Too Many Requests
        message = 'Resource quota exceeded, please try again later';
      } else if (err.code === 'DEADLINE_EXCEEDED') {
        statusCode = 504; // Gateway Timeout
        message = 'Request processing took too long, please try again';
      }
  }
  
  // 상세 정보 포함 여부 결정
  const includeDetails = process.env.NODE_ENV !== 'production' || ERROR_DETAILS_IN_PROD;
  
  // 오류 응답 생성
  const errorResponse = formatErrorResponse({
    ...err,
    statusCode,
    message
  }, includeDetails);
  
  return res.status(statusCode).json(error(
    errorResponse.message,
    statusCode,
    includeDetails ? errorResponse : null
  ));
};

/**
 * 404 에러 핸들러 - 서버리스 최적화
 * @param {Request} req 요청 객체
 * @param {Response} res 응답 객체
 * @return {Response} 404 에러 응답
 */
const notFoundHandler = (req, res) => {
  const logger = getContextLogger();
  
  // 404 오류 로깅 (낮은 심각도)
  logger.info(`Endpoint not found: ${req.method} ${req.originalUrl}`);
  
  return res.status(404).json(error(
    `Endpoint not found: ${req.method} ${req.originalUrl}`,
    404
  ));
};

// 커스텀 에러 클래스 - 서버리스 환경에 최적화
class BaseError extends Error {
  constructor(message, statusCode) {
    super(message);
    this.name = this.constructor.name;
    this.statusCode = statusCode;
    Error.captureStackTrace(this, this.constructor);
  }
}

class ValidationError extends BaseError {
  constructor(message, details) {
    super(message || 'Validation error', 400);
    this.details = details;
  }
}

class UnauthorizedError extends BaseError {
  constructor(message = 'Authentication required') {
    super(message, 401);
  }
}

class ForbiddenError extends BaseError {
  constructor(message = 'Insufficient permissions') {
    super(message, 403);
  }
}

class NotFoundError extends BaseError {
  constructor(message = 'Resource not found') {
    super(message, 404);
  }
}

class ConflictError extends BaseError {
  constructor(message = 'Resource already exists') {
    super(message, 409);
  }
}

class RateLimitError extends BaseError {
  constructor(message = 'Rate limit exceeded') {
    super(message, 429);
  }
}

class ServerError extends BaseError {
  constructor(message = 'Internal server error') {
    super(message, 500);
  }
}

module.exports = {
  errorHandler,
  notFoundHandler,
  ValidationError,
  UnauthorizedError,
  ForbiddenError,
  NotFoundError,
  ConflictError,
  RateLimitError,
  ServerError,
  BaseError
};
