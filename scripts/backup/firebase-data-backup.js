/**
 * Firebase Firestore 데이터 백업 스크립트
 * 
 * Firebase 에뮬레이터를 활용하여 Firestore 데이터를 로컬에 백업합니다.
 */

const { exec } = require('child_process');
const fs = require('fs');
const path = require('path');
const util = require('util');
const execPromise = util.promisify(exec);

// 환경 설정
const projectRoot = path.resolve(__dirname, '../..');
const backupDir = path.join(projectRoot, 'backup');
const emulatorDataDir = path.join(projectRoot, 'emulator-data');

/**
 * 현재 날짜와 시간을 기반으로 백업 디렉토리 생성
 * @returns {string} 생성된 백업 디렉토리 경로
 */
function createBackupDirectory() {
  const now = new Date();
  const timestamp = now.toISOString().replace(/:/g, '-').replace(/\..+/, '');
  const dirName = `backup_${timestamp}`;
  const fullPath = path.join(backupDir, dirName);
  
  if (!fs.existsSync(backupDir)) {
    fs.mkdirSync(backupDir, { recursive: true });
  }
  
  fs.mkdirSync(fullPath);
  console.log(`백업 디렉토리 생성: ${fullPath}`);
  return fullPath;
}

/**
 * Firebase 에뮬레이터를 사용하여 Firestore 데이터 백업
 * @param {string} backupPath 백업 디렉토리 경로
 */
async function backupFirestoreData(backupPath) {
  console.log('Firebase Firestore 데이터 백업 중...');

  // 에뮬레이터 데이터 내보내기 디렉토리 생성
  const emulatorExportDir = path.join(emulatorDataDir, `export_${Date.now()}`);
  if (!fs.existsSync(emulatorExportDir)) {
    fs.mkdirSync(emulatorExportDir, { recursive: true });
  }

  try {
    // Firebase 에뮬레이터를 시작하고 데이터 내보내기
    console.log('Firebase 에뮬레이터 시작 및 데이터 내보내기...');
    const startEmulatorCmd = `cd ${projectRoot} && firebase emulators:start --only firestore --export-on-exit=${emulatorExportDir} --project db888`;
    
    // 에뮬레이터 프로세스 시작
    const emulatorProcess = exec(startEmulatorCmd);
    
    // 에뮬레이터 실행 로그 출력
    emulatorProcess.stdout.on('data', (data) => {
      console.log(`에뮬레이터 출력: ${data}`);
    });
    
    emulatorProcess.stderr.on('data', (data) => {
      console.error(`에뮬레이터 오류: ${data}`);
    });
    
    // 에뮬레이터가 시작될 때까지 대기
    console.log('에뮬레이터 시작 대기 중...');
    await new Promise(resolve => setTimeout(resolve, 10000));
    
    // Ctrl+C 신호를 보내 에뮬레이터 종료 및 데이터 내보내기 트리거
    console.log('에뮬레이터 종료 신호 전송...');
    emulatorProcess.kill('SIGINT');
    
    // 프로세스 종료 대기
    await new Promise((resolve) => {
      emulatorProcess.on('exit', (code) => {
        console.log(`에뮬레이터 프로세스 종료됨 (코드: ${code})`);
        resolve();
      });
    });
    
    // 내보낸 데이터를 백업 디렉토리로 복사
    console.log('내보낸 데이터를 백업 디렉토리로 복사 중...');
    const firestoreDataDir = path.join(backupPath, 'firestore');
    fs.mkdirSync(firestoreDataDir);
    
    // firestore_export 디렉토리가 있는지 확인
    const firestoreExportDir = path.join(emulatorExportDir, 'firestore_export');
    if (fs.existsSync(firestoreExportDir)) {
      // firestore_export 디렉토리 내용 복사
      fs.cpSync(firestoreExportDir, firestoreDataDir, { recursive: true });
      console.log('Firestore 데이터 백업 복사 완료');
    } else {
      console.log('내보낸 Firestore 데이터를 찾을 수 없음');
    }
    
    // 임시 내보내기 디렉토리 정리
    fs.rmSync(emulatorExportDir, { recursive: true, force: true });
    
    console.log('Firestore 데이터 백업 완료');
    return true;
  } catch (error) {
    console.error('Firestore 데이터 백업 중 오류 발생:', error);
    return false;
  }
}

/**
 * Firestore 데이터를 직접 Firebase Admin SDK로 백업 (프로덕션 데이터)
 * @param {string} backupPath 백업 디렉토리 경로
 */
async function backupFirestoreDirectly(backupPath) {
  console.log('Firebase Admin SDK를 사용하여 Firestore 데이터 직접 백업 중...');
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
    const firestoreDir = path.join(backupPath, 'firestore');
    fs.mkdirSync(firestoreDir, { recursive: true });
    
    // 컬렉션 목록 가져오기
    console.log('Firestore 컬렉션 목록 가져오기...');
    const collections = await db.listCollections();
    
    if (collections.length === 0) {
      console.log('백업할 Firestore 컬렉션이 없습니다.');
      return true;
    }
    
    // 각 컬렉션 백업
    for (const collection of collections) {
      const collectionName = collection.id;
      console.log(`컬렉션 백업 중: ${collectionName}`);
      
      // 컬렉션 내 문서 가져오기
      const snapshot = await db.collection(collectionName).get();
      
      if (snapshot.empty) {
        console.log(`  컬렉션 ${collectionName}에 문서가 없습니다.`);
        continue;
      }
      
      // 문서 데이터 추출
      const documents = snapshot.docs.map(doc => ({
        id: doc.id,
        data: doc.data()
      }));
      
      // 컬렉션 데이터 저장
      const collectionPath = path.join(firestoreDir, `${collectionName}.json`);
      fs.writeFileSync(
        collectionPath,
        JSON.stringify(documents, null, 2)
      );
      
      console.log(`  ${documents.length}개 문서 백업 완료: ${collectionName}`);
    }
    
    console.log('Firestore 데이터 직접 백업 완료');
    return true;
  } catch (error) {
    console.error('Firestore 데이터 직접 백업 중 오류 발생:', error);
    return false;
  }
}

/**
 * 백업 정보 파일 생성
 * @param {string} backupPath 백업 디렉토리 경로
 * @param {Object} additionalInfo 추가 정보
 */
function createBackupInfo(backupPath, additionalInfo = {}) {
  console.log('백업 정보 파일 생성 중...');
  const info = {
    timestamp: new Date().toISOString(),
    backupType: 'full',
    backupComponents: ['config', 'functions', 'hosting', 'firestore'],
    user: process.env.USER || 'unknown',
    notes: process.argv[2] || '',
    ...additionalInfo
  };
  
  fs.writeFileSync(
    path.join(backupPath, 'backup-info.json'),
    JSON.stringify(info, null, 2)
  );
  
  console.log('백업 정보 파일 생성 완료');
}

/**
 * 메인 백업 함수
 */
async function main() {
  console.log('Firebase 데이터 백업 시작...');
  
  // 백업 모드 결정 (에뮬레이터 또는 직접)
  const backupMode = process.argv[2] === '--direct' ? 'direct' : 'emulator';
  console.log(`백업 모드: ${backupMode}`);
  
  // 백업 디렉토리 생성
  const backupPath = createBackupDirectory();
  console.log(`백업 경로: ${backupPath}`);
  
  try {
    // 기존 백업 스크립트로 로컬 구성 백업
    const baseBackupScript = path.join(__dirname, 'firebase-backup.js');
    if (fs.existsSync(baseBackupScript)) {
      console.log('로컬 Firebase 구성 백업 실행 중...');
      const { stdout, stderr } = await execPromise(`node ${baseBackupScript}`);
      console.log(stdout);
      if (stderr) console.error(stderr);
      
      // 기존 백업 파일들을 새 디렉토리로 복사
      const lastBackupDir = stdout.match(/모든 백업 파일은 다음 경로에 저장되었습니다: (.*)/);
      if (lastBackupDir && lastBackupDir[1]) {
        const sourceDir = lastBackupDir[1];
        const dirs = ['config', 'functions', 'hosting'];
        
        for (const dir of dirs) {
          const sourcePath = path.join(sourceDir, dir);
          const targetPath = path.join(backupPath, dir);
          
          if (fs.existsSync(sourcePath)) {
            fs.cpSync(sourcePath, targetPath, { recursive: true });
            console.log(`${dir} 디렉토리 복사 완료`);
          }
        }
      }
    }
    
    // Firestore 데이터 백업
    let firestoreBackupSuccess = false;
    if (backupMode === 'direct') {
      firestoreBackupSuccess = await backupFirestoreDirectly(backupPath);
    } else {
      firestoreBackupSuccess = await backupFirestoreData(backupPath);
    }
    
    // 백업 정보 파일 생성
    createBackupInfo(backupPath, { 
      firestoreBackupMode: backupMode,
      firestoreBackupSuccess
    });
    
    console.log('\nFirebase 데이터 백업 완료!');
    console.log(`모든 백업 파일은 다음 경로에 저장되었습니다: ${backupPath}`);
  } catch (error) {
    console.error('백업 중 오류 발생:', error);
    process.exit(1);
  }
}

// 스크립트 실행
main().catch(console.error);
