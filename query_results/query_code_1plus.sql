-- 이벤트 지급 분석 SQL 쿼리 (1회 이상)
-- 생성일: 2025년 5월 17일

-- 1. 이벤트 지급을 1회 이상 받은 사용자 찾기
SELECT player, COUNT(*) as promotion_count 
FROM promotion_players 
WHERE appliedAt IS NOT NULL -- 실제 지급된 이벤트만 포함
GROUP BY player;

-- 2. 각 사용자의 첫 이벤트 지급 날짜 찾기
SELECT player, MIN(appliedAt) as first_promotion_date
FROM promotion_players
WHERE appliedAt IS NOT NULL -- 실제 지급된 이벤트만 포함
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
    gs.userId
HAVING
    valid_bet_after_promo > 0;

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
    WHERE appliedAt IS NOT NULL -- 실제 지급된 이벤트만 포함
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
-- 1. 이벤트 지급을 1회 이상 받음
-- 2. 첫 이벤트 지급 이후 유효 배팅이 있음
-- 3. 첫 이벤트 지급 이후 입금 기록이 없음

-- 최종 통합 쿼리
SELECT
    p.userId AS '사용자_ID',
    COUNT(pp.id) AS '이벤트_지급_횟수',
    SUM(gs.netBet) AS '이벤트_지급_이후_유효_배팅',
    MAX(gs.gameDate) AS '마지막_접속일',
    GROUP_CONCAT(pp.reward ORDER BY pp.appliedAt DESC SEPARATOR ', ') AS '이벤트_금액'
FROM
    players p
JOIN
    promotion_players pp ON p.id = pp.player
JOIN
    game_scores gs ON p.userId = gs.userId
LEFT JOIN
    money_flows mf ON p.id = mf.player AND mf.type = 0 AND mf.createdAt > (
        SELECT MIN(pp2.appliedAt)
        FROM promotion_players pp2
        WHERE pp2.player = p.id AND pp2.appliedAt IS NOT NULL
    )
WHERE
    pp.appliedAt IS NOT NULL -- 실제 지급된 이벤트만 포함
    AND gs.gameDate > (
        SELECT MIN(pp3.appliedAt)
        FROM promotion_players pp3
        WHERE pp3.player = p.id AND pp3.appliedAt IS NOT NULL
    )
    AND mf.id IS NULL -- 이벤트 지급 이후 입금 기록이 없음
GROUP BY
    p.userId
ORDER BY
    MAX(gs.gameDate) DESC;
