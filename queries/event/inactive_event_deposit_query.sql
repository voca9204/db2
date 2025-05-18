-- 장기 미접속 & 이벤트 후 입금 사용자 쿼리
-- 생성일: 2025년 5월 17일

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
GROUP BY p.player, pl.userId;

-- 3. 이벤트 이후 입금 기록이 있는 사용자 찾기
SELECT
    pl.userId,
    pl.id,
    (SELECT COUNT(*) FROM promotion_players pp WHERE pp.player = pl.id) AS promotion_count,
    (SELECT MIN(pp2.appliedAt) FROM promotion_players pp2 WHERE pp2.player = pl.id) AS first_promotion_date,
    SUM(CASE WHEN mf.createdAt > (SELECT MIN(pp3.appliedAt) FROM promotion_players pp3 WHERE pp3.player = pl.id) THEN mf.amount ELSE 0 END) AS deposit_after_promotion,
    pl.lastPlayDate
FROM players pl
JOIN money_flows mf ON pl.id = mf.player
WHERE pl.lastPlayDate < DATE_SUB(CURRENT_DATE(), INTERVAL 10 DAY)
AND pl.id IN (SELECT player FROM promotion_players)
AND mf.type = 0 -- 입금
GROUP BY pl.userId, pl.id, pl.lastPlayDate
HAVING deposit_after_promotion > 0
ORDER BY pl.lastPlayDate DESC;

-- 4. 사용자별 이벤트 지급 금액 목록 조회
SELECT
    pl.userId,
    GROUP_CONCAT(pp.reward ORDER BY pp.appliedAt SEPARATOR ',') AS reward_list
FROM players pl
JOIN promotion_players pp ON pl.id = pp.player
WHERE pl.lastPlayDate < DATE_SUB(CURRENT_DATE(), INTERVAL 10 DAY)
AND pl.id IN (SELECT player FROM promotion_players)
AND pl.id IN (
    SELECT DISTINCT player
    FROM money_flows
    WHERE type = 0
    AND createdAt > (
        SELECT MIN(pp2.appliedAt)
        FROM promotion_players pp2
        WHERE pp2.player = player
    )
)
GROUP BY pl.userId
ORDER BY pl.lastPlayDate DESC;

-- 5. 최종 쿼리: 모든 조건을 만족하는 사용자 찾기
-- 1. 금일(2025-05-17) 기준으로 10일 동안 게임을 하지 않은 사용자
-- 2. 이벤트 지급을 받은 후 입금 기록이 있는 사용자
SELECT
    pl.userId AS '사용자id',
    (SELECT COUNT(*) FROM promotion_players pp WHERE pp.player = pl.id) AS '이벤트 받은 횟수',
    (SELECT AVG(pp.reward) FROM promotion_players pp WHERE pp.player = pl.id) AS '이벤트 지급 평균금액',
    (SELECT GROUP_CONCAT(pp2.reward ORDER BY pp2.appliedAt SEPARATOR ',') FROM promotion_players pp2 WHERE pp2.player = pl.id) AS '이벤트 지급 금액 목록',
    SUM(CASE WHEN mf.createdAt > (SELECT MIN(pp3.appliedAt) FROM promotion_players pp3 WHERE pp3.player = pl.id) THEN mf.amount ELSE 0 END) AS '이벤트 받은 이후 입금액 합',
    pl.lastPlayDate AS '마지막 게임날짜'
FROM players pl
JOIN money_flows mf ON pl.id = mf.player
WHERE pl.lastPlayDate < DATE_SUB(CURRENT_DATE(), INTERVAL 10 DAY)
AND pl.id IN (SELECT player FROM promotion_players)
AND mf.type = 0 -- 입금
GROUP BY pl.userId, pl.id, pl.lastPlayDate
HAVING `이벤트 받은 이후 입금액 합` > 0
ORDER BY pl.lastPlayDate DESC;

-- 6. 전체 평균 이벤트 지급 금액 확인
SELECT
    AVG(avg_reward) AS overall_avg_event_reward
FROM (
    SELECT
        pl.userId,
        AVG(pp.reward) AS avg_reward
    FROM players pl
    JOIN promotion_players pp ON pl.id = pp.player
    WHERE pl.lastPlayDate < DATE_SUB(CURRENT_DATE(), INTERVAL 10 DAY)
    AND pl.id IN (SELECT DISTINCT player FROM promotion_players)
    AND pl.id IN (
        SELECT DISTINCT player
        FROM money_flows
        WHERE type = 0
        AND createdAt > (
            SELECT MIN(pp2.appliedAt)
            FROM promotion_players pp2
            WHERE pp2.player = player
        )
    )
    GROUP BY pl.userId, pl.id
) AS user_avg_rewards;