# Firebase 개발 및 배포 워크플로우 가이드

이 문서는 DB2 프로젝트의 Firebase 개발, 테스트, 검증 및 배포를 위한 종합적인 워크플로우를 설명합니다. 이 워크플로우는 개발 효율성을 높이고 오류를 방지하며 안정적이고 안전한 배포를 보장하기 위해 설계되었습니다.

## 목차

1. [워크플로우 개요](#1-워크플로우-개요)
2. [개발 환경 설정](#2-개발-환경-설정)
3. [로컬 개발 및 테스트](#3-로컬-개발-및-테스트)
4. [변경 검증](#4-변경-검증)
5. [배포 프로세스](#5-배포-프로세스)
6. [모니터링 및 롤백](#6-모니터링-및-롤백)
7. [문제 해결](#7-문제-해결)
8. [참고 자료](#8-참고-자료)

## 1. 워크플로우 개요

DB2 프로젝트는 다음과 같은 주요 구성 요소로 이루어진 Firebase 워크플로우를 사용합니다:

### 1.1 주요 구성 요소

- **로컬 백업 시스템**: Firebase 구성 및 데이터의 버전 관리된 스냅샷
- **에뮬레이터 환경**: 로컬 개발 및 테스트를 위한 Firebase 에뮬레이터
- **변경 검증 프레임워크**: 배포 전 데이터 구조 및 보안 규칙 검증
- **스테이지드 배포 파이프라인**: 개발부터 프로덕션까지 단계적 배포
- **피처 플래그 시스템**: 점진적인 기능 출시 관리
- **롤백 메커니즘**: 문제 발생 시 빠른 복구 지원

### 1.2 워크플로우 다이어그램

```
+-------------------+     +----------------+     +---------------+     +-------------------+
| 로컬 개발 및 테스트 | --> | 변경 검증      | --> | 스테이지드 배포 | --> | 모니터링 및 롤백  |
+-------------------+     +----------------+     +---------------+     +-------------------+
        ^                                              |
        |                                              v
        +----------------------------------------------+
                          피드백 루프
```

### 1.3 환경 구성

| 환경          | 설명                         | Firebase 프로젝트 |
|--------------|------------------------------|-----------------|
| 개발         | 일일 개발 및 기능 테스트       | db888-dev       |
| 스테이징      | QA 및 통합 테스트             | db888-staging   |
| 프로덕션      | 사용자 대상 환경              | db888           |

## 2. 개발 환경 설정

### 2.1 필수 도구 설치

```bash
# Node.js 및 npm 설치
# Firebase CLI 설치
npm install -g firebase-tools

# 로그인
firebase login
```

### 2.2 프로젝트 클론 및 초기 설정

```bash
# 저장소 클론
git clone https://github.com/voca9204@gmail.com/db2.git
cd db2

# 의존성 설치
npm install

# Firebase 프로젝트 구성
firebase use --add
```

### 2.3 환경 전환 스크립트 사용

```bash
# 개발 환경으로 전환
./scripts/env/switch-env.sh development

# 스테이징 환경으로 전환
./scripts/env/switch-env.sh staging

# 프로덕션 환경으로 전환
./scripts/env/switch-env.sh production
```

## 3. 로컬 개발 및 테스트

### 3.1 에뮬레이터 사용

#### 3.1.1 에뮬레이터 시작

```bash
# 기본 에뮬레이터 시작
./scripts/emulator/start-emulator.sh

# 테스트 데이터로 에뮬레이터 시작
./scripts/emulator/start-emulator.sh --seed

# 이전 상태에서 이어서 시작
./scripts/emulator/start-emulator.sh --import
```

#### 3.1.2 에뮬레이터 중지

```bash
./scripts/emulator/stop-emulator.sh
```

### 3.2 테스트 데이터 관리

#### 3.2.1 테스트 데이터 생성

```bash
node scripts/emulator/seed-firestore.js
```

#### 3.2.2 테스트 데이터 내보내기

에뮬레이터가 종료될 때 자동으로 데이터가 내보내집니다. 다음 시작 시 `--import` 옵션을 사용하여 이전 상태를 로드할 수 있습니다.

### 3.3 로컬 백업 생성

#### 3.3.1 수동 백업 생성

```bash
node scripts/backup/firebase-backup.js "백업 설명"
```

#### 3.3.2 Firebase 데이터 백업

```bash
node scripts/backup/firebase-data-backup.js
```

## 4. 변경 검증

### 4.1 통합 검증 실행

```bash
# 모든 검증 실행
cd scripts/validation
npm install
npm run validate

# 특정 검증만 실행
npm run validate:schema
npm run validate:rules
npm run validate:functions
```

### 4.2 Firestore 스키마 검증

#### 4.2.1 스키마 생성

```bash
node validate-firestore-schema.js --generate-templates
```

#### 4.2.2 스키마 검증

```bash
node validate-firestore-schema.js
```

### 4.3 Security Rules 검증

```bash
node validate-security-rules.js
```

### 4.4 Functions 테스트

```bash
node test-functions.js
```

## 5. 배포 프로세스

### 5.1 CI/CD 파이프라인

GitHub Actions 워크플로우가 자동으로 변경 사항을 감지하고 배포합니다:

- `development` 브랜치 → 개발 환경
- `staging` 브랜치 → 스테이징 환경
- `main` 브랜치 → 프로덕션 환경

### 5.2 수동 배포

#### 5.2.1 개발 환경 배포

```bash
firebase deploy --project db888-dev
```

#### 5.2.2 스테이징 환경 배포

```bash
firebase deploy --project db888-staging
```

#### 5.2.3 프로덕션 환경 배포

```bash
# 배포 전 백업 생성
node scripts/backup/firebase-backup.js "프로덕션 배포 전 백업"

# 배포
firebase deploy --project db888
```

### 5.3 피처 플래그 관리

#### 5.3.1 피처 플래그 구성

`scripts/deployment/config` 디렉토리에 환경별 피처 플래그 구성 파일이 있습니다.

#### 5.3.2 피처 플래그 업데이트

```bash
# 개발 환경
cd scripts/deployment
npm run update-flags:dev

# 스테이징 환경
npm run update-flags:stage

# 프로덕션 환경 (시뮬레이션)
npm run update-flags:prod

# 프로덕션 환경 (실제 적용)
npm run update-flags:prod:apply
```

## 6. 모니터링 및 롤백

### 6.1 배포 모니터링

Firebase 콘솔에서 다음과 같은 지표를 모니터링합니다:

- Functions 오류 로그
- Firestore 성능 메트릭
- Authentication 로그인 이벤트

### 6.2 롤백 실행

#### 6.2.1 피처 플래그를 통한 롤백

특정 기능에 문제가 있는 경우 피처 플래그를 비활성화합니다:

```bash
# 피처 플래그 비활성화 후 업데이트
npm run update-flags:prod:apply
```

#### 6.2.2 전체 롤백

더 심각한 문제가 있는 경우 이전 백업으로 롤백합니다:

```bash
# 백업 목록 확인
node rollback.js --env=production --backup-id=latest --components=all --dry-run

# 실제 롤백 수행
node rollback.js --env=production --backup-id=latest --components=all
```

## 7. 문제 해결

### 7.1 에뮬레이터 문제

| 문제 | 해결 방법 |
|------|----------|
| 에뮬레이터가 시작되지 않음 | 포트 충돌 확인 및 PID 파일 삭제 |
| 데이터 로드 실패 | 에뮬레이터 내보내기 파일 확인 |

### 7.2 배포 문제

| 문제 | 해결 방법 |
|------|----------|
| 배포 실패 | 로컬에서 변경 검증 실행 |
| 권한 오류 | Firebase 프로젝트 권한 확인 |

### 7.3 로그 확인

```bash
# Functions 로그 확인
firebase functions:log --project db888
```

## 8. 참고 자료

- [Firebase 워크플로우 구성 요소별 문서](./components/README.md)
- [백업 시스템 사용 가이드](./backup-system.md)
- [에뮬레이터 환경 가이드](./emulator-guide.md)
- [변경 검증 프레임워크 가이드](./validation-framework.md)
- [스테이지드 배포 파이프라인 가이드](./deployment-pipeline.md)
