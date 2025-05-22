/**
 * Firebase Functions - DB2 프로젝트 테스트
 * 
 * MariaDB 연결 테스트를 위한 기본 함수들
 */

// 환경 변수 로드
require('dotenv').config();

const functions = require('firebase-functions');
const cors = require('cors')({origin: true});

// 테스트 1: Hello World 함수
exports.helloWorld = functions.https.onRequest((req, res) => {
  cors(req, res, () => {
    res.json({
      message: 'Hello World!',
      timestamp: new Date().toISOString(),
      version: '1.0.0',
      status: 'success'
    });
  });
});

// 테스트 2: MariaDB 접속 테스트
exports.testConnection = functions.https.onRequest((req, res) => {
  cors(req, res, async () => {
    const mysql = require('mysql2/promise');
    
    try {
      const connection = await mysql.createConnection({
        host: '211.248.190.46',
        user: 'hermes',
        password: 'mcygicng!022',
        database: 'hermes',
        connectTimeout: 10000,
        acquireTimeout: 10000,
        timeout: 10000
      });

      // 간단한 테스트 쿼리 실행
      const [rows] = await connection.execute('SELECT 1 as test');
      
      await connection.end();
      
      res.json({
        status: 'success',
        message: 'MariaDB connection successful',
        timestamp: new Date().toISOString(),
        testResult: rows[0]
      });
      
    } catch (error) {
      console.error('Database connection error:', error);
      res.status(500).json({
        status: 'error',
        message: 'MariaDB connection failed',
        timestamp: new Date().toISOString(),
        error: error.message
      });
    }
  });
});

// 테스트 3: 2025년 4월 게임 유저 조회
exports.getAprilUsers = functions.https.onRequest((req, res) => {
  cors(req, res, async () => {
    const mysql = require('mysql2/promise');
    
    try {
      const connection = await mysql.createConnection({
        host: '211.248.190.46',
        user: 'hermes',
        password: 'mcygicng!022',
        database: 'hermes',
        connectTimeout: 10000,
        acquireTimeout: 10000,
        timeout: 10000
      });

      // 2025년 4월에 게임을 한 유저 조회 쿼리
      const limit = req.query.limit ? parseInt(req.query.limit) : null;
      const limitClause = limit ? `LIMIT ${limit}` : '';
      
      const query = `
        SELECT DISTINCT userId 
        FROM game_scores 
        WHERE gameDate >= '2025-04-01' 
        AND gameDate < '2025-05-01'
        ${limitClause}
      `;
      
      const [rows] = await connection.execute(query);
      
      await connection.end();
      
      res.json({
        status: 'success',
        message: '2025년 4월 게임 유저 조회 완료',
        timestamp: new Date().toISOString(),
        count: rows.length,
        users: rows
      });
      
    } catch (error) {
      console.error('Query error:', error);
      res.status(500).json({
        status: 'error',
        message: '2025년 4월 게임 유저 조회 실패',
        timestamp: new Date().toISOString(),
        error: error.message
      });
    }
  });
});

// 테스트 4: 고가치 유저 조회 (7일 이상 게임, minNetBet > 50,000)
exports.getHighValueUsers = functions.https.onRequest((req, res) => {
  cors(req, res, async () => {
    const mysql = require('mysql2/promise');
    
    try {
      const connection = await mysql.createConnection({
        host: '211.248.190.46',
        user: 'hermes',
        password: 'mcygicng!022',
        database: 'hermes',
        connectTimeout: 10000,
        acquireTimeout: 10000,
        timeout: 10000
      });

      // 7일 이상 게임하고 minNetBet > 50,000인 고가치 유저 조회
      const query = `
        SELECT 
          userId,
          COUNT(DISTINCT gameDate) as gameDays,
          SUM(netBet) as totalNetBet,
          SUM(totalBet) as totalBet,
          SUM(winLoss) as totalWinLoss
        FROM game_scores 
        WHERE netBet > 0
        GROUP BY userId
        HAVING gameDays >= 7 AND totalNetBet > 50000
        ORDER BY totalNetBet DESC
      `;
      
      const [rows] = await connection.execute(query);
      
      await connection.end();
      
      res.json({
        status: 'success',
        message: '고가치 유저 조회 완료 (전체)',
        timestamp: new Date().toISOString(),
        count: rows.length,
        criteria: {
          minGameDays: 7,
          minNetBet: 50000
        },
        users: rows
      });
      
    } catch (error) {
      console.error('Query error:', error);
      res.status(500).json({
        status: 'error',
        message: '고가치 유저 조회 실패',
        timestamp: new Date().toISOString(),
        error: error.message
      });
    }
  });
});

// 추가 테스트: 고가치 유저 수만 조회
exports.getHighValueUsersCount = functions.https.onRequest((req, res) => {
  cors(req, res, async () => {
    const mysql = require('mysql2/promise');
    
    try {
      const connection = await mysql.createConnection({
        host: '211.248.190.46',
        user: 'hermes',
        password: 'mcygicng!022',
        database: 'hermes',
        connectTimeout: 10000,
        acquireTimeout: 10000,
        timeout: 10000
      });

      // 조건에 맞는 고가치 유저 수만 카운트
      const countQuery = `
        SELECT COUNT(*) as totalCount
        FROM (
          SELECT 
            userId,
            COUNT(DISTINCT gameDate) as gameDays,
            SUM(netBet) as totalNetBet
          FROM game_scores 
          WHERE netBet > 0
          GROUP BY userId
          HAVING gameDays >= 7 AND totalNetBet > 50000
        ) as highValueUsers
      `;
      
      const [countResult] = await connection.execute(countQuery);
      
      await connection.end();
      
      res.json({
        status: 'success',
        message: '고가치 유저 수 조회 완료',
        timestamp: new Date().toISOString(),
        totalCount: countResult[0].totalCount,
        criteria: {
          minGameDays: 7,
          minNetBet: 50000
        }
      });
      
    } catch (error) {
      console.error('Query error:', error);
      res.status(500).json({
        status: 'error',
        message: '고가치 유저 수 조회 실패',
        timestamp: new Date().toISOString(),
        error: error.message
      });
    }
  });
});

// Task #27 - 활성 고가치 사용자 조회 API
exports.activeUsers = functions.https.onRequest((req, res) => {
  cors(req, res, async () => {
    const mysql = require('mysql2/promise');
    
    try {
      const connection = await mysql.createConnection({
        host: '211.248.190.46',
        user: 'hermes',
        password: 'mcygicng!022',
        database: 'hermes',
        connectTimeout: 10000,
        acquireTimeout: 10000,
        timeout: 10000
      });

      // 활성 고가치 사용자 쿼리 (최근 30일 내 게임 활동)
      const query = `
        SELECT 
          userId,
          COUNT(DISTINCT gameDate) as gameDays,
          SUM(netBet) as totalNetBet,
          SUM(totalBet) as totalBet,
          SUM(winLoss) as totalWinLoss,
          MAX(gameDate) as lastGameDate,
          DATEDIFF(CURDATE(), MAX(gameDate)) as daysSinceLastGame
        FROM game_scores 
        WHERE netBet > 0
        GROUP BY userId
        HAVING gameDays >= 7 AND totalNetBet > 50000 AND daysSinceLastGame <= 30
        ORDER BY totalNetBet DESC
        ${req.query.limit ? `LIMIT ${parseInt(req.query.limit)}` : ''}
      `;
      
      const [rows] = await connection.execute(query);
      
      await connection.end();
      
      res.json({
        status: 'success',
        message: '활성 고가치 사용자 조회 완료',
        timestamp: new Date().toISOString(),
        count: rows.length,
        criteria: {
          minGameDays: 7,
          minNetBet: 50000,
          maxDaysSinceLastGame: 30
        },
        data: rows
      });
      
    } catch (error) {
      console.error('Query error:', error);
      res.status(500).json({
        status: 'error',
        message: '활성 고가치 사용자 조회 실패',
        timestamp: new Date().toISOString(),
        error: error.message
      });
    }
  });
});

// Task #27 - 휴면 고가치 사용자 조회 API
exports.dormantUsers = functions.https.onRequest((req, res) => {
  cors(req, res, async () => {
    const mysql = require('mysql2/promise');
    
    try {
      const connection = await mysql.createConnection({
        host: '211.248.190.46',
        user: 'hermes',
        password: 'mcygicng!022',
        database: 'hermes',
        connectTimeout: 10000,
        acquireTimeout: 10000,
        timeout: 10000
      });

      // 휴면 고가치 사용자 쿼리 (30일 이상 게임 안함)
      const query = `
        SELECT 
          userId,
          COUNT(DISTINCT gameDate) as gameDays,
          SUM(netBet) as totalNetBet,
          SUM(totalBet) as totalBet,
          SUM(winLoss) as totalWinLoss,
          MAX(gameDate) as lastGameDate,
          DATEDIFF(CURDATE(), MAX(gameDate)) as daysSinceLastGame
        FROM game_scores 
        WHERE netBet > 0
        GROUP BY userId
        HAVING gameDays >= 7 AND totalNetBet > 50000 AND daysSinceLastGame > 30
        ORDER BY totalNetBet DESC
        ${req.query.limit ? `LIMIT ${parseInt(req.query.limit)}` : ''}
      `;
      
      const [rows] = await connection.execute(query);
      
      await connection.end();
      
      res.json({
        status: 'success',
        message: '휴면 고가치 사용자 조회 완료',
        timestamp: new Date().toISOString(),
        count: rows.length,
        criteria: {
          minGameDays: 7,
          minNetBet: 50000,
          minDaysSinceLastGame: 30
        },
        data: rows
      });
      
    } catch (error) {
      console.error('Query error:', error);
      res.status(500).json({
        status: 'error',
        message: '휴면 고가치 사용자 조회 실패',
        timestamp: new Date().toISOString(),
        error: error.message
      });
    }
  });
});

// Task #27 - 고가치 사용자 통합 API (Express 라우터 기반)
exports.highValueUsersApi = functions.https.onRequest((req, res) => {
  cors(req, res, async () => {
    const mysql = require('mysql2/promise');
    const path = req.path;
    
    console.log('API Path:', path);
    
    try {
      const connection = await mysql.createConnection({
        host: '211.248.190.46',
        user: 'hermes',
        password: 'mcygicng!022',
        database: 'hermes',
        connectTimeout: 10000,
        acquireTimeout: 10000,
        timeout: 10000
      });

      // 경로에 따른 쿼리 선택
      let query = '';
      let message = '';
      let criteria = {};
      
      if (path.includes('/active') || path === '/active') {
        // 활성 사용자
        query = `
          SELECT 
            userId,
            COUNT(DISTINCT gameDate) as gameDays,
            SUM(netBet) as totalNetBet,
            SUM(totalBet) as totalBet,
            SUM(winLoss) as totalWinLoss,
            MAX(gameDate) as lastGameDate,
            DATEDIFF(CURDATE(), MAX(gameDate)) as daysSinceLastGame
          FROM game_scores 
          WHERE netBet > 0
          GROUP BY userId
          HAVING gameDays >= 7 AND totalNetBet > 50000 AND daysSinceLastGame <= 30
          ORDER BY totalNetBet DESC
        `;
        message = '활성 고가치 사용자 조회 완료';
        criteria = { minGameDays: 7, minNetBet: 50000, maxDaysSinceLastGame: 30 };
        
      } else if (path.includes('/dormant') || path === '/dormant') {
        // 휴면 사용자
        query = `
          SELECT 
            userId,
            COUNT(DISTINCT gameDate) as gameDays,
            SUM(netBet) as totalNetBet,
            SUM(totalBet) as totalBet,
            SUM(winLoss) as totalWinLoss,
            MAX(gameDate) as lastGameDate,
            DATEDIFF(CURDATE(), MAX(gameDate)) as daysSinceLastGame
          FROM game_scores 
          WHERE netBet > 0
          GROUP BY userId
          HAVING gameDays >= 7 AND totalNetBet > 50000 AND daysSinceLastGame > 30
          ORDER BY totalNetBet DESC
        `;
        message = '휴면 고가치 사용자 조회 완료';
        criteria = { minGameDays: 7, minNetBet: 50000, minDaysSinceLastGame: 30 };
        
      } else {
        // 기본: 전체 고가치 사용자
        query = `
          SELECT 
            userId,
            COUNT(DISTINCT gameDate) as gameDays,
            SUM(netBet) as totalNetBet,
            SUM(totalBet) as totalBet,
            SUM(winLoss) as totalWinLoss,
            MAX(gameDate) as lastGameDate,
            DATEDIFF(CURDATE(), MAX(gameDate)) as daysSinceLastGame
          FROM game_scores 
          WHERE netBet > 0
          GROUP BY userId
          HAVING gameDays >= 7 AND totalNetBet > 50000
          ORDER BY totalNetBet DESC
        `;
        message = '전체 고가치 사용자 조회 완료';
        criteria = { minGameDays: 7, minNetBet: 50000 };
      }
      
      const [rows] = await connection.execute(query);
      
      await connection.end();
      
      res.json({
        status: 'success',
        message: message,
        timestamp: new Date().toISOString(),
        count: rows.length,
        criteria: criteria,
        data: rows,
        success: true
      });
      
    } catch (error) {
      console.error('Query error:', error);
      res.status(500).json({
        status: 'error',
        message: '고가치 사용자 조회 실패',
        timestamp: new Date().toISOString(),
        error: error.message,
        success: false
      });
    }
  });
});


// 최근 게임 날짜 조회 함수
exports.getLatestGameDate = functions.https.onRequest((req, res) => {
  cors(req, res, async () => {
    const mysql = require('mysql2/promise');
    
    try {
      const connection = await mysql.createConnection({
        host: '211.248.190.46',
        user: 'hermes',
        password: 'mcygicng!022',
        database: 'hermes',
        connectTimeout: 10000,
        acquireTimeout: 10000,
        timeout: 10000
      });

      // 최근 게임 날짜 조회
      const query = `
        SELECT 
          MAX(gameDate) as latestGameDate,
          COUNT(DISTINCT gameDate) as totalGameDays,
          COUNT(DISTINCT userId) as totalUniqueUsers,
          COUNT(*) as totalGameRecords
        FROM game_scores
      `;
      
      const [rows] = await connection.execute(query);
      
      // 최근 일주일 간 게임 활동도 조회
      const recentQuery = `
        SELECT 
          gameDate,
          COUNT(DISTINCT userId) as uniqueUsers,
          COUNT(*) as totalGames
        FROM game_scores 
        WHERE gameDate >= DATE_SUB(CURDATE(), INTERVAL 7 DAY)
        GROUP BY gameDate
        ORDER BY gameDate DESC
        LIMIT 10
      `;
      
      const [recentRows] = await connection.execute(recentQuery);
      
      await connection.end();
      
      res.json({
        status: 'success',
        message: '최근 게임 날짜 조회 완료',
        timestamp: new Date().toISOString(),
        latestData: rows[0],
        recentActivity: recentRows,
        success: true
      });
      
    } catch (error) {
      console.error('Query error:', error);
      res.status(500).json({
        status: 'error',
        message: '최근 게임 날짜 조회 실패',
        timestamp: new Date().toISOString(),
        error: error.message,
        success: false
      });
    }
  });
});

// 보안이 적용된 API 엔드포인트 추가
const secureApi = require('./src/secure-api');
exports.secureHighValueUsersApi = secureApi.secureHighValueUsersApi;
