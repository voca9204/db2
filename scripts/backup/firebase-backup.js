/**
 * 로컬 Firebase 구성 백업 스크립트
 * 
 * 이 스크립트는 Firebase 구성 파일 및 호스팅 파일을 로컬로 백업합니다.
 */

const fs = require('fs');
const path = require('path');

// 환경 설정
const backupDir = path.resolve(__dirname, '../../backup');

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
  return fullPath;
}

/**
 * Firebase 설정 파일 백업
 * @param {string} backupPath 백업 디렉토리 경로
 */
function backupConfig(backupPath) {
  console.log('Firebase 설정 파일 백업 중...');
  const configFiles = [
    '../../firebase.json',
    '../../.firebaserc',
    '../../firestore.rules',
    '../../firestore.indexes.json'
  ];
  
  const configDir = path.join(backupPath, 'config');
  fs.mkdirSync(configDir);
  
  configFiles.forEach(file => {
    const sourcePath = path.resolve(__dirname, file);
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
}/**
 * Firebase Functions 백업
 * @param {string} backupPath 백업 디렉토리 경로
 */
function backupFunctions(backupPath) {
  console.log('Firebase Functions 백업 중...');
  const functionsDir = path.resolve(__dirname, '../../functions');
  const backupFunctionsDir = path.join(backupPath, 'functions');
  
  if (fs.existsSync(functionsDir)) {
    // functions 디렉토리 전체를 복사하는 대신 주요 파일만 복사
    fs.mkdirSync(backupFunctionsDir);
    fs.mkdirSync(path.join(backupFunctionsDir, 'src'), { recursive: true });
    
    // index.js 백업
    const indexPath = path.join(functionsDir, 'index.js');
    if (fs.existsSync(indexPath)) {
      fs.copyFileSync(indexPath, path.join(backupFunctionsDir, 'index.js'));
    }
    
    // package.json 백업
    const packagePath = path.join(functionsDir, 'package.json');
    if (fs.existsSync(packagePath)) {
      fs.copyFileSync(packagePath, path.join(backupFunctionsDir, 'package.json'));
    }
    
    // src 디렉토리 내 파일 백업
    const srcDir = path.join(functionsDir, 'src');
    if (fs.existsSync(srcDir)) {
      const files = fs.readdirSync(srcDir);
      for (const file of files) {
        const sourcePath = path.join(srcDir, file);
        if (fs.statSync(sourcePath).isFile()) {
          fs.copyFileSync(sourcePath, path.join(backupFunctionsDir, 'src', file));
        }
      }
    }
    
    console.log('Firebase Functions 백업 완료');
  } else {
    console.log('Functions 디렉토리가 존재하지 않음, 건너뜀');
  }
}/**
 * Firebase Hosting 백업
 * @param {string} backupPath 백업 디렉토리 경로
 */
function backupHosting(backupPath) {
  console.log('Firebase Hosting 백업 중...');
  const publicDir = path.resolve(__dirname, '../../public');
  const backupPublicDir = path.join(backupPath, 'public');
  
  if (fs.existsSync(publicDir)) {
    fs.mkdirSync(backupPublicDir);
    
    // index.html 백업
    const indexPath = path.join(publicDir, 'index.html');
    if (fs.existsSync(indexPath)) {
      fs.copyFileSync(indexPath, path.join(backupPublicDir, 'index.html'));
      console.log('index.html 백업 완료');
    }
    
    // 다른 중요 파일들 백업(예: 404.html, 기타 페이지)
    const otherFiles = ['404.html', 'main-index.html', 'dashboard.html', 'login.html'];
    otherFiles.forEach(file => {
      const filePath = path.join(publicDir, file);
      if (fs.existsSync(filePath)) {
        fs.copyFileSync(filePath, path.join(backupPublicDir, file));
        console.log(`${file} 백업 완료`);
      }
    });
    
    // CSS, JS 등의 주요 에셋 디렉토리도 백업
    const assetDirs = ['css', 'js', 'assets'];
    assetDirs.forEach(dir => {
      const dirPath = path.join(publicDir, dir);
      if (fs.existsSync(dirPath) && fs.statSync(dirPath).isDirectory()) {
        const backupDirPath = path.join(backupPublicDir, dir);
        fs.mkdirSync(backupDirPath, { recursive: true });
        
        // 디렉토리 내 파일들 복사
        const files = fs.readdirSync(dirPath);
        for (const file of files) {
          const sourcePath = path.join(dirPath, file);
          const destPath = path.join(backupDirPath, file);
          
          if (fs.statSync(sourcePath).isFile()) {
            fs.copyFileSync(sourcePath, destPath);
            console.log(`${dir}/${file} 백업 완료`);
          }
        }
      }
    });
    
    console.log('Firebase Hosting 백업 완료');
  } else {
    console.log('Public 디렉토리가 존재하지 않음, 건너뜀');
  }
}/**
 * 백업 정보 파일 생성
 * @param {string} backupPath 백업 디렉토리 경로
 */
function createBackupInfo(backupPath) {
  console.log('백업 정보 파일 생성 중...');
  const info = {
    timestamp: new Date().toISOString(),
    backupType: 'config-only',
    backupComponents: ['config', 'functions', 'hosting'],
    user: process.env.USER || 'unknown',
    notes: process.argv[2] || '',
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
function main() {
  console.log('Firebase 로컬 구성 백업 시작...');
  
  // 백업 디렉토리 생성
  const backupPath = createBackupDirectory();
  console.log(`백업 경로: ${backupPath}`);
  
  try {
    // 각 컴포넌트 백업
    backupConfig(backupPath);
    backupFunctions(backupPath);
    backupHosting(backupPath);
    createBackupInfo(backupPath);
    
    console.log('\nFirebase 로컬 구성 백업 완료!');
    console.log(`모든 백업 파일은 다음 경로에 저장되었습니다: ${backupPath}`);
  } catch (error) {
    console.error('백업 중 오류 발생:', error);
    process.exit(1);
  }
}

// 스크립트 실행
main();