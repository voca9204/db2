/**
 * Firebase Functions - DB2 프로젝트
 * 
 * Firebase Functions를 통해 제공되는 API 엔드포인트들을 정의합니다.
 */

const functions = require('firebase-functions');
const admin = require('firebase-admin');

// Firebase 초기화
admin.initializeApp();

// 고가치 사용자 분석 API 임포트
const highValueUsersAnalysis = require('./highValueUsersAnalysis').highValueUsersAnalysis;

// API 엔드포인트 내보내기
exports.highValueUsersAnalysis = highValueUsersAnalysis;

// 기본 상태 확인 엔드포인트
exports.healthCheck = functions.region('asia-northeast3').https.onRequest((req, res) => {
  res.json({
    status: 'ok',
    timestamp: new Date().toISOString(),
    message: 'DB2 Analytics API is running',
    version: '1.0.0'
  });
});

// 활성 고가치 사용자 API
exports.activeUsers = functions.region('asia-northeast3').https.onRequest((req, res) => {
  // 실제 구현은 별도 파일로 분리하는 것이 좋습니다.
  // 현재는 healthCheck와 유사한 응답을 반환
  res.json({
    success: true,
    message: "Active high-value users API",
    params: {
      minNetBet: parseInt(req.query.minNetBet || '50000', 10),
      limit: parseInt(req.query.limit || '10', 10)
    },
    data: [
      {
        userId: "user-001",
        userName: "User 1",
        netBet: 250000,
        lastActivity: "2025-05-15T10:30:00Z",
        playDays: 12
      },
      {
        userId: "user-002",
        userName: "User 2",
        netBet: 180000,
        lastActivity: "2025-05-12T14:22:00Z",
        playDays: 8
      }
    ]
  });
});

// 휴면 고가치 사용자 API
exports.dormantUsers = functions.region('asia-northeast3').https.onRequest((req, res) => {
  // 실제 구현은 별도 파일로 분리하는 것이 좋습니다.
  // 현재는 healthCheck와 유사한 응답을 반환
  res.json({
    success: true,
    message: "Dormant high-value users API",
    params: {
      minNetBet: parseInt(req.query.minNetBet || '50000', 10),
      minInactiveDays: parseInt(req.query.minInactiveDays || '30', 10),
      limit: parseInt(req.query.limit || '10', 10)
    },
    data: [
      {
        userId: "user-101",
        userName: "Dormant User 1",
        netBet: 320000,
        lastActivity: "2025-03-15T08:45:00Z",
        inactiveDays: 65,
        playDays: 25
      },
      {
        userId: "user-102",
        userName: "Dormant User 2",
        netBet: 210000,
        lastActivity: "2025-02-20T16:10:00Z",
        inactiveDays: 88,
        playDays: 18
      }
    ]
  });
});
