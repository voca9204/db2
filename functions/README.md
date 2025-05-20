# Firebase Functions for High Value User Analytics

본 프로젝트는 고가치 사용자 분석 API를 위한 Firebase Functions 구현입니다. 오랫동안 게임을 하지 않은 사용자가 이벤트를 통해 게임에 참여하고, 최종적으로 입금까지 이어지는 과정을 분석하기 위한 도구를 제공합니다.

## 주요 기능

- **고가치 사용자 분석**: 활성 및 휴면 고가치 사용자 분석, 사용자 세그먼트 분석, 사용자 상세 정보 조회, 재활성화 대상 사용자 추천
- **이벤트 효과 분석**: 이벤트 목록 조회, 이벤트 상세 분석, 이벤트 전환율 분석
- **자동화된 분석**: 일일 및 주간 정기 분석 작업, Firestore에 결과 저장
- **API 엔드포인트**: RESTful API를 통한 분석 결과 제공

## 기술 스택

- **Firebase Functions**: 서버리스 백엔드
- **Firebase Authentication**: 인증 및 권한 관리
- **Firebase Firestore**: 분석 결과 저장 및 실시간 업데이트
- **Express.js**: API 라우팅 및 미들웨어
- **MySQL**: 데이터베이스 연결 및 쿼리
- **Joi**: 데이터 유효성 검증

## API 엔드포인트

### 고가치 사용자 분석

- `GET /api/v1/users/high-value/active`: 활성 고가치 사용자 조회
- `GET /api/v1/users/high-value/dormant`: 휴면 고가치 사용자 조회
- `GET /api/v1/users/high-value/segments`: 사용자 세그먼트 분석
- `GET /api/v1/users/high-value/:userId`: 사용자 상세 정보 조회
- `GET /api/v1/users/high-value/reactivation/targets`: 재활성화 대상 사용자 추천

### 이벤트 분석

- `GET /api/v1/events`: 이벤트 목록 조회
- `GET /api/v1/events/:eventId/analysis`: 이벤트 상세 분석 조회
- `GET /api/v1/events/analysis/conversion`: 이벤트 전환율 분석

## 아키텍처

이 프로젝트는 다음과 같은 아키텍처를 따릅니다:

1. **컨트롤러 레이어**: API 요청 처리 및 응답 반환 (`src/controllers/`)
2. **서비스 레이어**: 비즈니스 로직 및 데이터 접근 계층 (`src/services/`)
3. **라우터 레이어**: API 엔드포인트 정의 및 라우팅 (`src/routes/`)
4. **유틸리티**: 공통 기능 및 헬퍼 함수 (`src/utils/`)
5. **미들웨어**: 인증, 에러 처리 등 (`src/middleware/`)

## 재사용 가능한 패턴

이 프로젝트는 재사용 가능한 코드 패턴을 사용하여 유지보수성을 향상시켰습니다:

1. **동적 쿼리 빌더**: 재사용 가능한 쿼리 빌더를 통해 다양한 필터링, 정렬, 페이지네이션 기능 제공
2. **표준화된 응답 형식**: 모든 API 응답이 일관된 형식을 따름
3. **공통 에러 처리**: 중앙화된 에러 처리 미들웨어
4. **유효성 검증**: Joi를 사용한 표준화된 요청 유효성 검증
5. **역할 기반 접근 제어**: 사용자 권한에 따른 API 접근 제어

## 개발 환경 설정

1. Node.js 및 npm 설치
2. Firebase CLI 설치: `npm install -g firebase-tools`
3. Firebase 로그인: `firebase login`
4. 환경 변수 설정: `.env.example`을 복사하여 `.env` 파일 생성 및 구성
5. 의존성 설치: `cd functions && npm install`
6. 로컬 개발 서버 실행: `npm run serve`

## 배포

1. 환경별 설정 확인: `firebase functions:config:get`
2. Firebase 환경 변수 설정: `firebase functions:config:set db.host="호스트" db.user="사용자" db.password="비밀번호" db.name="데이터베이스"`
3. 함수 배포: `firebase deploy --only functions`
4. 특정 함수만 배포: `firebase deploy --only functions:api`

## 테스트

1. 단위 테스트 실행: `npm test`
2. 특정 테스트 파일 실행: `npm test -- --testPathPattern=high-value-user`
3. 테스트 커버리지 확인: `npm test -- --coverage`
