/**
 * 요청 유효성 검사 미들웨어
 * Joi 기반 요청 데이터 유효성 검사
 */

const { ValidationError } = require('../utils/error-handler');
const { getContextLogger } = require('../../utils/logger');

/**
 * 요청 본문(body) 유효성 검사 미들웨어
 * @param {Object} schema - Joi 유효성 검사 스키마
 * @return {Function} Express 미들웨어
 */
const validateBody = (schema) => {
  return (req, res, next) => {
    const logger = getContextLogger();
    
    const { error, value } = schema.validate(req.body, {
      abortEarly: false,
      stripUnknown: true
    });
    
    if (error) {
      const details = error.details.map(detail => ({
        field: detail.path.join('.'),
        message: detail.message
      }));
      
      logger.warn('Request body validation error:', details);
      
      return next(new ValidationError(
        'Invalid request data', 
        details
      ));
    }
    
    // 유효성 검사를 통과한 데이터로 본문 교체
    req.body = value;
    next();
  };
};

/**
 * 요청 쿼리 파라미터 유효성 검사 미들웨어
 * @param {Object} schema - Joi 유효성 검사 스키마
 * @return {Function} Express 미들웨어
 */
const validateQuery = (schema) => {
  return (req, res, next) => {
    const logger = getContextLogger();
    
    const { error, value } = schema.validate(req.query, {
      abortEarly: false,
      stripUnknown: true
    });
    
    if (error) {
      const details = error.details.map(detail => ({
        field: detail.path.join('.'),
        message: detail.message
      }));
      
      logger.warn('Request query validation error:', details);
      
      return next(new ValidationError(
        'Invalid query parameters', 
        details
      ));
    }
    
    // 유효성 검사를 통과한 데이터로 쿼리 교체
    req.query = value;
    next();
  };
};

/**
 * 요청 경로 파라미터 유효성 검사 미들웨어
 * @param {Object} schema - Joi 유효성 검사 스키마
 * @return {Function} Express 미들웨어
 */
const validateParams = (schema) => {
  return (req, res, next) => {
    const logger = getContextLogger();
    
    const { error, value } = schema.validate(req.params, {
      abortEarly: false,
      stripUnknown: true
    });
    
    if (error) {
      const details = error.details.map(detail => ({
        field: detail.path.join('.'),
        message: detail.message
      }));
      
      logger.warn('Request params validation error:', details);
      
      return next(new ValidationError(
        'Invalid path parameters', 
        details
      ));
    }
    
    // 유효성 검사를 통과한 데이터로 파라미터 교체
    req.params = value;
    next();
  };
};

module.exports = {
  validateBody,
  validateQuery,
  validateParams
};
