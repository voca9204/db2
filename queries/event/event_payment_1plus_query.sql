-- 이벤트 지급 1회 이상, 지급 이후 유효 배팅 있음, 지급 이후 입금 없음 분석 쿼리
SELECT 
    pp.player,
    p.userId,
    p.name,
    MIN(pp.appliedAt) as first_payment_date,
    COUNT(DISTINCT pp.promotion) as event_count,
    (SELECT COUNT(*) FROM game_scores gs WHERE gs.userId = p.userId AND gs.gameDate >= DATE(MIN(pp.appliedAt)) AND gs.netBet > 0) as valid_bet_count,
    (SELECT SUM(netBet) FROM game_scores gs WHERE gs.userId = p.userId AND gs.gameDate >= DATE(MIN(pp.appliedAt))) as valid_bet_amount,
    (SELECT COUNT(*) FROM money_flows mf WHERE mf.player = pp.player AND mf.type = 0 AND mf.createdAt > MIN(pp.appliedAt)) as deposit_count,
    p.lastPlayDate as last_play_date,
    SUM(pp.reward) as total_reward_amount,
    MAX(pp.appliedAt) as last_payment_date
FROM 
    promotion_players pp
JOIN 
    players p ON pp.player = p.id
WHERE 
    pp.appliedAt IS NOT NULL
GROUP BY 
    pp.player, p.userId, p.name, p.lastPlayDate
HAVING 
    valid_bet_count > 0 AND deposit_count = 0
ORDER BY 
    valid_bet_amount DESC;