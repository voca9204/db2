/**
 * Firebase Security Rules 검증 스크립트
 * 
 * 이 스크립트는 Firebase Security Rules의 정적 분석 및 검증을 수행합니다.
 * 잠재적인 보안 취약점을 식별하고 모범 사례를 적용합니다.
 */

const fs = require('fs');
const path = require('path');
const colors = require('colors/safe');
const { exec } = require('child_process');
const util = require('util');
const execPromise = util.promisify(exec);

// 프로젝트 루트 경로
const PROJECT_ROOT = path.join(__dirname, '../..');
const REPORT_DIR = path.join(__dirname, 'reports');

// 로그 함수
const log = {
  info: (msg) => console.log(colors.cyan(`[INFO] ${msg}`)),
  warn: (msg) => console.log(colors.yellow(`[WARN] ${msg}`)),
  error: (msg) => console.log(colors.red(`[ERROR] ${msg}`)),
  success: (msg) => console.log(colors.green(`[SUCCESS] ${msg}`))
};

/**
 * Firestore 보안 규칙 파일 찾기
 * @returns {string|null} 보안 규칙 파일 경로 또는 null
 */
function findFirestoreRulesFile() {
  const possiblePaths = [
    path.join(PROJECT_ROOT, 'firestore.rules'),
    path.join(PROJECT_ROOT, 'firebase/firestore.rules'),
    path.join(PROJECT_ROOT, 'rules/firestore.rules')
  ];
  
  for (const rulesPath of possiblePaths) {
    if (fs.existsSync(rulesPath)) {
      return rulesPath;
    }
  }
  
  return null;
}

/**
 * Storage 보안 규칙 파일 찾기
 * @returns {string|null} 보안 규칙 파일 경로 또는 null
 */
function findStorageRulesFile() {
  const possiblePaths = [
    path.join(PROJECT_ROOT, 'storage.rules'),
    path.join(PROJECT_ROOT, 'firebase/storage.rules'),
    path.join(PROJECT_ROOT, 'rules/storage.rules')
  ];
  
  for (const rulesPath of possiblePaths) {
    if (fs.existsSync(rulesPath)) {
      return rulesPath;
    }
  }
  
  return null;
}

/**
 * Firebase CLI를 사용하여 규칙 검증
 * @param {string} rulesFile 규칙 파일 경로
 * @param {string} rulesType 규칙 유형 ('firestore' 또는 'storage')
 * @returns {Object} 검증 결과
 */
async function validateRules(rulesFile, rulesType) {
  log.info(`Firebase CLI를 사용하여 ${rulesType} 규칙 검증 중...`);
  
  try {
    const { stdout, stderr } = await execPromise(`firebase --project db888 ${rulesType}:deploy --only rules --dry-run`);
    
    return {
      success: true,
      output: stdout
    };
  } catch (error) {
    return {
      success: false,
      error: error.message,
      output: error.stdout || ''
    };
  }
}

/**
 * 규칙 파일 파싱 및 분석
 * @param {string} rulesFile 규칙 파일 경로
 * @returns {Object} 분석 결과
 */
function analyzeRules(rulesFile) {
  log.info(`${rulesFile} 규칙 파일 분석 중...`);
  
  try {
    const rulesContent = fs.readFileSync(rulesFile, 'utf8');
    const analysis = {
      fileName: path.basename(rulesFile),
      path: rulesFile,
      size: rulesContent.length,
      issues: [],
      warnings: [],
      recommendations: []
    };
    
    // 보안 취약점 검사
    analyzeSecurityVulnerabilities(rulesContent, analysis);
    
    // 모범 사례 검사
    analyzeBestPractices(rulesContent, analysis);
    
    return analysis;
  } catch (error) {
    log.error(`규칙 파일 분석 중 오류 발생: ${error.message}`);
    
    return {
      fileName: path.basename(rulesFile),
      path: rulesFile,
      error: error.message,
      issues: [{
        severity: 'error',
        message: `파일 읽기 오류: ${error.message}`,
        line: 0
      }]
    };
  }
}

/**
 * 규칙 파일에서 보안 취약점 검사
 * @param {string} rulesContent 규칙 파일 내용
 * @param {Object} analysis 분석 결과 객체
 */
function analyzeSecurityVulnerabilities(rulesContent, analysis) {
  // 1. 모든 문서 읽기/쓰기 권한 확인
  if (rulesContent.includes('allow read, write;') || 
      rulesContent.includes('allow read, write:') ||
      rulesContent.includes('allow write, read;') ||
      rulesContent.includes('allow write, read:')) {
    
    analysis.issues.push({
      severity: 'critical',
      message: '모든 문서에 대한 읽기/쓰기 권한이 부여되어 있습니다.',
      line: getLineNumber(rulesContent, /allow (read|write), (write|read);/),
      fix: '특정 조건에서만 권한을 부여하도록 규칙을 수정하세요.'
    });
  }
  
  // 2. 조건 없는 읽기 권한 확인
  if (rulesContent.includes('allow read;') || rulesContent.includes('allow read:')) {
    analysis.issues.push({
      severity: 'high',
      message: '조건 없이 읽기 권한이 부여되어 있습니다.',
      line: getLineNumber(rulesContent, /allow read;/),
      fix: '인증된 사용자나 특정 조건에서만 읽기 권한을 부여하세요.'
    });
  }
  
  // 3. 조건 없는 쓰기 권한 확인
  if (rulesContent.includes('allow write;') || rulesContent.includes('allow write:')) {
    analysis.issues.push({
      severity: 'critical',
      message: '조건 없이 쓰기 권한이 부여되어 있습니다.',
      line: getLineNumber(rulesContent, /allow write;/),
      fix: '인증된 사용자나 특정 조건에서만 쓰기 권한을 부여하세요.'
    });
  }
  
  // 4. request.auth 검사 없는 쓰기 권한 확인
  if (rulesContent.includes('allow create') || 
      rulesContent.includes('allow update') ||
      rulesContent.includes('allow delete')) {
    
    // 단순한 패턴 검사이므로 모든 경우를 찾지 못할 수 있음
    if (!rulesContent.includes('request.auth') || 
        !rulesContent.includes('request.auth !=') || 
        !rulesContent.includes('request.auth.uid')) {
      
      analysis.warnings.push({
        severity: 'medium',
        message: '일부 쓰기 규칙에서 사용자 인증 검사가 누락된 것 같습니다.',
        fix: '쓰기 작업 전에 request.auth != null 또는 request.auth.uid 검사를 추가하세요.'
      });
    }
  }
  
  // 5. request.resource 검증 없는 생성/수정 권한 확인
  if ((rulesContent.includes('allow create') || rulesContent.includes('allow update')) &&
      !rulesContent.includes('request.resource.data')) {
    
    analysis.warnings.push({
      severity: 'medium',
      message: '일부 생성/수정 규칙에서 요청 데이터 검증이 누락된 것 같습니다.',
      fix: 'request.resource.data를 사용하여 입력 데이터를 검증하세요.'
    });
  }
}

/**
 * 규칙 파일에서 모범 사례 검사
 * @param {string} rulesContent 규칙 파일 내용
 * @param {Object} analysis 분석 결과 객체
 */
function analyzeBestPractices(rulesContent, analysis) {
  // 1. 함수 재사용 확인
  if (!rulesContent.includes('function ')) {
    analysis.recommendations.push({
      message: '재사용 가능한 함수를 사용하여 규칙을 구성하면 유지 관리가 더 쉬워집니다.',
      example: 'function isSignedIn() { return request.auth != null; }'
    });
  }
  
  // 2. 버전 지정 확인
  if (!rulesContent.includes('rules_version')) {
    analysis.recommendations.push({
      message: '규칙 버전을 명시적으로 지정하는 것이 좋습니다.',
      example: 'rules_version = \'2\';'
    });
  }
  
  // 3. 최소 권한 원칙 강조
  analysis.recommendations.push({
    message: '최소 권한 원칙을 적용하여 필요한 작업에만 권한을 부여하세요.',
    example: '개별 작업(read, write 대신 get, list, create, update, delete)에 대한 권한을 구체적으로 지정하세요.'
  });
  
  // 4. 데이터 검증 패턴 추천
  if (!rulesContent.includes('request.resource.data.size()')) {
    analysis.recommendations.push({
      message: '데이터 크기 및 필드 제한을 확인하여 악의적인 입력을 방지하세요.',
      example: 'request.resource.data.size() <= 10 && request.resource.data.keys().hasOnly([\'name\', \'age\'])'
    });
  }
  
  // 5. 복잡한 보안 규칙 분리 추천
  if (rulesContent.length > 1000 && !rulesContent.includes('function ')) {
    analysis.recommendations.push({
      message: '복잡한 보안 규칙은 함수로 분리하여 가독성과 유지 관리성을 향상시키세요.',
      example: 'function isValidUser() { ... } function hasAccess() { ... }'
    });
  }
}

/**
 * 정규식 패턴과 일치하는 첫 번째 줄 번호 찾기
 * @param {string} content 파일 내용
 * @param {RegExp} pattern 정규식 패턴
 * @returns {number} 줄 번호 (1-based) 또는 찾지 못한 경우 0
 */
function getLineNumber(content, pattern) {
  const lines = content.split('\n');
  
  for (let i = 0; i < lines.length; i++) {
    if (pattern.test(lines[i])) {
      return i + 1;
    }
  }
  
  return 0;
}

/**
 * 분석 보고서 생성
 * @param {Object} results 분석 결과
 * @returns {string} 보고서 파일 경로
 */
function generateReport(results) {
  // 보고서 디렉토리 확인 및 생성
  if (!fs.existsSync(REPORT_DIR)) {
    fs.mkdirSync(REPORT_DIR, { recursive: true });
  }
  
  const timestamp = new Date().toISOString().replace(/:/g, '-');
  const reportPath = path.join(REPORT_DIR, `security-rules-analysis-${timestamp}.json`);
  
  // 요약 정보 계산
  const summary = {
    timestamp,
    rulesAnalyzed: results.filter(r => !r.error).length,
    totalIssues: results.reduce((count, r) => count + (r.issues ? r.issues.length : 0), 0),
    totalWarnings: results.reduce((count, r) => count + (r.warnings ? r.warnings.length : 0), 0),
    totalRecommendations: results.reduce((count, r) => count + (r.recommendations ? r.recommendations.length : 0), 0),
    criticalIssues: results.reduce((count, r) => 
      count + (r.issues ? r.issues.filter(i => i.severity === 'critical').length : 0), 0),
    validationErrors: results.filter(r => r.success === false).length
  };
  
  // 전체 보고서
  const report = {
    summary,
    results
  };
  
  fs.writeFileSync(reportPath, JSON.stringify(report, null, 2));
  log.success(`보안 규칙 분석 보고서가 생성되었습니다: ${reportPath}`);
  
  return reportPath;
}

/**
 * 분석 결과 출력
 * @param {Array} results 분석 결과 배열
 */
function printResults(results) {
  console.log('\n=== Firebase Security Rules 분석 결과 ===\n');
  
  let totalIssues = 0;
  let totalWarnings = 0;
  let totalRecommendations = 0;
  
  for (const result of results) {
    if (result.error) {
      console.log(colors.red(`${result.fileName}: 분석 오류 - ${result.error}`));
      continue;
    }
    
    console.log(colors.cyan(`[${result.fileName}] 분석 결과:`));
    
    // 이슈 출력
    if (result.issues && result.issues.length > 0) {
      console.log(colors.red(`  이슈: ${result.issues.length}개`));
      
      result.issues.forEach(issue => {
        const lineInfo = issue.line ? ` (${issue.line}번 줄)` : '';
        console.log(colors.red(`   - [${issue.severity.toUpperCase()}]${lineInfo} ${issue.message}`));
        
        if (issue.fix) {
          console.log(colors.yellow(`     해결 방법: ${issue.fix}`));
        }
      });
      
      totalIssues += result.issues.length;
    } else {
      console.log(colors.green('  이슈: 없음'));
    }
    
    // 경고 출력
    if (result.warnings && result.warnings.length > 0) {
      console.log(colors.yellow(`  경고: ${result.warnings.length}개`));
      
      result.warnings.forEach(warning => {
        console.log(colors.yellow(`   - [${warning.severity.toUpperCase()}] ${warning.message}`));
        
        if (warning.fix) {
          console.log(colors.yellow(`     해결 방법: ${warning.fix}`));
        }
      });
      
      totalWarnings += result.warnings.length;
    } else {
      console.log(colors.green('  경고: 없음'));
    }
    
    // 권장사항 출력
    if (result.recommendations && result.recommendations.length > 0) {
      console.log(colors.cyan(`  권장사항: ${result.recommendations.length}개`));
      
      result.recommendations.forEach(recommendation => {
        console.log(colors.cyan(`   - ${recommendation.message}`));
        
        if (recommendation.example) {
          console.log(colors.cyan(`     예시: ${recommendation.example}`));
        }
      });
      
      totalRecommendations += result.recommendations.length;
    }
    
    console.log('');
  }
  
  // 요약 출력
  console.log('\n=== 요약 ===');
  console.log(`분석된 규칙 파일: ${results.filter(r => !r.error).length}개`);
  console.log(`발견된 이슈: ${totalIssues}개`);
  console.log(`발견된 경고: ${totalWarnings}개`);
  console.log(`권장사항: ${totalRecommendations}개`);
  
  if (totalIssues === 0 && totalWarnings === 0) {
    console.log(colors.green('\n보안 규칙이 모범 사례를 준수하고 있습니다! 👍'));
  } else if (totalIssues > 0) {
    console.log(colors.red(`\n${totalIssues}개의 이슈를 해결해야 합니다! 자세한 내용은 보고서를 확인하세요.`));
  } else if (totalWarnings > 0) {
    console.log(colors.yellow(`\n${totalWarnings}개의 경고를 검토하세요. 자세한 내용은 보고서를 확인하세요.`));
  }
}

/**
 * 메인 함수
 */
async function main() {
  // 명령행 인수 처리
  const args = process.argv.slice(2);
  const validateDeployment = args.includes('--validate-deployment');
  
  try {
    log.info('Firebase Security Rules 검증 및 분석 시작...');
    
    const results = [];
    
    // Firestore 규칙 분석
    const firestoreRulesFile = findFirestoreRulesFile();
    if (firestoreRulesFile) {
      log.info(`Firestore 규칙 파일 발견: ${firestoreRulesFile}`);
      
      // Firebase CLI로 배포 검증 (선택 사항)
      if (validateDeployment) {
        const validationResult = await validateRules(firestoreRulesFile, 'firestore');
        
        if (validationResult.success) {
          log.success('Firestore 규칙 구문 유효성 검사 통과');
        } else {
          log.error(`Firestore 규칙 구문 오류: ${validationResult.error}`);
          results.push({
            fileName: path.basename(firestoreRulesFile),
            path: firestoreRulesFile,
            success: false,
            error: validationResult.error,
            output: validationResult.output
          });
        }
      }
      
      // 규칙 내용 분석
      const analysisResult = analyzeRules(firestoreRulesFile);
      results.push(analysisResult);
    } else {
      log.warn('Firestore 규칙 파일을 찾을 수 없습니다.');
    }
    
    // Storage 규칙 분석
    const storageRulesFile = findStorageRulesFile();
    if (storageRulesFile) {
      log.info(`Storage 규칙 파일 발견: ${storageRulesFile}`);
      
      // Firebase CLI로 배포 검증 (선택 사항)
      if (validateDeployment) {
        const validationResult = await validateRules(storageRulesFile, 'storage');
        
        if (validationResult.success) {
          log.success('Storage 규칙 구문 유효성 검사 통과');
        } else {
          log.error(`Storage 규칙 구문 오류: ${validationResult.error}`);
          results.push({
            fileName: path.basename(storageRulesFile),
            path: storageRulesFile,
            success: false,
            error: validationResult.error,
            output: validationResult.output
          });
        }
      }
      
      // 규칙 내용 분석
      const analysisResult = analyzeRules(storageRulesFile);
      results.push(analysisResult);
    } else {
      log.warn('Storage 규칙 파일을 찾을 수 없습니다.');
    }
    
    // 결과 보고
    if (results.length > 0) {
      // 보고서 생성
      const reportPath = generateReport(results);
      
      // 결과 출력
      printResults(results);
    } else {
      log.warn('분석할 규칙 파일이 없습니다.');
    }
    
  } catch (error) {
    log.error(`보안 규칙 분석 중 오류 발생: ${error.message}`);
    log.error(error.stack);
    process.exit(1);
  }
}

// 스크립트 실행
if (require.main === module) {
  main().catch(console.error);
}

module.exports = {
  validateRules: main,
  analyzeRulesFile: analyzeRules
};
