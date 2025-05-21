/**
 * 사용자 관리 라우터
 * Firebase Authentication 사용자 관리 기능 제공
 */

const express = require('express');
const router = express.Router();
const { authenticate, authorize } = require('../middlewares/auth.middleware');
const userController = require('../controllers/user.controller');
const Joi = require('joi');
const { validateBody } = require('../middlewares/validation.middleware');
const { createRateLimiter } = require('../middlewares/rate-limiter.middleware');

// 속도 제한 설정
const standardLimiter = createRateLimiter(100, 1);
const userCreationLimiter = createRateLimiter(20, 1);

// 사용자 생성 유효성 검사 스키마
const createUserSchema = Joi.object({
  email: Joi.string().email().required(),
  password: Joi.string().min(8).required(),
  displayName: Joi.string().min(3).required(),
  roles: Joi.array().items(Joi.string()).default(['user']),
  disabled: Joi.boolean().default(false)
});

// 사용자 업데이트 유효성 검사 스키마
const updateUserSchema = Joi.object({
  email: Joi.string().email(),
  password: Joi.string().min(8),
  displayName: Joi.string().min(3),
  roles: Joi.array().items(Joi.string()),
  disabled: Joi.boolean()
}).min(1);

/**
 * @route   GET /api/v1/users
 * @desc    사용자 목록 조회
 * @access  Private (admin)
 */
router.get(
  '/',
  authenticate,
  authorize(['admin']),
  standardLimiter,
  userController.listUsers
);

/**
 * @route   POST /api/v1/users
 * @desc    새 사용자 생성
 * @access  Private (admin)
 */
router.post(
  '/',
  authenticate,
  authorize(['admin']),
  validateBody(createUserSchema),
  userCreationLimiter,
  userController.createUser
);

/**
 * @route   GET /api/v1/users/:uid
 * @desc    사용자 정보 조회
 * @access  Private (admin)
 */
router.get(
  '/:uid',
  authenticate,
  authorize(['admin']),
  standardLimiter,
  userController.getUser
);

/**
 * @route   PUT /api/v1/users/:uid
 * @desc    사용자 정보 업데이트
 * @access  Private (admin)
 */
router.put(
  '/:uid',
  authenticate,
  authorize(['admin']),
  validateBody(updateUserSchema),
  standardLimiter,
  userController.updateUser
);

/**
 * @route   DELETE /api/v1/users/:uid
 * @desc    사용자 삭제
 * @access  Private (admin)
 */
router.delete(
  '/:uid',
  authenticate,
  authorize(['admin']),
  standardLimiter,
  userController.deleteUser
);

/**
 * @route   GET /api/v1/users/me
 * @desc    현재 인증된 사용자 정보 조회
 * @access  Private
 */
router.get(
  '/me',
  authenticate,
  standardLimiter,
  userController.getCurrentUser
);

/**
 * @route   PUT /api/v1/users/me
 * @desc    현재 인증된 사용자 정보 업데이트
 * @access  Private
 */
router.put(
  '/me',
  authenticate,
  validateBody(Joi.object({
    displayName: Joi.string().min(3),
  }).min(1)),
  standardLimiter,
  userController.updateCurrentUser
);

module.exports = router;
