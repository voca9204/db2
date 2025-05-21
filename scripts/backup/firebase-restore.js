/**
 * Firebase 백업 복원 스크립트
 * 
 * 이 스크립트는 Firebase 데이터 백업을 복원하는 기능을 제공합니다.
 * Firestore 데이터, Firebase 설정 등을 백업에서 복원합니다.
 */

const admin = require('firebase-admin');
const fs = require('fs');
const path = require('path');
const readline = require('readline');

// 환경 설정
const serviceAccountPath = path.resolve(__dirname, '../../firebase/service-account.json');
const backupDir = path.resolve(__dirname, '../../backup');

// Firebase 초기화
let firebaseInitialized = false;
function initializeFirebase() {
  if (firebaseInitialized) return;
  
  try {
    const serviceAccount = require(serviceAccountPath);
    admin.initializeApp({
      credential: admin.credential.cert(serviceAccount)
    });
    firebaseInitialized = true;
    console.log('Firebase 초기화 완료');
  } catch (error) {
    console.error('Firebase 초기화 오류:', error);
    process.exit(1);
  }
}

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
        components: info.backupComponents || []
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
    console.log(`${index + 1}. ${backup.name} - 생성일: ${backup.timestamp}, 컴포넌트: ${components}`);
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
  
  return backups[index].path;
}

/**
 * 사용자에게 복원 구성 요소 선택을 요청
 * @returns {Promise<Object>} 선택된 구성 요소 객체
 */
async function promptForComponents() {
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
    const answer = await new Promise(resolve => {
      rl.question(`${component}를 복원하시겠습니까? (y/n): `, resolve);
    });
    
    components[component] = answer.toLowerCase() === 'y';
  }
  
  rl.close();
  return components;
}

/**
 * Firestore 데이터 복원
 * @param {string} backupPath 백업 디렉토리 경로
 */
async function restoreFirestore(backupPath) {
  initializeFirebase();
  console.log('Firestore 데이터 복원 시작...');
  
  const firestoreDir = path.join(backupPath, 'firestore');
  if (!fs.existsSync(firestoreDir)) {
    console.error('Firestore 백업 디렉토리를 찾을 수 없음');
    return;
  }
  
  const db = admin.firestore();
  const batch = db.batch();
  let batchCount = 0;
  let batchSize = 0;
  
  const collectionFiles = fs.readdirSync(firestoreDir).filter(file => file.endsWith('.json'));
  
  for (const file of collectionFiles) {
    const collectionName = path.basename(file, '.json');
    console.log(`컬렉션 복원 중: ${collectionName}`);
    
    const data = JSON.parse(fs.readFileSync(path.join(firestoreDir, file), 'utf8'));
    
    for (const doc of data) {
      const docRef = db.collection(collectionName).doc(doc.id);
      batch.set(docRef, doc.data);
      
      batchSize++;
      if (batchSize >= 400) { // Firestore 배치 제한
        await batch.commit();
        console.log(`${batchSize}개 문서 복원 완료`);
        batchCount++;
        batchSize = 0;
      }
    }
  }
  
  if (batchSize > 0) {
    await batch.commit();
    console.log(`${batchSize}개 문서 복원 완료`);
    batchCount++;
  }
  
  console.log(`Firestore 데이터 복원 완료 (${batchCount} 배치)`);
}

/**
 * Firebase 설정 파일 복원
 * @param {string} backupPath 백업 디렉토리 경로
 */
function restoreConfig(backupPath) {
  console.log('Firebase 설정 파일 복원 중...');
  const configDir = path.join(backupPath, 'config');
  
  if (!fs.existsSync(configDir)) {
    console.error('설정 백업 디렉토리를 찾을 수 없음');
    return;
  }
  
  const configFiles = ['firebase.json', '.firebaserc', 'firestore.rules', 'firestore.indexes.json'];
  
  configFiles.forEach(file => {
    const sourcePath = path.join(configDir, file);
    const destPath = path.resolve(__dirname, '../../', file);
    
    try {
      if (fs.existsSync(sourcePath)) {
        // 기존 파일 백업
        if (fs.existsSync(destPath)) {
          fs.copyFileSync(destPath, `${destPath}.bak`);
        }
        
        fs.copyFileSync(sourcePath, destPath);
        console.log(`파일 복원 완료: ${file}`);
      } else {
        console.log(`백업에서 파일을 찾을 수 없음, 건너뜀: ${file}`);
      }
    } catch (error) {
      console.error(`파일 복원 중 오류 발생: ${file}`, error);
    }
  });
  
  console.log('설정 파일 복원 완료');
}

/**
 * Firebase Functions 복원
 * @param {string} backupPath 백업 디렉토리 경로
 */
function restoreFunctions(backupPath) {
  console.log('Firebase Functions 복원 중...');
  const functionsBackupDir = path.join(backupPath, 'functions');
  const functionsDir = path.resolve(__dirname, '../../functions');
  
  if (!fs.existsSync(functionsBackupDir)) {
    console.error('Functions 백업 디렉토리를 찾을 수 없음');
    return;
  }
  
  if (!fs.existsSync(functionsDir)) {
    fs.mkdirSync(functionsDir, { recursive: true });
  }
  
  // index.js 복원
  const indexPath = path.join(functionsBackupDir, 'index.js');
  if (fs.existsSync(indexPath)) {
    const destPath = path.join(functionsDir, 'index.js');
    if (fs.existsSync(destPath)) {
      fs.copyFileSync(destPath, `${destPath}.bak`);
    }
    fs.copyFileSync(indexPath, destPath);
    console.log('index.js 복원 완료');
  }
  
  // package.json 복원 (의존성 문제가 있을 수 있으므로 주의)
  const packagePath = path.join(functionsBackupDir, 'package.json');
  if (fs.existsSync(packagePath)) {
    const destPath = path.join(functionsDir, 'package.json');
    if (fs.existsSync(destPath)) {
      fs.copyFileSync(destPath, `${destPath}.bak`);
    }
    fs.copyFileSync(packagePath, destPath);
    console.log('package.json 복원 완료');
  }
  
  // src 디렉토리 복원
  const srcBackupDir = path.join(functionsBackupDir, 'src');
  const srcDir = path.join(functionsDir, 'src');
  
  if (fs.existsSync(srcBackupDir)) {
    if (!fs.existsSync(srcDir)) {
      fs.mkdirSync(srcDir, { recursive: true });
    }
    
    const files = fs.readdirSync(srcBackupDir);
    for (const file of files) {
      const sourcePath = path.join(srcBackupDir, file);
      const destPath = path.join(srcDir, file);
      
      if (fs.statSync(sourcePath).isFile()) {
        if (fs.existsSync(destPath)) {
          fs.copyFileSync(destPath, `${destPath}.bak`);
        }
        fs.copyFileSync(sourcePath, destPath);
        console.log(`src/${file} 복원 완료`);
      }
    }
  }
  
  console.log('Firebase Functions 복원 완료');
}

/**
 * Firebase Hosting 복원
 * @param {string} backupPath 백업 디렉토리 경로
 */
function restoreHosting(backupPath) {
  console.log('Firebase Hosting 복원 중...');
  const hostingBackupDir = path.join(backupPath, 'public');
  const publicDir = path.resolve(__dirname, '../../public');
  
  if (!fs.existsSync(hostingBackupDir)) {
    console.error('Hosting 백업 디렉토리를 찾을 수 없음');
    return;
  }
  
  if (!fs.existsSync(publicDir)) {
    fs.mkdirSync(publicDir, { recursive: true });
  }
  
  // index.html 및 기타 파일 복원
  const files = fs.readdirSync(hostingBackupDir);
  for (const file of files) {
    const sourcePath = path.join(hostingBackupDir, file);
    const destPath = path.join(publicDir, file);
    
    if (fs.statSync(sourcePath).isFile()) {
      if (fs.existsSync(destPath)) {
        fs.copyFileSync(destPath, `${destPath}.bak`);
      }
      fs.copyFileSync(sourcePath, destPath);
      console.log(`${file} 복원 완료`);
    }
  }
  
  console.log('Firebase Hosting 복원 완료');
}

/**
 * 메인 복원 함수
 */
async function main() {
  console.log('Firebase 백업 복원 시작...');
  
  // 백업 목록 조회
  const backups = listAvailableBackups();
  
  // 백업 선택
  const backupPath = await promptForBackup(backups);
  console.log(`선택된 백업 경로: ${backupPath}`);
  
  // 구성 요소 선택
  const components = await promptForComponents();
  
  try {
    // 선택된 구성 요소 복원
    if (components.firestore) {
      await restoreFirestore(backupPath);
    }
    
    if (components.config) {
      restoreConfig(backupPath);
    }
    
    if (components.functions) {
      restoreFunctions(backupPath);
    }
    
    if (components.hosting) {
      restoreHosting(backupPath);
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
  restoreFirestore,
  restoreConfig,
  restoreFunctions,
  restoreHosting
};
