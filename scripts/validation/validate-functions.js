/**
 * Firebase Functions 검증 스크립트
 * 
 * Firebase Functions 코드를 정적으로 분석하여 잠재적인 문제와 성능 이슈를 감지합니다.
 */

const fs = require('fs');
const path = require('path');
const { exec } = require('child_process');
const util = require('util');
const execPromise = util.promisify(exec);
const glob = util.promisify(require('glob'));

// 프로젝트 루트 경로
const projectRoot = path.resolve(__dirname, '../..');

// Functions 디렉토리 경로
const functionsDir = path.join(projectRoot, 'functions');

// 결과 보고서 경로
const reportsDir = path.join(projectRoot, 'reports/validation');

/**
 * ESLint를 사용한 코드 품질 검사
 * @returns {Promise<Object>} 검사 결과
 */
async function lintFunctions() {
  if (!fs.existsSync(functionsDir)) {
    return {
      valid: false,
      errors: ['Functions 디렉토리를 찾을 수 없습니다.']
    };
  }
  
  try {
    // package.json 확인
    const packageJsonPath = path.join(functionsDir, 'package.json');
    if (!fs.existsSync(packageJsonPath)) {
      return {
        valid: false,
        errors: ['functions/package.json 파일을 찾을 수 없습니다.']
      };
    }
    
    // ESLint 설정 확인
    const eslintConfigPath = path.join(functionsDir, '.eslintrc.js');
    if (!fs.existsSync(eslintConfigPath)) {
      console.log('ESLint 설정 파일이 없습니다. 기본 설정을 사용합니다.');
    }
    
    // ESLint 실행
    const command = 'cd functions && npm run lint';
    const { stdout, stderr } = await execPromise(command);
    
    // 결과 처리
    if (stderr && stderr.includes('error')) {
      return {
        valid: false,
        output: stdout,
        errors: [stderr.trim()]
      };
    }
    
    return {
      valid: true,
      output: stdout,
      message: 'Lint 검사 성공'
    };
  } catch (error) {
    // ESLint가 오류를 발견하면 비정상 종료
    return {
      valid: false,
      errors: [error.message]
    };
  }
}

/**
 * Firebase Functions 종속성 검사
 * @returns {Promise<Object>} 검사 결과
 */
async function checkDependencies() {
  if (!fs.existsSync(functionsDir)) {
    return {
      valid: false,
      errors: ['Functions 디렉토리를 찾을 수 없습니다.']
    };
  }
  
  try {
    // package.json 확인
    const packageJsonPath = path.join(functionsDir, 'package.json');
    if (!fs.existsSync(packageJsonPath)) {
      return {
        valid: false,
        errors: ['functions/package.json 파일을 찾을 수 없습니다.']
      };
    }
    
    // npm audit 실행
    const command = 'cd functions && npm audit --json';
    const { stdout } = await execPromise(command);
    
    // 결과 처리
    const auditResult = JSON.parse(stdout);
    const vulnerabilities = auditResult.vulnerabilities || {};
    const totalVulnerabilities = 
      (vulnerabilities.low || 0) + 
      (vulnerabilities.moderate || 0) + 
      (vulnerabilities.high || 0) + 
      (vulnerabilities.critical || 0);
    
    return {
      valid: totalVulnerabilities === 0,
      summary: vulnerabilities,
      advisories: auditResult.advisories || {},
      total: totalVulnerabilities
    };
  } catch (error) {
    // npm audit가 실패하거나 JSON 파싱 오류
    return {
      valid: false,
      errors: [error.message]
    };
  }
}

/**
 * Firebase Functions 메모리 사용량 분석
 * @returns {Promise<Object>} 분석 결과
 */
async function analyzeMemoryUsage() {
  if (!fs.existsSync(functionsDir)) {
    return {
      valid: false,
      errors: ['Functions 디렉토리를 찾을 수 없습니다.']
    };
  }
  
  try {
    // index.js 및 모든 소스 파일 경로 수집
    const indexPath = path.join(functionsDir, 'index.js');
    if (!fs.existsSync(indexPath)) {
      return {
        valid: false,
        errors: ['functions/index.js 파일을 찾을 수 없습니다.']
      };
    }
    
    // 모든 JS 파일 검색 (src 디렉토리 포함)
    const jsFiles = await glob(`${functionsDir}/**/*.js`);
    
    const results = {
      valid: true,
      warnings: [],
      recommendations: []
    };
    
    // 전역 초기화 검사
    const indexContent = fs.readFileSync(indexPath, 'utf8');
    if (indexContent.includes('firebase.initializeApp') || 
        indexContent.includes('admin.initializeApp')) {
      
      const outsideFunction = /admin\.initializeApp[^}]*exports\.|exports\.[^}]*admin\.initializeApp/s.test(indexContent);
      
      if (outsideFunction) {
        results.valid = false;
        results.warnings.push('Firebase Admin SDK가 전역 범위에서 올바르게 초기화되었습니다. 콜드 스타트 성능이 향상됩니다.');
      } else {
        results.valid = false;
        results.warnings.push('Firebase Admin SDK가 함수 내부에서 초기화되고 있습니다. 콜드 스타트 지연을 방지하기 위해 전역 범위로 이동하세요.');
        results.recommendations.push('Firebase Admin SDK 초기화를 함수 외부(전역 범위)로 이동하세요.');
      }
    }
    
    // 각 파일 분석
    for (const file of jsFiles) {
      const content = fs.readFileSync(file, 'utf8');
      const relativePath = path.relative(functionsDir, file);
      
      // 대용량 상수 또는 배열 선언 검사
      if (content.includes('new Array(') || content.match(/\[[^\]]{1000,}\]/)) {
        results.warnings.push(`${relativePath}: 대용량 배열이 감지되었습니다. 메모리 사용량에 주의하세요.`);
      }
      
      // 메모리 집약적 라이브러리 검사
      if (content.includes('require(\'sharp\')') || 
          content.includes('require("sharp")') ||
          content.includes('import sharp from \'sharp\'')) {
        results.warnings.push(`${relativePath}: 메모리 집약적 이미지 처리 라이브러리(sharp)가 감지되었습니다.`);
        results.recommendations.push('이미지 처리에는 많은 메모리가 필요할 수 있습니다. 함수 메모리 할당량을 조정하세요.');
      }
      
      // 무한 루프 가능성 검사
      if ((content.includes('while (true)') || content.includes('for (;;)')) && 
          !content.includes('break')) {
        results.warnings.push(`${relativePath}: 가능한 무한 루프가 감지되었습니다.`);
        results.recommendations.push('무한 루프 조건을 검토하고 적절한 종료 조건을 추가하세요.');
      }
    }
    
    // 메모리 설정 검사
    const runtimeOptsRegex = /runWith\s*\(\s*{\s*memory\s*:/;
    if (!indexContent.match(runtimeOptsRegex)) {
      results.warnings.push('함수에 메모리 설정이 지정되지 않았습니다. 기본값(256MB)이 사용됩니다.');
      results.recommendations.push('대용량 데이터 처리가 필요한 함수에 적절한 메모리 설정(functions.runWith({memory: "1GB"}))을 추가하세요.');
    }
    
    return results;
  } catch (error) {
    return {
      valid: false,
      errors: [error.message]
    };
  }
}

/**
 * Firebase Functions 타임아웃 설정 분석
 * @returns {Promise<Object>} 분석 결과
 */
async function analyzeTimeoutSettings() {
  if (!fs.existsSync(functionsDir)) {
    return {
      valid: false,
      errors: ['Functions 디렉토리를 찾을 수 없습니다.']
    };
  }
  
  try {
    // index.js 파일 경로
    const indexPath = path.join(functionsDir, 'index.js');
    if (!fs.existsSync(indexPath)) {
      return {
        valid: false,
        errors: ['functions/index.js 파일을 찾을 수 없습니다.']
      };
    }
    
    const indexContent = fs.readFileSync(indexPath, 'utf8');
    
    const results = {
      valid: true,
      warnings: [],
      recommendations: []
    };
    
    // 타임아웃 설정 ��사
    const timeoutRegex = /timeoutSeconds\s*:/;
    if (!indexContent.match(timeoutRegex)) {
      results.warnings.push('함수에 타임아웃 설정이 지정되지 않았습니다. 기본값(60초)이 사용됩니다.');
      results.recommendations.push('장기 실행 작업이 있는 함수에 적절한 타임아웃 설정(functions.runWith({timeoutSeconds: 300}))을 추가하세요.');
    }
    
    // 데이터베이스 작업 검사
    const dbOperationsRegex = /(query|get|update|delete|set|add)\s*\(/;
    if (indexContent.match(dbOperationsRegex)) {
      // 데이터베이스 작업이 있지만 타임아웃 설정이 없는 경우
      if (!indexContent.match(timeoutRegex)) {
        results.warnings.push('데이터베이스 작업이 감지되었지만 타임아웃 설정이 지정되지 않았습니다.');
        results.recommendations.push('데이터베이스 작업을 수행하는 함수에 적절한 타임아웃 설정을 추가하세요.');
      }
    }
    
    return results;
  } catch (error) {
    return {
      valid: false,
      errors: [error.message]
    };
  }
}

/**
 * 전체 Firebase Functions 검증
 * @returns {Promise<Object>} 검증 결과
 */
async function validateFunctions() {
  console.log('Firebase Functions 검증 시작...');
  
  // 결과 저장 디렉토리 생성
  if (!fs.existsSync(reportsDir)) {
    fs.mkdirSync(reportsDir, { recursive: true });
  }
  
  // 검증 수행
  console.log('코드 품질 검사 중...');
  const lintResult = await lintFunctions();
  
  console.log('종속성 검사 중...');
  const dependenciesResult = await checkDependencies();
  
  console.log('메모리 사용량 분석 중...');
  const memoryUsageResult = await analyzeMemoryUsage();
  
  console.log('타임아웃 설정 분석 중...');
  const timeoutResult = await analyzeTimeoutSettings();
  
  // 종합 결과 집계
  const results = {
    timestamp: new Date().toISOString(),
    lint: lintResult,
    dependencies: dependenciesResult,
    memoryUsage: memoryUsageResult,
    timeout: timeoutResult,
    valid: lintResult.valid && dependenciesResult.valid && 
           memoryUsageResult.valid && timeoutResult.valid
  };
  
  // 결과 출력
  console.log('\nFirebase Functions 검증 결과:');
  console.log(`- 코드 품질 검사: ${lintResult.valid ? '✓' : '✗'}`);
  console.log(`- 종속성 검사: ${dependenciesResult.valid ? '✓' : '✗'}`);
  
  if (dependenciesResult.total > 0) {
    console.log(`  총 ${dependenciesResult.total}개의 취약점이 발견되었습니다:`);
    const vulnerabilities = dependenciesResult.summary;
    if (vulnerabilities.critical) console.log(`  - 심각: ${vulnerabilities.critical}개`);
    if (vulnerabilities.high) console.log(`  - 높음: ${vulnerabilities.high}개`);
    if (vulnerabilities.moderate) console.log(`  - 중간: ${vulnerabilities.moderate}개`);
    if (vulnerabilities.low) console.log(`  - 낮음: ${vulnerabilities.low}개`);
  }
  
  console.log(`- 메모리 사용량 분석: ${memoryUsageResult.valid ? '✓' : '✗'}`);
  
  if (memoryUsageResult.warnings && memoryUsageResult.warnings.length > 0) {
    console.log(`  ${memoryUsageResult.warnings.length}개의 경고가 발견되었습니다:`);
    memoryUsageResult.warnings.forEach((warning, index) => {
      console.log(`  ${index + 1}. ${warning}`);
    });
  }
  
  console.log(`- 타임아웃 설정 분석: ${timeoutResult.valid ? '✓' : '✗'}`);
  
  if (timeoutResult.warnings && timeoutResult.warnings.length > 0) {
    console.log(`  ${timeoutResult.warnings.length}개의 경고가 발견되었습니다:`);
    timeoutResult.warnings.forEach((warning, index) => {
      console.log(`  ${index + 1}. ${warning}`);
    });
  }
  
  // 모든 권장 사항 출력
  const allRecommendations = [
    ...(memoryUsageResult.recommendations || []),
    ...(timeoutResult.recommendations || [])
  ];
  
  if (allRecommendations.length > 0) {
    console.log('\n개선 권장 사항:');
    allRecommendations.forEach((recommendation, index) => {
      console.log(`${index + 1}. ${recommendation}`);
    });
  }
  
  // 결과 저장
  const reportPath = path.join(reportsDir, `functions-validation-${Date.now()}.json`);
  fs.writeFileSync(reportPath, JSON.stringify(results, null, 2));
  console.log(`\n검증 보고서가 저장되었습니다: ${reportPath}`);
  
  return results;
}

// 스크립트가 직접 실행된 경우에만 실행
if (require.main === module) {
  validateFunctions()
    .then(results => {
      // 결과에 따라 종료 코드 설정
      process.exit(results.valid ? 0 : 1);
    })
    .catch(error => {
      console.error('Functions 검증 중 오류 발생:', error);
      process.exit(1);
    });
}

module.exports = {
  validateFunctions,
  lintFunctions,
  checkDependencies,
  analyzeMemoryUsage,
  analyzeTimeoutSettings
};
