/**
 * 분석 작업 스케줄러
 * 정기적인 분석 작업 실행 및 결과 저장
 */

const functions = require('firebase-functions');
const admin = require('firebase-admin');
const { executeQuery } = require('../../db');
const firestoreModel = require('../models/firestore');

/**
 * 고가치 사용자 분석 작업
 * @param {Object} context Cloud Functions 실행 컨텍스트
 * @return {Promise} 작업 실행 결과
 */
const runHighValueUserAnalysis = async (context) => {
  try {
    console.log('Starting high value user analysis job:', new Date().toISOString());
    
    // 작업 시작 기록
    const jobRef = admin.firestore().collection('analyticsJobs').doc();
    await jobRef.set({
      jobType: 'highValueUserAnalysis',
      status: 'running',
      startTime: admin.firestore.FieldValue.serverTimestamp(),
      parameters: {
        minNetBet: 50000,
        minPlayDays: 7,
      },
      createdAt: admin.firestore.FieldValue.serverTimestamp(),
    });
    
    // 활성 고가치 사용자 조회
    const activeUsersQuery = `
      SELECT 
        u.id as userId,
        u.username as userName,
        COUNT(DISTINCT g.date) as playDays,
        SUM(g.net_bet) as netBet,
        MAX(g.date) as lastActivity,
        DATEDIFF(CURRENT_DATE, MAX(g.date)) as inactiveDays
      FROM users u
      JOIN game_logs g ON u.id = g.user_id
      GROUP BY u.id, u.username
      HAVING 
        playDays >= 7 
        AND netBet >= 50000
        AND inactiveDays <= 30
      ORDER BY netBet DESC
    `;
    
    const activeUsers = await executeQuery(activeUsersQuery);
    console.log(`Found ${activeUsers.length} active high value users`);
    
    // Firestore에 활성 사용자 저장
    await firestoreModel.saveHighValueUsers(activeUsers, {
      type: 'active',
      criteria: {
        minNetBet: 50000,
        minPlayDays: 7,
        maxInactiveDays: 30,
      },
    });
    
    // 휴면 고가치 사용자 조회
    const dormantUsersQuery = `
      SELECT 
        u.id as userId,
        u.username as userName,
        COUNT(DISTINCT g.date) as playDays,
        SUM(g.net_bet) as netBet,
        MAX(g.date) as lastActivity,
        DATEDIFF(CURRENT_DATE, MAX(g.date)) as inactiveDays
      FROM users u
      JOIN game_logs g ON u.id = g.user_id
      GROUP BY u.id, u.username
      HAVING 
        playDays >= 7 
        AND netBet >= 50000
        AND inactiveDays > 30
      ORDER BY inactiveDays ASC
    `;
    
    const dormantUsers = await executeQuery(dormantUsersQuery);
    console.log(`Found ${dormantUsers.length} dormant high value users`);
    
    // Firestore에 휴면 사용자 저장
    await firestoreModel.saveHighValueUsers(dormantUsers, {
      type: 'dormant',
      criteria: {
        minNetBet: 50000,
        minPlayDays: 7,
        minInactiveDays: 30,
      },
    });
    
    // 세그먼트 분석
    const segmentationQuery = `
      SELECT 
        CASE 
          WHEN inactiveDays <= 30 THEN 'active'
          WHEN inactiveDays <= 60 THEN 'inactive_30_60'
          WHEN inactiveDays <= 90 THEN 'inactive_60_90'
          WHEN inactiveDays <= 180 THEN 'inactive_90_180'
          WHEN inactiveDays <= 365 THEN 'inactive_180_365'
          ELSE 'inactive_365_plus'
        END as segment,
        COUNT(*) as userCount,
        AVG(playDays) as avgPlayDays,
        AVG(netBet) as avgNetBet
      FROM (
        SELECT 
          u.id,
          COUNT(DISTINCT g.date) as playDays,
          SUM(g.net_bet) as netBet,
          DATEDIFF(CURRENT_DATE, MAX(g.date)) as inactiveDays
        FROM users u
        JOIN game_logs g ON u.id = g.user_id
        GROUP BY u.id
        HAVING playDays >= 7 AND netBet >= 50000
      ) as high_value_users
      GROUP BY segment
      ORDER BY FIELD(segment, 'active', 'inactive_30_60', 'inactive_60_90', 'inactive_90_180', 'inactive_180_365', 'inactive_365_plus')
    `;
    
    const segmentResults = await executeQuery(segmentationQuery);
    console.log(`Generated ${segmentResults.length} user segments`);
    
    // Firestore에 세그먼트 분석 결과 저장
    const segmentData = {
      segments: segmentResults,
      totalUserCount: activeUsers.length + dormantUsers.length,
      criteria: {
        minNetBet: 50000,
        minPlayDays: 7,
      },
    };
    
    await firestoreModel.saveUserSegments(segmentData);
    
    // 일일 스냅샷 저장
    await firestoreModel.saveAnalyticsSnapshot('highValueUsers', {
      activeUsers: activeUsers.length,
      dormantUsers: dormantUsers.length,
      totalUsers: activeUsers.length + dormantUsers.length,
      segments: segmentResults,
    }, 'daily');
    
    // 작업 완료 기록
    await jobRef.update({
      status: 'completed',
      endTime: admin.firestore.FieldValue.serverTimestamp(),
      resultSummary: {
        activeUserCount: activeUsers.length,
        dormantUserCount: dormantUsers.length,
        segmentCount: segmentResults.length,
      },
    });
    
    console.log('High value user analysis job completed successfully');
    return { success: true };
  } catch (error) {
    console.error('High value user analysis job failed:', error);
    
    // 오류 기록
    try {
      const jobRef = admin.firestore().collection('analyticsJobs').doc();
      await jobRef.update({
        status: 'failed',
        endTime: admin.firestore.FieldValue.serverTimestamp(),
        errorMessage: error.message,
      });
    } catch (logError) {
      console.error('Failed to update job status:', logError);
    }
    
    throw error;
  }
};

/**
 * 이벤트 효과 분석 작업
 * @param {Object} context Cloud Functions 실행 컨텍스트
 * @return {Promise} 작업 실행 결과
 */
const runEventEffectAnalysis = async (context) => {
  try {
    console.log('Starting event effect analysis job:', new Date().toISOString());
    
    // 작업 시작 기록
    const jobRef = admin.firestore().collection('analyticsJobs').doc();
    await jobRef.set({
      jobType: 'eventEffectAnalysis',
      status: 'running',
      startTime: admin.firestore.FieldValue.serverTimestamp(),
      parameters: {
        minParticipants: 10,
        lookbackDays: 90,
      },
      createdAt: admin.firestore.FieldValue.serverTimestamp(),
    });
    
    // 최근 90일 이내 완료된 이벤트 분석
    const completedEventsQuery = `
      SELECT 
        e.id as eventId,
        e.name as eventName,
        e.start_date as startDate,
        e.end_date as endDate,
        e.reward_type as rewardType,
        e.reward_amount as rewardAmount,
        COUNT(DISTINCT pe.user_id) as participantCount,
        SUM(CASE WHEN dormant_flag.is_dormant = 1 THEN 1 ELSE 0 END) as dormantUserCount,
        SUM(CASE WHEN dormant_flag.is_dormant = 0 THEN 1 ELSE 0 END) as activeUserCount,
        COUNT(DISTINCT conversion.user_id) as conversionCount,
        ROUND(COUNT(DISTINCT conversion.user_id) / COUNT(DISTINCT pe.user_id) * 100, 2) as conversionRate,
        ROUND(SUM(IFNULL(conversion.deposit_amount, 0)), 2) as totalDepositAmount,
        ROUND(SUM(IFNULL(conversion.deposit_amount, 0)) / NULLIF(COUNT(DISTINCT conversion.user_id), 0), 2) as avgDepositAmount
      FROM events e
      JOIN participant_events pe ON e.id = pe.event_id
      LEFT JOIN (
        SELECT 
          user_segments.user_id,
          user_segments.event_id,
          CASE WHEN user_segments.inactiveDays >= 30 THEN 1 ELSE 0 END as is_dormant
        FROM (
          SELECT 
            pe.user_id,
            pe.event_id,
            DATEDIFF(pe.participation_date, IFNULL(MAX(g.date), '1970-01-01')) as inactiveDays
          FROM participant_events pe
          LEFT JOIN game_logs g ON pe.user_id = g.user_id AND g.date < pe.participation_date
          GROUP BY pe.user_id, pe.event_id, pe.participation_date
        ) as user_segments
      ) as dormant_flag ON pe.user_id = dormant_flag.user_id AND pe.event_id = dormant_flag.event_id
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
          AND DATEDIFF(t.date, pe.participation_date) <= 30
        GROUP BY pe.user_id, pe.event_id
      ) as conversion ON pe.user_id = conversion.user_id AND pe.event_id = conversion.event_id
      WHERE e.end_date BETWEEN DATE_SUB(CURRENT_DATE, INTERVAL 90 DAY) AND CURRENT_DATE
      GROUP BY e.id, e.name, e.start_date, e.end_date, e.reward_type, e.reward_amount
      HAVING participantCount >= 10
      ORDER BY startDate DESC
    `;
    
    const eventsAnalysis = await executeQuery(completedEventsQuery);
    console.log(`Analyzed ${eventsAnalysis.length} recent events`);
    
    // Firestore에 이벤트 분석 결과 저장
    await firestoreModel.saveEventAnalytics(eventsAnalysis, {
      timespan: '90days',
      criteria: {
        minParticipants: 10,
      },
    });
    
    // 휴면 기간별 전환율 분석
    const dormancyAnalysisQuery = `
      SELECT 
        dormancy_period.period,
        COUNT(DISTINCT pe.user_id) as userCount,
        COUNT(DISTINCT t.user_id) as convertedCount,
        ROUND(COUNT(DISTINCT t.user_id) / COUNT(DISTINCT pe.user_id) * 100, 2) as conversionRate
      FROM participant_events pe
      JOIN (
        SELECT 
          user_segments.user_id,
          user_segments.event_id,
          CASE 
            WHEN user_segments.inactiveDays < 0 THEN 'new_user'
            WHEN user_segments.inactiveDays = 0 THEN '0_days'
            WHEN user_segments.inactiveDays <= 7 THEN '1-7_days'
            WHEN user_segments.inactiveDays <= 30 THEN '8-30_days'
            WHEN user_segments.inactiveDays <= 90 THEN '31-90_days'
            WHEN user_segments.inactiveDays <= 180 THEN '91-180_days'
            WHEN user_segments.inactiveDays <= 365 THEN '181-365_days'
            ELSE 'over_365_days'
          END as period
        FROM (
          SELECT 
            pe.user_id,
            pe.event_id,
            DATEDIFF(pe.participation_date, IFNULL(MAX(g.date), '1970-01-01')) as inactiveDays
          FROM participant_events pe
          JOIN events e ON pe.event_id = e.id
          LEFT JOIN game_logs g ON pe.user_id = g.user_id AND g.date < pe.participation_date
          WHERE e.end_date BETWEEN DATE_SUB(CURRENT_DATE, INTERVAL 90 DAY) AND CURRENT_DATE
          GROUP BY pe.user_id, pe.event_id, pe.participation_date
        ) as user_segments
      ) as dormancy_period ON pe.user_id = dormancy_period.user_id AND pe.event_id = dormancy_period.event_id
      JOIN events e ON pe.event_id = e.id
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
      WHERE e.end_date BETWEEN DATE_SUB(CURRENT_DATE, INTERVAL 90 DAY) AND CURRENT_DATE
      GROUP BY dormancy_period.period
      ORDER BY FIELD(
        dormancy_period.period, 
        'new_user', '0_days', '1-7_days', '8-30_days', 
        '31-90_days', '91-180_days', '181-365_days', 'over_365_days'
      )
    `;
    
    const dormancyAnalysis = await executeQuery(dormancyAnalysisQuery);
    console.log(`Generated dormancy period analysis with ${dormancyAnalysis.length} segments`);
    
    // 전환율 메트릭 계산 및 저장
    const conversionMetrics = {
      dormancyAnalysis,
      events: eventsAnalysis.map(event => ({
        eventId: event.eventId,
        eventName: event.eventName,
        conversionRate: event.conversionRate,
        participantCount: event.participantCount,
        dormantUserCount: event.dormantUserCount,
        conversionCount: event.conversionCount,
      })),
      summary: {
        totalEvents: eventsAnalysis.length,
        totalParticipants: eventsAnalysis.reduce((sum, e) => sum + e.participantCount, 0),
        totalConversions: eventsAnalysis.reduce((sum, e) => sum + e.conversionCount, 0),
        averageConversionRate: eventsAnalysis.length > 0
          ? eventsAnalysis.reduce((sum, e) => sum + parseFloat(e.conversionRate), 0) / eventsAnalysis.length
          : 0,
        bestEvent: eventsAnalysis.length > 0
          ? eventsAnalysis.reduce((best, e) => 
              parseFloat(e.conversionRate) > parseFloat(best.conversionRate) ? e : best, 
              eventsAnalysis[0])
          : null,
      },
    };
    
    await firestoreModel.saveConversionMetrics(conversionMetrics);
    
    // 일일 스냅샷 저장
    await firestoreModel.saveAnalyticsSnapshot('eventEffects', {
      recentEvents: eventsAnalysis.length,
      averageConversionRate: conversionMetrics.summary.averageConversionRate,
      dormancyAnalysis,
    }, 'daily');
    
    // 작업 완료 기록
    await jobRef.update({
      status: 'completed',
      endTime: admin.firestore.FieldValue.serverTimestamp(),
      resultSummary: {
        eventsAnalyzed: eventsAnalysis.length,
        avgConversionRate: conversionMetrics.summary.averageConversionRate,
      },
    });
    
    console.log('Event effect analysis job completed successfully');
    return { success: true };
  } catch (error) {
    console.error('Event effect analysis job failed:', error);
    
    // 오류 기록
    try {
      const jobRef = admin.firestore().collection('analyticsJobs').doc();
      await jobRef.update({
        status: 'failed',
        endTime: admin.firestore.FieldValue.serverTimestamp(),
        errorMessage: error.message,
      });
    } catch (logError) {
      console.error('Failed to update job status:', logError);
    }
    
    throw error;
  }
};

module.exports = {
  runHighValueUserAnalysis,
  runEventEffectAnalysis,
};
