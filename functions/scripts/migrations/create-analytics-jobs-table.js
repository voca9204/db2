/**
 * 분석 작업 기록 테이블 마이그레이션 스크립트
 */

require('dotenv').config();
const { executeQuery, withTransaction } = require('../../db');

const createAnalyticsJobsTable = async () => {
  try {
    console.log('Starting analytics_jobs table migration...');
    
    // 테이블 생성 쿼리
    const createTableQuery = `
    CREATE TABLE IF NOT EXISTS analytics_jobs (
      id INT AUTO_INCREMENT PRIMARY KEY,
      job_type VARCHAR(50) NOT NULL COMMENT '작업 유형 (ex: highValueUserAnalysis, eventConversionAnalysis)',
      status VARCHAR(20) NOT NULL COMMENT '작업 상태 (pending, running, completed, failed)',
      start_time DATETIME NOT NULL COMMENT '작업 시작 시간',
      end_time DATETIME NULL COMMENT '작업 완료 시간',
      parameters JSON NULL COMMENT '작업 매개변수',
      result_summary JSON NULL COMMENT '작업 결과 요약',
      error_message TEXT NULL COMMENT '오류 메시지 (실패 시)',
      created_by VARCHAR(100) NULL COMMENT '작업 생성자',
      created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP COMMENT '레코드 생성 시간',
      updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP COMMENT '레코드 수정 시간',
      INDEX idx_job_type (job_type),
      INDEX idx_status (status),
      INDEX idx_start_time (start_time)
    ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci COMMENT='분석 작업 기록';
    `;
    
    // 트랜잭션 내에서 테이블 생성
    await withTransaction(async (connection) => {
      // 기존 테이블 확인
      const [tables] = await connection.execute("SHOW TABLES LIKE 'analytics_jobs'");
      
      if (tables.length > 0) {
        console.log('Table analytics_jobs already exists, checking structure...');
        
        // 기존 컬럼 확인
        const [columns] = await connection.execute("SHOW COLUMNS FROM analytics_jobs");
        const columnNames = columns.map(col => col.Field);
        
        // 누락된 컬럼 추가 (필요시)
        if (!columnNames.includes('result_summary')) {
          console.log('Adding missing column: result_summary');
          await connection.execute("ALTER TABLE analytics_jobs ADD COLUMN result_summary JSON NULL COMMENT '작업 결과 요약' AFTER parameters");
        }
        
        if (!columnNames.includes('created_by')) {
          console.log('Adding missing column: created_by');
          await connection.execute("ALTER TABLE analytics_jobs ADD COLUMN created_by VARCHAR(100) NULL COMMENT '작업 생성자' AFTER error_message");
        }
        
        console.log('Table structure updated successfully');
      } else {
        // 테이블 생성
        console.log('Creating table: analytics_jobs');
        await connection.execute(createTableQuery);
        console.log('Table created successfully');
      }
    });
    
    console.log('Migration completed successfully');
    return { success: true, message: 'Analytics jobs table migration completed' };
  } catch (error) {
    console.error('Migration failed:', error);
    return { 
      success: false, 
      message: 'Migration failed', 
      error: error.message 
    };
  }
};

// 스크립트가 직접 실행될 때 마이그레이션 실행
if (require.main === module) {
  createAnalyticsJobsTable().then(result => {
    console.log('Migration result:', result);
    process.exit(result.success ? 0 : 1);
  }).catch(error => {
    console.error('Migration script failed:', error);
    process.exit(1);
  });
}

module.exports = { createAnalyticsJobsTable };
