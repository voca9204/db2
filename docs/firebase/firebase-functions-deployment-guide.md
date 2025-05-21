# Firebase Functions 배포 가이드

## 개요

이 문서는 Firebase Functions의 배포 프로세스와 전략을 설명합니다. 안정적이고 효율적인 배포를 위한 지침과 모범 사례를 제공합니다.

## 배포 전 필수 체크리스트

### 코드 준비
- [ ] 코드 통합 및 충돌 해결
- [ ] 린트 오류 수정 (`npm run lint`)
- [ ] 단위 테스트 실행 및 통과 확인 (`npm test`)
- [ ] 변경 검증 프레임워크 실행 (`node scripts/validate-functions.js`)

### 환경 설정
- [ ] 환경변수 확인 (`.env` 파일)
- [ ] Firebase 프로젝트 선택 (`firebase use <project-id>`)
- [ ] Firebase 함수 구성 확인 (`firebase.json` 파일)
- [ ] 데이터베이스 연결 설정 확인

## 배포 프로세스

### 1. 개발 환경 배포

개발 환경은 새로운 기능 테스트를 위한 첫 번째 배포 대상입니다.

```bash
# 개발 환경 선택
firebase use dev

# 배포 실행
./deploy.sh --all
```

### 2. 스테이징 환경 배포

스테이징 환경은 실제 프로덕션과 유사한 설정으로 구성된 테스트 환경입니다.

```bash
# 스테이징 환경 선택
firebase use staging

# 배포 실행
./deploy.sh --all
```

### 3. 프로덕션 환경 배포

프로덕션 환경은 최종 사용자가 접근하는 라이브 환경입니다.

```bash
# 프로덕션 환경 선택
firebase use prod

# 전체 배포
./deploy.sh --all

# 단일 함수 배포
./deploy.sh --function highValueUsersApi
```

## 배포 모드

### 전체 배포
모든 Firebase Functions를 배포합니다.

```bash
./deploy.sh --all
```

### 단일 함수 배포
특정 함수만 배포하여 배포 시간을 단축합니다.

```bash
./deploy.sh --function <function-name>
```

### 드라이 런
실제 배포 없이 배포 과정을 시뮬레이션합니다.

```bash
./deploy.sh --dry-run --all
```

## 롤백 전략

배포 후 문제가 발생할 경우 이전 버전으로 빠르게 롤백할 수 있습니다.

### 1. 롤백 준비

배포 전 항상 현재 버전을 확인하고 기록합니다.

```bash
firebase functions:list
```

### 2. 이전 버전으로 롤백

문제가 발생한 경우 이전 버전으로 롤백합니다.

```bash
firebase functions:rollback
```

### 3. 특정 함수 롤백

특정 함수만 롤백할 경우:

```bash
firebase functions:rollback --function=<function-name>
```

## 배포 모니터링

### 배포 후 로그 확인

```bash
firebase functions:log
```

### 오류 및 성능 모니터링

Firebase 콘솔에서 다음을 확인합니다:
- 함수 실행 오류
- 지연 시간
- 메모리 사용량
- 실행 횟수

## 배포 문제 해결

### 일반적인 배포 오류

1. **의존성 문제**
   - `npm ci` 실행으로 의존성 다시 설치
   - `package-lock.json` 확인

2. **환경변수 오류**
   - 환경변수 설정 확인
   - 비밀 값 관리 검토

3. **메모리 할당 오류**
   - 함수 메모리 할당량 증가
   - 코드 최적화

4. **타임아웃 오류**
   - 함수 타임아웃 설정 증가
   - 비동기 작업 최적화

## 배포 모범 사례

### 점진적 배포
- 한 번에 모든 것을 배포하지 않고 단계적으로 배포
- 문제 발생 시 영향 범위 최소화

### 배포 자동화
- CI/CD 파이프라인 구성
- 자동 테스트 및 검증

### 배포 시간 관리
- 사용량이 적은 시간대에 배포 수행
- 사용자 영향 최소화

### 환경 격리
- 개발, 스테이징, 프로덕션 환경 명확히 분리
- 환경별 구성 관리

## 고가치 사용자 API 배포 가이드

### API 엔드포인트

현재 구현된 API 엔드포인트:

1. **활성 고가치 사용자 조회**
   - 엔드포인트: `/api/highValueUsersApi/active`
   - 매개변수:
     - `minNetBet`: 최소 유효배팅 금액 (기본값: 1000)
     - `limit`: 페이지당 항목 수 (기본값: 10)
     - `page`: 페이지 번호 (기본값: 1)
     - `sortBy`: 정렬 필드 (netBet, loginCount, lastActivity, inactiveDays)
     - `sortOrder`: 정렬 방향 (asc, desc)
     - `search`: 검색어

2. **휴면 고가치 사용자 조회**
   - 엔드포인트: `/api/highValueUsersApi/dormant`
   - 매개변수:
     - `minNetBet`: 최소 유효배팅 금액 (기본값: 1000)
     - `minInactiveDays`: 최소 비활성 일수 (기본값: 30)
     - `limit`, `page`, `sortBy`, `sortOrder`, `search`: 활성 사용자와 동일

3. **CSV 내보내기**
   - 엔드포인트: `/api/highValueUsersApi/export/csv`
   - 매개변수:
     - `minNetBet`: 최소 유효배팅 금액 (기본값: 1000)
     - `type`: 사용자 유형 (all, active, dormant)
     - `search`: 검색어

### 배포 명령

고가치 사용자 API 배포:

```bash
./deploy.sh --function highValueUsersApi
```

### Firebase Hosting 연동

API를 Firebase Hosting과 연동하려면 `firebase.json` 파일에 다음 리다이렉트 규칙을 추가해야 합니다:

```json
{
  "source": "/api/highValueUsersApi/**",
  "function": "highValueUsersApi"
}
```

Hosting 배포:

```bash
firebase deploy --only hosting
```

## 결론

이 가이드를 따라 Firebase Functions를 체계적으로 배포함으로써 안정적이고 효율적인 배포 프로세스를 구축할 수 있습니다. 각 환경에 맞게 전략을 조정하고, 문제 발생 시 신속하게 대응할 수 있는 체계를 갖추는 것이 중요합니다.
