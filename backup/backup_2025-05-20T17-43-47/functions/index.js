/**
 * DB2 프로젝트 Firebase Functions
 * 
 * 고가치 사용자 분석을 위한 함수 모음
 */

const functions = require('firebase-functions');
const cors = require('cors')({ origin: true });
const mysql = require('mysql2/promise');

// 함수 런타임 옵션
const runtimeOpts = {
  timeoutSeconds: 60,
  memory: '1GB'
};

// Firebase Admin SDK 초기화
const admin = require('firebase-admin');
if (!admin.apps.length) {
  admin.initializeApp();
}

/**
 * 기본 테스트 함수 - Firebase Functions 배포 테스트
 */
exports.basicTest = functions.https.onRequest((req, res) => {
  console.log('Basic test function executed successfully');
  
  // 실행 시간 기록
  const startTime = new Date();
  
  // 간단한 응답 생성
  const response = {
    status: 'success',
    message: 'Firebase Functions basic test successful',
    timestamp: startTime.toISOString(),
    headers: req.headers,
    method: req.method,
    query: req.query,
    functionName: 'basicTest'
  };
  
  // 실행 시간 로깅
  const endTime = new Date();
  const executionTime = endTime - startTime;
  console.log(`Function executed in ${executionTime}ms`);
  
  // 응답 반환
  res.status(200).json(response);
});

/**
 * 데이터베이스 연결 테스트 함수
 */
exports.dbConnectionTest = functions.https.onRequest(async (req, res) => {
  console.log('Database connection test function called');
  
  // 실행 시간 기록
  const startTime = new Date();
  
  try {
    // 데이터베이스 연결 모듈 import
    const { getConnection } = require('./src/database/connection');
    
    console.log('Getting database connection...');
    
    // 연결 생성
    const connection = await getConnection();
    console.log('Connection established successfully');
    
    // 테스트 쿼리 실행
    const [rows] = await connection.query('SELECT 1 AS test_value');
    console.log('Query executed successfully:', rows);
    
    // 연결 반환
    connection.release();
    console.log('Connection released');
    
    // 실행 시간 계산
    const endTime = new Date();
    const executionTime = endTime - startTime;
    console.log(`Function executed in ${executionTime}ms`);
    
    // 응답 반환
    res.status(200).json({
      status: 'success',
      message: 'Database connection test successful',
      result: rows,
      timestamp: endTime.toISOString(),
      executionTime: executionTime
    });
  } catch (error) {
    console.error('Database connection test failed:', error);
    
    // 실행 시간 계산
    const endTime = new Date();
    const executionTime = endTime - startTime;
    
    // 오류 응답 반환
    res.status(500).json({
      status: 'error',
      message: 'Database connection test failed',
      error: error.message,
      timestamp: endTime.toISOString(),
      executionTime: executionTime
    });
  }
});

/**
 * 간소화된 고가치 사용자 보고서 API
 */
exports.getSimplifiedHighValueUserReport = functions
  .runWith(runtimeOpts)
  .https.onRequest(async (req, res) => {
    cors(req, res, async () => {
      try {
        // 요청 파라미터 파싱
        const days = parseInt(req.query.days || '30', 10);
        const limit = parseInt(req.query.limit || '100', 10);
        const minBetting = parseInt(req.query.minBetting || '1000000', 10);
        
        // 입력 값 검증
        if (isNaN(days) || days <= 0) {
          return res.status(400).json({ error: 'Invalid days parameter' });
        }
        if (isNaN(limit) || limit <= 0) {
          return res.status(400).json({ error: 'Invalid limit parameter' });
        }
        if (isNaN(minBetting) || minBetting < 0) {
          return res.status(400).json({ error: 'Invalid minBetting parameter' });
        }
        
        // 함수 실행 및 응답
        const startTime = Date.now();
        const users = await getSimplifiedHighValueUsers(days, limit, minBetting);
        const duration = Date.now() - startTime;
        
        // 요약 통계 계산
        const activeUsers = users.filter(u => u.user_status === 'active').length;
        const inactiveUsers = users.filter(u => u.user_status === 'inactive').length;
        const totalBetting = users.reduce((sum, u) => sum + parseFloat(u.total_betting || 0), 0);
        const totalDeposits = users.reduce((sum, u) => sum + parseFloat(u.total_deposits || 0), 0);
        
        // 응답 데이터 구성
        const response = {
          meta: {
            total_users: users.length,
            active_users: activeUsers,
            inactive_users: inactiveUsers,
            execution_time_ms: duration,
            parameters: { days, limit, minBetting }
          },
          summary: {
            total_betting: totalBetting,
            total_deposits: totalDeposits,
            betting_to_deposit_ratio: totalDeposits > 0 ? (totalBetting / totalDeposits).toFixed(2) : 'N/A'
          },
          users: users
        };
        
        res.json(response);
      } catch (error) {
        console.error('Error in simplified high-value user report:', error);
        res.status(500).json({ 
          error: 'Internal server error', 
          message: error.message,
          stack: process.env.NODE_ENV === 'development' ? error.stack : undefined
        });
      }
    });
  });

/**
 * 페이지네이션을 지원하는 고가치 사용자 보고서 API
 */
exports.getPaginatedHighValueUserReport = functions
  .runWith(runtimeOpts)
  .https.onRequest(async (req, res) => {
    cors(req, res, async () => {
      try {
        // 요청 파라미터 파싱 및 검증
        const days = parseInt(req.query.days || '30', 10);
        const page = parseInt(req.query.page || '1', 10);
        const pageSize = parseInt(req.query.pageSize || '20', 10);
        const minBetting = parseInt(req.query.minBetting || '1000000', 10);
        
        // 입력 값 검증
        if (isNaN(days) || days <= 0) {
          return res.status(400).json({ error: 'Invalid days parameter' });
        }
        if (isNaN(page) || page <= 0) {
          return res.status(400).json({ error: 'Invalid page parameter' });
        }
        if (isNaN(pageSize) || pageSize <= 0 || pageSize > 100) {
          return res.status(400).json({ error: 'Invalid pageSize parameter (must be between 1 and 100)' });
        }
        
        // 함수 실행 및 응답
        const startTime = Date.now();
        const result = await getPaginatedHighValueUsers(days, page, pageSize, minBetting);
        const duration = Date.now() - startTime;
        
        // 응답 데이터 구성
        res.json({
          meta: {
            execution_time_ms: duration,
            parameters: { days, page, pageSize, minBetting }
          },
          pagination: result.pagination,
          users: result.users
        });
      } catch (error) {
        console.error('Error in paginated high-value user report:', error);
        res.status(500).json({ 
          error: 'Internal server error', 
          message: error.message
        });
      }
    });
  });

/**
 * 상세 고가치 사용자 분석 보고서 API
 */
exports.getDetailedHighValueUserReport = functions
  .runWith(runtimeOpts)
  .https.onRequest(async (req, res) => {
    cors(req, res, async () => {
      try {
        // 요청 파라미터 파싱
        const days = parseInt(req.query.days || '30', 10);
        const minBetting = parseInt(req.query.minBetting || '1000000', 10);
        const limit = req.query.limit ? parseInt(req.query.limit, 10) : null;
        const includeEventAnalysis = req.query.includeEventAnalysis !== 'false';
        const includeDepositAnalysis = req.query.includeDepositAnalysis !== 'false';
        const format = req.query.format || 'json'; // 'json' 또는 'html'
        
        // 입력 값 검증
        if (isNaN(days) || days <= 0) {
          return res.status(400).json({ error: 'Invalid days parameter' });
        }
        if (isNaN(minBetting) || minBetting < 0) {
          return res.status(400).json({ error: 'Invalid minBetting parameter' });
        }
        if (limit !== null && (isNaN(limit) || limit <= 0)) {
          return res.status(400).json({ error: 'Invalid limit parameter' });
        }
        
        // 함수 실행 및 응답
        const options = {
          days,
          minBetting,
          limit,
          includeEventAnalysis,
          includeDepositAnalysis
        };
        
        const report = await getDetailedHighValueUserReport(options);
        
        // 응답 형식에 따라 반환
        if (format === 'html') {
          const { generateHtmlReport } = require('./src/high-value-users/report-generator');
          res.set('Content-Type', 'text/html');
          res.send(generateHtmlReport(report));
        } else {
          res.json(report);
        }
      } catch (error) {
        console.error('Error in detailed high-value user report:', error);
        res.status(500).json({ 
          error: 'Internal server error', 
          message: error.message
        });
      }
    });
  });

/**
 * 웜업 함수 - 콜드 스타트 방지
 */
exports.warmupFunctions = functions.pubsub
  .schedule('every 5 minutes')
  .onRun(async (context) => {
    try {
      // 데이터베이스 연결 테스트
      const { getConnection } = require('./src/database/connection');
      const connection = await getConnection();
      await connection.query('SELECT 1');
      connection.release();
      
      console.log('Warmup successful at', new Date().toISOString());
      return null;
    } catch (error) {
      console.error('Warmup failed:', error);
      return null;
    }
  });

/**
 * 순수 베팅액(netBet) 기준 고가치 사용자 조회 API
 * 
 * 이 함수는 지정된 기간 동안 최소 순수 베팅액(netBet) 이상을 사용한
 * 고가치 사용자를 조회합니다.
 * 
 * 쿼리 파라미터:
 * - minNetBet: 최소 순수 베팅액 (기본값: 50000)
 * - days: 분석할 일수 (기본값: 30일)
 * - limit: 페이지당 결과 수 (기본값: 100)
 * - page: 페이지 번호 (기본값: 1)
 */
exports.getHighValueUsersByNetBet = functions
  .runWith(runtimeOpts)
  .https.onRequest(async (req, res) => {
    cors(req, res, async () => {
      try {
        // 요청 파라미터 파싱
        const minNetBet = parseInt(req.query.minNetBet || '50000', 10);
        const days = parseInt(req.query.days || '30', 10);
        const limit = parseInt(req.query.limit || '100', 10);
        const page = parseInt(req.query.page || '1', 10);
        
        // 입력값 검증
        if (isNaN(minNetBet) || minNetBet < 0) {
          return res.status(400).json({ error: 'Invalid minNetBet parameter' });
        }
        if (isNaN(days) || days <= 0) {
          return res.status(400).json({ error: 'Invalid days parameter' });
        }
        if (isNaN(limit) || limit <= 0 || limit > 500) {
          return res.status(400).json({ error: 'Invalid limit parameter (must be between 1 and 500)' });
        }
        if (isNaN(page) || page <= 0) {
          return res.status(400).json({ error: 'Invalid page parameter' });
        }
        
        // 날짜 계산
        const cutoffDate = new Date();
        cutoffDate.setDate(cutoffDate.getDate() - days);
        const cutoffDateStr = cutoffDate.toISOString().split('T')[0];
        
        // 페이지네이션 계산
        const offset = (page - 1) * limit;
        
        // 풀 생성
        const pool = mysql.createPool({
          host: '211.248.190.46',
          user: 'hermes',
          password: 'mcygicng!022',
          database: 'hermes',
          waitForConnections: true,
          connectionLimit: 5,
          queueLimit: 0
        });
        
        try {
          // 함수 실행 시작 시간
          const startTime = Date.now();
          
          // 총 결과 수 쿼리
          const countQuery = `
            SELECT COUNT(*) AS total_count
            FROM (
              SELECT 
                p.userId
              FROM 
                players p
              JOIN 
                game_scores gs ON p.userId = gs.userId AND gs.gameDate >= ?
              GROUP BY 
                p.userId
              HAVING 
                SUM(gs.netBet) >= ?
            ) AS high_value_users
          `;
          
          // 데이터 쿼리
          const dataQuery = `
            SELECT 
              p.userId, 
              SUM(gs.totalBet) AS total_betting,
              SUM(gs.netBet) AS net_betting,
              SUM(gs.winLoss) AS win_loss,
              COUNT(DISTINCT gs.gameDate) AS active_days,
              MAX(gs.gameDate) AS last_activity_date,
              MIN(gs.gameDate) AS first_activity_date,
              DATEDIFF(MAX(gs.gameDate), MIN(gs.gameDate)) + 1 AS day_span,
              CASE
                WHEN MAX(gs.gameDate) >= DATE_SUB(CURRENT_DATE, INTERVAL 7 DAY) THEN 'active'
                WHEN MAX(gs.gameDate) >= DATE_SUB(CURRENT_DATE, INTERVAL 30 DAY) THEN 'inactive_recent'
                ELSE 'inactive_long'
              END AS user_status
            FROM 
              players p
            JOIN 
              game_scores gs ON p.userId = gs.userId AND gs.gameDate >= ?
            GROUP BY 
              p.userId
            HAVING 
              SUM(gs.netBet) >= ?
            ORDER BY 
              net_betting DESC
            LIMIT ? OFFSET ?
          `;
          
          // 쿼리 실행
          const [countResults] = await pool.query(countQuery, [cutoffDateStr, minNetBet]);
          const [users] = await pool.query(dataQuery, [cutoffDateStr, minNetBet, limit, offset]);
          
          // 결과 처리
          const totalCount = countResults[0]?.total_count || 0;
          const totalPages = Math.ceil(totalCount / limit);
          
          // 결과 변환
          const processedUsers = users.map(user => ({
            ...user,
            total_betting: parseFloat(user.total_betting || 0),
            net_betting: parseFloat(user.net_betting || 0),
            win_loss: parseFloat(user.win_loss || 0),
            active_days: parseInt(user.active_days || 0, 10),
            day_span: parseInt(user.day_span || 0, 10),
            activity_ratio: user.day_span > 0 ? parseFloat((user.active_days / user.day_span).toFixed(2)) : 0
          }));
          
          // 요약 통계
          const activeUsers = processedUsers.filter(u => u.user_status === 'active').length;
          const inactiveRecentUsers = processedUsers.filter(u => u.user_status === 'inactive_recent').length;
          const inactiveLongUsers = processedUsers.filter(u => u.user_status === 'inactive_long').length;
          
          const totalNetBetting = processedUsers.reduce((sum, u) => sum + u.net_betting, 0);
          const totalWinLoss = processedUsers.reduce((sum, u) => sum + u.win_loss, 0);
          
          // 실행 시간
          const executionTime = Date.now() - startTime;
          console.log(`getHighValueUsersByNetBet executed in ${executionTime}ms`);
          
          // 응답 반환
          const result = {
            meta: {
              criteria: { minNetBet, days, limit, page },
              execution_time_ms: executionTime,
              timestamp: new Date().toISOString()
            },
            pagination: {
              total_count: totalCount,
              total_pages: totalPages,
              current_page: page,
              page_size: limit,
              has_next_page: page < totalPages,
              has_previous_page: page > 1
            },
            summary: {
              user_count: processedUsers.length,
              active_users: activeUsers,
              inactive_recent_users: inactiveRecentUsers,
              inactive_long_users: inactiveLongUsers,
              total_net_betting: Math.round(totalNetBetting),
              total_win_loss: Math.round(totalWinLoss),
              average_net_betting: processedUsers.length > 0 ? 
                Math.round(totalNetBetting / processedUsers.length) : 0
            },
            users: processedUsers
          };
          
          // 응답 전송
          res.json(result);
        } finally {
          // 풀 종료
          await pool.end();
        }
      } catch (error) {
        console.error('Error in high-value users by netBet:', error);
        res.status(500).json({ 
          error: 'Internal server error', 
          message: error.message 
        });
      }
    });
  });
