/**
 * 데이터베이스 연결 테스트 유틸리티
 */

require('dotenv').config();
const { executeQuery, withTransaction } = require('../db');

/**
 * 데이터베이스 연결 및 기본 쿼리 테스트
 */
const testConnection = async () => {
  try {
    console.log('Testing database connection...');
    
    // 기본 연결 테스트
    const result = await executeQuery('SELECT 1 + 1 as sum');
    console.log('Connection test successful:', result);
    
    // 데이터베이스 정보 조회
    const dbInfoResult = await executeQuery('SELECT VERSION() as version, DATABASE() as database, USER() as user');
    console.log('Database info:', dbInfoResult[0]);
    
    // 테이블 목록 조회
    const tablesResult = await executeQuery('SHOW TABLES');
    console.log('Tables in database:');
    tablesResult.forEach((row, index) => {
      const tableName = Object.values(row)[0];
      console.log(`  ${index + 1}. ${tableName}`);
    });
    
    // 트랜잭션 테스트
    const transactionResult = await withTransaction(async (connection) => {
      // 트랜잭션 내에서 쿼리 실행
      const [result] = await connection.execute('SELECT 1 + 2 as transaction_test');
      return result;
    });
    console.log('Transaction test successful:', transactionResult);
    
    console.log('All database tests passed!');
  } catch (error) {
    console.error('Database test failed:', error);
    process.exit(1);
  }
};

// 스크립트가 직접 실행될 때 테스트 실행
if (require.main === module) {
  testConnection().then(() => {
    console.log('Connection test script completed');
    process.exit(0);
  }).catch(error => {
    console.error('Connection test script failed:', error);
    process.exit(1);
  });
}

module.exports = { testConnection };
