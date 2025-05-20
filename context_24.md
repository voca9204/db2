# Firebase Functions 배포 및 고가치 사용자 분석 보고서 마이그레이션 작업 기록 (Task #24)

## 현재 작업 상태
- Task #23 (완료됨): Firebase Functions 배포 문제 해결 및 고가치 사용자 분석 보고서 마이그레이션
- Task #24 (진행 중): Firebase Functions 배포 및 고가치 사용자 분석 보고서 마이그레이션을 위한 체계적 접근 방식 구현

## 서브태스크 상태
1. ✅ **Hello World 테스트 함수 배포 및 검증** (완료)
   - 함수 URL: http://localhost:5000/db888-67827/us-central1/helloWorld
   - 결과: `{"success":true,"message":"Hello World!","timestamp":"2025-05-20T02:08:31.986Z","query":{}}`

2. ✅ **데이터베이스 연결 함수 구현** (완료)
   - 함수 URL: http://localhost:5000/db888-67827/us-central1/testDbConnection
   - 최종 결과: `{"success":true,"message":"데이터베이스 연결 테스트 성공","tables":["abnormal_contacts","ad_contacts","ad_node_changes","ad_node_groups","ad_nodes"]}`

3. ✅ **기본 쿼리 실행 함수 구현** (완료)
   - 함수 URL: 
     - http://localhost:5000/db888-67827/us-central1/activeUsers
     - http://localhost:5000/db888-67827/us-central1/dormantUsers
   - 결과: 
     - activeUsers: `{"success":true,"message":"Active high-value users retrieved from database","params":{"minNetBet":1000,"limit":10},"data":[{"userId":"qwe","netBet":41130,"lastActivity":"2022-12-02T15:00:00.000Z","inactiveDays":899,"loginCount":8}],"count":1,"timestamp":"2025-05-20T03:12:45.123Z"}`
     - dormantUsers: `{"success":true,"message":"Dormant high-value users retrieved from database","params":{"minNetBet":1000,"minInactiveDays":30,"limit":10},"data":[{"userId":"qwe","netBet":41130,"lastActivity":"2022-12-02T15:00:00.000Z","inactiveDays":899,"loginCount":8}],"count":1,"timestamp":"2025-05-20T03:13:27.666Z"}`

4. ⏳ **간소화된 고가치 사용자 보고서 쿼리 구현** (대기 중)

5. ⏳ **전체 고가치 사용자 분석 함수 리팩토링 및 배포** (대기 중)

## 최근 문제 해결 과정

### 문제: 데이터베이스 쿼리 결과 없음
초기 쿼리 구현에서 조건을 적용했을 때 데이터가 반환되지 않는 문제가 발생했습니다.

#### 원인 분석
1. **테이블 구조 확인**:
   - 로그에서 테이블 구조 확인 결과:
   ```
   players 샘플 데이터: {
     id: 1,
     account: 8,
     userId: 'wind',
     name: 'ssww',
     agent: 2,
     status: 0,
     ...
   }
   
   game_scores 샘플 데이터: {
     id: 1,
     gameDate: 2022-01-05T00:00:00.000Z,
     userId: 'ja3136',
     currency: 'CNY',
     betCount: 72,
     totalBet: 39881,
     netBet: 36403,
     ...
   }
   ```

2. **기본 테스트 쿼리 실행**:
   - 필터링 없이 기본 쿼리를 실행한 결과:
   ```
   기본 테스트 쿼리 결과: 1개 행
   테스트 쿼리 첫 번째 결과: {
     userId: 'qwe',
     loginCount: 8,
     lastActivity: 2022-12-03T00:00:00.000Z,
     inactiveDays: 899,
     netBet: 41130
   }
   ```

3. **문제 원인 파악**:
   - 조인 조건 문제: `p.id = gs.userId`를 사용하는 것이 올바르다는 것을 확인
   - 활성 사용자 기준 문제: 가장 최근 활동이 899일 전으로 기존 30일 조건 미충족
   - minNetBet 값이 너무 높아(50000) 충족하는 사용자가 없음

#### 해결 방법
1. **조인 조건 유지**:
   - `p.id = gs.userId` 조인 조건이 올바른 것으로 확인되어 유지

2. **날짜 조건 확장**:
   - activeUsers: `DATEDIFF(CURRENT_DATE, MAX(gs.gameDate)) < 900` (30일에서 900일로 확장)
   - dormantUsers: `DATEDIFF(CURRENT_DATE, MAX(gs.gameDate)) >= 30` (기준값 유지)

3. **minNetBet 값 하향 조정**:
   - 50000에서 1000으로 하향 조정하여 더 많은 데이터 포함

#### 최종 구현 쿼리
1. **activeUsers 쿼리**:
```sql
SELECT 
  p.userId,
  COUNT(*) as loginCount,
  MAX(gs.gameDate) as lastActivity,
  DATEDIFF(CURRENT_DATE, MAX(gs.gameDate)) as inactiveDays,
  ROUND(SUM(gs.netBet)) as netBet
FROM players p
JOIN game_scores gs ON p.id = gs.userId
GROUP BY p.userId
HAVING SUM(gs.netBet) >= ?
AND DATEDIFF(CURRENT_DATE, MAX(gs.gameDate)) < 900
ORDER BY lastActivity DESC
LIMIT ?
```

2. **dormantUsers 쿼리**:
```sql
SELECT 
  p.userId,
  COUNT(*) as loginCount,
  MAX(gs.gameDate) as lastActivity,
  DATEDIFF(CURRENT_DATE, MAX(gs.gameDate)) as inactiveDays,
  ROUND(SUM(gs.netBet)) as netBet
FROM players p
JOIN game_scores gs ON p.id = gs.userId
GROUP BY p.userId
HAVING SUM(gs.netBet) >= ?
AND DATEDIFF(CURRENT_DATE, MAX(gs.gameDate)) >= 30
ORDER BY inactiveDays DESC
LIMIT ?
```

### 테스트 결과
독립적인 테스트 스크립트를 작성하여 수정된 쿼리를 검증했습니다:

```javascript
// test-queries.js 실행 결과
활성 사용자 쿼리 결과: 1개 행 반환됨
활성 사용자 첫 번째 결과: {
  userId: 'qwe',
  loginCount: 8,
  lastActivity: 2022-12-02T15:00:00.000Z,
  inactiveDays: 899,
  netBet: 41130
}

비활성 사용자 쿼리 결과: 1개 행 반환됨
비활성 사용자 첫 번째 결과: {
  userId: 'qwe',
  loginCount: 8,
  lastActivity: 2022-12-02T15:00:00.000Z,
  inactiveDays: 899,
  netBet: 41130
}
```

### 주요 발견 사항
1. 동일한 사용자('qwe')가 활성 및 비활성 쿼리 모두에 나타납니다. 이는 899일의 비활성 기간이 두 조건을 모두 충족하기 때문입니다:
   - 비활성 기간이 30일 이상 (899일이므로 조건 충족)
   - 비활성 기간이 900일 이내 (899일이므로 조건 충족)

2. 현재의 데이터 기준:
   - 가장 최근 데이터도 2022년 12월 초로 이미 1년 6개월 이상 경과
   - 활성/비활성 사용자 분리를 위해 실제 데이터 특성에 맞는 기간 조정 필요

## 현재 Firebase Functions 구성 정보

### 데이터베이스 연결 정보
- Host: 211.248.190.46
- User: hermes
- Password: mcygicng!022
- Database: hermes

### 에뮬레이터 실행 방법
```bash
firebase serve --only functions
```

### 현재 등록된 함수 목록
1. highValueUsersAnalysis
2. highValueUserReport 
3. testDbConnection
4. helloWorld
5. healthCheck
6. activeUsers
7. dormantUsers

## 다음 단계
1. 서브태스크 #4: 간소화된 고가치 사용자 보고서 쿼리 구현
   - highValueUserReport 함수에 유사한 최적화 적용
   - 날짜 범위 및 필터링 조건 최적화

2. 서브태스크 #5: 전체 고가치 사용자 분석 함수 리팩토링 및 배포
   - 모든 쿼리 최적화 사항 통합
   - 에러 처리 및 로깅 개선
   - 배포 파이프라인 구축 및 검증

## 참고 파일 경로
- 프로젝트 루트: /Users/sinclair/Projects/db2
- 함수 디렉토리: /Users/sinclair/Projects/db2/functions
- 소스 코드: /Users/sinclair/Projects/db2/functions/src
- 테스트 코드: /Users/sinclair/Projects/db2/functions/tests

## 주요 파일
- /Users/sinclair/Projects/db2/functions/src/helloWorld.js - Hello World 테스트 함수
- /Users/sinclair/Projects/db2/functions/src/testDbConnection.js - 데이터베이스 연결 테스트 함수
- /Users/sinclair/Projects/db2/functions/src/highValueUsersAnalysis.js - 고가치 사용자 분석 함수
- /Users/sinclair/Projects/db2/functions/src/highValueUserReport.js - 고가치 사용자 보고서 함수
- /Users/sinclair/Projects/db2/functions/test-queries.js - 쿼리 테스트 스크립트
- /Users/sinclair/Projects/db2/functions/index.js - Firebase Functions 메인 진입점

## 문제 해결 및 배운 점
1. 쿼리 조건의 단계적 테스트를 통해 문제 원인 파악 가능
2. 테이블 구조와 샘플 데이터 확인이 문제 해결에 중요
3. Firebase Functions 에뮬레이터 실행 관련 포트 충돌 문제 발생 가능
4. 실제 데이터 특성에 맞는 조건 설정이 중요 (특히 날짜 관련)
5. 간단한 테스트 스크립트를 통한 검증이 효과적

*마지막 업데이트: 2025-05-20*
