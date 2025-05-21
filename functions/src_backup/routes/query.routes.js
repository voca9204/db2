/**
 * 범용 쿼리 API 라우터
 * 동적 쿼리 요청을 처리하는 API
 */

const express = require('express');
const router = express.Router();
const queryController = require('../controllers/query.controller');
const { authenticate, authorize, devAuthenticate } = require('../middleware/auth');

// 개발 환경에서는 인증 우회, 프로덕션 환경에서는 실제 인증 사용
const authMiddleware = process.env.NODE_ENV === 'development' 
  ? devAuthenticate 
  : authenticate;

/**
 * @route   POST /api/v1/query/analytics
 * @desc    범용 분석 쿼리 실행
 * @access  Private (Admin, Analyst)
 */
router.post('/analytics', 
  authMiddleware, 
  authorize(['admin', 'analyst']), 
  queryController.executeAnalyticsQuery
);

module.exports = router;
