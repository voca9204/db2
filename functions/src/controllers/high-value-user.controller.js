/**
 * 고가치 사용자 분석 컨트롤러
 * API 요청 처리 및 응답 반환
 */

const highValueUserService = require('../services/high-value-user.service');
const { success, error, paginated } = require('../utils/response');
const { ValidationError } = require('../middleware/error-handler');
const Joi = require('joi');

// 활성 고가치 사용자 조회 요청 유효성 검사 스키마
const activeUsersSchema = Joi.object({
  minNetBet: Joi.number().min(0).default(50000),
  minPlayDays: Joi.number().min(1).default(7),
  maxInactiveDays: Joi.number().min(0).default(30),
  sortBy: Joi.string().valid('userId', 'userName', 'playDays', 'netBet', 'lastActivity', 'inactiveDays').default('netBet'),
  sortOrder: Joi.string().valid('asc', 'desc').default('desc'),
  page: Joi.number().min(1).default(1),
  limit: Joi.number().min(1).max(100).default(20),
});

// 휴면 고가치 사용자 조회 요청 유효성 검사 스키마
const dormantUsersSchema = Joi.object({
  minNetBet: Joi.number().min(0).default(50000),
  minPlayDays: Joi.number().min(1).default(7),
  minInactiveDays: Joi.number().min(0).default(30),
  maxInactiveDays: Joi.number().min(0).allow(null),
  sortBy: Joi.string().valid('userId', 'userName', 'playDays', 'netBet', 'lastActivity', 'inactiveDays').default('inactiveDays'),
  sortOrder: Joi.string().valid('asc', 'desc').default('desc'),
  page: Joi.number().min(1).default(1),
  limit: Joi.number().min(1).max(100).default(20),
});

// 사용자 세그먼트 분석 요청 유효성 검사 스키마
const userSegmentsSchema = Joi.object({
  minNetBet: Joi.number().min(0).default(50000),
  minPlayDays: Joi.number().min(1).default(7),
});

// 재활성화 대상 추천 요청 유효성 검사 스키마
const reactivationTargetsSchema = Joi.object({
  minNetBet: Joi.number().min(0).default(50000),
  minPlayDays: Joi.number().min(1).default(7),
  minInactiveDays: Joi.number().min(0).default(30),
  maxInactiveDays: Joi.number().min(0).default(365),
  page: Joi.number().min(1).default(1),
  limit: Joi.number().min(1).max(100).default(20),
});

/**
 * 활성 고가치 사용자 조회
 * @param {Request} req 요청 객체
 * @param {Response} res 응답 객체
 * @param {NextFunction} next 다음 미들웨어
 */
const getActiveHighValueUsers = async (req, res, next) => {
  try {
    // 요청 매개변수 유효성 검사
    const { error: validationErr, value: options } = activeUsersSchema.validate(req.query);
    
    if (validationErr) {
      throw new ValidationError('Invalid query parameters', validationErr.details);
    }
    
    // 서비스 호출
    const result = await highValueUserService.getActiveHighValueUsers(options);
    
    // 페이지네이션 응답 반환
    return res.json(paginated(
      result.users,
      result.page,
      result.limit,
      result.total,
      'Active high value users retrieved successfully'
    ));
  } catch (err) {
    next(err);
  }
};

/**
 * 휴면 고가치 사용자 조회
 * @param {Request} req 요청 객체
 * @param {Response} res 응답 객체
 * @param {NextFunction} next 다음 미들웨어
 */
const getDormantHighValueUsers = async (req, res, next) => {
  try {
    // 요청 매개변수 유효성 검사
    const { error: validationErr, value: options } = dormantUsersSchema.validate(req.query);
    
    if (validationErr) {
      throw new ValidationError('Invalid query parameters', validationErr.details);
    }
    
    // 서비스 호출
    const result = await highValueUserService.getDormantHighValueUsers(options);
    
    // 페이지네이션 응답 반환
    return res.json(paginated(
      result.users,
      result.page,
      result.limit,
      result.total,
      'Dormant high value users retrieved successfully'
    ));
  } catch (err) {
    next(err);
  }
};

/**
 * 사용자 세그먼트 분석
 * @param {Request} req 요청 객체
 * @param {Response} res 응답 객체
 * @param {NextFunction} next 다음 미들웨어
 */
const analyzeUserSegments = async (req, res, next) => {
  try {
    // 요청 매개변수 유효성 검사
    const { error: validationErr, value: options } = userSegmentsSchema.validate(req.query);
    
    if (validationErr) {
      throw new ValidationError('Invalid query parameters', validationErr.details);
    }
    
    // 서비스 호출
    const result = await highValueUserService.analyzeUserSegments(options);
    
    // 성공 응답 반환
    return res.json(success(
      result,
      'User segment analysis completed successfully'
    ));
  } catch (err) {
    next(err);
  }
};

/**
 * 사용자 상세 정보 조회
 * @param {Request} req 요청 객체
 * @param {Response} res 응답 객체
 * @param {NextFunction} next 다음 미들웨어
 */
const getUserDetails = async (req, res, next) => {
  try {
    const userId = parseInt(req.params.userId);
    
    if (isNaN(userId) || userId <= 0) {
      throw new ValidationError('Invalid user ID');
    }
    
    // 서비스 호출
    const result = await highValueUserService.getUserDetails(userId);
    
    // 성공 응답 반환
    return res.json(success(
      result,
      'User details retrieved successfully'
    ));
  } catch (err) {
    next(err);
  }
};

/**
 * 재활성화 대상 사용자 추천
 * @param {Request} req 요청 객체
 * @param {Response} res 응답 객체
 * @param {NextFunction} next 다음 미들웨어
 */
const getReactivationTargets = async (req, res, next) => {
  try {
    // 요청 매개변수 유효성 검사
    const { error: validationErr, value: options } = reactivationTargetsSchema.validate(req.query);
    
    if (validationErr) {
      throw new ValidationError('Invalid query parameters', validationErr.details);
    }
    
    // 서비스 호출
    const result = await highValueUserService.getReactivationTargets(options);
    
    // 페이지네이션 응답 반환
    return res.json(paginated(
      result.users,
      result.page,
      result.limit,
      result.total,
      'Reactivation target users retrieved successfully'
    ));
  } catch (err) {
    next(err);
  }
};

module.exports = {
  getActiveHighValueUsers,
  getDormantHighValueUsers,
  analyzeUserSegments,
  getUserDetails,
  getReactivationTargets,
};
