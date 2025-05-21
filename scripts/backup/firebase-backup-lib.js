/**
 * Firebase 백업 라이브러리
 * 
 * 이 모듈은 Firebase 백업 및 복원 기능을 제공하는 라이브러리입니다.
 * 기존 백업 스크립트와 새로운 Firestore 백업 기능을 통합합니다.
 */

const fs = require('fs');
const path = require('path');
const { exec } = require('child_process');
const util = require('util');
const execPromise = util.promisify(exec);

// 프로젝트 루트 경로
const projectRoot = path.resolve(__dirname, '../..');

/**
 * 백업 디렉토리 생성
 * @param {string} backupName 백업 이름 (기본값: 타임스탬프 기반)
 * @returns {string} 생성된 백업 디렉토리 경로
 */
function createBackupDirectory(backupName) {
  const backupDir = path.join(projectRoot, 'backup');
  
  if (!fs.existsSync(backupDir)) {
    fs.mkdirSync(backupDir, { recursive: true });
  }
  
  // 백업 이름이 없으면 타임스탬프 기반으로 생성
  if (!backupName) {
    const now = new Date();
    backupName = `backup_${now.toISOString().replace(/:/g, '-').replace(/\..+/, '')}`;
  }
  
  const fullPath = path.join(backupDir, backupName);
  fs.mkdirSync(fullPath, { recursive: true });
  
  return fullPath;
}

/**
 * Firebase 구성 파일 백업
 * @param {string} backupPath 백업 디렉토리 경로
 */
function backupConfig(backupPath) {
  console.log('Firebase 설정 파일 백업 중...');
  const configFiles = [
    'firebase.json',
    '.firebaserc',
    'firestore.rules',
    'firestore.indexes.json',
    'firebase.emulator.json'
  ];
  
  const configDir = path.join(backupPath, 'config');
  fs.mkdirSync(configDir, { recursive: true });
  
  configFiles.forEach(file => {
    const sourcePath = path.join(projectRoot, file);
    const fileName = path.basename(sourcePath);
    const destPath = path.join(configDir, fileName);
    
    try {
      if (fs.existsSync(sourcePath)) {
        fs.copyFileSync(sourcePath, destPath);
        console.log(`파일 백업 완료: ${fileName}`);
      } else {
        console.log(`파일이 존재하지 않음, 건너뜀: ${fileName}`);
      }
    } catch (error) {
      console.error(`파일 백업 중 오류 발생: ${fileName}`, error);
    }
  });
  
  console.log('설정 파일 백업 완료');
  return true;
}

/**
 * Firebase Functions 백업
 * @param {string} backupPath 백업 디렉토리 경로
 */
function backupFunctions(backupPath) {
  console.log('Firebase Functions 백업 중...');
  const functionsDir = path.join(projectRoot, 'functions');
  const backupFunctionsDir = path.join(backupPath, 'functions');
  
  if (!fs.existsSync(functionsDir)) {
    console.log('Functions 디렉토리가 존재하지 않음, 건너뜀');
    return false;
  }
  
  // functions 디렉토리 구조 생성
  fs.mkdirSync(backupFunctionsDir, { recursive: true });
  fs.mkdirSync(path.join(backupFunctionsDir, 'src'), { recursive: true });
  
  // index.js 백업
  const indexPath = path.join(functionsDir, 'index.js');
  if (fs.existsSync(indexPath)) {
    fs.copyFileSync(indexPath, path.join(backupFunctionsDir, 'index.js'));
    console.log('index.js 백업 완료');
  }
  
  // package.json 백업
  const packagePath = path.join(functionsDir, 'package.json');
  if (fs.existsSync(packagePath)) {
    fs.copyFileSync(packagePath, path.join(backupFunctionsDir, 'package.json'));
    console.log('package.json 백업 완료');
  }
  
  // src 디렉토리 내 파일 백업
  const srcDir = path.join(functionsDir, 'src');
  if (fs.existsSync(srcDir)) {
    backupDirectory(srcDir, path.join(backupFunctionsDir, 'src'));
    console.log('src 디렉토리 백업 완료');
  }
  
  console.log('Firebase Functions 백업 완료');
  return true;
}

/**
 * Firebase Hosting 백업
 * @param {string} backupPath 백업 디렉토리 경로
 */
function backupHosting(backupPath) {
  console.log('Firebase Hosting 백업 중...');
  const publicDir = path.join(projectRoot, 'public');
  const backupPublicDir = path.join(backupPath, 'public');
  
  if (!fs.existsSync(publicDir)) {
    console.log('Public 디렉토리가 존재하지 않음, 건너뜀');
    return false;
  }
  
  fs.mkdirSync(backupPublicDir, { recursive: true });
  
  // 백업할 주요 파일 및 디렉토리 목록
  const filesToBackup = ['index.html', '404.html', 'main-index.html', 'dashboard.html', 'login.html'];
  const dirsToBackup = ['css', 'js', 'assets', 'images'];
  
  // 파일 백업
  filesToBackup.forEach(file => {
    const sourcePath = path.join(publicDir, file);
    if (fs.existsSync(sourcePath)) {
      fs.copyFileSync(sourcePath, path.join(backupPublicDir, file));
      console.log(`${file} 백업 완료`);
    }
  });
  
  // 디렉토리 백업
  dirsToBackup.forEach(dir => {
    const sourcePath = path.join(publicDir, dir);
    if (fs.existsSync(sourcePath) && fs.statSync(sourcePath).isDirectory()) {
      backupDirectory(sourcePath, path.join(backupPublicDir, dir));
      console.log(`${dir} 디렉토리 백업 완료`);
    }
  });
  
  console.log('Firebase Hosting 백업 완료');
  return true;
}

/**
 * 디렉토리 및 하위 파일 백업
 * @param {string} sourceDir 소스 디렉토리
 * @param {string} targetDir 대상 디렉토리
 */
function backupDirectory(sourceDir, targetDir) {
  if (!fs.existsSync(targetDir)) {
    fs.mkdirSync(targetDir, { recursive: true });
  }
  
  const files = fs.readdirSync(sourceDir);
  
  files.forEach(file => {
    const sourcePath = path.join(sourceDir, file);
    const targetPath = path.join(targetDir, file);
    
    if (fs.statSync(sourcePath).isDirectory()) {
      // 재귀적으로 하위 디렉토리 백업
      backupDirectory(sourcePath, targetPath);
    } else {
      // 파일 복사
      fs.copyFileSync(sourcePath, targetPath);
    }
  });
}

/**
 * 백업 정보 저장
 * @param {string} backupPath 백업 디렉토리 경로
 * @param {Object} info 백업 정보
 */
function saveBackupInfo(backupPath, info) {
  const defaultInfo = {
    timestamp: new Date().toISOString(),
    backupType: 'config-only',
    backupComponents: [],
    user: process.env.USER || 'unknown',
    notes: ''
  };
  
  const backupInfo = { ...defaultInfo, ...info };
  
  fs.writeFileSync(
    path.join(backupPath, 'backup-info.json'),
    JSON.stringify(backupInfo, null, 2)
  );
  
  console.log('백업 정보 저장 완료');
}

/**
 * Firebase 백업 실행
 * @param {Object} options 백업 옵션
 * @returns {Promise<Object>} 백업 결과
 */
async function performBackup(options = {}) {
  const {
    backupName = null,
    backupComponents = ['config', 'functions', 'hosting', 'firestore'],
    notes = '',
    firestoreMode = 'emulator',
    verbose = true
  } = options;
  
  if (verbose) console.log('Firebase 백업 시작...');
  
  // 백업 디렉토리 생성
  const backupPath = createBackupDirectory(backupName);
  if (verbose) console.log(`백업 경로: ${backupPath}`);
  
  const results = {
    success: true,
    backupPath,
    components: {}
  };
  
  try {
    // 각 컴포넌트 백업
    if (backupComponents.includes('config')) {
      results.components.config = backupConfig(backupPath);
    }
    
    if (backupComponents.includes('functions')) {
      results.components.functions = backupFunctions(backupPath);
    }
    
    if (backupComponents.includes('hosting')) {
      results.components.hosting = backupHosting(backupPath);
    }
    
    // Firestore 데이터 백업
    if (backupComponents.includes('firestore')) {
      if (verbose) console.log('Firestore 데이터 백업 중...');
      
      if (firestoreMode === 'direct') {
        // 직접 모드 - Firebase Admin SDK 사용
        if (verbose) console.log('직접 모드로 Firestore 백업 실행...');
        const { stdout, stderr } = await execPromise(`node ${path.join(__dirname, 'firebase-data-backup.js')} --direct`);
        if (verbose && stdout) console.log(stdout);
        if (stderr) console.error(stderr);
      } else {
        // 에뮬레이터 모드
        if (verbose) console.log('에뮬레이터 모드로 Firestore 백업 실행...');
        const { stdout, stderr } = await execPromise(`node ${path.join(__dirname, 'firebase-data-backup.js')}`);
        if (verbose && stdout) console.log(stdout);
        if (stderr) console.error(stderr);
      }
      
      results.components.firestore = fs.existsSync(path.join(backupPath, 'firestore'));
    }
    
    // 백업 정보 저장
    saveBackupInfo(backupPath, {
      backupType: 'full',
      backupComponents,
      notes,
      firestoreMode
    });
    
    if (verbose) console.log('\nFirebase 백업 완료!');
    if (verbose) console.log(`모든 백업 파일은 다음 경로에 저장되었습니다: ${backupPath}`);
    
    return results;
  } catch (error) {
    console.error('백업 중 오류 발생:', error);
    results.success = false;
    results.error = error.message;
    return results;
  }
}

// 모듈 내보내기
module.exports = {
  performBackup,
  createBackupDirectory,
  backupConfig,
  backupFunctions,
  backupHosting,
  saveBackupInfo
};
