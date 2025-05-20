/**
 * Firebase Functions 스케줄링 및 실시간 업데이트 관련 함수
 */

const functions = require('firebase-functions');
const admin = require('firebase-admin');
const { getContextLogger } = require('./utils/logger');
const { analyticsStorageService, scheduledAnalyticsService, realTimeDataService } = require('./services/firestore');
const { getDormantHighValueUsers, getActiveHighValueUsers, analyzeUserSegments } = require('./services/high-value-user.service');
const { analyzeEventConversion } = require('./services/event-analysis.service');

// 로거 초기화
const logger = getContextLogger('analytics-functions');

// Firebase Admin SDK 초기화 (아직 초기화되지 않은 경우)
if (!admin.apps.length) {
  admin.initializeApp();
}

/**
 * 일일 분석 작업 실행 (매일 자정에 실행)
 */
exports.runDailyAnalytics = functions.pubsub
  .schedule('0 0 * * *')
  .timeZone('Asia/Seoul')
  .onRun(async (context) => {
    try {
      logger.info('Starting scheduled daily analytics job');
      
      // 일일 분석 작업 실행
      const result = await scheduledAnalyticsService.runDailyAnalysis();
      
      logger.info('Completed scheduled daily analytics job', { taskId: result.taskId });
      
      return result;
    } catch (error) {
      logger.error('Error in daily analytics job:', error);
      throw error;
    }
  });

/**
 * 주간 분석 작업 실행 (매주 월요일 자정에 실행)
 */
exports.runWeeklyAnalytics = functions.pubsub
  .schedule('0 0 * * 1')
  .timeZone('Asia/Seoul')
  .onRun(async (context) => {
    try {
      logger.info('Starting scheduled weekly analytics job');
      
      // 주간 분석 작업 실행
      const result = await scheduledAnalyticsService.runWeeklyAnalysis();
      
      logger.info('Completed scheduled weekly analytics job', { taskId: result.taskId });
      
      return result;
    } catch (error) {
      logger.error('Error in weekly analytics job:', error);
      throw error;
    }
  });

/**
 * 월간 분석 작업 실행 (매월 1일 자정에 실행)
 */
exports.runMonthlyAnalytics = functions.pubsub
  .schedule('0 0 1 * *')
  .timeZone('Asia/Seoul')
  .onRun(async (context) => {
    try {
      logger.info('Starting scheduled monthly analytics job');
      
      // 월간 분석 작업 실행
      const result = await scheduledAnalyticsService.runMonthlyAnalysis();
      
      logger.info('Completed scheduled monthly analytics job', { taskId: result.taskId });
      
      return result;
    } catch (error) {
      logger.error('Error in monthly analytics job:', error);
      throw error;
    }
  });

/**
 * 만료된 캐시 정리 작업 (매시간 실행)
 */
exports.cleanupExpiredCache = functions.pubsub
  .schedule('0 * * * *')
  .timeZone('Asia/Seoul')
  .onRun(async (context) => {
    try {
      logger.info('Starting cache cleanup job');
      
      // 만료된 캐시 정리
      const count = await analyticsStorageService.cleanupExpiredCache();
      
      logger.info(`Cleaned up ${count} expired cache items`);
      
      return { count };
    } catch (error) {
      logger.error('Error in cache cleanup job:', error);
      throw error;
    }
  });

/**
 * 고가치 사용자 데이터 실시간 동기화 (Firestore 트리거)
 */
exports.syncHighValueUserData = functions.firestore
  .document('highValueUsers/{userId}')
  .onWrite(async (change, context) => {
    try {
      const { userId } = context.params;
      
      // 문서가 삭제된 경우
      if (!change.after.exists) {
        logger.info(`High value user document deleted: ${userId}`);
        return null;
      }
      
      const userData = change.after.data();
      
      // 메타데이터 업데이트
      if (userId === 'latest') {
        logger.info('High value users metadata updated');
        
        // FCM 토픽으로 알림 발송 (선택적)
        try {
          await realTimeDataService.sendDataUpdateNotification('analytics_updates', {
            type: 'highValueUsers',
            timestamp: new Date().toISOString(),
            summary: {
              userCount: userData.userCount || 0,
              activeCount: userData.activeCount || 0,
              dormantCount: userData.dormantCount || 0
            }
          });
        } catch (error) {
          logger.warn('Failed to send notification:', error);
        }
        
        return null;
      }
      
      // 개별 고가치 사용자 데이터 변경
      logger.info(`High value user data updated: ${userId}`);
      
      // 추가 작업 (예: 다른 시스템에 연동, 알림 발송 등)
      
      return null;
    } catch (error) {
      logger.error('Error in syncHighValueUserData:', error);
      throw error;
    }
  });

/**
 * 이벤트 분석 데이터 실시간 동기화 (Firestore 트리거)
 */
exports.syncEventAnalyticsData = functions.firestore
  .document('eventAnalytics/{eventId}')
  .onWrite(async (change, context) => {
    try {
      const { eventId } = context.params;
      
      // 문서가 삭제된 경우
      if (!change.after.exists) {
        logger.info(`Event analytics document deleted: ${eventId}`);
        return null;
      }
      
      const eventData = change.after.data();
      
      // 메타데이터 업데이트
      if (eventId === 'latest') {
        logger.info('Event analytics metadata updated');
        
        // FCM 토픽으로 알림 발송 (선택적)
        try {
          await realTimeDataService.sendDataUpdateNotification('analytics_updates', {
            type: 'eventAnalytics',
            timestamp: new Date().toISOString(),
            summary: {
              eventCount: eventData.eventCount || 0,
              totalParticipants: eventData.totalParticipants || 0,
              avgConversionRate: eventData.avgConversionRate || 0
            }
          });
        } catch (error) {
          logger.warn('Failed to send notification:', error);
        }
        
        return null;
      }
      
      // 개별 이벤트 분석 데이터 변경
      logger.info(`Event analytics data updated: ${eventId}`);
      
      // 추가 작업 (예: 다른 시스템에 연동, 알림 발송 등)
      
      return null;
    } catch (error) {
      logger.error('Error in syncEventAnalyticsData:', error);
      throw error;
    }
  });

/**
 * HTTP 엔드포인트 - 고가치 사용자 분석 실행
 */
exports.analyzeHighValueUsers = functions.https.onRequest(async (req, res) => {
  try {
    // CORS 헤더 설정
    res.set('Access-Control-Allow-Origin', '*');
    
    if (req.method === 'OPTIONS') {
      // CORS 프리플라이트 요청 처리
      res.set('Access-Control-Allow-Methods', 'GET, POST, OPTIONS');
      res.set('Access-Control-Allow-Headers', 'Content-Type, Authorization');
      res.status(204).send('');
      return;
    }
    
    // 인증 검사
    const authHeader = req.get('Authorization');
    if (!authHeader || !authHeader.startsWith('Bearer ')) {
      res.status(401).json({ error: 'Unauthorized' });
      return;
    }
    
    const idToken = authHeader.split('Bearer ')[1];
    
    try {
      await admin.auth().verifyIdToken(idToken);
    } catch (error) {
      logger.warn('Invalid auth token:', error);
      res.status(401).json({ error: 'Invalid auth token' });
      return;
    }
    
    // 분석 실행 파라미터
    const params = req.method === 'POST' ? req.body : req.query;
    
    const minNetBet = parseInt(params.minNetBet || 50000, 10);
    const minPlayDays = parseInt(params.minPlayDays || 7, 10);
    const maxInactiveDays = parseInt(params.maxInactiveDays || 30, 10);
    
    // 1. 활성 고가치 사용자 조회
    const activeUsersResult = await getActiveHighValueUsers({
      minNetBet,
      minPlayDays,
      maxInactiveDays,
      page: 1,
      limit: 1000 // 전체 데이터 조회
    });
    
    // 2. 휴면 고가치 사용자 조회
    const dormantUsersResult = await getDormantHighValueUsers({
      minNetBet,
      minPlayDays,
      minInactiveDays: maxInactiveDays,
      page: 1,
      limit: 1000 // 전체 데이터 조회
    });
    
    // 3. Firestore에 고가치 사용자 데이터 저장
    await analyticsStorageService.saveHighValueUsers([
      ...activeUsersResult.users,
      ...dormantUsersResult.users
    ], {
      activeCount: activeUsersResult.total,
      dormantCount: dormantUsersResult.total,
      totalCount: activeUsersResult.total + dormantUsersResult.total,
      analysisCriteria: {
        minNetBet,
        minPlayDays,
        inactiveDaysThreshold: maxInactiveDays
      }
    });
    
    // 4. 사용자 세그먼트 분석 수행
    const segmentAnalysisResult = await analyzeUserSegments({
      minNetBet,
      minPlayDays
    });
    
    // 5. Firestore에 세그먼트 분석 데이터 저장
    await analyticsStorageService.saveUserSegments(segmentAnalysisResult);
    
    // 응답 반환
    res.status(200).json({
      success: true,
      timestamp: new Date().toISOString(),
      data: {
        activeUsers: {
          count: activeUsersResult.total,
          samples: activeUsersResult.users.slice(0, 10) // 샘플 데이터 (처음 10개만)
        },
        dormantUsers: {
          count: dormantUsersResult.total,
          samples: dormantUsersResult.users.slice(0, 10) // 샘플 데이터 (처음 10개만)
        },
        totalUsers: activeUsersResult.total + dormantUsersResult.total,
        segmentAnalysis: segmentAnalysisResult
      }
    });
  } catch (error) {
    logger.error('Error in analyzeHighValueUsers HTTP endpoint:', error);
    res.status(500).json({
      success: false,
      error: error.message
    });
  }
});

/**
 * HTTP 엔드포인트 - 이벤트 효과 분석 실행
 */
exports.analyzeEventEffects = functions.https.onRequest(async (req, res) => {
  try {
    // CORS 헤더 설정
    res.set('Access-Control-Allow-Origin', '*');
    
    if (req.method === 'OPTIONS') {
      // CORS 프리플라이트 요청 처리
      res.set('Access-Control-Allow-Methods', 'GET, POST, OPTIONS');
      res.set('Access-Control-Allow-Headers', 'Content-Type, Authorization');
      res.status(204).send('');
      return;
    }
    
    // 인증 검사
    const authHeader = req.get('Authorization');
    if (!authHeader || !authHeader.startsWith('Bearer ')) {
      res.status(401).json({ error: 'Unauthorized' });
      return;
    }
    
    const idToken = authHeader.split('Bearer ')[1];
    
    try {
      await admin.auth().verifyIdToken(idToken);
    } catch (error) {
      logger.warn('Invalid auth token:', error);
      res.status(401).json({ error: 'Invalid auth token' });
      return;
    }
    
    // 분석 실행 파라미터
    const params = req.method === 'POST' ? req.body : req.query;
    
    const startDate = params.startDate || null;
    const endDate = params.endDate || null;
    const minParticipants = parseInt(params.minParticipants || 5, 10);
    
    // 이벤트 효과 분석 수행
    const eventAnalysisResult = await analyzeEventConversion({
      startDate,
      endDate,
      minParticipants
    });
    
    // Firestore에 이벤트 분석 데이터 저장
    const { eventConversions } = eventAnalysisResult;
    
    if (eventConversions && eventConversions.length > 0) {
      await analyticsStorageService.saveEventAnalytics(eventConversions, {
        analysisDate: new Date().toISOString(),
        period: startDate && endDate ? `${startDate}_to_${endDate}` : 'last_30_days',
        totalEvents: eventConversions.length
      });
    }
    
    // 전환율 메트릭 저장
    if (eventAnalysisResult.dormancyAnalysis) {
      await analyticsStorageService.saveConversionMetrics({
        dormancyAnalysis: eventAnalysisResult.dormancyAnalysis,
        totalEvents: eventConversions ? eventConversions.length : 0,
        period: startDate && endDate ? `${startDate}_to_${endDate}` : 'last_30_days',
        timestamp: new Date().toISOString()
      });
    }
    
    // 응답 반환
    res.status(200).json({
      success: true,
      timestamp: new Date().toISOString(),
      data: eventAnalysisResult
    });
  } catch (error) {
    logger.error('Error in analyzeEventEffects HTTP endpoint:', error);
    res.status(500).json({
      success: false,
      error: error.message
    });
  }
});

/**
 * HTTP 엔드포인트 - 실시간 데이터 푸시 알림 전송
 */
exports.sendDataNotification = functions.https.onRequest(async (req, res) => {
  try {
    // CORS 헤더 설정
    res.set('Access-Control-Allow-Origin', '*');
    
    if (req.method === 'OPTIONS') {
      // CORS 프리플라이트 요청 처리
      res.set('Access-Control-Allow-Methods', 'POST, OPTIONS');
      res.set('Access-Control-Allow-Headers', 'Content-Type, Authorization');
      res.status(204).send('');
      return;
    }
    
    // POST 요청만 허용
    if (req.method !== 'POST') {
      res.status(405).json({ error: 'Method not allowed' });
      return;
    }
    
    // 인증 검사
    const authHeader = req.get('Authorization');
    if (!authHeader || !authHeader.startsWith('Bearer ')) {
      res.status(401).json({ error: 'Unauthorized' });
      return;
    }
    
    const idToken = authHeader.split('Bearer ')[1];
    
    try {
      await admin.auth().verifyIdToken(idToken);
    } catch (error) {
      logger.warn('Invalid auth token:', error);
      res.status(401).json({ error: 'Invalid auth token' });
      return;
    }
    
    // 요청 파라미터 검증
    const { topic, data } = req.body;
    
    if (!topic || !data) {
      res.status(400).json({ error: 'Missing required parameters' });
      return;
    }
    
    // 알림 전송
    const result = await realTimeDataService.sendDataUpdateNotification(topic, data);
    
    // 응답 반환
    res.status(200).json({
      success: true,
      messageId: result.messageId
    });
  } catch (error) {
    logger.error('Error in sendDataNotification HTTP endpoint:', error);
    res.status(500).json({
      success: false,
      error: error.message
    });
  }
});
