# 데이터베이스 변수 정확한 의미 정의 및 문서화

마지막 업데이트: 2025-05-17

## promotion_players 테이블
- **reward**: 이벤트에서 사용자에게 지급하기로 설정된 금액 (항상 0보다 큼)
- **appliedAt**: 실제 이벤트 금액이 지급된 시점 (NULL이면 지급 안됨, 값이 있으면 지급 완료)
- **status**: 상태 코드를 나타내는 필드
- **player**: players 테이블의 id와 연결되는 외래 키
- **promotion**: 프로모션 ID를 나타내는 필드

## money_flows 테이블
- **type**: 거래 유형 (0: 입금, 1: 출금, 3: 이체수수료)
- **player**: players 테이블의 id와 연결되는 외래 키
- **amount**: 거래 금액
- **createdAt**: 거래가 생성된 시점
- **status**: 거래 상태를 나타내는 필드

## game_scores 테이블
- **userId**: players 테이블의 userId와 연결됨
- **gameDate**: 게임을 플레이한 날짜
- **totalBet**: 총 베팅 금액
- **netBet**: 순 베팅 금액 (보너스 등을 제외한 실제 베팅)
- **winLoss**: 승/패 결과 금액

## 주요 연관 관계
- **players.id** ↔ **promotion_players.player**: 사용자와 이벤트 지급 관계
- **players.userId** ↔ **game_scores.userId**: 사용자와 게임 베팅 관계
- **players.id** ↔ **money_flows.player**: 사용자와 입출금 관계

## 중요 필드 사용 예시
```sql
-- 이벤트 지급이 완료된 사용자 조회
SELECT * FROM promotion_players WHERE appliedAt IS NOT NULL;

-- 입금 내역 조회
SELECT * FROM money_flows WHERE type = 0;

-- 사용자의 베팅 내역 조회
SELECT * FROM game_scores WHERE userId = 'xxx';
```

## 분석 시 주의사항
1. 이벤트 지급 여부는 반드시 `appliedAt IS NOT NULL` 조건으로 판단해야 함
2. money_flows 테이블의 type 필드 값(0: 입금, 1: 출금)의 정확한 구분 필요
3. 사용자 ID를 활용한 조인 시 players.id와 players.userId 구분 필요
   - promotion_players, money_flows에는 players.id를 사용
   - game_scores에는 players.userId를 사용