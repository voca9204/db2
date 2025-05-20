/**
 * Firebase 서비스 계정 연결 테스트 스크립트
 * 
 * 서비스 계정 설정이 올바르게 되었는지 확인하고,
 * Firebase Admin SDK를 통해 각 서비스(Firestore, Auth, Storage 등)에
 * 접근할 수 있는지 테스트합니다.
 * 
 * 실행 방법:
 * - node scripts/firebase/test-service-account.js
 */

// 환경 변수 로드
require('dotenv').config();

// Firebase Admin SDK 초기화 모듈 불러오기
const { 
  initializeFirebaseApp, 
  getFirestore, 
  getAuth, 
  getStorage, 
  getProjectId 
} = require('../../functions/src/firebase/admin');

/**
 * 서비스 계정 연결 테스트 함수
 */
async function testServiceAccount() {
  try {
    console.log('🔍 Firebase 서비스 계정 연결 테스트 시작...');
    console.log('-------------------------------------------');
    
    // 환경 변수 확인
    const credentialsPath = process.env.GOOGLE_APPLICATION_CREDENTIALS;
    if (credentialsPath) {
      console.log(`✓ 서비스 계정 키 경로: ${credentialsPath}`);
    } else {
      console.log('⚠️ GOOGLE_APPLICATION_CREDENTIALS 환경 변수가 설정되지 않았습니다.');
      console.log('  - 기본 인증 메커니즘을 사용합니다.');
    }
    
    // Firebase 앱 초기화
    console.log('\n1️⃣ Firebase Admin SDK 초기화...');
    const app = initializeFirebaseApp();
    
    // 프로젝트 ID 확인
    const projectId = getProjectId();
    console.log(`✓ 프로젝트 ID: ${projectId}`);
    
    // Firestore 연결 테스트
    console.log('\n2️⃣ Firestore 연결 테스트...');
    try {
      const db = getFirestore();
      const testDocRef = db.collection('test').doc('service-account-test');
      await testDocRef.set({
        timestamp: new Date().toISOString(),
        message: 'Service account connection test'
      });
      console.log('✓ Firestore 쓰기 테스트: 성공');
      
      const docData = await testDocRef.get();
      if (docData.exists) {
        console.log('✓ Firestore 읽기 테스트: 성공');
      }
    } catch (error) {
      console.error('❌ Firestore 테스트 실패:', error.message);
      console.error('  - 오류 세부 정보:', error);
    }
    
    // Authentication 서비스 연결 테스트
    console.log('\n3️⃣ Authentication 서비스 연결 테스트...');
    try {
      const auth = getAuth();
      const userListResult = await auth.listUsers(1);
      console.log(`✓ Authentication 테스트: 성공 (${userListResult.users.length}명의 사용자 조회됨)`);
    } catch (error) {
      console.error('❌ Authentication 테스트 실패:', error.message);
      console.error('  - 오류 세부 정보:', error);
    }
    
    // Storage 서비스 연결 테스트
    console.log('\n4️⃣ Cloud Storage 연결 테스트...');
    try {
      const storage = getStorage();
      const bucket = storage.bucket();
      const [bucketExists] = await bucket.exists();
      
      if (bucketExists) {
        console.log(`✓ Storage 테스트: 성공 (기본 버킷 존재 확인)`);
      } else {
        console.log('⚠️ Storage 테스트: 기본 버킷이 존재하지 않습니다.');
      }
    } catch (error) {
      console.error('❌ Storage 테스트 실패:', error.message);
      console.error('  - 오류 세부 정보:', error);
    }
    
    console.log('\n-------------------------------------------');
    console.log('✅ 서비스 계정 연결 테스트 완료!');
    console.log('-------------------------------------------');
  } catch (error) {
    console.error('\n❌ 서비스 계정 테스트 실패!');
    console.error('-------------------------------------------');
    console.error('오류 메시지:', error.message);
    console.error('오류 세부 정보:', error);
    process.exit(1);
  }
}

// 테스트 실행
testServiceAccount();
