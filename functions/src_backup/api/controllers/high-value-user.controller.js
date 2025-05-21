/**
 * 고가치 사용자 분석 컨트롤러
 * 새 아키텍처 패턴 기반으로 구현
 */

const BaseController = require('./base.controller');
const HighValueUserService = require('../services/high-value-user.service');
const Joi = require('joi');
const { getContextLogger } = require('../../utils/logger');

/**
 * 고가치 사용자 분석 컨트롤러 클래스
 * 고가치 사용자 관련 API 엔드포인트 처리
 */
class HighValueUserController extends BaseController {
  /**
   * 컨트롤러 생성자
   */
  constructor() {
    // 서비스 인스턴스 생성 및 부모 클래스 초기화
    const service = new HighValueUserService();
    super(service);
    
    // 로거 초기화
    this.logger = getContextLogger();
    
    // 검증 스키마 초기화
    this._initValidationSchemas();
  }

  /**
   * 검증 스키마 초기화
   * @private
   */
  _initValidationSchemas() {
    // 활성 고가치 사용자 쿼리 스키마
    this.activeUsersSchema = Joi.object({
      minNetBet: Joi.number().min(0).default(50000),
      minPlayDays: Joi.number().min(1).default(7),
      maxInactiveDays: Joi.number().min(0).default(30),
      sortBy: Joi.string()
        .valid('userId', 'userName', 'playDays', 'netBet', 'lastActivity', 'inactiveDays')
        .default('netBet'),
      sortOrder: Joi.string()
        .valid('asc', 'desc')
        .default('desc'),
      page: Joi.number().min(1).default(1),
      limit: Joi.number().min(1).max(100).default(20),
    });
    
    // 휴면 고가치 사용자 쿼리 스키마
    this.dormantUsersSchema = Joi.object({
      minNetBet: Joi.number().min(0).default(50000),
      minPlayDays: Joi.number().min(1).default(7),
      minInactiveDays: Joi.number().min(0).default(30),
      maxInactiveDays: Joi.number().min(0).allow(null),
      sortBy: Joi.string()
        .valid('userId', 'userName', 'playDays', 'netBet', 'lastActivity', 'inactiveDays')
        .default('inactiveDays'),
      sortOrder: Joi.string()
        .valid('asc', 'desc')
        .default('desc'),
      page: Joi.number().min(1).default(1),
      limit: Joi.number().min(1).max(100).default(20),
    });
    
    // 사용자 세그먼트 분석 쿼리 스키마
    this.userSegmentsSchema = Joi.object({
      minNetBet: Joi.number().min(0).default(50000),
      minPlayDays: Joi.number().min(1).default(7),
      timeRange: Joi.string()
        .valid('7d', '30d', '90d', '180d', '365d', 'all')
        .default('all'),
    });
    
    // 재활성화 대상 추천 쿼리 스키마
    this.reactivationTargetsSchema = Joi.object({
      minNetBet: Joi.number().min(0).default(50000),
      minPlayDays: Joi.number().min(1).default(7),
      minInactiveDays: Joi.number().min(0).default(30),
      maxInactiveDays: Joi.number().min(0).default(365),
      eventTypes: Joi.array().items(Joi.string()),
      page: Joi.number().min(1).default(1),
      limit: Joi.number().min(1).max(100).default(20),
    });
    
    // 사용자 상세 정보 파라미터 스키마
    this.userDetailsParamsSchema = Joi.object({
      userId: Joi.number().required().positive().integer(),
    });
    
    // 사용자 상세 정보 쿼리 스키마
    this.userDetailsQuerySchema = Joi.object({
      includeActivity: Joi.boolean().default(true),
      includeEvents: Joi.boolean().default(true),
      activityDays: Joi.number().min(1).max(365).default(30),
    });
  }

  /**
   * 활성 고가치 사용자 조회
   * @param {Request} req - Express 요청 객체
   * @param {Response} res - Express 응답 객체
   */
  getActiveHighValueUsers = this.asyncHandler(async (req, res) => {
    // 쿼리 파라미터 검증
    const options = this.validateSchema(this.activeUsersSchema, req.query);
    
    this.logger.info('Getting active high value users with options:', options);
    
    // 서비스 호출
    const result = await this.service.getActiveHighValueUsers(options);
    
    // 페이지네이션 응답 반환
    this.sendPaginated(
      res,
      result.users,
      result.page,
      result.limit,
      result.total,
      'Active high value users retrieved successfully'
    );
  });

  /**
   * 휴면 고가치 사용자 조회
   * @param {Request} req - Express 요청 객체
   * @param {Response} res - Express 응답 객체
   */
  getDormantHighValueUsers = this.asyncHandler(async (req, res) => {
    // 쿼리 파라미터 검증
    const options = this.validateSchema(this.dormantUsersSchema, req.query);
    
    this.logger.info('Getting dormant high value users with options:', options);
    
    // 서비스 호출
    const result = await this.service.getDormantHighValueUsers(options);
    
    // 페이지네이션 응답 반환
    this.sendPaginated(
      res,
      result.users,
      result.page,
      result.limit,
      result.total,
      'Dormant high value users retrieved successfully'
    );
  });

  /**
   * 사용자 세그먼트 분석
   * @param {Request} req - Express 요청 객체
   * @param {Response} res - Express 응답 객체
   */
  analyzeUserSegments = this.asyncHandler(async (req, res) => {
    // 쿼리 파라미터 검증
    const options = this.validateSchema(this.userSegmentsSchema, req.query);
    
    this.logger.info('Analyzing user segments with options:', options);
    
    // 서비스 호출
    const result = await this.service.analyzeUserSegments(options);
    
    // 성공 응답 반환
    this.sendSuccess(
      res,
      result,
      'User segment analysis completed successfully'
    );
  });

  /**
   * 사용자 상세 정보 조회
   * @param {Request} req - Express 요청 객체
   * @param {Response} res - Express 응답 객체
   */
  getUserDetails = this.asyncHandler(async (req, res) => {
    // 경로 파라미터 검증
    const { userId } = this.validateSchema(this.userDetailsParamsSchema, req.params);
    
    // 쿼리 파라미터 검증
    const options = this.validateSchema(this.userDetailsQuerySchema, req.query);
    
    this.logger.info(`Getting details for user ${userId} with options:`, options);
    
    // 서비스 호출
    const result = await this.service.getUserDetails(userId, options);
    
    // 성공 응답 반환
    this.sendSuccess(
      res,
      result,
      'User details retrieved successfully'
    );
  });

  /**
   * 재활성화 대상 사용자 추천
   * @param {Request} req - Express 요청 객체
   * @param {Response} res - Express 응답 객체
   */
  getReactivationTargets = this.asyncHandler(async (req, res) => {
    // 쿼리 파라미터 검증
    const options = this.validateSchema(this.reactivationTargetsSchema, req.query);
    
    this.logger.info('Getting reactivation targets with options:', options);
    
    // 서비스 호출
    const result = await this.service.getReactivationTargets(options);
    
    // 페이지네이션 응답 반환
    this.sendPaginated(
      res,
      result.users,
      result.page,
      result.limit,
      result.total,
      'Reactivation target users retrieved successfully'
    );
  });
}

// 싱글톤 인스턴스 생성 및 내보내기
const highValueUserController = new HighValueUserController();
module.exports = highValueUserController;
