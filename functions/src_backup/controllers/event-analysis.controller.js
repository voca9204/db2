/**
 * 이벤트 분석 컨트롤러
 * API 요청 처리 및 응답 반환
 */

const eventAnalysisService = require('../services/event-analysis.service');
const { success, error, paginated } = require('../utils/response');
const { ValidationError } = require('../middleware/error-handler');
const Joi = require('joi');

// 이벤트 목록 조회 요청 유효성 검사 스키마
const eventsSchema = Joi.object({
  startDate: Joi.date().iso(),
  endDate: Joi.date().iso().min(Joi.ref('startDate')),
  status: Joi.string().valid('upcoming', 'active', 'completed'),
  sortBy: Joi.string().valid('eventId', 'eventName', 'startDate', 'endDate', 'participantCount').default('startDate'),
  sortOrder: Joi.string().valid('asc', 'desc').default('desc'),
  page: Joi.number().min(1).default(1),
  limit: Joi.number().min(1).max(100).default(20),
});

// 이벤트 전환율 분석 요청 유효성 검사 스키마
const eventConversionSchema = Joi.object({
  startDate: Joi.date().iso(),
  endDate: Joi.date().iso().min(Joi.ref('startDate')),
  minParticipants: Joi.number().min(1).default(10),
});

/**
 * 이벤트 목록 조회
 * @param {Request} req 요청 객체
 * @param {Response} res 응답 객체
 * @param {NextFunction} next 다음 미들웨어
 */
const getEvents = async (req, res, next) => {
  try {
    // 요청 매개변수 유효성 검사
    const { error: validationErr, value: options } = eventsSchema.validate(req.query);
    
    if (validationErr) {
      throw new ValidationError('Invalid query parameters', validationErr.details);
    }
    
    // 서비스 호출
    const result = await eventAnalysisService.getEvents(options);
    
    // 페이지네이션 응답 반환
    return res.json(paginated(
      result.events,
      result.page,
      result.limit,
      result.total,
      'Events retrieved successfully'
    ));
  } catch (err) {
    next(err);
  }
};

/**
 * 이벤트 상세 분석 조회
 * @param {Request} req 요청 객체
 * @param {Response} res 응답 객체
 * @param {NextFunction} next 다음 미들웨어
 */
const getEventAnalysis = async (req, res, next) => {
  try {
    const eventId = parseInt(req.params.eventId);
    
    if (isNaN(eventId) || eventId <= 0) {
      throw new ValidationError('Invalid event ID');
    }
    
    // 서비스 호출
    const result = await eventAnalysisService.getEventAnalysis(eventId);
    
    // 성공 응답 반환
    return res.json(success(
      result,
      'Event analysis retrieved successfully'
    ));
  } catch (err) {
    next(err);
  }
};

/**
 * 이벤트 전환율 분석
 * @param {Request} req 요청 객체
 * @param {Response} res 응답 객체
 * @param {NextFunction} next 다음 미들웨어
 */
const analyzeEventConversion = async (req, res, next) => {
  try {
    // 요청 매개변수 유효성 검사
    const { error: validationErr, value: options } = eventConversionSchema.validate(req.query);
    
    if (validationErr) {
      throw new ValidationError('Invalid query parameters', validationErr.details);
    }
    
    // 서비스 호출
    const result = await eventAnalysisService.analyzeEventConversion(options);
    
    // 성공 응답 반환
    return res.json(success(
      result,
      'Event conversion analysis completed successfully'
    ));
  } catch (err) {
    next(err);
  }
};

module.exports = {
  getEvents,
  getEventAnalysis,
  analyzeEventConversion,
};
