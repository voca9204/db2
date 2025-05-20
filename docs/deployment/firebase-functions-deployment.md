# Firebase Functions 배포 가이드

## 개요

이 문서는 Firebase Functions의 배포 프로세스에 대한 상세한 가이드를 제공합니다. CI/CD 파이프라인을 통한 자동 배포와 수동 배포 방법을 모두 다룹니다.

## 사전 요구 사항

배포를 위해 다음 사항이 필요합니다:

1. Firebase CLI 설치
   ```bash
   npm install -g firebase-tools
   ```

2. Firebase 프로젝트 접근 권한
   - Firebase 콘솔에서 적절한 권한이 부여되어야 함
   - CI/CD의 경우 서비스 계정 토큰이 구성되어야 함

3. 환경별 구성 파일
   - `.firebaserc`: 프로젝트 별칭 정의
   - `firebase.json`: 기본 구성 파일
   - `firebase.staging.json`, `firebase.canary.json`, `firebase.half.json`: 트래픽 분배를 위한 구성 파일

## 환경 설정

### 로컬 개발 환경 설정

로컬에서 Firebase Functions를 개발하고 테스트하기 위한 환경 설정:

1. Firebase 프로젝트 선택
   ```bash
   firebase use <project-id>
   ```

2. Firebase 에뮬레이터 실행
   ```bash
   firebase emulators:start
   ```

3. 에뮬레이터 UI 접근
   - URL: http://localhost:4000

### 환경 변수 구성

Firebase Functions의 환경 변수 설정:

1. 환경 변수 설정
   ```bash
   firebase functions:config:set database.host="<host>" \
                                 database.user="<user>" \
                                 database.password="<password>" \
                                 database.name="<database>"
   ```

2. 현재 환경 변수 확인
   ```bash
   firebase functions:config:get
   ```

3. 로컬 개발을 위한 환경 변수 다운로드
   ```bash
   firebase functions:config:get > .runtimeconfig.json
   ```

## 수동 배포 프로세스

### 전체 배포

모든 Firebase Functions를 수동으로 배포하는 과정:

1. 인증 확인
   ```bash
   firebase login
   ```

2. 프로젝트 선택
   ```bash
   firebase use <project-id>
   ```

3. 배포 실행
   ```bash
   firebase deploy --only functions
   ```

### 특정 함수만 배포

특정 함수나 함수 그룹만 배포하는 과정:

1. 특정 함수 배포
   ```bash
   firebase deploy --only functions:<function-name>
   ```

2. 특정 그룹의 함수 배포
   ```bash
   firebase deploy --only functions:analyticsAPI
   ```

### 단계적 배포 (Progressive Deployment)

트래픽을 점진적으로 이동시키는 단계적 배포:

1. 카나리 배포 (5% 트래픽)
   ```bash
   firebase deploy --only functions:analyticsAPI --config firebase.canary.json
   ```

2. 부분 배포 (50% 트래픽)
   ```bash
   firebase deploy --only functions:analyticsAPI --config firebase.half.json
   ```

3. 전체 배포 (100% 트래픽)
   ```bash
   firebase deploy --only functions:analyticsAPI
   ```

## CI/CD 파이프라인 배포

CI/CD 파이프라인은 다음과 같은 단계로 자동화된 배포를 수행합니다:

### 개발 환경 배포

개발 환경 배포는 `develop` 브랜치로 푸시될 때 자동으로 실행됩니다:

1. 코드 체크아웃
2. 의존성 설치
3. 테스트 실행
4. 프로젝트 빌드
5. Firebase 환경 변수 설정
6. Firebase 프로젝트 선택 (`db888-dev`)
7. Firebase Functions 배포
8. Firebase Hosting 배포
9. 배포 후 검증 테스트 실행
10. Slack 알림 전송

### 스테이징 환경 배포

스테이징 환경 배포는 `main` 브랜치로 푸시될 때 또는 수동으로 실행됩니다:

1. 코드 체크아웃
2. 의존성 설치
3. 테스트 실행
4. 프로젝트 빌드
5. Firebase 환경 변수 설정
6. Firebase 프로젝트 선택 (`db888-staging`)
7. 카나리 배포 (10% 트래픽)
8. 스모크 테스트 실행
9. 성공 시 전체 배포
10. 배포 후 검증 테스트 실행
11. Slack 알림 전송
12. 실패 시 자동 롤백

### 프로덕션 환경 배포

프로덕션 환경 배포는 릴리즈 생성 시 또는 수동으로 실행되며, 승인 프로세스를 거칩니다:

1. 배포 준비 및 테스트
2. 승인 대기
3. 승인 후 카나리 배포 (5% 트래픽)
4. 스모크 테스트 및 모니터링
5. 부분 배포 (50% 트래픽)
6. 추가 모니터링
7. 전체 배포 (100% 트래픽)
8. 배포 후 검증 테스트 실행
9. Slack 알림 전송
10. 실패 시 자동 롤백

## 롤백 프로세스

### 자동 롤백

CI/CD 파이프라인에서 배포 실패 시 자동 롤백이 실행됩니다:

1. 배포 후 검증 테스트 실패 감지
2. 자동 롤백 실행
   ```bash
   firebase functions:rollback
   firebase hosting:rollback
   ```
3. Slack 알림 전송

### 수동 롤백

필요 시 수동으로 롤백을 수행할 수 있습니다:

1. Firebase Functions 롤백
   ```bash
   firebase use <project-id>
   firebase functions:rollback
   ```

2. 특정 버전으로 롤백
   ```bash
   firebase functions:rollback <version-id>
   ```

3. 호스팅 롤백
   ```bash
   firebase hosting:rollback
   ```

## 모니터링 및 디버깅

### 배포 모니터링

배포 후 다음과 같은 도구로 모니터링합니다:

1. Firebase 콘솔
   - Functions 로그 확인
   - 성능 모니터링
   - 오류 트래킹

2. Cloud Monitoring
   - 사용자 정의 대시보드
   - 알림 설정

3. Slack 알림
   - 배포 이벤트
   - 오류 알림

### 로그 확인

Firebase Functions의 로그 확인 방법:

1. Firebase 콘솔에서 로그 확인
   - Firebase 콘솔 > Functions > 로그 탭

2. CLI를 통한 로그 확인
   ```bash
   firebase functions:log
   ```

3. 특정 함수의 로그만 확인
   ```bash
   firebase functions:log --only <function-name>
   ```

## 문제 해결

### 일반적인 배포 문제

1. **메모리 초과 오류**
   - 해결: 함수의 메모리 할당 증가
   ```json
   {
     "functions": {
       "source": "functions",
       "runtime": "nodejs18",
       "resources": {
         "memory": "1GB"
       }
     }
   }
   ```

2. **타임아웃 오류**
   - 해결: 함수의 타임아웃 설정 증가
   ```json
   {
     "functions": {
       "source": "functions",
       "runtime": "nodejs18",
       "timeoutSeconds": 540
     }
   }
   ```

3. **종속성 오류**
   - 해결: package.json 확인 및 업데이트
   ```bash
   cd functions
   npm ci
   ```

### 배포 권한 문제

1. **인증 오류**
   - 해결: 재인증 및 권한 확인
   ```bash
   firebase logout
   firebase login
   ```

2. **CI/CD 토큰 오류**
   - 해결: 서비스 계정 토큰 갱신
   ```bash
   firebase login:ci
   ```

## 보안 고려 사항

1. 환경 변수로 저장된 민감한 정보를 소스 코드에 하드코딩하지 않음
2. 모든 비밀은 GitHub Actions 시크릿 또는 Firebase 환경 구성으로 관리
3. Firebase Security Rules를 통해 데이터 및 리소스 접근 보호
4. 적절한 IAM 권한 설정을 통해 최소 권한 원칙 준수

## 모범 사례

1. 의미 있는 커밋 메시지 사용
2. 함수의 크기와 복잡성 최소화
3. 콜드 스타트 최소화를 위한 최적화
4. 배포 전 로컬 에뮬레이터로 철저한 테스트
5. 단계적 배포 전략 활용
6. 정기적인 배포 일정 수립
7. 모든 중요 변경사항에 대한 팀 커뮤니케이션 유지

## 참조 문서

- [Firebase Functions 문서](https://firebase.google.com/docs/functions)
- [Firebase CLI 참조](https://firebase.google.com/docs/cli)
- [GitHub Actions 문서](https://docs.github.com/en/actions)
