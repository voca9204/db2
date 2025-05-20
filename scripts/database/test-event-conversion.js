/**
 * 이벤트 참여 및 입금 분석 테스트
 * 
 * 이 스크립트는 오랫동안 게임을 하지 않은 사용자의 이벤트 참여 및 입금 전환 분석을 테스트합니다.
 * 
 * 실행 방법: node scripts/database/test-event-conversion.js
 */

// 필요한 모듈 불러오기
const mysql = require('mysql2/promise');
const fs = require('fs');
const path = require('path');

// 데이터베이스 연결 정보
const DB_CONFIG = {
  host: '211.248.190.46',
  user: 'hermes',
  password: 'mcygicng!022',
  database: 'hermes',
  waitForConnections: true,
  connectionLimit: 5,
  queueLimit: 0,
  connectTimeout: 10000, // 10초
};

// 결과 저장 디렉토리
const RESULTS_DIR = path.join(__dirname, '../../data/db/results');

/**
 * 이벤트 참여 및 입금 분석 테스트
 */
async function testEventConversion() {
  console.log('🧪 이벤트 참여 및 입금 분석 테스트 시작...');
  console.log('---------------------------------------------');
  
  // 결과 저장 디렉토리 생성
  if (!fs.existsSync(RESULTS_DIR)) {
    fs.mkdirSync(RESULTS_DIR, { recursive: true });
  }
  
  const results = {
    connection: {
      success: false,
      error: null,
      timestamp: new Date().toISOString()
    },
    tableInfo: {},
    queries: []
  };
  
  let connection;
  
  try {
    // 연결 생성
    console.log('데이터베이스 연결 시도 중...');
    const startTime = Date.now();
    
    connection = await mysql.createConnection(DB_CONFIG);
    
    const connectionTime = Date.now() - startTime;
    console.log(`✅ 데이터베이스 연결 성공! (소요시간: ${connectionTime}ms)`);
    
    // 연결 결과 저장
    results.connection.success = true;
    results.connection.time = connectionTime;
    
    // 1. 테이블 구조 및 데이터 확인
    await checkTables(connection, results);
    
    // 2. players 테이블 조회
    await testPlayers(connection, results);
    
    // 3. promotions 테이블 조회
    await testPromotions(connection, results);
    
    // 4. promotion_players 테이블 조회
    await testPromotionPlayers(connection, results);
    
    // 5. money_flows 테이블 조회
    await testMoneyFlows(connection, results);
    
    // 6. 이벤트 후 입금 분석
    await testEventToDeposit(connection, results);
    
    // 결과 저장
    fs.writeFileSync(
      path.join(RESULTS_DIR, 'event-conversion-test.json'),
      JSON.stringify(results, null, 2)
    );
    
    console.log('\n---------------------------------------------');
    console.log('✅ 이벤트 참여 및 입금 분석 테스트가 완료되었습니다!');
    console.log('---------------------------------------------');
  } catch (error) {
    console.error(`❌ 데이터베이스 연결 오류: ${error.message}`);
    
    results.connection.success = false;
    results.connection.error = {
      message: error.message,
      code: error.code,
      errno: error.errno,
      sqlState: error.sqlState,
      sqlMessage: error.sqlMessage
    };
    
    // 결과 저장
    fs.writeFileSync(
      path.join(RESULTS_DIR, 'event-conversion-test.json'),
      JSON.stringify(results, null, 2)
    );
    
    process.exit(1);
  } finally {
    // 연결 종료
    if (connection) {
      try {
        await connection.end();
        console.log('데이터베이스 연결 종료');
      } catch (err) {
        console.error('연결 종료 중 오류:', err);
      }
    }
  }
}

/**
 * 관련 테이블 확인
 */
async function checkTables(connection, results) {
  console.log('\n1️⃣ 관련 테이블 확인 중...');
  
  const expectedTables = ['players', 'promotions', 'promotion_players', 'money_flows', 'game_scores'];
  const tableInfo = {};
  
  // 모든 테이블 목록 조회
  try {
    const [tables] = await connection.query(`SHOW TABLES`);
    const tableList = tables.map(table => Object.values(table)[0]);
    
    console.log(`  데이터베이스에 ${tableList.length}개의 테이블이 있습니다.`);
    
    // 기대하는 테이블이 있는지 확인
    for (const tableName of expectedTables) {
      const exists = tableList.includes(tableName);
      console.log(`  테이블 '${tableName}'${exists ? ' 존재함' : ' 존재하지 않음'}`);
      
      if (exists) {
        // 테이블 구조 확인
        const [columns] = await connection.query(`DESCRIBE ${tableName}`);
        const columnInfo = columns.map(column => ({
          name: column.Field,
          type: column.Type,
          nullable: column.Null === 'YES',
          key: column.Key,
          default: column.Default,
          extra: column.Extra
        }));
        
        // 간단한 카운트 쿼리
        const [countResult] = await connection.query(`SELECT COUNT(*) as count FROM ${tableName}`);
        const count = countResult[0].count;
        
        tableInfo[tableName] = {
          exists: true,
          columns: columnInfo,
          count: count
        };
        
        console.log(`    - 총 ${columnInfo.length}개의 컬럼, ${count}개의 레코드`);
      } else {
        tableInfo[tableName] = {
          exists: false
        };
      }
    }
    
    results.tableInfo = tableInfo;
  } catch (error) {
    console.error(`❌ 테이블 조회 오류: ${error.message}`);
    results.tableInfo = {
      error: error.message
    };
  }
}

/**
 * players 테이블 조회 테스트
 */
async function testPlayers(connection, results) {
  console.log('\n2️⃣ players 테이블 조회 테스트...');
  
  if (!results.tableInfo.players || !results.tableInfo.players.exists) {
    console.log('⚠️ players 테이블이 존재하지 않습니다.');
    return false;
  }
  
  const query = `
    SELECT 
      userId, status, 
      DATEDIFF(NOW(), COALESCE(last_activity_date, created_at)) AS inactive_days,
      COUNT(DISTINCT game_id) as game_count,
      SUM(netBet) as total_net_bet,
      SUM(winLoss) as total_win_loss
    FROM 
      players
    WHERE 
      status = 0
      AND DATEDIFF(NOW(), COALESCE(last_activity_date, created_at)) > 30
    GROUP BY 
      userId
    ORDER BY 
      inactive_days DESC
    LIMIT 10
  `;
  
  const queryResult = {
    query,
    success: false,
    error: null,
    duration: 0,
    timestamp: new Date().toISOString()
  };
  
  try {
    const startTime = Date.now();
    const [rows] = await connection.query(query);
    const queryTime = Date.now() - startTime;
    
    console.log(`✅ 휴면 사용자 조회 성공! (소요시간: ${queryTime}ms)`);
    console.log(`  조회된 사용자 수: ${rows.length}`);
    
    if (rows.length > 0) {
      console.log(`  첫 번째 사용자: ${JSON.stringify(rows[0])}`);
    } else {
      // 쿼리 수정 시도
      console.log('⚠️ 첫 번째 쿼리로 사용자가 조회되지 않았습니다. 컬럼 이름을 확인합니다...');
      
      // 컬럼 이름 확인
      const columns = results.tableInfo.players.columns.map(col => col.name);
      console.log(`  players 테이블 컬럼: ${columns.join(', ')}`);
      
      // 수정된 쿼리 - 가능한 컬럼 이름 조합으로 시도
      const hasLastActivity = columns.includes('last_activity_date') || columns.includes('lastActivityDate') || columns.includes('lastLogin');
      const hasCreatedAt = columns.includes('created_at') || columns.includes('createdAt') || columns.includes('joinDate');
      const hasNetBet = columns.includes('netBet') || columns.includes('net_bet') || columns.includes('validBetting');
      const hasWinLoss = columns.includes('winLoss') || columns.includes('win_loss') || columns.includes('profit');
      
      let lastActivityCol = hasLastActivity ? 
                          (columns.includes('last_activity_date') ? 'last_activity_date' : 
                           columns.includes('lastActivityDate') ? 'lastActivityDate' : 'lastLogin') : 
                          'created_at';
      
      let createdAtCol = hasCreatedAt ? 
                        (columns.includes('created_at') ? 'created_at' : 
                         columns.includes('createdAt') ? 'createdAt' : 'joinDate') : 
                        'joinAt';
      
      let netBetCol = hasNetBet ? 
                     (columns.includes('netBet') ? 'netBet' : 
                      columns.includes('net_bet') ? 'net_bet' : 'validBetting') : 
                     '0';
      
      let winLossCol = hasWinLoss ? 
                       (columns.includes('winLoss') ? 'winLoss' : 
                        columns.includes('win_loss') ? 'win_loss' : 'profit') : 
                       '0';
      
      const modifiedQuery = `
        SELECT 
          userId, status, 
          DATEDIFF(NOW(), ${lastActivityCol}) AS inactive_days
        FROM 
          players
        WHERE 
          status = 0
        ORDER BY 
          ${lastActivityCol} ASC
        LIMIT 10
      `;
      
      console.log(`  수정된 쿼리 실행: ${modifiedQuery}`);
      
      const [modifiedRows] = await connection.query(modifiedQuery);
      
      console.log(`  수정된 쿼리로 조회된 사용자 수: ${modifiedRows.length}`);
      
      if (modifiedRows.length > 0) {
        console.log(`  첫 번째 사용자: ${JSON.stringify(modifiedRows[0])}`);
        queryResult.modifiedQuery = modifiedQuery;
        queryResult.modifiedResults = modifiedRows.slice(0, 3);
      }
    }
    
    queryResult.success = true;
    queryResult.duration = queryTime;
    queryResult.resultCount = rows.length;
    queryResult.sampleResults = rows.slice(0, 3); // 최대 3개만 저장
    
    results.queries.push(queryResult);
    return true;
  } catch (error) {
    console.error(`❌ 휴면 사용자 조회 오류: ${error.message}`);
    
    // 테이블 구조에 맞게 수정된 간단한 쿼리 시도
    try {
      console.log('⚠️ 기본 쿼리 실패. 간단한 쿼리로 시도합니다...');
      
      const simpleQuery = `
        SELECT * 
        FROM players 
        LIMIT 1
      `;
      
      const [simpleResult] = await connection.query(simpleQuery);
      
      if (simpleResult.length > 0) {
        console.log(`  샘플 데이터: ${JSON.stringify(simpleResult[0])}`);
        queryResult.simpleQuery = simpleQuery;
        queryResult.simpleResult = simpleResult[0];
      }
    } catch (simpleError) {
      console.error(`  간단한 쿼리도 실패: ${simpleError.message}`);
    }
    
    queryResult.success = false;
    queryResult.error = {
      message: error.message,
      code: error.code,
      errno: error.errno,
      sqlState: error.sqlState,
      sqlMessage: error.sqlMessage
    };
    
    results.queries.push(queryResult);
    return false;
  }
}

/**
 * promotions 테이블 조회 테스트
 */
async function testPromotions(connection, results) {
  console.log('\n3️⃣ promotions 테이블 조회 테스트...');
  
  if (!results.tableInfo.promotions || !results.tableInfo.promotions.exists) {
    console.log('⚠️ promotions 테이블이 존재하지 않습니다.');
    return false;
  }
  
  const query = `
    SELECT *
    FROM promotions
    ORDER BY createdAt DESC
    LIMIT 5
  `;
  
  const queryResult = {
    query,
    success: false,
    error: null,
    duration: 0,
    timestamp: new Date().toISOString()
  };
  
  try {
    const startTime = Date.now();
    const [rows] = await connection.query(query);
    const queryTime = Date.now() - startTime;
    
    console.log(`✅ 프로모션 조회 성공! (소요시간: ${queryTime}ms)`);
    console.log(`  조회된 프로모션 수: ${rows.length}`);
    
    if (rows.length > 0) {
      console.log(`  첫 번째 프로모션: ${JSON.stringify(rows[0])}`);
    } else {
      // 간단한 조회 시도
      const simpleQuery = `SELECT * FROM promotions LIMIT 1`;
      const [simpleRows] = await connection.query(simpleQuery);
      
      if (simpleRows.length > 0) {
        console.log(`  샘플 프로모션: ${JSON.stringify(simpleRows[0])}`);
        queryResult.simpleResult = simpleRows[0];
      }
    }
    
    queryResult.success = true;
    queryResult.duration = queryTime;
    queryResult.resultCount = rows.length;
    queryResult.sampleResults = rows.slice(0, 3); // 최대 3개만 저장
    
    results.queries.push(queryResult);
    return true;
  } catch (error) {
    console.error(`❌ 프로모션 조회 오류: ${error.message}`);
    
    // 컬럼 이름 확인
    try {
      console.log('⚠️ 기본 쿼리 실패. 컬럼 이름을 확인합니다...');
      
      // 컬럼 이름 확인
      const columns = results.tableInfo.promotions.columns.map(col => col.name);
      console.log(`  promotions 테이블 컬럼: ${columns.join(', ')}`);
      
      // 시간 관련 컬럼 찾기
      const timeColumns = columns.filter(col => 
        col.includes('time') || 
        col.includes('date') || 
        col.includes('At') || 
        col.includes('_at') || 
        col.includes('created')
      );
      
      if (timeColumns.length > 0) {
        console.log(`  시간 관련 컬럼: ${timeColumns.join(', ')}`);
        
        const modifiedQuery = `
          SELECT *
          FROM promotions
          ORDER BY ${timeColumns[0]} DESC
          LIMIT 5
        `;
        
        console.log(`  수정된 쿼리 실행: ${modifiedQuery}`);
        
        const [modifiedRows] = await connection.query(modifiedQuery);
        
        console.log(`  수정된 쿼리로 조회된 프로모션 수: ${modifiedRows.length}`);
        
        if (modifiedRows.length > 0) {
          console.log(`  첫 번째 프로모션: ${JSON.stringify(modifiedRows[0])}`);
          queryResult.modifiedQuery = modifiedQuery;
          queryResult.modifiedResults = modifiedRows.slice(0, 3);
        }
      }
    } catch (modifiedError) {
      console.error(`  수정된 쿼리도 실패: ${modifiedError.message}`);
    }
    
    queryResult.success = false;
    queryResult.error = {
      message: error.message,
      code: error.code,
      errno: error.errno,
      sqlState: error.sqlState,
      sqlMessage: error.sqlMessage
    };
    
    results.queries.push(queryResult);
    return false;
  }
}

/**
 * promotion_players 테이블 조회 테스트
 */
async function testPromotionPlayers(connection, results) {
  console.log('\n4️⃣ promotion_players 테이블 조회 테스트...');
  
  if (!results.tableInfo.promotion_players || !results.tableInfo.promotion_players.exists) {
    console.log('⚠️ promotion_players 테이블이 존재하지 않습니다.');
    return false;
  }
  
  const query = `
    SELECT 
      pp.*, 
      p.userId
    FROM 
      promotion_players pp
    JOIN 
      players p ON pp.player = p.id
    WHERE 
      pp.reward > 0
      AND pp.appliedAt IS NOT NULL
    ORDER BY 
      pp.appliedAt DESC
    LIMIT 10
  `;
  
  const queryResult = {
    query,
    success: false,
    error: null,
    duration: 0,
    timestamp: new Date().toISOString()
  };
  
  try {
    const startTime = Date.now();
    const [rows] = await connection.query(query);
    const queryTime = Date.now() - startTime;
    
    console.log(`✅ 이벤트 참여 사용자 조회 성공! (소요시간: ${queryTime}ms)`);
    console.log(`  조회된 사용자 수: ${rows.length}`);
    
    if (rows.length > 0) {
      console.log(`  첫 번째 참여 사용자: ${JSON.stringify(rows[0])}`);
    } else {
      // 간단한 조회 시도
      console.log('⚠️ 조인 쿼리로 결과가 없습니다. 기본 쿼리로 시도합니다...');
      
      const simpleQuery = `SELECT * FROM promotion_players LIMIT 5`;
      const [simpleRows] = await connection.query(simpleQuery);
      
      console.log(`  기본 쿼리�� 조회된 레코드 수: ${simpleRows.length}`);
      
      if (simpleRows.length > 0) {
        console.log(`  샘플 데이터: ${JSON.stringify(simpleRows[0])}`);
        queryResult.simpleResults = simpleRows.slice(0, 3);
      }
    }
    
    queryResult.success = true;
    queryResult.duration = queryTime;
    queryResult.resultCount = rows.length;
    queryResult.sampleResults = rows.slice(0, 3); // 최대 3개만 저장
    
    results.queries.push(queryResult);
    return true;
  } catch (error) {
    console.error(`❌ 이벤트 참여 사용자 조회 오류: ${error.message}`);
    
    // 테이블 구조 확인 후 간단한 쿼리 시도
    try {
      console.log('⚠️ 조인 쿼리 실패. 기본 쿼리로 시도합니다...');
      
      const simpleQuery = `SELECT * FROM promotion_players LIMIT 1`;
      const [simpleRows] = await connection.query(simpleQuery);
      
      if (simpleRows.length > 0) {
        console.log(`  샘플 데이터: ${JSON.stringify(simpleRows[0])}`);
        queryResult.simpleQuery = simpleQuery;
        queryResult.simpleResult = simpleRows[0];
      }
    } catch (simpleError) {
      console.error(`  기본 쿼리도 실패: ${simpleError.message}`);
    }
    
    queryResult.success = false;
    queryResult.error = {
      message: error.message,
      code: error.code,
      errno: error.errno,
      sqlState: error.sqlState,
      sqlMessage: error.sqlMessage
    };
    
    results.queries.push(queryResult);
    return false;
  }
}

/**
 * money_flows 테이블 조회 테스트
 */
async function testMoneyFlows(connection, results) {
  console.log('\n5️⃣ money_flows 테이블 조회 테스트...');
  
  if (!results.tableInfo.money_flows || !results.tableInfo.money_flows.exists) {
    console.log('⚠️ money_flows 테이블이 존재하지 않습니다.');
    return false;
  }
  
  const query = `
    SELECT 
      mf.*, 
      p.userId
    FROM 
      money_flows mf
    JOIN 
      players p ON mf.player = p.id
    WHERE 
      mf.type = 0 -- 입금
    ORDER BY 
      mf.createdAt DESC
    LIMIT 10
  `;
  
  const queryResult = {
    query,
    success: false,
    error: null,
    duration: 0,
    timestamp: new Date().toISOString()
  };
  
  try {
    const startTime = Date.now();
    const [rows] = await connection.query(query);
    const queryTime = Date.now() - startTime;
    
    console.log(`✅ 입금 내역 조회 성공! (소요시간: ${queryTime}ms)`);
    console.log(`  조회된 입금 내역 수: ${rows.length}`);
    
    if (rows.length > 0) {
      console.log(`  첫 번째 입금 내역: ${JSON.stringify(rows[0])}`);
    } else {
      // 간단한 조회 시도
      console.log('⚠️ 조인 쿼리로 결과가 없습니다. 기본 쿼리로 시도합니다...');
      
      const simpleQuery = `SELECT * FROM money_flows LIMIT 5`;
      const [simpleRows] = await connection.query(simpleQuery);
      
      console.log(`  기본 쿼리로 조회된 레코드 수: ${simpleRows.length}`);
      
      if (simpleRows.length > 0) {
        console.log(`  샘플 데이터: ${JSON.stringify(simpleRows[0])}`);
        queryResult.simpleResults = simpleRows.slice(0, 3);
      }
    }
    
    queryResult.success = true;
    queryResult.duration = queryTime;
    queryResult.resultCount = rows.length;
    queryResult.sampleResults = rows.slice(0, 3); // 최대 3개만 저장
    
    results.queries.push(queryResult);
    return true;
  } catch (error) {
    console.error(`❌ 입금 내역 조회 오류: ${error.message}`);
    
    // 테이블 구조 확인 후 간단한 쿼리 시도
    try {
      console.log('⚠️ 조인 쿼리 실패. 기본 쿼리로 시도합니다...');
      
      const simpleQuery = `SELECT * FROM money_flows LIMIT 1`;
      const [simpleRows] = await connection.query(simpleQuery);
      
      if (simpleRows.length > 0) {
        console.log(`  샘플 데이터: ${JSON.stringify(simpleRows[0])}`);
        queryResult.simpleQuery = simpleQuery;
        queryResult.simpleResult = simpleRows[0];
      }
    } catch (simpleError) {
      console.error(`  기본 쿼리도 실패: ${simpleError.message}`);
    }
    
    queryResult.success = false;
    queryResult.error = {
      message: error.message,
      code: error.code,
      errno: error.errno,
      sqlState: error.sqlState,
      sqlMessage: error.sqlMessage
    };
    
    results.queries.push(queryResult);
    return false;
  }
}

/**
 * 이벤트 후 입금 분석 테스트
 */
async function testEventToDeposit(connection, results) {
  console.log('\n6️⃣ 이벤트 후 입금 분석 테스트...');
  
  // 필요한 테이블이 모두 존재하는지 확인
  const requiredTables = ['players', 'promotion_players', 'money_flows'];
  const missingTables = requiredTables.filter(table => 
    !results.tableInfo[table] || !results.tableInfo[table].exists);
  
  if (missingTables.length > 0) {
    console.log(`⚠️ 분석에 필요한 테이블이 없습니다: ${missingTables.join(', ')}`);
    return false;
  }
  
  // variables.md 파일에 있는 예제 쿼리와 유사한 분석 쿼리
  const query = `
    SELECT
      p.userId,
      (SELECT COUNT(*) FROM promotion_players pp WHERE pp.player = p.id AND pp.appliedAt IS NOT NULL) AS promotion_count,
      (SELECT MIN(pp2.appliedAt) FROM promotion_players pp2 WHERE pp2.player = p.id AND pp2.appliedAt IS NOT NULL) AS first_promotion_date,
      SUM(CASE WHEN mf.createdAt > (SELECT MIN(pp3.appliedAt) FROM promotion_players pp3 WHERE pp3.player = p.id AND pp3.appliedAt IS NOT NULL) THEN ROUND(mf.amount) ELSE 0 END) AS deposit_after_promotion
    FROM 
      players p
    JOIN 
      money_flows mf ON p.id = mf.player
    WHERE 
      p.id IN (SELECT player FROM promotion_players WHERE appliedAt IS NOT NULL)
      AND mf.type = 0 -- 입금
    GROUP BY 
      p.userId
    HAVING 
      deposit_after_promotion > 0
    ORDER BY 
      deposit_after_promotion DESC
    LIMIT 10
  `;
  
  const queryResult = {
    query,
    success: false,
    error: null,
    duration: 0,
    timestamp: new Date().toISOString()
  };
  
  try {
    const startTime = Date.now();
    const [rows] = await connection.query(query);
    const queryTime = Date.now() - startTime;
    
    console.log(`✅ 이벤트 후 입금 분석 성공! (소요시간: ${queryTime}ms)`);
    console.log(`  분석된 사용자 수: ${rows.length}`);
    
    if (rows.length > 0) {
      console.log(`  이벤트 후 입금 데이터:
  ${rows.map((user, i) => `    ${i + 1}. ${user.userId} - 프로모션 ${user.promotion_count}회 참여, 이벤트 후 입금액: ${user.deposit_after_promotion}원`).join('\n  ')}`);
      
      // 통계 계산
      const totalUsers = rows.length;
      const totalDeposit = rows.reduce((sum, user) => sum + user.deposit_after_promotion, 0);
      const avgDeposit = totalDeposit / totalUsers;
      const maxDeposit = Math.max(...rows.map(user => user.deposit_after_promotion));
      
      console.log(`\n  통계 정보:`);
      console.log(`    - 이벤트 후 입금 사용자 수: ${totalUsers}명`);
      console.log(`    - 총 입금액: ${totalDeposit}원`);
      console.log(`    - 평균 입금액: ${Math.round(avgDeposit)}원`);
      console.log(`    - 최대 입금액: ${maxDeposit}원`);
      
      queryResult.statistics = {
        totalUsers,
        totalDeposit,
        avgDeposit: Math.round(avgDeposit),
        maxDeposit
      };
    } else {
      console.log('⚠️ 이벤트 후 입금 데이터가 없습니다.');
      
      // 간소화된 쿼리 시도
      const simpleQuery = `
        SELECT 
          p.userId,
          COUNT(DISTINCT pp.id) AS promotion_count,
          SUM(CASE WHEN mf.type = 0 THEN ROUND(mf.amount) ELSE 0 END) AS total_deposit
        FROM 
          players p
        LEFT JOIN 
          promotion_players pp ON p.id = pp.player
        LEFT JOIN 
          money_flows mf ON p.id = mf.player
        GROUP BY 
          p.userId
        HAVING 
          promotion_count > 0 AND total_deposit > 0
        ORDER BY 
          total_deposit DESC
        LIMIT 10
      `;
      
      console.log('  간소화된 쿼리 시도...');
      
      try {
        const [simpleRows] = await connection.query(simpleQuery);
        
        console.log(`  간소화된 쿼리 결과 수: ${simpleRows.length}`);
        
        if (simpleRows.length > 0) {
          console.log(`  간소화된 이벤트 참여 및 입금 데이터:
  ${simpleRows.map((user, i) => `    ${i + 1}. ${user.userId} - 프로모션 ${user.promotion_count}회 참여, 총 입금액: ${user.total_deposit}원`).join('\n  ')}`);
          
          queryResult.simpleQuery = simpleQuery;
          queryResult.simpleResults = simpleRows.slice(0, 5);
        }
      } catch (simpleError) {
        console.error(`  간소화된 쿼리 실패: ${simpleError.message}`);
      }
    }
    
    queryResult.success = true;
    queryResult.duration = queryTime;
    queryResult.resultCount = rows.length;
    queryResult.sampleResults = rows.slice(0, 5); // 최대 5개만 저장
    
    results.queries.push(queryResult);
    return true;
  } catch (error) {
    console.error(`❌ 이벤트 후 입금 분석 오류: ${error.message}`);
    
    // 테이블 및 컬럼 이름 확인
    try {
      console.log('⚠️ 복잡한 쿼리 실패. 개별 테이블 및 중요 컬럼 확인...');
      
      // players 테이블에서 id와 userId 존재 확인
      const playersCheckQuery = `
        SELECT COUNT(*) as count
        FROM information_schema.COLUMNS
        WHERE TABLE_SCHEMA = '${DB_CONFIG.database}'
        AND TABLE_NAME = 'players'
        AND COLUMN_NAME IN ('id', 'userId')
      `;
      
      const [playersCheck] = await connection.query(playersCheckQuery);
      console.log(`  players 테이블의 id, userId 컬럼 수: ${playersCheck[0].count}`);
      
      // promotion_players 테이블에서 player, appliedAt 존재 확인
      const ppCheckQuery = `
        SELECT COUNT(*) as count
        FROM information_schema.COLUMNS
        WHERE TABLE_SCHEMA = '${DB_CONFIG.database}'
        AND TABLE_NAME = 'promotion_players'
        AND COLUMN_NAME IN ('player', 'appliedAt')
      `;
      
      const [ppCheck] = await connection.query(ppCheckQuery);
      console.log(`  promotion_players 테이블의 player, appliedAt 컬럼 수: ${ppCheck[0].count}`);
      
      // money_flows 테이블에서 player, type, amount 존재 확인
      const mfCheckQuery = `
        SELECT COUNT(*) as count
        FROM information_schema.COLUMNS
        WHERE TABLE_SCHEMA = '${DB_CONFIG.database}'
        AND TABLE_NAME = 'money_flows'
        AND COLUMN_NAME IN ('player', 'type', 'amount')
      `;
      
      const [mfCheck] = await connection.query(mfCheckQuery);
      console.log(`  money_flows 테이블의 player, type, amount 컬럼 수: ${mfCheck[0].count}`);
      
      queryResult.columnsCheck = {
        players: playersCheck[0].count,
        promotion_players: ppCheck[0].count,
        money_flows: mfCheck[0].count
      };
    } catch (checkError) {
      console.error(`  컬럼 확인 쿼리도 실패: ${checkError.message}`);
    }
    
    queryResult.success = false;
    queryResult.error = {
      message: error.message,
      code: error.code,
      errno: error.errno,
      sqlState: error.sqlState,
      sqlMessage: error.sqlMessage
    };
    
    results.queries.push(queryResult);
    return false;
  }
}

// 함수 실행
testEventConversion().catch(error => {
  console.error('\n❌ 이벤트 참여 및 입금 분석 테스트 실패!', error);
  process.exit(1);
});
