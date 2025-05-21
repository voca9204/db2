/**
 * Firebase Admin SDK 초기화 모듈
 * 
 * 싱글톤 패턴을 사용하여 Firebase Admin SDK의 초기화를 관리하고
 * 중복 초기화 문제를 방지합니다.
 */

const admin = require('firebase-admin');
const logger = console; // 간단하게 시작하기 위해 콘솔 사용

// Firebase 앱 인스턴스 (싱글톤)
let firebaseApp = null;

/**
 * Firebase Admin SDK 초기화 함수
 * 싱글톤 패턴으로 구현하여 중복 초기화 방지
 * @param {Object} options 초기화 옵션 (선택적)
 * @return {Object} Firebase 앱 인스턴스
 */
function getFirebaseApp(options = {}) {
  if (firebaseApp) {
    logger.debug('Returning existing Firebase app instance');
    return firebaseApp;
  }
  
  try {
    // 환경 변수 확인 및 디버그 정보 로깅
    const projectId = process.env.PROJECT_ID || process.env.GCLOUD_PROJECT;
    logger.debug(`Initializing Firebase app with project ID: ${projectId || 'default'}`);
    
    // 초기화 옵션이 제공된 경우 사용
    if (Object.keys(options).length > 0) {
      firebaseApp = admin.initializeApp(options);
    } else {
      // 기본 옵션으로 초기화 (GCP 환경에서는 자동으로 인증 정보를 찾음)
      firebaseApp = admin.initializeApp();
    }
    
    logger.info('Firebase Admin SDK initialized successfully');
    return firebaseApp;
  } catch (error) {
    // 이미 초기화된 앱이 있는 경우
    if (error.code === 'app/duplicate-app') {
      logger.warn('Firebase app already initialized, retrieving existing app');
      firebaseApp = admin.app();
      return firebaseApp;
    }
    
    // 그 외 초기화 오류
    logger.error('Error initializing Firebase app:', error);
    throw error;
  }
}

/**
 * Firestore 인스턴스 반환
 * 앱이 초기화되지 않은 경우 자동으로 초기화
 * @return {Object} Firestore 인스턴스
 */
function getFirestore() {
  getFirebaseApp();
  return admin.firestore();
}

/**
 * Authentication 인스턴스 반환
 * 앱이 초기화되지 않은 경우 자동으로 초기화
 * @return {Object} Auth 인스턴스
 */
function getAuth() {
  getFirebaseApp();
  return admin.auth();
}

/**
 * Storage 인스턴스 반환
 * 앱이 초기화되지 않은 경우 자동으로 초기화
 * @return {Object} Storage 인스턴스
 */
function getStorage() {
  getFirebaseApp();
  return admin.storage();
}

/**
 * 메시징 인스턴스 반환
 * 앱이 초기화되지 않은 경우 자동으로 초기화
 * @return {Object} Messaging 인스턴스
 */
function getMessaging() {
  getFirebaseApp();
  return admin.messaging();
}

/**
 * 현재 사용 중인 프로젝트 ID
 * @return {string} 프로젝트 ID
 */
function getProjectId() {
  getFirebaseApp();
  return admin.app().options.projectId;
}

/**
 * Firebase 앱이 초기화되었는지 확인
 * @return {boolean} 초기화 여부
 */
function isInitialized() {
  try {
    admin.app();
    return true;
  } catch (error) {
    return false;
  }
}

// 모듈 내보내기
module.exports = {
  getFirebaseApp,
  getFirestore,
  getAuth,
  getStorage,
  getMessaging,
  getProjectId,
  isInitialized,
  admin
};
