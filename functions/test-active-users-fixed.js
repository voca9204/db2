/**
 * 활성 고가치 사용자 API 직접 테스트 스크립트 - 수정된 JOIN 조건 적용
 */

// 모듈 임포트
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

// 활성 고가치 사용자 쿼리 테스트
async function testActiveUsersQuery(minNetBet = 1000, limit = 10) {
  console.log(`활성 고가치 사용자 쿼리 테스트 (minNetBet=${minNetBet}, limit=${limit})`);

  let conn;
  try {
    // 연결 생성
    console.log('데이터베이스 연결 시도...');
    conn = await mariadb.createConnection(dbConfig);
    console.log('데이터베이스 연결 성공');
    
    // 수정된 쿼리 - 올바른 JOIN 조건 적용 (p.userId = gs.userId)
    const query = `
      SELECT 
        p.userId,
        COUNT(*) as loginCount,
        MAX(gs.gameDate) as lastActivity,
        DATEDIFF(CURRENT_DATE, MAX(gs.gameDate)) as inactiveDays,
        ROUND(SUM(gs.netBet)) as netBet
      FROM players p
      JOIN game_scores gs ON p.userId = gs.userId  /* 수정된 JOIN 조건 */
      GROUP BY p.userId
      HAVING SUM(gs.netBet) >= ?
      AND DATEDIFF(CURRENT_DATE, MAX(gs.gameDate)) < 900
      ORDER BY lastActivity DESC
      LIMIT ?
    `;
    
    console.log('쿼리 실행 중...');
    console.log('SQL:', query);
    console.log('Parameters:', [minNetBet, limit]);
    
    const start = Date.now();
    const results = await conn.query(query, [minNetBet, limit]);
    const executionTime = Date.now() - start;
    
    console.log(`쿼리 실행 완료: ${executionTime}ms`);
    console.log(`결과 ${results.length}개 행 반환됨`);
    
    // 결과 내용 확인을 위한 상세 로깅
    if (results.length > 0) {
      console.log(`첫 ${Math.min(5, results.length)}개 결과:`);
      for (let i = 0; i < Math.min(5, results.length); i++) {
        console.log(`[${i+1}] ${safeJsonStringify(results[i])}`);
      }
      
      if (results.length > 5) {
        console.log(`... 외 ${results.length - 5}개 행`);
      }
    } else {
      console.log('결과가 없습니다.');
    }
    
    // 총 레코드 수 확인 (제한 없이)
    const countQuery = `
      SELECT 
        COUNT(*) as totalCount
      FROM (
        SELECT 
          p.userId,
          SUM(gs.netBet) as totalNetBet
        FROM players p
        JOIN game_scores gs ON p.userId = gs.userId  /* 수정된 JOIN 조건 */
        GROUP BY p.userId
        HAVING SUM(gs.netBet) >= ?
        AND DATEDIFF(CURRENT_DATE, MAX(gs.gameDate)) < 900
      ) as subquery
    `;
    
    console.log('\n총 레코드 수 확인 중...');
    const [countResult] = await conn.query(countQuery, [minNetBet]);
    console.log(`총 레코드 수: ${countResult?.totalCount || 0}개`);
    
    // 모의 API 응답 형식
    const apiResponse = {
      success: true,
      message: "Active high-value users retrieved from database",
      params: {
        minNetBet,
        limit
      },
      data: results,
      count: results.length,
      totalCount: countResult?.totalCount || 0,
      timestamp: new Date().toISOString()
    };
    
    console.log('\n모의 API 응답:');
    console.log(safeJsonStringify({
      ...apiResponse,
      data: results.length > 3 ? 
        [...results.slice(0, 3), '... 외 ' + (results.length - 3) + '개 행'] : 
        results
    }));
    
    return { results, totalCount: countResult?.totalCount || 0 };
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

// 스크립트 실행
async function main() {
  console.log('===== 활성 고가치 사용자 API 테스트 (수정된 JOIN 조건) =====');
  console.log('테스트 실행 시간:', new Date().toISOString());
  console.log('-------------------------------------');
  
  try {
    // 기본 매개변수로 테스트
    await testActiveUsersQuery();
    
    console.log('\n-------------------------------------');
    
    // 낮은 minNetBet 값으로 테스트
    await testActiveUsersQuery(500, 20);
    
  } catch (err) {
    console.error('테스트 실행 오류:', err);
  }
  
  console.log('\n===== 테스트 완료 =====');
}

// 스크립트 시작
main().then(() => {
  console.log('스크립트 실행 완료');
}).catch(err => {
  console.error('스크립트 실행 중 예외 발생:', err);
  process.exit(1);
});
