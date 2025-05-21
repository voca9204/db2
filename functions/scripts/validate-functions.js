/**
 * Firebase Functions 검증 스크립트
 * 
 * 이 스크립트는 Firebase Functions 배포 전 API 엔드포인트의 유효성을 검증합니다.
 * 각 엔드포인트가 올바르게 설정되었는지 확인하고, 기본적인 응답을 테스트합니다.
 */

const axios = require('axios');
const functions = require('firebase-functions');
const { execSync } = require('child_process');
const fs = require('fs');
const path = require('path');

// 기본 URL 설정 (로컬 테스트용)
const BASE_URL = process.env.TEST_BASE_URL || 'http://localhost:5001/db888-67827/us-central1';

// 배포된 URL (프로덕션 테스트용)
const PROD_URL = 'https://us-central1-db888-67827.cloudfunctions.net';

// 검증할 엔드포인트 설정
const ENDPOINTS = [
  {
    name: 'activeUsers',
    path: '/activeUsers',
    method: 'GET',
    params: { minNetBet: 1000, limit: 5 },
    expectedStatus: 200,
    responseValidation: (data) => {
      return data && data.success === true && Array.isArray(data.data);
    }
  },
  {
    name: 'dormantUsers',
    path: '/dormantUsers',
    method: 'GET',
    params: { minNetBet: 1000, limit: 5 },
    expectedStatus: 200,
    responseValidation: (data) => {
      return data && data.success === true && Array.isArray(data.data);
    }
  },
  {
    name: 'healthCheck',
    path: '/healthCheck',
    method: 'GET',
    params: {},
    expectedStatus: 200,
    responseValidation: (data) => {
      return data && data.status === 'ok';
    }
  }
];

/**
 * Firebase 에뮬레이터가 실행 중인지 확인
 */
async function checkEmulatorRunning() {
  try {
    console.log('🔍 Firebase 에뮬레이터 상태 확인 중...');
    
    const response = await axios.get('http://localhost:4000/emulator/v1/projects/db888-67827');
    if (response.status === 200) {
      console.log('✅ Firebase 에뮬레이터가 실행 중입니다.');
      return true;
    }
  } catch (error) {
    console.log('❌ Firebase 에뮬레이터가 실행되고 있지 않습니다.');
    console.log('⚠️ 에뮬레이터를 시작하려면 "firebase emulators:start" 명령어를 실행하세요.');
    return false;
  }
  
  return false;
}

/**
 * index.js 파일에서 정의된 함수 확인
 */
function checkExportedFunctions() {
  try {
    console.log('🔍 index.js에서 내보낸 함수 확인 중...');
    
    const indexPath = path.join(__dirname, '..', 'index.js');
    const indexContent = fs.readFileSync(indexPath, 'utf8');
    
    const exportedFunctions = [];
    const exportRegex = /exports\.(\w+)\s*=/g;
    let match;
    
    while ((match = exportRegex.exec(indexContent)) !== null) {
      exportedFunctions.push(match[1]);
    }
    
    console.log('📋 내보낸 함수 목록:');
    exportedFunctions.forEach(func => console.log(`  - ${func}`));
    
    // 필수 함수가 내보내졌는지 확인
    const requiredFunctions = ['activeUsers', 'dormantUsers', 'healthCheck'];
    const missingFunctions = requiredFunctions.filter(func => !exportedFunctions.includes(func));
    
    if (missingFunctions.length > 0) {
      console.log('⚠️ 다음 필수 함수가 내보내지지 않았습니다:');
      missingFunctions.forEach(func => console.log(`  - ${func}`));
      return false;
    } else {
      console.log('✅ 모든 필수 함수가 내보내졌습니다.');
      return true;
    }
  } catch (error) {
    console.error('❌ 내보낸 함수 확인 중 오류 발생:', error);
    return false;
  }
}

/**
 * 엔드포인트 테스트
 */
async function testEndpoint(endpoint, baseUrl) {
  console.log(`🔍 ${endpoint.name} 엔드포인트 테스트 중...`);
  
  try {
    const url = `${baseUrl}${endpoint.path}`;
    const config = {
      method: endpoint.method,
      url,
      params: endpoint.params,
      timeout: 10000
    };
    
    console.log(`  📡 요청: ${config.method} ${url}`);
    console.log(`  📦 파라미터:`, config.params);
    
    const response = await axios(config);
    
    console.log(`  📥 응답 상태: ${response.status}`);
    console.log(`  📊 응답 데이터 샘플:`, JSON.stringify(response.data).substring(0, 200) + '...');
    
    // 상태 코드 검증
    if (response.status !== endpoint.expectedStatus) {
      console.log(`  ❌ 상태 코드 오류: 예상 ${endpoint.expectedStatus}, 실제 ${response.status}`);
      return false;
    }
    
    // 응답 데이터 검증
    if (!endpoint.responseValidation(response.data)) {
      console.log(`  ❌ 응답 데이터 검증 실패`);
      return false;
    }
    
    console.log(`  ✅ ${endpoint.name} 엔드포인트 테스트 성공`);
    return true;
  } catch (error) {
    console.log(`  ❌ ${endpoint.name} 엔드포인트 테스트 실패:`, error.message);
    if (error.response) {
      console.log(`  📥 응답 상태: ${error.response.status}`);
      console.log(`  📊 응답 데이터:`, error.response.data);
    }
    return false;
  }
}

/**
 * 모든 엔드포인트 테스트
 */
async function testAllEndpoints(baseUrl) {
  console.log(`\n📋 ${baseUrl} 에서 모든 엔드포인트 테스트 시작`);
  
  let allSuccess = true;
  
  for (const endpoint of ENDPOINTS) {
    const success = await testEndpoint(endpoint, baseUrl);
    allSuccess = allSuccess && success;
  }
  
  return allSuccess;
}

/**
 * 메인 검증 함수
 */
async function validateFunctions() {
  console.log('🚀 Firebase Functions 검증 시작\n');
  
  // 내보낸 함수 확인
  const functionsExported = checkExportedFunctions();
  if (!functionsExported) {
    return false;
  }
  
  // 에뮬레이터 확인
  const emulatorRunning = await checkEmulatorRunning();
  let testSuccess = false;
  
  if (emulatorRunning) {
    // 에뮬레이터에서 테스트
    testSuccess = await testAllEndpoints(BASE_URL);
  } else {
    console.log('⚠️ 에뮬레이터가 실행되고 있지 않아 로컬 테스트를 건너뜁니다.');
  }
  
  // 프로덕션 환경에서 테스트 (선택적)
  if (process.env.TEST_PRODUCTION === 'true') {
    const prodSuccess = await testAllEndpoints(PROD_URL);
    testSuccess = testSuccess && prodSuccess;
  }
  
  if (testSuccess) {
    console.log('\n✅ 모든 검증이 성공적으로 완료되었습니다.');
    return true;
  } else {
    console.log('\n❌ 일부 검증이 실패했습니다. 로그를 확인해주세요.');
    return false;
  }
}

// 스크립트가 직접 실행된 경우
if (require.main === module) {
  validateFunctions()
    .then(success => {
      if (!success) {
        process.exit(1);
      }
    })
    .catch(error => {
      console.error('검증 중 오류 발생:', error);
      process.exit(1);
    });
}

module.exports = { validateFunctions, testEndpoint, checkExportedFunctions };
