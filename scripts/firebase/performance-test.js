/**
 * Firebase Functions 성능 테스트 스크립트
 * 
 * 이 스크립트는 실제 배포된 Firebase Functions의 성능을 테스트합니다.
 * 
 * 실행 방법: node scripts/firebase/performance-test.js
 */

// 필요한 모듈 불러오기
const axios = require('axios');
const fs = require('fs');
const path = require('path');

// 실제 환경 엔드포인트 설정
const PROJECT_ID = 'db888-67827';
const REGION = 'asia-northeast3';
const BASE_URL = `https://${REGION}-${PROJECT_ID}.cloudfunctions.net`;

// 헤더 설정
const headers = {
  'Content-Type': 'application/json'
};

// 테스트 설정
const NUM_REQUESTS = 10; // 각 API 당 요청 횟수
const DELAY_MS = 500;    // 요청 간 지연 시간 (ms)

// 지연 함수
const delay = (ms) => new Promise(resolve => setTimeout(resolve, ms));

/**
 * 성능 테스트 실행 함수
 */
async function runPerformanceTests() {
  console.log('🧪 Firebase Functions 성능 테스트 시작...');
  console.log('---------------------------------------------');
  
  // 결과 저장 디렉토리 생성
  const resultsDir = path.join(__dirname, '../../data/prod/results');
  if (!fs.existsSync(resultsDir)) {
    fs.mkdirSync(resultsDir, { recursive: true });
  }
  
  const performanceResults = {
    activeUsers: {
      requests: NUM_REQUESTS,
      successCount: 0,
      failureCount: 0,
      totalDuration: 0,
      avgDuration: 0,
      minDuration: Number.MAX_SAFE_INTEGER,
      maxDuration: 0,
      responseDetails: []
    },
    dormantUsers: {
      requests: NUM_REQUESTS,
      successCount: 0,
      failureCount: 0,
      totalDuration: 0,
      avgDuration: 0,
      minDuration: Number.MAX_SAFE_INTEGER,
      maxDuration: 0,
      responseDetails: []
    }
  };
  
  try {
    // 1. 활성 고가치 사용자 API 성능 테스트
    console.log(`\n1️⃣ 활성 고가치 사용자 API 성능 테스트 (${NUM_REQUESTS}회)...`);
    for (let i = 0; i < NUM_REQUESTS; i++) {
      await testActiveUsersPerformance(i, performanceResults.activeUsers);
      await delay(DELAY_MS);
    }
    
    // 통계 계산
    if (performanceResults.activeUsers.successCount > 0) {
      performanceResults.activeUsers.avgDuration = 
        performanceResults.activeUsers.totalDuration / performanceResults.activeUsers.successCount;
    }
    
    // 결과 출력
    printPerformanceResults('activeUsers', performanceResults.activeUsers);
    
    // 2. 휴면 고가치 사용자 API 성능 테스트
    console.log(`\n2️⃣ 휴면 고가치 사용자 API 성능 테스트 (${NUM_REQUESTS}회)...`);
    for (let i = 0; i < NUM_REQUESTS; i++) {
      await testDormantUsersPerformance(i, performanceResults.dormantUsers);
      await delay(DELAY_MS);
    }
    
    // 통계 계산
    if (performanceResults.dormantUsers.successCount > 0) {
      performanceResults.dormantUsers.avgDuration = 
        performanceResults.dormantUsers.totalDuration / performanceResults.dormantUsers.successCount;
    }
    
    // 결과 출력
    printPerformanceResults('dormantUsers', performanceResults.dormantUsers);
    
    // 결과 저장
    fs.writeFileSync(
      path.join(resultsDir, 'performance-results.json'),
      JSON.stringify(performanceResults, null, 2)
    );
    
    console.log('\n---------------------------------------------');
    console.log('✅ 성능 테스트가 완료되었습니다!');
    console.log('---------------------------------------------');
  } catch (error) {
    console.error('\n❌ 테스트 중 오류가 발생했습니다:', error.message);
  }
}

/**
 * 활성 고가치 사용자 API 성능 테스트
 */
async function testActiveUsersPerformance(index, results) {
  // 파라미터 설정
  const params = {
    minNetBet: 50000,
    limit: 10
  };
  
  // 쿼리스트링 생성
  const queryString = Object.entries(params)
    .map(([key, value]) => `${key}=${value}`)
    .join('&');
  
  try {
    console.log(`  테스트 ${index + 1}/${NUM_REQUESTS} 실행 중...`);
    
    const startTime = Date.now();
    const response = await axios.get(
      `${BASE_URL}/activeUsers?${queryString}`,
      { headers }
    );
    const endTime = Date.now();
    const duration = endTime - startTime;
    
    // 통계 업데이트
    results.successCount++;
    results.totalDuration += duration;
    results.minDuration = Math.min(results.minDuration, duration);
    results.maxDuration = Math.max(results.maxDuration, duration);
    
    // 응답 정보 저장
    results.responseDetails.push({
      request: index + 1,
      status: response.status,
      duration: duration,
      userCount: response.data?.data?.length || 0
    });
    
    console.log(`    ✓ 응답: ${response.status}, 소요시간: ${duration}ms`);
    return true;
  } catch (error) {
    results.failureCount++;
    
    const status = error.response?.status || 'N/A';
    const errorData = error.response?.data || error.message;
    
    console.error(`    ❌ 오류: ${status}, 메시지: ${errorData}`);
    
    // 오류 정보 저장
    results.responseDetails.push({
      request: index + 1,
      status: status,
      error: errorData,
      duration: 0
    });
    
    return false;
  }
}

/**
 * 휴면 고가치 사용자 API 성능 테스트
 */
async function testDormantUsersPerformance(index, results) {
  // 파라미터 설정
  const params = {
    minNetBet: 50000,
    minInactiveDays: 30,
    limit: 10
  };
  
  // 쿼리스트링 생성
  const queryString = Object.entries(params)
    .map(([key, value]) => `${key}=${value}`)
    .join('&');
  
  try {
    console.log(`  테스트 ${index + 1}/${NUM_REQUESTS} 실행 중...`);
    
    const startTime = Date.now();
    const response = await axios.get(
      `${BASE_URL}/dormantUsers?${queryString}`,
      { headers }
    );
    const endTime = Date.now();
    const duration = endTime - startTime;
    
    // 통계 업데이트
    results.successCount++;
    results.totalDuration += duration;
    results.minDuration = Math.min(results.minDuration, duration);
    results.maxDuration = Math.max(results.maxDuration, duration);
    
    // 응답 정보 저장
    results.responseDetails.push({
      request: index + 1,
      status: response.status,
      duration: duration,
      userCount: response.data?.data?.length || 0
    });
    
    console.log(`    ✓ 응답: ${response.status}, 소요시간: ${duration}ms`);
    return true;
  } catch (error) {
    results.failureCount++;
    
    const status = error.response?.status || 'N/A';
    const errorData = error.response?.data || error.message;
    
    console.error(`    ❌ 오류: ${status}, 메시지: ${errorData}`);
    
    // 오류 정보 저장
    results.responseDetails.push({
      request: index + 1,
      status: status,
      error: errorData,
      duration: 0
    });
    
    return false;
  }
}

/**
 * 성능 테스트 결과 출력
 */
function printPerformanceResults(apiName, results) {
  console.log('\n📊 성능 테스트 결과:');
  console.log(`  API: ${apiName}`);
  console.log(`  총 요청: ${results.requests}`);
  console.log(`  성공: ${results.successCount}`);
  console.log(`  실패: ${results.failureCount}`);
  console.log(`  평균 응답 시간: ${results.avgDuration.toFixed(2)}ms`);
  console.log(`  최소 응답 시간: ${results.minDuration}ms`);
  console.log(`  최대 응답 시간: ${results.maxDuration}ms`);
  console.log(`  성공률: ${((results.successCount / results.requests) * 100).toFixed(2)}%`);
}

// 성능 테스트 실행
runPerformanceTests().catch(error => {
  console.error('\n❌ 성능 테스트 실패!', error);
  process.exit(1);
});
