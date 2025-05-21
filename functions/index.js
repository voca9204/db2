/**
 * Firebase Functions - DB2 프로젝트
 * 
 * Firebase Functions를 통해 제공되는 API 엔드포인트들을 정의합니다.
 * 검증 프레임워크를 통해 검증된 최신 버전입니다.
 */

// 환경 변수 로드
require('dotenv').config();

const functions = require('firebase-functions');
const admin = require('firebase-admin');
const cors = require('cors')({origin: true});
const { getFirebaseApp } = require('./src/firebase/firebase-admin');

// Firebase 초기화 (싱글턴 패턴)
getFirebaseApp();

// 고가치 사용자 분석 API 임포트
const highValueUsersAnalysis = require('./src/highValueUsersAnalysis').highValueUsersAnalysis;
const highValueUserReport = require('./src/highValueUserReport').highValueUserReport;
const { highValueUsersApi } = require('./src/high-value-users-api');

// 수정된 JOIN 조건(p.userId = gs.userId)이 적용된 활성 및 휴면 고가치 사용자 API 임포트
const { activeUsers } = require('./src/active-users-fixed');
const { dormantUsers } = require('./src/dormant-users-fixed');

// API 엔드포인트 내보내기
exports.highValueUsersAnalysis = functions.https.onRequest((req, res) => {
  cors(req, res, () => {
    highValueUsersAnalysis(req, res);
  });
});

exports.highValueUserReport = functions.https.onRequest((req, res) => {
  cors(req, res, () => {
    highValueUserReport(req, res);
  });
});

exports.highValueUsersApi = functions.https.onRequest((req, res) => {
  // CORS 헤더 직접 설정
  res.set('Access-Control-Allow-Origin', '*');
  res.set('Access-Control-Allow-Methods', 'GET, POST, OPTIONS');
  res.set('Access-Control-Allow-Headers', 'Content-Type, Authorization, X-Requested-With');
  
  if (req.method === 'OPTIONS') {
    res.status(204).send('');
    return;
  }
  
  return highValueUsersApi(req, res);
});

// 수정된 함수 내보내기 (이전 버전과의 호환성 유지)
exports.activeUsers = activeUsers;
exports.dormantUsers = dormantUsers;

// 데이터베이스 연결 테스트 함수 추가
const testDbConnection = require('./src/testDbConnection').testDbConnection;
exports.testDbConnection = testDbConnection;

// Hello World 함수 추가
exports.helloWorld = functions.https.onRequest((req, res) => {
  res.json({
    message: 'Hello World!',
    timestamp: new Date().toISOString(),
    version: '1.0.0'
  });
});

// 기본 상태 확인 엔드포인트
exports.healthCheck = functions.https.onRequest((req, res) => {
  res.json({
    status: 'ok',
    timestamp: new Date().toISOString(),
    message: 'DB2 Analytics API is running',
    version: '1.0.0'
  });
});

// 웜업 함수 - 콜드 스타트 방지
exports.warmupFunctions = functions.pubsub
  .schedule('every 5 minutes')
  .onRun(async (context) => {
    try {
      console.log('Warmup function executed successfully at', new Date().toISOString());
      return null;
    } catch (error) {
      console.error('Warmup failed:', error);
      return null;
    }
  });
