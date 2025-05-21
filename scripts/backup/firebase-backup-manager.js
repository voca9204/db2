/**
 * Firebase 백업 관리 시스템
 * 
 * 이 스크립트는 Firebase 프로젝트의 로컬 백업을 관리하는 종합적인 도구입니다.
 * 기능:
 * - 자동화된 백업 생성 (구성, 함수, 호스팅, Firestore 데이터)
 * - 백업 목록 관리 및 조회
 * - 백업 복원
 * - Git 통합을 통한 버전 관리
 * - 백업 정리 (오래된 백업 삭제)
 * 
 * 사용법:
 * node firebase-backup-manager.js command [options]
 * 
 * 명령어:
 * - create: 백업 생성
 * - list: 백업 목록 조회
 * - restore: 백업 복원
 * - clean: 오래된 백업 정리
 * - schedule: 자동 백업 일정 설정
 */

const fs = require('fs');
const path = require('path');
const { execSync, spawn } = require('child_process');
const readline = require('readline');
const backupLib = require('./firebase-backup-lib');

// 프로젝트 루트 경로
const projectRoot = path.resolve(__dirname, '../..');
const backupDir = path.join(projectRoot, 'backup');

// 명령행 인자 파싱
const args = process.argv.slice(2);
const command = args[0];

// 사용법 표시
function showUsage() {
  console.log(`
Firebase 백업 관리 시스템 v1.0.0

사용법:
  node firebase-backup-manager.js command [options]

명령어:
  create [--with-firestore] [--direct] [--git] [notes]  백업 생성
  list [--limit=n] [--format=json|table]               백업 목록 조회
  restore <backup-id>                                   백업 복원
  clean [--days=n] [--keep=n]                          오래된 백업 정리
  schedule [--daily|--weekly] [--time=HH:MM]           자동 백업 일정 설정
  help                                                  도움말 표시

옵션:
  --with-firestore   Firestore 데이터 포함 (기본: 구성만 백업)
  --direct           Firebase Admin SDK 직접 사용 (기본: 에뮬레이터 사용)
  --git              백업 후 Git 저장소에 변경사항 커밋
  --limit=n          표시할 백업 수 제한 (기본: 10)
  --format=format    출력 형식 (json 또는 table, 기본: table)
  --days=n           n일보다 오래된 백업 삭제 (기본: 30)
  --keep=n           최소 n개의 백업 유지 (기본: 5)
  --daily            매일 자동 백업 설정
  --weekly           매주 자동 백업 설정
  --time=HH:MM       자동 백업 시작 시간 (기본: 01:00)
  `);
}

// 백업 생성 함수
async function createBackup(options) {
  console.log('Firebase 백업 생성 중...');
  
  // 백업 옵션 구성
  const backupOptions = {
    backupComponents: ['config', 'functions', 'hosting'],
    notes: options.notes || '',
    firestoreMode: options.direct ? 'direct' : 'emulator',
    verbose: true
  };
  
  // Firestore 포함 옵션
  if (options.withFirestore) {
    backupOptions.backupComponents.push('firestore');
  }
  
  try {
    // 백업 실행
    const result = await backupLib.performBackup(backupOptions);
    
    if (!result.success) {
      console.error('백업 생성 실패:', result.error);
      process.exit(1);
    }
    
    // Git 통합 옵션 처리
    if (options.git) {
      try {
        console.log('\nGit 저장소에 백업 커밋 중...');
        
        // 백업 정보 가져오기
        const backupInfoPath = path.join(result.backupPath, 'backup-info.json');
        const backupInfo = JSON.parse(fs.readFileSync(backupInfoPath, 'utf8'));
        
        // Git에 변경사항 추가
        execSync('git add .', { cwd: projectRoot });
        
        // 커밋 메시지 생성
        const commitMessage = `Backup: ${path.basename(result.backupPath)} - ${backupInfo.notes || 'Firebase backup'}`;
        
        // 변경사항 커밋
        execSync(`git commit -m "${commitMessage}"`, { cwd: projectRoot });
        
        console.log('Git 커밋 완료!');
      } catch (error) {
        console.error('Git 커밋 중 오류 발생:', error.message);
      }
    }
    
    console.log(`\n백업이 성공적으로 생성되었습니다: ${path.basename(result.backupPath)}`);
  } catch (error) {
    console.error('백업 생성 중 오류 발생:', error);
    process.exit(1);
  }
}

// 백업 목록 조회 함수
function listBackups(options) {
  console.log('Firebase 백업 목록 조회 중...');
  
  // 백업 디렉토리 확인
  if (!fs.existsSync(backupDir)) {
    console.log('백업이 없습니다.');
    return;
  }
  
  // 백업 디렉토리 목록 가져오기
  const backupDirs = fs.readdirSync(backupDir)
    .filter(dir => {
      const dirPath = path.join(backupDir, dir);
      return fs.statSync(dirPath).isDirectory() && 
             fs.existsSync(path.join(dirPath, 'backup-info.json'));
    })
    .map(dir => {
      const dirPath = path.join(backupDir, dir);
      const infoPath = path.join(dirPath, 'backup-info.json');
      
      try {
        const info = JSON.parse(fs.readFileSync(infoPath, 'utf8'));
        return {
          id: dir,
          timestamp: info.timestamp,
          type: info.backupType,
          components: info.backupComponents,
          notes: info.notes || '',
          user: info.user || 'unknown'
        };
      } catch (error) {
        return {
          id: dir,
          timestamp: new Date(0).toISOString(),
          type: 'unknown',
          components: [],
          notes: '정보 파일 읽기 실패',
          user: 'unknown'
        };
      }
    })
    .sort((a, b) => new Date(b.timestamp) - new Date(a.timestamp));
  
  // 출력 제한
  const limit = options.limit || 10;
  const limitedBackups = backupDirs.slice(0, limit);
  
  // 출력 형식
  if (options.format === 'json') {
    console.log(JSON.stringify(limitedBackups, null, 2));
  } else {
    // 테이블 형식 출력
    console.log('\n백업 목록:');
    console.log('---------------------------------------------------------------');
    console.log('ID                     | 날짜                | 타입     | 노트');
    console.log('---------------------------------------------------------------');
    
    limitedBackups.forEach(backup => {
      const date = new Date(backup.timestamp).toLocaleString();
      const id = backup.id.padEnd(22);
      const dateStr = date.padEnd(19);
      const type = backup.type.padEnd(8);
      console.log(`${id} | ${dateStr} | ${type} | ${backup.notes.substring(0, 30)}`);
    });
    
    console.log('---------------------------------------------------------------');
    console.log(`총 ${backupDirs.length}개 백업 중 ${limitedBackups.length}개 표시`);
  }
}

// 백업 복원 함수
async function restoreBackup(backupId) {
  // 백업 경로 확인
  const backupPath = path.join(backupDir, backupId);
  
  if (!fs.existsSync(backupPath) || !fs.existsSync(path.join(backupPath, 'backup-info.json'))) {
    console.error(`오류: 백업 ID '${backupId}'를 찾을 수 없습니다.`);
    process.exit(1);
  }
  
  // 백업 정보 가져오기
  const backupInfo = JSON.parse(fs.readFileSync(path.join(backupPath, 'backup-info.json'), 'utf8'));
  
  console.log(`\n백업 '${backupId}' 복원 준비 중...`);
  console.log(`생성 일시: ${new Date(backupInfo.timestamp).toLocaleString()}`);
  console.log(`백업 타입: ${backupInfo.backupType}`);
  console.log(`포함 구성요소: ${backupInfo.backupComponents.join(', ')}`);
  console.log(`메모: ${backupInfo.notes || '없음'}`);
  
  // 사용자 확인
  const rl = readline.createInterface({
    input: process.stdin,
    output: process.stdout
  });
  
  const answer = await new Promise(resolve => {
    rl.question('\n이 백업을 복원하시겠습니까? 현재 파일이 덮어쓰기됩니다. (y/N): ', resolve);
  });
  
  rl.close();
  
  if (answer.toLowerCase() !== 'y') {
    console.log('백업 복원이 취소되었습니다.');
    return;
  }
  
  console.log('\n백업 복원 중...');
  
  try {
    // 백업 복원 로직
    // 1. 구성 파일 복원
    if (backupInfo.backupComponents.includes('config')) {
      console.log('구성 파일 복원 중...');
      const configDir = path.join(backupPath, 'config');
      
      if (fs.existsSync(configDir)) {
        const configFiles = fs.readdirSync(configDir);
        
        for (const file of configFiles) {
          const sourcePath = path.join(configDir, file);
          const targetPath = path.join(projectRoot, file);
          
          fs.copyFileSync(sourcePath, targetPath);
          console.log(`파일 복원 완료: ${file}`);
        }
      }
    }
    
    // 2. Functions 복원
    if (backupInfo.backupComponents.includes('functions')) {
      console.log('\nFunctions 복원 중...');
      const functionsBackupDir = path.join(backupPath, 'functions');
      const functionsDir = path.join(projectRoot, 'functions');
      
      if (fs.existsSync(functionsBackupDir)) {
        // index.js 및 package.json 복원
        for (const file of ['index.js', 'package.json']) {
          const sourcePath = path.join(functionsBackupDir, file);
          const targetPath = path.join(functionsDir, file);
          
          if (fs.existsSync(sourcePath)) {
            fs.copyFileSync(sourcePath, targetPath);
            console.log(`파일 복원 완료: functions/${file}`);
          }
        }
        
        // src 디렉토리 복원
        const srcBackupDir = path.join(functionsBackupDir, 'src');
        const srcDir = path.join(functionsDir, 'src');
        
        if (fs.existsSync(srcBackupDir)) {
          // src 디렉토리가 없으면 생성
          if (!fs.existsSync(srcDir)) {
            fs.mkdirSync(srcDir, { recursive: true });
          }
          
          // 파일 복사
          restoreDirectory(srcBackupDir, srcDir);
        }
      }
    }
    
    // 3. Hosting 복원
    if (backupInfo.backupComponents.includes('hosting')) {
      console.log('\nHosting 파일 복원 중...');
      const publicBackupDir = path.join(backupPath, 'public');
      const publicDir = path.join(projectRoot, 'public');
      
      if (fs.existsSync(publicBackupDir)) {
        // public 디렉토리가 없으면 생성
        if (!fs.existsSync(publicDir)) {
          fs.mkdirSync(publicDir, { recursive: true });
        }
        
        // 파일 복사
        restoreDirectory(publicBackupDir, publicDir);
      }
    }
    
    // 4. Firestore 데이터 복원 (옵션)
    if (backupInfo.backupComponents.includes('firestore')) {
      console.log('\nFirestore 데이터 복원 옵션:\n');
      console.log('1. 에뮬레이터를 사용하여 로컬에서만 복원');
      console.log('2. Firebase 프로젝트에 직접 복원 (주의: 프로덕션 데이터에 영향을 미칠 수 있음)');
      console.log('3. 복원하지 않음');
      
      const restoreOption = await new Promise(resolve => {
        const rl = readline.createInterface({
          input: process.stdin,
          output: process.stdout
        });
        rl.question('\n옵션 선택 (1-3): ', (answer) => {
          rl.close();
          resolve(answer.trim());
        });
      });
      
      const firestoreBackupDir = path.join(backupPath, 'firestore');
      
      if (restoreOption === '1' && fs.existsSync(firestoreBackupDir)) {
        console.log('\n에뮬레이터에 Firestore 데이터 복원 중...');
        
        // Firebase 에뮬레이터 설정 불러오기
        const emulatorDir = path.join(projectRoot, 'emulator-data');
        
        if (!fs.existsSync(emulatorDir)) {
          fs.mkdirSync(emulatorDir, { recursive: true });
        }
        
        // 에뮬레이터 이전 데이터 백업
        const timestamp = new Date().getTime();
        const emulatorBackupDir = path.join(emulatorDir, `backup_${timestamp}`);
        
        if (fs.existsSync(path.join(emulatorDir, 'firestore_export'))) {
          fs.mkdirSync(emulatorBackupDir, { recursive: true });
          restoreDirectory(path.join(emulatorDir, 'firestore_export'), path.join(emulatorBackupDir, 'firestore_export'));
        }
        
        // 백업 데이터를 에뮬레이터 디렉토리로 복사
        if (fs.existsSync(path.join(firestoreBackupDir, 'firestore_export'))) {
          restoreDirectory(path.join(firestoreBackupDir, 'firestore_export'), path.join(emulatorDir, 'firestore_export'));
        } else {
          restoreDirectory(firestoreBackupDir, path.join(emulatorDir, 'firestore_export'));
        }
        
        console.log('Firestore 데이터가 에뮬레이터 디렉토리에 복원되었습니다.');
        console.log(`다음 명령으로 에뮬레이터를 시작하세요: firebase emulators:start --import=${emulatorDir}`);
      } else if (restoreOption === '2' && fs.existsSync(firestoreBackupDir)) {
        console.log('\n경고: 이 작업은 프로덕션 Firestore 데이터를 덮어쓸 수 있습니다!');
        const confirmRestore = await new Promise(resolve => {
          const rl = readline.createInterface({
            input: process.stdin,
            output: process.stdout
          });
          rl.question('정말로 진행하시겠습니까? (yes/N): ', (answer) => {
            rl.close();
            resolve(answer.trim().toLowerCase() === 'yes');
          });
        });
        
        if (confirmRestore) {
          console.log('\nFirebase Admin SDK를 사용하여 Firestore 데이터 복원 중...');
          
          // 직접 복원 로직은 복잡하므로 별도 스크립트 호출
          const restoreProcess = spawn('node', [
            path.join(__dirname, 'firebase-restore-firestore.js'),
            firestoreBackupDir
          ]);
          
          restoreProcess.stdout.on('data', (data) => {
            console.log(data.toString());
          });
          
          restoreProcess.stderr.on('data', (data) => {
            console.error(data.toString());
          });
          
          const exitCode = await new Promise(resolve => {
            restoreProcess.on('close', resolve);
          });
          
          if (exitCode === 0) {
            console.log('Firestore 데이터가 성공적으로 복원되었습니다.');
          } else {
            console.error('Firestore 데이터 복원 중 오류가 발생했습니다.');
          }
        } else {
          console.log('Firestore 데이터 복원이 취소되었습니다.');
        }
      } else {
        console.log('Firestore 데이터 복원을 건너뜁니다.');
      }
    }
    
    console.log('\n백업 복원이 완료되었습니다!');
  } catch (error) {
    console.error('백업 복원 중 오류 발생:', error);
    process.exit(1);
  }
}

// 디렉토리 복원 함수 (재귀)
function restoreDirectory(sourceDir, targetDir) {
  if (!fs.existsSync(targetDir)) {
    fs.mkdirSync(targetDir, { recursive: true });
  }
  
  const entries = fs.readdirSync(sourceDir, { withFileTypes: true });
  
  for (const entry of entries) {
    const sourcePath = path.join(sourceDir, entry.name);
    const targetPath = path.join(targetDir, entry.name);
    
    if (entry.isDirectory()) {
      restoreDirectory(sourcePath, targetPath);
    } else {
      fs.copyFileSync(sourcePath, targetPath);
      console.log(`  파일 복원: ${path.relative(projectRoot, targetPath)}`);
    }
  }
}

// 오래된 백업 정리 함수
function cleanBackups(options) {
  console.log('오래된 백업 정리 중...');
  
  // 백업 디렉토리 확인
  if (!fs.existsSync(backupDir)) {
    console.log('백업이 없습니다.');
    return;
  }
  
  // 백업 디렉토리 목록 가져오기
  const backupDirs = fs.readdirSync(backupDir)
    .filter(dir => {
      const dirPath = path.join(backupDir, dir);
      return fs.statSync(dirPath).isDirectory() && 
             fs.existsSync(path.join(dirPath, 'backup-info.json'));
    })
    .map(dir => {
      const dirPath = path.join(backupDir, dir);
      const infoPath = path.join(dirPath, 'backup-info.json');
      
      try {
        const info = JSON.parse(fs.readFileSync(infoPath, 'utf8'));
        return {
          id: dir,
          path: dirPath,
          timestamp: info.timestamp,
          date: new Date(info.timestamp)
        };
      } catch (error) {
        return {
          id: dir,
          path: dirPath,
          timestamp: new Date(0).toISOString(),
          date: new Date(0)
        };
      }
    })
    .sort((a, b) => b.date - a.date); // 최신순 정렬
  
  // 옵션 처리
  const days = options.days || 30;
  const keep = options.keep || 5;
  
  // 보존할 최소 수보다 적으면 삭제하지 않음
  if (backupDirs.length <= keep) {
    console.log(`백업 수(${backupDirs.length})가 최소 보존 수(${keep})보다 적어 삭제하지 않습니다.`);
    return;
  }
  
  // 삭제 기준일 계산
  const cutoffDate = new Date();
  cutoffDate.setDate(cutoffDate.getDate() - days);
  
  // 삭제 대상 백업 선택
  let toDelete = backupDirs
    .filter((backup, index) => index >= keep && backup.date < cutoffDate);
  
  if (toDelete.length === 0) {
    console.log(`삭제할 백업이 없습니다. (${days}일 이전, 최소 ${keep}개 유지)`);
    return;
  }
  
  console.log(`\n${toDelete.length}개의 오래된 백업을 삭제합니다:`);
  toDelete.forEach(backup => {
    console.log(`- ${backup.id} (${backup.date.toLocaleString()})`);
  });
  
  // 사용자 확인
  const rl = readline.createInterface({
    input: process.stdin,
    output: process.stdout
  });
  
  rl.question('\n계속하시겠습니까? (y/N): ', (answer) => {
    rl.close();
    
    if (answer.toLowerCase() !== 'y') {
      console.log('백업 정리가 취소되었습니다.');
      return;
    }
    
    // 백업 삭제
    console.log('\n백업 삭제 중...');
    
    toDelete.forEach(backup => {
      try {
        fs.rmSync(backup.path, { recursive: true, force: true });
        console.log(`삭제 완료: ${backup.id}`);
      } catch (error) {
        console.error(`${backup.id} 삭제 중 오류 발생:`, error.message);
      }
    });
    
    console.log(`\n${toDelete.length}개의 오래된 백업이 삭제되었습니다.`);
  });
}

// 자동 백업 일정 설정 함수
function scheduleBackups(options) {
  console.log('자동 백업 일정 설정 중...');
  
  // 옵션 처리
  const frequency = options.daily ? 'daily' : (options.weekly ? 'weekly' : 'daily');
  const time = options.time || '01:00';
  
  // 시간 형식 검증
  const timeRegex = /^([01]\d|2[0-3]):([0-5]\d)$/;
  if (!timeRegex.test(time)) {
    console.error('오류: 시간 형식이 잘못되었습니다. HH:MM 형식(예: 01:30)으로 입력하세요.');
    process.exit(1);
  }
  
  // crontab 표현식 생성
  const [hour, minute] = time.split(':');
  let cronExpression;
  
  if (frequency === 'daily') {
    cronExpression = `${minute} ${hour} * * *`;
  } else {
    // 매주 일요일
    cronExpression = `${minute} ${hour} * * 0`;
  }
  
  // 백업 스크립트 경로
  const scriptPath = path.join(__dirname, 'firebase-backup-manager.js');
  const backupCommand = `node ${scriptPath} create --with-firestore --git "Scheduled backup"`;
  
  // 현재 crontab 가져오기
  try {
    const currentCrontab = execSync('crontab -l', { encoding: 'utf8' });
    
    // 기존 백업 작업 찾기
    const backupJobRegex = new RegExp(`.*node ${scriptPath.replace(/\//g, '\\/')} create.*`);
    const lines = currentCrontab.split('\n');
    const hasBackupJob = lines.some(line => backupJobRegex.test(line));
    
    let newCrontab;
    
    if (hasBackupJob) {
      // 기존 작업 업데이트
      newCrontab = lines.map(line => {
        if (backupJobRegex.test(line)) {
          return `${cronExpression} ${backupCommand}`;
        }
        return line;
      }).join('\n');
    } else {
      // 새 작업 추가
      newCrontab = currentCrontab.trim() + `\n${cronExpression} ${backupCommand}\n`;
    }
    
    // 새 crontab 설정
    fs.writeFileSync('/tmp/firebase-backup-crontab', newCrontab);
    execSync('crontab /tmp/firebase-backup-crontab');
    fs.unlinkSync('/tmp/firebase-backup-crontab');
    
    console.log(`\n자동 백업이 ${frequency === 'daily' ? '매일' : '매주'} ${time}에 실행되도록 설정되었습니다.`);
  } catch (error) {
    if (error.message.includes('no crontab')) {
      // crontab이 없는 경우 새로 생성
      const newCrontab = `${cronExpression} ${backupCommand}\n`;
      fs.writeFileSync('/tmp/firebase-backup-crontab', newCrontab);
      execSync('crontab /tmp/firebase-backup-crontab');
      fs.unlinkSync('/tmp/firebase-backup-crontab');
      
      console.log(`\n자동 백업이 ${frequency === 'daily' ? '매일' : '매주'} ${time}에 실행되도록 설정되었습니다.`);
    } else {
      console.error('crontab 설정 중 오류 발생:', error.message);
      process.exit(1);
    }
  }
}

// 메인 함수
async function main() {
  // 명령어가 없는 경우 사용법 표시
  if (!command || command === 'help') {
    showUsage();
    process.exit(0);
  }
  
  // 옵션 파싱
  const options = {};
  for (let i = 1; i < args.length; i++) {
    const arg = args[i];
    
    if (arg === '--with-firestore') {
      options.withFirestore = true;
    } else if (arg === '--direct') {
      options.direct = true;
    } else if (arg === '--git') {
      options.git = true;
    } else if (arg === '--daily') {
      options.daily = true;
    } else if (arg === '--weekly') {
      options.weekly = true;
    } else if (arg.startsWith('--limit=')) {
      options.limit = parseInt(arg.split('=')[1], 10);
    } else if (arg.startsWith('--format=')) {
      options.format = arg.split('=')[1];
    } else if (arg.startsWith('--days=')) {
      options.days = parseInt(arg.split('=')[1], 10);
    } else if (arg.startsWith('--keep=')) {
      options.keep = parseInt(arg.split('=')[1], 10);
    } else if (arg.startsWith('--time=')) {
      options.time = arg.split('=')[1];
    } else if (!arg.startsWith('--')) {
      // 옵션이 아닌 인자는 메모 또는 백업 ID로 처리
      if (command === 'create') {
        options.notes = arg;
      } else if (command === 'restore') {
        options.backupId = arg;
      }
    }
  }
  
  // 명령어 실행
  switch (command) {
    case 'create':
      await createBackup(options);
      break;
    case 'list':
      listBackups(options);
      break;
    case 'restore':
      if (!options.backupId && args[1] && !args[1].startsWith('--')) {
        options.backupId = args[1];
      }
      if (!options.backupId) {
        console.error('오류: 복원할 백업 ID를 지정하세요.');
        process.exit(1);
      }
      await restoreBackup(options.backupId);
      break;
    case 'clean':
      cleanBackups(options);
      break;
    case 'schedule':
      scheduleBackups(options);
      break;
    default:
      console.error(`오류: 알 수 없는 명령어 '${command}'`);
      showUsage();
      process.exit(1);
  }
}

// 메인 함수 실행
main().catch(console.error);
