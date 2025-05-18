# Hermes 데이터베이스 변수 설명

이 문서는 Hermes 데이터베이스의 주요 변수들과 그 의미를 설명합니다. 필요에 따라 이 문서를 수정하고 확장해 나갈 수 있습니다.

## 금융 거래 관련 변수

### money_flows 테이블

| 변수명 | 값 | 설명 |
|--------|-----|------|
| type | 0 | 입금 (Deposit) |
| type | 1 | 출금 (Withdrawal) |
| type | 3 | 이체수수료 |

## 사용자 관련 변수

### users 테이블

| 변수명 | 값 | 설명 |
|--------|-----|------|
| state | 0 | 활성 상태 |
| state | 4 | 비활성 상태 (추정) |
| role | ? | 각 숫자별 역할 정의 필요 |

## 플레이어 관련 변수

### players 테이블

| 변수명 | 값 | 설명 |
|--------|-----|------|
| status | 0 | 활성 상태 (추정) |
| status | 1 | 제한된 상태 (추정) |
| status | 8 | 특별 관리 상태 (추정) |
| adjustType | ? | 조정 유형 정의 필요 |
| flowFeatures | ? | 자금 흐름 특성 정의 필요 |

## 마케팅 관련 변수

### promotions 테이블
 
이벤트와 프로모션은 동일한 개념으로 사용됩니다. 시스템 내에서 모든 마케팅 이벤트는 프로모션으로 처리됩니다.

| 변수명 | 값 | 설명 |
|--------|-----|------|
| event | - | 프로모션과 동일한 의미로 사용됨 |
| promotion | - | 마케팅 이벤트나 특별 혜택을 의미함 |
| reward | decimal | 프로모션에 대한 보상 금액 |
| rewardType | 1 | 보상 유형 (정확한 의미 확인 필요) |

### promotion_players 테이블

이 테이블은 각 프로모션(이벤트)에 참여하는 플레이어 정보를 관리합니다.

| 변수명 | 값 | 설명 |
|--------|-----|------|
| promotion | char(32) | 프로모션 ID (외래 키) |
| player | int | 플레이어 ID (외래 키) |
| reward | decimal(8,2) | 이벤트에서 사용자에게 지급하기로 설정된 금액. 모든 이벤트 대상자의 reward 값은 항상 0보다 큼 |
| status | tinyint | 프로모션 참여 상태 (0: 진행 중, 1: 완료 등) |
| appliedAt | timestamp | 실제 이벤트 금액이 사용자에게 지급된 시점. NULL이면 이벤트 지급이 아직 이루어지지 않음, 값이 있으면 실제 지급이 완료됨 |

## 쿼리 작성 시 중요 고려사항

### promotion_players 테이블 활용

1. **이벤트 대상자 식별**
   - 모든 이벤트 대상자(지급 여부 관계없이): `reward > 0`
   - 실제 이벤트 지급이 완료된 사용자만: `appliedAt IS NOT NULL`

2. **이벤트 지급 시점 기준 데이터 분석**
   - 첫 이벤트 지급 시점: `MIN(appliedAt)`
   - 이벤트 지급 후 입금/배팅 등 활동 분석: `createdAt > (SELECT MIN(appliedAt) FROM promotion_players WHERE player = X)`

3. **이벤트 분석 쿼리 예시**
```sql
-- 실제 이벤트가 지급된 사용자 찾기
SELECT player, COUNT(*) as promotion_count 
FROM promotion_players 
WHERE appliedAt IS NOT NULL 
GROUP BY player;

-- 각 사용자의 첫 이벤트 지급 날짜 찾기
SELECT player, MIN(appliedAt) as first_promotion_date
FROM promotion_players
WHERE appliedAt IS NOT NULL
GROUP BY player;

-- 이벤트 지급 후 입금 기록이 있는 사용자 찾기
SELECT
    pl.userId,
    pl.id,
    (SELECT COUNT(*) FROM promotion_players pp WHERE pp.player = pl.id AND pp.appliedAt IS NOT NULL) AS promotion_count,
    (SELECT MIN(pp2.appliedAt) FROM promotion_players pp2 WHERE pp2.player = pl.id AND pp2.appliedAt IS NOT NULL) AS first_promotion_date,
    SUM(CASE WHEN mf.createdAt > (SELECT MIN(pp3.appliedAt) FROM promotion_players pp3 WHERE pp3.player = pl.id AND pp3.appliedAt IS NOT NULL) THEN mf.amount ELSE 0 END) AS deposit_after_promotion
FROM players pl
JOIN money_flows mf ON pl.id = mf.player
WHERE pl.id IN (SELECT player FROM promotion_players WHERE appliedAt IS NOT NULL)
AND mf.type = 0 -- 입금
GROUP BY pl.userId, pl.id
HAVING deposit_after_promotion > 0;
```

## 분석 결과 참고 사항

### 이벤트 지급 금액 분석 (2025-05-17)

- 이벤트 지급 금액은 `promotion_players` 테이블의 `reward` 필드에서 확인할 수 있습니다.
- 이벤트 지급 금액은 소수점 이하 없이 정수로 표시합니다.

#### 질의 1: 이벤트 지급 분석 (입금 없이 배팅한 프로모션 수혜자)
- 분석 대상 6명 사용자의 총 이벤트 지급 금액은 4,664원입니다.
- 최대 단일 이벤트 지급 금액은 555원입니다.
- **주의**: 이 분석에서는 `reward > 0` 조건을 사용했으나, 더 정확한 분석을 위해서는 `appliedAt IS NOT NULL` 조건을 사용하는 것이 권장됩니다.

#### 질의 2: 장기 미접속 & 이벤트 후 입금 사용자 분석
- 총 이벤트 지급 횟수는 428회입니다.
- 가장 많은 이벤트를 받은 사용자는 "ug3802"로 8회입니다.
- 가장 큰 단일 이벤트 지급 금액은 "hh3803"에게 지급된 3,330원입니다.
- 이벤트 후 가장 많은 입금액을 기록한 사용자는 "jiaw189"로 764,000원입니다.
- 총 128명의 사용자가 분석 조건을 충족합니다.

### 기존 쿼리 분석 및 개선 사항 (2025-05-17)

기존 쿼리 중 일부는 `reward > 0` 조건을 사용하여 이벤트 지급 여부를 판단했지만, 더 정확한 분석을 위해서는 `appliedAt IS NOT NULL` 조건을 사용해야 합니다.

- **event_payment_analysis.sql**: 이 쿼리는 `reward > 0` 조건을 사용했으므로, 실제 지급되지 않은 이벤트도 포함할 수 있습니다.

- **inactive_event_deposit_analysis.sql**: 이 쿼리는 첫 이벤트 지급 시점을 `MIN(pp2.appliedAt)`로 계산하므로, 실제 지급된 이벤트만 고려되어 결과에 큰 영향은 없을 것으로 판단됩니다.

앞으로의 분석 쿼리에서는 이벤트 지급 여부를 정확히 판단하기 위해 `appliedAt IS NOT NULL` 조건을 사용하도록 합니다.

---

**참고사항**:
- 이 문서는 데이터베이스 구조 분석을 기반으로 생성되었습니다.
- 변수의 실제 의미는 추정된 것이며, 시스템 사용 과정에서 확인 및 수정이 필요할 수 있습니다.
- 새로운 변수 정보가 확인되면 이 문서에 추가해 주세요.