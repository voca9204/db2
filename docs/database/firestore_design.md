# Firestore 기반 고가치 사용자 분석 결과 저장 설계

## 목적
본 문서는 비활성 사용자 이벤트 분석 결과를 Firebase Firestore에 저장하고 실시간으로 업데이트하기 위한 설계를 설명합니다. 이 설계를 통해 분석 결과에 대한 실시간 접근과 효율적인 데이터 동기화가 가능하게 됩니다.

## 데이터 모델

### 컬렉션 구조

```
firestore/
├── analytics/
│   ├── user_segments/  # 사용자 세그먼트 정보
│   ├── event_effects/  # 이벤트 효과 분석 결과
│   ├── conversion_rates/  # 전환율 분석
│   └── metrics/  # 주요 지표 및 KPI
├── users/
│   ├── high_value/  # 고가치 사용자 정보
│   ├── inactive/  # 비활성 사용자 정보
│   └── converted/  # 이벤트 후 전환된 사용자 정보
└── events/
    ├── definitions/  # 이벤트 정의
    ├── participants/  # 이벤트 참여자
    └── outcomes/  # 이벤트 결과
```

### 문서 구조

#### 1. analytics/user_segments/{segment_id}

```javascript
{
  "segment_id": "inactive_30_60_days",
  "name": "30-60일 비활성 사용자",
  "description": "최근 30일에서 60일 사이에 로그인하지 않은 사용자",
  "criteria": {
    "inactivity_min_days": 30,
    "inactivity_max_days": 60
  },
  "stats": {
    "user_count": 1250,
    "avg_last_deposit_amount": 25000,
    "avg_total_deposits": 120000,
    "avg_event_participation_rate": 15.2
  },
  "updated_at": Timestamp,
  "created_at": Timestamp
}
```

#### 2. analytics/event_effects/{event_id}

```javascript
{
  "event_id": "summer_festival_2025",
  "event_name": "여름 축제 2025",
  "period": {
    "start_date": Timestamp,
    "end_date": Timestamp
  },
  "total_participants": 3500,
  "inactive_participants": 1250,
  "conversion_rate": 12.5,  // 이벤트 후 입금 전환율(%)
  "roi": 145.2,  // 투자수익률(%)
  "segment_performance": {
    "inactive_30_60_days": {
      "participants": 450,
      "conversion_rate": 15.2,
      "roi": 168.3
    },
    "inactive_60_90_days": {
      "participants": 320,
      "conversion_rate": 10.4,
      "roi": 132.7
    },
    // 기타 세그먼트...
  },
  "reward_tier_performance": {
    "tier_1": {  // 1만원 이하
      "participants": 1200,
      "conversion_rate": 8.5,
      "roi": 95.2
    },
    "tier_2": {  // 1만원-3만원
      "participants": 950,
      "conversion_rate": 12.3,
      "roi": 142.1
    },
    // 기타 티어...
  },
  "updated_at": Timestamp,
  "created_at": Timestamp
}
```

#### 3. analytics/conversion_rates/{timestamp}

```javascript
{
  "date": Timestamp,
  "overall_conversion_rate": 10.2,
  "by_inactive_period": {
    "0-30": 15.2,
    "30-60": 12.5,
    "60-90": 8.3,
    "90-180": 5.1,
    "180+": 2.7
  },
  "by_event_amount": {
    "0-10000": 5.5,
    "10000-30000": 12.3,
    "30000-50000": 18.7,
    "50000+": 25.2
  },
  "updated_at": Timestamp
}
```

#### 4. analytics/metrics/{date}

```javascript
{
  "date": "2025-05-19",
  "daily_active_users": 15000,
  "total_inactive_users": 45000,
  "inactive_user_ratio": 75.0,  // %
  "high_value_inactive_users": 5200,
  "event_participation_rate": 12.5,  // %
  "conversion_rate": 10.2,  // %
  "avg_roi": 135.2,  // %
  "key_metrics_change": {
    "active_users_change": -2.5,
    "conversion_rate_change": +1.2,
    "roi_change": +5.3
  },
  "updated_at": Timestamp
}
```

#### 5. users/high_value/{user_id}

```javascript
{
  "user_id": "user12345",
  "user_name": "고객A",
  "status": "inactive",  // active, inactive
  "total_deposits": 12500000,
  "last_deposit_amount": 500000,
  "last_deposit_date": Timestamp,
  "last_login_date": Timestamp,
  "inactive_days": 45,
  "probability_score": {
    "reactivation": 0.75,  // 재활성화 가능성
    "conversion": 0.82,  // 전환 가능성
    "churn": 0.15  // 이탈 가능성
  },
  "event_participation": [
    {
      "event_id": "summer_festival_2025",
      "participation_date": Timestamp,
      "reward_amount": 25000
    },
    // 기타 이벤트...
  ],
  "recommended_actions": [
    "VIP 이벤트 초대",
    "개인화된 보너스 제공"
  ],
  "tags": ["vip", "inactive", "high_conversion_potential"],
  "updated_at": Timestamp
}
```

#### 6. users/converted/{user_id}

```javascript
{
  "user_id": "user67890",
  "source_segment": "inactive_30_60_days",
  "inactive_days_before_conversion": 45,
  "first_event": {
    "event_id": "summer_festival_2025",
    "participation_date": Timestamp,
    "reward_amount": 15000
  },
  "first_deposit_after_event": {
    "amount": 100000,
    "date": Timestamp,
    "days_after_event": 3
  },
  "total_deposits_after_conversion": 350000,
  "deposit_frequency_after_conversion": 2.5,  // 월평균 입금 횟수
  "updated_at": Timestamp
}
```

#### 7. events/definitions/{event_id}

```javascript
{
  "event_id": "summer_festival_2025",
  "name": "여름 축제 2025",
  "description": "여름 특별 이벤트: 로그인 보너스 및 특별 아이템 제공",
  "period": {
    "start_date": Timestamp,
    "end_date": Timestamp
  },
  "target_segments": ["inactive_30_60_days", "inactive_60_90_days"],
  "rewards": {
    "tier_1": {
      "amount": 5000,
      "conditions": "로그인 1회"
    },
    "tier_2": {
      "amount": 15000,
      "conditions": "게임 플레이 30분 이상"
    },
    "tier_3": {
      "amount": 30000,
      "conditions": "친구 초대 1명 이상"
    }
  },
  "expected_outcomes": {
    "target_participants": 5000,
    "target_conversion_rate": 15.0,
    "target_roi": 150.0
  },
  "active": true,
  "created_at": Timestamp,
  "updated_at": Timestamp
}
```

## 데이터 동기화 전략

### 1. 주기적 일괄 업데이트

```
+------------------+      +-------------------+      +------------------+
| MariaDB 데이터베이스 | ---> | 분석 작업 (Functions) | ---> | Firestore 저장소 |
+------------------+      +-------------------+      +------------------+
```

- **빈도**: 일별/주별/월별 분석 작업 일정에 따라 실행
- **방법**: Cloud Functions 스케줄링
- **용도**: 대규모 집계 분석, 시간적 여유가 있는 분석, 과거 데이터 분석

### 2. 이벤트 기반 실시간 업데이트

```
+------------------+      +-------------------+      +------------------+
| 사용자 활동 이벤트   | ---> | 이벤트 처리 Functions | ---> | Firestore 저장소 |
+------------------+      +-------------------+      +------------------+
```

- **트리거**: 중요 사용자 활동 (로그인, 게임 플레이, 이벤트 참여, 입금 등)
- **방법**: Pub/Sub 메시지, Firestore 트리거, HTTP 트리거
- **용도**: 중요 지표 실시간 업데이트, 알림 트리거, 상태 변경 트래킹

### 3. 온디맨드 분석 업데이트

```
+------------------+      +-------------------+      +------------------+
| 사용자 요청 (API 호출) | ---> | 분석 API Functions | ---> | Firestore 저장소 |
+------------------+      +-------------------+      +------------------+
```

- **트리거**: 관리자 또는 대시보드의 특정 분석 요청
- **방법**: HTTP API 엔드포인트
- **용도**: 사용자 정의 분석, 임시 보고서, 특수 목적 분석

## 캐싱 전략

1. **Firebase 인메모리 캐싱**
   - Cloud Functions 실행 간 인스턴스 재사용을 통한 메모리 캐싱
   - 자주 사용되는 쿼리 결과 및 설정 캐싱

2. **Redis 캐싱 (선택사항)**
   - 대규모 결과셋 및 복잡한 계산 캐싱
   - API 응답 캐싱

3. **Firestore 캐싱 계층**
   - 분석 결과의 축소 버전을 별도 문서에 저장
   - 대시보드용 사전 계산된 집계 데이터 유지

## 응용 시나리오

### 시나리오 1: 일일 분석 업데이트

1. Cloud Scheduler가 매일 자정에 분석 함수 트리거
2. 분석 함수가 MariaDB에서 최신 데이터 추출
3. 비활성 사용자, 이벤트 효과, 전환율 등 주요 지표 계산
4. 계산된 결과를 Firestore의 관련 컬렉션에 저장
5. 대시보드가 Firestore에서 최신 데이터를 가져와 표시

### 시나리오 2: 사용자 전환 이벤트

1. 비활성 사용자가 이벤트 참여 후 입금 실행
2. 입금 이벤트가 Pub/Sub 메시지 발행
3. Cloud Functions가 메시지를 수신하여 전환 분석 수행
4. 사용자 상태를 `users/converted/{user_id}`에 저장
5. 관련 지표 업데이트 (`analytics/conversion_rates`, `analytics/event_effects`)
6. 실시간 대시보드 업데이트 및 관리자 알림 발송

### 시나리오 3: 맞춤형 분석 요청

1. 관리자가 대시보드에서 특정 기간/세그먼트 분석 요청
2. API 엔드포인트가 특정 매개변수로 호출됨
3. Cloud Functions가 요청 처리 및 필요한 분석 수행
4. 분석 결과를 임시 Firestore 문서에 저장
5. 결과를 대시보드에 실시간으로 표시

## 구현 계획

### 1단계: 기본 데이터 모델 구현
- Firestore 컬렉션 및 문서 구조 설정
- 기본 CRUD 작업 구현
- 보안 규칙 설정

### 2단계: 동기화 메커니즘 구현
- 일괄 분석 작업 Cloud Functions 구현
- 이벤트 트리거 설정
- 온디맨드 API 엔드포인트 구현

### 3단계: 실시간 기능 구현
- 실시간 대시보드 업데이트 기능
- 실시간 알림 시스템
- 데이터 스트리밍 처리

### 4단계: 성능 최적화
- 캐싱 전략 구현
- 인덱스 최적화
- 쿼리 성능 개선

### 5단계: 테스트 및 배포
- 통합 테스트
- 로드 테스트
- 단계적 배포

## 고려사항 및 제한사항

1. **비용 관리**
   - Firestore 읽기/쓰기 작업 최적화
   - 불필요한 문서 중복 방지
   - 대규모 분석 데이터의 효율적 저장 방안 필요

2. **보안**
   - 적절한 Firestore 보안 규칙 설정
   - 사용자 인증 및 권한 관리
   - 민감한 데이터 암호화

3. **확장성**
   - 대용량 데이터 처리 방안
   - 샤딩 전략 (필요시)
   - 미래 성장에 대비한 구조 설계

4. **신뢰성**
   - 데이터 일관성 보장
   - 동기화 오류 처리 메커니즘
   - 로깅 및 모니터링
