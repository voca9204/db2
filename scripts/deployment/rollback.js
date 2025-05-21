#!/usr/bin/env node

/**
 * Firebase 배포 롤백 스크립트
 * 
 * 이 스크립트는 Firebase 배포 실패 또는 문제 발생 시 이전 상태로 롤백하는 기능을 제공합니다.
 * 
 * 사용법:
 *   node rollback.js --env=production --backup-id=20250521-120000 --components=firestore,functions,rules
 */

const fs = require('fs');
const path = require('path');
const colors = require('colors/safe');
const { execSync } = require('child_process');
const { spawnSync } = require('child_process');
const readline = require('readline');

// 프로젝트 루트 경로
const PROJECT_ROOT = path.join(__dirname, '../..');
const BACKUP_DIR = path.join(PROJECT_ROOT, 'backup');

// 로그 함수
const log = {
  info: (msg) => console.log(colors.cyan(`[INFO] ${msg}`)),
  warn: (msg) => console.log(colors.yellow(`[WARN] ${msg}`)),
  error: (msg) => console.log(colors.red(`[ERROR] ${msg}`)),
  success: (msg) => console.log(colors.green(`[SUCCESS] ${msg}`))
};

/**
 * 사용법 출력
 */
function printUsage() {
  console.log(`
Firebase 배포 롤백 스크립트

사용법: 
  node rollback.js [옵션]

옵션:
  --env=<env>           환경 (development, staging, production) (필수)
  --backup-id=<id>      백업 ID 또는 'latest' (필수)
  --components=<comps>  롤백할 구성 요소 (firestore,functions,storage,hosting,rules) (필수)
  --dry-run             실제 롤백 없이 시뮬레이션만 실행
  --help                이 도움말 표시

예시:
  node rollback.js --env=production --backup-id=latest --components=firestore,functions
  node rollback.js --env=staging --backup-id=20250520-152245 --components=firestore,rules
  node rollback.js --env=development --backup-id=latest --components=all
  `);
}

/**
 * 백업 목록 가져오기
 * @param {string} env 환경 (development, staging, production)
 * @returns {Array} 백업 목록
 */
function getBackupList(env) {
  const envBackupDir = path.join(BACKUP_DIR, env);
  
  // 환경별 백업 디렉토리 확인
  if (!fs.existsSync(envBackupDir)) {
    log.warn(`환경 '${env}'에 대한 백업 디렉토리가 없습니다: ${envBackupDir}`);
    return [];
  }
  
  // 백업 디렉토리 목록 가져오기
  const backups = [];
  
  try {
    const entries = fs.readdirSync(envBackupDir, { withFileTypes: true });
    
    for (const entry of entries) {
      if (entry.isDirectory()) {
        const backupInfoPath = path.join(envBackupDir, entry.name, 'backup-info.json');
        
        if (fs.existsSync(backupInfoPath)) {
          try {
            const backupInfo = JSON.parse(fs.readFileSync(backupInfoPath, 'utf8'));
            backups.push({
              id: entry.name,
              path: path.join(envBackupDir, entry.name),
              timestamp: backupInfo.timestamp,
              components: backupInfo.backupComponents || [],
              backupType: backupInfo.backupType || 'unknown',
              notes: backupInfo.notes || ''
            });
          } catch (error) {
            log.warn(`백업 정보 파일을 읽을 수 없습니다: ${backupInfoPath}`);
          }
        }
      }
    }
    
    // 타임스탬프 기준 내림차순 정렬
    backups.sort((a, b) => new Date(b.timestamp) - new Date(a.timestamp));
    
    return backups;
  } catch (error) {
    log.error(`백업 목록 가져오기 오류: ${error.message}`);
    return [];
  }
}
/**
 * 백업 ID로 백업 찾기
 * @param {Array} backups 백업 목록
 * @param {string} backupId 백업 ID 또는 'latest'
 * @returns {Object|null} 백업 정보
 */
function findBackup(backups, backupId) {
  if (backupId === 'latest') {
    return backups.length > 0 ? backups[0] : null;
  }
  
  return backups.find(backup => backup.id === backupId);
}

/**
 * Firebase 프로젝트 ID 가져오기
 * @param {string} env 환경 (development, staging, production)
 * @returns {string} Firebase 프로젝트 ID
 */
function getFirebaseProjectId(env) {
  switch (env) {
    case 'development':
      return 'db888-dev';
    case 'staging':
      return 'db888-staging';
    case 'production':
      return 'db888';
    default:
      throw new Error(`유효하지 않은 환경: ${env}`);
  }
}

/**
 * 롤백 확인 프롬프트
 * @param {Object} backup 백업 정보
 * @param {string} env 환경
 * @param {Array} components 롤백할 구성 요소
 * @returns {Promise<boolean>} 확인 여부
 */
async function confirmRollback(backup, env, components) {
  const projectId = getFirebaseProjectId(env);
  
  console.log('\n=== 롤백 확인 ===');
  console.log(`환경: ${env} (${projectId})`);
  console.log(`백업 ID: ${backup.id}`);
  console.log(`백업 시간: ${backup.timestamp}`);
  console.log(`롤백할 구성 요소: ${components.join(', ')}`);
  
  if (backup.notes) {
    console.log(`백업 설명: ${backup.notes}`);
  }
  
  console.log('\n경고: 이 작업은 되돌릴 수 없습니다!');
  console.log(colors.yellow('롤백하면 현재 데이터가 백업 시점의 데이터로 대체됩니다.'));
  
  // 사용자 확인 프롬프트
  const rl = readline.createInterface({
    input: process.stdin,
    output: process.stdout
  });
  
  return new Promise(resolve => {
    rl.question('계속하시겠습니까? (y/N): ', answer => {
      rl.close();
      resolve(answer.toLowerCase() === 'y');
    });
  });
}
/**
 * Firestore 데이터베이스 롤백
 * @param {Object} backup 백업 정보
 * @param {string} projectId Firebase 프로젝트 ID
 * @param {boolean} dryRun 드라이 런 여부
 * @returns {boolean} 성공 여부
 */
function rollbackFirestore(backup, projectId, dryRun) {
  log.info('Firestore 데이터베이스 롤백 중...');
  
  const firestorePath = path.join(backup.path, 'firestore');
  if (!fs.existsSync(firestorePath)) {
    log.warn('백업에 Firestore 데이터가 없습니다.');
    return false;
  }
  
  try {
    if (dryRun) {
      log.info('드라이 런 모드: Firestore 데이터베이스 롤백이 시뮬레이션됩니다.');
      return true;
    }
    
    // 이전 데이터 삭제
    log.info('Firestore 데이터베이스 지우는 중...');
    execSync(`firebase firestore:delete --project=${projectId} --all-collections --yes`, {
      stdio: 'inherit'
    });
    
    // 백업 데이터 가져오기
    log.info('백업 데이터 가져오는 중...');
    execSync(`firebase emulators:start --only firestore --import=${firestorePath} --export-on-exit=${firestorePath} --project=${projectId}`, {
      stdio: 'inherit',
      timeout: 10000 // 10초 후 강제 종료
    });
    
    log.success('Firestore 데이터베이스 롤백 완료');
    return true;
  } catch (error) {
    log.error(`Firestore 데이터베이스 롤백 오류: ${error.message}`);
    return false;
  }
}

/**
 * Firebase Functions 롤백
 * @param {Object} backup 백업 정보
 * @param {string} projectId Firebase 프로젝트 ID
 * @param {boolean} dryRun 드라이 런 여부
 * @returns {boolean} 성공 여부
 */
function rollbackFunctions(backup, projectId, dryRun) {
  log.info('Firebase Functions 롤백 중...');
  
  const functionsPath = path.join(backup.path, 'functions');
  if (!fs.existsSync(functionsPath)) {
    log.warn('백업에 Functions 데이터가 없습니다.');
    return false;
  }
  
  try {
    if (dryRun) {
      log.info('드라이 런 모드: Firebase Functions 롤백이 시뮬레이션됩니다.');
      return true;
    }
    
    // 백업된 Functions 소스를 임시 디렉토리에 복사
    const tempFunctionsDir = path.join(PROJECT_ROOT, 'functions-backup');
    if (fs.existsSync(tempFunctionsDir)) {
      fs.rmdirSync(tempFunctionsDir, { recursive: true });
    }
    
    fs.mkdirSync(tempFunctionsDir, { recursive: true });
    execSync(`cp -r ${functionsPath}/* ${tempFunctionsDir}`);
    
    // Functions 배포
    log.info('백업된 Functions 배포 중...');
    execSync(`cd ${tempFunctionsDir} && npm install && firebase deploy --only functions --project=${projectId}`, {
      stdio: 'inherit'
    });
    
    // 임시 디렉토리 정리
    fs.rmdirSync(tempFunctionsDir, { recursive: true });
    
    log.success('Firebase Functions 롤백 완료');
    return true;
  } catch (error) {
    log.error(`Firebase Functions 롤백 오류: ${error.message}`);
    return false;
  }
}
/**
 * Firebase Security Rules 롤백
 * @param {Object} backup 백업 정보
 * @param {string} projectId Firebase 프로젝트 ID
 * @param {boolean} dryRun 드라이 런 여부
 * @returns {boolean} 성공 여부
 */
function rollbackRules(backup, projectId, dryRun) {
  log.info('Firebase Security Rules 롤백 중...');
  
  const configPath = path.join(backup.path, 'config');
  if (!fs.existsSync(configPath)) {
    log.warn('백업에 Security Rules 데이터가 없습니다.');
    return false;
  }
  
  try {
    if (dryRun) {
      log.info('드라이 런 모드: Firebase Security Rules 롤백이 시뮬레이션됩니다.');
      return true;
    }
    
    // Firestore Rules 롤백
    const firestoreRulesPath = path.join(configPath, 'firestore.rules');
    if (fs.existsSync(firestoreRulesPath)) {
      log.info('Firestore Rules 롤백 중...');
      fs.copyFileSync(firestoreRulesPath, path.join(PROJECT_ROOT, 'firestore.rules'));
      execSync(`firebase deploy --only firestore:rules --project=${projectId}`, {
        stdio: 'inherit'
      });
    }
    
    // Storage Rules 롤백
    const storageRulesPath = path.join(configPath, 'storage.rules');
    if (fs.existsSync(storageRulesPath)) {
      log.info('Storage Rules 롤백 중...');
      fs.copyFileSync(storageRulesPath, path.join(PROJECT_ROOT, 'storage.rules'));
      execSync(`firebase deploy --only storage:rules --project=${projectId}`, {
        stdio: 'inherit'
      });
    }
    
    log.success('Firebase Security Rules 롤백 완료');
    return true;
  } catch (error) {
    log.error(`Firebase Security Rules 롤백 오류: ${error.message}`);
    return false;
  }
}

/**
 * 롤백 실행
 * @param {Object} backup 백업 정보
 * @param {string} env 환경
 * @param {Array} components 롤백할 구성 요소
 * @param {boolean} dryRun 드라이 런 여부
 * @returns {Object} 롤백 결과
 */
async function performRollback(backup, env, components, dryRun) {
  const projectId = getFirebaseProjectId(env);
  const results = {};
  
  log.info(`Firebase 롤백 시작 (환경: ${env}, 프로젝트: ${projectId})`);
  
  // 각 구성 요소 롤백
  if (components.includes('firestore')) {
    results.firestore = rollbackFirestore(backup, projectId, dryRun);
  }
  
  if (components.includes('functions')) {
    results.functions = rollbackFunctions(backup, projectId, dryRun);
  }
  
  if (components.includes('rules')) {
    results.rules = rollbackRules(backup, projectId, dryRun);
  }
  
  // 롤백 결과 요약
  const success = Object.values(results).every(result => result);
  
  log.info('\n=== 롤백 결과 ===');
  
  for (const [component, result] of Object.entries(results)) {
    if (result) {
      log.success(`${component}: 성공`);
    } else {
      log.error(`${component}: 실패`);
    }
  }
  
  if (success) {
    log.success('\n모든 구성 요소가 성공적으로 롤백되었습니다!');
  } else {
    log.error('\n일부 구성 요소 롤백에 실패했습니다. 로그를 확인하세요.');
  }
  
  return {
    success,
    results
  };
}
/**
 * 메인 함수
 */
async function main() {
  // 명령행 인수 처리
  const args = process.argv.slice(2);
  
  let env = '';
  let backupId = '';
  let componentsStr = '';
  let dryRun = false;
  
  // 인수 파싱
  for (const arg of args) {
    if (arg === '--help' || arg === '-h') {
      printUsage();
      return;
    } else if (arg.startsWith('--env=')) {
      env = arg.replace('--env=', '');
    } else if (arg.startsWith('--backup-id=')) {
      backupId = arg.replace('--backup-id=', '');
    } else if (arg.startsWith('--components=')) {
      componentsStr = arg.replace('--components=', '');
    } else if (arg === '--dry-run') {
      dryRun = true;
    }
  }
  
  // 필수 인수 확인
  if (!env || !backupId || !componentsStr) {
    log.error('필수 인수가 누락되었습니다.');
    printUsage();
    return;
  }
  
  // 환경 유효성 검사
  if (!['development', 'staging', 'production'].includes(env)) {
    log.error(`유효하지 않은 환경: ${env}`);
    log.info('유효한 환경: development, staging, production');
    return;
  }
  
  // 구성 요소 파싱
  let components = componentsStr.toLowerCase().split(',');
  
  if (components.includes('all')) {
    components = ['firestore', 'functions', 'storage', 'hosting', 'rules'];
  }
  
  // 유효한 구성 요소 필터링
  const validComponents = ['firestore', 'functions', 'storage', 'hosting', 'rules'];
  components = components.filter(comp => validComponents.includes(comp));
  
  if (components.length === 0) {
    log.error('유효한 구성 요소가 지정되지 않았습니다.');
    log.info(`유효한 구성 요소: ${validComponents.join(', ')}`);
    return;
  }
  
  try {
    // 백업 목록 가져오기
    const backups = getBackupList(env);
    
    if (backups.length === 0) {
      log.error(`환경 '${env}'에 대한 백업이 없습니다.`);
      return;
    }
    
    // 백업 찾기
    const backup = findBackup(backups, backupId);
    
    if (!backup) {
      log.error(`백업 ID '${backupId}'를 찾을 수 없습니다.`);
      
      if (backups.length > 0) {
        log.info('\n사용 가능한 백업:');
        backups.forEach(b => {
          log.info(`- ${b.id} (${b.timestamp})`);
        });
      }
      
      return;
    }
    
    // 드라이 런 모드 확인
    if (dryRun) {
      log.info('드라이 런 모드: 실제 변경 사항이 적용되지 않습니다.');
    }
    
    // 롤백 확인
    const confirmed = await confirmRollback(backup, env, components);
    
    if (!confirmed) {
      log.info('롤백이 취소되었습니다.');
      return;
    }
    
    // 롤백 실행
    await performRollback(backup, env, components, dryRun);
    
  } catch (error) {
    log.error(`롤백 중 오류 발생: ${error.message}`);
    console.error(error);
  }
}

// 스크립트 직접 실행 시
if (require.main === module) {
  main().catch(console.error);
}

module.exports = {
  performRollback,
  getBackupList,
  findBackup
};