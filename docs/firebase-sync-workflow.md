# Firebase 로컬 개발 및 서버 동기화 가이드

이 문서는 DB2 프로젝트에서 로컬 개발 환경과 Firebase 서버 간의 효율적인 동기화 프로세스를 설명합니다.

## 1. 로컬 백업 시스템

### 백업 생성하기

Firebase 데이터를 백업하려면 다음 명령어를 실행하세요:

```bash
cd /users/voca/projects/db2
node scripts/backup/firebase-backup.js "백업 설명 메모"
```

백업은 `backup/` 디렉토리에 저장되며, 타임스탬프가 포함된 폴더 이름으로 생성됩니다.

### 백업 복원하기

백업을 복원하려면 다음 명령어를 실행하세요:

```bash
cd /users/voca/projects/db2
node scripts/backup/firebase-restore.js
```

명령어를 실행하면 복원할 백업과 구성 요소를 선택하는 프롬프트가 표시됩니다.

## 2. Firebase 에뮬레이터 설정

### 에뮬레이터 설치

Firebase 에뮬레이터를 처음 사용하는 경우 다음 명령어로 설치하세요:

```bash
npm install -g firebase-tools
firebase setup:emulators:firestore
firebase setup:emulators:functions
```

### 에뮬레이터 실행

로컬 개발 환경에서 Firebase 에뮬레이터를 실행하려면:

```bash
cd /users/voca/projects/db2
firebase emulators:start
```

기본적으로 다음 포트에서 서비스가 실행됩니다:
- UI: http://localhost:11003
- Functions: http://localhost:11001
- Hosting: http://localhost:11002
- Firestore: http://localhost:11004

### 에뮬레이터 데이터 초기화

테스트 데이터로 에뮬레이터를 초기화하려면:

```bash
cd /users/voca/projects/db2
node scripts/initialize-emulator-data.js
```

## 3. 배포 전 검증

### Firebase Functions 로컬 테스트

Functions를 배포하기 전에 로컬에서 테스트하려면:

```bash
cd /users/voca/projects/db2/functions
npm run serve
```

### Hosting 로컬 테스트

Hosting 변경 사항을 로컬에서 테스트하려면:

```bash
cd /users/voca/projects/db2
firebase serve --only hosting
```

### 변경 사항 검증

배포 전에 변경 사항을 검증하려면:

```bash
cd /users/voca/projects/db2
firebase functions:config:get > .runtimeconfig.json
npm run lint
npm test
```

## 4. 단계적 배포 프로세스

### 개발 환경 배포

개발 환경에 배포하려면:

```bash
cd /users/voca/projects/db2
firebase use development
firebase deploy
```

### 스테이징 환경 배포

스테이징 환경에 배포하려면:

```bash
cd /users/voca/projects/db2
firebase use staging
firebase deploy
```

### 프로덕션 환경 배포

프로덕션 환경에 배포하려면:

```bash
cd /users/voca/projects/db2
firebase use production
firebase deploy
```

### 부분 배포

특정 구성 요소만 배포하려면:

```bash
# Functions만 배포
firebase deploy --only functions

# Hosting만 배포
firebase deploy --only hosting

# 특정 Function만 배포
firebase deploy --only functions:functionName
```

## 5. 롤백 프로세스

### 백업에서 복원

문제가 발생할 경우 백업에서 복원할 수 있습니다:

```bash
cd /users/voca/projects/db2
node scripts/backup/firebase-restore.js
```

### 이전 배포 버전으로 롤백

이전 배포 버전으로 롤백하려면:

```bash
# 배포 버전 목록 조회
firebase hosting:versions:list

# 특정 버전으로 롤백
firebase hosting:clone <PROJECT_ID>:<SITE_ID>:<VERSION> <PROJECT_ID>:<SITE_ID>:live
```

## 6. 알려진 문제 및 해결 방법

### 에뮬레이터 연결 문제

문제: Firestore 에뮬레이터 연결 실패
해결 방법: 포트 충돌이 없는지 확인하고, Firebase CLI를 업데이트하세요.

### 배포 실패

문제: Functions 배포 실패
해결 방법: 로그를 확인하고, Node.js 버전이 Functions에서 지원되는지 확인하세요.

## 추가 참고 자료

- [Firebase 공식 문서](https://firebase.google.com/docs)
- [Firebase CLI 참조](https://firebase.google.com/docs/cli)
- [Firebase 에뮬레이터 가이드](https://firebase.google.com/docs/emulator-suite/connect_and_prototype)
