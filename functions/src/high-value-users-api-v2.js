/**
 * 고가치 사용자 API V2 모듈
 * 
 * 표준화된 API 경로와 개선된 응답 처리를 제공하는 고가치 사용자 API 구현
 * API 경로 표준화 및 응답 처리 개선(Task #26, 서브태스크 #7) 구현
 */

const express = require('express');
const cors = require('cors');
const functions = require('firebase-functions');
const mysql = require('mysql2/promise');
const { format } = require('date-fns');

// 데이터베이스 연결 설정
const dbConfig = {
  host: process.env.DB_HOST || '211.248.190.46',
  user: process.env.DB_USER || 'hermes',
  password: process.env.DB_PASSWORD || 'mcygicng!022',
  database: process.env.DB_NAME || 'hermes',
  connectionLimit: 5,
  connectTimeout: 10000,
  supportBigNumbers: false,
  // 다음 옵션을 추가하여 BigInt 처리 문제 해결
  dateStrings: true,
  typeCast: function(field, next) {
    if (field.type === 'BIGINT' || field.type === 'DECIMAL') {
      const value = field.string();
      return (value === null) ? null : Number(value);
    }
    return next();
  }
};

// 데이터베이스 연결 풀 (싱글턴)
let pool;
function getPool() {
  if (!pool) {
    console.log('Creating MySQL connection pool (API V2)...');
    functions.logger.info('Creating MySQL connection pool (API V2)...');
    pool = mysql.createPool(dbConfig);
  }
  return pool;
}

// Express 앱 생성
const app = express();

// 미들웨어 설정
app.use(cors({
  origin: ['https://db888-67827.web.app', 'http://localhost:5051', '*'],
  methods: ['GET', 'POST', 'OPTIONS'],
  allowedHeaders: ['Content-Type', 'Authorization', 'Accept'],
  credentials: true,
  maxAge: 86400 // 24시간
}));
app.use(express.json());

// API 버전
const API_VERSION = 'v2';

// 요청 로깅 미들웨어
app.use((req, res, next) => {
  const start = Date.now();
  const requestId = Math.random().toString(36).substring(2, 15);
  
  functions.logger.info(`[${requestId}] API 요청`, {
    method: req.method,
    path: req.path,
    query: req.query,
    ip: req.ip
  });
  
  // 응답 완료 후 로깅
  res.on('finish', () => {
    const duration = Date.now() - start;
    functions.logger.info(`[${requestId}] API 응답`, {
      statusCode: res.statusCode,
      duration: `${duration}ms`
    });
  });
  
  next();
});

// 오류 처리 미들웨어
app.use((err, req, res, next) => {
  functions.logger.error('API 오류:', err);
  
  res.status(500).json({
    success: false,
    error: {
      message: '서버 오류가 발생했습니다',
      detail: process.env.NODE_ENV === 'development' ? err.message : undefined
    },
    timestamp: new Date().toISOString(),
    version: API_VERSION
  });
});

/**
 * 기본 라우트 (API 정보 제공)
 */
app.get('/', (req, res) => {
  res.json({
    name: '고가치 사용자 분석 API',
    version: API_VERSION,
    endpoints: [
      '/active - 활성 고가치 사용자 조회',
      '/dormant - 휴면 고가치 사용자 조회',
      '/export/csv - CSV 내보내기'
    ],
    timestamp: new Date().toISOString()
  });
});

/**
 * 활성 고가치 사용자 조회 API
 */
app.get('/active', async (req, res) => {
  // 요청 파라미터 추출
  const minNetBet = req.query.minNetBet ? parseInt(req.query.minNetBet) : 1000;
  const limit = req.query.limit ? parseInt(req.query.limit) : 20;
  const page = req.query.page ? parseInt(req.query.page) : 1;
  const offset = (page - 1) * limit;
  const sortBy = req.query.sortBy || 'netBet';
  const sortOrder = req.query.sortOrder || 'desc';
  const search = req.query.search || '';
  
  let conn;
  try {
    // 데이터베이스 연결
    const pool = getPool();
    conn = await pool.getConnection();
    
    // 검색 조건 추가
    let searchCondition = '';
    let searchParams = [];
    
    if (search) {
      searchCondition = 'AND p.userId LIKE ?';
      searchParams.push(`%${search}%`);
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
        DATEDIFF(CURRENT_DATE, MAX(gs.gameDate)) as inactiveDays,
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
    
    const queryParams = [...searchParams, minNetBet, limit, offset];
    const countParams = [...searchParams, minNetBet];
    
    const start = Date.now();
    const [results] = await conn.query(query, queryParams);
    const [countResult] = await conn.query(countQuery, countParams);
    const executionTime = Date.now() - start;
    
    const totalCount = countResult[0]?.totalCount || 0;
    
    // 결과 매핑 및 데이터 변환
    const mappedResults = results.map(row => ({
      userId: row.userId,
      loginCount: row.loginCount,
      lastActivity: row.lastActivity 
        ? format(new Date(row.lastActivity), 'yyyy-MM-dd')
        : null,
      inactiveDays: Number(row.inactiveDays),
      netBet: Number(row.netBet),
      status: 'active'
    }));
    
    // JSONP 처리
    const callback = req.query.callback;
    const responseData = {
      success: true,
      message: "Active high-value users retrieved",
      metadata: {
        version: API_VERSION,
        timestamp: new Date().toISOString(),
        executionTime: `${executionTime}ms`,
        params: {
          minNetBet,
          limit,
          page,
          sortBy,
          sortOrder,
          search: search || null
        },
        pagination: {
          totalCount,
          currentPage: page,
          pageSize: limit,
          totalPages: Math.ceil(totalCount / limit) || 1
        }
      },
      data: mappedResults
    };
    
    // JSONP 응답 처리
    if (callback) {
      res.set('Content-Type', 'application/javascript');
      res.send(`${callback}(${JSON.stringify(responseData)})`);
    } else {
      // 캐시 헤더 설정
      res.set('Cache-Control', 'public, max-age=300'); // 5분
      res.json(responseData);
    }
    
  } catch (error) {
    functions.logger.error('Database error:', error);
    res.status(500).json({
      success: false,
      message: "Error retrieving active high-value users",
      error: {
        code: "DB_ERROR",
        message: error.message
      },
      metadata: {
        version: API_VERSION,
        timestamp: new Date().toISOString()
      }
    });
  } finally {
    if (conn) {
      try {
        conn.release();
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
  // 요청 파라미터 추출
  const minNetBet = req.query.minNetBet ? parseInt(req.query.minNetBet) : 1000;
  const minInactiveDays = req.query.minInactiveDays ? parseInt(req.query.minInactiveDays) : 30;
  const limit = req.query.limit ? parseInt(req.query.limit) : 20;
  const page = req.query.page ? parseInt(req.query.page) : 1;
  const offset = (page - 1) * limit;
  const sortBy = req.query.sortBy || 'inactiveDays';
  const sortOrder = req.query.sortOrder || 'desc';
  const search = req.query.search || '';
  
  let conn;
  try {
    // 데이터베이스 연결
    const pool = getPool();
    conn = await pool.getConnection();
    
    // 검색 조건 추가
    let searchCondition = '';
    let searchParams = [];
    
    if (search) {
      searchCondition = 'AND p.userId LIKE ?';
      searchParams.push(`%${search}%`);
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
    
    // 쿼리 실행 - 수정된 JOIN 조건 및 매개변수화된 쿼리 사용
    const query = `
      SELECT 
        p.userId,
        COUNT(*) as loginCount,
        MAX(gs.gameDate) as lastActivity,
        DATEDIFF(CURRENT_DATE, MAX(gs.gameDate)) as inactiveDays,
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
    
    const queryParams = [...searchParams, minNetBet, minInactiveDays, limit, offset];
    const countParams = [...searchParams, minNetBet, minInactiveDays];
    
    const start = Date.now();
    const [results] = await conn.query(query, queryParams);
    const [countResult] = await conn.query(countQuery, countParams);
    const executionTime = Date.now() - start;
    
    const totalCount = countResult[0]?.totalCount || 0;
    
    // 결과 매핑 및 데이터 변환
    const mappedResults = results.map(row => ({
      userId: row.userId,
      loginCount: row.loginCount,
      lastActivity: row.lastActivity 
        ? format(new Date(row.lastActivity), 'yyyy-MM-dd')
        : null,
      inactiveDays: Number(row.inactiveDays),
      netBet: Number(row.netBet),
      status: 'dormant'
    }));
    
    // JSONP 처리
    const callback = req.query.callback;
    const responseData = {
      success: true,
      message: "Dormant high-value users retrieved",
      metadata: {
        version: API_VERSION,
        timestamp: new Date().toISOString(),
        executionTime: `${executionTime}ms`,
        params: {
          minNetBet,
          minInactiveDays,
          limit,
          page,
          sortBy,
          sortOrder,
          search: search || null
        },
        pagination: {
          totalCount,
          currentPage: page,
          pageSize: limit,
          totalPages: Math.ceil(totalCount / limit) || 1
        }
      },
      data: mappedResults
    };
    
    // JSONP 응답 처리
    if (callback) {
      res.set('Content-Type', 'application/javascript');
      res.send(`${callback}(${JSON.stringify(responseData)})`);
    } else {
      // 캐시 헤더 설정
      res.set('Cache-Control', 'public, max-age=300'); // 5분
      res.json(responseData);
    }
    
  } catch (error) {
    functions.logger.error('Database error:', error);
    res.status(500).json({
      success: false,
      message: "Error retrieving dormant high-value users",
      error: {
        code: "DB_ERROR",
        message: error.message
      },
      metadata: {
        version: API_VERSION,
        timestamp: new Date().toISOString()
      }
    });
  } finally {
    if (conn) {
      try {
        conn.release();
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
  // 요청 파라미터 추출
  const minNetBet = req.query.minNetBet ? parseInt(req.query.minNetBet) : 1000;
  const userType = req.query.type || 'all';
  const search = req.query.search || '';
  
  let conn;
  try {
    // 데이터베이스 연결
    const pool = getPool();
    conn = await pool.getConnection();
    
    // 검색 조건 추가
    let searchCondition = '';
    let searchParams = [];
    
    if (search) {
      searchCondition = 'AND p.userId LIKE ?';
      searchParams.push(`%${search}%`);
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
        DATEDIFF(CURRENT_DATE, MAX(gs.gameDate)) as inactiveDays,
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
    
    const queryParams = [...searchParams, minNetBet];
    const [results] = await conn.query(query, queryParams);
    
    // CSV 헤더 및 내용 생성
    const timestamp = format(new Date(), 'yyyy-MM-dd_HHmmss');
    const filename = `high_value_users_${userType}_${timestamp}.csv`;
    
    // CSV 헤더 설정 - UTF-8 BOM 추가 (Excel 한글 지원)
    res.setHeader('Content-Type', 'text/csv; charset=utf-8');
    res.setHeader('Content-Disposition', `attachment; filename=${filename}`);
    
    // UTF-8 BOM 추가
    const BOM = '\uFEFF';
    
    // CSV 헤더 행
    let csvContent = BOM + '순위,유저명,플레이 일수,총 유효배팅,마지막 플레이,경과일수,상태\n';
    
    // CSV 데이터 행
    results.forEach((user, index) => {
      const rank = index + 1;
      const lastActivity = user.lastActivity ? format(new Date(user.lastActivity), 'yyyy-MM-dd') : '-';
      
      // 따옴표로 감싸서 CSV 데이터 문제 방지
      const csvRow = [
        rank,
        `"${user.userId}"`,
        user.loginCount,
        user.netBet,
        `"${lastActivity}"`,
        user.inactiveDays,
        `"${user.userStatus}"`
      ].join(',');
      
      csvContent += csvRow + '\n';
    });
    
    // CSV 콘텐츠 반환
    res.status(200).send(csvContent);
    
  } catch (error) {
    functions.logger.error('Database error:', error);
    
    // CSV 대신 JSON 오류 반환
    res.status(500).json({
      success: false,
      message: "Error exporting high-value users to CSV",
      error: {
        code: "DB_ERROR",
        message: error.message
      },
      metadata: {
        version: API_VERSION,
        timestamp: new Date().toISOString()
      }
    });
  } finally {
    if (conn) {
      try {
        conn.release();
      } catch (err) {
        functions.logger.error('Error releasing connection:', err);
      }
    }
  }
});

// 단일 함수로 내보내기
const highValueUsersApiV2 = functions.https.onRequest(app);

module.exports = { highValueUsersApiV2 };
