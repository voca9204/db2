/**
 * 데이터베이스 연결 테스트 스크립트
 * 
 * 이 스크립트는 Firebase Functions에서 사용하는 데이터베이스 연결을 테스트합니다.
 * 
 * 실행 방법: node scripts/database/test-connection.js
 */

// 필요한 모듈 불러오기
const mysql = require('mysql2/promise');
const fs = require('fs');
const path = require('path');
const dotenv = require('dotenv');

// 환경 변수 로드
dotenv.config();

// 데이터베이스 연결 정보
const DB_CONFIG = {
  host: process.env.DB_HOST || '211.248.190.46',
  user: process.env.DB_USER || 'hermes',
  password: process.env.DB_PASSWORD || 'mcygicng!022',
  database: process.env.DB_NAME || 'hermes',
  waitForConnections: true,
  connectionLimit: 5,
  queueLimit: 0,
  connectTimeout: 10000, // 10초
};

// 결과 저장 디렉토리
const RESULTS_DIR = path.join(__dirname, '../../data/db/results');

/**
 * 데이터베이스 연결 테스트
 */
async function testDatabaseConnection() {
  console.log('🧪 데이터베이스 연결 테스트 시작...');
  console.log('---------------------------------------------');
  console.log(`📍 데이터베이스 호스트: ${DB_CONFIG.host}`);
  console.log(`📍 데이터베이스 이름: ${DB_CONFIG.database}`);
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
    
    connection = await mysql.createConnection({
      host: DB_CONFIG.host,
      user: DB_CONFIG.user,
      password: DB_CONFIG.password,
      database: DB_CONFIG.database,
      connectTimeout: DB_CONFIG.connectTimeout
    });
    
    const connectionTime = Date.now() - startTime;
    console.log(`✅ 데이터베이스 연결 성공! (소요시간: ${connectionTime}ms)`);
    
    // 연결 결과 저장
    results.connection.success = true;
    results.connection.time = connectionTime;
    
    // 1. 기본 쿼리 테스트
    await testBasicQuery(connection, results);
    
    // 2. 고가치 사용자 조회 쿼리 테스트
    await testHighValueUserQuery(connection, results);
    
    // 3. 휴면 사용자 조회 쿼리 테스트
    await testDormantUserQuery(connection, results);
    
    // 결과 저장
    fs.writeFileSync(
      path.join(RESULTS_DIR, 'db-connection-test.json'),
      JSON.stringify(results, null, 2)
    );
    
    console.log('\n---------------------------------------------');
    console.log('✅ 데이터베이스 테스트가 완료되었습니다!');
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
      path.join(RESULTS_DIR, 'db-connection-test.json'),
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
 * 기본 쿼리 테스트
 */
async function testBasicQuery(connection, results) {
  console.log('\n1️⃣ 기본 쿼리 테스트...');
  
  const queryResult = {
    query: 'SELECT 1 AS test',
    success: false,
    error: null,
    duration: 0,
    timestamp: new Date().toISOString()
  };
  
  try {
    const startTime = Date.now();
    const [rows] = await connection.query('SELECT 1 AS test');
    const queryTime = Date.now() - startTime;
    
    console.log(`✅ 기본 쿼리 실행 성공! (소요시간: ${queryTime}ms)`);
    console.log(`  결과: ${JSON.stringify(rows)}`);
    
    queryResult.success = true;
    queryResult.duration = queryTime;
    queryResult.result = rows;
    
    results.queries.push(queryResult);
    return true;
  } catch (error) {
    console.error(`❌ 기본 쿼리 실행 오류: ${error.message}`);
    
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
 * 고가치 사용자 조회 쿼리 테스트
 */
async function testHighValueUserQuery(connection, results) {
  console.log('\n2️⃣ 고가치 사용자 조회 쿼리 테스트...');
  
  // 테이블 존재 여부 확인을 위한 쿼리
  const checkTableQuery = `
    SELECT 
      TABLE_NAME 
    FROM 
      information_schema.TABLES 
    WHERE 
      TABLE_SCHEMA = ? 
      AND TABLE_NAME = ?
  `;
  
  try {
    // 테이블 존재 여부 확인
    const [tableRows] = await connection.query(checkTableQuery, [DB_CONFIG.database, 'high_value_users']);
    
    if (tableRows.length === 0) {
      console.log('⚠️ high_value_users 테이블이 존재하지 않습니다. 테이블 구조를 확인합니다...');
      
      // 데이터베이스의 모든 테이블 목록 조회
      const [allTables] = await connection.query(`
        SELECT TABLE_NAME 
        FROM information_schema.TABLES 
        WHERE TABLE_SCHEMA = ?
        LIMIT 10
      `, [DB_CONFIG.database]);
      
      console.log(`  데이터베이스에 존재하는 테이블 목록 (최대 10개): ${JSON.stringify(allTables.map(t => t.TABLE_NAME))}`);
      
      // 대안으로 사용자 관련 테이블 찾기
      const [userTables] = await connection.query(`
        SELECT TABLE_NAME 
        FROM information_schema.TABLES 
        WHERE TABLE_SCHEMA = ? 
        AND TABLE_NAME LIKE '%user%'
        LIMIT 5
      `, [DB_CONFIG.database]);
      
      if (userTables.length > 0) {
        console.log(`  사용자 관련 테이블 목록 (최대 5개): ${JSON.stringify(userTables.map(t => t.TABLE_NAME))}`);
        
        // 첫 번째 사용자 관련 테이블 구조 확인
        const userTable = userTables[0].TABLE_NAME;
        console.log(`  테이블 '${userTable}'의 구조를 확인합니다...`);
        
        const [columns] = await connection.query(`
          SELECT COLUMN_NAME, DATA_TYPE 
          FROM information_schema.COLUMNS 
          WHERE TABLE_SCHEMA = ? 
          AND TABLE_NAME = ?
        `, [DB_CONFIG.database, userTable]);
        
        console.log(`  테이블 구조: ${JSON.stringify(columns.map(c => ({name: c.COLUMN_NAME, type: c.DATA_TYPE})))}`);
        
        // 첫 번째 사용자 관련 테이블에서 샘플 데이터 조회
        const [sampleData] = await connection.query(`
          SELECT * FROM ${userTable} LIMIT 1
        `);
        
        console.log(`  샘플 데이터: ${JSON.stringify(sampleData[0])}`);
        
        // 결과 기록
        const queryResult = {
          query: `사용자 테이블 (${userTable}) 조회`,
          success: true,
          alternativeTable: userTable,
          sampleData: sampleData[0],
          timestamp: new Date().toISOString()
        };
        
        results.queries.push(queryResult);
      } else {
        console.log('⚠️ 사용자 관련 테이블을 찾을 수 없습니다.');
        
        const queryResult = {
          query: '고가치 사용자 ��회',
          success: false,
          error: {
            message: 'high_value_users 테이블 및 사용자 관련 테이블이 존재하지 않음'
          },
          timestamp: new Date().toISOString()
        };
        
        results.queries.push(queryResult);
      }
      
      return false;
    }
    
    // 테이블이 존재하는 경우, 구조 확인
    const [columns] = await connection.query(`
      SELECT COLUMN_NAME, DATA_TYPE 
      FROM information_schema.COLUMNS 
      WHERE TABLE_SCHEMA = ? 
      AND TABLE_NAME = ?
    `, [DB_CONFIG.database, 'high_value_users']);
    
    console.log(`  high_value_users 테이블 구조: ${JSON.stringify(columns.map(c => ({name: c.COLUMN_NAME, type: c.DATA_TYPE})))}`);
    
    // 활성 고가치 사용자 쿼리 - 동적으로 구성
    const columnNames = columns.map(c => c.COLUMN_NAME);
    const hasUserID = columnNames.includes('user_id') || columnNames.includes('user_ID') || columnNames.includes('userId');
    const hasNetBet = columnNames.includes('net_bet') || columnNames.includes('netBet') || columnNames.includes('bet_amount');
    const hasLastActivity = columnNames.includes('last_activity_date') || columnNames.includes('lastActivityDate') || columnNames.includes('last_login');
    
    if (!hasUserID || !hasNetBet || !hasLastActivity) {
      console.log('⚠️ high_value_users 테이블에 필요한 컬럼이 없습니다.');
      
      // 샘플 데이터 조회
      const [sampleData] = await connection.query(`
        SELECT * FROM high_value_users LIMIT 1
      `);
      
      console.log(`  샘플 데이터: ${JSON.stringify(sampleData[0])}`);
      
      const queryResult = {
        query: '고가치 사용자 조회',
        success: false,
        error: {
          message: '필요한 컬럼 없음',
          tableStructure: columns.map(c => ({name: c.COLUMN_NAME, type: c.DATA_TYPE})),
          sampleData: sampleData[0]
        },
        timestamp: new Date().toISOString()
      };
      
      results.queries.push(queryResult);
      return false;
    }
    
    // 적절한 컬럼 이름 사용
    const userIdColumn = columnNames.includes('user_id') ? 'user_id' : 
                         (columnNames.includes('userId') ? 'userId' : 'user_ID');
    
    const netBetColumn = columnNames.includes('net_bet') ? 'net_bet' : 
                         (columnNames.includes('netBet') ? 'netBet' : 'bet_amount');
    
    const lastActivityColumn = columnNames.includes('last_activity_date') ? 'last_activity_date' : 
                              (columnNames.includes('lastActivityDate') ? 'lastActivityDate' : 'last_login');
    
    // 활성 고가치 사용자 쿼리
    const activeQuery = `
      SELECT *
      FROM high_value_users
      WHERE ${netBetColumn} >= ?
      LIMIT ?
    `;
    
    const queryResult = {
      query: activeQuery,
      params: [50000, 5],
      success: false,
      error: null,
      duration: 0,
      timestamp: new Date().toISOString()
    };
    
    const startTime = Date.now();
    const [rows] = await connection.query(activeQuery, [50000, 5]);
    const queryTime = Date.now() - startTime;
    
    console.log(`✅ 고가치 사용자 조회 쿼리 실행 성공! (소요시간: ${queryTime}ms)`);
    console.log(`  조회된 사용자 수: ${rows.length}`);
    
    if (rows.length > 0) {
      console.log(`  첫 번째 사용자: ${JSON.stringify(rows[0])}`);
    }
    
    queryResult.success = true;
    queryResult.duration = queryTime;
    queryResult.resultCount = rows.length;
    queryResult.sampleResult = rows.length > 0 ? rows[0] : null;
    
    results.queries.push(queryResult);
    return true;
  } catch (error) {
    console.error(`❌ 고가치 사용자 조회 쿼리 실행 오류: ${error.message}`);
    
    const queryResult = {
      query: '고가치 사용자 조회',
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

/**
 * 휴면 사용자 조회 쿼리 테스트
 */
async function testDormantUserQuery(connection, results) {
  console.log('\n3️⃣ 휴면 사용자 조회 쿼리 테스트...');
  
  try {
    // 간단한 테스트 쿼리
    const testQuery = `
      SHOW TABLES LIKE '%user%'
    `;
    
    const queryResult = {
      query: testQuery,
      success: false,
      error: null,
      duration: 0,
      timestamp: new Date().toISOString()
    };
    
    const startTime = Date.now();
    const [rows] = await connection.query(testQuery);
    const queryTime = Date.now() - startTime;
    
    console.log(`✅ 사용자 관련 테이블 조회 성공! (소요시간: ${queryTime}ms)`);
    console.log(`  조회된 테이블 수: ${rows.length}`);
    
    if (rows.length > 0) {
      const tableNames = rows.map(row => Object.values(row)[0]);
      console.log(`  사용자 관련 테이블 목록: ${JSON.stringify(tableNames)}`);
      
      // 첫 번째 사용자 관련 테이블에서 최근 활동이 없는 레코드 조회 시도
      if (tableNames.length > 0) {
        const userTable = tableNames[0];
        
        // 테이블 구조 확인
        const [columns] = await connection.query(`
          DESCRIBE ${userTable}
        `);
        
        const columnNames = columns.map(c => c.Field);
        console.log(`  테이블 '${userTable}' 컬럼 목록: ${JSON.stringify(columnNames)}`);
        
        // 날짜/시간 관련 컬럼 찾기
        const dateColumns = columns.filter(c => 
          c.Type.includes('date') || 
          c.Type.includes('time') || 
          c.Field.includes('date') || 
          c.Field.includes('time') || 
          c.Field.includes('login') || 
          c.Field.includes('activity')
        ).map(c => c.Field);
        
        if (dateColumns.length > 0) {
          console.log(`  날짜/시간 관련 컬럼: ${JSON.stringify(dateColumns)}`);
          
          // 첫 번째 날짜 컬럼 사용
          const dateColumn = dateColumns[0];
          
          // 30일 이상 활동이 없는 레코드 조회
          const dormantQuery = `
            SELECT * 
            FROM ${userTable} 
            WHERE ${dateColumn} < DATE_SUB(NOW(), INTERVAL 30 DAY)
            LIMIT 5
          `;
          
          console.log(`  실행 쿼리: ${dormantQuery}`);
          
          const [dormantUsers] = await connection.query(dormantQuery);
          
          console.log(`  휴면 사용자 수: ${dormantUsers.length}`);
          
          if (dormantUsers.length > 0) {
            console.log(`  첫 번째 휴면 사용자: ${JSON.stringify(dormantUsers[0])}`);
          }
          
          queryResult.success = true;
          queryResult.duration = queryTime;
          queryResult.tables = tableNames;
          queryResult.useTable = userTable;
          queryResult.dormantQuery = dormantQuery;
          queryResult.resultCount = dormantUsers.length;
          queryResult.sampleResult = dormantUsers.length > 0 ? dormantUsers[0] : null;
        } else {
          console.log(`⚠️ 테이블 '${userTable}'에 날짜/시간 관련 컬럼이 없습니다.`);
          
          queryResult.success = true;
          queryResult.duration = queryTime;
          queryResult.tables = tableNames;
          queryResult.warning = `테이블 '${userTable}'에 날짜/시간 관련 컬럼이 없습니다.`;
        }
      }
    } else {
      console.log('⚠️ 사용자 관련 테이블이 없습니다.');
      
      queryResult.success = true;
      queryResult.duration = queryTime;
      queryResult.warning = '사용자 관련 테이블이 없습니다.';
    }
    
    results.queries.push(queryResult);
    return true;
  } catch (error) {
    console.error(`❌ 휴면 사용자 조회 쿼리 실행 오류: ${error.message}`);
    
    const queryResult = {
      query: '휴면 사용자 조회',
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
testDatabaseConnection().catch(error => {
  console.error('\n❌ 데이터베이스 테스트 실패!', error);
  process.exit(1);
});
