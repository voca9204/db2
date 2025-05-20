/**
 * Firebase Functions - DB2 프로젝트
 * 
 * Firebase Functions를 통해 제공되는 API 엔드포인트들을 정의합니다.
 */

// 환경 변수 로드
require('dotenv').config();

const functions = require('firebase-functions');
const admin = require('firebase-admin');
const { getFirebaseApp } = require('./src/firebase/firebase-admin');

// Firebase 초기화 (싱글턴 패턴)
getFirebaseApp();

// 고가치 사용자 분석 API 임포트
const highValueUsersAnalysis = require('./src/highValueUsersAnalysis').highValueUsersAnalysis;
const highValueUserReport = require('./src/highValueUserReport').highValueUserReport;

// API 엔드포인트 내보내기
exports.highValueUsersAnalysis = highValueUsersAnalysis;
exports.highValueUserReport = highValueUserReport;

// 데이터베이스 연결 테스트 함수 추가
const testDbConnection = require('./src/testDbConnection').testDbConnection;
exports.testDbConnection = testDbConnection;

// Hello World 함수 추가
const helloWorld = require('./src/helloWorld').helloWorld;
exports.helloWorld = helloWorld;

// 기본 상태 확인 엔드포인트
exports.healthCheck = functions.https.onRequest((req, res) => {
  res.json({
    status: 'ok',
    timestamp: new Date().toISOString(),
    message: 'DB2 Analytics API is running',
    version: '1.0.0'
  });
});

// 활성 고가치 사용자 API
exports.activeUsers = functions.https.onRequest(async (req, res) => {
  try {
    // 매개변수 추출 및 기본값 설정 - minNetBet 낮춤
    const minNetBet = parseInt(req.query.minNetBet || '1000', 10); // 10000에서 1000으로 낮춤
    const limit = parseInt(req.query.limit || '10', 10);
    
    console.log('ActiveUsers API 요청 매개변수:', { minNetBet, limit });
    
    // 데이터베이스 연결 모듈 임포트
    const mysql = require('mysql2/promise');
    
    // 데이터베이스 연결 설정
    const dbConfig = {
      host: process.env.DB_HOST || '211.248.190.46',
      user: process.env.DB_USER || 'hermes',
      password: process.env.DB_PASSWORD || 'mcygicng!022',
      database: process.env.DB_NAME || 'hermes',
      waitForConnections: true,
      connectionLimit: 2,
      queueLimit: 0,
      connectTimeout: 10000
    };
    
    console.log('데이터베이스 연결 시도...');
    const pool = mysql.createPool(dbConfig);
    const connection = await pool.getConnection();
    console.log('데이터베이스 연결 성공');
    
    // 먼저 테이블 구조 확인
    console.log('game_scores 테이블 구조 확인 중...');
    const [columns] = await connection.query(`
      SHOW COLUMNS FROM game_scores
    `);
    console.log('game_scores 테이블 컬럼:', columns.map(col => col.Field));
    
    // 추가 스키마 분석 쿼리
    console.log('테이블 샘플 데이터 확인 중...');
    const [samplePlayer] = await connection.query(`
      SELECT * FROM players LIMIT 1
    `);
    console.log('players 샘플 데이터:', samplePlayer[0]);
    
    const [sampleGameScore] = await connection.query(`
      SELECT * FROM game_scores LIMIT 1
    `);
    console.log('game_scores 샘플 데이터:', sampleGameScore[0]);
    
    // 단순화된 쿼리 (필수 조건만 유지)
    const query = `
      SELECT 
        p.userId,
        COUNT(*) as loginCount,
        MAX(gs.gameDate) as lastActivity,
        DATEDIFF(CURRENT_DATE, MAX(gs.gameDate)) as inactiveDays,
        ROUND(SUM(gs.netBet)) as netBet
      FROM players p
      JOIN game_scores gs ON p.userId = gs.userId
      GROUP BY p.userId
      HAVING SUM(gs.netBet) >= ?
      LIMIT ?
    `;
    
    console.log('쿼리 실행 중...');
    const [rows, fields] = await connection.query(query, [minNetBet, limit]);
    console.log(`쿼리 결과: ${rows.length}개 행 반환됨`);
    
    // 연결 해제
    connection.release();
    console.log('데이터베이스 연결 해제');
    
    // 결과 변환 및 반환
    const users = rows.map(row => ({
      userId: row.userId,
      netBet: row.netBet,
      lastActivity: row.lastActivity,
      inactiveDays: row.inactiveDays,
      loginCount: row.loginCount
    }));
    
    res.json({
      success: true,
      message: "Active high-value users retrieved from database",
      params: {
        minNetBet,
        limit
      },
      data: users,
      count: users.length,
      timestamp: new Date().toISOString()
    });
  } catch (error) {
    console.error('activeUsers API 오류:', error);
    res.status(500).json({
      success: false,
      message: "Error fetching active high-value users",
      error: {
        message: error.message,
        code: error.code,
        sqlState: error.sqlState,
        sqlMessage: error.sqlMessage
      }
    });
  }
});

// 휴면 고가치 사용자 API
exports.dormantUsers = functions.https.onRequest(async (req, res) => {
  try {
    // 매개변수 추출 및 기본값 설정 - minNetBet 낮춤
    const minNetBet = parseInt(req.query.minNetBet || '1000', 10); // 10000에서 1000으로 낮춤
    const minInactiveDays = parseInt(req.query.minInactiveDays || '30', 10);
    const limit = parseInt(req.query.limit || '10', 10);
    
    console.log('DormantUsers API 요청 매개변수:', { minNetBet, minInactiveDays, limit });
    
    // 데이터베이스 연결 모듈 임포트
    const mysql = require('mysql2/promise');
    
    // 데이터베이스 연결 설정
    const dbConfig = {
      host: process.env.DB_HOST || '211.248.190.46',
      user: process.env.DB_USER || 'hermes',
      password: process.env.DB_PASSWORD || 'mcygicng!022',
      database: process.env.DB_NAME || 'hermes',
      waitForConnections: true,
      connectionLimit: 2,
      queueLimit: 0,
      connectTimeout: 10000
    };
    
    console.log('데이터베이스 연결 시도...');
    const pool = mysql.createPool(dbConfig);
    const connection = await pool.getConnection();
    console.log('데이터베이스 연결 성공');
    
    // 먼저 테이블 구조 확인
    console.log('game_scores 테이블 구조 확인 중...');
    const [columns] = await connection.query(`
      SHOW COLUMNS FROM game_scores
    `);
    console.log('game_scores 테이블 컬럼:', columns.map(col => col.Field));
    
    // 플레이어 테이블 구조도 확인
    console.log('players 테이블 구조 확인 중...');
    const [playerColumns] = await connection.query(`
      SHOW COLUMNS FROM players
    `);
    console.log('players 테이블 컬럼:', playerColumns.map(col => col.Field));
    
    // 테이블 샘플 데이터 확인
    console.log('테이블 샘플 데이터 확인 중...');
    const [samplePlayer] = await connection.query(`
      SELECT * FROM players LIMIT 1
    `);
    console.log('players 샘플 데이터:', samplePlayer[0]);
    
    const [sampleGameScore] = await connection.query(`
      SELECT * FROM game_scores LIMIT 1
    `);
    console.log('game_scores 샘플 데이터:', sampleGameScore[0]);
    
    // 조건을 단계적으로 제거한 테스트 쿼리
    console.log('기본 테스트 쿼리 실행 (필터 최소화)...');
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
      LIMIT 10
    `;
    
    const [testRows] = await connection.query(testQuery);
    console.log(`기본 테스트 쿼리 결과: ${testRows.length}개 행`);
    if (testRows.length > 0) {
      console.log('테스트 쿼리 첫 번째 결과:', testRows[0]);
    }
    
    // netBet 값 분포 확인
    console.log('netBet 값 분포 확인 중...');
    const distributionQuery = `
      SELECT 
        CASE
          WHEN SUM(gs.netBet) < 10000 THEN 'under_10k'
          WHEN SUM(gs.netBet) < 50000 THEN '10k_to_50k'
          WHEN SUM(gs.netBet) >= 50000 THEN 'over_50k'
        END as netBetRange,
        COUNT(*) as userCount
      FROM players p
      JOIN game_scores gs ON p.id = gs.userId
      GROUP BY netBetRange
      ORDER BY netBetRange
    `;
    
    const [distributionRows] = await connection.query(distributionQuery);
    console.log('netBet 값 분포:', distributionRows);
    
    // 다양한 조인 조건 테스트
    console.log('다양한 조인 조건 테스트 중...');
    
    // 조인 조건 1: p.id = gs.userId
    const joinTest1 = `
      SELECT COUNT(*) as count 
      FROM players p
      JOIN game_scores gs ON p.id = gs.userId
    `;
    const [joinResult1] = await connection.query(joinTest1);
    console.log('조인 테스트 (p.id = gs.userId):', joinResult1[0].count);
    
    // 조인 조건 2: p.userId = gs.userId
    const joinTest2 = `
      SELECT COUNT(*) as count 
      FROM players p
      JOIN game_scores gs ON p.userId = gs.userId
    `;
    const [joinResult2] = await connection.query(joinTest2);
    console.log('조인 테스트 (p.userId = gs.userId):', joinResult2[0].count);
    
    // 조인 조건 3: 문자열 변환 테스트
    const joinTest3 = `
      SELECT COUNT(*) as count 
      FROM players p
      JOIN game_scores gs ON p.id = CAST(gs.userId AS SIGNED)
    `;
    
    try {
      const [joinResult3] = await connection.query(joinTest3);
      console.log('조인 테스트 (p.id = CAST(gs.userId AS SIGNED)):', joinResult3[0].count);
    } catch (error) {
      console.log('조인 테스트 3 오류:', error.message);
    }
    
    // 날짜 관련 테스트
    console.log('날짜 관련 테스트 중...');
    const dateTest = `
      SELECT 
        CURRENT_DATE as currentDate,
        COUNT(*) as totalUsers,
        COUNT(CASE WHEN DATEDIFF(CURRENT_DATE, MAX(gs.gameDate)) < 30 THEN 1 END) as activeUsers,
        COUNT(CASE WHEN DATEDIFF(CURRENT_DATE, MAX(gs.gameDate)) >= 30 THEN 1 END) as dormantUsers
      FROM players p
      JOIN game_scores gs ON p.id = gs.userId
      GROUP BY currentDate
    `;
    const [dateResult] = await connection.query(dateTest);
    console.log('날짜 테스트 결과:', dateResult[0]);
    
    // 단순화된 쿼리 (필수 조건만 유지)
    const query = `
      SELECT 
        p.userId,
        COUNT(*) as loginCount,
        MAX(gs.gameDate) as lastActivity,
        DATEDIFF(CURRENT_DATE, MAX(gs.gameDate)) as inactiveDays,
        ROUND(SUM(gs.netBet)) as netBet
      FROM players p
      JOIN game_scores gs ON p.userId = gs.userId
      GROUP BY p.userId
      HAVING SUM(gs.netBet) >= ?
      AND DATEDIFF(CURRENT_DATE, MAX(gs.gameDate)) >= ?
      LIMIT ?
    `;
    
    console.log('쿼리 실행 중...');
    const [rows, fields] = await connection.query(query, [minNetBet, minInactiveDays, limit]);
    console.log(`쿼리 결과: ${rows.length}개 행 반환됨`);
    
    // 연결 해제
    connection.release();
    console.log('데이터베이스 연결 해제');
    
    // 결과 변환 및 반환
    const users = rows.map(row => ({
      userId: row.userId,
      netBet: row.netBet,
      lastActivity: row.lastActivity,
      inactiveDays: row.inactiveDays,
      loginCount: row.loginCount
    }));
    
    res.json({
      success: true,
      message: "Dormant high-value users retrieved from database",
      params: {
        minNetBet,
        minInactiveDays,
        limit
      },
      data: users,
      count: users.length,
      timestamp: new Date().toISOString()
    });
  } catch (error) {
    console.error('dormantUsers API 오류:', error);
    res.status(500).json({
      success: false,
      message: "Error fetching dormant high-value users",
      error: {
        message: error.message,
        code: error.code,
        sqlState: error.sqlState,
        sqlMessage: error.sqlMessage
      }
    });
  }
});
