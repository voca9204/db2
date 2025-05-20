-- 고가치 사용자 중 휴면 상태인 사용자 식별 (최근 30일 이내 활동 없음)
WITH high_value_users AS (
    SELECT 
        pl.id AS player_id, 
        pl.userId AS username,
        COUNT(DISTINCT gs.gameDate) AS distinct_play_days,
        SUM(gs.netBet) AS total_valid_betting,
        MAX(gs.gameDate) AS last_play_date
    FROM 
        players pl
    JOIN 
        game_scores gs ON pl.userId = gs.userId
    WHERE 
        gs.netBet > 0
    GROUP BY 
        pl.id, pl.userId
    HAVING 
        COUNT(DISTINCT gs.gameDate) >= 7
        AND SUM(gs.netBet) >= 50000
)
SELECT 
    hvu.player_id,
    hvu.username,
    hvu.distinct_play_days,
    hvu.total_valid_betting,
    hvu.last_play_date,
    DATEDIFF(CURRENT_DATE, hvu.last_play_date) AS days_since_last_play
FROM 
    high_value_users hvu
WHERE 
    DATEDIFF(CURRENT_DATE, hvu.last_play_date) > 30
ORDER BY 
    total_valid_betting DESC;