/**
 * 데이터베이스 직접 접속 테스트 스크립트
 * 
 * 이 스크립트는 MariaDB/MySQL 데이터베이스에 접속하여 
 * 고가치 사용자 조회 쿼리를 실행합니다.
 */

const mariadb = require('mariadb');

// 데이터베이스 연결 설정
const dbConfig = {
  host: '211.248.190.46',
  user: 'hermes',
  password: 'mcygicng!022',
  database: 'hermes',
  connectionLimit: 5,
  connectTimeout: 10000
};

// BigInt를 위한 JSON 직렬화 처리 함수
function safeJsonStringify(obj) {
  return JSON.stringify(obj, (key, value) => {
    if (typeof value === 'bigint') {
      return value.toString();
    }
    return value;
  }, 2);
}

// 쿼리 실행 함수
async function executeQuery(query, params = []) {
  console.log(`쿼리 실행: ${query}`);
  console.log(`파라미터: ${JSON.stringify(params)}`);
  
  let conn;
  try {
    // 연결 생성
    conn = await mariadb.createConnection(dbConfig);
    console.log('데이터베이스 연결 성공');
    
    // 쿼리 실행
    const start = Date.now();
    const rows = await conn.query(query, params);
    const executionTime = Date.now() - start;
    
    console.log(`쿼리 실행 완료: ${executionTime}ms`);
    console.log(`결과 행 수: ${rows.length}`);
    
    // 결과의 일부만 출력 (너무 많은 데이터가 있을 경우)
    if (rows.length > 0) {
      console.log('첫 번째 결과:');
      console.log(safeJsonStringify(rows[0]));
      
      if (rows.length > 1) {
        console.log(`... 외 ${rows.length - 1}개 행`);
      }
    } else {
      console.log('결과가 없습니다.');
    }
    
    return rows;
  } catch (err) {
    console.error('데이터베이스 오류:', err);
    throw err;
  } finally {
    if (conn) {
      // 연결 종료
      try {
        await conn.end();
        console.log('데이터베이스 연결 종료');
      } catch (err) {
        console.error('연결 종료 오류:', err);
      }
    }
  }
}

// 고가치 활성 사용자 쿼리
async function queryActiveUsers(minNetBet = 1000, limit = 10) {
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
    HAVING SUM(gs.netBet) >= ?
    AND DATEDIFF(CURRENT_DATE, MAX(gs.gameDate)) < 900
    ORDER BY lastActivity DESC
    LIMIT ?
  `;
  
  return executeQuery(query, [minNetBet, limit]);
}

// 고가치 휴면 사용자 쿼리
async function queryDormantUsers(minNetBet = 1000, minInactiveDays = 30, limit = 10) {
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
    HAVING SUM(gs.netBet) >= ?
    AND DATEDIFF(CURRENT_DATE, MAX(gs.gameDate)) >= ?
    ORDER BY inactiveDays DESC
    LIMIT ?
  `;
  
  return executeQuery(query, [minNetBet, minInactiveDays, limit]);
}

// 테이블 목록 조회
async function listTables() {
  const query = "SHOW TABLES";
  return executeQuery(query);
}

// 스크립트 실행
async function main() {
  try {
    console.log('===== 테이블 목록 =====');
    await listTables();
    
    console.log('\n===== 고가치 활성 사용자 =====');
    await queryActiveUsers();
    
    console.log('\n===== 고가치 휴면 사용자 =====');
    await queryDormantUsers();
    
  } catch (err) {
    console.error('스크립트 실행 오류:', err);
  }
}

// 스크립트 시작
main().then(() => {
  console.log('스크립트 실행 완료');
}).catch(err => {
  console.error('스크립트 실행 중 예외 발생:', err);
  process.exit(1);
});
