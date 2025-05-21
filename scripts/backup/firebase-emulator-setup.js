/**
 * Firebase 에뮬레이터 설정 도구
 * 
 * 이 스크립트는 로컬 개발을 위한 Firebase 에뮬레이터 환경을 설정합니다.
 * - 에뮬레이터 구성 설정
 * - 테스트 데이터 시드 생성
 * - 개발/테스트/프로덕션 환경 전환 도구
 */

const fs = require('fs');
const path = require('path');
const { execSync } = require('child_process');
const readline = require('readline');

// 프로젝트 루트 경로
const projectRoot = path.resolve(__dirname, '../..');
const emulatorDir = path.join(projectRoot, 'emulator-data');

// 명령행 인자 파싱
const args = process.argv.slice(2);
const command = args[0];

// 사용법 표시
function showUsage() {
  console.log(`
Firebase 에뮬레이터 설정 도구 v1.0.0

사용법:
  node firebase-emulator-setup.js command [options]

명령어:
  setup                    에뮬레이터 기본 설정 구성
  seed [--sample]          테스트 데이터 시드 생성
  start [--import=dir]     에뮬레이터 시작
  export [--dir=path]      에뮬레이터 데이터 내보내기
  switch [env]             환경 전환 (dev, test, prod)
  help                     도움말 표시

옵션:
  --sample                 샘플 데이터로 시드 생성
  --import=dir             지정된 디렉토리에서 데이터 가져오기
  --dir=path               내보내기 디렉토리 지정
  `);
}

// 에뮬레이터 기본 설정 구성
function setupEmulator() {
  console.log('Firebase 에뮬레이터 설정 구성 중...');
  
  // 에뮬레이터 데이터 디렉토리 생성
  if (!fs.existsSync(emulatorDir)) {
    fs.mkdirSync(emulatorDir, { recursive: true });
    console.log(`에뮬레이터 데이터 디렉토리 생성됨: ${emulatorDir}`);
  }
  
  // firebase.emulator.json 파일 확인
  const emulatorConfigPath = path.join(projectRoot, 'firebase.emulator.json');
  if (!fs.existsSync(emulatorConfigPath)) {
    const baseConfig = {
      "functions": {
        "port": 11001
      },
      "hosting": {
        "port": 11002
      },
      "ui": {
        "enabled": true,
        "port": 11003
      },
      "firestore": {
        "port": 11004
      },
      "hub": {
        "port": 11005
      },
      "logging": {
        "port": 11006
      }
    };
    
    // 설정 파일 생성
    fs.writeFileSync(
      emulatorConfigPath,
      JSON.stringify(baseConfig, null, 2)
    );
    
    console.log(`에뮬레이터 구성 파일 생성됨: ${emulatorConfigPath}`);
  } else {
    console.log(`에뮬레이터 구성 파일이 이미 존재함: ${emulatorConfigPath}`);
  }
  
  // 환경 변수 파일 (.env.emulator) 확인
  const envPath = path.join(projectRoot, '.env.emulator');
  if (!fs.existsSync(envPath)) {
    const envContent = `
# Firebase 에뮬레이터 환경 변수
FIREBASE_USE_EMULATORS=true
FIRESTORE_EMULATOR_HOST=localhost:11004
FUNCTIONS_EMULATOR_HOST=localhost:11001
FIREBASE_DATABASE_EMULATOR_HOST=localhost:11004
GCLOUD_PROJECT=db888-emulator
    `.trim();
    
    fs.writeFileSync(envPath, envContent);
    console.log(`에뮬레이터 환경 변수 파일 생성됨: ${envPath}`);
  } else {
    console.log(`에뮬레이터 환경 변수 파일이 이미 존재함: ${envPath}`);
  }
  
  // functions/package.json 업데이트
  const functionsDir = path.join(projectRoot, 'functions');
  const packageJsonPath = path.join(functionsDir, 'package.json');
  
  if (fs.existsSync(packageJsonPath)) {
    try {
      const packageJson = JSON.parse(fs.readFileSync(packageJsonPath, 'utf8'));
      
      // 에뮬레이터 스크립트 추가
      if (!packageJson.scripts) {
        packageJson.scripts = {};
      }
      
      if (!packageJson.scripts.emulator) {
        packageJson.scripts.emulator = "firebase emulators:start --import=../emulator-data --export-on-exit";
        
        fs.writeFileSync(
          packageJsonPath,
          JSON.stringify(packageJson, null, 2)
        );
        
        console.log('functions/package.json에 에뮬레이터 스크립트 추가됨');
      }
    } catch (error) {
      console.error('package.json 업데이트 중 오류 발생:', error);
    }
  }
  
  console.log('\n에뮬레이터 설정 구성이 완료되었습니다!');
  console.log('다음 명령으로 에뮬레이터를 시작할 수 있습니다:');
  console.log('  firebase emulators:start --import=emulator-data --export-on-exit');
  console.log('또는:');
  console.log('  npm run emulator (functions 디렉토리 내에서)');
}

// 테스트 데이터 시드 생성
async function seedEmulator(options) {
  console.log('Firebase 에뮬레이터 테스트 데이터 시드 생성 중...');
  
  // 에뮬레이터가 실행 중인지 확인
  try {
    // 포트 확인
    const netstatOutput = execSync('netstat -an | grep 11004', { encoding: 'utf8' });
    if (!netstatOutput.includes('LISTEN')) {
      console.error('오류: 에뮬레이터가 실행 중이지 않습니다. 먼저 에뮬레이터를 시작하세요.');
      process.exit(1);
    }
  } catch (error) {
    console.error('오류: 에뮬레이터가 실행 중이지 않습니다. 먼저 에뮬레이터를 시작하세요.');
    process.exit(1);
  }
  
  const admin = require('firebase-admin');
  
  // Admin SDK 초기화
  if (!admin.apps.length) {
    admin.initializeApp({
      projectId: 'db888-emulator'
    });
  }
  
  // 에뮬레이터 사용 설정
  process.env.FIRESTORE_EMULATOR_HOST = 'localhost:11004';
  
  const db = admin.firestore();
  
  // 샘플 데이터 생성
  if (options.sample) {
    console.log('샘플 데이터 생성 중...');
    
    // 사용자 컬렉션 샘플 데이터
    const users = [
      {
        id: 'user1',
        name: '홍길동',
        email: 'user1@example.com',
        role: 'admin',
        createdAt: admin.firestore.Timestamp.now()
      },
      {
        id: 'user2',
        name: '김철수',
        email: 'user2@example.com',
        role: 'user',
        createdAt: admin.firestore.Timestamp.now()
      },
      {
        id: 'user3',
        name: '이영희',
        email: 'user3@example.com',
        role: 'user',
        createdAt: admin.firestore.Timestamp.now()
      }
    ];
    
    // 고가치 사용자 컬렉션 샘플 데이터
    const highValueUsers = [
      {
        userId: 'hvu1',
        lastActive: admin.firestore.Timestamp.fromDate(new Date(Date.now() - 30 * 24 * 60 * 60 * 1000)), // 30일 전
        totalBet: 5000000,
        totalDeposit: 3000000,
        status: 'inactive',
        segment: 'former-whale'
      },
      {
        userId: 'hvu2',
        lastActive: admin.firestore.Timestamp.fromDate(new Date(Date.now() - 15 * 24 * 60 * 60 * 1000)), // 15일 전
        totalBet: 2000000,
        totalDeposit: 1500000,
        status: 'inactive',
        segment: 'medium-spender'
      },
      {
        userId: 'hvu3',
        lastActive: admin.firestore.Timestamp.fromDate(new Date(Date.now() - 2 * 24 * 60 * 60 * 1000)), // 2일 전
        totalBet: 8000000,
        totalDeposit: 5000000,
        status: 'active',
        segment: 'whale'
      }
    ];
    
    // 이벤트 컬렉션 샘플 데이터
    const events = [
      {
        id: 'event1',
        name: '신규 가입 보너스',
        description: '신규 가입자에게 제공되는 보너스',
        reward: 10000,
        startDate: admin.firestore.Timestamp.fromDate(new Date(Date.now() - 30 * 24 * 60 * 60 * 1000)),
        endDate: admin.firestore.Timestamp.fromDate(new Date(Date.now() + 30 * 24 * 60 * 60 * 1000)),
        status: 'active'
      },
      {
        id: 'event2',
        name: '재방문 보너스',
        description: '30일 이상 접속하지 않은 사용자를 위한 보너스',
        reward: 5000,
        startDate: admin.firestore.Timestamp.fromDate(new Date(Date.now() - 15 * 24 * 60 * 60 * 1000)),
        endDate: admin.firestore.Timestamp.fromDate(new Date(Date.now() + 15 * 24 * 60 * 60 * 1000)),
        status: 'active'
      }
    ];
    
    // 배치 작업으로 데이터 저장
    const batch = db.batch();
    
    // 사용자 데이터 저장
    users.forEach(user => {
      const docRef = db.collection('users').doc(user.id);
      batch.set(docRef, user);
    });
    
    // 고가치 사용자 데이터 저장
    highValueUsers.forEach(user => {
      const docRef = db.collection('highValueUsers').doc(user.userId);
      batch.set(docRef, user);
    });
    
    // 이벤트 데이터 저장
    events.forEach(event => {
      const docRef = db.collection('events').doc(event.id);
      batch.set(docRef, event);
    });
    
    // 배치 커밋
    await batch.commit();
    
    console.log('샘플 데이터 생성 완료:');
    console.log(`- 사용자 데이터: ${users.length}개`);
    console.log(`- 고가치 사용자 데이터: ${highValueUsers.length}개`);
    console.log(`- 이벤트 데이터: ${events.length}개`);
  } else {
    // 사용자 정의 데이터 시드 생성
    console.log('사용자 정의 데이터 시드 생성 모드');
    
    const rl = readline.createInterface({
      input: process.stdin,
      output: process.stdout
    });
    
    // 컬렉션 선택
    const collectionName = await new Promise(resolve => {
      rl.question('시드 데이터를 생성할 컬렉션 이름을 입력하세요: ', resolve);
    });
    
    // 문서 수 입력
    const docCount = await new Promise(resolve => {
      rl.question('생성할 문서 수를 입력하세요: ', answer => {
        resolve(parseInt(answer, 10) || 1);
      });
    });
    
    // 템플릿 문서 구조 입력
    console.log('\n문서 템플릿을 JSON 형식으로 입력하세요 (입력 완료 후 빈 줄에서 Enter):');
    let templateStr = '';
    let line;
    
    while (true) {
      line = await new Promise(resolve => rl.question('', resolve));
      if (!line.trim()) break;
      templateStr += line + '\n';
    }
    
    // JSON 파싱
    let template;
    try {
      template = JSON.parse(templateStr);
    } catch (error) {
      console.error('JSON 구문 오류:', error.message);
      rl.close();
      process.exit(1);
    }
    
    // 문서 생성
    const batch = db.batch();
    
    for (let i = 0; i < docCount; i++) {
      const docId = `seed-${i + 1}`;
      const docRef = db.collection(collectionName).doc(docId);
      
      // 템플릿 복제 및 수정
      const docData = { ...template, id: docId, index: i + 1 };
      
      batch.set(docRef, docData);
    }
    
    // 배치 커밋
    await batch.commit();
    
    console.log(`\n${collectionName} 컬렉션에 ${docCount}개의 문서가 생성되었습니다.`);
    rl.close();
  }
  
  console.log('\n에뮬레이터 테스트 데이터 시드 생성이 완료되었습니다!');
}

// 에뮬레이터 시작
function startEmulator(options) {
  console.log('Firebase 에뮬레이터 시작 중...');
  
  let command = 'firebase emulators:start';
  
  // 데이터 가져오기 옵션
  if (options.import) {
    command += ` --import=${options.import}`;
  } else if (fs.existsSync(emulatorDir)) {
    command += ` --import=${emulatorDir}`;
  }
  
  // 종료 시 내보내기 옵션
  command += ' --export-on-exit';
  
  console.log(`실행 명령어: ${command}`);
  
  try {
    execSync(command, { stdio: 'inherit', cwd: projectRoot });
  } catch (error) {
    console.error('에뮬레이터 시작 중 오류 발생:', error.message);
    process.exit(1);
  }
}

// 에뮬레이터 데이터 내보내기
function exportEmulator(options) {
  console.log('Firebase 에뮬레이터 데이터 내보내기 중...');
  
  const exportDir = options.dir || path.join(emulatorDir, `export_${Date.now()}`);
  
  const command = `firebase emulators:export ${exportDir}`;
  
  console.log(`실행 명령어: ${command}`);
  
  try {
    execSync(command, { stdio: 'inherit', cwd: projectRoot });
    console.log(`\n에뮬레이터 데이터가 ${exportDir}로 내보내기되었습니다.`);
  } catch (error) {
    console.error('데이터 내보내기 중 오류 발생:', error.message);
    process.exit(1);
  }
}

// 환경 전환
function switchEnvironment(env) {
  console.log(`Firebase 환경 전환 중: ${env || 'dev'}`);
  
  // 환경별 설정 파일
  const envFiles = {
    dev: '.env.development',
    test: '.env.test',
    prod: '.env.production'
  };
  
  // 기본값은 dev
  const targetEnv = env || 'dev';
  
  if (!envFiles[targetEnv]) {
    console.error(`오류: 알 수 없는 환경 '${targetEnv}'`);
    console.log('사용 가능한 환경: dev, test, prod');
    process.exit(1);
  }
  
  const envFilePath = path.join(projectRoot, envFiles[targetEnv]);
  const defaultEnvPath = path.join(projectRoot, '.env');
  
  // 환경 설정 파일 존재 여부 확인
  if (!fs.existsSync(envFilePath)) {
    console.error(`오류: 환경 설정 파일을 찾을 수 없습니다: ${envFilePath}`);
    process.exit(1);
  }
  
  // 현재 환경 백업
  if (fs.existsSync(defaultEnvPath)) {
    fs.copyFileSync(defaultEnvPath, `${defaultEnvPath}.backup`);
    console.log('현재 환경 설정이 백업되었습니다.');
  }
  
  // 새 환경으로 전환
  fs.copyFileSync(envFilePath, defaultEnvPath);
  
  // firebase 프로젝트 전환 (있는 경우)
  const firebaseRcPath = path.join(projectRoot, '.firebaserc');
  
  if (fs.existsSync(firebaseRcPath)) {
    // .firebaserc 파일 읽기
    const firebaseRc = JSON.parse(fs.readFileSync(firebaseRcPath, 'utf8'));
    
    if (firebaseRc.projects && Object.keys(firebaseRc.projects).length > 0) {
      // 환경별 프로젝트 매핑
      const projectAliases = {
        dev: 'development',
        test: 'staging',
        prod: 'default'
      };
      
      const alias = projectAliases[targetEnv];
      
      if (firebaseRc.projects[alias]) {
        const command = `firebase use ${alias}`;
        try {
          execSync(command, { stdio: 'inherit', cwd: projectRoot });
        } catch (error) {
          console.warn(`Firebase 프로젝트 전환 중 경고: ${error.message}`);
        }
      } else {
        console.warn(`경고: .firebaserc에 '${alias}' 프로젝트 별칭이 없습니다.`);
      }
    }
  }
  
  console.log(`\n환경이 '${targetEnv}'로 성공적으로 전환되었습니다.`);
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
    
    if (arg === '--sample') {
      options.sample = true;
    } else if (arg.startsWith('--import=')) {
      options.import = arg.split('=')[1];
    } else if (arg.startsWith('--dir=')) {
      options.dir = arg.split('=')[1];
    } else if (!arg.startsWith('--') && command === 'switch') {
      options.env = arg;
    }
  }
  
  // 명령어 실행
  switch (command) {
    case 'setup':
      setupEmulator();
      break;
    case 'seed':
      await seedEmulator(options);
      break;
    case 'start':
      startEmulator(options);
      break;
    case 'export':
      exportEmulator(options);
      break;
    case 'switch':
      switchEnvironment(options.env);
      break;
    default:
      console.error(`오류: 알 수 없는 명령어 '${command}'`);
      showUsage();
      process.exit(1);
  }
}

// 메인 함수 실행
main().catch(console.error);
