# Firestore 기반 고가치 사용자 분석 시스템

본 문서는 Firebase Firestore를 활용한 고가치 사용자 분석 결과 저장 및 실시간 업데이트 시스템에 대해 설명합니다.

## 개요

이 시스템은 비활성 (휴면) 사용자의 이벤트 참여와 입금 전환에 대한 분석 결과를 Firestore에 저장하고, 실시간으로 업데이트 및 액세스할 수 있는 기능을 제공합니다. 기존 MySQL/MariaDB 기반 분석 시스템의 확장으로, 분석 결과를 더 효율적으로 저장하고 실시간 대시보드를 지원합니다.

## 주요 기능

1. **고가치 사용자 분석 결과 저장**
   - 분석 결과 구조화 저장
   - 타임시리즈 데이터 관리
   - 효율적인 쿼리 및 필터링

2. **실시간 데이터 업데이트**
   - Firestore 리스너를 통한 실시간 데이터 동기화
   - 변경 이벤트 발생 시 푸시 알림

3. **스케줄링된 분석 작업**
   - 일일, 주간, 월간 분석 자동화
   - 분석 결과 자동 저장
   - 에러 처리 및 로깅

4. **캐시 관리 및 성능 최적화**
   - 분석 결과 캐싱
   - 만료된 캐시 자동 정리
   - 효율적인 데이터 접근

## 시스템 구성 요소

### 1. 서비스 모듈

- **analytics-storage.service.js**: 분석 결과 저장 및 관리
- **realtime-data.service.js**: 실시간 데이터 업데이트 및 리스너 관리
- **scheduled-analytics.service.js**: 정기적인 분석 작업 스케줄링 및 실행

### 2. Firebase Functions

- **runDailyAnalytics**: 매일 자정에 실행되는 일일 분석 작업
- **runWeeklyAnalytics**: 매주 월요일 자정에 실행되는 주간 분석 작업
- **runMonthlyAnalytics**: 매월 1일 자정에 실행되는 월간 분석 작업
- **cleanupExpiredCache**: 시간별로 실행되는 만료된 캐시 정리 작업
- **syncHighValueUserData**: 고가치 사용자 데이터 변경 시 실행되는 동기화 함수
- **syncEventAnalyticsData**: 이벤트 분석 데이터 변경 시 실행되는 동기화 함수
- **analyzeHighValueUsers**: 고가치 사용자 분석을 실행하는 HTTP 엔드포인트
- **analyzeEventEffects**: 이벤트 효과 분석을 실행하는 HTTP 엔드포인트
- **sendDataNotification**: 데이터 업데이트 알림을 전송하는 HTTP 엔드포인트

## Firestore 데이터 모델

### 컬렉션 구조

- **highValueUsers**: 고가치 사용자 데이터 저장
  - `{userId}`: 사용자 ID를 문서 ID로 사용
  - `latest`: 최신 메타데이터 문서

- **eventAnalytics**: 이벤트 분석 데이터 저장
  - `{eventId}`: 이벤트 ID를 문서 ID로 사용
  - `latest`: 최신 메타데이터 문서

- **userSegments**: 사용자 세그먼트 분석 데이터 저장
  - `latest`: 최신 분석 결과
  - `YYYY-MM-DD`: 날짜별 스냅샷

- **conversionMetrics**: 전환율 메트릭 데이터 저장
  - `latest`: 최신 분석 결과
  - `YYYY-MM-DD`: 날짜별 스냅샷

- **analyticsResults**: 분석 결과 메타데이터 및 히스토리
  - `high_value_users`: 고가치 사용자 분석 메타데이터
  - `events`: 이벤트 분석 메타데이터
  - `{analysisType}/{period}/{timestamp}`: 시계열 분석 결과

- **analyticsTasks**: 분석 작업 기록
  - `{taskId}`: 작업 ID를 문서 ID로 사용

- **cache**: 임시 캐시 데이터
  - `{cacheKey}`: 캐시 키를 문서 ID로 사용

## 실시간 리스너 사용 방법

### 웹 클라이언트에서 실시간 업데이트 구독

```javascript
// Firebase 클라이언트 초기화
import { initializeApp } from 'firebase/app';
import { getFirestore, doc, onSnapshot } from 'firebase/firestore';

const firebaseConfig = {
  // Firebase 프로젝트 설정
};

const app = initializeApp(firebaseConfig);
const db = getFirestore(app);

// 고가치 사용자 메타데이터 실시간 구독
const highValueUsersRef = doc(db, 'highValueUsers', 'latest');
const unsubscribe = onSnapshot(highValueUsersRef, (doc) => {
  if (doc.exists()) {
    const data = doc.data();
    console.log('고가치 사용자 데이터 업데이트:', data);
    
    // 데이터 업데이트 처리
    updateDashboard(data);
  }
});

// 구독 해제 (컴포넌트 언마운트 시)
// unsubscribe();
```

### 서버 사이드에서 실시간 리스너 등록

```javascript
// 서비스 임포트
const { realTimeDataService } = require('./services/firestore');

// 고가치 사용자 데이터 리스너 등록
const listenerId = realTimeDataService.listenToHighValueUsers((data) => {
  console.log('고가치 사용자 데이터 변경:', data);
  
  // 변경 이벤트 처리
  // ...
});

// 특정 세그먼트의 고가치 사용자 리스너 등록
const segmentListenerId = realTimeDataService.listenToHighValueUserGroup(
  { minInactiveDays: 30, orderBy: 'reactivationScore' },
  (data) => {
    console.log('휴면 고가치 사용자 데이터 변경:', data);
    
    // 변경 이벤트 처리
    // ...
  }
);

// 리스너 해제 (종료 시)
// realTimeDataService.unregisterListener(listenerId);
// realTimeDataService.unregisterListener(segmentListenerId);
```

## HTTP API 엔드포인트

### 1. 고가치 사용자 분석 실행

- **URL**: `/analyzeHighValueUsers`
- **메서드**: GET, POST
- **인증**: Bearer 토큰 필요
- **파라미터**:
  - `minNetBet`: 최소 네트 베팅 금액 (기본값: 50000)
  - `minPlayDays`: 최소 플레이 일수 (기본값: 7)
  - `maxInactiveDays`: 최대 비활성 일수 (기본값: 30)

### 2. 이벤트 효과 분석 실행

- **URL**: `/analyzeEventEffects`
- **메서드**: GET, POST
- **인증**: Bearer 토큰 필요
- **파라미터**:
  - `startDate`: 시작 날짜 (선택)
  - `endDate`: 종료 날짜 (선택)
  - `minParticipants`: 최소 참여자 수 (기본값: 5)

### 3. 데이터 업데이트 알림 전송

- **URL**: `/sendDataNotification`
- **메서드**: POST
- **인증**: Bearer 토큰 필요
- **요청 본문**:
  - `topic`: 알림 토픽
  - `data`: 알림 데이터

## 스케줄링된 분석 작업

스케줄링된 분석 작업은 Firebase Functions의 pubsub 트리거를 사용하여 구현되었습니다.

- **일일 분석**: 매일 자정(00:00 KST)에 실행
- **주간 분석**: 매주 월요일 자정(00:00 KST)에 실행
- **월간 분석**: 매월 1일 자정(00:00 KST)에 실행
- **캐시 정리**: 매시간 (00분)에 실행

## 배포 및 설정

### 필수 환경 변수

`.env` 파일 또는 Firebase Functions 환경 변수 설정:

```
# Firebase Functions 설정
FUNCTIONS_REGION=asia-northeast3
API_PREFIX=/api/v1
NODE_ENV=production

# 캐싱 설정
ENABLE_CACHE=true
CACHE_TTL_SECONDS=300

# 데이터베이스 설정
DB_HOST=211.248.190.46
DB_USER=hermes
DB_PASSWORD=mcygicng!022
DB_NAME=hermes
```

### 배포 명령어

```bash
cd functions
npm install
firebase deploy --only functions
```

## 성능 최적화 및 모니터링

- **콜드 스타트 최소화**: 함수 초기화 코드 최적화
- **배치 처리**: 대량 데이터 저장 시 배치 처리로 성능 향상
- **캐시 사용**: 자주 요청되는 데이터는 캐싱으로 성능 향상
- **모니터링**: Firebase Functions 콘솔에서 성능 및 오류 모니터링

## 에러 처리 및 로깅

모든 서비스와 함수에는 포괄적인 오류 처리 및 로깅이 구현되어 있습니다:

- 상세한 로그 메시지로 디버깅 용이
- 오류 발생 시 자동 복구 메커니즘
- 트랜잭션을 사용한 데이터 일관성 유지
- 중요 작업의 성공/실패 이력 기록

## 보안 및 권한 관리

- **인증**: 모든 API 엔드포인트는 Firebase Authentication을 통한 인증 필요
- **권한**: 적절한 역할을 가진 사용자만 분석 작업 실행 가능
- **데이터 접근**: Firestore 보안 규칙을 통한 세밀한 데이터 접근 제어

## 향후 개선 사항

1. **고급 분석 기능 추가**
   - 머신러닝 기반 사용자 행동 예측
   - 고급 세그먼트 분석 및 패턴 감지

2. **UI/UX 개선**
   - 실시간 대시보드 개선
   - 인터랙티브 시각화 요소 추가

3. **성능 최적화**
   - 대용량 데이터 처리 최적화
   - 더 효율적인 쿼리 및 인덱싱 전략

4. **확장성 강화**
   - 멀티 리전 지원
   - 샤딩을 통한 수평적 확장
