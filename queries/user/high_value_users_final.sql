-- 7일 이상 게임 기록이 있고 전체 유효배팅의 합이 50,000 이상인 사용자의 유저명(userId) 조회
-- ID와 실제 이름은 결과에 표시하지 않음
-- 모든 금액은 소수점 이하를 반올림하여 정수로 표시
SELECT 
    pl.userId AS username,
    COUNT(DISTINCT gs.gameDate) AS distinct_play_days,
    ROUND(SUM(gs.netBet)) AS total_valid_betting,
    MAX(gs.gameDate) AS last_play_date,
    DATEDIFF(CURRENT_DATE, MAX(gs.gameDate)) AS days_since_last_play
FROM 
    players pl
JOIN 
    game_scores gs ON pl.userId = gs.userId
WHERE 
    gs.netBet > 0
GROUP BY 
    pl.userId
HAVING 
    COUNT(DISTINCT gs.gameDate) >= 7
    AND SUM(gs.netBet) >= 50000
ORDER BY 
    total_valid_betting DESC;
