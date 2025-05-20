# Firebase Functions 에뮬레이터 설정 가이드

이 문서는 Firebase Functions의 로컬 개발 및 테스트를 위한 에뮬레이터 환경 설정 방법을 안내합니다.

## 1. Firebase CLI 설치

Firebase CLI가 아직 설치되어 있지 않다면 다음 명령어로 설치합니다:

```bash
npm install -g firebase-tools
```

설치 후 Firebase 계정으로 로그인합니다:

```bash
firebase login
```

## 2. 프로젝트 설정

Firebase 프로젝트와 연결합니다:

```bash
# 프로젝트 디렉토리로 이동
cd /users/sinclair/projects/db2

# 프로젝트 설정
firebase use --add
# 프로젝트 ID를 선택하고 별칭을 지정합니다 (예: default)
```

## 3. firebase.json 설정

프로젝트 루트에 `firebase.json` 파일이 있는지 확인하고, 에뮬레이터 설정을 추가합니다:

```json
{
  "functions": {
    "source": "functions"
  },
  "emulators": {
    "functions": {
      "port": 5001
    },
    "firestore": {
      "port": 8080
    },
    "auth": {
      "port": 9099
    },
    "pubsub": {
      "port": 8085
    },
    "ui": {
      "enabled": true,
      "port": 4000
    }
  }
}
```

## 4. 환경 변수 설정

`.env` 파일을 사용하여, 로컬 개발 시 필요한 환경 변수를 설정합니다:

```bash
# functions/.env 파일 생성
touch functions/.env

# 환경 변수 추가
cat << EOF > functions/.env
NODE_ENV=development
FUNCTIONS_REGION=asia-northeast3
DB_HOST=211.248.190.46
DB_USER=hermes
DB_PASSWORD=mcygicng!022
DB_NAME=hermes
EOF
```

`.env.example` 파일도 생성하여 필요한 환경 변수의 템플릿을 제공하세요 (실제 비밀값은 포함하지 않음):

```bash
cat << EOF > functions/.env.example
NODE_ENV=development
FUNCTIONS_REGION=asia-northeast3
DB_HOST=localhost
DB_USER=db_user
DB_PASSWORD=your_password
DB_NAME=your_db_name
EOF
```

## 5. Firebase 에뮬레이터 실행

다음 명령어로 Firebase 에뮬레이터를 실행합니다:

```bash
# 전체 에뮬레이터 실행
firebase emulators:start

# 또는 Functions 에뮬레이터만 실행
firebase emulators:start --only functions
```

에뮬레이터 UI에 접근하려면 브라우저에서 다음 URL을 방문하세요:
http://localhost:4000

## 6. 테스트 데이터 설정

Firestore 에뮬레이터에 테스트 데이터를 설정하려면 다음과 같은 스크립트를 만들 수 있습니다:

```javascript
// scripts/firebase/seed-emulator.js
const admin = require('firebase-admin');
const fs = require('fs');
const path = require('path');

// 테스트 환경에서는 에뮬레이터에 연결
process.env.FIRESTORE_EMULATOR_HOST = 'localhost:8080';
process.env.FIREBASE_AUTH_EMULATOR_HOST = 'localhost:9099';

// Firebase Admin SDK 초기화
admin.initializeApp({
  projectId: 'demo-db2'
});

const db = admin.firestore();

async function seedFirestore() {
  console.log('Seeding Firestore emulator...');
  
  // 테스트 데이터 경로
  const dataPath = path.join(__dirname, '../../data/test');
  
  // 고가치 사용자 데이터 추가
  const highValueUsers = require(path.join(dataPath, 'high-value-users.json'));
  const highValueUsersBatch = db.batch();
  
  highValueUsers.forEach((user, index) => {
    const docRef = db.collection('highValueUsers').doc(user.userId.toString());
    highValueUsersBatch.set(docRef, user);
  });
  
  await highValueUsersBatch.commit();
  console.log(`Added ${highValueUsers.length} high-value users to Firestore emulator`);
  
  // 이벤트 데이터 추가
  const events = require(path.join(dataPath, 'events.json'));
  const eventsBatch = db.batch();
  
  events.forEach((event, index) => {
    const docRef = db.collection('events').doc(event.eventId.toString());
    eventsBatch.set(docRef, event);
  });
  
  await eventsBatch.commit();
  console.log(`Added ${events.length} events to Firestore emulator`);
  
  console.log('Firestore emulator seeding completed!');
}

// 테스트 데이터 추가 실행
seedFirestore().catch(error => {
  console.error('Error seeding Firestore emulator:', error);
  process.exit(1);
});
```

이 스크립트를 실행하려면:

```bash
node scripts/firebase/seed-emulator.js
```

## 7. 로컬 함수 테스트

### 7.1 Shell을 통한 테스트

Firebase Functions Shell을 사용하여 함수를 테스트할 수 있습니다:

```bash
firebase functions:shell
```

셸에서 함수를 호출할 수 있습니다:

```
healthCheck.get().then(result => console.log(result))
```

### 7.2 HTTP 함수 테스트

HTTP 함수의 경우, 브라우저나 Postman을 통해 로컬 URL로 접근할 수 있습니다:

```
http://localhost:5001/db888-67827/asia-northeast3/healthCheck
```

## 8. 에뮬레이터 스크립트 설정

package.json에 에뮬레이터 관련 스크립트를 추가합니다:

```json
"scripts": {
  "emulator": "firebase emulators:start",
  "emulator:functions": "firebase emulators:start --only functions",
  "emulator:firestore": "firebase emulators:start --only firestore",
  "emulator:seed": "node scripts/firebase/seed-emulator.js",
  "emulator:all": "firebase emulators:start && node scripts/firebase/seed-emulator.js",
  "serve": "firebase serve --only functions",
  "shell": "firebase functions:shell",
  "deploy": "firebase deploy --only functions",
  "logs": "firebase functions:log"
}
```

## 9. 에뮬레이터 환경에서 데이터베이스 연결

기존 데이터베이스 연결 코드를 수정하여 에뮬레이터 환경에서 실제 데이터베이스에 연결할 수 있도록 합니다:

```javascript
// functions/src/database/connection.js
const mysql = require('mysql2/promise');
const { getLogger } = require('../utils/logger');

const logger = getLogger('database-connection');

// 연결 풀 설정
let pool = null;

/**
 * 데이터베이스 연결 풀을 초기화하고 반환합니다.
 * @return {Object} MySQL 연결 풀
 */
function getConnectionPool() {
  if (pool) {
    return pool;
  }
  
  const isEmulator = process.env.FUNCTIONS_EMULATOR === 'true';
  logger.info(`Initializing database connection pool (Emulator: ${isEmulator})`);
  
  try {
    const config = {
      host: process.env.DB_HOST,
      user: process.env.DB_USER,
      password: process.env.DB_PASSWORD,
      database: process.env.DB_NAME,
      waitForConnections: true,
      connectionLimit: isEmulator ? 5 : 10, // 에뮬레이터에서는 연결 수 제한
      queueLimit: 0,
      connectTimeout: 10000, // 10초
    };
    
    pool = mysql.createPool(config);
    logger.info('Database connection pool created successfully');
    
    return pool;
  } catch (error) {
    logger.error('Failed to create database connection pool:', error);
    throw error;
  }
}

/**
 * 데이터베이스 연결을 가져옵니다.
 * @return {Promise<Object>} 데이터베이스 연결
 */
async function getConnection() {
  const pool = getConnectionPool();
  
  try {
    const connection = await pool.getConnection();
    logger.debug('Got database connection from pool');
    return connection;
  } catch (error) {
    logger.error('Failed to get database connection:', error);
    throw error;
  }
}

module.exports = {
  getConnectionPool,
  getConnection
};
```

## 10. 문제 해결

### 10.1 에뮬레이터 포트 충돌

포트 충돌이 발생하면 `firebase.json`에서 포트 번호를 변경하세요:

```json
"emulators": {
  "functions": {
    "port": 5002  // 기본값 5001에서 변경
  }
}
```

### 10.2 환경 변수 로딩 문제

환경 변수가 제대로 로드되지 않는 경우 다음을 확인하세요:

1. functions/.env 파일이 존재하는지 확인
2. dotenv 패키지가 설치되어 있는지 확인: `npm install dotenv --save`
3. 코드에서 dotenv가 제대로 로드되었는지 확인: `require('dotenv').config()`

### 10.3 데이터베이스 연결 오류

에뮬레이터 환경에서 실제 데이터베이스에 연결할 때 발생하는 오류:

1. 방화벽 설정 확인
2. VPN 연결 확인 (필요한 경우)
3. 데이터베이스 호스트, 사용자, 비밀번호가 정확한지 확인
4. 네트워크 연결 테스트: `telnet 211.248.190.46 3306`

## 11. 종합 테스트 스크립트

다음은 에뮬레이터 환경에서 종합 테스트를 실행하는 스크립트 예시입니다:

```javascript
// scripts/firebase/test-emulator.js
const admin = require('firebase-admin');
const axios = require('axios');

// 에뮬레이터 호스트 설정
process.env.FIRESTORE_EMULATOR_HOST = 'localhost:8080';
process.env.FUNCTIONS_EMULATOR_HOST = 'localhost:5001';

// Firebase Admin SDK 초기화
admin.initializeApp({
  projectId: 'demo-db2'
});

// 함수 엔드포인트 URL
const functionsEndpoint = 'http://localhost:5001/db888-67827/asia-northeast3';

async function testFunctions() {
  console.log('Testing Firebase Functions in emulator...');
  
  // Health Check 테스트
  try {
    const healthResponse = await axios.get(`${functionsEndpoint}/healthCheck`);
    console.log('Health Check 응답:', healthResponse.data);
  } catch (error) {
    console.error('Health Check 오류:', error.message);
  }
  
  // 활성 고가치 사용자 API 테스트
  try {
    const activeUsersResponse = await axios.get(`${functionsEndpoint}/api/v1/users/high-value/active?minNetBet=50000`);
    console.log('활성 고가치 사용자 API 응답:', activeUsersResponse.data);
  } catch (error) {
    console.error('활성 고가치 사용자 API 오류:', error.message);
  }
  
  // 휴면 고가치 사용자 API 테스트
  try {
    const dormantUsersResponse = await axios.get(`${functionsEndpoint}/api/v1/users/high-value/dormant?minNetBet=50000&minInactiveDays=30`);
    console.log('휴면 고가치 사용자 API 응답:', dormantUsersResponse.data);
  } catch (error) {
    console.error('휴면 고가치 사용자 API 오류:', error.message);
  }
}

// 테스트 실행
testFunctions().catch(error => {
  console.error('에뮬레이터 테스트 오류:', error);
});
```

이 스크립트를 실행하려면:

```bash
node scripts/firebase/test-emulator.js
```

## 12. 다음 단계

에뮬레이터 환경 설정을 완료한 후 다음을 진행하세요:

1. 간단한 테스트 함수 개발 및 검증
2. 데이터베이스 연결 최적화
3. Firebase Functions 배포 파이프라인 구축
4. 실제 배포 및 검증
