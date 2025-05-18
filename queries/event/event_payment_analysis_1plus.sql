-- 이벤트 지급 분석 SQL 쿼리 (1회 이상)
-- 생성일: 2025년 5월 17일
-- 설명: 이벤트 지급을 1회 이상 받고, 첫 이벤트 지급 이후 유효 배팅이 있으며, 입금 기록이 없는 사용자를 찾는 쿼리

-- 최종 쿼리: 모든 조건을 만족하는 사용자 찾기
WITH FirstPromotion AS (
    -- 각 사용자의 첫 이벤트 지급 날짜
    SELECT 
        pp.player,
        p.userId,
        MIN(pp.appliedAt) AS first_promotion_date,
        COUNT(DISTINCT pp.promotion) as event_count,
        SUM(pp.reward) as total_reward_amount
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
    -- 첫 이벤트 지급 이후 유효 배팅이 있는 사용자
    SELECT 
        fp.player,
        fp.userId,
        fp.first_promotion_date,
        fp.event_count,
        fp.total_reward_amount,
        SUM(gs.netBet) AS valid_bet_after_promo,
        COUNT(*) as bet_count_after_promo
    FROM 
        FirstPromotion fp
    JOIN 
        game_scores gs ON fp.userId = gs.userId
    WHERE 
        gs.gameDate > DATE(fp.first_promotion_date)
    GROUP BY 
        fp.player, fp.userId, fp.first_promotion_date, fp.event_count, fp.total_reward_amount
    HAVING 
        valid_bet_after_promo > 0
),
Deposits AS (
    -- 첫 이벤트 지급 이후 입금 기록이 있는 사용자
    SELECT 
        fp.player, 
        fp.first_promotion_date, 
        COUNT(mf.id) as deposit_count_after_promo,
        SUM(CASE WHEN mf.id IS NOT NULL THEN mf.amount ELSE 0 END) as deposit_amount_after_promo
    FROM 
        FirstPromotion fp
    LEFT JOIN 
        money_flows mf ON fp.player = mf.player AND mf.type = 0 AND mf.createdAt > fp.first_promotion_date
    GROUP BY 
        fp.player, fp.first_promotion_date
)
-- 최종 결과
SELECT 
    vb.player AS player_id,
    p.userId,
    p.name,
    vb.event_count,
    vb.first_promotion_date,
    vb.valid_bet_after_promo,
    vb.bet_count_after_promo,
    d.deposit_count_after_promo,
    d.deposit_amount_after_promo,
    vb.total_reward_amount,
    p.lastPlayDate
FROM 
    ValidBets vb
JOIN 
    Deposits d ON vb.player = d.player
JOIN 
    players p ON vb.player = p.id
WHERE 
    d.deposit_count_after_promo = 0
ORDER BY 
    vb.valid_bet_after_promo DESC;