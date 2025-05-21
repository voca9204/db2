/**
 * 유효성 검사 미들웨어
 * API 요청의 유효성을 검사하는 미들웨어
 */

const { ValidationError } = require('./error-handler');
const { getContextLogger } = require('../../utils/logger');

/**
 * 쿼리 파라미터 유효성 검사 미들웨어
 * 
 * @param {Object} schema - Joi 검증 스키마
 * @return {Function} 미들웨어 함수
 */
const validateQuery = (schema) => (req, res, next) => {
  const logger = getContextLogger();
  
  // 스키마가 없는 경우 건너뛰기
  if (!schema) {
    return next();
  }
  
  // 요청 쿼리 유효성 검사
  const { error, value } = schema.validate(req.query, {
    abortEarly: false,
    stripUnknown: false,
    allowUnknown: true
  });
  
  if (error) {
    logger.warn('Query validation failed', {
      path: req.path,
      method: req.method,
      query: req.query,
      error: error.message
    });
    
    // 유효성 검사 오류 변환
    const errors = error.details.map(detail => ({
      field: detail.context?.key || 'unknown',
      message: detail.message
    }));
    
    throw new ValidationError('Query validation failed', errors);
  }
  
  // 검증된 값으로 쿼리 객체 업데이트
  req.query = value;
  
  next();
};

/**
 * 요청 본문 유효성 검사 미들웨어
 * 
 * @param {Object} schema - Joi 검증 스키마
 * @return {Function} 미들웨어 함수
 */
const validateBody = (schema) => (req, res, next) => {
  const logger = getContextLogger();
  
  // 스키마가 없는 경우 건너뛰기
  if (!schema) {
    return next();
  }
  
  // 요청 본문 유효성 검사
  const { error, value } = schema.validate(req.body, {
    abortEarly: false,
    stripUnknown: true
  });
  
  if (error) {
    logger.warn('Request body validation failed', {
      path: req.path,
      method: req.method,
      error: error.message
    });
    
    // 유효성 검사 오류 변환
    const errors = error.details.map(detail => ({
      field: detail.context?.key || 'unknown',
      message: detail.message
    }));
    
    throw new ValidationError('Request body validation failed', errors);
  }
  
  // 검증된 값으로 본문 객체 업데이트
  req.body = value;
  
  next();
};

/**
 * URL 파라미터 유효성 검사 미들웨어
 * 
 * @param {Object} schema - Joi 검증 스키마
 * @return {Function} 미들웨어 함수
 */
const validateParams = (schema) => (req, res, next) => {
  const logger = getContextLogger();
  
  // 스키마가 없는 경우 건너뛰기
  if (!schema) {
    return next();
  }
  
  // URL 파라미터 유효성 검사
  const { error, value } = schema.validate(req.params, {
    abortEarly: false,
    stripUnknown: false
  });
  
  if (error) {
    logger.warn('URL parameter validation failed', {
      path: req.path,
      method: req.method,
      params: req.params,
      error: error.message
    });
    
    // 유효성 검사 오류 변환
    const errors = error.details.map(detail => ({
      field: detail.context?.key || 'unknown',
      message: detail.message
    }));
    
    throw new ValidationError('URL parameter validation failed', errors);
  }
  
  // 검증된 값으로 파라미터 객체 업데이트
  req.params = value;
  
  next();
};

/**
 * 파일 업로드 유효성 검사 미들웨어
 * 
 * @param {Object} options - 파일 검증 옵션 (최대 크기, 허용 형식 등)
 * @return {Function} 미들웨어 함수
 */
const validateFiles = (options = {}) => (req, res, next) => {
  const logger = getContextLogger();
  
  // 파일이 없는 경우 건너뛰기
  if (!req.files && !req.file) {
    return next();
  }
  
  const {
    maxFiles = 5,
    maxFileSize = 5 * 1024 * 1024, // 5MB
    allowedMimeTypes = [],
    required = false
  } = options;
  
  // 필수 파일 확인
  if (required && !req.files && !req.file) {
    throw new ValidationError('File upload is required');
  }
  
  const errors = [];
  
  // 단일 파일 검증
  if (req.file) {
    if (req.file.size > maxFileSize) {
      errors.push({
        field: req.file.fieldname,
        message: `File size exceeds the limit of ${maxFileSize / 1024 / 1024}MB`
      });
    }
    
    if (allowedMimeTypes.length > 0 && !allowedMimeTypes.includes(req.file.mimetype)) {
      errors.push({
        field: req.file.fieldname,
        message: `File type not allowed. Allowed types: ${allowedMimeTypes.join(', ')}`
      });
    }
  }
  
  // 다중 파일 검증
  if (req.files) {
    // 최대 파일 수 검증
    const filesArray = Array.isArray(req.files) ? req.files : Object.values(req.files).flat();
    
    if (filesArray.length > maxFiles) {
      errors.push({
        field: 'files',
        message: `Too many files. Maximum ${maxFiles} allowed`
      });
    }
    
    // 각 파일 크기 및 타입 검증
    filesArray.forEach(file => {
      if (file.size > maxFileSize) {
        errors.push({
          field: file.fieldname,
          message: `File ${file.originalname} exceeds the size limit of ${maxFileSize / 1024 / 1024}MB`
        });
      }
      
      if (allowedMimeTypes.length > 0 && !allowedMimeTypes.includes(file.mimetype)) {
        errors.push({
          field: file.fieldname,
          message: `File ${file.originalname} has invalid type. Allowed types: ${allowedMimeTypes.join(', ')}`
        });
      }
    });
  }
  
  if (errors.length > 0) {
    logger.warn('File validation failed', {
      path: req.path,
      method: req.method,
      errors
    });
    
    throw new ValidationError('File validation failed', errors);
  }
  
  next();
};

/**
 * 전체 요청 유효성 검사 미들웨어
 * 
 * @param {Object} schemas - 각 부분별 Joi 검증 스키마
 * @return {Function} 미들웨어 함수
 */
const validateRequest = (schemas = {}) => (req, res, next) => {
  const { query, body, params, files } = schemas;
  
  // 미들웨어 체인 구성
  const middlewares = [
    query ? validateQuery(query) : null,
    body ? validateBody(body) : null,
    params ? validateParams(params) : null,
    files ? validateFiles(files) : null
  ].filter(Boolean); // null 제거
  
  // 미들웨어가 없는 경우 바로 다음으로
  if (middlewares.length === 0) {
    return next();
  }
  
  // 체인 실행을 위한 인덱스
  let index = 0;
  
  // 다음 미들웨어 호출 함수
  const runNext = (err) => {
    // 오류 발생 시 전체 체인 중단
    if (err) return next(err);
    
    // 모든 미들웨어 완료 시 종료
    if (index >= middlewares.length) {
      return next();
    }
    
    // 다음 미들웨어 실행 (try-catch로 비동기 오류 처리)
    try {
      middlewares[index++](req, res, (err) => runNext(err));
    } catch (error) {
      next(error);
    }
  };
  
  // 체인 실행 시작
  runNext();
};

module.exports = {
  validateQuery,
  validateBody,
  validateParams,
  validateFiles,
  validateRequest
};
