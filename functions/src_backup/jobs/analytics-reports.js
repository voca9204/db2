/**
 * 분석 보고서 생성 및 배포 모듈
 * 일일/주간/월간 분석 결과 보고서 생성 및 배포
 */

const admin = require('firebase-admin');
const { executeQuery } = require('../../db');
const { getContextLogger } = require('../utils/logger');
const { sendEmail } = require('../utils/notification');
const firestoreModel = require('../models/firestore');

// 로거 초기화
const logger = getContextLogger('analytics-reports');

/**
 * 일일 분석 보고서 생성 및 배포
 * @param {Object} context Cloud Functions 실행 컨텍스트
 * @return {Promise} 작업 실행 결과
 */
const generateDailyReport = async (context) => {
  try {
    logger.info('Generating daily analytics report:', new Date().toISOString());
    
    // 작업 시작 기록
    const jobRef = admin.firestore().collection('analyticsJobs').doc();
    await jobRef.set({
      jobType: 'dailyReport',
      status: 'running',
      startTime: admin.firestore.FieldValue.serverTimestamp(),
      createdAt: admin.firestore.FieldValue.serverTimestamp(),
    });
    
    // 오늘 날짜 계산
    const today = new Date();
    const dateStr = today.toISOString().split('T')[0]; // YYYY-MM-DD
    
    // 어제 날짜 계산
    const yesterday = new Date(today);
    yesterday.setDate(today.getDate() - 1);
    const yesterdayStr = yesterday.toISOString().split('T')[0];
    
    // 1. 일일 사용자 활동 통계 조회
    const dailyActivityQuery = `
      SELECT 
        COUNT(DISTINCT user_id) as activeUsers,
        COUNT(*) as totalActivities,
        SUM(CASE WHEN activity_type = 'game' THEN 1 ELSE 0 END) as gamePlays,
        SUM(CASE WHEN activity_type = 'deposit' THEN 1 ELSE 0 END) as deposits,
        SUM(CASE WHEN activity_type = 'withdrawal' THEN 1 ELSE 0 END) as withdrawals,
        SUM(CASE WHEN activity_type = 'login' THEN 1 ELSE 0 END) as logins,
        SUM(CASE WHEN is_new_user = 1 THEN 1 ELSE 0 END) as newUsers
      FROM user_activities
      WHERE DATE(activity_date) = '${yesterdayStr}'
    `;
    
    const activityStats = await executeQuery(dailyActivityQuery);
    
    // 2. 이벤트 참여 통계 조회
    const eventParticipationQuery = `
      SELECT 
        e.id as eventId,
        e.name as eventName,
        COUNT(DISTINCT pe.user_id) as participantCount
      FROM events e
      JOIN participant_events pe ON e.id = pe.event_id
      WHERE DATE(pe.participation_date) = '${yesterdayStr}'
      GROUP BY e.id, e.name
      ORDER BY participantCount DESC
    `;
    
    const eventStats = await executeQuery(eventParticipationQuery);
    
    // 3. 입금/출금 통계 조회
    const transactionStatsQuery = `
      SELECT 
        SUM(CASE WHEN type = 'deposit' THEN amount ELSE 0 END) as totalDeposits,
        COUNT(CASE WHEN type = 'deposit' THEN 1 ELSE NULL END) as depositCount,
        AVG(CASE WHEN type = 'deposit' THEN amount ELSE NULL END) as avgDepositAmount,
        SUM(CASE WHEN type = 'withdrawal' THEN amount ELSE 0 END) as totalWithdrawals,
        COUNT(CASE WHEN type = 'withdrawal' THEN 1 ELSE NULL END) as withdrawalCount,
        AVG(CASE WHEN type = 'withdrawal' THEN amount ELSE NULL END) as avgWithdrawalAmount
      FROM transactions
      WHERE DATE(date) = '${yesterdayStr}'
    `;
    
    const transactionStats = await executeQuery(transactionStatsQuery);
    
    // 4. 게임 플레이 통계 조회
    const gameStatsQuery = `
      SELECT 
        game_type,
        COUNT(*) as playCount,
        COUNT(DISTINCT user_id) as uniquePlayers,
        SUM(net_bet) as totalNetBet,
        AVG(net_bet) as avgNetBet
      FROM game_logs
      WHERE DATE(date) = '${yesterdayStr}'
      GROUP BY game_type
      ORDER BY playCount DESC
    `;
    
    const gameStats = await executeQuery(gameStatsQuery);
    
    // 5. 일일 성장율 계산 (전일 대비)
    // 전일 사용자 활동 통계 조회
    const dayBeforeYesterday = new Date(yesterday);
    dayBeforeYesterday.setDate(yesterday.getDate() - 1);
    const dayBeforeYesterdayStr = dayBeforeYesterday.toISOString().split('T')[0];
    
    const prevDayActivityQuery = `
      SELECT 
        COUNT(DISTINCT user_id) as activeUsers,
        COUNT(*) as totalActivities,
        SUM(CASE WHEN activity_type = 'game' THEN 1 ELSE 0 END) as gamePlays,
        SUM(CASE WHEN activity_type = 'deposit' THEN 1 ELSE 0 END) as deposits
      FROM user_activities
      WHERE DATE(activity_date) = '${dayBeforeYesterdayStr}'
    `;
    
    const prevDayStats = await executeQuery(prevDayActivityQuery);
    
    // 성장율 계산 함수
    const calculateGrowth = (current, previous) => {
      if (!previous || previous === 0) return 100; // 이전 값이 0이면 100% 성장
      return parseFloat(((current - previous) / previous * 100).toFixed(2));
    };
    
    // 성장율 계산
    const growth = {
      activeUsers: calculateGrowth(
        activityStats[0]?.activeUsers || 0, 
        prevDayStats[0]?.activeUsers || 0
      ),
      totalActivities: calculateGrowth(
        activityStats[0]?.totalActivities || 0, 
        prevDayStats[0]?.totalActivities || 0
      ),
      gamePlays: calculateGrowth(
        activityStats[0]?.gamePlays || 0, 
        prevDayStats[0]?.gamePlays || 0
      ),
      deposits: calculateGrowth(
        activityStats[0]?.deposits || 0, 
        prevDayStats[0]?.deposits || 0
      )
    };
    
    // 6. 종합된 보고서 데이터 구성
    const reportData = {
      date: yesterdayStr,
      generated: new Date().toISOString(),
      activityStats: activityStats[0] || {
        activeUsers: 0,
        totalActivities: 0,
        gamePlays: 0,
        deposits: 0,
        withdrawals: 0,
        logins: 0,
        newUsers: 0
      },
      eventStats: eventStats || [],
      transactionStats: transactionStats[0] || {
        totalDeposits: 0,
        depositCount: 0,
        avgDepositAmount: 0,
        totalWithdrawals: 0,
        withdrawalCount: 0,
        avgWithdrawalAmount: 0
      },
      gameStats: gameStats || [],
      growth
    };
    
    // 7. 보고서 저장 (Firestore)
    const db = admin.firestore();
    await db.collection('reports').doc(`daily-${yesterdayStr}`).set({
      ...reportData,
      reportType: 'daily',
      createdAt: admin.firestore.FieldValue.serverTimestamp()
    });
    
    // 8. 일일 스냅샷 저장
    await firestoreModel.saveAnalyticsSnapshot('dailyStats', reportData, 'daily');
    
    // 9. 관리자 이메일 조회 및 이메일 발송
    const adminUsersSnapshot = await db.collection('users')
      .where('roles', 'array-contains', 'admin')
      .where('notifications.dailyReport', '==', true)
      .get();
    
    if (!adminUsersSnapshot.empty) {
      const adminEmails = [];
      
      adminUsersSnapshot.forEach(doc => {
        const userData = doc.data();
        if (userData.email) {
          adminEmails.push(userData.email);
        }
      });
      
      if (adminEmails.length > 0) {
        // 이메일 제목 및 내용 구성
        const subject = `📊 일일 분석 보고서 (${yesterdayStr})`;
        
        const emailData = {
          date: yesterdayStr,
          stats: reportData,
          dashboardUrl: process.env.DASHBOARD_URL || 'https://dashboard.example.com'
        };
        
        // 이메일 전송
        await sendEmail(adminEmails, subject, 'daily-analytics-report', emailData);
        logger.info(`Sent daily report email to ${adminEmails.length} admins`);
      }
    }
    
    // 작업 완료 기록
    await jobRef.update({
      status: 'completed',
      endTime: admin.firestore.FieldValue.serverTimestamp(),
      resultSummary: {
        reportDate: yesterdayStr,
        activeUsers: reportData.activityStats.activeUsers,
        newUsers: reportData.activityStats.newUsers,
        totalDeposits: reportData.transactionStats.totalDeposits
      }
    });
    
    logger.info('Daily analytics report generated successfully');
    return { success: true, reportDate: yesterdayStr };
  } catch (error) {
    logger.error('Daily analytics report generation failed:', error);
    
    // 오류 기록
    try {
      const jobRef = admin.firestore().collection('analyticsJobs').doc();
      await jobRef.update({
        status: 'failed',
        endTime: admin.firestore.FieldValue.serverTimestamp(),
        errorMessage: error.message,
      });
    } catch (logError) {
      logger.error('Failed to update job status:', logError);
    }
    
    throw error;
  }
};

/**
 * 주간 분석 보고서 생성 및 배포
 * @param {Object} context Cloud Functions 실행 컨텍스트
 * @return {Promise} 작업 실행 결과
 */
const generateWeeklyReport = async (context) => {
  try {
    logger.info('Generating weekly analytics report:', new Date().toISOString());
    
    // 작업 시작 기록
    const jobRef = admin.firestore().collection('analyticsJobs').doc();
    await jobRef.set({
      jobType: 'weeklyReport',
      status: 'running',
      startTime: admin.firestore.FieldValue.serverTimestamp(),
      createdAt: admin.firestore.FieldValue.serverTimestamp(),
    });
    
    // 날짜 계산
    const today = new Date();
    
    // 지난 주 월요일과 일요일 계산
    const dayOfWeek = today.getDay(); // 0: 일요일, 1: 월요일, ...
    const diff = dayOfWeek === 0 ? 7 : dayOfWeek; // 오늘이 일요일이면 7, 아니면 dayOfWeek
    
    // 이번 주 월요일
    const thisWeekMonday = new Date(today);
    thisWeekMonday.setDate(today.getDate() - diff + 1);
    
    // 지난 주 월요일과 일요일
    const lastWeekMonday = new Date(thisWeekMonday);
    lastWeekMonday.setDate(thisWeekMonday.getDate() - 7);
    
    const lastWeekSunday = new Date(thisWeekMonday);
    lastWeekSunday.setDate(thisWeekMonday.getDate() - 1);
    
    // 날짜 문자열 변환
    const lastWeekMondayStr = lastWeekMonday.toISOString().split('T')[0];
    const lastWeekSundayStr = lastWeekSunday.toISOString().split('T')[0];
    
    // 2주 전 월요일과 일요일 (비교용)
    const twoWeeksAgoMonday = new Date(lastWeekMonday);
    twoWeeksAgoMonday.setDate(lastWeekMonday.getDate() - 7);
    
    const twoWeeksAgoSunday = new Date(lastWeekSunday);
    twoWeeksAgoSunday.setDate(lastWeekSunday.getDate() - 7);
    
    const twoWeeksAgoMondayStr = twoWeeksAgoMonday.toISOString().split('T')[0];
    const twoWeeksAgoSundayStr = twoWeeksAgoSunday.toISOString().split('T')[0];
    
    // 1. 주간 사용자 활동 통계 조회
    const weeklyActivityQuery = `
      SELECT 
        COUNT(DISTINCT user_id) as activeUsers,
        COUNT(*) as totalActivities,
        SUM(CASE WHEN activity_type = 'game' THEN 1 ELSE 0 END) as gamePlays,
        SUM(CASE WHEN activity_type = 'deposit' THEN 1 ELSE 0 END) as deposits,
        SUM(CASE WHEN activity_type = 'withdrawal' THEN 1 ELSE 0 END) as withdrawals,
        SUM(CASE WHEN activity_type = 'login' THEN 1 ELSE 0 END) as logins,
        SUM(CASE WHEN is_new_user = 1 THEN 1 ELSE 0 END) as newUsers
      FROM user_activities
      WHERE DATE(activity_date) BETWEEN '${lastWeekMondayStr}' AND '${lastWeekSundayStr}'
    `;
    
    const activityStats = await executeQuery(weeklyActivityQuery);
    
    // 2. 고가치 사용자 통계 조회
    const highValueUserQuery = `
      SELECT 
        SUM(CASE WHEN inactiveDays <= 30 THEN 1 ELSE 0 END) as activeHighValueUsers,
        SUM(CASE WHEN inactiveDays > 30 AND inactiveDays <= 90 THEN 1 ELSE 0 END) as dormantHighValueUsers,
        AVG(netBet) as avgHighValueUserNetBet
      FROM (
        SELECT 
          u.id,
          COUNT(DISTINCT g.date) as playDays,
          SUM(g.net_bet) as netBet,
          DATEDIFF('${lastWeekSundayStr}', MAX(g.date)) as inactiveDays
        FROM users u
        JOIN game_logs g ON u.id = g.user_id
        GROUP BY u.id
        HAVING playDays >= 7 AND netBet >= 50000
      ) as high_value_users
    `;
    
    const highValueUserStats = await executeQuery(highValueUserQuery);
    
    // 3. 이벤트 참여 및 전환 통계 조회
    const eventConversionQuery = `
      SELECT 
        COUNT(DISTINCT e.id) as totalEvents,
        SUM(e.participant_count) as totalParticipants,
        SUM(e.conversion_count) as totalConversions,
        AVG(e.conversion_rate) as avgConversionRate
      FROM (
        SELECT 
          e.id,
          COUNT(DISTINCT pe.user_id) as participant_count,
          COUNT(DISTINCT t.user_id) as conversion_count,
          CASE 
            WHEN COUNT(DISTINCT pe.user_id) > 0 
            THEN (COUNT(DISTINCT t.user_id) / COUNT(DISTINCT pe.user_id)) * 100 
            ELSE 0 
          END as conversion_rate
        FROM events e
        JOIN participant_events pe ON e.id = pe.event_id
        LEFT JOIN (
          SELECT 
            pe.user_id,
            pe.event_id
          FROM participant_events pe
          JOIN transactions t ON 
            pe.user_id = t.user_id 
            AND t.type = 'deposit'
            AND t.date > pe.participation_date
            AND DATEDIFF(t.date, pe.participation_date) <= 30
          GROUP BY pe.user_id, pe.event_id
        ) as t ON pe.user_id = t.user_id AND pe.event_id = t.event_id
        WHERE pe.participation_date BETWEEN '${lastWeekMondayStr}' AND '${lastWeekSundayStr}'
        GROUP BY e.id
      ) as e
    `;
    
    const eventConversionStats = await executeQuery(eventConversionQuery);
    
    // 4. 휴면 사용자 재활성화 통계 조회
    const reactivationQuery = `
      SELECT 
        COUNT(DISTINCT user_id) as reactivatedUsers,
        AVG(dormancy_days) as avgDormancyDays,
        SUM(deposit_amount) as totalReactivatedDeposits
      FROM (
        SELECT 
          a.user_id,
          a.activity_date,
          DATEDIFF(a.activity_date, 
            (SELECT MAX(b.activity_date) 
             FROM user_activities b 
             WHERE b.user_id = a.user_id AND b.activity_date < '${lastWeekMondayStr}')
          ) as dormancy_days,
          IFNULL(
            (SELECT SUM(t.amount) 
             FROM transactions t 
             WHERE t.user_id = a.user_id AND t.type = 'deposit' 
               AND t.date BETWEEN '${lastWeekMondayStr}' AND '${lastWeekSundayStr}'
            ),
            0
          ) as deposit_amount
        FROM user_activities a
        WHERE a.activity_date BETWEEN '${lastWeekMondayStr}' AND '${lastWeekSundayStr}'
        GROUP BY a.user_id
        HAVING dormancy_days >= 30  -- 30일 이상 휴면 상태였다가 재활성화된 사용자
      ) as reactivated
    `;
    
    const reactivationStats = await executeQuery(reactivationQuery);
    
    // 5. 주간 성장율 계산 (전주 대비)
    // 전주 사용자 활동 통계 조회
    const prevWeekActivityQuery = `
      SELECT 
        COUNT(DISTINCT user_id) as activeUsers,
        COUNT(*) as totalActivities,
        SUM(CASE WHEN activity_type = 'game' THEN 1 ELSE 0 END) as gamePlays,
        SUM(CASE WHEN activity_type = 'deposit' THEN 1 ELSE 0 END) as deposits
      FROM user_activities
      WHERE DATE(activity_date) BETWEEN '${twoWeeksAgoMondayStr}' AND '${twoWeeksAgoSundayStr}'
    `;
    
    const prevWeekStats = await executeQuery(prevWeekActivityQuery);
    
    // 성장율 계산
    const growth = {
      activeUsers: calculateGrowth(
        activityStats[0]?.activeUsers || 0, 
        prevWeekStats[0]?.activeUsers || 0
      ),
      totalActivities: calculateGrowth(
        activityStats[0]?.totalActivities || 0, 
        prevWeekStats[0]?.totalActivities || 0
      ),
      gamePlays: calculateGrowth(
        activityStats[0]?.gamePlays || 0, 
        prevWeekStats[0]?.gamePlays || 0
      ),
      deposits: calculateGrowth(
        activityStats[0]?.deposits || 0, 
        prevWeekStats[0]?.deposits || 0
      )
    };
    
    // 6. 종합된 보고서 데이터 구성
    const reportData = {
      period: {
        start: lastWeekMondayStr,
        end: lastWeekSundayStr
      },
      generated: new Date().toISOString(),
      activityStats: activityStats[0] || {
        activeUsers: 0,
        totalActivities: 0,
        gamePlays: 0,
        deposits: 0,
        withdrawals: 0,
        logins: 0,
        newUsers: 0
      },
      highValueUserStats: highValueUserStats[0] || {
        activeHighValueUsers: 0,
        dormantHighValueUsers: 0,
        avgHighValueUserNetBet: 0
      },
      eventConversionStats: eventConversionStats[0] || {
        totalEvents: 0,
        totalParticipants: 0,
        totalConversions: 0,
        avgConversionRate: 0
      },
      reactivationStats: reactivationStats[0] || {
        reactivatedUsers: 0,
        avgDormancyDays: 0,
        totalReactivatedDeposits: 0
      },
      growth
    };
    
    // 7. 보고서 저장 (Firestore)
    const db = admin.firestore();
    await db.collection('reports').doc(`weekly-${lastWeekMondayStr}`).set({
      ...reportData,
      reportType: 'weekly',
      createdAt: admin.firestore.FieldValue.serverTimestamp()
    });
    
    // 8. 주간 스냅샷 저장
    await firestoreModel.saveAnalyticsSnapshot('weeklyStats', reportData, 'weekly');
    
    // 9. 관리자 이메일 조회 및 이메일 발송
    const adminUsersSnapshot = await db.collection('users')
      .where('roles', 'array-contains', 'admin')
      .where('notifications.weeklyReport', '==', true)
      .get();
    
    if (!adminUsersSnapshot.empty) {
      const adminEmails = [];
      
      adminUsersSnapshot.forEach(doc => {
        const userData = doc.data();
        if (userData.email) {
          adminEmails.push(userData.email);
        }
      });
      
      if (adminEmails.length > 0) {
        // 이메일 제목 및 내용 구성
        const subject = `📈 주간 분석 보고서 (${lastWeekMondayStr} ~ ${lastWeekSundayStr})`;
        
        const emailData = {
          period: {
            start: lastWeekMondayStr,
            end: lastWeekSundayStr
          },
          stats: reportData,
          dashboardUrl: process.env.DASHBOARD_URL || 'https://dashboard.example.com'
        };
        
        // 이메일 전송
        await sendEmail(adminEmails, subject, 'weekly-analytics-report', emailData);
        logger.info(`Sent weekly report email to ${adminEmails.length} admins`);
      }
    }
    
    // 작업 완료 기록
    await jobRef.update({
      status: 'completed',
      endTime: admin.firestore.FieldValue.serverTimestamp(),
      resultSummary: {
        reportPeriod: `${lastWeekMondayStr} ~ ${lastWeekSundayStr}`,
        activeUsers: reportData.activityStats.activeUsers,
        newUsers: reportData.activityStats.newUsers,
        highValueUsers: reportData.highValueUserStats.activeHighValueUsers + reportData.highValueUserStats.dormantHighValueUsers,
        reactivatedUsers: reportData.reactivationStats.reactivatedUsers
      }
    });
    
    logger.info('Weekly analytics report generated successfully');
    return { success: true, reportPeriod: `${lastWeekMondayStr} ~ ${lastWeekSundayStr}` };
  } catch (error) {
    logger.error('Weekly analytics report generation failed:', error);
    
    // 오류 기록
    try {
      const jobRef = admin.firestore().collection('analyticsJobs').doc();
      await jobRef.update({
        status: 'failed',
        endTime: admin.firestore.FieldValue.serverTimestamp(),
        errorMessage: error.message,
      });
    } catch (logError) {
      logger.error('Failed to update job status:', logError);
    }
    
    throw error;
  }
};

/**
 * 월간 분석 보고서 생성 및 배포
 * @param {Object} context Cloud Functions 실행 컨텍스트
 * @return {Promise} 작업 실행 결과
 */
const generateMonthlyReport = async (context) => {
  try {
    logger.info('Generating monthly analytics report:', new Date().toISOString());
    
    // 작업 시작 기록
    const jobRef = admin.firestore().collection('analyticsJobs').doc();
    await jobRef.set({
      jobType: 'monthlyReport',
      status: 'running',
      startTime: admin.firestore.FieldValue.serverTimestamp(),
      createdAt: admin.firestore.FieldValue.serverTimestamp(),
    });
    
    // 날짜 계산
    const today = new Date();
    
    // 지난 달의 첫날과 마지막 날
    const lastMonth = new Date(today);
    lastMonth.setDate(1);
    lastMonth.setMonth(lastMonth.getMonth() - 1);
    
    const lastMonthFirstDay = new Date(lastMonth);
    
    const lastMonthLastDay = new Date(today);
    lastMonthLastDay.setDate(0);
    
    // 날짜 문자열 변환
    const lastMonthFirstDayStr = lastMonthFirstDay.toISOString().split('T')[0];
    const lastMonthLastDayStr = lastMonthLastDay.toISOString().split('T')[0];
    
    // 2달 전의 첫날과 마지막 날 (비교용)
    const twoMonthsAgo = new Date(lastMonth);
    twoMonthsAgo.setMonth(twoMonthsAgo.getMonth() - 1);
    
    const twoMonthsAgoFirstDay = new Date(twoMonthsAgo);
    
    const twoMonthsAgoLastDay = new Date(lastMonth);
    twoMonthsAgoLastDay.setDate(0);
    
    const twoMonthsAgoFirstDayStr = twoMonthsAgoFirstDay.toISOString().split('T')[0];
    const twoMonthsAgoLastDayStr = twoMonthsAgoLastDay.toISOString().split('T')[0];
    
    // 지난 달 이름
    const monthNames = [
      '1월', '2월', '3월', '4월', '5월', '6월',
      '7월', '8월', '9월', '10월', '11월', '12월'
    ];
    const lastMonthName = monthNames[lastMonth.getMonth()];
    const lastMonthYear = lastMonth.getFullYear();
    
    // 1. 월간 사용자 활동 통계 조회
    const monthlyActivityQuery = `
      SELECT 
        COUNT(DISTINCT user_id) as activeUsers,
        COUNT(*) as totalActivities,
        SUM(CASE WHEN activity_type = 'game' THEN 1 ELSE 0 END) as gamePlays,
        SUM(CASE WHEN activity_type = 'deposit' THEN 1 ELSE 0 END) as deposits,
        SUM(CASE WHEN activity_type = 'withdrawal' THEN 1 ELSE 0 END) as withdrawals,
        SUM(CASE WHEN activity_type = 'login' THEN 1 ELSE 0 END) as logins,
        SUM(CASE WHEN is_new_user = 1 THEN 1 ELSE 0 END) as newUsers
      FROM user_activities
      WHERE DATE(activity_date) BETWEEN '${lastMonthFirstDayStr}' AND '${lastMonthLastDayStr}'
    `;
    
    const activityStats = await executeQuery(monthlyActivityQuery);
    
    // 2. 매출 및 이익 통계 조회
    const revenueStatsQuery = `
      SELECT 
        SUM(CASE WHEN type = 'deposit' THEN amount ELSE 0 END) as totalDeposits,
        SUM(CASE WHEN type = 'withdrawal' THEN amount ELSE 0 END) as totalWithdrawals,
        COUNT(DISTINCT CASE WHEN type = 'deposit' THEN user_id ELSE NULL END) as uniqueDepositUsers,
        (SELECT SUM(net_bet) FROM game_logs WHERE DATE(date) BETWEEN '${lastMonthFirstDayStr}' AND '${lastMonthLastDayStr}') as totalNetBet
      FROM transactions
      WHERE DATE(date) BETWEEN '${lastMonthFirstDayStr}' AND '${lastMonthLastDayStr}'
    `;
    
    const revenueStats = await executeQuery(revenueStatsQuery);
    
    // 3. 고가치 사용자 트렌드 조회
    const highValueTrendQuery = `
      SELECT 
        'firstDay' as point,
        SUM(CASE WHEN inactiveDays <= 30 THEN 1 ELSE 0 END) as activeHighValueUsers,
        SUM(CASE WHEN inactiveDays > 30 THEN 1 ELSE 0 END) as dormantHighValueUsers
      FROM (
        SELECT 
          u.id,
          COUNT(DISTINCT g.date) as playDays,
          SUM(g.net_bet) as netBet,
          DATEDIFF('${lastMonthFirstDayStr}', MAX(g.date)) as inactiveDays
        FROM users u
        JOIN game_logs g ON u.id = g.user_id AND g.date <= '${lastMonthFirstDayStr}'
        GROUP BY u.id
        HAVING playDays >= 7 AND netBet >= 50000
      ) as first_day_snapshot
      
      UNION ALL
      
      SELECT 
        'lastDay' as point,
        SUM(CASE WHEN inactiveDays <= 30 THEN 1 ELSE 0 END) as activeHighValueUsers,
        SUM(CASE WHEN inactiveDays > 30 THEN 1 ELSE 0 END) as dormantHighValueUsers
      FROM (
        SELECT 
          u.id,
          COUNT(DISTINCT g.date) as playDays,
          SUM(g.net_bet) as netBet,
          DATEDIFF('${lastMonthLastDayStr}', MAX(g.date)) as inactiveDays
        FROM users u
        JOIN game_logs g ON u.id = g.user_id AND g.date <= '${lastMonthLastDayStr}'
        GROUP BY u.id
        HAVING playDays >= 7 AND netBet >= 50000
      ) as last_day_snapshot
    `;
    
    const highValueTrend = await executeQuery(highValueTrendQuery);
    
    // 4. 이벤트 효과 분석
    const eventEffectQuery = `
      SELECT 
        e.id as eventId,
        e.name as eventName,
        e.start_date as startDate,
        e.end_date as endDate,
        COUNT(DISTINCT pe.user_id) as participantCount,
        (SELECT COUNT(DISTINCT user_id) 
         FROM participant_events pe2 
         JOIN users u ON pe2.user_id = u.id
         WHERE pe2.event_id = e.id 
           AND u.is_dormant = 1) as dormantParticipants,
        COUNT(DISTINCT conversion.user_id) as conversionCount,
        ROUND(COUNT(DISTINCT conversion.user_id) / COUNT(DISTINCT pe.user_id) * 100, 2) as conversionRate,
        SUM(IFNULL(conversion.deposit_amount, 0)) as totalDepositAmount
      FROM events e
      JOIN participant_events pe ON e.id = pe.event_id
      LEFT JOIN (
        SELECT 
          pe.user_id,
          pe.event_id,
          SUM(t.amount) as deposit_amount
        FROM participant_events pe
        JOIN transactions t ON 
          pe.user_id = t.user_id 
          AND t.type = 'deposit'
          AND t.date > pe.participation_date
          AND t.date <= DATE_ADD(pe.participation_date, INTERVAL 30 DAY)
        WHERE DATE(pe.participation_date) BETWEEN '${lastMonthFirstDayStr}' AND '${lastMonthLastDayStr}'
        GROUP BY pe.user_id, pe.event_id
      ) as conversion ON pe.user_id = conversion.user_id AND pe.event_id = conversion.event_id
      WHERE e.end_date BETWEEN '${lastMonthFirstDayStr}' AND '${lastMonthLastDayStr}'
      GROUP BY e.id, e.name, e.start_date, e.end_date
      ORDER BY conversionRate DESC
    `;
    
    const eventEffects = await executeQuery(eventEffectQuery);
    
    // 5. 사용자 재활성화 분석
    const reactivationAnalysisQuery = `
      SELECT 
        dormancy_segment,
        COUNT(*) as userCount,
        SUM(deposit_amount) as totalDeposits,
        AVG(deposit_amount) as avgDeposit
      FROM (
        SELECT 
          a.user_id,
          CASE 
            WHEN dormancy_days <= 30 THEN '30일 이하'
            WHEN dormancy_days <= 60 THEN '31-60일'
            WHEN dormancy_days <= 90 THEN '61-90일'
            WHEN dormancy_days <= 180 THEN '91-180일'
            ELSE '180일 초과'
          END as dormancy_segment,
          IFNULL((
            SELECT SUM(t.amount) 
            FROM transactions t 
            WHERE t.user_id = a.user_id 
              AND t.type = 'deposit' 
              AND t.date BETWEEN '${lastMonthFirstDayStr}' AND '${lastMonthLastDayStr}'
          ), 0) as deposit_amount
        FROM (
          SELECT 
            user_id,
            MIN(activity_date) as reactivation_date,
            DATEDIFF(
              MIN(activity_date),
              (SELECT MAX(b.activity_date) 
              FROM user_activities b 
              WHERE b.user_id = a.user_id 
                AND b.activity_date < '${lastMonthFirstDayStr}')
            ) as dormancy_days
          FROM user_activities a
          WHERE DATE(activity_date) BETWEEN '${lastMonthFirstDayStr}' AND '${lastMonthLastDayStr}'
          GROUP BY user_id
          HAVING dormancy_days >= 30  -- 30일 이상 휴면 상태였다가 재활성화된 사용자
        ) a
      ) reactivated
      GROUP BY dormancy_segment
      ORDER BY MIN(dormancy_days)
    `;
    
    const reactivationAnalysis = await executeQuery(reactivationAnalysisQuery);
    
    // 6. 월간 성장율 계산 (전월 대비)
    const prevMonthActivityQuery = `
      SELECT 
        COUNT(DISTINCT user_id) as activeUsers,
        COUNT(*) as totalActivities,
        SUM(CASE WHEN activity_type = 'game' THEN 1 ELSE 0 END) as gamePlays,
        SUM(CASE WHEN activity_type = 'deposit' THEN 1 ELSE 0 END) as deposits
      FROM user_activities
      WHERE DATE(activity_date) BETWEEN '${twoMonthsAgoFirstDayStr}' AND '${twoMonthsAgoLastDayStr}'
    `;
    
    const prevMonthStats = await executeQuery(prevMonthActivityQuery);
    
    // 성장율 계산
    const growth = {
      activeUsers: calculateGrowth(
        activityStats[0]?.activeUsers || 0, 
        prevMonthStats[0]?.activeUsers || 0
      ),
      totalActivities: calculateGrowth(
        activityStats[0]?.totalActivities || 0, 
        prevMonthStats[0]?.totalActivities || 0
      ),
      gamePlays: calculateGrowth(
        activityStats[0]?.gamePlays || 0, 
        prevMonthStats[0]?.gamePlays || 0
      ),
      deposits: calculateGrowth(
        activityStats[0]?.deposits || 0, 
        prevMonthStats[0]?.deposits || 0
      )
    };
    
    // 7. 종합된 보고서 데이터 구성
    const reportData = {
      period: {
        start: lastMonthFirstDayStr,
        end: lastMonthLastDayStr,
        label: `${lastMonthYear}년 ${lastMonthName}`
      },
      generated: new Date().toISOString(),
      activityStats: activityStats[0] || {
        activeUsers: 0,
        totalActivities: 0,
        gamePlays: 0,
        deposits: 0,
        withdrawals: 0,
        logins: 0,
        newUsers: 0
      },
      revenueStats: revenueStats[0] || {
        totalDeposits: 0,
        totalWithdrawals: 0,
        uniqueDepositUsers: 0,
        totalNetBet: 0
      },
      highValueTrend: {
        firstDay: highValueTrend.find(item => item.point === 'firstDay') || {
          activeHighValueUsers: 0,
          dormantHighValueUsers: 0
        },
        lastDay: highValueTrend.find(item => item.point === 'lastDay') || {
          activeHighValueUsers: 0,
          dormantHighValueUsers: 0
        },
        growth: {
          activeHighValueUsers: calculateGrowth(
            highValueTrend.find(item => item.point === 'lastDay')?.activeHighValueUsers || 0,
            highValueTrend.find(item => item.point === 'firstDay')?.activeHighValueUsers || 0
          ),
          dormantHighValueUsers: calculateGrowth(
            highValueTrend.find(item => item.point === 'lastDay')?.dormantHighValueUsers || 0,
            highValueTrend.find(item => item.point === 'firstDay')?.dormantHighValueUsers || 0
          )
        }
      },
      eventEffects: eventEffects || [],
      reactivationAnalysis: reactivationAnalysis || [],
      growth
    };
    
    // 평균 고가치 사용자 전환율 계산 (유의미한 이벤트만)
    if (eventEffects && eventEffects.length > 0) {
      const significantEvents = eventEffects.filter(event => event.participantCount >= 10);
      
      if (significantEvents.length > 0) {
        const totalRate = significantEvents.reduce((sum, event) => sum + event.conversionRate, 0);
        reportData.avgEventConversionRate = parseFloat((totalRate / significantEvents.length).toFixed(2));
      }
    }
    
    // 8. 보고서 저장 (Firestore)
    const db = admin.firestore();
    await db.collection('reports').doc(`monthly-${lastMonthFirstDayStr}`).set({
      ...reportData,
      reportType: 'monthly',
      createdAt: admin.firestore.FieldValue.serverTimestamp()
    });
    
    // 9. 월간 스냅샷 저장
    await firestoreModel.saveAnalyticsSnapshot('monthlyStats', reportData, 'monthly');
    
    // 10. 관리자 이메일 조회 및 이메일 발송
    const adminUsersSnapshot = await db.collection('users')
      .where('roles', 'array-contains', 'admin')
      .where('notifications.monthlyReport', '==', true)
      .get();
    
    if (!adminUsersSnapshot.empty) {
      const adminEmails = [];
      
      adminUsersSnapshot.forEach(doc => {
        const userData = doc.data();
        if (userData.email) {
          adminEmails.push(userData.email);
        }
      });
      
      if (adminEmails.length > 0) {
        // 이메일 제목 및 내용 구성
        const subject = `📊 월간 분석 보고서 (${lastMonthYear}년 ${lastMonthName})`;
        
        const emailData = {
          period: reportData.period,
          stats: reportData,
          dashboardUrl: process.env.DASHBOARD_URL || 'https://dashboard.example.com'
        };
        
        // 이메일 전송
        await sendEmail(adminEmails, subject, 'monthly-analytics-report', emailData);
        logger.info(`Sent monthly report email to ${adminEmails.length} admins`);
      }
    }
    
    // 작업 완료 기록
    await jobRef.update({
      status: 'completed',
      endTime: admin.firestore.FieldValue.serverTimestamp(),
      resultSummary: {
        reportPeriod: `${lastMonthYear}년 ${lastMonthName}`,
        activeUsers: reportData.activityStats.activeUsers,
        newUsers: reportData.activityStats.newUsers,
        totalRevenue: reportData.revenueStats.totalDeposits,
        totalEvents: reportData.eventEffects.length
      }
    });
    
    logger.info('Monthly analytics report generated successfully');
    return { success: true, reportPeriod: `${lastMonthYear}년 ${lastMonthName}` };
  } catch (error) {
    logger.error('Monthly analytics report generation failed:', error);
    
    // 오류 기록
    try {
      const jobRef = admin.firestore().collection('analyticsJobs').doc();
      await jobRef.update({
        status: 'failed',
        endTime: admin.firestore.FieldValue.serverTimestamp(),
        errorMessage: error.message,
      });
    } catch (logError) {
      logger.error('Failed to update job status:', logError);
    }
    
    throw error;
  }
};

/**
 * 작업 실행 상태 모니터링 및 오류 처리
 * @return {Promise} 모니터링 결과
 */
const monitorJobExecutions = async () => {
  try {
    logger.info('Monitoring job executions');
    
    const db = admin.firestore();
    
    // 진행 중이지만 시간 초과된 작업 찾기 (1시간 초과)
    const oneHourAgo = new Date();
    oneHourAgo.setHours(oneHourAgo.getHours() - 1);
    
    const stuckJobsSnapshot = await db.collection('analyticsJobs')
      .where('status', '==', 'running')
      .where('startTime', '<', oneHourAgo)
      .get();
    
    const stuckJobs = [];
    
    if (!stuckJobsSnapshot.empty) {
      stuckJobsSnapshot.forEach(doc => {
        const jobData = doc.data();
        stuckJobs.push({
          id: doc.id,
          jobType: jobData.jobType,
          startTime: jobData.startTime.toDate(),
          parameters: jobData.parameters || {}
        });
        
        // 작업 상태 업데이트 (실패로 표시)
        db.collection('analyticsJobs').doc(doc.id).update({
          status: 'failed',
          endTime: admin.firestore.FieldValue.serverTimestamp(),
          errorMessage: '작업 시간 초과 (1시간)',
          monitoringAction: 'marked_as_failed_due_to_timeout'
        });
      });
    }
    
    // 최근 실패한 작업 찾기 (24시간 이내)
    const oneDayAgo = new Date();
    oneDayAgo.setDate(oneDayAgo.getDate() - 1);
    
    const failedJobsSnapshot = await db.collection('analyticsJobs')
      .where('status', '==', 'failed')
      .where('endTime', '>', oneDayAgo)
      .get();
    
    const failedJobs = [];
    
    if (!failedJobsSnapshot.empty) {
      failedJobsSnapshot.forEach(doc => {
        const jobData = doc.data();
        failedJobs.push({
          id: doc.id,
          jobType: jobData.jobType,
          startTime: jobData.startTime?.toDate(),
          endTime: jobData.endTime?.toDate(),
          errorMessage: jobData.errorMessage || '알 수 없는 오류'
        });
      });
    }
    
    // 모니터링 결과 저장
    await db.collection('jobMonitoring').doc(new Date().toISOString().split('T')[0]).set({
      timestamp: admin.firestore.FieldValue.serverTimestamp(),
      stuckJobs,
      failedJobs,
      stuckJobCount: stuckJobs.length,
      failedJobCount: failedJobs.length
    });
    
    // 심각한 문제가 있는 경우 알림 발송 (시간 초과 작업 또는 다수의 실패한 작업)
    if (stuckJobs.length > 0 || failedJobs.length >= 3) {
      // 관리자 이메일 조회
      const adminUsersSnapshot = await db.collection('users')
        .where('roles', 'array-contains', 'admin')
        .where('notifications.jobAlerts', '==', true)
        .get();
      
      const adminEmails = [];
      
      adminUsersSnapshot.forEach(doc => {
        const userData = doc.data();
        if (userData.email) {
          adminEmails.push(userData.email);
        }
      });
      
      if (adminEmails.length > 0) {
        // 이메일 제목 및 내용 구성
        const subject = `⚠️ 분석 작업 오류 알림 (${stuckJobs.length} 시간 초과, ${failedJobs.length} 실패)`;
        
        const emailData = {
          date: new Date().toISOString().split('T')[0],
          stuckJobs,
          failedJobs,
          dashboardUrl: process.env.DASHBOARD_URL || 'https://dashboard.example.com'
        };
        
        // 이메일 전송
        await sendEmail(adminEmails, subject, 'job-alert', emailData);
        logger.info(`Sent job alert email to ${adminEmails.length} admins`);
      }
    }
    
    logger.info('Job monitoring completed successfully');
    return {
      success: true,
      stuckJobCount: stuckJobs.length,
      failedJobCount: failedJobs.length
    };
  } catch (error) {
    logger.error('Job monitoring failed:', error);
    throw error;
  }
};

module.exports = {
  generateDailyReport,
  generateWeeklyReport,
  generateMonthlyReport,
  monitorJobExecutions
};
