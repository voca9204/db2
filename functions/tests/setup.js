/**
 * 단위 테스트 설정
 * Firebase Functions 테스트 환경 구성
 */

const functions = require('firebase-functions-test');
const admin = require('firebase-admin');
const path = require('path');

// 환경 변수 로드
require('dotenv').config({
  path: path.resolve(__dirname, '../.env.test')
});

// 테스트 중인 기능에서 사용 중인 Firebase 프로젝트 ID
const PROJECT_ID = 'my-test-project';

// Functions 테스트 초기화
const testEnv = functions({
  projectId: PROJECT_ID,
}, path.resolve(__dirname, '../serviceAccountKey.json'));

// Admin SDK 목업
const adminInitStub = jest.spyOn(admin, 'initializeApp').mockImplementation();

// Firestore 목업
const firestoreMock = {
  collection: jest.fn().mockReturnThis(),
  doc: jest.fn().mockReturnThis(),
  set: jest.fn().mockResolvedValue({}),
  update: jest.fn().mockResolvedValue({}),
  delete: jest.fn().mockResolvedValue({}),
  get: jest.fn().mockResolvedValue({
    exists: true,
    data: () => ({}),
  }),
};

// Admin SDK 목업 설정
jest.spyOn(admin, 'firestore').mockReturnValue(firestoreMock);

// 테스트 환경 및 목업 내보내기
module.exports = {
  testEnv,
  adminInitStub,
  firestoreMock,
  admin,
  cleanup: () => {
    testEnv.cleanup();
    adminInitStub.mockRestore();
  },
};
