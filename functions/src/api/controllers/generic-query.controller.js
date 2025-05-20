/**
 * 범용 쿼리 API 컨트롤러
 * 다양한 필터링 및 정렬 옵션을 지원하는 범용 쿼리 API
 */

const BaseController = require('./base.controller');
const Joi = require('joi');

/**
 * 다양한 필터링 옵션을 지원하는 범용 쿼리 컨트롤러
 */
class GenericQueryController extends BaseController {
  /**
   * 컨트롤러 생성자
   * @param {Object} service - 데이터 서비스
   * @param {Object} options - 컨트롤러 옵션
   */
  constructor(service, options = {}) {
    super(service);
    this.options = options;
    
    // 컨트롤러 옵션 기본값 설정
    this.options.defaultLimit = this.options.defaultLimit || 20;
    this.options.maxLimit = this.options.maxLimit || 100;
    this.options.allowedFields = this.options.allowedFields || null;
    this.options.requiredFilters = this.options.requiredFilters || [];
    
    // 스키마 초기화
    this._initSchemas();
  }

  /**
   * 유효성 검사 스키마 초기화
   * @private
   */
  _initSchemas() {
    // 필터 오브젝트를 위한 스키마 구성
    const filterSchema = this.options.filterSchema || Joi.object().unknown(true);
    
    // 정렬 스키마
    const sortSchema = Joi.object({
      field: this.options.allowedFields 
        ? Joi.string().valid(...this.options.allowedFields)
        : Joi.string(),
      direction: Joi.string().valid('asc', 'desc').default('asc')
    }).default({ field: 'id', direction: 'asc' });
    
    // 필드 선택 스키마
    const fieldsSchema = this.options.allowedFields
      ? Joi.array().items(Joi.string().valid(...this.options.allowedFields))
      : Joi.array().items(Joi.string());
    
    // 기본 쿼리 스키마
    this.querySchema = Joi.object({
      filters: filterSchema.default({}),
      sort: sortSchema,
      page: Joi.number().integer().min(1).default(1),
      limit: Joi.number().integer().min(1).max(this.options.maxLimit).default(this.options.defaultLimit),
      fields: fieldsSchema.default([])
    });
  }

  /**
   * 범용 쿼리 처리 메서드
   * @param {Request} req - Express 요청 객체
   * @param {Response} res - Express 응답 객체
   */
  query = this.asyncHandler(async (req, res) => {
    // 요청 본문 검증
    const validatedData = this.validateSchema(this.querySchema, req.body);
    
    // 필수 필터 검증
    if (this.options.requiredFilters.length > 0) {
      const filters = validatedData.filters || {};
      
      for (const requiredFilter of this.options.requiredFilters) {
        if (filters[requiredFilter] === undefined) {
          return this.sendError(
            res, 
            `Missing required filter: ${requiredFilter}`, 
            400
          );
        }
      }
    }
    
    // 쿼리 실행
    const result = await this.service.query(validatedData);
    
    // 페이지네이션 응답 반환
    this.sendPaginated(
      res,
      result.data,
      result.page,
      result.limit,
      result.total,
      'Query executed successfully'
    );
  });

  /**
   * 집계 쿼리 처리 메서드
   * @param {Request} req - Express 요청 객체
   * @param {Response} res - Express 응답 객체
   */
  aggregate = this.asyncHandler(async (req, res) => {
    // 요청 본문 검증
    const { filters = {}, aggregations = [] } = req.body;
    
    // 필수 필터 검증
    if (this.options.requiredFilters.length > 0) {
      for (const requiredFilter of this.options.requiredFilters) {
        if (filters[requiredFilter] === undefined) {
          return this.sendError(
            res, 
            `Missing required filter: ${requiredFilter}`, 
            400
          );
        }
      }
    }
    
    // 집계 유효성 검증
    if (!Array.isArray(aggregations) || aggregations.length === 0) {
      return this.sendError(
        res, 
        'At least one aggregation is required', 
        400
      );
    }
    
    // 집계 실행
    const result = await this.service.aggregate(filters, aggregations);
    
    // 성공 응답 반환
    this.sendSuccess(
      res,
      result,
      'Aggregation executed successfully'
    );
  });
}

module.exports = GenericQueryController;
