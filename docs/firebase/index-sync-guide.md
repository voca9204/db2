# Firebase 인덱스 동기화 시스템 사용 가이드

이 문서는 Firebase Firestore 인덱스를 로컬 환경과 서버 간에 동기화하는 도구 사용법을 설명합니다.

## 개요

Firebase Firestore는 복합 쿼리 성능을 최적화하기 위해 인덱스를 사용합니다. 인덱스 구성은 `firestore.indexes.json` 파일에 정의되며, Firebase 서버에 배포해야 합니다. 개발 과정에서 로컬 인덱스 구성과 서버의 인덱스 구성이 동기화되지 않으면 다음과 같은 문제가 발생할 수 있습니다:

- 로컬에서는 작동하지만 프로덕션에서 실패하는 쿼리
- 불필요한 인덱스로 인한 비용 증가
- 복합 쿼리 성능 저하

이 시스템은 로컬과 서버의 인덱스 구성을 쉽게 비교하고 동기화할 수 있는 도구를 제공합니다.

## 설치된 도구

1. **firebase-index-sync.js**: 로컬과 서버 간의 인덱스 동기화 도구
2. **firebase-index-validator.js**: 코드를 분석하여 필요한 인덱스를 자동으로 감지하는 도구

## firebase-index-sync.js 사용법

### 기본 명령어

```bash
# 로컬과 서버 인덱스 비교
node scripts/firebase-index-sync.js --direction=diff

# 로컬 인덱스를 서버로 푸시
node scripts/firebase-index-sync.js --direction=push

# 서버 인덱스를 로컬로 풀
node scripts/firebase-index-sync.js --direction=pull

# 다른 환경(예: 스테이징)에 대해 작업 수행
node scripts/firebase-index-sync.js --direction=diff --env=staging
```

### 옵션

- `--direction`, `-d`: 동기화 방향 (diff, push, pull)
- `--env`, `-e`: Firebase 환경 (default, staging, production)
- `--force`, `-f`: 확인 없이 동기화 강제 실행
- `--configPath`, `-c`: 구성 파일 경로

### 중요 인덱스 보호

중요한 프로덕션 인덱스가 실수로 삭제되는 것을 방지하기 위해, `.index-sync-config.json` 파일을 만들어 다음과 같이 구성할 수 있습니다:

```json
{
  "criticalIndexes": [
    {
      "collectionGroup": "highValueUsers",
      "fields": [
        {
          "fieldPath": "isActive",
          "order": "ASCENDING"
        },
        {
          "fieldPath": "netBet",
          "order": "DESCENDING"
        }
      ]
    }
  ]
}
```

## firebase-index-validator.js 사용법

### 기본 명령어

```bash
# 소스 코드를 스캔하여 필요한 인덱스 분석
node scripts/firebase-index-validator.js

# 특정 디렉토리 스캔
node scripts/firebase-index-validator.js --src=./functions

# 분석 결과 저장 위치 지정
node scripts/firebase-index-validator.js --outputPath=./index-analysis.json
```

### 옵션

- `--src`, `-s`: 스캔할 소스 디렉토리 (기본값: ./src)
- `--pattern`, `-p`: 파일 패턴 (기본값: **/*.{js,jsx,ts,tsx})
- `--indexPath`, `-i`: firestore.indexes.json 경로
- `--outputPath`, `-o`: 분석 결과 저장 경로

## 워크플로우 통합

개발 워크플로우에 인덱스 동기화 시스템을 통합하는 가장 효과적인 방법은 다음과 같습니다:

### 1. 개발 시작 시

```bash
# 최신 인덱스를 서버에서 가져옴
node scripts/firebase-index-sync.js --direction=pull
```

### 2. 코드 변경 후

```bash
# 코드를 분석하여 필요한 인덱스 확인
node scripts/firebase-index-validator.js

# 필요한 인덱스가 있다면 로컬 구성 파일 업데이트
# missing-indexes.json 파일을 참고하여 firestore.indexes.json 업데이트
```

### 3. 배포 전

```bash
# 로컬과 서버 인덱스 비교
node scripts/firebase-index-sync.js --direction=diff

# 변경사항이 있다면 서버에 푸시
node scripts/firebase-index-sync.js --direction=push
```

### 4. CI/CD 파이프라인 통합

CI/CD 파이프라인에 다음 단계를 추가하는 것이 좋습니다:

1. 코드 분석 및 필요한 인덱스 감지
2. 현재 인덱스 구성과 비교
3. 차이점 보고
4. 배포 과정에서 인덱스 자동 업데이트

## 주의사항

1. 인덱스를 삭제하면 관련 쿼리가 실패할 수 있습니다. 항상 diff를 확인하고 신중하게 진행하세요.
2. 인덱스는 생성하는 데 시간이 걸릴 수 있습니다. 인덱스가 완전히 생성되기 전에 관련 쿼리를 실행하면 오류가 발생할 수 있습니다.
3. 인덱스는 Firebase 계정에 비용이 발생할 수 있습니다. 사용하지 않는 인덱스는 제거하는 것이 좋습니다.

## 문제 해결

### 인덱스 동기화 실패

- Firebase CLI가 올바르게 설치되어 있는지 확인
- Firebase 로그인 상태 확인 (`firebase login`)
- 프로젝트 ID가 올바른지 확인 (`.firebaserc` 파일)

### 인덱스 검증 오류

- Babel 파서 플러그인 설정 확인
- 코드 형식이 지원되는지 확인

## 추가 개발 계획

1. 더 정확한 쿼리 분석을 위한 정적 분석 개선
2. 다양한 Firestore SDK 패턴 지원
3. WebUI 추가
4. 자동 인덱스 최적화 제안
