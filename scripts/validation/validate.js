/**
 * Firebase 변경 검증 프레임워크
 * 
 * 이 모듈은 Firebase 애플리케이션의 변경사항을 검증하기 위한
 * 통합 실행 시스템을 제공합니다.
 */

const fs = require('fs');
const path = require('path');
const colors = require('colors/safe');
const { program } = require('commander');
const { validateSchema, generateTemplates } = require('./validate-firestore-schema');
const { validateRules, analyzeRulesFile } = require('./validate-security-rules');
const { validateFunctions } = require('./validate-functions');
const { validateIndexes } = require('./validate-firestore-indexes');
const { validateEnvironments } = require('./validate-environments');
const { analyzeDeploymentImpact } = require('./analyze-deployment-impact');
const { generateReport } = require('./utils/report-generator');
const { sendNotifications } = require('./utils/notifications');
const { setupLogger, log } = require('./utils/logger');
const { loadConfig } = require('./utils/config');

// 프로젝트 루트 경로
const PROJECT_ROOT = path.resolve(__dirname, '../..');
const DEFAULT_CONFIG_PATH = path.join(__dirname, 'config/default.json');

/**
 * 개별 검증 작업 실행
 * @param {string} moduleName 검증 모듈 이름
 * @param {Function} validationFn 검증 함수
 * @param {Object} options 검증 옵션
 * @returns {Promise<Object>} 검증 결과
 */
async function runValidation(moduleName, validationFn, options = {}) {
  log.info(`${moduleName} 검증 시작...`);
  
  try {
    const startTime = Date.now();
    const result = await validationFn(options);
    const endTime = Date.now();
    const duration = (endTime - startTime) / 1000;
    
    log.info(`${moduleName} 검증 완료 (${duration.toFixed(2)}초)`);
    
    return {
      name: moduleName,
      result,
      duration,
      success: result.valid !== false,
      timestamp: new Date().toISOString()
    };
  } catch (error) {
    log.error(`${moduleName} 검증 중 오류 발생: ${error.message}`);
    
    return {
      name: moduleName,
      error: error.message,
      stack: error.stack,
      success: false,
      timestamp: new Date().toISOString()
    };
  }
}

/**
 * 전체 검증 파이프라인 실행
 * @param {Object} options 전체 검증 옵션
 * @returns {Promise<Object>} 검증 결과
 */
async function runValidationPipeline(options = {}) {
  log.info('Firebase 변경 검증 파이프라인 시작...');
  
  const startTime = Date.now();
  const results = {};
  
  // 설정 로드
  const config = loadConfig(options.configPath || DEFAULT_CONFIG_PATH);
  
  try {
    // 1. Firestore 스키마 검증
    if (options.all || options.schema) {
      results.schema = await runValidation(
        'Firestore 스키마',
        validateSchema,
        { generateTemplates: options.generateTemplates }
      );
    }
    
    // 2. Security Rules 검증
    if (options.all || options.rules) {
      results.securityRules = await runValidation(
        'Security Rules',
        validateRules,
        { validateDeployment: options.validateDeployment }
      );
    }
    
    // 3. Firebase Functions 검증
    if (options.all || options.functions) {
      results.functions = await runValidation(
        'Firebase Functions',
        validateFunctions
      );
    }
    
    // 4. Firestore 인덱스 검증
    if (options.all || options.indexes) {
      results.indexes = await runValidation(
        'Firestore 인덱스',
        validateIndexes
      );
    }
    
    // 5. 환경 구성 검증
    if (options.all || options.environments) {
      results.environments = await runValidation(
        '환경 구성',
        validateEnvironments
      );
    }
    
    // 6. 배포 영향 분석
    if (options.all || options.impact) {
      results.deploymentImpact = await runValidation(
        '배포 영향 분석',
        analyzeDeploymentImpact
      );
    }
    
    // 검증 결과 집계
    const endTime = Date.now();
    const duration = (endTime - startTime) / 1000;
    const allSuccess = Object.values(results).every(r => r.success);
    
    // 종합 결과
    const summary = {
      timestamp: new Date().toISOString(),
      duration,
      success: allSuccess,
      validations: Object.keys(results).map(key => ({
        name: results[key].name,
        success: results[key].success,
        duration: results[key].duration
      }))
    };
    
    // 오류 및 경고 카운트
    summary.errors = countIssues(results, 'error');
    summary.warnings = countIssues(results, 'warning');
    summary.recommendations = countIssues(results, 'recommendation');
    
    // 최종 결과 생성
    const finalResult = {
      summary,
      results
    };
    
    // 보고서 생성
    if (options.report) {
      const reportPath = await generateReport(finalResult, {
        format: options.reportFormat || 'json',
        outputDir: options.reportDir,
        projectRoot: PROJECT_ROOT
      });
      
      log.info(`검증 보고서가 생성되었습니다: ${reportPath}`);
    }
    
    // 알림 전송
    if (options.notify && !allSuccess) {
      await sendNotifications(finalResult, {
        channels: options.notifyChannels || ['slack'],
        criticalOnly: options.notifyCriticalOnly
      });
    }
    
    return finalResult;
  } catch (error) {
    log.error(`검증 파이프라인 실행 중 오류 발생: ${error.message}`);
    log.debug(error.stack);
    
    return {
      success: false,
      error: error.message,
      timestamp: new Date().toISOString()
    };
  }
}

/**
 * 결과에서 이슈 개수 집계
 * @param {Object} results 검증 결과
 * @param {string} type 이슈 유형 (error, warning, recommendation)
 * @returns {number} 이슈 개수
 */
function countIssues(results, type) {
  let count = 0;
  
  for (const key in results) {
    const result = results[key].result;
    
    if (!result) continue;
    
    // 배열로 된 이슈 리스트
    if (Array.isArray(result[`${type}s`])) {
      count += result[`${type}s`].length;
    } 
    // 이슈 객체가 있는 경우
    else if (result.issues) {
      count += result.issues.filter(issue => issue.severity === type).length;
    }
  }
  
  return count;
}

/**
 * 결과 출력
 * @param {Object} finalResult 최종 결과
 */
function printResults(finalResult) {
  const { summary, results } = finalResult;
  
  console.log('\n=== Firebase 변경 검증 요약 ===');
  console.log(`검증 시간: ${new Date(summary.timestamp).toLocaleString()}`);
  console.log(`총 소요 시간: ${summary.duration.toFixed(2)}초`);
  console.log(`전체 결과: ${summary.success ? colors.green('성공 ✓') : colors.red('실패 ✗')}`);
  console.log(`오류: ${summary.errors}개, 경고: ${summary.warnings}개, 권장사항: ${summary.recommendations}개\n`);
  
  // 개별 검증 결과 출력
  console.log('=== 개별 검증 결과 ===');
  
  for (const key in results) {
    const validation = results[key];
    const resultIcon = validation.success ? colors.green('✓') : colors.red('✗');
    
    console.log(`${validation.name}: ${resultIcon} (${validation.duration?.toFixed(2) || 'N/A'}초)`);
    
    // 오류가 있는 경우 상세 정보 출력
    if (!validation.success) {
      if (validation.error) {
        console.log(colors.red(`  오류: ${validation.error}`));
      } else if (validation.result && validation.result.issues) {
        const criticalIssues = validation.result.issues.filter(i => i.severity === 'critical');
        
        criticalIssues.slice(0, 3).forEach(issue => {
          console.log(colors.red(`  - ${issue.message}`));
        });
        
        if (criticalIssues.length > 3) {
          console.log(colors.red(`  - ... 외 ${criticalIssues.length - 3}개 심각한 이슈`));
        }
      }
    }
  }
  
  // 최종 결과 출력
  console.log('\n=== 최종 결과 ===');
  
  if (summary.success) {
    console.log(colors.green('모든 검증을 통과했습니다! 👍'));
  } else {
    console.log(colors.red(`검증에 실패했습니다. ${summary.errors}개의 오류와 ${summary.warnings}개의 경고가 발견되었습니다.`));
    console.log(colors.yellow('자세한 내용은 보고서를 확인하세요.'));
  }
}

/**
 * 명령행 인터페이스 설정
 */
function setupCLI() {
  program
    .name('firebase-validator')
    .description('Firebase 변경 검증 프레임워크')
    .version('1.0.0');
  
  program
    .option('-a, --all', '모든 검증 실행')
    .option('-s, --schema', 'Firestore 스키마 검증 실행')
    .option('-r, --rules', 'Security Rules 검증 실행')
    .option('-f, --functions', 'Firebase Functions 검증 실행')
    .option('-i, --indexes', 'Firestore 인덱스 검증 실행')
    .option('-e, --environments', '환경 구성 검증 실행')
    .option('--impact', '배포 영향 분석 실행')
    .option('--generate-templates', '스키마 템플릿 자동 생성')
    .option('--validate-deployment', '배포 검증 실행')
    .option('--report', '검증 보고서 생성')
    .option('--report-format <format>', '보고서 형식 (json 또는 html)', 'json')
    .option('--report-dir <dir>', '보고서 출력 디렉토리')
    .option('--notify', '알림 전송 (검증 실패 시)')
    .option('--notify-channels <channels>', '알림 채널 (쉼표로 구분)', 'slack')
    .option('--notify-critical-only', '심각한 이슈만 알림')
    .option('--config <path>', '설정 파일 경로')
    .option('--verbose', '상세 로그 출력')
    .option('--silent', '최소 로그 출력');
  
  program.parse();
  
  return program.opts();
}

/**
 * 메인 함수
 */
async function main() {
  // 명령행 옵션 파싱
  const options = setupCLI();
  
  // 로거 설정
  setupLogger({
    verbose: options.verbose,
    silent: options.silent
  });
  
  // 옵션이 지정되지 않은 경우 모든 검증 실행
  if (!options.all && 
      !options.schema && 
      !options.rules && 
      !options.functions && 
      !options.indexes && 
      !options.environments && 
      !options.impact) {
    options.all = true;
  }
  
  // 검증 파이프라인 실행
  const finalResult = await runValidationPipeline(options);
  
  // 결과 출력
  printResults(finalResult);
  
  // 종료 코드 설정
  process.exit(finalResult.summary?.success ? 0 : 1);
}

// 스크립트가 직접 실행된 경우에만 실행
if (require.main === module) {
  main().catch(error => {
    console.error('오류 발생:', error);
    process.exit(1);
  });
}

module.exports = {
  runValidationPipeline,
  runValidation
};