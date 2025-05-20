/**
 * Firebase 에뮬레이터 테스트 스크립트
 * 
 * 에뮬레이터 환경에서 배포된 Firebase Functions를 테스트합니다.
 * - 상태 확인 API
 * - 활성 고가치 사용자 API
 * - 휴면 고가치 사용자 API
 * 
 * 실행 방법:
 * - 먼저 Firebase 에뮬레이터 실행: firebase emulators:start
 * - 다른 터미널에서 실행: node scripts/firebase/test-emulator.js
 */

// 필요한 모듈 불러오기
const axios = require('axios');
const fs = require('fs');
const path = require('path');

// 에뮬레이터 엔드포인트 설정
const FUNCTIONS_EMULATOR_HOST = process.env.FUNCTIONS_EMULATOR_HOST || 'localhost:5001';
const PROJECT_ID = 'db888-67827';
const REGION = 'asia-northeast3';
const BASE_URL = `http://${FUNCTIONS_EMULATOR_HOST}/${PROJECT_ID}/${REGION}`;

// API 기본 URL
const API_BASE_URL = `${BASE_URL}/api/v1`;

// 헤더 설정
const headers = {
  'Content-Type': 'application/json',
  'Authorization': 'Bearer test-token'
};

/**
 * 에뮬레이터 테스트 함수
 */
async function testEmulator() {
  console.log('🧪 Firebase Functions 에뮬레이터 테스트 시작...');
  console.log('---------------------------------------------');
  console.log(`📍 기본 URL: ${BASE_URL}`);
  console.log('---------------------------------------------');
  
  // 에뮬레이터 상태 확인
  try {
    await checkEmulatorStatus();
  } catch (error) {
    console.error('❌ 에뮬레이터가 실행 중이지 않거나 접근할 수 없습니다.');
    console.error('  - 다음 명령어로 에뮬레이터를 실행하세요: firebase emulators:start');
    process.exit(1);
  }
  
  // 결과 저장 디렉토리 생성
  const resultsDir = path.join(__dirname, '../../data/test/results');
  if (!fs.existsSync(resultsDir)) {
    fs.mkdirSync(resultsDir, { recursive: true });
  }
  
  try {
    // 1. 상태 확인 API 테스트
    await testHealthCheck();
    
    // 2. 활성 고가치 사용자 API 테스트
    await testActiveUsers();
    
    // 3. 휴면 고가치 사용자 API 테스트
    await testDormantUsers();
    
    // 4. 사용자 세그먼트 API 테스트
    await testUserSegments();
    
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
 * 에뮬레이터 상태 확인
 */
async function checkEmulatorStatus() {
  try {
    // 에뮬레이터 UI에 접근하여 상태 확인
    await axios.get(`http://localhost:4000/`);
    console.log('✓ 에뮬레이터가 실행 중입니다.');
    return true;
  } catch (error) {
    if (error.code === 'ECONNREFUSED') {
      console.error('❌ 에뮬레이터에 연결할 수 없습니다.');
      throw new Error('에뮬레이터에 연결할 수 없습니다.');
    }
    throw error;
  }
}

/**
 * 상태 확인 API 테스트
 */
async function testHealthCheck() {
  console.log('\n1️⃣ 상태 확인 API 테스트...');
  
  try {
    // healthCheck 함수 호출
    const response = await axios.get(`${BASE_URL}/healthCheck`);
    
    // 결과 출력
    console.log('✓ 상태 확인 API 응답:');
    console.log(`  - 상태: ${response.status} ${response.statusText}`);
    console.log(`  - 메시지: ${response.data.message}`);
    console.log(`  - 타임스탬프: ${response.data.timestamp}`);
    
    // 결과 저장
    fs.writeFileSync(
      path.join(__dirname, '../../data/test/results/health-check-result.json'),
      JSON.stringify(response.data, null, 2)
    );
    
    return true;
  } catch (error) {
    console.error('❌ 상태 확인 API 오류:', error.message);
    if (error.response) {
      console.error('  - 응답 상태:', error.response.status);
      console.error('  - 응답 데이터:', error.response.data);
    }
    throw error;
  }
}

/**
 * 활성 고가치 사용자 API 테스트
 */
async function testActiveUsers() {
  console.log('\n2️⃣ 활성 고가치 사용자 API 테스트...');
  
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
      `${API_BASE_URL}/users/high-value/active?${queryString}`,
      { headers }
    );
    
    // 결과 출력
    console.log('✓ 활성 고가치 사용자 API 응답:');
    console.log(`  - 상태: ${response.status} ${response.statusText}`);
    console.log(`  - 사용자 수: ${response.data.data?.length || 0}명`);
    
    if (response.data.data?.length > 0) {
      const firstUser = response.data.data[0];
      console.log('  - 첫 번째 사용자 예시:');
      console.log(`    • ID: ${firstUser.userId}`);
      console.log(`    • 이름: ${firstUser.userName}`);
      console.log(`    • 베팅액: ${firstUser.netBet}`);
      console.log(`    • 마지막 활동: ${firstUser.lastActivity}`);
    }
    
    // 결과 저장
    fs.writeFileSync(
      path.join(__dirname, '../../data/test/results/active-users-result.json'),
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
  console.log('\n3️⃣ 휴면 고가치 사용자 API 테스트...');
  
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
      `${API_BASE_URL}/users/high-value/dormant?${queryString}`,
      { headers }
    );
    
    // 결과 출력
    console.log('✓ 휴면 고가치 사용자 API 응답:');
    console.log(`  - 상태: ${response.status} ${response.statusText}`);
    console.log(`  - 사용자 수: ${response.data.data?.length || 0}명`);
    
    if (response.data.data?.length > 0) {
      const firstUser = response.data.data[0];
      console.log('  - 첫 번째 사용자 예시:');
      console.log(`    • ID: ${firstUser.userId}`);
      console.log(`    • 이름: ${firstUser.userName}`);
      console.log(`    • 베팅액: ${firstUser.netBet}`);
      console.log(`    • 휴면 기간: ${firstUser.inactiveDays}일`);
    }
    
    // 결과 저장
    fs.writeFileSync(
      path.join(__dirname, '../../data/test/results/dormant-users-result.json'),
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

/**
 * 사용자 세그먼트 API 테스트
 */
async function testUserSegments() {
  console.log('\n4️⃣ 사용자 세그먼트 API 테스트...');
  
  try {
    // API 호출
    const response = await axios.get(
      `${API_BASE_URL}/users/high-value/segments`,
      { headers }
    );
    
    // 결과 출력
    console.log('✓ 사용자 세그먼트 API 응답:');
    console.log(`  - 상태: ${response.status} ${response.statusText}`);
    
    if (response.data.segments) {
      console.log('  - 세그먼트 정보:');
      Object.entries(response.data.segments).forEach(([segment, info]) => {
        console.log(`    • ${segment}: ${info.count}명, 전환율: ${(info.conversionRate * 100).toFixed(1)}%`);
      });
    }
    
    // 결과 저장
    fs.writeFileSync(
      path.join(__dirname, '../../data/test/results/user-segments-result.json'),
      JSON.stringify(response.data, null, 2)
    );
    
    return true;
  } catch (error) {
    console.error('❌ 사용자 세그먼트 API 오류:', error.message);
    if (error.response) {
      console.error('  - 응답 상태:', error.response.status);
      console.error('  - 응답 데이터:', error.response.data);
    }
    throw error;
  }
}

// 테스트 실행
testEmulator().catch(error => {
  console.error('\n❌ 에뮬레이터 테스트 실패!', error);
  process.exit(1);
});
