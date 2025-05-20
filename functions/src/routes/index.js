/**
 * API 라우터
 * 모든 API 라우트 통합
 */

const express = require('express');
const router = express.Router();
const { createVersionedRouter } = require('../api/utils/version-router');

// 버전별 라우터 생성
const v1Router = createVersionedRouter('v1');

// 라우터 임포트
const highValueUserRoutes = require('../api/routes/high-value-user.routes');
const eventAnalysisRoutes = require('./event-analysis.routes');
const queryRoutes = require('./query.routes');
const databaseRoutes = require('./database.routes');
const docsRoutes = require('../api/routes/docs.routes');
const userRoutes = require('../api/routes/user.routes');

// 로깅 및 모니터링 미들웨어 임포트
const { requestLogger } = require('../utils/logger');
const performanceMonitoring = require('../middleware/performance-monitoring');

// 공통 미들웨어 적용
v1Router.use(requestLogger);
v1Router.use(performanceMonitoring);

// API 상태 확인 엔드포인트
v1Router.get('/health', (req, res) => {
  res.status(200).json({
    status: 'ok',
    version: 'v1',
    timestamp: new Date().toISOString(),
    environment: process.env.NODE_ENV || 'development',
    region: process.env.FUNCTIONS_REGION || 'unknown'
  });
});

// API 문서 엔드포인트
v1Router.get('/docs', (req, res) => {
  res.status(200).json({
    message: 'API documentation available at /api/v1/docs/swagger',
    version: 'v1',
    endpoints: {
      users: '/api/v1/users',
      events: '/api/v1/events',
      query: '/api/v1/query',
      analytics: '/api/v1/analytics',
      dashboard: '/api/v1/dashboard'
    }
  });
});

// v1 라우트 설정
v1Router.use('/users/high-value', require('../api/routes/high-value-user.routes'));
v1Router.use('/users', userRoutes);
v1Router.use('/events', eventAnalysisRoutes);
v1Router.use('/query', queryRoutes);
v1Router.use('/db', databaseRoutes);
v1Router.use('/docs', docsRoutes);

// 대시보드 데이터 라우트
v1Router.get('/dashboard/summary', (req, res, next) => {
  // 임시 응답 - 향후 구현 예정
  res.status(200).json({
    success: true,
    message: 'Dashboard summary endpoint - Implementation in progress',
    data: {
      activeUsers: 0,
      dormantUsers: 0,
      conversionRate: 0,
      lastUpdated: new Date().toISOString()
    }
  });
});

// 기본 API 라우터에 버전별 라우터 통합
router.use('/v1', v1Router);

// 최신 버전을 기본 경로로 설정
router.use('/', v1Router);

module.exports = router;
