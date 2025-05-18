-- 장기 미접속 & 이벤트 후 입금 사용자 쿼리
-- 생성일: 2025년 5월 17일
-- 설명: 10일 이상 게임을 하지 않은 사용자 중 이벤트 지급을 받은 후 입금 기록이 있는 사용자를 찾는 쿼리

-- 분석 단계별 쿼리

-- 1. 10일 이상 게임을 하지 않은 사용자 찾기
SELECT 
    id,
    userId,
    lastPlayDate
FROM players
WHERE lastPlayDate IS NOT NULL 
AND lastPlayDate < DATE_SUB(CURRENT_DATE(), INTERVAL 10 DAY);

-- 2. 이벤트를 받은 사용자 찾기
SELECT 
    p.player, 
    pl.userId, 
    MIN(p.appliedAt) AS first_promotion_date,
    COUNT(p.promotion) AS promotion_count
FROM promotion_players p
JOIN players pl ON p.player = pl.id
WHERE p.appliedAt IS NOT NULL
GROUP BY p.player, pl.userId;

-- 3. 이벤트 이후 입금 기록이 있는 사용자 찾기
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
    pl.id,
    pl.userId,
    fp.first_promotion_date,
    COUNT(DISTINCT pp.promotion) AS promotion_count,
    SUM(CASE WHEN mf.createdAt > fp.first_promotion_date THEN mf.amount ELSE 0 END) AS deposit_after_promotion,
    pl.lastPlayDate
FROM 
    players pl
JOIN 
    FirstPromotion fp ON pl.id = fp.player
JOIN 
    promotion_players pp ON pl.id = pp.player
JOIN 
    money_flows mf ON pl.id = mf.player
WHERE 
    pl.lastPlayDate < DATE_SUB(CURRENT_DATE(), INTERVAL 10 DAY)
    AND mf.type = 0 -- 입금
GROUP BY 
    pl.id, pl.userId, fp.first_promotion_date, pl.lastPlayDate
HAVING 
    deposit_after_promotion > 0
ORDER BY 
    pl.lastPlayDate DESC;

-- 4. 최종 쿼리: 모든 조건을 만족하는 사용자 찾기
WITH FirstPromotion AS (
    -- 각 사용자의 첫 이벤트 지급 날짜
    SELECT 
        player,
        MIN(appliedAt) as first_promotion_date
    FROM 
        promotion_players
    WHERE 
        appliedAt IS NOT NULL
    GROUP BY 
        player
),
InactiveUsers AS (
    -- 10일 이상 게임을 하지 않은 사용자
    SELECT 
        id,
        userId,
        lastPlayDate
    FROM 
        players
    WHERE 
        lastPlayDate IS NOT NULL 
        AND lastPlayDate < DATE_SUB(CURRENT_DATE(), INTERVAL 10 DAY)
),
EventUsers AS (
    -- 이벤트를 받은 사용자
    SELECT 
        p.player, 
        COUNT(p.promotion) AS promotion_count,
        SUM(p.reward) AS total_reward,
        GROUP_CONCAT(p.reward ORDER BY p.appliedAt SEPARATOR ',') AS reward_list
    FROM 
        promotion_players p
    WHERE 
        p.appliedAt IS NOT NULL
    GROUP BY 
        p.player
),
DepositsAfterEvent AS (
    -- 이벤트 이후 입금 기록이 있는 사용자
    SELECT
        mf.player,
        SUM(mf.amount) AS deposit_amount_after_event,
        COUNT(*) AS deposit_count_after_event
    FROM 
        money_flows mf
    JOIN 
        FirstPromotion fp ON mf.player = fp.player
    WHERE 
        mf.type = 0 -- 입금
        AND mf.createdAt > fp.first_promotion_date
    GROUP BY 
        mf.player
)
-- 최종 결과
SELECT
    iu.userId AS user_id,
    p.name AS user_name,
    eu.promotion_count AS event_count,
    eu.total_reward AS total_event_reward,
    eu.reward_list AS event_reward_list,
    dae.deposit_amount_after_event,
    dae.deposit_count_after_event,
    fp.first_promotion_date,
    iu.lastPlayDate AS last_play_date,
    DATEDIFF(CURRENT_DATE(), iu.lastPlayDate) AS days_inactive
FROM 
    InactiveUsers iu
JOIN 
    players p ON iu.id = p.id
JOIN 
    EventUsers eu ON iu.id = eu.player
JOIN 
    FirstPromotion fp ON iu.id = fp.player
JOIN 
    DepositsAfterEvent dae ON iu.id = dae.player
ORDER BY 
    iu.lastPlayDate DESC;