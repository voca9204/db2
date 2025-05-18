# 테이블 관계 정의

마지막 업데이트: 2025-05-17

이 문서는 헤르메스 데이터베이스의 주요 테이블 간 관계를 설명합니다.

## 핵심 테이블 관계

```
players
  ↑
  |- promotion_players (player 필드로 연결)
  ↑
  |- money_flows (player 필드로 연결)
  ↑
  |- game_scores (userId 필드로 연결)
```

## 상세 관계 설명

### players와 promotion_players

```
players.id = promotion_players.player
```

이 관계는 플레이어와 해당 플레이어가 받은 프로모션(이벤트) 정보를 연결합니다. 한 플레이어는 여러 프로모션을 받을 수 있습니다 (1:N 관계).

### players와 money_flows

```
players.id = money_flows.player
```

이 관계는 플레이어와 해당 플레이어의 자금 흐름(입금, 출금) 정보를 연결합니다. 한 플레이어는 여러 자금 흐름 기록을 가질 수 있습니다 (1:N 관계).

### players와 game_scores

```
players.userId = game_scores.userId
```

이 관계는 플레이어와 해당 플레이어의 게임 참여 기록을 연결합니다. 한 플레이어는 여러 게임 참여 기록을 가질 수 있습니다 (1:N 관계).

**주의**: 이 관계는 다른 관계와 달리 `id` 필드가 아닌 `userId` 필드를 통해 연결됩니다.

## 조인 쿼리 예시

### players와 promotion_players 조인

```sql
SELECT 
    p.id, p.userId, p.name, pp.reward, pp.appliedAt
FROM 
    players p
JOIN 
    promotion_players pp ON p.id = pp.player
WHERE 
    pp.appliedAt IS NOT NULL;
```

### players와 money_flows 조인

```sql
SELECT 
    p.id, p.userId, p.name, mf.type, mf.amount, mf.createdAt
FROM 
    players p
JOIN 
    money_flows mf ON p.id = mf.player
WHERE 
    mf.type = 0  -- 입금만 조회
ORDER BY 
    mf.createdAt DESC;
```

### players와 game_scores 조인

```sql
SELECT 
    p.id, p.name, gs.gameDate, gs.totalBet, gs.netBet, gs.winLoss
FROM 
    players p
JOIN 
    game_scores gs ON p.userId = gs.userId
WHERE 
    gs.gameDate > '2025-01-01'
ORDER BY 
    gs.gameDate DESC;
```

## 복합 조인 쿼리 예시

다음은 플레이어, 이벤트 지급, 게임 참여를 모두 조인하는 복합 쿼리 예시입니다.

```sql
SELECT 
    p.id, p.userId, p.name, 
    pp.reward, pp.appliedAt,
    gs.gameDate, gs.netBet
FROM 
    players p
JOIN 
    promotion_players pp ON p.id = pp.player
JOIN 
    game_scores gs ON p.userId = gs.userId
WHERE 
    pp.appliedAt IS NOT NULL
    AND gs.gameDate > DATE(pp.appliedAt)
ORDER BY 
    p.id, gs.gameDate;
```

이 쿼리는 이벤트 지급을 받은 후 게임에 참여한 플레이어의 기록을 조회합니다.