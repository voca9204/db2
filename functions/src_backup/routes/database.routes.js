/**
 * 데이터베이스 API 라우터
 */

const express = require('express');
const router = express.Router();
const databaseController = require('../controllers/database.controller');
const { authenticate, authorize, devAuthenticate } = require('../middleware/auth');

// 개발 환경에서는 인증 우회, 프로덕션 환경에서는 실제 인증 사용
const authMiddleware = process.env.NODE_ENV === 'development' 
  ? devAuthenticate 
  : authenticate;

/**
 * @route   GET /api/v1/database/status
 * @desc    데이터베이스 연결 상태 확인
 * @access  Private (Admin)
 */
router.get('/status', 
  authMiddleware, 
  authorize(['admin']), 
  databaseController.checkConnectionStatus
);

/**
 * @route   GET /api/v1/database/tables
 * @desc    데이터베이스 테이블 목록 조회
 * @access  Private (Admin)
 */
router.get('/tables', 
  authMiddleware, 
  authorize(['admin']), 
  databaseController.listTables
);

/**
 * @route   GET /api/v1/database/tables/:tableName
 * @desc    테이블 구조 정보 조회
 * @access  Private (Admin)
 */
router.get('/tables/:tableName', 
  authMiddleware, 
  authorize(['admin']), 
  databaseController.getTableInfo
);

module.exports = router;
