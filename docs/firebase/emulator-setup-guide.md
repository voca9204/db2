# Firebase 에뮬레이터 설정 가이드

이 가이드는 Firebase 에뮬레이터를 사용하여 로컬 개발 환경을 설정하는 방법을 설명합니다.

## 개요

Firebase 에뮬레이터는 로컬에서 Firebase 서비스를 실행할 수 있게 해주는 도구로, 프로덕션 환경에 영향을 주지 않고 개발과 테스트를 수행할 수 있습니다. 이 프로젝트에서는 Functions, Firestore, Hosting 에뮬레이터를 사용합니다.

## 시작하기

### 1. 에뮬레이터 설정

에뮬레이터 설정 도구를 실행하여 기본 구성을 설정합니다:

```bash
node scripts/backup/firebase-emulator-setup.js setup
```

이 명령은 다음을 수행합니다:
- 에뮬레이터 데이터 디렉토리 생성
- Firebase 에뮬레이터 구성 파일 생성
- 에뮬레이터 환경 변수 파일(.env.emulator) 생성
- Functions package.json에 에뮬레이터 스크립트 추가

### 2. 에뮬레이터 시작

에뮬레이터를 시작하려면 다음 명령을 실행합니다:

```bash
# 에뮬레이터 설정 도구 사용
node scripts/backup/firebase-emulator-setup.js start

# 또는 Firebase CLI 직접 사용
firebase emulators:start --import=emulator-data --export-on-exit
```

이 명령은 구성된 포트에서 에뮬레이터를 시작하고, 종료 시 데이터를 자동으로 저장합니다.

### 3. 테스트 데이터 시드 생성

테스트를 위한 데이터를 생성하려면(에뮬레이터가 실행 중일 때):

```bash
# 샘플 데이터 생성
node scripts/backup/firebase-emulator-setup.js seed --sample

# 사용자 정의 데이터 생성
node scripts/backup/firebase-emulator-setup.js seed
```

## 개발 워크플로우

### 환경 전환

개발, 테스트, 프로덕션 환경 간에 전환하려면:

```bash
# 개발 환경으로 전환
node scripts/backup/firebase-emulator-setup.js switch dev

# 테스트 환경으로 전환
node scripts/backup/firebase-emulator-setup.js switch test

# 프로덕션 환경으로 전환
node scripts/backup/firebase-emulator-setup.js switch prod
```

이 명령은 환경 변수 파일(.env)을 해당 환경의 파일(.env.development, .env.test, .env.production)로 교체하고, 필요한 경우 Firebase 프로젝트를 전환합니다.

### 데이터 내보내기

에뮬레이터 데이터를 별도로 내보내려면:

```bash
node scripts/backup/firebase-emulator-setup.js export
```

기본적으로 `emulator-data/export_[timestamp]` 디렉토리에 내보내지만, `--dir` 옵션으로 경로를 지정할 수 있습니다.

## 에뮬레이터 UI 접근

에뮬레이터 UI는 다음 주소에서 접근할 수 있습니다:
- 에뮬레이터 대시보드: http://localhost:11003
- Functions 에뮬레이터: http://localhost:11001
- Firestore 에뮬레이터: http://localhost:11004
- Hosting 에뮬레이터: http://localhost:11002

## 코드 통합

에뮬레이터를 사용하도록 애플리케이션 코드를 설정하려면:

### JavaScript/Node.js (Functions)

```javascript
// Firebase Admin SDK 초기화
const admin = require('firebase-admin');

if (!admin.apps.length) {
  admin.initializeApp({
    projectId: 'db888-emulator'
  });
}

// 에뮬레이터 환경 감지 및 설정
if (process.env.FIREBASE_USE_EMULATORS === 'true') {
  process.env.FIRESTORE_EMULATOR_HOST = 'localhost:11004';
}

const db = admin.firestore();
```

### 클라이언트 코드 (웹)

```javascript
// Firebase SDK 초기화
import { initializeApp } from 'firebase/app';
import { getFirestore, connectFirestoreEmulator } from 'firebase/firestore';
import { getFunctions, connectFunctionsEmulator } from 'firebase/functions';

const firebaseConfig = {
  // 프로젝트 구성
};

const app = initializeApp(firebaseConfig);
const db = getFirestore(app);
const functions = getFunctions(app);

// 에뮬레이터 연결 (개발 환경에서만)
if (location.hostname === 'localhost') {
  connectFirestoreEmulator(db, 'localhost', 11004);
  connectFunctionsEmulator(functions, 'localhost', 11001);
}
```

## 주의사항 및 제한사항

- 에뮬레이터는 서비스의 일부 기능만 지원합니다. 자세한 내용은 [Firebase 문서](https://firebase.google.com/docs/emulator-suite)를 참고하세요.
- 에뮬레이터 데이터는 프로덕션 데이터와 동기화되지 않습니다. 필요한 경우 별도의 백업 및 복원 절차를 따르세요.
- 일부 고급 보안 규칙 기능은 에뮬레이터에서 정확하게 테스트되지 않을 수 있습니다.
- 대량의 데이터 처리 시 에뮬레이터 성능이 실제 환경과 다를 수 있습니다.

## 문제 해결

### 에뮬레이터 시작 실패

1. Firebase CLI가 설치되어 있는지 확인합니다:
   ```bash
   firebase --version
   ```

2. 프로젝트가 올바르게 구성되어 있는지 확인합니다:
   ```bash
   firebase projects:list
   ```

3. 포트 충돌이 없는지 확인합니다:
   ```bash
   lsof -i :11001-11006
   ```

### 에뮬레이터 데이터 문제

1. 에뮬레이터 데이터 디렉토리를 삭제하고 다시 시작합니다:
   ```bash
   rm -rf emulator-data
   firebase emulators:start
   ```

2. 에뮬레이터 캐시를 지웁니다:
   ```bash
   firebase emulators:start --clear-firestore-data
   ```

## 참고 자료

- [Firebase 에뮬레이터 공식 문서](https://firebase.google.com/docs/emulator-suite)
- [Firebase Functions 로컬 테스트](https://firebase.google.com/docs/functions/local-emulator)
- [Firestore 에뮬레이터 사용](https://firebase.google.com/docs/firestore/security/test-rules-emulator)
