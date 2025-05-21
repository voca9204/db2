/**
 * 고가치 사용자 분석 API 라우터
 */

const express = require('express');
const router = express.Router();
const highValueUserController = require('../controllers/high-value-user.controller');
const { authenticate, authorize, devAuthenticate } = require('../middleware/auth');

// 개발 환경에서는 인증 우회, 프로덕션 환경에서는 실제 인증 사용
const authMiddleware = process.env.NODE_ENV === 'development' 
  ? devAuthenticate 
  : authenticate;

/**
 * @route   GET /api/v1/users/high-value/active
 * @desc    활성 고가치 사용자 조회
 * @access  Private
 */
router.get('/active', 
  authMiddleware, 
  authorize(['admin', 'analyst']), 
  highValueUserController.getActiveHighValueUsers
);

/**
 * @route   GET /api/v1/users/high-value/dormant
 * @desc    휴면 고가치 사용자 조회
 * @access  Private
 */
router.get('/dormant', 
  authMiddleware, 
  authorize(['admin', 'analyst']), 
  highValueUserController.getDormantHighValueUsers
);

/**
 * @route   GET /api/v1/users/high-value/segments
 * @desc    사용자 세그먼트 분석
 * @access  Private
 */
router.get('/segments', 
  authMiddleware, 
  authorize(['admin', 'analyst']), 
  highValueUserController.analyzeUserSegments
);

/**
 * @route   GET /api/v1/users/high-value/:userId
 * @desc    사용자 상세 정보 조회
 * @access  Private
 */
router.get('/:userId', 
  authMiddleware, 
  authorize(['admin', 'analyst']), 
  highValueUserController.getUserDetails
);

/**
 * @route   GET /api/v1/users/high-value/reactivation/targets
 * @desc    재활성화 대상 사용자 추천
 * @access  Private
 */
router.get('/reactivation/targets', 
  authMiddleware, 
  authorize(['admin', 'analyst']), 
  highValueUserController.getReactivationTargets
);

module.exports = router;
