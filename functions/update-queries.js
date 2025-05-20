const mysql = require('mysql2/promise');

async function updateQueries() {
  try {
    // 파일 읽기
    const fs = require('fs');
    const path = '/users/sinclair/projects/db2/functions/index.js';
    let content = fs.readFileSync(path, 'utf8');
    
    // activeUsers 쿼리 수정
    const activeUsersRegex = /\/\/ 단순화된 쿼리 \(필수 조건만 유지\)[\s\S]*?JOIN game_scores gs ON p\.id = gs\.userId[\s\S]*?GROUP BY p\.userId[\s\S]*?HAVING SUM\(gs\.netBet\) >= \?[\s\S]*?LIMIT \?[\s\S]*?`;\s*(?=\s*console\.log\('쿼리 실행 중'\))/g;
    
    content = content.replace(activeUsersRegex, `// 기간 조건을 확장한 쿼리 (900일 이내 활동)
    const query = \`
      SELECT 
        p.userId,
        COUNT(*) as loginCount,
        MAX(gs.gameDate) as lastActivity,
        DATEDIFF(CURRENT_DATE, MAX(gs.gameDate)) as inactiveDays,
        ROUND(SUM(gs.netBet)) as netBet
      FROM players p
      JOIN game_scores gs ON p.id = gs.userId
      GROUP BY p.userId
      HAVING SUM(gs.netBet) >= ?
      AND DATEDIFF(CURRENT_DATE, MAX(gs.gameDate)) < 900
      ORDER BY lastActivity DESC
      LIMIT ?
    \`;
    `);
    
    // dormantUsers 쿼리 수정
    const dormantUsersRegex = /\/\/ 단순화된 쿼리 \(필수 조건만 유지\)[\s\S]*?JOIN game_scores gs ON p\.id = gs\.userId[\s\S]*?GROUP BY p\.userId[\s\S]*?HAVING SUM\(gs\.netBet\) >= \?[\s\S]*?LIMIT \?[\s\S]*?`;\s*(?=\s*console\.log\('쿼리 실행 중'\))/g;
    
    content = content.replace(dormantUsersRegex, `// 비활성 사용자 조건 (30일 이상 비활성)
    const query = \`
      SELECT 
        p.userId,
        COUNT(*) as loginCount,
        MAX(gs.gameDate) as lastActivity,
        DATEDIFF(CURRENT_DATE, MAX(gs.gameDate)) as inactiveDays,
        ROUND(SUM(gs.netBet)) as netBet
      FROM players p
      JOIN game_scores gs ON p.id = gs.userId
      GROUP BY p.userId
      HAVING SUM(gs.netBet) >= ?
      AND DATEDIFF(CURRENT_DATE, MAX(gs.gameDate)) >= 30
      ORDER BY inactiveDays DESC
      LIMIT ?
    \`;
    `);
    
    // 파일 저장
    fs.writeFileSync(path, content, 'utf8');
    console.log('쿼리가 성공적으로 수정되었습니다.');
    
    // dormantUsers에서 매개변수를 업데이트
    content = fs.readFileSync(path, 'utf8');
    content = content.replace(/const \[rows, fields\] = await connection\.query\(query, \[minNetBet, limit\]\);/g, `const [rows, fields] = await connection.query(query, [minNetBet, limit]);`);
    
    // 파일 저장
    fs.writeFileSync(path, content, 'utf8');
    console.log('매개변수 설정이 업데이트되었습니다.');
    
    console.log('파일 업데이트 완료');
  } catch (error) {
    console.error('오류 발생:', error);
  }
}

updateQueries();
