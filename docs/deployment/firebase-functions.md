# Firebase Functions 배포 가이드

이 문서는 DB2 프로젝트의 Firebase Functions를 위한 배포 프로세스를 설명합니다. 프로젝트의 API 및 자동화된 작업은 Firebase Functions를 통해 서버리스 아키텍처로 구현되었습니다.

## 사전 요구사항

배포를 진행하기 전에 다음 사항을 확인하세요:

1. Firebase CLI가 설치되어 있어야 합니다.
   ```bash
   npm install -g firebase-tools
   ```

2. Firebase에 로그인되어 있어야 합니다.
   ```bash
   firebase login
   ```

3. 올바른 Firebase 프로젝트가 선택되어 있어야 합니다.
   ```bash
   # 개발 환경
   firebase use db2-dev
   
   # 스테이징 환경
   firebase use db2-staging
   
   # 프로덕션 환경
   firebase use db2-prod
   ```

4. 환경 변수가 올바르게 설정되어 있어야 합니다. 각 환경에 대한 `.env` 파일을 확인하세요.

## 배포 스크립트

프로젝트에는 다양한 환경에 대한 배포를 자동화하는 스크립트가 포함되어 있습니다. 이 스크립트는 `functions/scripts/deploy/deploy-functions.js`에 위치하고 있습니다.

### 수동 배포

수동 배포는 다음 명령어를 통해 수행할 수 있습니다:

```bash
# 개발 환경에 모든 함수 배포
node functions/scripts/deploy/deploy-functions.js development

# 스테이징 환경에 모든 함수 배포
node functions/scripts/deploy/deploy-functions.js staging

# 프로덕션 환경에 모든 함수 배포
node functions/scripts/deploy/deploy-functions.js production

# 특정 함수만 배포 (쉼표로 구분)
node functions/scripts/deploy/deploy-functions.js staging api,runAnalyticsJob

# 배포 모드 지정 (full, config-only, function-only)
node functions/scripts/deploy/deploy-functions.js staging api,runAnalyticsJob function-only
```

### CI/CD 배포

프로젝트는 GitHub Actions를 사용하여 CI/CD 파이프라인을 구성하고 있습니다. 워크플로우 파일은 `.github/workflows/deploy-functions.yml`에 위치하고 있습니다.

배포는 다음 상황에서 자동으로 트리거됩니다:

- `main` 브랜치에 푸시: 프로덕션 환경에 배포
- `staging` 브랜치에 푸시: 스테이징 환경에 배포
- 수동 워크플로우 실행: 지정된 환경에 배포

수동 워크플로우 실행 방법:
1. GitHub 저장소의 "Actions" 탭 클릭
2. "Deploy Firebase Functions" 워크플로우 선택
3. "Run workflow" 클릭
4. 드롭다운에서 환경 선택 및 특정 함수 지정 (선택 사항)
5. "Run workflow" 클릭하여 배포 시작

## 함수 구성

Firebase Functions의 구성은 다음 두 가지 방법으로 관리됩니다:

1. `functions/function-config.json` 파일
2. `functions/src/config/function-config.js` 모듈

이 구성을 통해 함수별로 메모리 할당, 타임아웃, 인스턴스 수 등을 최적화할 수 있습니다.

### 환경별 구성

각 환경(개발, 스테이징, 프로덕션)에 대한 기본 구성은 다음과 같습니다:

- **개발**:
  - 최소 인스턴스: 0 (콜드 스타트 허용)
  - 메모리: 256MB
  - 타임아웃: 60초

- **스테이징**:
  - 최소 인스턴스: 0 (콜드 스타트 허용)
  - 메모리: 512MB
  - 타임아웃: 60초

- **프로덕션**:
  - 최소 인스턴스: 1 (콜드 스타트 최소화)
  - 메모리: 512MB
  - 타임아웃: 60초 (API), 540초 (분석 작업)

## 배포 기록 관리

배포 기록은 `functions/deployments` 디렉토리에 저장됩니다. 각 배포는 고유한 버전 태그를 가지며, 다음 정보를 포함합니다:

- 환경
- 타임스탬프
- Git 커밋 해시
- 배포된 함수 목록
- 배포자 정보

### 배포 기록 조회

배포 기록은 다음 명령어로 조회할 수 있습니다:

```bash
node functions/scripts/deploy/deployment-manager.js list
```

### 롤백

이전 버전으로 롤백이 필요한 경우, 다음 명령어를 사용할 수 있습니다:

```bash
# 가장 최근 배포 이전 버전으로 롤백
node functions/scripts/deploy/deployment-manager.js rollback

# 특정 버전으로 롤백
node functions/scripts/deploy/deployment-manager.js rollback staging-20250519-123045-a1b2c3d
```

## 성능 모니터링

배포된 함수의 성능은 다음 방법으로 모니터링할 수 있습니다:

1. Firebase Console - Functions 섹션
2. API 헬스 체크 엔드포인트: `/health`
3. Firebase 모니터링 - 로그 및 메트릭

### 성능 최적화 팁

1. **콜드 스타트 최소화**:
   - 프로덕션 환경에서는 최소 인스턴스 설정
   - 초기화 코드를 함수 핸들러 외부로 이동
   - 모듈 임포트 최적화

2. **메모리 관리**:
   - 대용량 데이터 처리는 스트리밍 또는 배치 처리 사용
   - 캐싱 전략 구현
   - 메모리 누수 방지

3. **타임아웃 관리**:
   - 긴 작업은 스케줄링된 함수 또는 배치 처리로 분할
   - 비동기 작업에 타임아웃 설정

## 문제 해결

일반적인 배포 문제와 해결 방법:

1. **권한 오류**:
   - Firebase CLI 재로그인
   - 프로젝트 권한 확인

2. **의존성 문제**:
   - `npm ci` 실행하여 정확한 의존성 설치
   - `package.json` 및 `package-lock.json` 확인

3. **환경 변수 오류**:
   - `.env` 파일 확인
   - Firebase Functions 구성 확인: `firebase functions:config:get`

4. **메모리 초과 오류**:
   - 함수 메모리 할당 증가
   - 코드 최적화 및 메모리 사용량 줄이기

5. **타임아웃 오류**:
   - 함수 타임아웃 증가
   - 작업 분할 또는 비동기 처리 최적화

## 참조

- [Firebase Functions 문서](https://firebase.google.com/docs/functions)
- [Firebase CLI 참조](https://firebase.google.com/docs/cli)
- [GitHub Actions 문서](https://docs.github.com/actions)
