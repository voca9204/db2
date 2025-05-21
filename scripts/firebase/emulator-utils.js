/**
 * Firebase 에뮬레이터 유틸리티
 * 
 * 이 모듈은 Firebase 에뮬레이터 관련 유틸리티 함수를 제공합니다.
 */

const fs = require('fs');
const path = require('path');
const { exec, spawn } = require('child_process');
const util = require('util');
const axios = require('axios');
const execPromise = util.promisify(exec);

// 프로젝트 루트 경로
const projectRoot = path.resolve(__dirname, '../..');
const emulatorDataDir = path.join(projectRoot, 'emulator-data');

/**
 * 에뮬레이터 환경 준비
 */
function prepareEmulatorEnvironment() {
  // 에뮬레이터 데이터 디렉토리 확인 및 생성
  if (!fs.existsSync(emulatorDataDir)) {
    fs.mkdirSync(emulatorDataDir, { recursive: true });
    console.log(`에뮬레이터 데이터 디렉토리 생성됨: ${emulatorDataDir}`);
  }
  
  // 에뮬레이터 설정 파일 확인
  const emulatorConfig = path.join(projectRoot, 'firebase.emulator.json');
  if (!fs.existsSync(emulatorConfig)) {
    console.warn('경고: firebase.emulator.json 파일이 없습니다. 기본 설정이 사용됩니다.');
  }
}

/**
 * 에뮬레이터 시작
 * @param {Object} options 에뮬레이터 옵션
 * @returns {Object} 에뮬레이터 프로세스 및 정보
 */
function startEmulator(options = {}) {
  const {
    onlyServices = null,
    importData = false,
    exportOnExit = false,
    projectId = 'db888',
    configPath = 'firebase.emulator.json'
  } = options;
  
  prepareEmulatorEnvironment();
  
  // 에뮬레이터 명령 구성
  let command = 'firebase emulators:start';
  
  // 특정 서비스만 시작하는 경우
  if (onlyServices && onlyServices.length > 0) {
    command += ` --only ${onlyServices.join(',')}`;
  }
  
  // 설정 파일 지정
  command += ` --config=${configPath}`;
  
  // 프로젝트 ID 지정
  command += ` --project=${projectId}`;
  
  // 데이터 가져오기 옵션
  if (importData) {
    const importDir = typeof importData === 'string' ? 
      importData : path.join(emulatorDataDir, 'last_export');
    
    if (fs.existsSync(importDir)) {
      command += ` --import=${importDir}`;
    } else {
      console.warn(`경고: 가져올 데이터 디렉토리가 없습니다: ${importDir}`);
    }
  }
  
  // 종료 시 데이터 내보내기 옵션
  if (exportOnExit) {
    const exportDir = typeof exportOnExit === 'string' ? 
      exportOnExit : path.join(emulatorDataDir, 'last_export');
    
    fs.mkdirSync(exportDir, { recursive: true });
    command += ` --export-on-exit=${exportDir}`;
  }
  
  console.log(`에뮬레이터 시작 명령: ${command}`);
  
  // 에뮬레이터 프로세스 시작
  const emulatorProcess = spawn(command, {
    cwd: projectRoot,
    shell: true,
    stdio: 'pipe'
  });
  
  // 표준 출력 및 오류 처리
  emulatorProcess.stdout.on('data', (data) => {
    console.log(`에뮬레이터: ${data}`);
  });
  
  emulatorProcess.stderr.on('data', (data) => {
    console.error(`에뮬레이터 오류: ${data}`);
  });
  
  // 프로세스 종료 처리
  emulatorProcess.on('close', (code) => {
    console.log(`에뮬레이터 프로세스 종료됨 (코드: ${code})`);
  });
  
  return {
    process: emulatorProcess,
    command,
    stop: () => {
      emulatorProcess.kill('SIGINT');
    }
  };
}

/**
 * 에뮬레이터 데이터 내보내기
 * @param {string} exportDir 내보낼 디렉토리 경로
 * @returns {Promise<Object>} 내보내기 결과
 */
async function exportEmulatorData(exportDir = null) {
  if (!exportDir) {
    exportDir = path.join(emulatorDataDir, `export_${Date.now()}`);
  }
  
  fs.mkdirSync(exportDir, { recursive: true });
  
  try {
    // 에뮬레이터 실행 중인지 확인
    await checkEmulatorRunning();
    
    // 데이터 내보내기 명령 실행
    const command = `firebase emulators:export ${exportDir} --force`;
    const { stdout, stderr } = await execPromise(command, { cwd: projectRoot });
    
    console.log('에뮬레이터 데이터 내보내기 완료');
    console.log(stdout);
    
    if (stderr) {
      console.error('내보내기 중 경고/오류:', stderr);
    }
    
    return {
      success: true,
      exportDir,
      output: stdout
    };
  } catch (error) {
    console.error('에뮬레이터 데이터 내보내기 실패:', error);
    return {
      success: false,
      error: error.message
    };
  }
}

/**
 * 에뮬레이터 데이터 가져오기
 * @param {string} importDir 가져올 디렉토리 경로
 * @returns {Promise<Object>} 가져오기 결과
 */
async function importEmulatorData(importDir) {
  if (!importDir) {
    importDir = path.join(emulatorDataDir, 'last_export');
  }
  
  if (!fs.existsSync(importDir)) {
    console.error(`가져올 데이터 디렉토리가 없습니다: ${importDir}`);
    return {
      success: false,
      error: `디렉토리 없음: ${importDir}`
    };
  }
  
  try {
    // 에뮬레이터 실행 중인지 확인
    await checkEmulatorRunning();
    
    // 데이터 가져오기 명령 실행
    const command = `firebase emulators:start --import=${importDir} --only firestore`;
    const { stdout, stderr } = await execPromise(command, { cwd: projectRoot });
    
    console.log('에뮬레이터 데이터 가져오기 완료');
    console.log(stdout);
    
    if (stderr) {
      console.error('가져오기 중 경고/오류:', stderr);
    }
    
    return {
      success: true,
      importDir,
      output: stdout
    };
  } catch (error) {
    console.error('에뮬레이터 데이터 가져오기 실패:', error);
    return {
      success: false,
      error: error.message
    };
  }
}

/**
 * 에뮬레이터 실행 확인
 * @returns {Promise<boolean>} 에뮬레이터 실행 여부
 */
async function checkEmulatorRunning() {
  try {
    // 에뮬레이터 UI 포트에 접속 시도
    const response = await axios.get('http://localhost:11003', { timeout: 3000 });
    return response.status === 200;
  } catch (error) {
    if (error.code === 'ECONNREFUSED' || error.code === 'ETIMEDOUT') {
      throw new Error('에뮬레이터가 실행 중이지 않습니다.');
    }
    throw error;
  }
}

/**
 * 에뮬레이터에서 데이터베이스 시드
 * @param {string} seedFile 시드 데이터 파일 경로
 * @returns {Promise<Object>} 시드 결과
 */
async function seedEmulatorDatabase(seedFile) {
  try {
    // 에뮬레이터 실행 중인지 확인
    await checkEmulatorRunning();
    
    // 시드 파일 확인
    if (!fs.existsSync(seedFile)) {
      throw new Error(`시드 파일이 존재하지 않습니다: ${seedFile}`);
    }
    
    // 시드 스크립트 실행
    console.log(`데이터베이스 시드 시작: ${seedFile}`);
    
    // 시드 스크립트 실행
    const { stdout, stderr } = await execPromise(`node ${seedFile}`, { cwd: projectRoot });
    
    console.log('데이터베이스 시드 완료');
    console.log(stdout);
    
    if (stderr) {
      console.error('시드 중 경고/오류:', stderr);
    }
    
    return {
      success: true,
      output: stdout
    };
  } catch (error) {
    console.error('데이터베이스 시드 실패:', error);
    return {
      success: false,
      error: error.message
    };
  }
}

/**
 * 최근 에뮬레이터 로그 조회
 * @param {number} maxLines 최대 조회 라인 수
 * @returns {Promise<Array>} 로그 라인 배열
 */
async function getEmulatorLogs(maxLines = 100) {
  try {
    const logsDir = path.join(projectRoot, 'logs');
    
    if (!fs.existsSync(logsDir)) {
      return [];
    }
    
    // 로그 파일 목록 조회
    const logFiles = fs.readdirSync(logsDir)
      .filter(file => file.endsWith('.log'))
      .map(file => ({
        name: file,
        path: path.join(logsDir, file),
        mtime: fs.statSync(path.join(logsDir, file)).mtime
      }))
      .sort((a, b) => b.mtime - a.mtime);
    
    if (logFiles.length === 0) {
      return [];
    }
    
    // 가장 최근 로그 파일 내용 조회
    const latestLog = logFiles[0];
    const logContent = fs.readFileSync(latestLog.path, 'utf8');
    
    // 로그 라인 분리 및 제한
    const logLines = logContent.split('\n').filter(line => line.trim());
    
    if (logLines.length > maxLines) {
      return logLines.slice(logLines.length - maxLines);
    }
    
    return logLines;
  } catch (error) {
    console.error('로그 조회 실패:', error);
    return [];
  }
}

// 모듈 내보내기
module.exports = {
  startEmulator,
  exportEmulatorData,
  importEmulatorData,
  checkEmulatorRunning,
  seedEmulatorDatabase,
  getEmulatorLogs,
  prepareEmulatorEnvironment
};
