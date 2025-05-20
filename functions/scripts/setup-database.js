/**
 * 데이터베이스 설정 및 마이그레이션 스크립트
 * 초기 데이터베이스 연결 테스트 및 필요한 테이블 마이그레이션 실행
 */

require('dotenv').config();
const { testConnection } = require('./test-connection');
const { createAnalyticsJobsTable } = require('./migrations/create-analytics-jobs-table');
const { executeQuery } = require('../db');

/**
 * 데이터베이스 설정 및 마이그레이션 실행
 */
const setupDatabase = async () => {
  try {
    console.log('┌─────────────────────────────────────────────────┐');
    console.log('│ Database Setup and Migration                     │');
    console.log('└─────────────────────────────────────────────────┘');
    
    // 연결 테스트
    console.log('\n1. Testing database connection...');
    await testConnection();
    
    // 필요한 테이블 마이그레이션
    console.log('\n2. Running database migrations...');
    
    // 분석 작업 테이블 마이그레이션
    console.log('\n2.1. Setting up analytics_jobs table');
    const analyticsJobsResult = await createAnalyticsJobsTable();
    
    if (!analyticsJobsResult.success) {
      throw new Error(`Analytics jobs table migration failed: ${analyticsJobsResult.error}`);
    }
    
    // 마이그레이션 기록 저장
    const timestamp = new Date().toISOString();
    await executeQuery(
      `INSERT INTO analytics_jobs (job_type, status, start_time, end_time, parameters, result_summary) 
       VALUES (?, ?, ?, ?, ?, ?)`,
      [
        'databaseMigration',
        'completed',
        timestamp,
        timestamp,
        JSON.stringify({ migrationsRun: ['analytics_jobs'] }),
        JSON.stringify({ 
          success: true, 
          message: 'Initial database setup completed',
          timestamp
        })
      ]
    );
    
    console.log('\nDatabase setup completed successfully!');
    return { success: true };
  } catch (error) {
    console.error('Database setup failed:', error);
    return { 
      success: false, 
      error: error.message 
    };
  }
};

// 스크립트가 직접 실행될 때 설정 실행
if (require.main === module) {
  setupDatabase().then(result => {
    console.log('Setup result:', result);
    process.exit(result.success ? 0 : 1);
  }).catch(error => {
    console.error('Setup script failed:', error);
    process.exit(1);
  });
}

module.exports = { setupDatabase };
