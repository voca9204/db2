/**
 * 데이터베이스 사용자 테이블 쿼리 테스트
 * 
 * 이 스크립트는 사용자 테이블 쿼리를 테스트합니다.
 * 
 * 실행 방법: node scripts/database/test-users-query.js
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
 * 사용자 테이블 쿼리 테스트
 */
async function testUsersQuery() {
  console.log('🧪 사용자 테이블 쿼리 테스트 시작...');
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
    
    // 1. 사용자 수 조회
    await testUserCount(connection, results);
    
    // 2. 최근 로그인한 사용자 조회
    await testRecentSignedUsers(connection, results);
    
    // 3. 휴면 사용자 조회
    await testInactiveUsers(connection, results);
    
    // 4. user_sessions 테이블 조회
    await testUserSessions(connection, results);
    
    // 결과 저장
    fs.writeFileSync(
      path.join(RESULTS_DIR, 'users-query-test.json'),
      JSON.stringify(results, null, 2)
    );
    
    console.log('\n---------------------------------------------');
    console.log('✅ 사용자 테이블 쿼리 테스트가 완료되었습니다!');
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
      path.join(RESULTS_DIR, 'users-query-test.json'),
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
 * 사용자 수 조회 테스트
 */
async function testUserCount(connection, results) {
  console.log('\n1️⃣ 사용자 수 조회 테스트...');
  
  const query = `
    SELECT 
      COUNT(*) AS total_users,
      SUM(CASE WHEN state = 0 THEN 1 ELSE 0 END) AS active_users,
      SUM(CASE WHEN state != 0 THEN 1 ELSE 0 END) AS inactive_users,
      SUM(CASE WHEN DATEDIFF(NOW(), signedAt) <= 30 THEN 1 ELSE 0 END) AS recent_active_users
    FROM 
      users
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
    
    console.log(`✅ 사용자 수 조회 성공! (소요시간: ${queryTime}ms)`);
    console.log(`  결과: ${JSON.stringify(rows[0])}`);
    
    queryResult.success = true;
    queryResult.duration = queryTime;
    queryResult.result = rows[0];
    
    results.queries.push(queryResult);
    return true;
  } catch (error) {
    console.error(`❌ 사용자 수 조회 오류: ${error.message}`);
    
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
 * 최근 로그인한 사용자 조회 테스트
 */
async function testRecentSignedUsers(connection, results) {
  console.log('\n2️⃣ 최근 로그인한 사용자 조회 테스트...');
  
  const query = `
    SELECT 
      id, name, loginId, group, role, state, 
      joinAt, signedAt, lastIp
    FROM 
      users
    WHERE 
      signedAt IS NOT NULL
    ORDER BY 
      signedAt DESC
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
    
    console.log(`✅ 최근 로그인한 사용자 조회 성공! (소요시간: ${queryTime}ms)`);
    console.log(`  조회된 사용자 수: ${rows.length}`);
    
    if (rows.length > 0) {
      console.log(`  최근 로그인한 사용자:
  ${rows.map((user, i) => `    ${i + 1}. ${user.name} (${user.loginId}) - 마지막 로그인: ${new Date(user.signedAt).toISOString()}`).join('\n  ')}`);
    }
    
    queryResult.success = true;
    queryResult.duration = queryTime;
    queryResult.resultCount = rows.length;
    queryResult.sampleResults = rows.slice(0, 3); // 최대 3개만 저장
    
    results.queries.push(queryResult);
    return true;
  } catch (error) {
    console.error(`❌ 최근 로그인한 사용자 조회 오류: ${error.message}`);
    
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
 * 휴면 사용자 조회 테스트
 */
async function testInactiveUsers(connection, results) {
  console.log('\n3️⃣ 휴면 사용자 조회 테스트...');
  
  const query = `
    SELECT 
      id, name, loginId, group, role, state, 
      joinAt, signedAt, 
      DATEDIFF(NOW(), signedAt) AS inactive_days
    FROM 
      users
    WHERE 
      signedAt < DATE_SUB(NOW(), INTERVAL 90 DAY)
      AND state = 0
    ORDER BY 
      signedAt ASC
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
    
    console.log(`✅ 휴면 사용자 조회 성공! (소요시간: ${queryTime}ms)`);
    console.log(`  조회된 사용자 수: ${rows.length}`);
    
    if (rows.length > 0) {
      console.log(`  휴면 사용자:
  ${rows.map((user, i) => `    ${i + 1}. ${user.name} (${user.loginId}) - 비활성 기간: ${user.inactive_days}일`).join('\n  ')}`);
    }
    
    queryResult.success = true;
    queryResult.duration = queryTime;
    queryResult.resultCount = rows.length;
    queryResult.sampleResults = rows.slice(0, 3); // 최대 3개만 저장
    
    results.queries.push(queryResult);
    return true;
  } catch (error) {
    console.error(`❌ 휴면 사용자 조회 오류: ${error.message}`);
    
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
 * 사용자 세션 테이블 조회 테스트
 */
async function testUserSessions(connection, results) {
  console.log('\n4️⃣ 사용자 세션 테이블 조회 테스트...');
  
  // 테이블 구조 확인
  try {
    const [columns] = await connection.query(`DESCRIBE user_sessions`);
    const columnNames = columns.map(c => c.Field);
    
    console.log(`  user_sessions 테이블 구조: ${columnNames.join(', ')}`);
    
    // 최근 세션 조회
    const query = `
      SELECT *
      FROM user_sessions
      ORDER BY created_at DESC
      LIMIT 5
    `;
    
    const queryResult = {
      query,
      success: false,
      error: null,
      duration: 0,
      timestamp: new Date().toISOString(),
      tableStructure: columns.map(c => ({name: c.Field, type: c.Type}))
    };
    
    try {
      const startTime = Date.now();
      const [rows] = await connection.query(query);
      const queryTime = Date.now() - startTime;
      
      console.log(`✅ 사용자 세션 조회 성공! (소요시간: ${queryTime}ms)`);
      console.log(`  조회된 세션 수: ${rows.length}`);
      
      if (rows.length > 0) {
        console.log(`  첫 번째 세션: ${JSON.stringify(rows[0])}`);
      }
      
      queryResult.success = true;
      queryResult.duration = queryTime;
      queryResult.resultCount = rows.length;
      queryResult.sampleResults = rows.length > 0 ? rows[0] : null;
      
      results.queries.push(queryResult);
      return true;
    } catch (error) {
      console.error(`❌ 사용자 세션 조회 오류: ${error.message}`);
      
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
  } catch (error) {
    console.error(`❌ user_sessions 테이블 구조 조회 오류: ${error.message}`);
    
    const queryResult = {
      query: 'DESCRIBE user_sessions',
      success: false,
      error: {
        message: error.message,
        code: error.code,
        errno: error.errno,
        sqlState: error.sqlState,
        sqlMessage: error.sqlMessage
      },
      timestamp: new Date().toISOString()
    };
    
    results.queries.push(queryResult);
    return false;
  }
}

// 함수 실행
testUsersQuery().catch(error => {
  console.error('\n❌ 사용자 테이블 쿼리 테스트 실패!', error);
  process.exit(1);
});
