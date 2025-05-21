# Firebase 스테이지드 배포 파이프라인

이 문서는 Firebase 프로젝트를 위한 다단계 배포 파이프라인에 대한 설명과 사용 방법을 제공합니다.

## 개요

다단계 배포 파이프라인은 코드 변경 사항을 개발, 스테이징, 프로덕션 환경으로 점진적으로 배포하여 안정성을 높이고 오류를 방지합니다. 주요 기능:

1. **환경별 배포**
   - 개발(Development): 일일 개발 및 테스트
   - 스테이징(Staging): 최종 테스트 및 QA
   - 프로덕션(Production): 사용자에게 제공되는 환경

2. **피처 플래그 시스템**
   - 점진적인 기능 출시 관리
   - 환경별 기능 활성화/비활성화
   - 사용자 그룹별 타겟팅

3. **롤백 메커니즘**
   - 문제 발생 시 이전 상태로 빠르게 롤백
   - 구성 요소별 선택적 롤백
   - 자동 백업 및 복원

4. **CI/CD 파이프라인**
   - GitHub Actions 기반 자동화된 배포
   - 변경 검증 및 테스트 통합
   - 단계별 승인 프로세스

## 환경 설정

### Firebase 프로젝트

각 환경에 대한 Firebase 프로젝트가 필요합니다:

- 개발: `db888-dev`
- 스테이징: `db888-staging`
- 프로덕션: `db888`

### 로컬 환경 전환

`scripts/env/switch-env.sh` 스크립트를 사용하여 로컬 개발 환경을 전환할 수 있습니다:

```bash
# 개발 환경으로 전환
./scripts/env/switch-env.sh development

# 스테이징 환경으로 전환
./scripts/env/switch-env.sh staging

# 프로덕션 환경으로 전환
./scripts/env/switch-env.sh production
```

## 피처 플래그 시스템

### 피처 플래그 구성

`scripts/deployment/config` 디렉토리에 환경별 피처 플래그 구성 파일이 있습니다:

- `feature-flags-development.json`
- `feature-flags-staging.json`
- `feature-flags-production.json`

각 피처 플래그는 다음 속성을 가집니다:

```json
{
  "id": "feature_id",
  "name": "기능 이름",
  "description": "기능 설명",
  "enabled": true,
  "rolloutPercentage": 100,
  "targetGroups": ["admin", "beta_testers"]
}
```

### 피처 플래그 업데이트

`scripts/deployment/update-feature-flags.js` 스크립트를 사용하여 피처 플래그를 업데이트할 수 있습니다:

```bash
# 개발 환경 피처 플래그 업데이트
npm run update-flags:dev

# 스테이징 환경 피처 플래그 업데이트
npm run update-flags:stage

# 프로덕션 환경 피처 플래그 시뮬레이션
npm run update-flags:prod

# 프로덕션 환경 피처 플래그 실제 적용
npm run update-flags:prod:apply
```

### 클라이언트에서 피처 플래그 사용

```javascript
// 피처 플래그 가져오기
const featureFlags = await firebase.firestore().collection('featureFlags').get();

// 특정 플래그 상태 확인
const newUIFlag = featureFlags.docs.find(doc => doc.id === 'new_ui');
const isNewUIEnabled = newUIFlag && newUIFlag.data().enabled;

// 사용자 대상 여부 확인
const isUserTargeted = isUserInTargetGroups(newUIFlag.data().targetGroups);

// 롤아웃 비율 확인
const isInRolloutPercentage = Math.random() * 100 < newUIFlag.data().rolloutPercentage;

// 기능 활성화 여부
const showNewUI = isNewUIEnabled && (isUserTargeted || isInRolloutPercentage);
```

## 롤백 메커니즘

### 자동 백업

배포 전에 모든 구성 요소의 자동 백업이 생성됩니다. 백업은 다음 위치에 저장됩니다:

```
/backup/<environment>/<timestamp>/
```

각 백업에는 다음 구성 요소가 포함됩니다:
- Firestore 데이터
- Firebase Functions
- Security Rules
- Hosting 파일

### 롤백 실행

`scripts/deployment/rollback.js` 스크립트를 사용하여 이전 상태로 롤백할 수 있습니다:

```bash
# 개발 환경 롤백
npm run rollback:dev

# 스테이징 환경 롤백
npm run rollback:stage

# 프로덕션 환경 롤백 시뮬레이션
npm run rollback:prod:simulate

# 프로덕션 환경 롤백
npm run rollback:prod
```

특정 백업 및 구성 요소로 롤백:

```bash
node rollback.js --env=production --backup-id=20250520-152245 --components=firestore,functions
```

## CI/CD 파이프라인

### GitHub Actions 워크플로우

`.github/workflows/firebase-cicd.yml` 파일에 CI/CD 파이프라인 구성이 있습니다. 이 워크플로우는 다음 단계를 자동화합니다:

1. **변경 검증**
   - Firestore 스키마 검증
   - Security Rules 정적 분석
   - Firebase Functions 테스트

2. **빌드**
   - Functions 빌드
   - 배포 아티팩트 생성

3. **개발 환경 배포**
   - `development` 브랜치 푸시 시 자동 배포
   - 배포 후 검증

4. **스테이징 환경 배포**
   - `staging` 브랜치 푸시 시 자동 배포
   - 통합 테스트 실행

5. **프로덕션 환경 배포**
   - `main` 브랜치 푸시 시 자동 배포
   - 배포 전 백업 생성
   - 피처 플래그 업데이트

### 수동 배포 트리거

GitHub Actions UI에서 워크플로우를 수동으로 트리거할 수도 있습니다:

1. GitHub 저장소 > Actions 탭으로 이동
2. "Firebase CI/CD Pipeline" 워크플로우 선택
3. "Run workflow" 버튼 클릭
4. 배포할 환경 선택 및 검증 옵션 설정
5. "Run workflow" 버튼 클릭하여 배포 시작

## 모범 사례

### 브랜치 전략

- `development`: 일일 개발 작업
- `staging`: QA 및 테스트 준비
- `main`: 프로덕션 릴리스

### 새 기능 출시

1. 개발 환경에서 기능 구현 및 테스트
2. 피처 플래그를 사용하여 개발 환경에서 기능 활성화
3. 스테이징 환경으로 병합 및 QA 테스트
4. 스테이징 환경에서 피처 플래그 활성화(부분 롤아웃)
5. 프로덕션 환경으로 병합
6. 프로덕션 환경에서 점진적 롤아웃(10% -> 50% -> 100%)

### 비상 롤백

1. 문제 발견 시 즉시 피처 플래그 비활성화
2. 필요한 경우 `rollback.js` 스크립트를 사용하여 이전 상태로 롤백
3. 문제 분석 및 수정
4. 수정된 코드로 배포 파이프라인 다시 실행

## 문제 해결

### 피처 플래그 문제

- **플래그가 적용되지 않음**: Firestore 캐시 확인 및 새로고침
- **타겟팅이 작동하지 않음**: 사용자 그룹이 올바르게 정의되었는지 확인

### 롤백 문제

- **백업을 찾을 수 없음**: `--backup-id=latest` 옵션 사용
- **일부 구성 요소만 롤백**: `--components` 옵션으로 필요한 구성 요소만 지정

### CI/CD 파이프라인 문제

- **빌드 실패**: 로컬에서 변경 검증 스크립트 실행
- **배포 실패**: Firebase CLI 로컬 테스트 및 로그 확인

## 참고 문서

- [Firebase CLI 문서](https://firebase.google.com/docs/cli)
- [Firebase 보안 규칙 참조](https://firebase.google.com/docs/rules/rules-language)
- [GitHub Actions 워크플로우 문법](https://docs.github.com/en/actions/reference/workflow-syntax-for-github-actions)
