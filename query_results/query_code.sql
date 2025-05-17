-- 이벤트 지급 분석 SQL 쿼리
-- 생성일: 2025년 5월 17일

-- 1. 이벤트 지급을 2회 이상 받은 사용자 찾기
SELECT player, COUNT(*) as promotion_count 
FROM promotion_players 
WHERE reward > 0 
GROUP BY player 
HAVING COUNT(*) >= 2;

-- 2. 각 사용자의 첫 이벤트 지급 날짜 찾기
SELECT player, MIN(appliedAt) as first_promotion_date
FROM promotion_players
WHERE reward > 0
GROUP BY player;

-- 3. 첫 이벤트 지급 이후 유효 배팅이 있는 사용자 찾기
SELECT 
    gs.userId,
    SUM(gs.netBet) AS valid_bet_after_promo,
    MIN(gs.gameDate) AS first_bet_after
FROM 
    game_scores gs
JOIN 
    players p ON gs.userId = p.userId
WHERE 
    gs.gameDate > '첫_이벤트_지급_날짜'
GROUP BY 
    gs.userId;

-- 4. 첫 이벤트 지급 이후 입금 기록이 있는 사용자 찾기
SELECT 
    mf.player, 
    MIN(pp.appliedAt) as first_promotion, 
    MIN(mf.createdAt) as first_deposit_after_promo
FROM 
    money_flows mf
JOIN 
    promotion_players pp ON mf.player = pp.player
JOIN (
    SELECT player, MIN(appliedAt) as min_date
    FROM promotion_players
    WHERE reward > 0
    GROUP BY player
) min_promo ON pp.player = min_promo.player AND min_promo.min_date = pp.appliedAt
WHERE 
    mf.type = 0 -- 입금
    AND mf.createdAt > pp.appliedAt
GROUP BY 
    mf.player;

-- 5. 마지막 게임 날짜(마지막 접속일) 찾기
SELECT 
    gs.userId,
    MAX(gs.gameDate) AS last_play_date
FROM 
    game_scores gs
GROUP BY 
    gs.userId;

-- 최종 결과를 위한 모든 조건을 만족하는 사용자 찾기
-- 1. 이벤트 지급을 2회 이상 받음
-- 2. 첫 이벤트 지급 이후 유효 배팅이 있음
-- 3. 첫 이벤트 지급 이후 입금 기록이 없음
