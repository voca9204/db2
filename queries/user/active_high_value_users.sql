-- 7일 이상 게임 기록이 있고 전체 유효배팅의 합이 50,000 이상인 사용자 ID 조회
SELECT 
    pl.id AS player_id, 
    pl.userId AS username,
    COUNT(DISTINCT gs.gameDate) AS distinct_play_days,
    SUM(gs.netBet) AS total_valid_betting
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
ORDER BY 
    total_valid_betting DESC;