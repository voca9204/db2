/**
 * 간단한 테스트 함수
 * 기존 코드베이스와 독립적으로 작동
 */

const functions = require('firebase-functions');
const admin = require('firebase-admin');

// Firebase Admin 초기화 (호출할 때마다 한 번만 초기화됨)
try {
  admin.initializeApp();
} catch (error) {
  console.log('Firebase app already initialized');
}

// 단순 상태 확인 함수
exports.simpleHealthCheck = functions.https.onRequest((req, res) => {
  res.status(200).json({
    status: 'ok',
    timestamp: new Date().toISOString(),
    environment: process.env.NODE_ENV || 'development',
    message: 'Simple health check function is working!'
  });
});

// 활성 고가치 사용자 조회 테스트 함수
exports.testActiveUsers = functions.https.onRequest(async (req, res) => {
  try {
    // 간단한 쿼리 파라미터 추출
    const minNetBet = parseInt(req.query.minNetBet || '50000', 10);
    const limit = parseInt(req.query.limit || '10', 10);
    
    // 응답
    res.status(200).json({
      success: true,
      message: 'This is a test function for active high-value users API',
      params: {
        minNetBet,
        limit
      },
      testData: [
        {
          userId: 'test-001',
          userName: 'Test User 1',
          netBet: 250000,
          lastActivity: '2025-05-15T10:30:00Z',
          playDays: 12
        },
        {
          userId: 'test-002',
          userName: 'Test User 2',
          netBet: 180000,
          lastActivity: '2025-05-12T14:22:00Z',
          playDays: 8
        }
      ]
    });
  } catch (error) {
    console.error('Error in test function:', error);
    res.status(500).json({
      success: false,
      error: error.message
    });
  }
});

// 휴면 고가치 사용자 조회 테스트 함수
exports.testDormantUsers = functions.https.onRequest(async (req, res) => {
  try {
    // 간단한 쿼리 파라미터 추출
    const minNetBet = parseInt(req.query.minNetBet || '50000', 10);
    const minInactiveDays = parseInt(req.query.minInactiveDays || '30', 10);
    const limit = parseInt(req.query.limit || '10', 10);
    
    // 응답
    res.status(200).json({
      success: true,
      message: 'This is a test function for dormant high-value users API',
      params: {
        minNetBet,
        minInactiveDays,
        limit
      },
      testData: [
        {
          userId: 'dorm-001',
          userName: 'Dormant User 1',
          netBet: 320000,
          lastActivity: '2025-03-15T08:45:00Z',
          inactiveDays: 65,
          playDays: 25
        },
        {
          userId: 'dorm-002',
          userName: 'Dormant User 2',
          netBet: 210000,
          lastActivity: '2025-02-20T16:10:00Z',
          inactiveDays: 88,
          playDays: 18
        }
      ]
    });
  } catch (error) {
    console.error('Error in test function:', error);
    res.status(500).json({
      success: false,
      error: error.message
    });
  }
});
