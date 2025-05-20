/**
 * 고가치 사용자 종합 분석 보고서 API
 * 
 * 고가치 사용자에 대한 종합적인 분석 결과를 제공하는 API 엔드포인트입니다.
 * 기존 index.html에 있던 로직을 마이그레이션하여 Firebase Functions로 구현한 버전입니다.
 */

const functions = require('firebase-functions');
const mysql = require('mysql2/promise');
const cors = require('cors')({ origin: true });
const { getFirebaseApp } = require('./firebase/firebase-admin');

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

// 연결 풀 관리
let pool;
function getConnectionPool() {
  if (!pool) {
    pool = mysql.createPool(DB_CONFIG);
  }
  return pool;
}

/**
 * 고가치 사용자 종합 분석 보고서 API
 * 
 * 세부 쿼리 및 분석을 수행하고 JSON 또는 HTML 형식으로 결과를 반환합니다.
 */
exports.highValueUserReport = functions.https.onRequest((req, res) => {
  cors(req, res, async () => {
    try {
      // Firebase 초기화
      getFirebaseApp();

      // 요청 파라미터 처리
      const minPlayDays = parseInt(req.query.minPlayDays || '7', 10);
      const minNetBet = parseInt(req.query.minNetBet || '40000', 10); // 50000에서 40000으로 낮춤 (최대값 41130 미만)
      const format = req.query.format || 'json'; // 'json' 또는 'html'
      const showDetails = req.query.details === 'true'; // 상세 분석 결과 포함 여부

      console.log(`[고가치 사용자 보고서] 요청 파라미터: minPlayDays=${minPlayDays}, minNetBet=${minNetBet}, format=${format}, showDetails=${showDetails}`);

      // 데이터베이스 연결
      const pool = getConnectionPool();
      const connection = await pool.getConnection();

      try {
        // 분석 실행
        const analysisResult = await analyzeHighValueUsers(connection, minPlayDays, minNetBet, showDetails);
        
        // 이벤트 효과 분석 추가
        analysisResult.eventEffects = await analyzeEventEffects(connection);
        
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
      console.error('[고가치 사용자 보고서] 오류:', error);
      res.status(500).json({
        success: false,
        error: error.message
      });
    }
  });
});

/**
 * 고가치 사용자 데이터 분석 함수
 * 
 * @param {Object} connection 데이터베이스 연결 객체
 * @param {number} minPlayDays 최소 플레이 일수
 * @param {number} minNetBet 최소 유효 배팅액
 * @param {boolean} showDetails 상세 정보 표시 여부
 * @returns {Object} 분석 결과 객체
 */
async function analyzeHighValueUsers(connection, minPlayDays = 7, minNetBet = 50000, showDetails = true) {
  console.log(`[고가치 사용자 분석] 시작: minPlayDays=${minPlayDays}, minNetBet=${minNetBet}, showDetails=${showDetails}`);
  
  try {
    // 기본 통계 조회 쿼리
    const [summaryResults] = await connection.query(`
      SELECT 
        COUNT(*) as totalUsers,
        SUM(CASE WHEN DATEDIFF(NOW(), lastPlayDate) < 30 THEN 1 ELSE 0 END) as activeUsers,
        SUM(CASE WHEN DATEDIFF(NOW(), lastPlayDate) >= 30 THEN 1 ELSE 0 END) as dormantUsers,
        AVG(playDays) as avgPlayDays,
        SUM(totalNetBet) as totalNetBet,
        AVG(totalNetBet) as avgNetBet
      FROM (
        SELECT 
          p.userId,
          MAX(gs.gameDate) as lastPlayDate,
          COUNT(DISTINCT gs.gameDate) as playDays,
          SUM(gs.netBet) as totalNetBet
        FROM players p
        JOIN game_scores gs ON p.userId = gs.userId
        GROUP BY p.userId
        HAVING COUNT(DISTINCT gs.gameDate) >= ? AND SUM(gs.netBet) >= ?
      ) as highValueUsers
    `, [minPlayDays, minNetBet]);
    
    const summary = summaryResults[0] || {};
    summary.activePercentage = summary.totalUsers > 0 
      ? ((summary.activeUsers / summary.totalUsers) * 100).toFixed(1) 
      : '0.0';
    summary.dormantPercentage = summary.totalUsers > 0 
      ? ((summary.dormantUsers / summary.totalUsers) * 100).toFixed(1) 
      : '0.0';
    
    // 사용자 비교 분석
    const [comparisonResults] = await connection.query(`
      SELECT
        status,
        COUNT(*) as userCount,
        AVG(playDays) as avgPlayDays,
        AVG(totalNetBet) as avgNetBet,
        SUM(totalNetBet) as sumNetBet,
        MAX(totalNetBet) as maxNetBet,
        MAX(CASE WHEN totalNetBet = (SELECT MAX(totalNetBet) FROM (
          SELECT userId, SUM(netBet) as totalNetBet
          FROM game_scores
          GROUP BY userId
          HAVING COUNT(DISTINCT gameDate) >= ? AND SUM(netBet) >= ?
        ) as maxBetUser WHERE status = highValueUsers.status) THEN userId ELSE NULL END) as topUser
      FROM (
        SELECT 
          p.userId,
          COUNT(DISTINCT gs.gameDate) as playDays,
          SUM(gs.netBet) as totalNetBet,
          CASE WHEN DATEDIFF(NOW(), MAX(gs.gameDate)) < 30 THEN 'active' ELSE 'dormant' END as status
        FROM players p
        JOIN game_scores gs ON p.userId = gs.userId
        GROUP BY p.userId
        HAVING COUNT(DISTINCT gs.gameDate) >= ? AND SUM(gs.netBet) >= ?
      ) as highValueUsers
      GROUP BY status
    `, [minPlayDays, minNetBet, minPlayDays, minNetBet]);
    
    const userComparison = {
      active: { userCount: 0, avgPlayDays: 0, avgNetBet: 0, sumNetBet: 0, maxNetBet: 0, topUser: '' },
      dormant: { userCount: 0, avgPlayDays: 0, avgNetBet: 0, sumNetBet: 0, maxNetBet: 0, topUser: '' },
      differences: { avgPlayDaysDiff: 0, avgNetBetDiff: 0, maxNetBetDiff: 0 }
    };
    
    for (const row of comparisonResults) {
      if (row.status === 'active') {
        userComparison.active = { ...row };
      } else if (row.status === 'dormant') {
        userComparison.dormant = { ...row };
      }
    }
    
    // 차이 계산
    if (userComparison.dormant.avgPlayDays > 0) {
      userComparison.differences.avgPlayDaysDiff = Math.round(
        ((userComparison.active.avgPlayDays / userComparison.dormant.avgPlayDays) - 1) * 100
      );
    }
    
    if (userComparison.dormant.avgNetBet > 0) {
      userComparison.differences.avgNetBetDiff = Math.round(
        ((userComparison.active.avgNetBet / userComparison.dormant.avgNetBet) - 1) * 100
      );
    }
    
    if (userComparison.dormant.maxNetBet > 0) {
      userComparison.differences.maxNetBetDiff = Math.round(
        ((userComparison.active.maxNetBet / userComparison.dormant.maxNetBet) - 1) * 100
      );
    }
    
    // 휴면 기간별 분포
    const [dormantDistributionResults] = await connection.query(`
      SELECT
        CASE
          WHEN daysSinceLastPlay BETWEEN 30 AND 60 THEN '31-60일'
          WHEN daysSinceLastPlay BETWEEN 61 AND 90 THEN '61-90일'
          WHEN daysSinceLastPlay BETWEEN 91 AND 180 THEN '91-180일'
          WHEN daysSinceLastPlay BETWEEN 181 AND 365 THEN '181-365일'
          WHEN daysSinceLastPlay > 365 THEN '365일 이상'
          ELSE '30일 이하'
        END as period,
        COUNT(*) as userCount,
        AVG(totalNetBet) as avgNetBet,
        SUM(totalNetBet) as sumNetBet
      FROM (
        SELECT 
          p.userId,
          DATEDIFF(NOW(), MAX(gs.gameDate)) as daysSinceLastPlay,
          SUM(gs.netBet) as totalNetBet
        FROM players p
        JOIN game_scores gs ON p.userId = gs.userId
        GROUP BY p.userId
        HAVING COUNT(DISTINCT gs.gameDate) >= ? AND SUM(gs.netBet) >= ?
          AND DATEDIFF(NOW(), MAX(gs.gameDate)) >= 30
      ) as dormantUsers
      GROUP BY period
      ORDER BY 
        CASE period
          WHEN '31-60일' THEN 1
          WHEN '61-90일' THEN 2
          WHEN '91-180일' THEN 3
          WHEN '181-365일' THEN 4
          WHEN '365일 이상' THEN 5
          ELSE 0
        END
    `, [minPlayDays, minNetBet]);
    
    const dormantDistribution = dormantDistributionResults.map(item => {
      return {
        ...item,
        percentage: (item.userCount / (summary.dormantUsers || 1) * 100).toFixed(1)
      };
    });
    
    // 상세 정보를 요청한 경우 사용자 목록 조회
    let users = [];
    if (showDetails) {
      const [userResults] = await connection.query(`
        SELECT 
          u.userId,
          COUNT(DISTINCT gs.gameDate) as playDays,
          SUM(gs.netBet) as totalNetBet,
          MAX(gs.gameDate) as lastPlayDate,
          DATEDIFF(NOW(), MAX(gs.gameDate)) as daysSinceLastPlay,
          COUNT(pp.id) as eventCount,
          COALESCE(SUM(pp.reward), 0) as totalEventReward,
          CASE WHEN DATEDIFF(NOW(), MAX(gs.gameDate)) < 30 THEN 'active' ELSE 'dormant' END as status
        FROM (
          SELECT userId, id
          FROM players
        ) as u
        JOIN game_scores gs ON u.userId = gs.userId
        LEFT JOIN (
          SELECT player, id, reward
          FROM promotion_players
          WHERE appliedAt IS NOT NULL
        ) as pp ON u.id = pp.player
        GROUP BY u.userId
        HAVING COUNT(DISTINCT gs.gameDate) >= ? AND SUM(gs.netBet) >= ?
        ORDER BY totalNetBet DESC
      `, [minPlayDays, minNetBet]);
      
      users = userResults.map((user, index) => {
        return {
          ...user,
          rank: index + 1
        };
      });
    }
    
    // 고가치 사용자 세그먼트 분석
    const [segmentResults] = await connection.query(`
      SELECT
        CASE
          WHEN totalNetBet >= 500000 THEN 'VIP'
          WHEN totalNetBet >= 200000 THEN '우수 사용자'
          ELSE '일반 사용자'
        END as segment,
        COUNT(*) as userCount,
        SUM(CASE WHEN DATEDIFF(NOW(), lastPlayDate) < 30 THEN 1 ELSE 0 END) as activeCount,
        AVG(playDays) as avgPlayDays,
        AVG(totalNetBet) as avgNetBet,
        SUM(totalNetBet) as sumNetBet,
        AVG(eventCount) as avgEventCount,
        AVG(totalEventReward) as avgEventReward
      FROM (
        SELECT 
          u.userId,
          COUNT(DISTINCT gs.gameDate) as playDays,
          SUM(gs.netBet) as totalNetBet,
          MAX(gs.gameDate) as lastPlayDate,
          COUNT(pp.id) as eventCount,
          COALESCE(SUM(pp.reward), 0) as totalEventReward
        FROM (
          SELECT userId, id
          FROM players
        ) as u
        JOIN game_scores gs ON u.userId = gs.userId
        LEFT JOIN (
          SELECT player, id, reward
          FROM promotion_players
          WHERE appliedAt IS NOT NULL
        ) as pp ON u.id = pp.player
        GROUP BY u.userId
        HAVING COUNT(DISTINCT gs.gameDate) >= ? AND SUM(gs.netBet) >= ?
      ) as highValueUsers
      GROUP BY segment
    `, [minPlayDays, minNetBet]);
    
    const valuableSegments = segmentResults.map(segment => {
      return {
        ...segment,
        percentage: (segment.userCount / (summary.totalUsers || 1) * 100).toFixed(1),
        activePercentage: (segment.activeCount / (segment.userCount || 1) * 100).toFixed(1)
      };
    });
    
    console.log(`[고가치 사용자 분석] 완료: ${summary.totalUsers}명의 사용자 분석됨`);
    
    return {
      summary,
      userComparison,
      dormantDistribution,
      users,
      valuableSegments
    };
  } catch (error) {
    console.error('[고가치 사용자 분석 오류]:', error);
    throw error;
  }
}

/**
 * 이벤트 효과 분석 함수
 * 
 * @param {Object} connection 데이터베이스 연결 객체
 * @returns {Object} 이벤트 효과 분석 결과
 */
async function analyzeEventEffects(connection) {
  console.log('[이벤트 효과 분석] 시작');
  
  try {
    // 이벤트 효과 요약 통계
    const [summaryResults] = await connection.query(`
      SELECT
        COUNT(DISTINCT player) as totalEventUsers,
        SUM(reward) as totalEventRewards,
        COUNT(DISTINCT CASE WHEN deposit_after_event > 0 THEN player END) as usersWithDeposits,
        SUM(deposit_after_event) as totalDepositsAfterEvent
      FROM (
        SELECT
          pp.player,
          pp.reward,
          (
            SELECT COALESCE(SUM(mf.amount), 0)
            FROM money_flows mf
            WHERE mf.player = pp.player
              AND mf.type = 0
              AND mf.createdAt > pp.appliedAt
          ) as deposit_after_event
        FROM promotion_players pp
        WHERE pp.appliedAt IS NOT NULL
      ) as event_effects
    `);
    
    const summary = summaryResults[0] || {
      totalEventUsers: 0,
      totalEventRewards: 0,
      usersWithDeposits: 0,
      totalDepositsAfterEvent: 0
    };
    
    summary.conversionRate = summary.totalEventUsers > 0 
      ? ((summary.usersWithDeposits / summary.totalEventUsers) * 100).toFixed(1) 
      : '0.0';
    
    summary.roi = summary.totalEventRewards > 0 
      ? (summary.totalDepositsAfterEvent / summary.totalEventRewards).toFixed(2) 
      : '0.00';
    
    // 휴면 기간별 전환율
    const [conversionRateResults] = await connection.query(`
      SELECT
        CASE
          WHEN dormant_days BETWEEN 30 AND 60 THEN '31-60일'
          WHEN dormant_days BETWEEN 61 AND 90 THEN '61-90일'
          WHEN dormant_days BETWEEN 91 AND 180 THEN '91-180일'
          WHEN dormant_days BETWEEN 181 AND 365 THEN '181-365일'
          WHEN dormant_days > 365 THEN '365일 이상'
          ELSE '30일 이하'
        END as dormantPeriod,
        COUNT(DISTINCT player) as eventUsers,
        COUNT(DISTINCT CASE WHEN deposit_after_event > 0 THEN player END) as usersWithDeposits,
        SUM(reward) as totalRewards,
        SUM(deposit_after_event) as totalDeposits
      FROM (
        SELECT
          pp.player,
          pp.reward,
          DATEDIFF(pp.appliedAt, (
            SELECT MAX(gs.gameDate)
            FROM game_scores gs
            JOIN players p ON gs.userId = p.userId
            WHERE p.id = pp.player
              AND gs.gameDate < pp.appliedAt
          )) as dormant_days,
          (
            SELECT COALESCE(SUM(mf.amount), 0)
            FROM money_flows mf
            WHERE mf.player = pp.player
              AND mf.type = 0
              AND mf.createdAt > pp.appliedAt
          ) as deposit_after_event
        FROM promotion_players pp
        WHERE pp.appliedAt IS NOT NULL
      ) as dormant_conversion
      GROUP BY dormantPeriod
      ORDER BY 
        CASE dormantPeriod
          WHEN '30일 이하' THEN 0
          WHEN '31-60일' THEN 1
          WHEN '61-90일' THEN 2
          WHEN '91-180일' THEN 3
          WHEN '181-365일' THEN 4
          WHEN '365일 이상' THEN 5
          ELSE 6
        END
    `);
    
    const conversionRates = conversionRateResults.map(rate => {
      const conversionRate = rate.eventUsers > 0 
        ? ((rate.usersWithDeposits / rate.eventUsers) * 100).toFixed(1) 
        : '0.0';
      
      const roi = rate.totalRewards > 0 
        ? (rate.totalDeposits / rate.totalRewards).toFixed(2) 
        : '0.00';
      
      const averageDeposit = rate.usersWithDeposits > 0 
        ? Math.round(rate.totalDeposits / rate.usersWithDeposits) 
        : 0;
      
      return {
        ...rate,
        conversionRate,
        roi,
        averageDeposit
      };
    });
    
    // 이벤트 유형별 효과
    const [eventTypeResults] = await connection.query(`
      SELECT
        promotion as eventType,
        COUNT(DISTINCT player) as userCount,
        AVG(reward) as avgReward,
        SUM(reward) as totalRewards,
        COUNT(DISTINCT CASE WHEN deposit_after_event > 0 THEN player END) as depositUsers,
        SUM(deposit_after_event) as totalDeposits
      FROM (
        SELECT
          pp.player,
          pp.promotion,
          pp.reward,
          (
            SELECT COALESCE(SUM(mf.amount), 0)
            FROM money_flows mf
            WHERE mf.player = pp.player
              AND mf.type = 0
              AND mf.createdAt > pp.appliedAt
          ) as deposit_after_event
        FROM promotion_players pp
        WHERE pp.appliedAt IS NOT NULL
      ) as event_type_effects
      GROUP BY promotion
      ORDER BY totalDeposits DESC
    `);
    
    const eventTypes = eventTypeResults.map(type => {
      const conversionRate = type.userCount > 0 
        ? ((type.depositUsers / type.userCount) * 100).toFixed(1) 
        : '0.0';
      
      const roi = type.totalRewards > 0 
        ? (type.totalDeposits / type.totalRewards).toFixed(2) 
        : '0.00';
      
      return {
        ...type,
        conversionRate,
        roi
      };
    });
    
    console.log(`[이벤트 효과 분석] 완료: ${summary.totalEventUsers}명의 이벤트 참여자 분석됨`);
    
    return {
      summary,
      conversionRates,
      eventTypes
    };
  } catch (error) {
    console.error('[이벤트 효과 분석 오류]:', error);
    return {
      summary: { 
        totalEventUsers: 0, 
        totalEventRewards: 0, 
        usersWithDeposits: 0, 
        totalDepositsAfterEvent: 0,
        conversionRate: '0.0',
        roi: '0.00'
      },
      conversionRates: [],
      eventTypes: []
    };
  }
}

/**
 * HTML 보고서 생성 함수
 * 
 * @param {Object} analysisResult 분석 결과 객체
 * @returns {string} HTML 보고서 문자열
 */
function generateHtmlReport(analysisResult) {
  const {
    summary = {},
    userComparison = { active: {}, dormant: {}, differences: {} },
    dormantDistribution = [],
    users = [],
    valuableSegments = [],
    eventEffects = { summary: {}, conversionRates: [], eventTypes: [] }
  } = analysisResult;

  // HTML 템플릿을 템플릿 리터럴로 작성
  return `<!DOCTYPE html>
<html lang="ko">
<head>
    <meta charset="UTF-8">
    <meta name="viewport" content="width=device-width, initial-scale=1.0">
    <title>고가치 사용자 종합 분석 보고서</title>
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
        
        table {
            width: 100%;
            border-collapse: collapse;
            margin: 20px 0;
            background-color: #fff;
            box-shadow: 0 1px 3px rgba(0,0,0,0.1);
        }
        
        th, td {
            padding: 12px 15px;
            text-align: left;
            border-bottom: 1px solid #e1e1e1;
        }
        
        th {
            background-color: #f1f8ff;
            font-weight: 600;
            color: #2c3e50;
        }
        
        tbody tr:hover {
            background-color: #f9f9f9;
        }
        
        .section {
            background-color: #fff;
            border-radius: 8px;
            padding: 20px;
            margin-bottom: 30px;
            box-shadow: 0 1px 3px rgba(0,0,0,0.1);
        }
        
        .summary-stats {
            display: flex;
            flex-wrap: wrap;
            justify-content: space-between;
            margin: 20px 0;
        }
        
        .stat-card {
            background-color: #f8f9fa;
            border-radius: 8px;
            padding: 15px;
            margin-bottom: 15px;
            box-shadow: 0 1px 2px rgba(0,0,0,0.05);
            width: calc(33.33% - 15px);
            box-sizing: border-box;
        }
        
        .stat-value {
            font-size: 1.8em;
            font-weight: 700;
            color: #3498db;
            margin: 10px 0;
        }
        
        .stat-sub {
            color: #7f8c8d;
            font-size: 0.9em;
        }
        
        .comparison-table {
            width: 100%;
        }
        
        .comparison-table th:first-child,
        .comparison-table td:first-child {
            width: 30%;
        }
        
        .tag {
            display: inline-block;
            padding: 3px 8px;
            border-radius: 12px;
            font-size: 0.85em;
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
        
        .bar-chart {
            margin-top: 20px;
        }
        
        .bar-chart .chart-bar {
            height: 25px;
            margin-bottom: 8px;
            background-color: #3498db;
            border-radius: 4px;
            transition: width 0.5s ease;
            position: relative;
        }
        
        .bar-chart .chart-label {
            width: 120px;
            display: inline-block;
            margin-right: 10px;
            text-align: right;
            font-weight: 500;
        }
        
        .bar-chart .chart-value {
            position: absolute;
            right: 10px;
            color: white;
            font-weight: 500;
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
    </style>
</head>
<body>
    <header>
        <h1>고가치 사용자 종합 분석 보고서</h1>
        <p>7일 이상 게임 기록 및 유효배팅 50,000 이상 사용자 분석</p>
        <p>분석일: ${new Date().toISOString().split('T')[0]}</p>
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
                <div class="stat-value">${summary.totalUsers || 0}명</div>
                <div class="stat-sub">모든 활성 및 휴면 사용자</div>
            </div>
            <div class="stat-card">
                <h3>활성 사용자 비율</h3>
                <div class="stat-value">${summary.activePercentage || '0.0'}%</div>
                <div class="stat-sub">${summary.activeUsers || 0}명 (최근 30일 내 활동)</div>
            </div>
            <div class="stat-card">
                <h3>휴면 사용자 비율</h3>
                <div class="stat-value">${summary.dormantPercentage || '0.0'}%</div>
                <div class="stat-sub">${summary.dormantUsers || 0}명 (30일 이상 미활동)</div>
            </div>
        </div>
    </div>
    
    <!-- 사용자 비교 분석 섹션 -->
    <div class="section">
        <h2>활성 vs 휴면 사용자 비교</h2>
        <table class="comparison-table">
            <thead>
                <tr>
                    <th>지표</th>
                    <th>활성 사용자</th>
                    <th>휴면 사용자</th>
                    <th>차이</th>
                </tr>
            </thead>
            <tbody>
                <tr>
                    <td>평균 플레이 일수</td>
                    <td>${Math.round(userComparison.active.avgPlayDays || 0)}일</td>
                    <td>${Math.round(userComparison.dormant.avgPlayDays || 0)}일</td>
                    <td>+${userComparison.differences.avgPlayDaysDiff || 0}%</td>
                </tr>
                <tr>
                    <td>평균 유효배팅 금액</td>
                    <td>${Math.round(userComparison.active.avgNetBet || 0).toLocaleString()}원</td>
                    <td>${Math.round(userComparison.dormant.avgNetBet || 0).toLocaleString()}원</td>
                    <td>+${userComparison.differences.avgNetBetDiff || 0}%</td>
                </tr>
            </tbody>
        </table>
    </div>
    
    <!-- 휴면 사용자 분석 섹션 -->
    <div class="section">
        <h2>휴면 기간별 사용자 분포</h2>
        <table>
            <thead>
                <tr>
                    <th>휴면 기간</th>
                    <th>사용자 수</th>
                    <th>비율</th>
                    <th>평균 유효배팅</th>
                </tr>
            </thead>
            <tbody>
                ${dormantDistribution.map(item => `
                <tr>
                    <td>${item.period}</td>
                    <td>${item.userCount}명</td>
                    <td>${item.percentage}%</td>
                    <td>${Math.round(item.avgNetBet).toLocaleString()}원</td>
                </tr>
                `).join('')}
            </tbody>
        </table>
        
        <div class="bar-chart">
            ${dormantDistribution.map(item => `
            <div>
                <span class="chart-label">${item.period}</span>
                <span class="chart-bar" style="width: ${item.percentage * 5}px;">
                    <span class="chart-value">${item.userCount}명 (${item.percentage}%)</span>
                </span>
            </div>
            `).join('')}
        </div>
    </div>
    
    <!-- 사용자 목록 섹션 -->
    ${users && users.length > 0 ? `
    <div class="section">
        <h2>고가치 사용자 목록 (상위 10명)</h2>
        <table>
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
                ${users.slice(0, 10).map(user => `
                <tr>
                    <td>${user.rank}</td>
                    <td>${user.userId}</td>
                    <td>${user.playDays}</td>
                    <td>${Math.round(user.totalNetBet).toLocaleString()}</td>
                    <td>${user.lastPlayDate}</td>
                    <td>${user.daysSinceLastPlay}</td>
                    <td><span class="tag tag-${user.status}">${user.status === 'active' ? '활성' : '휴면'}</span></td>
                </tr>
                `).join('')}
            </tbody>
        </table>
    </div>
    ` : ''}
    
    <!-- 권장 전략 섹션 -->
    <div class="section">
        <h2>권장 전략</h2>
        
        <div class="recommendations">
            <h3>활성 고가치 사용자 유지 전략</h3>
            <ul>
                <li><strong>맞춤형 VIP 프로그램</strong>: 개인화된 보상 및 혜택, 전담 VIP 매니저 배정</li>
                <li><strong>계층적 충성도 프로그램</strong>: 활동 수준에 따른 등급 시스템, 등급별 차별화된 혜택</li>
                <li><strong>활동 예측 및 예방</strong>: 활동 패턴 모니터링, 활동 감소 시 즉각적인 개입</li>
            </ul>
        </div>
        
        <div class="recommendations">
            <h3>휴면 고가치 사용자 재활성화 전략</h3>
            <ul>
                <li><strong>세그먼트별 맞춤형 전략</strong>:
                    <ul>
                        <li>단기 휴면(31-90일): 즉각적인 복귀 인센티브, 환영 보너스</li>
                        <li>중기 휴면(91-365일): 단계적 재참여 유도, 더 큰 보상</li>
                        <li>장기 휴면(365일+): 강력한 복귀 패키지, 최신 기능 소개</li>
                    </ul>
                </li>
            </ul>
        </div>
    </div>
    
    <footer>
        <p>© 2025 DB2 프로젝트 팀 | 보고서 생성일: ${new Date().toISOString().split('T')[0]}</p>
    </footer>

    <script>
        document.addEventListener('DOMContentLoaded', function() {
            // 사용자 테이블 필터링 및 검색 기능
            const searchInput = document.getElementById('userSearchInput');
            const statusFilter = document.getElementById('statusFilter');
            const table = document.getElementById('usersTable');
            
            if (table) {
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
                    
                    // 이벤트 리스너 등 추가 페이지네이션 기능 구현...
                }
                
                // 이벤트 리스너 설정
                if (searchInput && statusFilter) {
                    searchInput.addEventListener('input', filterTable);
                    statusFilter.addEventListener('change', filterTable);
                    
                    // 초기 테이블 필터링 실행
                    filterTable();
                }
            }
        });
    </script>
</body>
</html>`;
}

// 필요한 함수를 외부로 내보내기
exports.analyzeHighValueUsers = analyzeHighValueUsers;
exports.analyzeEventEffects = analyzeEventEffects;
exports.generateHtmlReport = generateHtmlReport;
