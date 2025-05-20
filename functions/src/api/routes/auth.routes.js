/**
 * 인증 API 라우터
 * Firebase Authentication 기반 인증 관련 API
 */

const express = require('express');
const router = express.Router();
const authController = require('../controllers/auth.controller');
const { validateBody } = require('../middlewares/validation.middleware');
const { createRateLimiter } = require('../middlewares/rate-limiter.middleware');
const { authenticate } = require('../middlewares/auth.middleware');

// 인증 요청 속도 제한 (DoS 방지)
const authLimiter = createRateLimiter(15, 1, { 
  storeInDb: process.env.NODE_ENV === 'production',
  skipAuthenticatedUsers: false
});

// 비밀번호 재설정 요청 속도 제한 (더 엄격하게 설정)
const passwordResetLimiter = createRateLimiter(5, 1, { 
  storeInDb: process.env.NODE_ENV === 'production',
  skipAuthenticatedUsers: false
});

/**
 * @swagger
 * /auth/register:
 *   post:
 *     summary: 새 사용자 등록
 *     description: 이메일과 비밀번호로 새 사용자를 등록합니다.
 *     tags: 
 *       - 인증
 *     requestBody:
 *       required: true
 *       content:
 *         application/json:
 *           schema:
 *             type: object
 *             required:
 *               - email
 *               - password
 *             properties:
 *               email:
 *                 type: string
 *                 format: email
 *               password:
 *                 type: string
 *                 minLength: 8
 *               displayName:
 *                 type: string
 *     responses:
 *       201:
 *         description: 사용자 등록 성공
 *       400:
 *         description: 유효하지 않은 요청 데이터
 *       409:
 *         description: 이미 등록된 이메일
 */
router.post('/register',
  authLimiter,
  validateBody({
    email: { type: 'string', format: 'email', required: true },
    password: { type: 'string', minLength: 8, required: true },
    displayName: { type: 'string', optional: true }
  }),
  authController.register
);

/**
 * @swagger
 * /auth/login:
 *   post:
 *     summary: 사용자 로그인
 *     description: 이메일과 비밀번호로 로그인하고 인증 토큰을 발급받습니다.
 *     tags: 
 *       - 인증
 *     requestBody:
 *       required: true
 *       content:
 *         application/json:
 *           schema:
 *             type: object
 *             required:
 *               - email
 *               - password
 *             properties:
 *               email:
 *                 type: string
 *                 format: email
 *               password:
 *                 type: string
 *     responses:
 *       200:
 *         description: 로그인 성공
 *       400:
 *         description: 유효하지 않은 요청 데이터
 *       401:
 *         description: 인증 실패
 */
router.post('/login',
  authLimiter,
  validateBody({
    email: { type: 'string', format: 'email', required: true },
    password: { type: 'string', required: true }
  }),
  authController.login
);

/**
 * @swagger
 * /auth/reset-password:
 *   post:
 *     summary: 비밀번호 재설정 이메일 발송
 *     description: 사용자 이메일로 비밀번호 재설정 링크를 발송합니다.
 *     tags: 
 *       - 인증
 *     requestBody:
 *       required: true
 *       content:
 *         application/json:
 *           schema:
 *             type: object
 *             required:
 *               - email
 *             properties:
 *               email:
 *                 type: string
 *                 format: email
 *     responses:
 *       200:
 *         description: 비밀번호 재설정 이메일 발송 성공
 *       400:
 *         description: 유효하지 않은 요청 데이터
 */
router.post('/reset-password',
  passwordResetLimiter,
  validateBody({
    email: { type: 'string', format: 'email', required: true }
  }),
  authController.resetPassword
);

/**
 * @swagger
 * /auth/verify-token:
 *   post:
 *     summary: 토큰 유효성 검증
 *     description: 인증 토큰의 유효성을 검증합니다.
 *     tags: 
 *       - 인증
 *     security:
 *       - bearerAuth: []
 *     responses:
 *       200:
 *         description: 유효한 토큰
 *       401:
 *         description: 유효하지 않은 토큰
 */
router.post('/verify-token',
  authenticate,
  authController.verifyToken
);

/**
 * @swagger
 * /auth/refresh-token:
 *   post:
 *     summary: 토큰 갱신
 *     description: 새로운 인증 토큰을 발급받습니다.
 *     tags: 
 *       - 인증
 *     requestBody:
 *       required: true
 *       content:
 *         application/json:
 *           schema:
 *             type: object
 *             required:
 *               - refreshToken
 *             properties:
 *               refreshToken:
 *                 type: string
 *     responses:
 *       200:
 *         description: 토큰 갱신 성공
 *       400:
 *         description: 유효하지 않은 요청 데이터
 *       401:
 *         description: 유효하지 않은 리프레시 토큰
 */
router.post('/refresh-token',
  authLimiter,
  validateBody({
    refreshToken: { type: 'string', required: true }
  }),
  authController.refreshToken
);

/**
 * @swagger
 * /auth/change-password:
 *   post:
 *     summary: 비밀번호 변경
 *     description: 현재 로그인한 사용자의 비밀번호를 변경합니다.
 *     tags: 
 *       - 인증
 *     security:
 *       - bearerAuth: []
 *     requestBody:
 *       required: true
 *       content:
 *         application/json:
 *           schema:
 *             type: object
 *             required:
 *               - currentPassword
 *               - newPassword
 *             properties:
 *               currentPassword:
 *                 type: string
 *               newPassword:
 *                 type: string
 *                 minLength: 8
 *     responses:
 *       200:
 *         description: 비밀번호 변경 성공
 *       400:
 *         description: 유효하지 않은 요청 데이터
 *       401:
 *         description: 현재 비밀번호가 일치하지 않음
 */
router.post('/change-password',
  authenticate,
  passwordResetLimiter,
  validateBody({
    currentPassword: { type: 'string', required: true },
    newPassword: { type: 'string', minLength: 8, required: true }
  }),
  authController.changePassword
);

module.exports = router;
