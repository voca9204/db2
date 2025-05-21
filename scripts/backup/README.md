# Firebase 로컬 백업 및 동기화 시스템

이 시스템은 Firebase 프로젝트의 로컬 개발 환경과 서버 간의 동기화를 관리하기 위한 도구들을 제공합니다.

## 주요 기능

- **백업 생성**: Firebase 구성, Functions, Hosting 및 Firestore 데이터의 로컬 백업 생성
- **백업 관리**: 백업 목록 조회, 오래된 백업 정리
- **백업 복원**: 이전 상태로 환경 복원
- **자동 백업**: cron을 통한 자동 백업 일정 설정
- **Git 통합**: 백업 후 자동 Git 커밋 옵션

## 파일 구조

- `firebase-backup-manager.js`: 메인 백업 관리 도구
- `firebase-backup-lib.js`: 백업 관련 공통 함수 라이브러리
- `firebase-data-backup.js`: Firestore 데이터 백업 스크립트
- `firebase-restore-firestore.js`: Firestore 데이터 복원 스크립트
- `../firebase-backup.sh`: 백업 실행을 위한 간편 쉘 스크립트

## 사용 방법

### 백업 생성

```bash
# 기본 구성 백업 (구성 파일, Functions, Hosting)
node scripts/backup/firebase-backup-manager.js create "백업 설명"

# Firestore 데이터 포함 백업 (에뮬레이터 사용)
node scripts/backup/firebase-backup-manager.js create --with-firestore "백업 설명"

# Firestore 데이터 포함 백업 (Admin SDK 직접 사용)
node scripts/backup/firebase-backup-manager.js create --with-firestore --direct "백업 설명"

# Git 저장소에 자동 커밋
node scripts/backup/firebase-backup-manager.js create --git "백업 설명"
```

### 백업 목록 조회

```bash
# 기본 목록 조회 (최근 10개)
node scripts/backup/firebase-backup-manager.js list

# 최근 20개 백업 표시
node scripts/backup/firebase-backup-manager.js list --limit=20

# JSON 형식으로 출력
node scripts/backup/firebase-backup-manager.js list --format=json
```

### 백업 복원

```bash
# 지정된 백업 ID로 복원
node scripts/backup/firebase-backup-manager.js restore backup_2025-05-20T17-43-47
```

### 오래된 백업 정리

```bash
# 기본 설정으로 정리 (30일 이상 경과, 최소 5개 유지)
node scripts/backup/firebase-backup-manager.js clean

# 커스텀 설정으로 정리
node scripts/backup/firebase-backup-manager.js clean --days=60 --keep=10
```

### 자동 백업 일정 설정

```bash
# 매일 백업 (기본 시간: 01:00)
node scripts/backup/firebase-backup-manager.js schedule --daily

# 매주 백업 (일요일 03:30)
node scripts/backup/firebase-backup-manager.js schedule --weekly --time=03:30
```

## 모범 사례

### 백업 전략

1. **정기적인 백업**:
   - 개발 중 중요한 변경사항 적용 전 백업 생성
   - 매일 자동 백업 설정으로 최근 상태 보존
   - 배포 전 반드시 백업 실행

2. **백업 관리**:
   - 주기적으로 오래된 백업 정리
   - 중요 마일스톤 백업은 별도 보관
   - Git 통합 사용으로 변경 사항 추적

3. **복원 테스트**:
   - 정기적으로 복원 프로세스 테스트
   - 에뮬레이터 환경에서 복원 검증
   - 복원 시나리오 문서화

### 팀 워크플로우

1. 각 개발자는 작업 시작 전 최신 백업 생성
2. 중요 기능 개발 완료 후 백업 생성 및 Git 커밋
3. 문제 발생 시 마지막 안정 백업으로 복원
4. 주간 회의에서 백업 상태 검토

## 제한 사항 및 주의사항

- Firestore 데이터 직접 복원은 프로덕션 데이터베이스에 영향을 미침
- 대용량 Firestore 데이터 복원은 시간이 오래 걸릴 수 있음
- Admin SDK를 통한 직접 복원은 Firebase 할당량 제한을 고려해야 함
- 백업 디렉토리가 매우 커질 수 있으므로 정기적인 정리 필요

## 문제 해결

### 백업 실패

1. Firebase 설정 확인 (.firebaserc, firebase.json)
2. 서비스 계정 키 존재 여부 확인
3. 로그 확인 (백업 과정에서 생성된 오류 메시지)

### 복원 실패

1. 백업 파일 무결성 확인
2. 권한 문제 확인 (Firebase 프로젝트 권한)
3. Firestore 복원 시 데이터 형식 검증

## 확장 계획

- 백업 암호화 기능 추가
- 원격 스토리지 백업 옵션 (Google Cloud Storage)
- 백업 상태 모니터링 대시보드
