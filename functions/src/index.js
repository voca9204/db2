/**
 * DB2 프로젝트 Firebase Functions
 * 
 * 고가치 사용자 분석을 위한 함수 모음
 */

const functions = require('firebase-functions');
const cors = require('cors')({ origin: true });

// 함수 런타임 옵션
const runtimeOpts = {
  timeoutSeconds: 60,
  memory: '1GB'
};

// Firebase Admin SDK 초기화
const admin = require('firebase-admin');
if (!admin.apps.length) {
  admin.initializeApp();
}

// 기존 함수 임포트
exports.helloWorld = require('./src/helloWorld').helloWorld;
exports.highValueUserReport = require('./src/highValueUserReport').highValueUserReport;
exports.highValueUsersAnalysis = require('./src/highValueUsersAnalysis').highValueUsersAnalysis;
exports.testDbConnection = require('./src/testDbConnection').testDbConnection;
exports.healthCheck = functions.https.onRequest((req, res) => {
  res.status(200).json({ status: 'ok', timestamp: new Date().toISOString() });
});

// 활성 사용자 API 엔드포인트
exports.activeUsers = require('./src/activeUsers').activeUsers;

// 휴면 사용자 API 엔드포인트
exports.dormantUsers = require('./src/dormant-users').dormantUsers;
