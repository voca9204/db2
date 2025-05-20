/**
 * Firebase Functions 실제 환경 테스트 스크립트
 * 
 * 이 스크립트는 실제 배포된 Firebase Functions를 테스트합니다.
 * 
 * 실행 방법: node scripts/firebase/test-production.js
 */

// 필요한 모듈 불러오기
const axios = require('axios');
const fs = require('fs');
const path = require('path');

// 실제 환경 엔드포인트 설정
const PROJECT_ID = 'db888-67827';
const REGION = 'asia-northeast3';
const BASE_URL = `https://${REGION}-${PROJECT_ID}.cloudfunctions.net`;

// API 기본 URL
const API_BASE_URL = `${BASE_URL}/api/v1`;

// 헤더 설정 (필요시 인증 토큰 추가)
const headers = {
  'Content-Type': 'application/json'
};

/**
 * 실제 환경 테스트 함수
 */
async function testProduction() {
  console.log('🧪 Firebase Functions 실제 환경 테스트 시작...');
  console.log('---------------------------------------------');
  console.log(`📍 기본 URL: ${BASE_URL}`);
  console.log('---------------------------------------------');
  
  // 결과 저장 디렉토리 생성
  const resultsDir = path.join(__dirname, '../../data/prod/results');
  if (!fs.existsSync(resultsDir)) {
    fs.mkdirSync(resultsDir, { recursive: true });
  }
  
  try {
    // 1. 활성 고가치 사용자 API 테스트
    await testActiveUsers();
    
    // 2. 휴면 고가치 사용자 API 테스트
    await testDormantUsers();
    
    console.log('\n---------------------------------------------');
    console.log('✅ 모든 테스트가 완료되었습니다!');
    console.log('---------------------------------------------');
  } catch (error) {
    console.error('\n❌ 테스트 중 오류가 발생했습니다:', error.message);
    if (error.response) {
      console.error('응답 상태:', error.response.status);
      console.error('응답 데이터:', error.response.data);
    }
  }
}

/**
 * 활성 고가치 사용자 API 테스트
 */
async function testActiveUsers() {
  console.log('\n1️⃣ 활성 고가치 사용자 API 테스트...');
  
  try {
    // 기본 파라미터 설정
    const params = {
      minNetBet: 50000,
      minPlayDays: 5,
      limit: 10,
      includeDepositInfo: true
    };
    
    // API 호출
    const queryString = Object.entries(params)
      .map(([key, value]) => `${key}=${value}`)
      .join('&');
    
    const response = await axios.get(
      `${BASE_URL}/activeUsers?${queryString}`,
      { headers }
    );
    
    // 결과 출력
    console.log('✓ 활성 고가치 사용자 API 응답:');
    console.log(`  - 상태: ${response.status} ${response.statusText}`);
    console.log(`  - 데이터 유형: ${typeof response.data}`);
    
    if (response.data) {
      if (Array.isArray(response.data.data)) {
        console.log(`  - 사용자 수: ${response.data.data.length}명`);
        
        if (response.data.data.length > 0) {
          const firstUser = response.data.data[0];
          console.log('  - 첫 번째 사용자 예시:');
          console.log(`    • ID: ${firstUser.userId}`);
          console.log(`    • 이름: ${firstUser.userName || '이름 없음'}`);
          console.log(`    • 베팅액: ${firstUser.netBet}`);
          console.log(`    • 마지막 활동: ${firstUser.lastActivity}`);
        }
      } else {
        console.log('  - 응답 구조:');
        console.log(JSON.stringify(response.data, null, 2).substring(0, 500) + '...');
      }
    }
    
    // 결과 저장
    fs.writeFileSync(
      path.join(__dirname, '../../data/prod/results/active-users-result.json'),
      JSON.stringify(response.data, null, 2)
    );
    
    return true;
  } catch (error) {
    console.error('❌ 활성 고가치 사용자 API 오류:', error.message);
    if (error.response) {
      console.error('  - 응답 상태:', error.response.status);
      console.error('  - 응답 데이터:', error.response.data);
    }
    throw error;
  }
}

/**
 * 휴면 고가치 사용자 API 테스트
 */
async function testDormantUsers() {
  console.log('\n2️⃣ 휴면 고가치 사용자 API 테스트...');
  
  try {
    // 기본 파라미터 설정
    const params = {
      minNetBet: 50000,
      minInactiveDays: 30,
      maxInactiveDays: 180,
      limit: 10,
      includeDepositInfo: true
    };
    
    // API 호출
    const queryString = Object.entries(params)
      .map(([key, value]) => `${key}=${value}`)
      .join('&');
    
    const response = await axios.get(
      `${BASE_URL}/dormantUsers?${queryString}`,
      { headers }
    );
    
    // 결과 출력
    console.log('✓ 휴면 고가치 사용자 API 응답:');
    console.log(`  - 상태: ${response.status} ${response.statusText}`);
    console.log(`  - 데이터 유형: ${typeof response.data}`);
    
    if (response.data) {
      if (Array.isArray(response.data.data)) {
        console.log(`  - 사용자 수: ${response.data.data.length}명`);
        
        if (response.data.data.length > 0) {
          const firstUser = response.data.data[0];
          console.log('  - 첫 번째 사용자 예시:');
          console.log(`    • ID: ${firstUser.userId}`);
          console.log(`    • 이름: ${firstUser.userName || '이름 없음'}`);
          console.log(`    • 베팅액: ${firstUser.netBet}`);
          console.log(`    • 휴면 기간: ${firstUser.inactiveDays}일`);
        }
      } else {
        console.log('  - 응답 구조:');
        console.log(JSON.stringify(response.data, null, 2).substring(0, 500) + '...');
      }
    }
    
    // 결과 저장
    fs.writeFileSync(
      path.join(__dirname, '../../data/prod/results/dormant-users-result.json'),
      JSON.stringify(response.data, null, 2)
    );
    
    return true;
  } catch (error) {
    console.error('❌ 휴면 고가치 사용자 API 오류:', error.message);
    if (error.response) {
      console.error('  - 응답 상태:', error.response.status);
      console.error('  - 응답 데이터:', error.response.data);
    }
    throw error;
  }
}

// 테스트 실행
testProduction().catch(error => {
  console.error('\n❌ 실제 환경 테스트 실패!', error);
  process.exit(1);
});
