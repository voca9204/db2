/**
 * Firebase Functions 자동 테스트 스크립트
 * 
 * 이 스크립트는 Firebase Functions의 자동 테스트를 실행하고 보고서를 생성합니다.
 */

const fs = require('fs');
const path = require('path');
const colors = require('colors/safe');
const { exec } = require('child_process');
const util = require('util');
const execPromise = util.promisify(exec);

// 프로젝트 루트 경로
const PROJECT_ROOT = path.join(__dirname, '../..');
const FUNCTIONS_DIR = path.join(PROJECT_ROOT, 'functions');
const REPORT_DIR = path.join(__dirname, 'reports');

// 로그 함수
const log = {
  info: (msg) => console.log(colors.cyan(`[INFO] ${msg}`)),
  warn: (msg) => console.log(colors.yellow(`[WARN] ${msg}`)),
  error: (msg) => console.log(colors.red(`[ERROR] ${msg}`)),
  success: (msg) => console.log(colors.green(`[SUCCESS] ${msg}`))
};

/**
 * Firebase Functions 디렉토리 확인
 * @returns {boolean} Functions 디렉토리 존재 여부
 */
function checkFunctionsDirectory() {
  if (!fs.existsSync(FUNCTIONS_DIR)) {
    log.error(`Functions 디렉토리를 찾을 수 없습니다: ${FUNCTIONS_DIR}`);
    return false;
  }
  
  const packageJsonPath = path.join(FUNCTIONS_DIR, 'package.json');
  if (!fs.existsSync(packageJsonPath)) {
    log.error(`Functions package.json 파일을 찾을 수 없습니다: ${packageJsonPath}`);
    return false;
  }
  
  const indexPath = path.join(FUNCTIONS_DIR, 'index.js');
  if (!fs.existsSync(indexPath)) {
    log.warn(`Functions index.js 파일을 찾을 수 없습니다: ${indexPath}`);
  }
  
  return true;
}

/**
 * Firebase Functions 테스트 구성 확인 및 설정
 * @returns {boolean} 테스트 구성 설정 성공 여부
 */
function checkTestConfiguration() {
  const packageJsonPath = path.join(FUNCTIONS_DIR, 'package.json');
  let packageJson;
  
  try {
    packageJson = JSON.parse(fs.readFileSync(packageJsonPath, 'utf8'));
  } catch (error) {
    log.error(`package.json 파일 읽기 오류: ${error.message}`);
    return false;
  }
  
  // 테스트 관련 의존성 확인
  const devDependencies = packageJson.devDependencies || {};
  const hasMocha = devDependencies.mocha || devDependencies['@types/mocha'];
  const hasJest = devDependencies.jest || devDependencies['@types/jest'];
  const hasFirebaseFunctionsTest = devDependencies['firebase-functions-test'];
  
  // 테스트 스크립트 확인
  const scripts = packageJson.scripts || {};
  const hasTestScript = scripts.test;
  
  if (!hasMocha && !hasJest) {
    log.warn('테스트 프레임워크(Mocha 또는 Jest)가 설치되어 있지 않습니다.');
    return false;
  }
  
  if (!hasFirebaseFunctionsTest) {
    log.warn('firebase-functions-test 패키지가 설치되어 있지 않습니다.');
    return false;
  }
  
  if (!hasTestScript) {
    log.warn('package.json에 test 스크립트가 정의되어 있지 않습니다.');
    return false;
  }
  
  // 테스트 디렉토리 확인
  const testDirs = ['test', 'tests', '__tests__', '__test__'].map(dir => path.join(FUNCTIONS_DIR, dir));
  let testDirExists = false;
  let testDir;
  
  for (const dir of testDirs) {
    if (fs.existsSync(dir)) {
      testDirExists = true;
      testDir = dir;
      break;
    }
  }
  
  if (!testDirExists) {
    log.warn('테스트 디렉토리를 찾을 수 없습니다.');
    return false;
  }
  
  // 테스트 파일 확인
  const testFiles = fs.readdirSync(testDir)
    .filter(file => file.endsWith('.test.js') || file.endsWith('.spec.js') || (!file.endsWith('.js') && file.includes('test')));
  
  if (testFiles.length === 0) {
    log.warn('테스트 파일을 찾을 수 없습니다.');
    return false;
  }
  
  log.info(`${testFiles.length}개의 테스트 파일을 찾았습니다.`);
  return true;
}

/**
 * Jest 테스트 실행
 * @returns {Promise<Object>} 테스트 결과
 */
async function runJestTests() {
  log.info('Jest 테스트 실행 중...');
  
  try {
    const { stdout, stderr } = await execPromise('npm test', { cwd: FUNCTIONS_DIR });
    
    return {
      success: !stderr,
      output: stdout,
      error: stderr
    };
  } catch (error) {
    return {
      success: false,
      output: error.stdout || '',
      error: error.stderr || error.message
    };
  }
}

/**
 * Mocha 테스트 실행
 * @returns {Promise<Object>} 테스트 결과
 */
async function runMochaTests() {
  log.info('Mocha 테스트 실행 중...');
  
  try {
    const { stdout, stderr } = await execPromise('npm test', { cwd: FUNCTIONS_DIR });
    
    return {
      success: !stderr,
      output: stdout,
      error: stderr
    };
  } catch (error) {
    return {
      success: false,
      output: error.stdout || '',
      error: error.stderr || error.message
    };
  }
}

/**
 * 테스트 출력 파싱
 * @param {string} output 테스트 출력
 * @returns {Object} 파싱된 테스트 결과
 */
function parseTestResults(output) {
  const result = {
    totalTests: 0,
    passedTests: 0,
    failedTests: 0,
    skippedTests: 0,
    duration: 0
  };
  
  // Jest 결과 파싱
  if (output.includes('Test Suites:')) {
    const testSuitesMatch = output.match(/Test Suites:\s+(\d+) passed,\s+(\d+) failed,\s+(\d+) total/);
    const testsMatch = output.match(/Tests:\s+(\d+) passed,\s+(\d+) failed,\s+(\d+) total/);
    const timeMatch = output.match(/Time:\s+([\d.]+)s/);
    
    if (testSuitesMatch) {
      result.testSuites = {
        passed: parseInt(testSuitesMatch[1]),
        failed: parseInt(testSuitesMatch[2]),
        total: parseInt(testSuitesMatch[3])
      };
    }
    
    if (testsMatch) {
      result.totalTests = parseInt(testsMatch[3]);
      result.passedTests = parseInt(testsMatch[1]);
      result.failedTests = parseInt(testsMatch[2]);
    }
    
    if (timeMatch) {
      result.duration = parseFloat(timeMatch[1]);
    }
    
    result.type = 'jest';
  }
  // Mocha 결과 파싱
  else if (output.includes('passing') || output.includes('failing')) {
    const passingMatch = output.match(/(\d+) passing/);
    const failingMatch = output.match(/(\d+) failing/);
    const pendingMatch = output.match(/(\d+) pending/);
    const timeMatch = output.match(/finished in ([\d.]+)ms/);
    
    if (passingMatch) {
      result.passedTests = parseInt(passingMatch[1]);
    }
    
    if (failingMatch) {
      result.failedTests = parseInt(failingMatch[1]);
    }
    
    if (pendingMatch) {
      result.skippedTests = parseInt(pendingMatch[1]);
    }
    
    result.totalTests = result.passedTests + result.failedTests + result.skippedTests;
    
    if (timeMatch) {
      result.duration = parseFloat(timeMatch[1]) / 1000; // ms to s
    }
    
    result.type = 'mocha';
  }
  
  return result;
}

/**
 * 테스트 보고서 생성
 * @param {Object} testResults 테스트 결과
 * @returns {string} 보고서 파일 경로
 */
function generateReport(testResults) {
  // 보고서 디렉토리 확인 및 생성
  if (!fs.existsSync(REPORT_DIR)) {
    fs.mkdirSync(REPORT_DIR, { recursive: true });
  }
  
  const timestamp = new Date().toISOString().replace(/:/g, '-');
  const reportPath = path.join(REPORT_DIR, `functions-test-report-${timestamp}.json`);
  
  // 전체 보고서
  const report = {
    timestamp,
    ...testResults
  };
  
  fs.writeFileSync(reportPath, JSON.stringify(report, null, 2));
  log.success(`테스트 보고서가 생성되었습니다: ${reportPath}`);
  
  return reportPath;
}

/**
 * 테스트 결과 출력
 * @param {Object} results 테스트 결과
 */
function printResults(results) {
  console.log('\n=== Firebase Functions 테스트 결과 ===\n');
  
  if (results.success) {
    console.log(colors.green(`테스트 성공: ${results.parsedResults.passedTests}/${results.parsedResults.totalTests} 테스트 통과`));
  } else {
    console.log(colors.red(`테스트 실패: ${results.parsedResults.failedTests}/${results.parsedResults.totalTests} 테스트 실패`));
  }
  
  console.log(`테스트 실행 시간: ${results.parsedResults.duration.toFixed(2)}초`);
  
  if (results.parsedResults.skippedTests > 0) {
    console.log(colors.yellow(`건너뛴 테스트: ${results.parsedResults.skippedTests}개`));
  }
  
  if (results.error) {
    console.log(colors.red('\n오류 발생:'));
    console.log(colors.red(results.error));
  }
  
  if (results.success) {
    console.log(colors.green('\n모든 테스트가 성공적으로 통과했습니다! 👍'));
  } else {
    console.log(colors.red('\n테스트 중 오류가 발생했습니다. 자세한 내용은 보고서를 확인하세요.'));
  }
}

/**
 * 메인 함수
 */
async function main() {
  try {
    log.info('Firebase Functions 테스트 시작...');
    
    // Functions 디렉토리 확인
    if (!checkFunctionsDirectory()) {
      log.error('Firebase Functions 디렉토리 설정을 확인할 수 없습니다.');
      process.exit(1);
    }
    
    // 테스트 구성 확인
    const hasTestConfig = checkTestConfiguration();
    if (!hasTestConfig) {
      log.error('테스트 구성이 올바르지 않습니다. 테스트를 실행할 수 없습니다.');
      process.exit(1);
    }
    
    // 테스트 종류 확인
    const packageJsonPath = path.join(FUNCTIONS_DIR, 'package.json');
    const packageJson = JSON.parse(fs.readFileSync(packageJsonPath, 'utf8'));
    const devDependencies = packageJson.devDependencies || {};
    const hasJest = devDependencies.jest || devDependencies['@types/jest'];
    
    // 테스트 실행
    let testResults;
    if (hasJest) {
      testResults = await runJestTests();
    } else {
      testResults = await runMochaTests();
    }
    
    // 테스트 결과 파싱
    const parsedResults = parseTestResults(testResults.output);
    testResults.parsedResults = parsedResults;
    
    // 성공 여부 결정
    testResults.success = parsedResults.failedTests === 0;
    
    // 보고서 생성
    const reportPath = generateReport(testResults);
    
    // 결과 출력
    printResults(testResults);
    
  } catch (error) {
    log.error(`테스트 실행 중 오류 발생: ${error.message}`);
    log.error(error.stack);
    process.exit(1);
  }
}

// 스크립트 실행
if (require.main === module) {
  main().catch(console.error);
}

module.exports = {
  runTests: main
};
