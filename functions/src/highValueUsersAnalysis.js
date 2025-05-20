/**
 * 고가치 사용자 종합 분석 API (Firebase Function)
 * 
 * 7일 이상 게임 기록이 있고 전체 유효배팅이 50,000 이상인
 * 고가치 사용자들에 대한 종합 분석을 제공하는 API
 */

const functions = require('firebase-functions');
const mysql = require('mysql2/promise');
const cors = require('cors')({ origin: true });
const { getFirebaseApp } = require('./firebase/firebase-admin');

// 싱글턴 패턴으로 Firebase 초기화
function initializeFirebase() {
  return getFirebaseApp();
}

// 데이터베이스 연결 풀 관리자
const DB_CONFIG = {
  host: process.env.DB_HOST || '211.248.190.46',
  user: process.env.DB_USER || 'hermes',
  password: process.env.DB_PASSWORD || 'mcygicng!022',
  database: process.env.DB_NAME || 'hermes',
  waitForConnections: true,
  connectionLimit: process.env.DB_CONNECTION_LIMIT ? parseInt(process.env.DB_CONNECTION_LIMIT, 10) : 5,
  queueLimit: 0,
  connectTimeout: 10000,
  enableKeepAlive: true,
  keepAliveInitialDelay: 10000,
  timezone: '+09:00' // 한국 시간대
};

let pool;
function getConnectionPool() {
  if (!pool) {
    pool = mysql.createPool(DB_CONFIG);
  }
  return pool;
}

// API 함수를 Firebase Functions로 구현
exports.highValueUsersAnalysis = functions.https.onRequest((req, res) => {
  cors(req, res, async () => {
    try {
      // Firebase 초기화
      initializeFirebase();

      // 요청 파라미터 처리
      const minPlayDays = parseInt(req.query.minPlayDays || '7', 10);
      const minNetBet = parseInt(req.query.minNetBet || '50000', 10);
      const format = req.query.format || 'json'; // 'json' 또는 'html'

      // 데이터베이스 연결
      const pool = getConnectionPool();
      const connection = await pool.getConnection();

      try {
        // 분석 실행
        const analysisResult = await analyzeHighValueUsers(connection, minPlayDays, minNetBet);

        // 결과 반환
        if (format === 'html') {
          res.set('Content-Type', 'text/html');
          res.send(generateHtmlReport(analysisResult));
        } else {
          res.set('Content-Type', 'application/json');
          res.json(analysisResult);
        }
      } finally {
        // 연결 반환
        connection.release();
      }
    } catch (error) {
      console.error('Error:', error);
      res.status(500).json({
        success: false,
        error: error.message
      });
    }
  });
});

/**
 * 고가치 사용자 분석 함수
 */
async function analyzeHighValueUsers(connection, minPlayDays, minNetBet) {
  // 결과 객체 초기화
  const result = {
    metadata: {
      analysisDate: new Date().toISOString(),
      parameters: {
        minPlayDays,
        minNetBet
      }
    },
    summary: {},
    userComparison: {},
    users: [],
    dormantDistribution: {}
  };

  // 1. 전체 고가치 사용자 수와 활성/휴면 비율 조회
  const summaryQuery = `
    SELECT 
      COUNT(*) AS totalUsers,
      SUM(CASE WHEN DATEDIFF(NOW(), COALESCE(lastPlayDate, createdAt)) <= 30 THEN 1 ELSE 0 END) AS activeUsers,
      SUM(CASE WHEN DATEDIFF(NOW(), COALESCE(lastPlayDate, createdAt)) > 30 THEN 1 ELSE 0 END) AS dormantUsers,
      AVG(playDays) AS avgPlayDays
    FROM (
      SELECT 
        p.userId, 
        p.lastPlayDate,
        p.createdAt,
        COUNT(DISTINCT gs.gameDate) AS playDays,
        SUM(gs.netBet) AS totalNetBet
      FROM 
        players p
      JOIN 
        game_scores gs ON p.userId = gs.userId
      GROUP BY 
        p.userId
      HAVING 
        playDays >= ? AND totalNetBet >= ?
    ) AS high_value_users
  `;

  const [summaryRows] = await connection.query(summaryQuery, [minPlayDays, minNetBet]);
  
  if (summaryRows.length > 0) {
    const summary = summaryRows[0];
    result.summary = {
      totalUsers: summary.totalUsers,
      activeUsers: summary.activeUsers,
      dormantUsers: summary.dormantUsers,
      activePercentage: (summary.activeUsers / summary.totalUsers * 100).toFixed(1),
      dormantPercentage: (summary.dormantUsers / summary.totalUsers * 100).toFixed(1),
      avgPlayDays: Math.round(summary.avgPlayDays)
    };
  }

  // 2. 활성 vs 휴면 사용자 비교
  const comparisonQuery = `
    SELECT 
      active_status,
      COUNT(*) AS userCount,
      AVG(playDays) AS avgPlayDays,
      AVG(totalNetBet) AS avgNetBet,
      MAX(totalNetBet) AS maxNetBet,
      MAX(CASE WHEN totalNetBet = (SELECT MAX(totalNetBet) FROM (
        SELECT 
          CASE WHEN DATEDIFF(NOW(), COALESCE(p.lastPlayDate, p.createdAt)) <= 30 THEN 'active' ELSE 'dormant' END AS active_status,
          p.userId,
          SUM(gs.netBet) AS totalNetBet
        FROM 
          players p
        JOIN 
          game_scores gs ON p.userId = gs.userId
        GROUP BY 
          active_status, p.userId
      ) AS t WHERE t.active_status = active_status) THEN userId ELSE NULL END) AS topUser
    FROM (
      SELECT 
        CASE WHEN DATEDIFF(NOW(), COALESCE(p.lastPlayDate, p.createdAt)) <= 30 THEN 'active' ELSE 'dormant' END AS active_status,
        p.userId,
        COUNT(DISTINCT gs.gameDate) AS playDays,
        SUM(gs.netBet) AS totalNetBet
      FROM 
        players p
      JOIN 
        game_scores gs ON p.userId = gs.userId
      GROUP BY 
        active_status, p.userId
      HAVING 
        playDays >= ? AND totalNetBet >= ?
    ) AS user_status
    GROUP BY 
      active_status
  `;

  const [comparisonRows] = await connection.query(comparisonQuery, [minPlayDays, minNetBet]);
  
  if (comparisonRows.length > 0) {
    const activeData = comparisonRows.find(row => row.active_status === 'active') || {};
    const dormantData = comparisonRows.find(row => row.active_status === 'dormant') || {};
    
    result.userComparison = {
      active: {
        userCount: activeData.userCount || 0,
        avgPlayDays: Math.round(activeData.avgPlayDays || 0),
        avgNetBet: Math.round(activeData.avgNetBet || 0),
        maxNetBet: Math.round(activeData.maxNetBet || 0),
        topUser: activeData.topUser || ''
      },
      dormant: {
        userCount: dormantData.userCount || 0,
        avgPlayDays: Math.round(dormantData.avgPlayDays || 0),
        avgNetBet: Math.round(dormantData.avgNetBet || 0),
        maxNetBet: Math.round(dormantData.maxNetBet || 0),
        topUser: dormantData.topUser || ''
      },
      differences: {
        avgPlayDaysDiff: activeData.avgPlayDays && dormantData.avgPlayDays ? 
          Math.round((activeData.avgPlayDays / dormantData.avgPlayDays - 1) * 100) : 0,
        avgNetBetDiff: activeData.avgNetBet && dormantData.avgNetBet ? 
          Math.round((activeData.avgNetBet / dormantData.avgNetBet - 1) * 100) : 0,
        maxNetBetDiff: activeData.maxNetBet && dormantData.maxNetBet ? 
          Math.round((activeData.maxNetBet / dormantData.maxNetBet - 1) * 100) : 0
      }
    };
  }

  // 3. 모든 고가치 사용자 목록 조회
  const usersQuery = `
    SELECT 
      p.userId,
      COUNT(DISTINCT gs.gameDate) AS playDays,
      SUM(gs.netBet) AS totalNetBet,
      MAX(gs.gameDate) AS lastPlayDate,
      DATEDIFF(NOW(), MAX(gs.gameDate)) AS daysSinceLastPlay,
      CASE WHEN DATEDIFF(NOW(), COALESCE(p.lastPlayDate, p.createdAt)) <= 30 THEN 'active' ELSE 'dormant' END AS status
    FROM 
      players p
    JOIN 
      game_scores gs ON p.userId = gs.userId
    GROUP BY 
      p.userId
    HAVING 
      playDays >= ? AND totalNetBet >= ?
    ORDER BY 
      totalNetBet DESC
  `;

  const [usersRows] = await connection.query(usersQuery, [minPlayDays, minNetBet]);
  
  result.users = usersRows.map((user, index) => ({
    rank: index + 1,
    userId: user.userId,
    playDays: user.playDays,
    totalNetBet: Math.round(user.totalNetBet),
    lastPlayDate: user.lastPlayDate ? new Date(user.lastPlayDate).toISOString().split('T')[0] : null,
    daysSinceLastPlay: user.daysSinceLastPlay,
    status: user.status
  }));

  // 4. 휴면 기간별 사용자 분포
  const dormantQuery = `
    SELECT 
      CASE 
        WHEN inactiveDays BETWEEN 31 AND 60 THEN '31-60일'
        WHEN inactiveDays BETWEEN 61 AND 90 THEN '61-90일'
        WHEN inactiveDays BETWEEN 91 AND 180 THEN '91-180일'
        WHEN inactiveDays BETWEEN 181 AND 365 THEN '181-365일'
        WHEN inactiveDays > 365 THEN '365일 이상'
      END AS dormantPeriod,
      COUNT(*) AS userCount,
      ROUND(COUNT(*) / SUM(COUNT(*)) OVER() * 100, 1) AS percentage
    FROM (
      SELECT 
        p.userId,
        DATEDIFF(NOW(), COALESCE(p.lastPlayDate, p.createdAt)) AS inactiveDays,
        COUNT(DISTINCT gs.gameDate) AS playDays,
        SUM(gs.netBet) AS totalNetBet
      FROM 
        players p
      JOIN 
        game_scores gs ON p.userId = gs.userId
      GROUP BY 
        p.userId, inactiveDays
      HAVING 
        playDays >= ? AND totalNetBet >= ? AND inactiveDays > 30
    ) AS dormant_users
    GROUP BY 
      dormantPeriod
    ORDER BY 
      MIN(inactiveDays)
  `;

  const [dormantRows] = await connection.query(dormantQuery, [minPlayDays, minNetBet]);
  
  result.dormantDistribution = dormantRows.map(row => ({
    period: row.dormantPeriod,
    userCount: row.userCount,
    percentage: row.percentage
  }));

  return result;
}

/**
 * HTML 보고서 생성 함수
 */
function generateHtmlReport(data) {
  const { summary, userComparison, users, dormantDistribution } = data;
  
  // 사용자 테이블 HTML 생성
  let usersTableRows = '';
  users.forEach(user => {
    usersTableRows += `
      <tr>
        <td>${user.rank}</td>
        <td>${user.userId}</td>
        <td>${user.playDays}</td>
        <td>${user.totalNetBet.toLocaleString()}</td>
        <td>${user.lastPlayDate || '-'}</td>
        <td>${user.daysSinceLastPlay}</td>
        <td><span class="tag tag-${user.status === 'active' ? 'active' : 'dormant'}">${user.status === 'active' ? '활성' : '휴면'}</span></td>
      </tr>
    `;
  });
  
  // 휴면 기간별 분포 테이블 HTML 생성
  let dormantTableRows = '';
  let totalDormantUsers = 0;
  dormantDistribution.forEach(item => {
    dormantTableRows += `
      <tr>
        <td>${item.period}</td>
        <td>${item.userCount}명</td>
        <td>${item.percentage}%</td>
      </tr>
    `;
    totalDormantUsers += item.userCount;
  });
  dormantTableRows += `
    <tr>
      <td><strong>총계</strong></td>
      <td><strong>${totalDormantUsers}명</strong></td>
      <td><strong>100%</strong></td>
    </tr>
  `;
  
  // HTML 템플릿 생성
  return `
<!DOCTYPE html>
<html lang="ko">
<head>
    <meta charset="UTF-8">
    <meta name="viewport" content="width=device-width, initial-scale=1.0">
    <title>고가치 사용자 분석 보고서</title>
    <style>
        body {
            font-family: 'Segoe UI', Arial, sans-serif;
            line-height: 1.6;
            color: #333;
            max-width: 1200px;
            margin: 0 auto;
            padding: 20px;
            background-color: #f8f9fa;
        }
        
        header {
            background-color: #2c3e50;
            color: white;
            padding: 20px;
            text-align: center;
            border-radius: 8px;
            margin-bottom: 30px;
            box-shadow: 0 2px 5px rgba(0,0,0,0.2);
        }
        
        h1, h2, h3 {
            color: #2c3e50;
        }
        
        header h1 {
            color: white;
            margin: 0;
        }
        
        header p {
            margin: 10px 0 0;
            color: #ecf0f1;
            font-size: 1.1em;
        }
        
        .section {
            background-color: #fff;
            border-radius: 8px;
            padding: 20px;
            margin-bottom: 30px;
            box-shadow: 0 2px 4px rgba(0, 0, 0, 0.1);
        }
        
        .section h2 {
            margin-top: 0;
            border-left: 4px solid #3498db;
            padding-left: 10px;
            margin-bottom: 20px;
        }
        
        .summary-stats {
            display: flex;
            flex-wrap: wrap;
            justify-content: space-between;
            margin-bottom: 20px;
        }
        
        .stat-card {
            flex: 1 1 200px;
            background-color: #f8f9fa;
            border-radius: 8px;
            padding: 15px;
            margin: 0 10px 15px 0;
            box-shadow: 0 1px 3px rgba(0,0,0,0.1);
            text-align: center;
        }
        
        .stat-card h3 {
            margin: 0 0 10px;
            font-size: 1em;
            color: #6c757d;
            font-weight: 600;
        }
        
        .stat-value {
            font-size: 1.8em;
            font-weight: 700;
            color: #3498db;
            margin-bottom: 5px;
        }
        
        .stat-sub {
            font-size: 0.9em;
            color: #6c757d;
        }
        
        table {
            width: 100%;
            border-collapse: collapse;
            margin-bottom: 20px;
        }
        
        table th, table td {
            padding: 10px;
            text-align: left;
            border-bottom: 1px solid #e9ecef;
        }
        
        table th {
            background-color: #f8f9fa;
            font-weight: 600;
            color: #495057;
        }
        
        table tbody tr:hover {
            background-color: #f1f8ff;
        }
        
        .comparison-table {
            margin-top: 20px;
        }
        
        .comparison-table th, .comparison-table td {
            text-align: center;
        }
        
        .comparison-table th:first-child, .comparison-table td:first-child {
            text-align: left;
        }
        
        .tag {
            display: inline-block;
            padding: 3px 8px;
            margin-right: 5px;
            border-radius: 20px;
            font-size: 0.8em;
            font-weight: 500;
        }
        
        .tag-active {
            background-color: rgba(40, 167, 69, 0.1);
            color: #28a745;
            border: 1px solid rgba(40, 167, 69, 0.2);
        }
        
        .tag-dormant {
            background-color: rgba(220, 53, 69, 0.1);
            color: #dc3545;
            border: 1px solid rgba(220, 53, 69, 0.2);
        }
        
        .insights {
            background-color: #f8f9fa;
            border-left: 4px solid #3498db;
            padding: 15px;
            margin: 20px 0;
            border-radius: 0 4px 4px 0;
        }
        
        .insights h3 {
            margin-top: 0;
            color: #3498db;
        }
        
        .recommendations {
            background-color: #f0f9ff;
            border-left: 4px solid #28a745;
            padding: 15px;
            margin: 20px 0;
            border-radius: 0 4px 4px 0;
        }
        
        .recommendations h3 {
            margin-top: 0;
            color: #28a745;
        }
        
        .recommendations ul, .insights ul {
            padding-left: 20px;
            margin-bottom: 0;
        }
        
        .recommendations li, .insights li {
            margin-bottom: 8px;
        }
        
        .recommendations li:last-child, .insights li:last-child {
            margin-bottom: 0;
        }
        
        .search-filter {
            display: flex;
            align-items: center;
            margin-bottom: 15px;
        }
        
        .search-filter input {
            flex: 1;
            padding: 8px 12px;
            border: 1px solid #ced4da;
            border-radius: 4px;
            font-size: 0.9em;
        }
        
        .search-filter select {
            margin-left: 10px;
            padding: 8px 12px;
            border: 1px solid #ced4da;
            border-radius: 4px;
            font-size: 0.9em;
        }
        
        .pagination {
            display: flex;
            justify-content: center;
            margin: 20px 0;
        }
        
        .pagination-btn {
            padding: 5px 10px;
            margin: 0 5px;
            border: 1px solid #dee2e6;
            border-radius: 4px;
            cursor: pointer;
            background-color: #fff;
            color: #3498db;
        }
        
        .pagination-btn:hover, .pagination-btn.active {
            background-color: #3498db;
            color: #fff;
            border-color: #3498db;
        }
        
        footer {
            margin-top: 40px;
            text-align: center;
            font-size: 0.9em;
            color: #7f8c8d;
            padding-top: 20px;
            border-top: 1px solid #eee;
        }
    </style>
</head>
<body>
    <header>
        <h1>고가치 사용자 분석 보고서</h1>
        <p>7일 이상 게임 기록 및 유효배팅 50,000 이상 사용자 분석</p>
        <p>분석일: ${new Date().toISOString().split('T')[0].replace(/-/g, '년 ').replace(/년 /, '년 ').replace(/년$/, '일')}</p>
    </header>
    
    <div class="section">
        <h2>분석 개요</h2>
        <p>본 보고서는 다음 조건을 만족하는 고가치 사용자에 대한 분석 결과입니다:</p>
        <ul>
            <li>7일 이상 게임 기록이 있는 사용자</li>
            <li>전체 유효배팅(netBet)의 합이 50,000 이상인 사용자</li>
        </ul>
        
        <div class="summary-stats">
            <div class="stat-card">
                <h3>총 고가치 사용자 수</h3>
                <div class="stat-value">${summary.totalUsers}명</div>
                <div class="stat-sub">모든 활성 및 휴면 사용자</div>
            </div>
            <div class="stat-card">
                <h3>활성 사용자 비율</h3>
                <div class="stat-value">${summary.activePercentage}%</div>
                <div class="stat-sub">${summary.activeUsers}명 (최근 30일 내 활동)</div>
            </div>
            <div class="stat-card">
                <h3>휴면 사용자 비율</h3>
                <div class="stat-value">${summary.dormantPercentage}%</div>
                <div class="stat-sub">${summary.dormantUsers}명 (30일 이상 미활동)</div>
            </div>
            <div class="stat-card">
                <h3>평균 플레이 일수</h3>
                <div class="stat-value">${summary.avgPlayDays}일</div>
                <div class="stat-sub">전체 사용자 기준</div>
            </div>
        </div>
    </div>
    
    <div class="section">
        <h2>활성 vs 휴면 사용자 비교</h2>
        
        <table class="comparison-table">
            <thead>
                <tr>
                    <th>지표</th>
                    <th>활성 사용자 (${userComparison.active.userCount}명)</th>
                    <th>휴면 사용자 (${userComparison.dormant.userCount}명)</th>
                    <th>차이</th>
                </tr>
            </thead>
            <tbody>
                <tr>
                    <td>평균 플레이 일수</td>
                    <td>${userComparison.active.avgPlayDays}일</td>
                    <td>${userComparison.dormant.avgPlayDays}일</td>
                    <td>+${userComparison.differences.avgPlayDaysDiff}%</td>
                </tr>
                <tr>
                    <td>평균 유효배팅 금액</td>
                    <td>${userComparison.active.avgNetBet.toLocaleString()}</td>
                    <td>${userComparison.dormant.avgNetBet.toLocaleString()}</td>
                    <td>+${userComparison.differences.avgNetBetDiff}%</td>
                </tr>
                <tr>
                    <td>최대 유효배팅 금액</td>
                    <td>${userComparison.active.maxNetBet.toLocaleString()} (${userComparison.active.topUser})</td>
                    <td>${userComparison.dormant.maxNetBet.toLocaleString()} (${userComparison.dormant.topUser})</td>
                    <td>+${userComparison.differences.maxNetBetDiff}%</td>
                </tr>
            </tbody>
        </table>
        
        <div class="insights">
            <h3>주요 인사이트</h3>
            <ul>
                <li>활성 고가치 사용자는 휴면 사용자보다 <strong>평균 플레이 일수가 ${userComparison.differences.avgPlayDaysDiff}% 높으며</strong>, 이는 장기적인 충성도의 중요한 지표입니다.</li>
                <li>활성 고가치 사용자의 <strong>평균 유효배팅 금액</strong>은 휴면 사용자보다 <strong>${userComparison.differences.avgNetBetDiff}% 높은</strong> ${userComparison.active.avgNetBet.toLocaleString()}원으로, 활성 상태가 베팅 활동과 강한 상관관계가 있음을 보여줍니다.</li>
                <li>활성 사용자는 전체 고가치 사용자의 ${summary.activePercentage}%에 불과하지만, 총 베팅 금액에서 차지하는 비중은 더 높습니다.</li>
                <li>최고 베팅 금액을 기록한 사용자 '${userComparison.active.topUser}'는 활성 상태를 유지하고 있어, VIP 관리의 중요성을 보여줍니다.</li>
            </ul>
        </div>
    </div>
    
    <div class="section">
        <h2>고가치 사용자 목록 (전체 ${users.length}명)</h2>
        
        <div class="search-filter">
            <input type="text" id="userSearchInput" placeholder="유저명으로 검색...">
            <select id="statusFilter">
                <option value="all">모든 상태</option>
                <option value="active">활성 사용자</option>
                <option value="dormant">휴면 사용자</option>
            </select>
        </div>
        
        <table id="usersTable">
            <thead>
                <tr>
                    <th>순위</th>
                    <th>유저명</th>
                    <th>플레이 일수</th>
                    <th>총 유효배팅</th>
                    <th>마지막 플레이</th>
                    <th>경과일수</th>
                    <th>상태</th>
                </tr>
            </thead>
            <tbody>
                ${usersTableRows}
            </tbody>
        </table>
        
        <div id="tablePagination" class="pagination">
            <!-- 페이지네이션은 JavaScript로 생성됩니다 -->
        </div>
    </div>
    
    <div class="section">
        <h2>휴면 기간별 사용자 분포</h2>
        
        <table>
            <thead>
                <tr>
                    <th>휴면 기간</th>
                    <th>사용자 수</th>
                    <th>비율</th>
                </tr>
            </thead>
            <tbody>
                ${dormantTableRows}
            </tbody>
        </table>
        
        <div class="insights">
            <h3>휴면 사용자 인사이트</h3>
            <ul>
                <li>휴면 고가치 사용자의 <strong>${
                  dormantDistribution.find(item => item.period === '365일 이상')?.percentage || '0'
                }%가 1년 이상</strong> 미활동 상태로, 장기 휴면 사용자의 비율이 매우 높습니다.</li>
                <li><strong>단기 휴면 사용자(31-90일)</strong>는 ${
                  (parseFloat(dormantDistribution.find(item => item.period === '31-60일')?.percentage || '0') + 
                   parseFloat(dormantDistribution.find(item => item.period === '61-90일')?.percentage || '0')).toFixed(1)
                }%(${
                  (dormantDistribution.find(item => item.period === '31-60일')?.userCount || 0) + 
                  (dormantDistribution.find(item => item.period === '61-90일')?.userCount || 0)
                }명)로, 이들은 적절한 캠페인을 통해 상대적으로 쉽게 재활성화할 수 있는 타겟 그룹입니다.</li>
                <li>상위 10위 내 고가치 사용자 중 <strong>${
                  users.filter((user, index) => index < 10 && user.status === 'dormant').length
                }명이 휴면 상태</strong>로, 이는 상당한 매출 기회 손실을 의미합니다.</li>
                <li>휴면 사용자 중 일부는 매우 높은 플레이 일수를 보였으며, 이는 과거에 매우 충성도 높은 사용자였음을 시사합니다.</li>
            </ul>
        </div>
    </div>
    
    <div class="section">
        <h2>권장 전략</h2>
        
        <div class="recommendations">
            <h3>활성 고가치 사용자 유지 전략</h3>
            <ul>
                <li><strong>맞춤형 VIP 프로그램</strong>: 개인화된 보상 및 혜택, 전담 VIP 매니저 배정, 고급 서비스 및 특별 이벤트 초대</li>
                <li><strong>계층적 충성도 프로그램</strong>: 활동 수준에 따른 등급 시스템, 등급별 차별화된 혜택, 상위 등급 달성 시 상당한 보상</li>
                <li><strong>활동 예측 및 예방</strong>: 활동 패턴 모니터링, 활동 감소 시 즉각적인 개입, 유지율 높은 게임 및 이벤트 추천</li>
            </ul>
        </div>
        
        <div class="recommendations">
            <h3>휴면 고가치 사용자 재활성화 전략</h3>
            <ul>
                <li><strong>세그먼트별 맞춤형 전략</strong>:
                    <ul>
                        <li>단기 휴면(31-90일): 즉각적인 복귀 인센티브</li>
                        <li>중기 휴면(91-365일): 단계적 재참여 유도</li>
                        <li>장기 휴면(365일+): 강력한 복귀 패키지</li>
                    </ul>
                </li>
                <li><strong>상위 휴면 사용자 집중 관리</strong>: 상위 100명에 대한 개별화된 접근, 직접적인 연락 및 특별 제안, 복귀 시 과거 상태 복원 및 추가 혜택</li>
                <li><strong>이탈 원인 분석 및 개선</strong>: 게임별/이벤트별 이탈률 분석, 경쟁사 모니터링 및 비교 분석, 사용자 경험 및 서비스 개선</li>
            </ul>
        </div>
    </div>
    
    <div class="section">
        <h2>실행 계획</h2>
        
        <h3>즉시 실행 항목 (1-4주)</h3>
        <ol>
            <li>핵심 세그먼트 정의 및 자동화된 모니터링 시스템 구축</li>
            <li>상위 100명의 휴면 고가치 사용자 대상 개인화된 재활성화 캠페인 시작</li>
            <li>활성 고가치 사용자 대상 VIP 프로그램 강화</li>
        </ol>
        
        <h3>중기 실행 항목 (1-3개월)</h3>
        <ol>
            <li>활동 패턴 예측 모델 개발 및 이탈 방지 시스템 구축</li>
            <li>모든 휴면 고가치 사용자 대상 세그먼트별 재활성화 캠페인 진행</li>
            <li>고가치 사용자별 게임 선호도 분석 및 맞춤형 게임 추천 시스템 구현</li>
        </ol>
        
        <h3>장기 실행 항목 (3-6개월)</h3>
        <ol>
            <li>사용자 유지 및 재활성화 캠페인 효과 분석 및 최적화</li>
            <li>잠재적 고가치 사용자 조기 식별 및 육성 전략 구현</li>
            <li>고객 생애 가치(CLV) 최적화를 위한 통합 관리 시스템 구축</li>
        </ol>
    </div>
    
    <footer>
        <p>© 2025 DB2 프로젝트 팀 | 보고서 생성일: ${new Date().toISOString().split('T')[0].replace(/-/g, '년 ').replace(/년 /, '년 ').replace(/년$/, '일')}</p>
        <p><a href="/">메인 대시보드로 돌아가기</a></p>
    </footer>

    <script>
        document.addEventListener('DOMContentLoaded', function() {
            // 사용자 테이블 필터링 및 검색 기능
            const searchInput = document.getElementById('userSearchInput');
            const statusFilter = document.getElementById('statusFilter');
            const table = document.getElementById('usersTable');
            const tableRows = Array.from(table.querySelectorAll('tbody tr'));
            
            // 페이지네이션 설정
            const rowsPerPage = 20;
            let currentPage = 1;
            const paginationContainer = document.getElementById('tablePagination');
            
            // 검색 및 필터링 함수
            function filterTable() {
                const searchTerm = searchInput.value.toLowerCase();
                const statusValue = statusFilter.value;
                
                const filteredRows = tableRows.filter(row => {
                    const username = row.cells[1].textContent.toLowerCase();
                    const status = row.querySelector('.tag').classList.contains('tag-active') ? 'active' : 'dormant';
                    
                    const matchesSearch = username.includes(searchTerm);
                    const matchesStatus = statusValue === 'all' || status === statusValue;
                    
                    return matchesSearch && matchesStatus;
                });
                
                // 테이블 초기화
                const tbody = table.querySelector('tbody');
                tbody.innerHTML = '';
                
                // 페이지네이션 설정
                const totalPages = Math.ceil(filteredRows.length / rowsPerPage);
                if (currentPage > totalPages) {
                    currentPage = 1;
                }
                
                // 현재 페이지에 표시할 행 계산
                const startIdx = (currentPage - 1) * rowsPerPage;
                const endIdx = Math.min(startIdx + rowsPerPage, filteredRows.length);
                
                // 행 추가
                for (let i = startIdx; i < endIdx; i++) {
                    tbody.appendChild(filteredRows[i].cloneNode(true));
                }
                
                // 페이지네이션 업데이트
                updatePagination(totalPages, filteredRows.length);
            }
            
            // 페이지네이션 업데이트 함수
            function updatePagination(totalPages, totalItems) {
                paginationContainer.innerHTML = '';
                
                // 표시 정보 추가
                const infoSpan = document.createElement('span');
                infoSpan.textContent = \`총 \${totalItems}명 중 \${Math.min(rowsPerPage, totalItems)}명 표시 (페이지 \${currentPage}/\${totalPages || 1})\`;
                infoSpan.style.marginRight = '10px';
                paginationContainer.appendChild(infoSpan);
                
                // 처음 페이지 버튼
                const firstPageBtn = document.createElement('span');
                firstPageBtn.textContent = '<<';
                firstPageBtn.className = 'pagination-btn' + (currentPage === 1 ? ' disabled' : '');
                firstPageBtn.addEventListener('click', () => {
                    if (currentPage !== 1) {
                        currentPage = 1;
                        filterTable();
                    }
                });
                paginationContainer.appendChild(firstPageBtn);
                
                // 이전 페이지 버튼
                const prevPageBtn = document.createElement('span');
                prevPageBtn.textContent = '<';
                prevPageBtn.className = 'pagination-btn' + (currentPage === 1 ? ' disabled' : '');
                prevPageBtn.addEventListener('click', () => {
                    if (currentPage > 1) {
                        currentPage--;
                        filterTable();
                    }
                });
                paginationContainer.appendChild(prevPageBtn);
                
                // 페이지 번호 버튼
                const maxPageBtns = 5;
                const startPage = Math.max(1, currentPage - Math.floor(maxPageBtns / 2));
                const endPage = Math.min(totalPages, startPage + maxPageBtns - 1);
                
                for (let i = startPage; i <= endPage; i++) {
                    const pageBtn = document.createElement('span');
                    pageBtn.textContent = i;
                    pageBtn.className = 'pagination-btn' + (i === currentPage ? ' active' : '');
                    pageBtn.addEventListener('click', () => {
                        currentPage = i;
                        filterTable();
                    });
                    paginationContainer.appendChild(pageBtn);
                }
                
                // 다음 페이지 버튼
                const nextPageBtn = document.createElement('span');
                nextPageBtn.textContent = '>';
                nextPageBtn.className = 'pagination-btn' + (currentPage === totalPages || totalPages === 0 ? ' disabled' : '');
                nextPageBtn.addEventListener('click', () => {
                    if (currentPage < totalPages) {
                        currentPage++;
                        filterTable();
                    }
                });
                paginationContainer.appendChild(nextPageBtn);
                
                // 마지막 페이지 버튼
                const lastPageBtn = document.createElement('span');
                lastPageBtn.textContent = '>>';
                lastPageBtn.className = 'pagination-btn' + (currentPage === totalPages || totalPages === 0 ? ' disabled' : '');
                lastPageBtn.addEventListener('click', () => {
                    if (currentPage !== totalPages && totalPages !== 0) {
                        currentPage = totalPages;
                        filterTable();
                    }
                });
                paginationContainer.appendChild(lastPageBtn);
            }
            
            // 이벤트 리스너 설정
            searchInput.addEventListener('input', filterTable);
            statusFilter.addEventListener('change', filterTable);
            
            // 초기 테이블 필터링 실행
            filterTable();
        });
    </script>
</body>
</html>
  `;
}

// GitHub 코드에 표시할 때는 포함하지 않을 수 있는 추가 함수들
// 이 함수들은 쉽게 관리할 수 있도록 별도 파일로 분리하는 것이 좋습니다.

/**
 * CSV 형식으로 데이터 내보내기
 */
function exportToCsv(data) {
  const { users } = data;
  
  const csvHeader = 'Rank,UserId,PlayDays,TotalNetBet,LastPlayDate,DaysSinceLastPlay,Status\n';
  const csvRows = users.map(user => {
    return `${user.rank},${user.userId},${user.playDays},${user.totalNetBet},"${user.lastPlayDate || ''}",${user.daysSinceLastPlay},"${user.status}"`;
  }).join('\n');
  
  return csvHeader + csvRows;
}

/**
 * JSON 형식으로 데이터 내보내기
 */
function exportToJson(data) {
  return JSON.stringify(data, null, 2);
}
