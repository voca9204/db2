/**
 * 기본 컨트롤러 클래스
 * 모든 컨트롤러의 기본이 되는 추상 클래스
 */

const { getContextLogger } = require('../../utils/logger');

/**
 * 모든 컨트롤러의 기본 클래스
 * 공통 응답 처리 및 오류 처리 기능 제공
 */
class BaseController {
  /**
   * 컨트롤러 생성자
   * @param {Object} service - 서비스 객체
   */
  constructor(service = null) {
    this.service = service;
    this.logger = getContextLogger();
  }

  /**
   * 비동기 컨트롤러 함수를 위한 오류 처리 래퍼
   * @param {Function} fn - 래핑할 비동기 함수
   * @return {Function} 래핑된 미들웨어 함수
   */
  asyncHandler(fn) {
    return async (req, res, next) => {
      try {
        await fn(req, res, next);
      } catch (error) {
        next(error);
      }
    };
  }

  /**
   * 성공 응답 반환
   * @param {Response} res - Express 응답 객체
   * @param {*} data - 응답 데이터
   * @param {string} message - 성공 메시지
   * @param {number} statusCode - HTTP 상태 코드
   * @return {Response} Express 응답
   */
  sendSuccess(res, data, message = 'Success', statusCode = 200) {
    return res.status(statusCode).json({
      success: true,
      message,
      data
    });
  }

  /**
   * 페이지네이션 응답 반환
   * @param {Response} res - Express 응답 객체
   * @param {Array} data - 페이지네이션된 데이터
   * @param {number} page - 현재 페이지
   * @param {number} limit - 페이지당 항목 수
   * @param {number} total - 총 항목 수
   * @param {string} message - 성공 메시지
   * @return {Response} Express 응답
   */
  sendPaginated(res, data, page, limit, total, message = 'Success') {
    return res.status(200).json({
      success: true,
      message,
      data,
      pagination: {
        page,
        limit,
        total,
        pages: Math.ceil(total / limit)
      }
    });
  }

  /**
   * 오류 응답 반환
   * @param {Response} res - Express 응답 객체
   * @param {string} message - 오류 메시지
   * @param {number} statusCode - HTTP 상태 코드
   * @param {*} errors - 상세 오류 정보
   * @return {Response} Express 응답
   */
  sendError(res, message = 'Error', statusCode = 500, errors = null) {
    return res.status(statusCode).json({
      success: false,
      message,
      errors,
      statusCode
    });
  }

  /**
   * 요청 매개변수 유효성 검사
   * @param {Object} schema - Joi 스키마
   * @param {Object} data - 검사할 데이터
   * @return {Object} 유효성 검사 결과
   */
  validateSchema(schema, data) {
    const { error, value } = schema.validate(data);
    
    if (error) {
      this.logger.warn('Validation error:', error);
      
      const errors = error.details.map(detail => ({
        field: detail.context?.key || 'unknown',
        message: detail.message
      }));
      
      throw {
        statusCode: 400,
        message: 'Validation Error',
        errors
      };
    }
    
    return value;
  }
}

module.exports = BaseController;
