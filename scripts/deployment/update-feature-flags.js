/**
 * Firebase 피처 플래그 관리 시스템
 * 
 * 이 모듈은 Firebase에서 피처 플래그를 관리하기 위한 기능을 제공합니다.
 * 피처 플래그를 사용하여 새로운 기능을 점진적으로 출시하거나,
 * A/B 테스트를 수행하거나, 긴급 상황에서 기능을 비활성화할 수 있습니다.
 */

const admin = require('firebase-admin');
const fs = require('fs');
const path = require('path');
const colors = require('colors/safe');

// 프로젝트 루트 경로
const PROJECT_ROOT = path.join(__dirname, '../..');
const CONFIG_DIR = path.join(__dirname, 'config');

// 로그 함수
const log = {
  info: (msg) => console.log(colors.cyan(`[INFO] ${msg}`)),
  warn: (msg) => console.log(colors.yellow(`[WARN] ${msg}`)),
  error: (msg) => console.log(colors.red(`[ERROR] ${msg}`)),
  success: (msg) => console.log(colors.green(`[SUCCESS] ${msg}`))
};

/**
 * Firebase Admin SDK 초기화
 * @param {string} env 환경 (development, staging, production)
 * @returns {Object} Firestore 데이터베이스 인스턴스
 */
function initializeFirebase(env) {
  // 이미 초기화된 경우 재사용
  if (admin.apps.length > 0) {
    return admin.firestore();
  }
  
  // 환경에 따른 프로젝트 ID 설정
  let projectId;
  switch (env) {
    case 'development':
      projectId = 'db888-dev';
      break;
    case 'staging':
      projectId = 'db888-staging';
      break;
    case 'production':
      projectId = 'db888';
      break;
    default:
      throw new Error(`유효하지 않은 환경: ${env}`);
  }
  
  try {
    // 서비스 계정 키 경로
    const serviceAccountPath = process.env.GOOGLE_APPLICATION_CREDENTIALS || 
                              path.join(PROJECT_ROOT, `firebase/service-account-${env}.json`);
    
    // 서비스 계정 키가 있는 경우
    if (fs.existsSync(serviceAccountPath)) {
      admin.initializeApp({
        credential: admin.credential.cert(require(serviceAccountPath)),
        projectId
      });
      log.info(`Firebase Admin SDK가 서비스 계정으로 초기화되었습니다. (환경: ${env})`);
    } 
    // 서비스 계정 키가 없는 경우 (CI/CD 환경 등)
    else {
      admin.initializeApp({
        projectId
      });
      log.info(`Firebase Admin SDK가 애플리케이션 기본 자격 증명으로 초기화되었습니다. (환경: ${env})`);
    }
    
    return admin.firestore();
  } catch (error) {
    log.error(`Firebase 초기화 오류: ${error.message}`);
    throw error;
  }
}

/**
 * 피처 플래그 구성 로드
 * @param {string} env 환경 (development, staging, production)
 * @returns {Object} 피처 플래그 구성
 */
function loadFeatureFlags(env) {
  const configFile = path.join(CONFIG_DIR, `feature-flags-${env}.json`);
  
  // 구성 파일이 없는 경우 기본 구성 생성
  if (!fs.existsSync(configFile)) {
    log.warn(`피처 플래그 구성 파일이 없습니다: ${configFile}`);
    
    // 구성 디렉토리 확인 및 생성
    if (!fs.existsSync(CONFIG_DIR)) {
      fs.mkdirSync(CONFIG_DIR, { recursive: true });
    }
    
    // 기본 구성 생성
    const defaultConfig = {
      flags: [
        {
          id: 'new_ui',
          name: '새로운 UI',
          description: '새로운 사용자 인터페이스 활성화',
          enabled: env !== 'production',
          rolloutPercentage: env === 'production' ? 0 : (env === 'staging' ? 50 : 100),
          targetGroups: [],
          createdAt: new Date().toISOString(),
          updatedAt: new Date().toISOString()
        },
        {
          id: 'advanced_analytics',
          name: '고급 분석',
          description: '고급 사용자 분석 기능 활성화',
          enabled: env !== 'production',
          rolloutPercentage: env === 'production' ? 0 : 100,
          targetGroups: ['admin', 'analyst'],
          createdAt: new Date().toISOString(),
          updatedAt: new Date().toISOString()
        }
      ]
    };
    
    // 기본 구성 파일 저장
    fs.writeFileSync(configFile, JSON.stringify(defaultConfig, null, 2));
    log.info(`기본 피처 플래그 구성 파일이 생성되었습니다: ${configFile}`);
    
    return defaultConfig;
  }
  
  // 구성 파일 로드
  try {
    const config = JSON.parse(fs.readFileSync(configFile, 'utf8'));
    log.info(`피처 플래그 구성 로드 완료: ${config.flags.length}개 플래그`);
    return config;
  } catch (error) {
    log.error(`피처 플래그 구성 로드 오류: ${error.message}`);
    throw error;
  }
}

/**
 * Firestore에서 현재 피처 플래그 가져오기
 * @param {Object} db Firestore 인스턴스
 * @returns {Promise<Object>} 피처 플래그 데이터
 */
async function getCurrentFeatureFlags(db) {
  try {
    // 피처 플래그 컬렉션
    const flagsCollection = db.collection('featureFlags');
    const snapshot = await flagsCollection.get();
    
    if (snapshot.empty) {
      log.warn('Firestore에 피처 플래그가 없습니다.');
      return { flags: [] };
    }
    
    // 피처 플래그 데이터 추출
    const flags = [];
    snapshot.forEach(doc => {
      flags.push({
        id: doc.id,
        ...doc.data()
      });
    });
    
    log.info(`Firestore에서 ${flags.length}개 피처 플래그를 가져왔습니다.`);
    return { flags };
  } catch (error) {
    log.error(`Firestore에서 피처 플래그 가져오기 오류: ${error.message}`);
    throw error;
  }
}

/**
 * 피처 플래그 배포
 * @param {Object} db Firestore 인스턴스
 * @param {Object} config 피처 플래그 구성
 * @returns {Promise<void>}
 */
async function deployFeatureFlags(db, config) {
  try {
    log.info('피처 플래그 배포 중...');
    
    // Firestore에 피처 플래그 배포
    const batch = db.batch();
    const flagsCollection = db.collection('featureFlags');
    
    // 현재 시간
    const now = new Date().toISOString();
    
    // 각 플래그 처리
    for (const flag of config.flags) {
      const flagRef = flagsCollection.doc(flag.id);
      
      // 생성/수정 시간 업데이트
      flag.updatedAt = now;
      if (!flag.createdAt) {
        flag.createdAt = now;
      }
      
      batch.set(flagRef, flag);
    }
    
    // 배치 커밋
    await batch.commit();
    log.success(`${config.flags.length}개 피처 플래그가 성공적으로 배포되었습니다.`);
  } catch (error) {
    log.error(`피처 플래그 배포 오류: ${error.message}`);
    throw error;
  }
}

/**
 * 피처 플래그 백업
 * @param {Object} flags 피처 플래그 데이터
 * @param {string} env 환경 (development, staging, production)
 */
function backupFeatureFlags(flags, env) {
  // 백업 디렉토리 확인 및 생성
  const backupDir = path.join(CONFIG_DIR, 'backups');
  if (!fs.existsSync(backupDir)) {
    fs.mkdirSync(backupDir, { recursive: true });
  }
  
  // 현재 시간을 포함한 백업 파일 이름
  const timestamp = new Date().toISOString().replace(/:/g, '-');
  const backupFile = path.join(backupDir, `feature-flags-${env}-${timestamp}.json`);
  
  // 백업 파일 저장
  fs.writeFileSync(backupFile, JSON.stringify(flags, null, 2));
  log.success(`피처 플래그 백업 파일이 생성되었습니다: ${backupFile}`);
}

/**
 * 피처 플래그 업데이트
 * @param {string} env 환경 (development, staging, production)
 * @param {Object} options 옵션
 * @returns {Promise<void>}
 */
async function updateFeatureFlags(env, options = {}) {
  const { backup = true, force = false, dryRun = false } = options;
  
  try {
    log.info(`환경 '${env}'의 피처 플래그 업데이트 시작...`);
    
    // Firebase 초기화
    const db = initializeFirebase(env);
    
    // 현재 피처 플래그 가져오기
    const currentFlags = await getCurrentFeatureFlags(db);
    
    // 현재 플래그 백업
    if (backup && currentFlags.flags.length > 0) {
      backupFeatureFlags(currentFlags, env);
    }
    
    // 새 피처 플래그 구성 로드
    const newFlags = loadFeatureFlags(env);
    
    // 변경 사항 확인
    const changes = compareFeatureFlags(currentFlags, newFlags);
    
    // 변경 사항 없음
    if (!changes.hasChanges && !force) {
      log.info('변경 사항이 없습니다. 업데이트가 필요하지 않습니다.');
      return;
    }
    
    // 변경 사항 요약 출력
    logFeatureFlagChanges(changes);
    
    // 드라이 런 모드
    if (dryRun) {
      log.info('드라이 런 모드: 실제 변경 사항이 적용되지 않습니다.');
      return;
    }
    
    // 피처 플래그 배포
    await deployFeatureFlags(db, newFlags);
    
  } catch (error) {
    log.error(`피처 플래그 업데이트 오류: ${error.message}`);
    throw error;
  }
}

/**
 * 피처 플래그 비교
 * @param {Object} current 현재 피처 플래그
 * @param {Object} updated 업데이트된 피처 플래그
 * @returns {Object} 변경 사항
 */
function compareFeatureFlags(current, updated) {
  const changes = {
    hasChanges: false,
    added: [],
    removed: [],
    modified: []
  };
  
  // 현재 플래그 맵
  const currentFlagsMap = {};
  for (const flag of current.flags) {
    currentFlagsMap[flag.id] = flag;
  }
  
  // 업데이트된 플래그 맵
  const updatedFlagsMap = {};
  for (const flag of updated.flags) {
    updatedFlagsMap[flag.id] = flag;
    
    // 새로 추가된 플래그
    if (!currentFlagsMap[flag.id]) {
      changes.added.push(flag);
      changes.hasChanges = true;
    }
    // 수정된 플래그
    else if (JSON.stringify(flag) !== JSON.stringify(currentFlagsMap[flag.id])) {
      changes.modified.push({
        id: flag.id,
        before: currentFlagsMap[flag.id],
        after: flag
      });
      changes.hasChanges = true;
    }
  }
  
  // 제거된 플래그
  for (const flag of current.flags) {
    if (!updatedFlagsMap[flag.id]) {
      changes.removed.push(flag);
      changes.hasChanges = true;
    }
  }
  
  return changes;
}

/**
 * 피처 플래그 변경 사항 로그 출력
 * @param {Object} changes 변경 사항
 */
function logFeatureFlagChanges(changes) {
  log.info('\n=== 피처 플래그 변경 사항 ===');
  
  // 추가된 플래그
  if (changes.added.length > 0) {
    log.info(`추가: ${changes.added.length}개`);
    changes.added.forEach(flag => {
      log.info(`  + ${flag.id}: ${flag.name} (${flag.enabled ? '활성화' : '비활성화'}, ${flag.rolloutPercentage}%)`);
    });
  }
  
  // 수정된 플래그
  if (changes.modified.length > 0) {
    log.info(`수정: ${changes.modified.length}개`);
    changes.modified.forEach(change => {
      log.info(`  ~ ${change.id}: ${change.after.name}`);
      
      // 활성화 상태 변경
      if (change.before.enabled !== change.after.enabled) {
        log.info(`    > 활성화 상태: ${change.before.enabled ? '활성화' : '비활성화'} -> ${change.after.enabled ? '활성화' : '비활성화'}`);
      }
      
      // 롤아웃 비율 변경
      if (change.before.rolloutPercentage !== change.after.rolloutPercentage) {
        log.info(`    > 롤아웃 비율: ${change.before.rolloutPercentage}% -> ${change.after.rolloutPercentage}%`);
      }
      
      // 대상 그룹 변경
      const beforeGroups = change.before.targetGroups || [];
      const afterGroups = change.after.targetGroups || [];
      if (JSON.stringify(beforeGroups) !== JSON.stringify(afterGroups)) {
        log.info(`    > 대상 그룹: [${beforeGroups.join(', ')}] -> [${afterGroups.join(', ')}]`);
      }
    });
  }
  
  // 제거된 플래그
  if (changes.removed.length > 0) {
    log.info(`제거: ${changes.removed.length}개`);
    changes.removed.forEach(flag => {
      log.info(`  - ${flag.id}: ${flag.name}`);
    });
  }
  
  // 변경 사항 없음
  if (!changes.hasChanges) {
    log.info('변경 사항 없음');
  }
}

/**
 * 메인 함수
 */
async function main() {
  // 명령행 인수 처리
  const args = process.argv.slice(2);
  
  let env = 'development';
  let dryRun = false;
  let force = false;
  
  // 인수 파싱
  for (let i = 0; i < args.length; i++) {
    const arg = args[i];
    
    if (arg === '--env' && i + 1 < args.length) {
      env = args[++i];
    } else if (arg === '--dry-run') {
      dryRun = true;
    } else if (arg === '--force') {
      force = true;
    }
  }
  
  // 환경 유효성 검사
  if (!['development', 'staging', 'production'].includes(env)) {
    log.error(`유효하지 않은 환경: ${env}`);
    log.info('유효한 환경: development, staging, production');
    process.exit(1);
  }
  
  try {
    // 피처 플래그 업데이트
    await updateFeatureFlags(env, { dryRun, force });
  } catch (error) {
    log.error(`피처 플래그 업데이트 실패: ${error.message}`);
    process.exit(1);
  }
}

// 스크립트 직접 실행 시
if (require.main === module) {
  main().catch(console.error);
}

module.exports = {
  updateFeatureFlags,
  getCurrentFeatureFlags,
  loadFeatureFlags,
  compareFeatureFlags
};
