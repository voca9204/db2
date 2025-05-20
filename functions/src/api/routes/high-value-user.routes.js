/**
 * 고가치 사용자 분석 API 라우터
 * Firebase Functions 환경에 최적화됨
 */

const express = require('express');
const router = express.Router();
const highValueUserController = require('../controllers/high-value-user.controller');
const { authenticate, authorize, devAuthenticate } = require('../middlewares/auth.middleware');
const { validateQuery, validateParams } = require('../middlewares/validation.middleware');
const { createRateLimiter } = require('../middlewares/rate-limiter.middleware');
const Joi = require('joi');

// 서버리스 환경에 최적화된 속도 제한 설정
// 콜드 스타트 및 병렬 요청 처리를 고려한 더 여유로운 설정
const standardLimiter = createRateLimiter(100, 1, {
  adminExempt: true,
  storeInDb: process.env.NODE_ENV === 'production', // 프로덕션 환경에서만 DB 저장
  skipAuthenticatedUsers: false
});

const complexLimiter = createRateLimiter(30, 1, {
  adminExempt: true,
  storeInDb: process.env.NODE_ENV === 'production',
  skipAuthenticatedUsers: false
});

// 인증 미들웨어 선택 - 개발 환경에서는 간단한 인증 사용
const authMiddleware = process.env.NODE_ENV === 'development' && process.env.AUTH_BYPASS === 'true'
  ? devAuthenticate
  : authenticate;

// 활성 고가치 사용자 쿼리 스키마
const activeUsersSchema = Joi.object({
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
  includeDepositInfo: Joi.boolean().default(false)
});

// 휴면 고가치 사용자 쿼리 스키마
const dormantUsersSchema = Joi.object({
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
  includeDepositInfo: Joi.boolean().default(false)
});

/**
 * @route   GET /api/v1/users/high-value/active
 * @desc    활성 고가치 사용자 조회
 * @access  Private (admin, analyst)
 */
router.get(
  '/active',
  authMiddleware,
  authorize(['admin', 'analyst']),
  validateQuery(activeUsersSchema),
  standardLimiter,
  highValueUserController.getActiveHighValueUsers
);

/**
 * @route   GET /api/v1/users/high-value/dormant
 * @desc    휴면 고가치 사용자 조회
 * @access  Private (admin, analyst)
 */
router.get(
  '/dormant',
  authMiddleware,
  authorize(['admin', 'analyst']),
  validateQuery(dormantUsersSchema),
  standardLimiter,
  highValueUserController.getDormantHighValueUsers
);

/**
 * @route   GET /api/v1/users/high-value/segments
 * @desc    사용자 세그먼트 분석
 * @access  Private (admin, analyst)
 */
router.get(
  '/segments',
  authMiddleware,
  authorize(['admin', 'analyst']),
  complexLimiter,
  highValueUserController.analyzeUserSegments
);

/**
 * @route   GET /api/v1/users/high-value/reactivation/targets
 * @desc    재활성화 대상 사용자 추천
 * @access  Private (admin, analyst)
 */
router.get(
  '/reactivation/targets',
  authMiddleware,
  authorize(['admin', 'analyst']),
  complexLimiter,
  highValueUserController.getReactivationTargets
);

/**
 * @route   GET /api/v1/users/high-value/:userId
 * @desc    사용자 상세 정보 조회
 * @access  Private (admin, analyst)
 */
router.get(
  '/:userId',
  authMiddleware,
  authorize(['admin', 'analyst']),
  standardLimiter,
  highValueUserController.getUserDetails
);

module.exports = router;
