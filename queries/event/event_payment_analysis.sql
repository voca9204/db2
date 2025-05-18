-- 이벤트 지급 분석 SQL 쿼리
-- 생성일: 2025년 5월 17일
-- 설명: 이벤트 지급을 2회 이상 받고, 첫 이벤트 지급 이후 유효 배팅이 있으며, 입금 기록이 없는 사용자를 찾는 쿼리

-- 1. 이벤트 지급을 2회 이상 받은 사용자 찾기
SELECT player, COUNT(*) as promotion_count 
FROM promotion_players 
WHERE appliedAt IS NOT NULL -- 실제 지급된 이벤트만 
GROUP BY player 
HAVING COUNT(*) >= 2;

-- 2. 각 사용자의 첫 이벤트 지급 날짜 찾기
SELECT player, MIN(appliedAt) as first_promotion_date
FROM promotion_players
WHERE appliedAt IS NOT NULL
GROUP BY player;

-- 3. 첫 이벤트 지급 이후 유효 배팅이 있는 사용자 찾기
WITH FirstPromotion AS (
    SELECT 
        pp.player,
        p.userId,
        MIN(pp.appliedAt) AS first_promotion_date
    FROM 
        promotion_players pp
    JOIN 
        players p ON pp.player = p.id
    WHERE 
        pp.appliedAt IS NOT NULL
    GROUP BY 
        pp.player, p.userId
)
SELECT 
    fp.player,
    fp.userId,
    fp.first_promotion_date,
    SUM(gs.netBet) AS valid_bet_after_promo
FROM 
    FirstPromotion fp
JOIN 
    game_scores gs ON fp.userId = gs.userId
WHERE 
    gs.gameDate > DATE(fp.first_promotion_date)
GROUP BY 
    fp.player, fp.userId, fp.first_promotion_date
HAVING 
    valid_bet_after_promo > 0;

-- 4. 첫 이벤트 지급 이후 입금 기록이 있는 사용자 찾기
WITH FirstPromotion AS (
    SELECT 
        player,
        MIN(appliedAt) as first_promotion_date
    FROM 
        promotion_players
    WHERE 
        appliedAt IS NOT NULL
    GROUP BY 
        player
)
SELECT 
    fp.player, 
    fp.first_promotion_date, 
    COUNT(mf.id) as deposit_count_after_promo
FROM 
    FirstPromotion fp
LEFT JOIN 
    money_flows mf ON fp.player = mf.player AND mf.type = 0 AND mf.createdAt > fp.first_promotion_date
GROUP BY 
    fp.player, fp.first_promotion_date;

-- 5. 최종 결과를 위한 모든 조건을 만족하는 사용자 찾기
WITH PromoCount AS (
    -- 1. 이벤트 지급을 2회 이상 받은 사용자
    SELECT 
        player, 
        COUNT(*) as promotion_count 
    FROM 
        promotion_players 
    WHERE 
        appliedAt IS NOT NULL
    GROUP BY 
        player 
    HAVING 
        COUNT(*) >= 2
),
FirstPromotion AS (
    -- 2. 각 사용자의 첫 이벤트 지급 날짜
    SELECT 
        pp.player,
        p.userId,
        MIN(pp.appliedAt) AS first_promotion_date
    FROM 
        promotion_players pp
    JOIN 
        players p ON pp.player = p.id
    WHERE 
        pp.appliedAt IS NOT NULL
    GROUP BY 
        pp.player, p.userId
),
ValidBets AS (
    -- 3. 첫 이벤트 지급 이후 유효 배팅이 있는 사용자
    SELECT 
        fp.player,
        fp.userId,
        fp.first_promotion_date,
        SUM(gs.netBet) AS valid_bet_after_promo
    FROM 
        FirstPromotion fp
    JOIN 
        game_scores gs ON fp.userId = gs.userId
    WHERE 
        gs.gameDate > DATE(fp.first_promotion_date)
    GROUP BY 
        fp.player, fp.userId, fp.first_promotion_date
    HAVING 
        valid_bet_after_promo > 0
),
Deposits AS (
    -- 4. 첫 이벤트 지급 이후 입금 기록이 있는 사용자
    SELECT 
        fp.player, 
        fp.first_promotion_date, 
        COUNT(mf.id) as deposit_count_after_promo
    FROM 
        FirstPromotion fp
    LEFT JOIN 
        money_flows mf ON fp.player = mf.player AND mf.type = 0 AND mf.createdAt > fp.first_promotion_date
    GROUP BY 
        fp.player, fp.first_promotion_date
),
LastPlay AS (
    -- 5. 마지막 게임 날짜(마지막 접속일) 찾기
    SELECT 
        p.id AS player_id,
        p.userId,
        MAX(gs.gameDate) AS last_play_date
    FROM 
        players p
    JOIN 
        game_scores gs ON p.userId = gs.userId
    GROUP BY 
        p.id, p.userId
)
-- 최종 결과
SELECT 
    vb.player AS player_id,
    p.userId,
    p.name,
    pc.promotion_count,
    vb.first_promotion_date,
    vb.valid_bet_after_promo,
    d.deposit_count_after_promo,
    lp.last_play_date
FROM 
    ValidBets vb
JOIN 
    PromoCount pc ON vb.player = pc.player
JOIN 
    Deposits d ON vb.player = d.player
JOIN 
    LastPlay lp ON vb.player = lp.player_id
JOIN 
    players p ON vb.player = p.id
WHERE 
    d.deposit_count_after_promo = 0
ORDER BY 
    vb.valid_bet_after_promo DESC;