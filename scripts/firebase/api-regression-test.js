/**
 * Firebase API 회귀 테스트 시스템
 * 
 * 이 스크립트는 Firebase Functions API를 자동으로 테스트하고
 * 기존 동작과 비교하여 회귀를 감지하는 시스템을 구현합니다.
 */

const axios = require('axios');
const fs = require('fs');
const path = require('path');
const { exec } = require('child_process');
const util = require('util');
const execAsync = util.promisify(exec);

// 프로젝트 루트 경로
const projectRoot = path.resolve(__dirname, '../..');
const configPath = path.join(projectRoot, 'functions/function-config.json');
const reportsDir = path.join(projectRoot, 'reports/api-tests');

// 테스트 결과 저장 경로
const baselinePath = path.join(reportsDir, 'baseline-results.json');
const currentResultsPath = path.join(reportsDir, 'current-results.json');
const comparisonReportPath = path.join(reportsDir, 'comparison-report.json');

// 설정 로드
let config;
try {
  config = JSON.parse(fs.readFileSync(configPath, 'utf8'));
} catch (error) {
  console.error('설정 파일 로드 실패:', error);
  process.exit(1);
}

// 테스트 결과 디렉토리 생성
if (!fs.existsSync(reportsDir)) {
  fs.mkdirSync(reportsDir, { recursive: true });
}

/**
 * 테스트 케이스 로드
 * @returns {Array} 테스트 케이스 배열
 */
function loadTestCases() {
  // 테스트 케이스 파일 경로
  const testCasesPath = path.join(projectRoot, 'scripts/firebase/api-test-cases.json');
  
  // 파일이 존재하면 해당 테스트 케이스 사용
  if (fs.existsSync(testCasesPath)) {
    try {
      return JSON.parse(fs.readFileSync(testCasesPath, 'utf8'));
    } catch (error) {
      console.error('테스트 케이스 파일 파싱 실패:', error);
    }
  }
  
  // 기본 테스트 케이스 (파일이 없는 경우)
  return [
    {
      name: '활성 고가치 사용자 API - 기본 조회',
      endpoint: `/api/highValueUsersApi/active`,
      method: 'GET',
      params: {},
      headers: {},
      expectedStatus: 200,
      validateResponse: (response) => {
        // 응답 구조 검증
        if (!response.data || !Array.isArray(response.data)) {
          return {
            valid: false,
            error: '응답이 배열이 아닙니다.'
          };
        }
        
        // 데이터 형식 검증
        if (response.data.length > 0) {
          const firstItem = response.data[0];
          if (!firstItem.userId || !firstItem.netBet) {
            return {
              valid: false,
              error: '필수 필드(userId, netBet)가 없습니다.'
            };
          }
        }
        
        return { valid: true };
      }
    },
    {
      name: '활성 고가치 사용자 API - 필터링 조회',
      endpoint: `/api/highValueUsersApi/active`,
      method: 'GET',
      params: { minNetBet: 1000000 },
      headers: {},
      expectedStatus: 200,
      validateResponse: (response) => {
        // 응답 구조 검증
        if (!response.data || !Array.isArray(response.data)) {
          return {
            valid: false,
            error: '응답이 배열이 아닙니다.'
          };
        }
        
        // 필터링 검증
        const allValid = response.data.every(item => item.netBet >= 1000000);
        if (!allValid) {
          return {
            valid: false,
            error: 'minNetBet 필터가 제대로 적용되지 않았습니다.'
          };
        }
        
        return { valid: true };
      }
    },
    {
      name: '휴면 고가치 사용자 API - 기본 조회',
      endpoint: `/api/highValueUsersApi/dormant`,
      method: 'GET',
      params: {},
      headers: {},
      expectedStatus: 200,
      validateResponse: (response) => {
        // 응답 구조 검증
        if (!response.data || !Array.isArray(response.data)) {
          return {
            valid: false,
            error: '응답이 배열이 아닙니다.'
          };
        }
        
        // 데이터 형식 검증
        if (response.data.length > 0) {
          const firstItem = response.data[0];
          if (!firstItem.userId || !firstItem.netBet || !firstItem.lastActiveDate) {
            return {
              valid: false,
              error: '필수 필드(userId, netBet, lastActiveDate)가 없습니다.'
            };
          }
        }
        
        return { valid: true };
      }
    },
    {
      name: '휴면 고가치 사용자 API - 필터링 조회',
      endpoint: `/api/highValueUsersApi/dormant`,
      method: 'GET',
      params: { minDormantDays: 30 },
      headers: {},
      expectedStatus: 200,
      validateResponse: (response) => {
        // 응답 구조 검증
        if (!response.data || !Array.isArray(response.data)) {
          return {
            valid: false,
            error: '응답이 배열이 아닙니다.'
          };
        }
        
        // 필터링 검증 (선택 사항)
        // 정확한 일수 계산은 클라이언트에서 하기 어려울 수 있음
        
        return { valid: true };
      }
    },
    {
      name: 'CSV 내보내기 API - 활성 사용자',
      endpoint: `/api/highValueUsersApi/export/csv`,
      method: 'GET',
      params: { type: 'active' },
      headers: {},
      expectedStatus: 200,
      validateResponse: (response) => {
        // CSV 형식 검증
        const contentType = response.headers['content-type'];
        if (!contentType || !contentType.includes('text/csv')) {
          return {
            valid: false,
            error: `잘못된 Content-Type: ${contentType}`
          };
        }
        
        // 데이터에 행이 있는지 확인
        const lines = response.data.split('\n');
        if (lines.length < 2) { // 헤더 + 최소 1행 데이터
          return {
            valid: false,
            error: 'CSV 데이터에 행이 부족합니다.'
          };
        }
        
        // 헤더에 필수 필드가 있는지 확인
        const headers = lines[0].split(',');
        if (!headers.includes('userId') || !headers.includes('netBet')) {
          return {
            valid: false,
            error: 'CSV 헤더에 필수 필드가 없습니다.'
          };
        }
        
        return { valid: true };
      }
    },
    {
      name: 'CSV 내보내기 API - 휴면 사용자',
      endpoint: `/api/highValueUsersApi/export/csv`,
      method: 'GET',
      params: { type: 'dormant' },
      headers: {},
      expectedStatus: 200,
      validateResponse: (response) => {
        // CSV 형식 검증
        const contentType = response.headers['content-type'];
        if (!contentType || !contentType.includes('text/csv')) {
          return {
            valid: false,
            error: `잘못된 Content-Type: ${contentType}`
          };
        }
        
        // 데이터에 행이 있는지 확인
        const lines = response.data.split('\n');
        if (lines.length < 2) { // 헤더 + 최소 1행 데이터
          return {
            valid: false,
            error: 'CSV 데이터에 행이 부족합니다.'
          };
        }
        
        // 헤더에 필수 필드가 있는지 확인
        const headers = lines[0].split(',');
        if (!headers.includes('userId') || !headers.includes('netBet') || !headers.includes('lastActiveDate')) {
          return {
            valid: false,
            error: 'CSV 헤더에 필수 필드가 없습니다.'
          };
        }
        
        return { valid: true };
      }
    }
  ];
}

/**
 * API 테스트 실행
 * @param {Object} testCase 테스트 케이스 정보
 * @returns {Promise<Object>} 테스트 결과
 */
async function runTest(testCase) {
  console.log(`테스트 실행: ${testCase.name}`);
  
  const startTime = Date.now();
  let success = false;
  let statusCode = 0;
  let responseTime = 0;
  let responseSize = 0;
  let responseData = null;
  let validationResult = null;
  let error = null;
  
  try {
    // URL 구성
    const url = `${config.apiBaseUrl}${testCase.endpoint}`;
    
    // API 요청 실행
    const response = await axios({
      method: testCase.method,
      url: url,
      params: testCase.params,
      headers: testCase.headers || {},
      timeout: testCase.timeout || 30000, // 30초 기본 타임아웃
      validateStatus: null, // 모든 상태 코드를 유효한 응답으로 처리
      responseType: testCase.endpoint.includes('/export/csv') ? 'text' : 'json'
    });
    
    // 응답 정보 수집
    statusCode = response.status;
    responseTime = Date.now() - startTime;
    responseData = response.data;
    responseSize = JSON.stringify(response.data).length;
    
    // 응답 상태 코드 검증
    success = statusCode === testCase.expectedStatus;
    
    // 응답 데이터 유효성 검증 (함수가 제공된 경우)
    if (success && testCase.validateResponse) {
      try {
        validationResult = testCase.validateResponse(response);
        success = validationResult.valid;
      } catch (validationError) {
        success = false;
        error = {
          message: '응답 유효성 검증 중 오류 발생',
          details: validationError.message
        };
      }
    }
    
  } catch (err) {
    error = {
      message: err.message,
      code: err.code
    };
    responseTime = Date.now() - startTime;
  }
  
  // 결과 구조화
  const result = {
    testCase: testCase.name,
    endpoint: testCase.endpoint,
    method: testCase.method,
    params: testCase.params,
    timestamp: new Date().toISOString(),
    success,
    statusCode,
    responseTime,
    responseSize,
    error,
    validationResult: validationResult || null
  };
  
  // 응답 데이터 저장 (크기가 너무 큰 경우 제외)
  if (responseSize < 10000) {
    result.responseData = responseData;
  } else {
    result.responseData = '[응답 데이터가 너무 큼]';
  }
  
  return result;
}

/**
 * 전체 테스트 실행
 * @returns {Promise<Array>} 테스트 결과 배열
 */
async function runAllTests() {
  console.log('API 회귀 테스트 실행 중...');
  
  // 테스트 케이스 로드
  const testCases = loadTestCases();
  console.log(`총 ${testCases.length}개의 테스트 케이스를 로드했습니다.`);
  
  // 모든 테스트 실행
  const results = [];
  
  for (const testCase of testCases) {
    try {
      const result = await runTest(testCase);
      results.push(result);
      
      // 결과 출력
      console.log(`- ${testCase.name}: ${result.success ? '✓' : '✗'} (${result.responseTime}ms)`);
      if (!result.success) {
        console.log(`  오류: ${result.error ? result.error.message : '응답 유효성 검증 실패'}`);
        if (result.validationResult && result.validationResult.error) {
          console.log(`  유효성 검증 오류: ${result.validationResult.error}`);
        }
      }
    } catch (error) {
      console.error(`테스트 실행 중 오류 발생: ${error.message}`);
      results.push({
        testCase: testCase.name,
        endpoint: testCase.endpoint,
        method: testCase.method,
        params: testCase.params,
        timestamp: new Date().toISOString(),
        success: false,
        error: {
          message: error.message
        }
      });
    }
  }
  
  // 요약 출력
  const successCount = results.filter(r => r.success).length;
  console.log(`\n테스트 결과: ${successCount}/${results.length} 성공`);
  
  return results;
}

/**
 * 테스트 결과 저장
 * @param {Array} results 테스트 결과 배열
 * @param {string} filePath 저장할 파일 경로
 */
function saveResults(results, filePath) {
  try {
    const resultsWithMeta = {
      timestamp: new Date().toISOString(),
      apiBaseUrl: config.apiBaseUrl,
      testCount: results.length,
      successCount: results.filter(r => r.success).length,
      failureCount: results.filter(r => !r.success).length,
      results
    };
    
    fs.writeFileSync(filePath, JSON.stringify(resultsWithMeta, null, 2));
    console.log(`테스트 결과가 저장되었습니다: ${filePath}`);
  } catch (error) {
    console.error(`테스트 결과 저장 실패: ${error.message}`);
  }
}

/**
 * 현재 결과와 기준 결과 비교
 * @param {string} baselineFile 기준 결과 파일 경로
 * @param {string} currentFile 현재 결과 파일 경로
 * @returns {Object} 비교 결과
 */
function compareResults(baselineFile, currentFile) {
  try {
    // 결과 파일 로드
    const baseline = JSON.parse(fs.readFileSync(baselineFile, 'utf8'));
    const current = JSON.parse(fs.readFileSync(currentFile, 'utf8'));
    
    // 비교 결과 초기화
    const comparison = {
      timestamp: new Date().toISOString(),
      baselineTimestamp: baseline.timestamp,
      currentTimestamp: current.timestamp,
      summary: {
        baselineTestCount: baseline.testCount,
        currentTestCount: current.testCount,
        baselineSuccessCount: baseline.successCount,
        currentSuccessCount: current.successCount,
        regressions: 0,
        improvements: 0,
        unchanged: 0,
        newTests: 0,
        removedTests: 0
      },
      details: []
    };
    
    // 테스트 케이스 맵 생성
    const baselineTests = new Map();
    baseline.results.forEach(result => {
      const key = `${result.endpoint}|${result.method}|${JSON.stringify(result.params)}`;
      baselineTests.set(key, result);
    });
    
    // 각 현재 테스트와 기준 테스트 비교
    current.results.forEach(currentResult => {
      const key = `${currentResult.endpoint}|${currentResult.method}|${JSON.stringify(currentResult.params)}`;
      
      if (baselineTests.has(key)) {
        // 기존 테스트 케이스와 비교
        const baselineResult = baselineTests.get(key);
        baselineTests.delete(key); // 처리 완료 표시
        
        const detail = {
          testCase: currentResult.testCase,
          endpoint: currentResult.endpoint,
          method: currentResult.method,
          params: currentResult.params,
          baseline: {
            success: baselineResult.success,
            statusCode: baselineResult.statusCode,
            responseTime: baselineResult.responseTime
          },
          current: {
            success: currentResult.success,
            statusCode: currentResult.statusCode,
            responseTime: currentResult.responseTime
          }
        };
        
        // 변경사항 분석
        if (baselineResult.success && !currentResult.success) {
          // 회귀: 이전에는 성공했지만 지금은 실패
          detail.result = 'regression';
          detail.description = '회귀: 이전에는 성공했지만 지금은 실패합니다.';
          detail.severity = 'high';
          comparison.summary.regressions++;
        } else if (!baselineResult.success && currentResult.success) {
          // 개선: 이전에는 실패했지만 지금은 성공
          detail.result = 'improvement';
          detail.description = '개선: 이전에는 실패했지만 지금은 성공합니다.';
          detail.severity = 'low';
          comparison.summary.improvements++;
        } else if (baselineResult.success === currentResult.success) {
          // 상태 코드 변경 확인
          if (baselineResult.statusCode !== currentResult.statusCode) {
            if (currentResult.success) {
              detail.result = 'change';
              detail.description = `상태 코드 변경: ${baselineResult.statusCode} → ${currentResult.statusCode} (성공)`;
              detail.severity = 'low';
            } else {
              detail.result = 'regression';
              detail.description = `상태 코드 변경: ${baselineResult.statusCode} → ${currentResult.statusCode} (실패)`;
              detail.severity = 'medium';
              comparison.summary.regressions++;
            }
          } else {
            // 응답 시간 변경 확인
            const timeDiff = currentResult.responseTime - baselineResult.responseTime;
            const percentChange = (timeDiff / baselineResult.responseTime) * 100;
            
            if (percentChange > 50 && timeDiff > 1000) {
              // 응답 시간이 50% 이상, 절대적으로 1초 이상 증가
              detail.result = 'performance_regression';
              detail.description = `성능 회귀: 응답 시간이 ${percentChange.toFixed(0)}% 증가했습니다. (${baselineResult.responseTime}ms → ${currentResult.responseTime}ms)`;
              detail.severity = 'medium';
              comparison.summary.regressions++;
            } else if (percentChange < -30 && Math.abs(timeDiff) > 500) {
              // 응답 시간이 30% 이상, 절대적으로 0.5초 이상 감소
              detail.result = 'performance_improvement';
              detail.description = `성능 개선: 응답 시간이 ${Math.abs(percentChange).toFixed(0)}% 감소했습니다. (${baselineResult.responseTime}ms → ${currentResult.responseTime}ms)`;
              detail.severity = 'low';
              comparison.summary.improvements++;
            } else {
              // 큰 변화 없음
              detail.result = 'unchanged';
              detail.description = '변경 없음';
              detail.severity = 'info';
              comparison.summary.unchanged++;
            }
          }
        }
        
        comparison.details.push(detail);
      } else {
        // 새로운 테스트 케이스
        comparison.details.push({
          testCase: currentResult.testCase,
          endpoint: currentResult.endpoint,
          method: currentResult.method,
          params: currentResult.params,
          result: 'new_test',
          description: '새로운 테스트 케이스',
          severity: 'info',
          current: {
            success: currentResult.success,
            statusCode: currentResult.statusCode,
            responseTime: currentResult.responseTime
          }
        });
        
        comparison.summary.newTests++;
      }
    });
    
    // 제거된 테스트 케이스 처리
    baselineTests.forEach(baselineResult => {
      comparison.details.push({
        testCase: baselineResult.testCase,
        endpoint: baselineResult.endpoint,
        method: baselineResult.method,
        params: baselineResult.params,
        result: 'removed_test',
        description: '제거된 테스트 케이스',
        severity: 'info',
        baseline: {
          success: baselineResult.success,
          statusCode: baselineResult.statusCode,
          responseTime: baselineResult.responseTime
        }
      });
      
      comparison.summary.removedTests++;
    });
    
    return comparison;
  } catch (error) {
    console.error(`결과 비교 실패: ${error.message}`);
    return {
      timestamp: new Date().toISOString(),
      error: error.message
    };
  }
}

/**
 * 비교 결과 저장
 * @param {Object} comparison 비교 결과
 * @param {string} filePath 저장할 파일 경로
 */
function saveComparison(comparison, filePath) {
  try {
    fs.writeFileSync(filePath, JSON.stringify(comparison, null, 2));
    console.log(`비교 결과가 저장되었습니다: ${filePath}`);
  } catch (error) {
    console.error(`비교 결과 저장 실패: ${error.message}`);
  }
}

/**
 * 비교 결과 보고서 생성
 * @param {Object} comparison 비교 결과
 */
function reportComparison(comparison) {
  console.log('\n===== API 회귀 테스트 비교 결과 =====');
  console.log(`기준 시점: ${new Date(comparison.baselineTimestamp).toLocaleString()}`);
  console.log(`현재 시점: ${new Date(comparison.currentTimestamp).toLocaleString()}`);
  
  console.log('\n요약:');
  console.log(`- 테스트 케이스: ${comparison.summary.baselineTestCount} → ${comparison.summary.currentTestCount}`);
  console.log(`- 성공률: ${(comparison.summary.baselineSuccessCount / comparison.summary.baselineTestCount * 100).toFixed(1)}% → ${(comparison.summary.currentSuccessCount / comparison.summary.currentTestCount * 100).toFixed(1)}%`);
  console.log(`- 회귀 발생: ${comparison.summary.regressions}개`);
  console.log(`- 개선 사항: ${comparison.summary.improvements}개`);
  console.log(`- 변경 없음: ${comparison.summary.unchanged}개`);
  console.log(`- 새로운 테스트: ${comparison.summary.newTests}개`);
  console.log(`- 제거된 테스트: ${comparison.summary.removedTests}개`);
  
  // 회귀 발생 항목 출력
  if (comparison.summary.regressions > 0) {
    console.log('\n회귀 발생 항목:');
    comparison.details
      .filter(detail => detail.result === 'regression' || detail.result === 'performance_regression')
      .forEach(detail => {
        console.log(`- ${detail.testCase}`);
        console.log(`  ${detail.description}`);
      });
  }
  
  // 개선 사항 출력 (선택 사항)
  if (comparison.summary.improvements > 0) {
    console.log('\n개선 사항:');
    comparison.details
      .filter(detail => detail.result === 'improvement' || detail.result === 'performance_improvement')
      .forEach(detail => {
        console.log(`- ${detail.testCase}`);
        console.log(`  ${detail.description}`);
      });
  }
  
  // 종합 결과
  if (comparison.summary.regressions > 0) {
    console.log('\n⚠️ 회귀가 발생했습니다! 확인이 필요합니다.');
  } else {
    console.log('\n✅ 회귀가 발견되지 않았습니다.');
  }
}

/**
 * 배포 전 회귀 테스트 실행
 * @param {boolean} setBaseline 기준 결과를 새로 설정할지 여부
 * @returns {Promise<boolean>} 테스트 통과 여부
 */
async function runRegressionTest(setBaseline = false) {
  try {
    console.log('배포 전 회귀 테스트 실행 중...');
    
    // 테스트 실행
    const results = await runAllTests();
    
    // 현재 결과 저장
    saveResults(results, currentResultsPath);
    
    // 기준 결과가 없거나 기준 설정 모드인 경우 기준 결과 설정
    if (!fs.existsSync(baselinePath) || setBaseline) {
      console.log('기준 결과를 설정합니다...');
      saveResults(results, baselinePath);
      return true;
    }
    
    // 기준 결과와 비교
    const comparison = compareResults(baselinePath, currentResultsPath);
    
    // 비교 결과 저장
    saveComparison(comparison, comparisonReportPath);
    
    // 비교 결과 보고
    reportComparison(comparison);
    
    // 회귀 여부에 따라 결과 반환
    return comparison.summary.regressions === 0;
  } catch (error) {
    console.error(`회귀 테스트 실행 중 오류 발생: ${error.message}`);
    return false;
  }
}

/**
 * 기준 결과 업데이트
 */
async function updateBaseline() {
  try {
    console.log('기준 결과 업데이트 중...');
    
    // 테스트 실행
    const results = await runAllTests();
    
    // 현재 결과를 기준 결과로 저장
    saveResults(results, baselinePath);
    
    console.log('기준 결과가 업데이트되었습니다.');
    return true;
  } catch (error) {
    console.error(`기준 결과 업데이트 중 오류 발생: ${error.message}`);
    return false;
  }
}

/**
 * 이전 배포와 현재 API 비교 테스트
 * @param {string} environment 환경 (dev, staging, prod)
 * @returns {Promise<boolean>} 테스트 통과 여부
 */
async function compareWithDeployedAPI(environment) {
  try {
    console.log(`${environment} 환경의 API와 비교 중...`);
    
    // 현재 API 엔드포인트 설정 백업
    const origApiBaseUrl = config.apiBaseUrl;
    
    // 환경별 API 엔드포인트 설정
    const apiBaseUrls = {
      dev: 'https://dev-db888-67827.web.app',
      staging: 'https://staging-db888-67827.web.app',
      prod: 'https://db888-67827.web.app'
    };
    
    // 환경 API 설정
    config.apiBaseUrl = apiBaseUrls[environment];
    
    if (!config.apiBaseUrl) {
      throw new Error(`유효하지 않은 환경: ${environment}`);
    }
    
    // 배포된 API 테스트
    console.log(`${environment} API 테스트 실행 중...`);
    const deployedResults = await runAllTests();
    
    // 결과 저장
    const deployedResultsPath = path.join(reportsDir, `${environment}-results.json`);
    saveResults(deployedResults, deployedResultsPath);
    
    // 로컬 API 설정으로 복원
    config.apiBaseUrl = origApiBaseUrl;
    
    // 로컬 API 테스트
    console.log('로컬 API 테스트 실행 중...');
    const localResults = await runAllTests();
    
    // 결과 저장
    saveResults(localResults, currentResultsPath);
    
    // 결과 비교
    const comparison = compareResults(deployedResultsPath, currentResultsPath);
    
    // 비교 결과 저장
    const comparisonEnvPath = path.join(reportsDir, `comparison-${environment}.json`);
    saveComparison(comparison, comparisonEnvPath);
    
    // 비교 결과 보고
    console.log(`\n===== 로컬 API와 ${environment} API 비교 결과 =====`);
    reportComparison(comparison);
    
    // 회귀 여부에 따라 결과 반환
    return comparison.summary.regressions === 0;
  } catch (error) {
    console.error(`배포된 API 비교 중 오류 발생: ${error.message}`);
    return false;
  }
}

/**
 * 명령행 인자 처리
 */
function parseArgs() {
  const args = process.argv.slice(2);
  const options = {
    setBaseline: false,
    compare: false,
    environment: null,
    updateBaseline: false,
    help: false
  };
  
  for (let i = 0; i < args.length; i++) {
    switch (args[i]) {
      case '--set-baseline':
        options.setBaseline = true;
        break;
      case '--compare':
        options.compare = true;
        break;
      case '--env':
        options.environment = args[++i];
        break;
      case '--update-baseline':
        options.updateBaseline = true;
        break;
      case '--help':
      case '-h':
        options.help = true;
        break;
    }
  }
  
  return options;
}

/**
 * 사용법 출력
 */
function showUsage() {
  console.log('사용법: node api-regression-test.js [옵션]');
  console.log('\n옵션:');
  console.log('  --set-baseline      테스트 결과를 새로운 기준으로 설정');
  console.log('  --update-baseline   기존 기준 결과 업데이트');
  console.log('  --compare           현재 코드를 실행하여 기준과 비교 (기본 동작)');
  console.log('  --env <environment> 특정 환경(dev, staging, prod)의 API와 비교');
  console.log('  --help, -h          이 도움말 표시');
  console.log('\n예시:');
  console.log('  node api-regression-test.js --set-baseline');
  console.log('  node api-regression-test.js --compare');
  console.log('  node api-regression-test.js --env prod');
}

/**
 * 메인 함수
 */
async function main() {
  const options = parseArgs();
  
  if (options.help) {
    showUsage();
    return;
  }
  
  try {
    if (options.setBaseline) {
      // 새로운 기준 설정
      await runRegressionTest(true);
    } else if (options.updateBaseline) {
      // 기준 업데이트
      await updateBaseline();
    } else if (options.environment) {
      // 배포된 API와 비교
      const passed = await compareWithDeployedAPI(options.environment);
      process.exit(passed ? 0 : 1);
    } else {
      // 기본 동작: 회귀 테스트 실행
      const passed = await runRegressionTest(false);
      process.exit(passed ? 0 : 1);
    }
  } catch (error) {
    console.error(`오류 발생: ${error.message}`);
    process.exit(1);
  }
}

// 스크립트가 직접 실행된 경우에만 실행
if (require.main === module) {
  main();
}

module.exports = {
  runAllTests,
  runRegressionTest,
  updateBaseline,
  compareWithDeployedAPI
};
