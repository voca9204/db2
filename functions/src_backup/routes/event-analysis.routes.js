/**
 * 이벤트 분석 API 라우터
 */

const express = require('express');
const router = express.Router();
const eventAnalysisController = require('../controllers/event-analysis.controller');
const { authenticate, authorize, devAuthenticate } = require('../middleware/auth');

// 개발 환경에서는 인증 우회, 프로덕션 환경에서는 실제 인증 사용
const authMiddleware = process.env.NODE_ENV === 'development' 
  ? devAuthenticate 
  : authenticate;

/**
 * @route   GET /api/v1/events
 * @desc    이벤트 목록 조회
 * @access  Private
 */
router.get('/', 
  authMiddleware, 
  authorize(['admin', 'analyst']), 
  eventAnalysisController.getEvents
);

/**
 * @route   GET /api/v1/events/:eventId/analysis
 * @desc    이벤트 상세 분석 조회
 * @access  Private
 */
router.get('/:eventId/analysis', 
  authMiddleware, 
  authorize(['admin', 'analyst']), 
  eventAnalysisController.getEventAnalysis
);

/**
 * @route   GET /api/v1/events/analysis/conversion
 * @desc    이벤트 전환율 분석
 * @access  Private
 */
router.get('/analysis/conversion', 
  authMiddleware, 
  authorize(['admin', 'analyst']), 
  eventAnalysisController.analyzeEventConversion
);

module.exports = router;
