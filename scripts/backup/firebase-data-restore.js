/**
 * Firebase Firestore 데이터 복원 스크립트
 * 
 * 백업된 Firebase Firestore 데이터를 에뮬레이터를 통해 복원합니다.
 */

const { exec } = require('child_process');
const fs = require('fs');
const path = require('path');
const util = require('util');
const readline = require('readline');
const execPromise = util.promisify(exec);

// 환경 설정
const projectRoot = path.resolve(__dirname, '../..');
const backupDir = path.join(projectRoot, 'backup');
const emulatorDataDir = path.join(projectRoot, 'emulator-data');

/**
 * 사용 가능한 백업 목록 조회
 * @returns {Array} 백업 디렉토리 목록
 */
function listAvailableBackups() {
  if (!fs.existsSync(backupDir)) {
    console.error(`백업 디렉토리가 존재하지 않음: ${backupDir}`);
    return [];
  }
  
  const backups = fs.readdirSync(backupDir)
    .filter(item => item.startsWith('backup_'))
    .map(dir => {
      const fullPath = path.join(backupDir, dir);
      const infoPath = path.join(fullPath, 'backup-info.json');
      
      let info = { timestamp: 'Unknown', components: [] };
      if (fs.existsSync(infoPath)) {
        try {
          info = JSON.parse(fs.readFileSync(infoPath, 'utf8'));
        } catch (e) {
          console.warn(`백업 정보 파일을 읽는 중 오류 발생: ${dir}`);
        }
      }
      
      return {
        name: dir,
        path: fullPath,
        timestamp: info.timestamp || 'Unknown',
        components: info.backupComponents || [],
        hasFirestore: fs.existsSync(path.join(fullPath, 'firestore')),
        firestoreMode: info.firestoreBackupMode || 'unknown'
      };
    })
    .sort((a, b) => new Date(b.timestamp) - new Date(a.timestamp));
  
  return backups;
}

/**
 * 사용자에게 백업 선택을 요청
 * @param {Array} backups 백업 목록
 * @returns {Promise<string>} 선택된 백업 경로
 */
async function promptForBackup(backups) {
  if (backups.length === 0) {
    console.error('복원 가능한 백업이 없습니다.');
    process.exit(1);
  }
  
  const rl = readline.createInterface({
    input: process.stdin,
    output: process.stdout
  });
  
  console.log('\n사용 가능한 백업:');
  backups.forEach((backup, index) => {
    const components = backup.components.join(', ');
    const firestoreStatus = backup.hasFirestore ? 
      `Firestore: ✓ (${backup.firestoreMode})` : 
      'Firestore: ✗';
    console.log(`${index + 1}. ${backup.name} - 생성일: ${backup.timestamp}, 컴포넌트: ${components}, ${firestoreStatus}`);
  });
  
  const answer = await new Promise(resolve => {
    rl.question('\n복원할 백업 번호를 선택하세요: ', resolve);
  });
  
  rl.close();
  
  const index = parseInt(answer, 10) - 1;
  if (isNaN(index) || index < 0 || index >= backups.length) {
    console.error('유효하지 않은 선택입니다. 프로그램을 종료합니다.');
    process.exit(1);
  }
  
  return backups[index];
}

/**
 * 사용자에게 복원 구성 요소 선택을 요청
 * @param {Object} backup 선택된 백업 정보
 * @returns {Promise<Object>} 선택된 구성 요소 객체
 */
async function promptForComponents(backup) {
  const rl = readline.createInterface({
    input: process.stdin,
    output: process.stdout
  });
  
  const components = {
    firestore: false,
    config: false,
    functions: false,
    hosting: false
  };
  
  console.log('\n복원할 구성 요소를 선택하세요:');
  
  for (const component of Object.keys(components)) {
    const isAvailable = backup.components.includes(component) || 
      (component === 'firestore' && backup.hasFirestore);
    
    if (!isAvailable) {
      console.log(`${component}: 백업에 없음 (건너뜀)`);
      continue;
    }
    
    const answer = await new Promise(resolve => {
      rl.question(`${component}를 복원하시겠습니까? (y/n): `, resolve);
    });
    
    components[component] = answer.toLowerCase() === 'y';
  }
  
  rl.close();
  return components;
}

/**
 * 에뮬레이터를 사용하여 Firestore 데이터 복원
 * @param {string} backupPath 백업 디렉토리 경로
 * @param {Object} backup 백업 정보
 */
async function restoreFirestoreWithEmulator(backupPath, backup) {
  console.log('Firebase 에뮬레이터를 사용하여 Firestore 데이터 복원 중...');
  
  const firestoreBackupDir = path.join(backupPath, 'firestore');
  if (!fs.existsSync(firestoreBackupDir)) {
    console.error('Firestore 백업 디렉토리를 찾을 수 없음');
    return false;
  }
  
  // 에뮬레이터 임포트 디렉토리 준비
  const importDir = path.join(emulatorDataDir, `import_${Date.now()}`);
  fs.mkdirSync(importDir, { recursive: true });
  
  // firestore_export 디렉토리 복사
  fs.cpSync(firestoreBackupDir, path.join(importDir, 'firestore_export'), { recursive: true });
  
  try {
    // 에뮬레이터 시작 및 데이터 가져오기
    console.log('에뮬레이터 시작 및 데이터 가져오기...');
    const cmd = `cd ${projectRoot} && firebase emulators:start --only firestore --import=${importDir}`;
    
    // 에뮬레이터 실행
    console.log(`명령어 실행: ${cmd}`);
    const emulatorProcess = exec(cmd);
    
    // 로그 출력
    emulatorProcess.stdout.on('data', (data) => {
      console.log(`에뮬레이터 출력: ${data}`);
      
      // 데이터 가져오기가 완료되었는지 확인
      if (data.includes('Import complete')) {
        console.log('가져오기 완료. 에뮬레이터가 실행 중입니다.');
        console.log('에뮬레이터를 계속 실행하려면 아무 키나 누르세요...');
        
        // 사용자 입력 대기
        process.stdin.once('data', () => {
          // 에뮬레이터 종료
          emulatorProcess.kill('SIGINT');
        });
      }
    });
    
    emulatorProcess.stderr.on('data', (data) => {
      console.error(`에뮬레이터 오류: ${data}`);
    });
    
    // 프로세스 종료 대기
    await new Promise((resolve) => {
      emulatorProcess.on('exit', (code) => {
        console.log(`에뮬레이터 프로세스 종료됨 (코드: ${code})`);
        resolve();
      });
    });
    
    console.log('Firestore 데이터 복원 완료 (에뮬레이터)');
    return true;
  } catch (error) {
    console.error('Firestore 데이터 복원 중 오류 발생:', error);
    return false;
  } finally {
    // 임시 디렉토리 정리
    if (fs.existsSync(importDir)) {
      fs.rmSync(importDir, { recursive: true, force: true });
    }
  }
}

/**
 * Firebase Admin SDK를 사용하여 Firestore 데이터 직접 복원
 * @param {string} backupPath 백업 디렉토리 경로
 */
async function restoreFirestoreDirectly(backupPath) {
  console.log('Firebase Admin SDK를 사용하여 Firestore 데이터 직접 복원 중...');
  
  const firestoreBackupDir = path.join(backupPath, 'firestore');
  if (!fs.existsSync(firestoreBackupDir)) {
    console.error('Firestore 백업 디렉토리를 찾을 수 없음');
    return false;
  }
  
  const serviceAccountPath = path.join(projectRoot, 'firebase/service-account.json');
  if (!fs.existsSync(serviceAccountPath)) {
    console.error('서비스 계정 키 파일을 찾을 수 없습니다:', serviceAccountPath);
    return false;
  }
  
  try {
    // Admin SDK 초기화
    const admin = require('firebase-admin');
    const serviceAccount = require(serviceAccountPath);
    
    if (!admin.apps.length) {
      admin.initializeApp({
        credential: admin.credential.cert(serviceAccount)
      });
    }
    
    const db = admin.firestore();
    
    // 백업 파일 목록 가져오기
    const collectionFiles = fs.readdirSync(firestoreBackupDir)
      .filter(file => file.endsWith('.json'));
    
    if (collectionFiles.length === 0) {
      console.log('복원할 Firestore 컬렉션 파일이 없습니다.');
      return true;
    }
    
    // 각 컬렉션 복원
    for (const file of collectionFiles) {
      const collectionName = path.basename(file, '.json');
      console.log(`컬렉션 복원 중: ${collectionName}`);
      
      // 컬렉션 데이터 로드
      const collectionPath = path.join(firestoreBackupDir, file);
      const documents = JSON.parse(fs.readFileSync(collectionPath, 'utf8'));
      
      if (documents.length === 0) {
        console.log(`  컬렉션 ${collectionName}에 문서가 없습니다.`);
        continue;
      }
      
      // 배치 처리로 데이터 복원
      const batches = [];
      let currentBatch = db.batch();
      let operationCount = 0;
      
      for (const doc of documents) {
        const docRef = db.collection(collectionName).doc(doc.id);
        currentBatch.set(docRef, doc.data);
        operationCount++;
        
        // Firestore 배치 제한 (최대 500)
        if (operationCount >= 400) {
          batches.push(currentBatch);
          currentBatch = db.batch();
          operationCount = 0;
        }
      }
      
      // 남은 작업이 있으면 배치에 추가
      if (operationCount > 0) {
        batches.push(currentBatch);
      }
      
      // 배치 커밋
      console.log(`  ${batches.length}개 배치 커밋 중...`);
      for (let i = 0; i < batches.length; i++) {
        await batches[i].commit();
        console.log(`  배치 ${i + 1}/${batches.length} 커밋 완료`);
      }
      
      console.log(`  ${documents.length}개 문서 복원 완료: ${collectionName}`);
    }
    
    console.log('Firestore 데이터 직접 복원 완료');
    return true;
  } catch (error) {
    console.error('Firestore 데이터 직접 복원 중 오류 발생:', error);
    return false;
  }
}

/**
 * 로컬 Firebase 구성 복원
 * @param {string} backupPath 백업 디렉토리 경로
 */
async function restoreLocalConfig(backupPath) {
  console.log('로컬 Firebase 구성 복원 중...');
  
  try {
    // 기존 복원 스크립트 실행
    const restoreScript = path.join(__dirname, 'firebase-restore.js');
    if (fs.existsSync(restoreScript)) {
      // 백업 경로를 파라미터로 전달하여 자동 선택하도록 수정 필요
      // 현재는 수동 선택 대화 상자가 표시됨
      console.log('firebase-restore.js 스크립트 실행 중...');
      const { stdout, stderr } = await execPromise(`node ${restoreScript}`);
      console.log(stdout);
      if (stderr) console.error(stderr);
    } else {
      console.error('firebase-restore.js 스크립트를 찾을 수 없음');
      return false;
    }
    
    console.log('로컬 Firebase 구성 복원 완료');
    return true;
  } catch (error) {
    console.error('로컬 Firebase 구성 복원 중 오류 발생:', error);
    return false;
  }
}

/**
 * Firebase 백업 복원 메인 함수
 */
async function main() {
  console.log('Firebase 백업 복원 시작...');
  
  // 복원 모드 결정 (에뮬레이터 또는 직접)
  const restoreMode = process.argv[2] === '--direct' ? 'direct' : 'emulator';
  console.log(`복원 모드: ${restoreMode}`);
  
  // 백업 목록 조회
  const backups = listAvailableBackups();
  if (backups.length === 0) {
    console.error('복원 가능한 백업이 없습니다.');
    process.exit(1);
  }
  
  // 백업 선택
  const backup = await promptForBackup(backups);
  console.log(`선택된 백업: ${backup.name} (${backup.timestamp})`);
  
  // 구성 요소 선택
  const components = await promptForComponents(backup);
  
  try {
    // 선택된 구성 요소 복원
    let results = {};
    
    // Firestore 복원
    if (components.firestore && backup.hasFirestore) {
      if (restoreMode === 'direct') {
        results.firestore = await restoreFirestoreDirectly(backup.path);
      } else {
        results.firestore = await restoreFirestoreWithEmulator(backup.path, backup);
      }
    }
    
    // 로컬 구성 복원
    if (components.config || components.functions || components.hosting) {
      results.localConfig = await restoreLocalConfig(backup.path);
    }
    
    // 결과 요약
    console.log('\nFirebase 백업 복원 결과:');
    for (const [component, success] of Object.entries(results)) {
      console.log(`- ${component}: ${success ? '성공 ✓' : '실패 ✗'}`);
    }
    
    console.log('\nFirebase 백업 복원 완료!');
  } catch (error) {
    console.error('복원 중 오류 발생:', error);
    process.exit(1);
  }
}

// 스크립트 실행
if (require.main === module) {
  main().catch(console.error);
}

module.exports = {
  listAvailableBackups,
  restoreFirestoreWithEmulator,
  restoreFirestoreDirectly
};
