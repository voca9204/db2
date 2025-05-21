/**
 * 알림 서비스 모듈
 * 
 * FCM 및 이메일을 통한 알림 서비스 통합 모듈
 */

const { notificationService, TOPICS, NOTIFICATION_TYPES } = require('./fcm.service');
const { emailService } = require('./email.service');
const { getContextLogger } = require('../../utils/logger');

// 로거 초기화
const logger = getContextLogger('notification-service');

/**
 * 통합 알림 서비스 클래스
 */
class NotificationManager {
  /**
   * 생성자
   */
  constructor() {
    this.fcmService = notificationService;
    this.emailService = emailService;
  }

  /**
   * 분석 완료 알림 전송
   * @param {string} analysisType 분석 유형
   * @param {Object} result 분석 결과
   * @param {Array<string>} emailRecipients 이메일 수신자 배열 (옵션)
   * @return {Promise<Object>} 전송 결과
   */
  async sendAnalyticsCompleteNotification(analysisType, result, emailRecipients = null) {
    try {
      // FCM 알림 전송
      const fcmResult = await this.fcmService.sendAnalyticsCompleteNotification(analysisType, result);
      
      // 이메일 수신자가 있는 경우 이메일 전송
      let emailResult = null;
      
      if (emailRecipients && emailRecipients.length > 0) {
        const reportData = this.formatAnalyticsResult(analysisType, result);
        emailResult = await this.emailService.sendAnalyticsReportEmail('event', reportData, emailRecipients);
      }
      
      return {
        fcm: fcmResult,
        email: emailResult
      };
    } catch (error) {
      logger.error(`Failed to send analytics complete notification (${analysisType}):`, error);
      throw error;
    }
  }

  /**
   * 사용자 상태 변경 알림 전송
   * @param {string} statusType 상태 변경 유형
   * @param {Object} userData 사용자 데이터
   * @param {Array<string>} emailRecipients 이메일 수신자 배열 (옵션)
   * @return {Promise<Object>} 전송 결과
   */
  async sendUserStatusChangeNotification(statusType, userData, emailRecipients = null) {
    try {
      // FCM 알림 전송
      const fcmResult = await this.fcmService.sendUserStatusChangeNotification(statusType, userData);
      
      // 이메일 수신자가 있는 경우 이메일 전송
      let emailResult = null;
      
      if (emailRecipients && emailRecipients.length > 0) {
        emailResult = await this.emailService.sendUserStatusChangeEmail(statusType, userData, emailRecipients);
      }
      
      return {
        fcm: fcmResult,
        email: emailResult
      };
    } catch (error) {
      logger.error(`Failed to send user status change notification (${statusType}):`, error);
      throw error;
    }
  }

  /**
   * 재활성화 캠페인 대상자 알림 전송
   * @param {Object} campaignData 캠페인 데이터
   * @param {Array} targetUsers 대상 사용자 목록
   * @param {Array<string>} emailRecipients 이메일 수신자 배열 (옵션)
   * @return {Promise<Object>} 전송 결과
   */
  async sendReactivationOpportunityNotification(campaignData, targetUsers, emailRecipients = null) {
    try {
      // FCM 알림 전송
      const fcmResult = await this.fcmService.sendReactivationOpportunityNotification(campaignData, targetUsers);
      
      // 이메일 수신자가 있는 경우 이메일 전송
      let emailResult = null;
      
      if (emailRecipients && emailRecipients.length > 0) {
        emailResult = await this.emailService.sendReactivationCampaignEmail(campaignData, targetUsers, emailRecipients);
      }
      
      return {
        fcm: fcmResult,
        email: emailResult
      };
    } catch (error) {
      logger.error(`Failed to send reactivation opportunity notification:`, error);
      throw error;
    }
  }

  /**
   * 이벤트 효과 알림 전송
   * @param {Object} eventData 이벤트 데이터
   * @param {Object} analysisData 분석 데이터
   * @param {Array<string>} emailRecipients 이메일 수신자 배열 (옵션)
   * @return {Promise<Object>} 전송 결과
   */
  async sendEventImpactNotification(eventData, analysisData, emailRecipients = null) {
    try {
      // FCM 알림 전송
      const fcmResult = await this.fcmService.sendEventImpactNotification(eventData, analysisData);
      
      // 이메일 수신자가 있는 경우 이메일 전송
      let emailResult = null;
      
      if (emailRecipients && emailRecipients.length > 0) {
        emailResult = await this.emailService.sendEventAnalysisEmail(eventData, analysisData, emailRecipients);
      }
      
      return {
        fcm: fcmResult,
        email: emailResult
      };
    } catch (error) {
      logger.error(`Failed to send event impact notification:`, error);
      throw error;
    }
  }

  /**
   * 시스템 알림 전송
   * @param {string} alertType 알림 유형
   * @param {string} message 알림 메시지
   * @param {Object} details 추가 세부 정보
   * @param {boolean} isAdmin 관리자 전용 여부
   * @param {Array<string>} emailRecipients 이메일 수신자 배열 (옵션)
   * @return {Promise<Object>} 전송 결과
   */
  async sendSystemAlert(alertType, message, details = {}, isAdmin = false, emailRecipients = null) {
    try {
      // FCM 알림 전송
      const fcmResult = await this.fcmService.sendSystemAlert(alertType, message, details, isAdmin);
      
      // 이메일 수신자가 있는 경우 이메일 전송
      let emailResult = null;
      
      if (emailRecipients && emailRecipients.length > 0) {
        emailResult = await this.emailService.sendSystemAlertEmail(alertType, message, details, emailRecipients);
      }
      
      return {
        fcm: fcmResult,
        email: emailResult
      };
    } catch (error) {
      logger.error(`Failed to send system alert (${alertType}):`, error);
      throw error;
    }
  }

  /**
   * 정기 분석 보고서 알림 전송
   * @param {string} reportType 보고서 유형 (daily, weekly, monthly)
   * @param {Object} reportData 보고서 데이터
   * @param {Array<string>} emailRecipients 이메일 수신자 배열
   * @return {Promise<Object>} 전송 결과
   */
  async sendAnalyticsReportNotification(reportType, reportData, emailRecipients) {
    try {
      // FCM 알림 데이터 구성
      const data = {
        type: NOTIFICATION_TYPES.ANALYTICS_COMPLETE,
        reportType,
        timestamp: new Date().toISOString()
      };
      
      // 결과 요약
      if (reportData) {
        data.summary = JSON.stringify(this.formatReportSummary(reportType, reportData));
      }
      
      // 알림 내용 구성
      const notification = {
        title: `${this.formatReportType(reportType)} 분석 보고서`,
        body: `${new Date().toLocaleDateString('ko-KR')} ${this.formatReportType(reportType)} 분석 보고서가 생성되었습니다.`
      };
      
      // FCM 알림 전송
      const fcmResult = await this.fcmService.sendTopicMessage(TOPICS.ANALYTICS_UPDATES, data, notification);
      
      // 이메일 수신자가 있는 경우 이메일 전송
      let emailResult = null;
      
      if (emailRecipients && emailRecipients.length > 0) {
        emailResult = await this.emailService.sendAnalyticsReportEmail(reportType, reportData, emailRecipients);
      }
      
      return {
        fcm: fcmResult,
        email: emailResult
      };
    } catch (error) {
      logger.error(`Failed to send analytics report notification (${reportType}):`, error);
      throw error;
    }
  }

  /**
   * 분석 결과 포맷팅
   * @param {string} analysisType 분석 유형
   * @param {Object} result 분석 결과
   * @return {Object} 포맷팅된 결과
   * @private
   */
  formatAnalyticsResult(analysisType, result) {
    // 분석 유형별 포맷팅
    switch (analysisType) {
      case 'highValueUsers':
        return {
          analysisType: '고가��� 사용자 분석',
          activeUsers: result.activeUsers?.count || 0,
          dormantUsers: result.dormantUsers?.count || 0,
          totalUsers: result.totalUsers || 0,
          recentUsers: result.activeUsers?.samples || []
        };
      
      case 'eventAnalytics':
        return {
          analysisType: '이벤트 효과 분석',
          events: result.eventConversions || [],
          totalEvents: result.eventConversions?.length || 0,
          avgConversionRate: result.summary?.avgConversionRate || 0,
          bestEvent: result.summary?.bestEvent || null
        };
      
      case 'userSegments':
        return {
          analysisType: '사용자 세그먼트 분석',
          segments: result.segmentDistribution || [],
          totalUsers: result.totalStats?.totalUsers || 0,
          avgNetBet: result.totalStats?.avgNetBet || 0,
          avgPlayDays: result.totalStats?.avgPlayDays || 0
        };
      
      default:
        return {
          analysisType,
          timestamp: new Date().toISOString()
        };
    }
  }

  /**
   * 보고서 요약 포맷팅
   * @param {string} reportType 보고서 유형
   * @param {Object} reportData 보고서 데이터
   * @return {Object} 요약 데이터
   * @private
   */
  formatReportSummary(reportType, reportData) {
    // 보고서 유형별 포맷팅
    switch (reportType) {
      case 'daily':
        return {
          activeUsers: reportData.activeUsers || 0,
          newUsers: reportData.newUsers || 0,
          totalRevenue: reportData.totalRevenue || 0,
          conversionRate: reportData.conversionRate || 0
        };
      
      case 'weekly':
        return {
          weeklyActiveUsers: reportData.weeklyActiveUsers || 0,
          averageDailyUsers: reportData.averageDailyUsers || 0,
          weeklyRevenue: reportData.weeklyRevenue || 0,
          topEvents: reportData.topEvents || []
        };
      
      case 'monthly':
        return {
          monthlyActiveUsers: reportData.monthlyActiveUsers || 0,
          newUsers: reportData.newUsers || 0,
          monthlyRevenue: reportData.monthlyRevenue || 0,
          retentionRate: reportData.retentionRate || 0,
          churnRate: reportData.churnRate || 0
        };
      
      default:
        return {
          reportType,
          timestamp: new Date().toISOString()
        };
    }
  }

  /**
   * 보고서 유형 포맷팅
   * @param {string} reportType 보고서 유형
   * @return {string} 포맷팅된 문자열
   * @private
   */
  formatReportType(reportType) {
    switch (reportType) {
      case 'daily':
        return '일일';
      case 'weekly':
        return '주간';
      case 'monthly':
        return '월간';
      default:
        return reportType;
    }
  }
}

// 싱글톤 인스턴스 생성
const notificationManager = new NotificationManager();

module.exports = {
  notificationManager,
  notificationService,
  emailService,
  TOPICS,
  NOTIFICATION_TYPES
};
