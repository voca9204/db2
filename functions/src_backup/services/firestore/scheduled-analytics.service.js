/**
 * Scheduled Analytics Service
 * 
 * 정기적인 분석 작업을 스케줄링하고 실행하는 서비스
 * - 일일/주간/월간 분석 작업 스케줄링
 * - 분석 결과 저장 및 알림
 * - 기록 관리
 */

const admin = require('firebase-admin');
const { getContextLogger } = require('../../utils/logger');
const analyticsStorageService = require('./analytics-storage.service');
const { executeQuery } = require('../../../db');
const { getDormantHighValueUsers, getActiveHighValueUsers, analyzeUserSegments } = require('../../services/high-value-user.service');
const { analyzeEventConversion } = require('../../services/event-analysis.service');

// 로거 초기화
const logger = getContextLogger('scheduled-analytics');

/**
 * 스케줄링된 분석 서비스 클래스
 */
class ScheduledAnalyticsService {
  /**
   * 생성자
   */
  constructor() {
    this.db = admin.firestore();
  }

  /**
   * 일일 분석 수행 (Firebase Functions Scheduler에서 호출)
   * @return {Promise<Object>} 분석 결과
   */
  async runDailyAnalysis() {
    try {
      logger.info('Starting daily analytics task');
      
      // 작업 시작 기록
      const taskRef = await this.createAnalyticsTask('daily');
      
      // 1. 고가치 사용자 분석
      const highValueUserResult = await this.analyzeHighValueUsers();
      
      // 2. 이벤트 효과 분석
      const eventAnalysisResult = await this.analyzeEventEffects();
      
      // 3. 사용자 세그먼트 분석
      const userSegmentsResult = await this.analyzeUserSegments();
      
      // 4. 전환율 메트릭 분석
      const conversionMetricsResult = await this.analyzeConversionMetrics();
      
      // 작업 완료 기록
      await this.completeAnalyticsTask(taskRef, {
        highValueUserResult,
        eventAnalysisResult,
        userSegmentsResult,
        conversionMetricsResult
      });
      
      logger.info('Daily analytics task completed successfully');
      
      return {
        success: true,
        taskId: taskRef.id,
        timestamp: new Date().toISOString(),
        results: {
          highValueUserResult,
          eventAnalysisResult,
          userSegmentsResult,
          conversionMetricsResult
        }
      };
    } catch (error) {
      logger.error('Failed to run daily analytics task:', error);
      
      // 작업 실패 기록
      if (taskRef) {
        await this.failAnalyticsTask(taskRef, error);
      }
      
      throw error;
    }
  }

  /**
   * 주간 분석 수행 (Firebase Functions Scheduler에서 호출)
   * @return {Promise<Object>} 분석 결과
   */
  async runWeeklyAnalysis() {
    try {
      logger.info('Starting weekly analytics task');
      
      // 작업 시작 기록
      const taskRef = await this.createAnalyticsTask('weekly');
      
      // 주간 분석 로직 구현
      const weeklyActiveUsers = await this.getWeeklyActiveUsers();
      const weeklyDormantUsers = await this.getWeeklyDormantUsers();
      const weeklySegmentChanges = await this.getWeeklySegmentChanges();
      const weeklyConversionTrends = await this.getWeeklyConversionTrends();
      
      // 결과 저장
      await analyticsStorageService.createDailySnapshot('highValueUsers', {
        activeUsers: weeklyActiveUsers,
        dormantUsers: weeklyDormantUsers,
        segmentChanges: weeklySegmentChanges,
        conversionTrends: weeklyConversionTrends
      }, 'weekly');
      
      // 작업 완료 기록
      await this.completeAnalyticsTask(taskRef, {
        weeklyActiveUsers,
        weeklyDormantUsers,
        weeklySegmentChanges,
        weeklyConversionTrends
      });
      
      logger.info('Weekly analytics task completed successfully');
      
      return {
        success: true,
        taskId: taskRef.id,
        timestamp: new Date().toISOString(),
        results: {
          weeklyActiveUsers,
          weeklyDormantUsers,
          weeklySegmentChanges,
          weeklyConversionTrends
        }
      };
    } catch (error) {
      logger.error('Failed to run weekly analytics task:', error);
      
      // 작업 실패 기록
      if (taskRef) {
        await this.failAnalyticsTask(taskRef, error);
      }
      
      throw error;
    }
  }

  /**
   * 월간 분석 수행 (Firebase Functions Scheduler에서 호출)
   * @return {Promise<Object>} 분석 결과
   */
  async runMonthlyAnalysis() {
    try {
      logger.info('Starting monthly analytics task');
      
      // 작업 시작 기록
      const taskRef = await this.createAnalyticsTask('monthly');
      
      // 월간 분석 로직 구현
      const monthlyAnalytics = await this.getMonthlyAnalytics();
      
      // 결과 저장
      await analyticsStorageService.createDailySnapshot('analytics', {
        ...monthlyAnalytics
      }, 'monthly');
      
      // 작업 완료 기록
      await this.completeAnalyticsTask(taskRef, monthlyAnalytics);
      
      logger.info('Monthly analytics task completed successfully');
      
      return {
        success: true,
        taskId: taskRef.id,
        timestamp: new Date().toISOString(),
        results: monthlyAnalytics
      };
    } catch (error) {
      logger.error('Failed to run monthly analytics task:', error);
      
      // 작업 실패 기록
      if (taskRef) {
        await this.failAnalyticsTask(taskRef, error);
      }
      
      throw error;
    }
  }

  /**
   * 고가치 사용자 분석 수행
   * @return {Promise<Object>} 분석 결과
   * @private
   */
  async analyzeHighValueUsers() {
    // 1. 활성 고가치 사용자 조회
    const activeUsersResult = await getActiveHighValueUsers({
      minNetBet: 50000,
      minPlayDays: 7,
      maxInactiveDays: 30,
      page: 1,
      limit: 1000 // 전체 데이터 조회
    });
    
    // 2. 휴면 고가치 사용자 조회
    const dormantUsersResult = await getDormantHighValueUsers({
      minNetBet: 50000,
      minPlayDays: 7,
      minInactiveDays: 30,
      page: 1,
      limit: 1000 // 전체 데이터 조회
    });
    
    // 3. Firestore에 고가치 사용자 데이터 저장
    await analyticsStorageService.saveHighValueUsers([
      ...activeUsersResult.users,
      ...dormantUsersResult.users
    ], {
      activeCount: activeUsersResult.total,
      dormantCount: dormantUsersResult.total,
      totalCount: activeUsersResult.total + dormantUsersResult.total,
      analysisCriteria: {
        minNetBet: 50000,
        minPlayDays: 7,
        inactiveDaysThreshold: 30
      }
    });
    
    return {
      activeUsers: {
        count: activeUsersResult.total,
        samples: activeUsersResult.users.slice(0, 10) // 샘플 데이터 (처음 10개만)
      },
      dormantUsers: {
        count: dormantUsersResult.total,
        samples: dormantUsersResult.users.slice(0, 10) // 샘플 데이터 (처음 10개만)
      },
      totalUsers: activeUsersResult.total + dormantUsersResult.total
    };
  }

  /**
   * 이벤트 효과 분석 수행
   * @return {Promise<Object>} 분석 결과
   * @private
   */
  async analyzeEventEffects() {
    // 이벤트 효과 분석 수행
    const eventAnalysisResult = await analyzeEventConversion({
      startDate: this.getDateBefore(30), // 최근 30일 데이터
      minParticipants: 5 // 최소 5명 이상 참여한 이벤트만 분석
    });
    
    // Firestore에 이벤트 분석 데이터 저장
    const { eventConversions } = eventAnalysisResult;
    
    if (eventConversions && eventConversions.length > 0) {
      await analyticsStorageService.saveEventAnalytics(eventConversions, {
        analysisDate: new Date().toISOString(),
        period: 'last_30_days',
        totalEvents: eventConversions.length
      });
    }
    
    // 전환율 메트릭 저장
    if (eventAnalysisResult.dormancyAnalysis) {
      await analyticsStorageService.saveConversionMetrics({
        dormancyAnalysis: eventAnalysisResult.dormancyAnalysis,
        totalEvents: eventConversions.length,
        period: 'last_30_days',
        timestamp: new Date().toISOString()
      });
    }
    
    return eventAnalysisResult;
  }

  /**
   * 사용자 세그먼트 분석 수행
   * @return {Promise<Object>} 분석 결과
   * @private
   */
  async analyzeUserSegments() {
    // 사용자 세그먼트 분석 수행
    const segmentAnalysisResult = await analyzeUserSegments({
      minNetBet: 50000,
      minPlayDays: 7
    });
    
    // Firestore에 세그먼트 분석 데이터 저장
    await analyticsStorageService.saveUserSegments(segmentAnalysisResult);
    
    return segmentAnalysisResult;
  }

  /**
   * 전환율 메트릭 분석 수행
   * @return {Promise<Object>} 분석 결과
   * @private
   */
  async analyzeConversionMetrics() {
    // 커스텀 전환율 분석 쿼리 실행
    const conversionQuery = `
      SELECT 
        CASE 
          WHEN u.inactive_days <= 7 THEN 'active_week'
          WHEN u.inactive_days <= 30 THEN 'active_month'
          WHEN u.inactive_days <= 90 THEN 'inactive_3_months'
          WHEN u.inactive_days <= 180 THEN 'inactive_6_months'
          WHEN u.inactive_days <= 365 THEN 'inactive_year'
          ELSE 'inactive_over_year'
        END as segment,
        COUNT(DISTINCT u.id) as user_count,
        COUNT(DISTINCT CASE WHEN e.id IS NOT NULL THEN u.id END) as event_participants,
        COUNT(DISTINCT CASE WHEN t.id IS NOT NULL THEN u.id END) as converted_users,
        ROUND(COUNT(DISTINCT CASE WHEN t.id IS NOT NULL THEN u.id END) / 
              NULLIF(COUNT(DISTINCT CASE WHEN e.id IS NOT NULL THEN u.id END), 0) * 100, 2) as conversion_rate
      FROM (
        SELECT 
          id,
          DATEDIFF(CURRENT_DATE, last_activity_date) as inactive_days
        FROM users
        WHERE lifetime_bet >= 50000
      ) u
      LEFT JOIN event_participations e ON u.id = e.user_id AND e.date >= DATE_SUB(CURRENT_DATE, INTERVAL 30 DAY)
      LEFT JOIN transactions t ON u.id = t.user_id 
                              AND t.type = 'deposit' 
                              AND t.date > e.date 
                              AND t.date <= DATE_ADD(e.date, INTERVAL 7 DAY)
      GROUP BY segment
      ORDER BY FIELD(
        segment, 
        'active_week', 'active_month', 'inactive_3_months', 
        'inactive_6_months', 'inactive_year', 'inactive_over_year'
      )
    `;
    
    try {
      const conversionResults = await executeQuery(conversionQuery, []);
      
      // Firestore에 전환율 메트릭 저장
      await analyticsStorageService.saveConversionMetrics({
        segmentMetrics: conversionResults,
        analysisDate: new Date().toISOString(),
        period: 'daily'
      });
      
      return {
        segmentMetrics: conversionResults,
        summary: {
          totalSegments: conversionResults.length,
          totalUsers: conversionResults.reduce((sum, item) => sum + item.user_count, 0),
          totalParticipants: conversionResults.reduce((sum, item) => sum + item.event_participants, 0),
          totalConverted: conversionResults.reduce((sum, item) => sum + item.converted_users, 0),
          overallConversionRate: conversionResults.reduce((sum, item) => sum + item.converted_users, 0) / 
                                 conversionResults.reduce((sum, item) => sum + item.event_participants, 0) * 100
        }
      };
    } catch (error) {
      logger.error('Failed to analyze conversion metrics:', error);
      throw error;
    }
  }

  /**
   * 주간 활성 사용자 조회
   * @return {Promise<Object>} 활성 사용자 데이터
   * @private
   */
  async getWeeklyActiveUsers() {
    // 최근 7일간 활성 사용자 분석
    const activeUsersQuery = `
      SELECT 
        DATE(g.date) as activity_date,
        COUNT(DISTINCT g.user_id) as active_users,
        SUM(g.net_bet) as total_bet
      FROM game_logs g
      WHERE g.date >= DATE_SUB(CURRENT_DATE, INTERVAL 7 DAY)
      GROUP BY DATE(g.date)
      ORDER BY activity_date
    `;
    
    try {
      const results = await executeQuery(activeUsersQuery, []);
      
      return {
        dailyActiveUsers: results,
        summary: {
          uniqueUsers: await this.countUniqueWeeklyUsers(),
          averageDailyUsers: Math.round(results.reduce((sum, day) => sum + day.active_users, 0) / results.length),
          totalBet: results.reduce((sum, day) => sum + day.total_bet, 0)
        }
      };
    } catch (error) {
      logger.error('Failed to get weekly active users:', error);
      throw error;
    }
  }

  /**
   * 주간 휴면 사용자 조회
   * @return {Promise<Object>} 휴면 사용자 데이터
   * @private
   */
  async getWeeklyDormantUsers() {
    // 지난 7일간 휴면->활성 전환 사용자 분석
    const dormantToActiveQuery = `
      SELECT 
        DATE(current_activity.date) as reactivation_date,
        COUNT(DISTINCT current_activity.user_id) as reactivated_users,
        AVG(DATEDIFF(current_activity.date, last_activity.last_date)) as avg_dormant_days
      FROM (
        SELECT 
          g.user_id,
          MIN(g.date) as date
        FROM game_logs g
        WHERE g.date >= DATE_SUB(CURRENT_DATE, INTERVAL 7 DAY)
        GROUP BY g.user_id
      ) current_activity
      JOIN (
        SELECT 
          g.user_id,
          MAX(g.date) as last_date
        FROM game_logs g
        WHERE g.date < DATE_SUB(CURRENT_DATE, INTERVAL 7 DAY)
        GROUP BY g.user_id
      ) last_activity ON current_activity.user_id = last_activity.user_id
      WHERE DATEDIFF(current_activity.date, last_activity.last_date) >= 30
      GROUP BY reactivation_date
      ORDER BY reactivation_date
    `;
    
    try {
      const results = await executeQuery(dormantToActiveQuery, []);
      
      return {
        reactivatedUsers: results,
        summary: {
          totalReactivated: results.reduce((sum, day) => sum + day.reactivated_users, 0),
          avgDormantDays: results.length > 0 
            ? Math.round(results.reduce((sum, day) => sum + day.avg_dormant_days, 0) / results.length) 
            : 0
        }
      };
    } catch (error) {
      logger.error('Failed to get weekly dormant users:', error);
      throw error;
    }
  }

  /**
   * 주간 세그먼트 변화 조회
   * @return {Promise<Object>} 세그먼트 변화 데이터
   * @private
   */
  async getWeeklySegmentChanges() {
    // 사용자 세그먼트 주간 변화 분석
    const segmentChangesQuery = `
      SELECT 
        segment_before,
        segment_after,
        COUNT(DISTINCT user_id) as user_count
      FROM (
        SELECT 
          u.id as user_id,
          CASE 
            WHEN old_activity.inactive_days <= 7 THEN 'active_week'
            WHEN old_activity.inactive_days <= 30 THEN 'active_month'
            WHEN old_activity.inactive_days <= 90 THEN 'inactive_3_months'
            WHEN old_activity.inactive_days <= 180 THEN 'inactive_6_months'
            WHEN old_activity.inactive_days <= 365 THEN 'inactive_year'
            ELSE 'inactive_over_year'
          END as segment_before,
          CASE 
            WHEN new_activity.inactive_days <= 7 THEN 'active_week'
            WHEN new_activity.inactive_days <= 30 THEN 'active_month'
            WHEN new_activity.inactive_days <= 90 THEN 'inactive_3_months'
            WHEN new_activity.inactive_days <= 180 THEN 'inactive_6_months'
            WHEN new_activity.inactive_days <= 365 THEN 'inactive_year'
            ELSE 'inactive_over_year'
          END as segment_after
        FROM users u
        JOIN (
          SELECT 
            user_id,
            DATEDIFF(DATE_SUB(CURRENT_DATE, INTERVAL 7 DAY), MAX(date)) as inactive_days
          FROM game_logs
          WHERE date < DATE_SUB(CURRENT_DATE, INTERVAL 7 DAY)
          GROUP BY user_id
        ) old_activity ON u.id = old_activity.user_id
        JOIN (
          SELECT 
            user_id,
            DATEDIFF(CURRENT_DATE, MAX(date)) as inactive_days
          FROM game_logs
          GROUP BY user_id
        ) new_activity ON u.id = new_activity.user_id
        WHERE u.lifetime_bet >= 50000
      ) segment_changes
      WHERE segment_before != segment_after
      GROUP BY segment_before, segment_after
      ORDER BY 
        FIELD(segment_before, 'active_week', 'active_month', 'inactive_3_months', 'inactive_6_months', 'inactive_year', 'inactive_over_year'),
        FIELD(segment_after, 'active_week', 'active_month', 'inactive_3_months', 'inactive_6_months', 'inactive_year', 'inactive_over_year')
    `;
    
    try {
      const results = await executeQuery(segmentChangesQuery, []);
      
      // 분석 결과 가공
      const segmentOrder = [
        'active_week', 
        'active_month', 
        'inactive_3_months', 
        'inactive_6_months', 
        'inactive_year', 
        'inactive_over_year'
      ];
      
      // 세그먼트 이동 매트릭스 생성
      const segmentMatrix = segmentOrder.map(before => {
        const row = {};
        row.segment = before;
        
        segmentOrder.forEach(after => {
          row[after] = 0;
        });
        
        return row;
      });
      
      // 데이터 채우기
      results.forEach(change => {
        const beforeIdx = segmentOrder.indexOf(change.segment_before);
        if (beforeIdx !== -1) {
          segmentMatrix[beforeIdx][change.segment_after] = change.user_count;
        }
      });
      
      return {
        changes: results,
        matrix: segmentMatrix,
        summary: {
          totalChanges: results.reduce((sum, change) => sum + change.user_count, 0),
          improvedSegments: results
            .filter(change => {
              const beforeIdx = segmentOrder.indexOf(change.segment_before);
              const afterIdx = segmentOrder.indexOf(change.segment_after);
              return beforeIdx > afterIdx; // 더 나은 세그먼트로 이동 (인덱스가 작을수록 활성)
            })
            .reduce((sum, change) => sum + change.user_count, 0),
          worsenedSegments: results
            .filter(change => {
              const beforeIdx = segmentOrder.indexOf(change.segment_before);
              const afterIdx = segmentOrder.indexOf(change.segment_after);
              return beforeIdx < afterIdx; // 더 나쁜 세그먼트로 이동 (인덱스가 클수록 비활성)
            })
            .reduce((sum, change) => sum + change.user_count, 0)
        }
      };
    } catch (error) {
      logger.error('Failed to get weekly segment changes:', error);
      throw error;
    }
  }

  /**
   * 주간 전환율 트렌드 조회
   * @return {Promise<Object>} 전환율 트렌드 데이터
   * @private
   */
  async getWeeklyConversionTrends() {
    // 최근 7일간 이벤트 참여 후 입금 전환율 추이
    const conversionTrendsQuery = `
      SELECT 
        DATE(e.participation_date) as event_date,
        COUNT(DISTINCT e.user_id) as participants,
        COUNT(DISTINCT CASE WHEN t.id IS NOT NULL THEN e.user_id END) as converted,
        ROUND(
          COUNT(DISTINCT CASE WHEN t.id IS NOT NULL THEN e.user_id END) / 
          COUNT(DISTINCT e.user_id) * 100, 2
        ) as conversion_rate
      FROM event_participations e
      LEFT JOIN transactions t ON 
        e.user_id = t.user_id 
        AND t.type = 'deposit' 
        AND t.date > e.participation_date 
        AND t.date <= DATE_ADD(e.participation_date, INTERVAL 7 DAY)
      WHERE e.participation_date >= DATE_SUB(CURRENT_DATE, INTERVAL 7 DAY)
      GROUP BY event_date
      ORDER BY event_date
    `;
    
    try {
      const results = await executeQuery(conversionTrendsQuery, []);
      
      // 세그먼트별 전환율 분석
      const segmentConversionQuery = `
        SELECT 
          CASE 
            WHEN u.inactive_days <= 7 THEN 'active_week'
            WHEN u.inactive_days <= 30 THEN 'active_month'
            WHEN u.inactive_days <= 90 THEN 'inactive_3_months'
            WHEN u.inactive_days <= 180 THEN 'inactive_6_months'
            WHEN u.inactive_days <= 365 THEN 'inactive_year'
            ELSE 'inactive_over_year'
          END as segment,
          COUNT(DISTINCT e.user_id) as participants,
          COUNT(DISTINCT CASE WHEN t.id IS NOT NULL THEN e.user_id END) as converted,
          ROUND(
            COUNT(DISTINCT CASE WHEN t.id IS NOT NULL THEN e.user_id END) / 
            COUNT(DISTINCT e.user_id) * 100, 2
          ) as conversion_rate
        FROM event_participations e
        JOIN (
          SELECT 
            u.id,
            DATEDIFF(e.participation_date, IFNULL(MAX(g.date), '1970-01-01')) as inactive_days
          FROM users u
          JOIN event_participations e ON u.id = e.user_id
          LEFT JOIN game_logs g ON u.id = g.user_id AND g.date < e.participation_date
          WHERE e.participation_date >= DATE_SUB(CURRENT_DATE, INTERVAL 7 DAY)
          GROUP BY u.id, e.participation_date
        ) u ON e.user_id = u.id
        LEFT JOIN transactions t ON 
          e.user_id = t.user_id 
          AND t.type = 'deposit' 
          AND t.date > e.participation_date 
          AND t.date <= DATE_ADD(e.participation_date, INTERVAL 7 DAY)
        WHERE e.participation_date >= DATE_SUB(CURRENT_DATE, INTERVAL 7 DAY)
        GROUP BY segment
        ORDER BY FIELD(
          segment, 
          'active_week', 'active_month', 'inactive_3_months', 
          'inactive_6_months', 'inactive_year', 'inactive_over_year'
        )
      `;
      
      const segmentResults = await executeQuery(segmentConversionQuery, []);
      
      return {
        dailyTrends: results,
        segmentConversion: segmentResults,
        summary: {
          weeklyParticipants: results.reduce((sum, day) => sum + day.participants, 0),
          weeklyConverted: results.reduce((sum, day) => sum + day.converted, 0),
          weeklyConversionRate: results.reduce((sum, day) => sum + day.converted, 0) / results.reduce((sum, day) => sum + day.participants, 0) * 100,
          bestSegment: segmentResults.reduce((best, segment) => 
            (segment.conversion_rate > best.conversion_rate) ? segment : best, { conversion_rate: 0 })
        }
      };
    } catch (error) {
      logger.error('Failed to get weekly conversion trends:', error);
      throw error;
    }
  }

  /**
   * 월간 분석 결과 조회
   * @return {Promise<Object>} 월간 분석 데이터
   * @private
   */
  async getMonthlyAnalytics() {
    try {
      // 월간 분석 로직 구현
      const activityTrends = await this.getMonthlyActivityTrends();
      const segmentDistribution = await this.getMonthlySegmentDistribution();
      const conversionAnalysis = await this.getMonthlyConversionAnalysis();
      const retentionAnalysis = await this.getMonthlyRetentionAnalysis();
      
      return {
        activityTrends,
        segmentDistribution,
        conversionAnalysis,
        retentionAnalysis,
        summary: {
          month: new Date().toLocaleString('default', { month: 'long', year: 'numeric' }),
          totalActiveUsers: activityTrends.summary.totalActiveUsers,
          totalDormantUsers: activityTrends.summary.totalDormantUsers,
          averageConversionRate: conversionAnalysis.summary.averageConversionRate,
          retentionRate: retentionAnalysis.summary.overallRetention
        }
      };
    } catch (error) {
      logger.error('Failed to get monthly analytics:', error);
      throw error;
    }
  }

  /**
   * 월간 활동 트렌드 조회
   * @return {Promise<Object>} 활동 트렌드 데이터
   * @private
   */
  async getMonthlyActivityTrends() {
    // 월간 활동 트렌드 구현 (임시)
    return {
      dailyActiveUsers: [],
      weeklyActiveUsers: [],
      summary: {
        totalActiveUsers: 0,
        totalDormantUsers: 0,
        averageDailyUsers: 0
      }
    };
  }

  /**
   * 월간 세그먼트 분포 조회
   * @return {Promise<Object>} 세그먼트 분포 데이터
   * @private
   */
  async getMonthlySegmentDistribution() {
    // 월간 세그먼트 분포 구현 (임시)
    return {
      segments: [],
      changes: [],
      summary: {
        totalImproved: 0,
        totalWorsened: 0
      }
    };
  }

  /**
   * 월간 전환율 분석 조회
   * @return {Promise<Object>} 전환율 분석 데이터
   * @private
   */
  async getMonthlyConversionAnalysis() {
    // 월간 전환율 분석 구현 (임시)
    return {
      weeklyTrends: [],
      segmentComparison: [],
      summary: {
        averageConversionRate: 0,
        bestSegment: null,
        worstSegment: null
      }
    };
  }

  /**
   * 월간 유지율 분석 조회
   * @return {Promise<Object>} 유지율 분석 데이터
   * @private
   */
  async getMonthlyRetentionAnalysis() {
    // 월간 유지율 분석 구현 (임시)
    return {
      retentionMatrix: [],
      cohorts: [],
      summary: {
        overallRetention: 0,
        bestCohort: null,
        worstCohort: null
      }
    };
  }

  /**
   * 주간 고유 사용자 수 조회
   * @return {Promise<number>} 고유 사용자 수
   * @private
   */
  async countUniqueWeeklyUsers() {
    const query = `
      SELECT COUNT(DISTINCT user_id) as unique_users
      FROM game_logs
      WHERE date >= DATE_SUB(CURRENT_DATE, INTERVAL 7 DAY)
    `;
    
    try {
      const result = await executeQuery(query, []);
      return result[0].unique_users;
    } catch (error) {
      logger.error('Failed to count unique weekly users:', error);
      return 0;
    }
  }

  /**
   * 분석 작업 기록 생성
   * @param {string} type 작업 유형
   * @return {Promise<DocumentReference>} 문서 참조
   * @private
   */
  async createAnalyticsTask(type) {
    try {
      const taskRef = this.db.collection('analyticsTasks').doc();
      
      await taskRef.set({
        id: taskRef.id,
        type,
        status: 'running',
        startTime: admin.firestore.FieldValue.serverTimestamp(),
        endTime: null,
        result: null,
        error: null
      });
      
      return taskRef;
    } catch (error) {
      logger.error(`Failed to create analytics task record for ${type}:`, error);
      throw error;
    }
  }

  /**
   * 분석 작업 완료 기록
   * @param {DocumentReference} taskRef 작업 문서 참조
   * @param {Object} result 작업 결과
   * @return {Promise<void>}
   * @private
   */
  async completeAnalyticsTask(taskRef, result) {
    try {
      await taskRef.update({
        status: 'completed',
        endTime: admin.firestore.FieldValue.serverTimestamp(),
        result: {
          timestamp: new Date().toISOString(),
          summary: this.summarizeResult(result)
        }
      });
    } catch (error) {
      logger.error(`Failed to update analytics task completion:`, error);
    }
  }

  /**
   * 분석 작업 실패 기록
   * @param {DocumentReference} taskRef 작업 문서 참조
   * @param {Error} error 에러 객체
   * @return {Promise<void>}
   * @private
   */
  async failAnalyticsTask(taskRef, error) {
    try {
      await taskRef.update({
        status: 'failed',
        endTime: admin.firestore.FieldValue.serverTimestamp(),
        error: {
          message: error.message,
          stack: error.stack,
          timestamp: new Date().toISOString()
        }
      });
    } catch (err) {
      logger.error(`Failed to update analytics task failure:`, err);
    }
  }

  /**
   * 결과 요약 데이터 생성
   * @param {Object} result 분석 결과
   * @return {Object} 요약 데이터
   * @private
   */
  summarizeResult(result) {
    // 대시보드용 요약 데이터 생성
    const summary = {};
    
    // 고가치 사용자 요약
    if (result.highValueUserResult) {
      summary.highValueUsers = {
        activeCount: result.highValueUserResult.activeUsers?.count || 0,
        dormantCount: result.highValueUserResult.dormantUsers?.count || 0,
        totalCount: result.highValueUserResult.totalUsers || 0
      };
    }
    
    // 이벤트 분석 요약
    if (result.eventAnalysisResult) {
      summary.eventAnalysis = {
        totalEvents: result.eventAnalysisResult.eventConversions?.length || 0,
        averageConversionRate: result.eventAnalysisResult.summary?.avgConversionRate || 0
      };
    }
    
    // 세그먼트 분석 요약
    if (result.userSegmentsResult) {
      summary.userSegments = {
        totalUsers: result.userSegmentsResult.totalStats?.totalUsers || 0,
        segmentCount: result.userSegmentsResult.segmentDistribution?.length || 0
      };
    }
    
    // 전환율 메트릭 요약
    if (result.conversionMetricsResult) {
      summary.conversionMetrics = {
        segmentCount: result.conversionMetricsResult.segmentMetrics?.length || 0,
        overallConversionRate: result.conversionMetricsResult.summary?.overallConversionRate || 0
      };
    }
    
    return summary;
  }

  /**
   * N일 전 날짜 계산
   * @param {number} days 이전 일 수
   * @return {string} YYYY-MM-DD 형식 날짜
   * @private
   */
  getDateBefore(days) {
    const date = new Date();
    date.setDate(date.getDate() - days);
    return date.toISOString().split('T')[0];
  }
}

// 싱글톤 인스턴스 생성
const scheduledAnalyticsService = new ScheduledAnalyticsService();

module.exports = scheduledAnalyticsService;
