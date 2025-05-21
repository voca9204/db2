const mariadb = require('mariadb');

// BigInt를 문자열로 변환하는 함수
function formatResults(results) {
  return results.map(row => {
    const formattedRow = {};
    for (const key in row) {
      // BigInt 타입이면 문자열로 변환
      if (typeof row[key] === 'bigint') {
        formattedRow[key] = row[key].toString();
      } else {
        formattedRow[key] = row[key];
      }
    }
    return formattedRow;
  });
}

async function main() {
  let conn;
  try {
    conn = await mariadb.createConnection({
      host: '211.248.190.46',
      user: 'hermes',
      password: 'mcygicng!022',
      database: 'hermes'
    });
    
    // 높은 netBet 값을 가진 사용자들을 조회하는 쿼리
    const query = `
      SELECT 
        p.userId,
        COUNT(*) as loginCount,
        MAX(gs.gameDate) as lastActivity,
        DATEDIFF(CURRENT_DATE, MAX(gs.gameDate)) as inactiveDays,
        ROUND(SUM(gs.netBet)) as netBet
      FROM players p
      JOIN game_scores gs ON p.id = gs.userId
      GROUP BY p.userId
      HAVING SUM(gs.netBet) >= 40000
      ORDER BY netBet DESC
      LIMIT 5
    `;
    
    const results = await conn.query(query);
    const formattedResults = formatResults(results);
    
    console.log('높은 netBet 값을 가진 상위 사용자:');
    console.log(JSON.stringify(formattedResults, null, 2));
    
    // netBet 값 통계 조회
    const statsQuery = `
      SELECT 
        MIN(total_net_bet) as min_net_bet,
        MAX(total_net_bet) as max_net_bet,
        AVG(total_net_bet) as avg_net_bet,
        COUNT(*) as total_users
      FROM (
        SELECT 
          p.userId,
          ROUND(SUM(gs.netBet)) as total_net_bet
        FROM players p
        JOIN game_scores gs ON p.id = gs.userId
        GROUP BY p.userId
      ) as user_bets
    `;
    
    const stats = await conn.query(statsQuery);
    const formattedStats = formatResults(stats);
    
    console.log('\n베팅 금액 통계:');
    console.log(JSON.stringify(formattedStats, null, 2));
    
    // 정확히 minNetBet=50000인 조건을 테스트
    const testQuery = `
      SELECT 
        p.userId,
        COUNT(*) as loginCount,
        MAX(gs.gameDate) as lastActivity,
        DATEDIFF(CURRENT_DATE, MAX(gs.gameDate)) as inactiveDays,
        ROUND(SUM(gs.netBet)) as netBet
      FROM players p
      JOIN game_scores gs ON p.id = gs.userId
      GROUP BY p.userId
      HAVING SUM(gs.netBet) >= 50000
      ORDER BY netBet DESC
      LIMIT 5
    `;
    
    const testResults = await conn.query(testQuery);
    const formattedTestResults = formatResults(testResults);
    
    console.log('\nminNetBet=50000 조건 테스트:');
    console.log(JSON.stringify(formattedTestResults, null, 2));
    
  } catch (err) {
    console.error('Error executing query:', err);
  } finally {
    if (conn) conn.close();
  }
}

main();
