/**
 * 고가치 사용자 API 라우터 모듈
 * 
 * 이 모듈은 Firebase Functions에서 Express 라우터를 사용하여
 * 고가치 사용자 조회 관련 API 엔드포인트를 관리합니다.
 */

const express = require('express');
const cors = require('cors');
const functions = require('firebase-functions');
const mysql = require('mysql2/promise');

// 데이터베이스 연결 설정
const dbConfig = {
  host: process.env.DB_HOST || '211.248.190.46',
  user: process.env.DB_USER || 'hermes',
  password: process.env.DB_PASSWORD || 'mcygicng!022',
  database: process.env.DB_NAME || 'hermes',
  connectionLimit: 5,
  connectTimeout: 10000,
  supportBigNumbers: false
};

// 데이터베이스 연결 풀 (싱글턴)
let pool;
function getPool() {
  if (!pool) {
    console.log('Creating MySQL connection pool...');
    functions.logger.info('Creating MySQL connection pool...');
    pool = mysql.createPool(dbConfig);
  }
  return pool;
}

// Express 앱 생성
const app = express();

// 미들웨어 설정
app.use(cors({
  origin: ['https://db888-67827.web.app', 'http://localhost:5051'],
  methods: ['GET', 'POST', 'OPTIONS'],
  allowedHeaders: ['Content-Type', 'Authorization', 'Accept'],
  credentials: true,
  maxAge: 86400 // 24시간
}));
app.use(express.json());

/**
 * 활성 고가치 사용자 조회 API
 */
app.get('/active', async (req, res) => {
  // CORS 헤더 설정
  res.set('Access-Control-Allow-Origin', '*');
  res.set('Access-Control-Allow-Methods', 'GET, POST, OPTIONS');
  res.set('Access-Control-Allow-Headers', 'Content-Type, Authorization, Accept');
  
  // OPTIONS 요청 처리
  if (req.method === 'OPTIONS') {
    res.status(204).send('');
    return;
  }
  
  // 요청 파라미터 추출
  const minNetBet = req.query.minNetBet ? parseInt(req.query.minNetBet) : 1000;
  const limit = req.query.limit ? parseInt(req.query.limit) : 10;
  const page = req.query.page ? parseInt(req.query.page) : 1;
  const offset = (page - 1) * limit;
  const sortBy = req.query.sortBy || 'netBet';
  const sortOrder = req.query.sortOrder || 'desc';
  const search = req.query.search || '';
  
  functions.logger.info('고가치 활성 사용자 조회 API 호출', {
    minNetBet,
    limit,
    page,
    sortBy,
    sortOrder,
    search
  });
  
  let conn;
  try {
    // 데이터베이스 연결
    const pool = getPool();
    conn = await pool.getConnection();
    functions.logger.info('Database connection established');
    
    // 검색 조건 추가
    let searchCondition = '';
    if (search) {
      searchCondition = `AND p.userId LIKE '%${search}%'`;
    }
    
    // 정렬 조건 설정
    let orderByClause = '';
    switch(sortBy) {
      case 'userName':
        orderByClause = `ORDER BY p.userId ${sortOrder}`;
        break;
      case 'playDays':
        orderByClause = `ORDER BY loginCount ${sortOrder}`;
        break;
      case 'netBet':
        orderByClause = `ORDER BY netBet ${sortOrder}`;
        break;
      case 'lastActivity':
        orderByClause = `ORDER BY lastActivity ${sortOrder}`;
        break;
      case 'inactiveDays':
        orderByClause = `ORDER BY inactiveDays ${sortOrder}`;
        break;
      default:
        orderByClause = `ORDER BY netBet DESC`;
    }
    
    // 쿼리 실행 - 수정된 JOIN 조건 적용
    const query = `
      SELECT 
        p.userId,
        COUNT(*) as loginCount,
        MAX(gs.gameDate) as lastActivity,
        CAST(DATEDIFF(CURRENT_DATE, MAX(gs.gameDate)) AS UNSIGNED) as inactiveDays,
        ROUND(SUM(gs.netBet)) as netBet
      FROM players p
      JOIN game_scores gs ON p.userId = gs.userId  /* 수정된 JOIN 조건 */
      WHERE 1=1 ${searchCondition}
      GROUP BY p.userId
      HAVING SUM(gs.netBet) >= ?
      AND DATEDIFF(CURRENT_DATE, MAX(gs.gameDate)) < 30
      ${orderByClause}
      LIMIT ? OFFSET ?
    `;
    
    // 총 레코드 수 확인 쿼리
    const countQuery = `
      SELECT 
        COUNT(*) as totalCount
      FROM (
        SELECT 
          p.userId
        FROM players p
        JOIN game_scores gs ON p.userId = gs.userId  /* 수정된 JOIN 조건 */
        WHERE 1=1 ${searchCondition}
        GROUP BY p.userId
        HAVING SUM(gs.netBet) >= ?
        AND DATEDIFF(CURRENT_DATE, MAX(gs.gameDate)) < 30
      ) as subquery
    `;
    
    const start = Date.now();
    const results = await conn.query(query, [minNetBet, limit, offset]);
    const [countResult] = await conn.query(countQuery, [minNetBet]);
    const executionTime = Date.now() - start;
    
    functions.logger.info(`Query executed in ${executionTime}ms, returned ${results.length} results`);
    functions.logger.info(`Total matching records: ${countResult?.totalCount || 0}`);
    
    // 결과 반환
    const callback = req.query.callback;
    const responseData = {
      success: true,
      message: "Active high-value users retrieved",
      params: {
        minNetBet,
        limit,
        page,
        sortBy,
        sortOrder
      },
      data: results.map(row => ({
        ...row,
        inactiveDays: Number(row.inactiveDays) // BigInt를 JavaScript Number로 변환
      })),
      count: results.length,
      totalCount: Number(countResult?.totalCount) || 0,
      pages: Math.ceil((Number(countResult?.totalCount) || 0) / limit),
      currentPage: page,
      timestamp: new Date().toISOString()
    };
    
    // JSONP 응답 처리
    if (callback) {
      res.set('Content-Type', 'application/javascript');
      res.send(`${callback}(${JSON.stringify(responseData)})`);
    } else {
      res.status(200).json(responseData);
    }
    
  } catch (error) {
    functions.logger.error('Database error:', error);
    res.status(500).json({
      success: false,
      message: "Error retrieving active high-value users",
      error: error.message,
      timestamp: new Date().toISOString()
    });
  } finally {
    if (conn) {
      try {
        conn.release();
        functions.logger.info('Database connection released');
      } catch (err) {
        functions.logger.error('Error releasing connection:', err);
      }
    }
  }
});

/**
 * 휴면 고가치 사용자 조회 API
 */
app.get('/dormant', async (req, res) => {
  // CORS 헤더 설정
  res.set('Access-Control-Allow-Origin', '*');
  res.set('Access-Control-Allow-Methods', 'GET, POST, OPTIONS');
  res.set('Access-Control-Allow-Headers', 'Content-Type, Authorization, Accept');
  
  // OPTIONS 요청 처리
  if (req.method === 'OPTIONS') {
    res.status(204).send('');
    return;
  }
  
  // 요청 파라미터 추출
  const minNetBet = req.query.minNetBet ? parseInt(req.query.minNetBet) : 1000;
  const minInactiveDays = req.query.minInactiveDays ? parseInt(req.query.minInactiveDays) : 30;
  const limit = req.query.limit ? parseInt(req.query.limit) : 10;
  const page = req.query.page ? parseInt(req.query.page) : 1;
  const offset = (page - 1) * limit;
  const sortBy = req.query.sortBy || 'inactiveDays';
  const sortOrder = req.query.sortOrder || 'desc';
  const search = req.query.search || '';
  
  functions.logger.info('고가치 휴면 사용자 조회 API 호출', {
    minNetBet,
    minInactiveDays,
    limit,
    page,
    sortBy,
    sortOrder,
    search
  });
  
  let conn;
  try {
    // 데이터베이스 연결
    const pool = getPool();
    conn = await pool.getConnection();
    functions.logger.info('Database connection established');
    
    // 검색 조건 추가
    let searchCondition = '';
    if (search) {
      searchCondition = `AND p.userId LIKE '%${search}%'`;
    }
    
    // 정렬 조건 설정
    let orderByClause = '';
    switch(sortBy) {
      case 'userName':
        orderByClause = `ORDER BY p.userId ${sortOrder}`;
        break;
      case 'playDays':
        orderByClause = `ORDER BY loginCount ${sortOrder}`;
        break;
      case 'netBet':
        orderByClause = `ORDER BY netBet ${sortOrder}`;
        break;
      case 'lastActivity':
        orderByClause = `ORDER BY lastActivity ${sortOrder}`;
        break;
      case 'inactiveDays':
        orderByClause = `ORDER BY inactiveDays ${sortOrder}`;
        break;
      default:
        orderByClause = `ORDER BY inactiveDays DESC`;
    }
    
    // 쿼리 실행 - 수정된 JOIN 조건 적용
    const query = `
      SELECT 
        p.userId,
        COUNT(*) as loginCount,
        MAX(gs.gameDate) as lastActivity,
        CAST(DATEDIFF(CURRENT_DATE, MAX(gs.gameDate)) AS UNSIGNED) as inactiveDays,
        ROUND(SUM(gs.netBet)) as netBet
      FROM players p
      JOIN game_scores gs ON p.userId = gs.userId  /* 수정된 JOIN 조건 */
      WHERE 1=1 ${searchCondition}
      GROUP BY p.userId
      HAVING SUM(gs.netBet) >= ?
      AND DATEDIFF(CURRENT_DATE, MAX(gs.gameDate)) >= ?
      ${orderByClause}
      LIMIT ? OFFSET ?
    `;
    
    // 총 레코드 수 확인 쿼리
    const countQuery = `
      SELECT 
        COUNT(*) as totalCount
      FROM (
        SELECT 
          p.userId
        FROM players p
        JOIN game_scores gs ON p.userId = gs.userId  /* 수정된 JOIN 조건 */
        WHERE 1=1 ${searchCondition}
        GROUP BY p.userId
        HAVING SUM(gs.netBet) >= ?
        AND DATEDIFF(CURRENT_DATE, MAX(gs.gameDate)) >= ?
      ) as subquery
    `;
    
    const start = Date.now();
    const results = await conn.query(query, [minNetBet, minInactiveDays, limit, offset]);
    const [countResult] = await conn.query(countQuery, [minNetBet, minInactiveDays]);
    const executionTime = Date.now() - start;
    
    functions.logger.info(`Query executed in ${executionTime}ms, returned ${results.length} results`);
    functions.logger.info(`Total matching records: ${countResult?.totalCount || 0}`);
    
    // 결과 반환
    const callback = req.query.callback;
    const responseData = {
      success: true,
      message: "Dormant high-value users retrieved",
      params: {
        minNetBet,
        minInactiveDays,
        limit,
        page,
        sortBy,
        sortOrder
      },
      data: results.map(row => ({
        ...row,
        inactiveDays: Number(row.inactiveDays) // BigInt를 JavaScript Number로 변환
      })),
      count: results.length,
      totalCount: Number(countResult?.totalCount) || 0,
      pages: Math.ceil((Number(countResult?.totalCount) || 0) / limit),
      currentPage: page,
      timestamp: new Date().toISOString()
    };
    
    // JSONP 응답 처리
    if (callback) {
      res.set('Content-Type', 'application/javascript');
      res.send(`${callback}(${JSON.stringify(responseData)})`);
    } else {
      res.status(200).json(responseData);
    }
    
  } catch (error) {
    functions.logger.error('Database error:', error);
    res.status(500).json({
      success: false,
      message: "Error retrieving dormant high-value users",
      error: error.message,
      timestamp: new Date().toISOString()
    });
  } finally {
    if (conn) {
      try {
        conn.release();
        functions.logger.info('Database connection released');
      } catch (err) {
        functions.logger.error('Error releasing connection:', err);
      }
    }
  }
});

/**
 * CSV 다운로드 API
 */
app.get('/export/csv', async (req, res) => {
  // CORS 헤더 설정
  res.set('Access-Control-Allow-Origin', '*');
  res.set('Access-Control-Allow-Methods', 'GET, POST, OPTIONS');
  res.set('Access-Control-Allow-Headers', 'Content-Type, Authorization, Accept');
  
  // OPTIONS 요청 처리
  if (req.method === 'OPTIONS') {
    res.status(204).send('');
    return;
  }
  
  // 요청 파라미터 추출
  const minNetBet = req.query.minNetBet ? parseInt(req.query.minNetBet) : 1000;
  const userType = req.query.type || 'all';
  const search = req.query.search || '';
  
  functions.logger.info('고가치 사용자 CSV 내보내기 API 호출', {
    minNetBet,
    userType,
    search
  });
  
  let conn;
  try {
    // 데이터베이스 연결
    const pool = getPool();
    conn = await pool.getConnection();
    functions.logger.info('Database connection established');
    
    // 검색 조건 추가
    let searchCondition = '';
    if (search) {
      searchCondition = `AND p.userId LIKE '%${search}%'`;
    }
    
    // 사용자 유형에 따른 조건 설정
    let userTypeCondition = '';
    if (userType === 'active') {
      userTypeCondition = 'AND DATEDIFF(CURRENT_DATE, MAX(gs.gameDate)) < 30';
    } else if (userType === 'dormant') {
      userTypeCondition = 'AND DATEDIFF(CURRENT_DATE, MAX(gs.gameDate)) >= 30';
    }
    
    // 쿼리 실행 - 최대 10,000개로 제한
    const query = `
      SELECT 
        p.userId,
        COUNT(*) as loginCount,
        MAX(gs.gameDate) as lastActivity,
        CAST(DATEDIFF(CURRENT_DATE, MAX(gs.gameDate)) AS UNSIGNED) as inactiveDays,
        ROUND(SUM(gs.netBet)) as netBet,
        CASE 
          WHEN DATEDIFF(CURRENT_DATE, MAX(gs.gameDate)) < 30 THEN '활성'
          ELSE '휴면'
        END as userStatus
      FROM players p
      JOIN game_scores gs ON p.userId = gs.userId
      WHERE 1=1 ${searchCondition}
      GROUP BY p.userId
      HAVING SUM(gs.netBet) >= ? ${userTypeCondition}
      ORDER BY netBet DESC
      LIMIT 10000
    `;
    
    const results = await conn.query(query, [minNetBet]);
    functions.logger.info(`CSV export query returned ${results.length} results`);
    
    // CSV 헤더 및 내용 생성
    const timestamp = new Date().toISOString().replace(/:/g, '-').substring(0, 19);
    const filename = `high_value_users_${userType}_${timestamp}.csv`;
    
    // CSV 헤더 설정
    res.setHeader('Content-Type', 'text/csv; charset=utf-8');
    res.setHeader('Content-Disposition', `attachment; filename=${filename}`);
    
    // CSV 헤더 행
    let csvContent = '순위,유저명,플레이 일수,총 유효배팅,마지막 플레이,경과일수,상태\n';
    
    // CSV 데이터 행
    results.forEach((user, index) => {
      const rank = index + 1;
      const lastActivity = user.lastActivity ? user.lastActivity.toISOString().split('T')[0] : '-';
      const csvRow = [
        rank,
        user.userId,
        user.loginCount,
        user.netBet,
        lastActivity,
        user.inactiveDays,
        user.userStatus
      ].join(',');
      
      csvContent += csvRow + '\n';
    });
    
    // CSV 콘텐츠 반환
    res.status(200).send(csvContent);
    
  } catch (error) {
    functions.logger.error('Database error:', error);
    res.status(500).json({
      success: false,
      message: "Error exporting high-value users to CSV",
      error: error.message,
      timestamp: new Date().toISOString()
    });
  } finally {
    if (conn) {
      try {
        conn.release();
        functions.logger.info('Database connection released');
      } catch (err) {
        functions.logger.error('Error releasing connection:', err);
      }
    }
  }
});

// 단일 함수로 내보내기
const highValueUsersApi = functions.https.onRequest(app);

module.exports = { highValueUsersApi };
