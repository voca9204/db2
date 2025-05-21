/**
 * Firebase Cloud Messaging 서비스
 * 
 * 푸시 알림 및 이메일 알림 전송 기능을 제공하는 서비스
 */

const admin = require('firebase-admin');
const { getContextLogger } = require('../../utils/logger');

// 로거 초기화
const logger = getContextLogger('notification-service');

// 날짜 포맷 함수
const formatDateTime = (date) => {
  return new Intl.DateTimeFormat('ko-KR', {
    year: 'numeric',
    month: 'long',
    day: 'numeric',
    hour: '2-digit',
    minute: '2-digit',
    hour12: false
  }).format(date);
};

/**
 * FCM 토픽 정의
 */
const TOPICS = {
  ANALYTICS_UPDATES: 'analytics_updates',
  HIGH_VALUE_USERS: 'high_value_users',
  EVENT_ANALYTICS: 'event_analytics',
  USER_SEGMENTS: 'user_segments',
  HIGH_VALUE_INACTIVE: 'high_value_inactive',
  HIGH_VALUE_REACTIVATION: 'high_value_reactivation',
  ALERT_ADMIN: 'alert_admin',
  ALERT_ANALYST: 'alert_analyst'
};

/**
 * 알림 유형 정의
 */
const NOTIFICATION_TYPES = {
  ANALYTICS_COMPLETE: 'analytics_complete',
  USER_STATUS_CHANGE: 'user_status_change',
  EVENT_IMPACT: 'event_impact',
  REACTIVATION_OPPORTUNITY: 'reactivation_opportunity',
  HIGH_VALUE_RISK: 'high_value_risk',
  SYSTEM_ALERT: 'system_alert'
};

/**
 * 알림 서비스 클래스
 */
class NotificationService {
  /**
   * 생성자
   */
  constructor() {
    // Firebase Admin SDK 초기화 (아직 초기화되지 않은 경우)
    if (!admin.apps.length) {
      admin.initializeApp();
    }
    
    this.messaging = admin.messaging();
  }

  /**
   * 특정 토픽에 메시지 전송
   * @param {string} topic 토픽명
   * @param {Object} data 메시지 데이터
   * @param {Object} notification 알림 내용
   * @return {Promise<Object>} 전송 결과
   */
  async sendTopicMessage(topic, data, notification = null) {
    try {
      // 외부 참조 변환 (FCM은 문자열만 지원)
      const messageData = {};
      
      Object.keys(data).forEach(key => {
        if (typeof data[key] !== 'string') {
          messageData[key] = JSON.stringify(data[key]);
        } else {
          messageData[key] = data[key];
        }
      });
      
      // 메시지 구성
      const message = {
        data: {
          ...messageData,
          timestamp: new Date().toISOString()
        },
        topic
      };
      
      // 알림 내용이 제공된 경우 추가
      if (notification) {
        message.notification = notification;
      }
      
      // 메시지 전송
      const response = await this.messaging.send(message);
      
      logger.info(`Sent notification to topic ${topic}, messageId: ${response}`);
      
      return {
        success: true,
        messageId: response,
        topic
      };
    } catch (error) {
      logger.error(`Failed to send notification to topic ${topic}:`, error);
      throw error;
    }
  }

  /**
   * 특정 사용자에게 메시지 전송
   * @param {string} token FCM 등록 토큰
   * @param {Object} data 메시지 데이터
   * @param {Object} notification 알림 내용
   * @return {Promise<Object>} 전송 결과
   */
  async sendUserMessage(token, data, notification = null) {
    try {
      // 외부 참조 변환 (FCM은 문자열만 지원)
      const messageData = {};
      
      Object.keys(data).forEach(key => {
        if (typeof data[key] !== 'string') {
          messageData[key] = JSON.stringify(data[key]);
        } else {
          messageData[key] = data[key];
        }
      });
      
      // 메시지 구성
      const message = {
        data: {
          ...messageData,
          timestamp: new Date().toISOString()
        },
        token
      };
      
      // 알림 내용이 제공된 경우 추가
      if (notification) {
        message.notification = notification;
      }
      
      // 메시지 전송
      const response = await this.messaging.send(message);
      
      logger.info(`Sent notification to user token ${token.substring(0, 10)}..., messageId: ${response}`);
      
      return {
        success: true,
        messageId: response,
        token
      };
    } catch (error) {
      logger.error(`Failed to send notification to user token ${token.substring(0, 10)}...:`, error);
      throw error;
    }
  }

  /**
   * 사용자 그룹에게 메시지 전송
   * @param {Array<string>} tokens FCM 등록 토큰 배열
   * @param {Object} data 메시지 데이터
   * @param {Object} notification 알림 내용
   * @return {Promise<Object>} 전송 결과
   */
  async sendMulticastMessage(tokens, data, notification = null) {
    try {
      if (!Array.isArray(tokens) || tokens.length === 0) {
        logger.warn('No tokens provided for multicast message');
        return {
          success: false,
          error: 'No tokens provided'
        };
      }
      
      // 외부 참조 변환 (FCM은 문자열만 지원)
      const messageData = {};
      
      Object.keys(data).forEach(key => {
        if (typeof data[key] !== 'string') {
          messageData[key] = JSON.stringify(data[key]);
        } else {
          messageData[key] = data[key];
        }
      });
      
      // 메시지 구성
      const message = {
        data: {
          ...messageData,
          timestamp: new Date().toISOString()
        },
        tokens
      };
      
      // 알림 내용이 제공된 경우 추가
      if (notification) {
        message.notification = notification;
      }
      
      // 메시지 전송
      const response = await this.messaging.sendMulticast(message);
      
      logger.info(`Sent multicast notification to ${tokens.length} recipients, success: ${response.successCount}, failure: ${response.failureCount}`);
      
      return {
        success: true,
        successCount: response.successCount,
        failureCount: response.failureCount,
        responses: response.responses
      };
    } catch (error) {
      logger.error(`Failed to send multicast notification:`, error);
      throw error;
    }
  }

  /**
   * 분석 완료 알림 전송
   * @param {string} analysisType 분석 유형
   * @param {Object} result 분석 결과
   * @return {Promise<Object>} 전송 결과
   */
  async sendAnalyticsCompleteNotification(analysisType, result) {
    try {
      // 분석 유형별 토픽 매핑
      let topic = TOPICS.ANALYTICS_UPDATES;
      
      switch (analysisType) {
        case 'highValueUsers':
          topic = TOPICS.HIGH_VALUE_USERS;
          break;
        case 'eventAnalytics':
          topic = TOPICS.EVENT_ANALYTICS;
          break;
        case 'userSegments':
          topic = TOPICS.USER_SEGMENTS;
          break;
      }
      
      // 알림 데이터 구성
      const data = {
        type: NOTIFICATION_TYPES.ANALYTICS_COMPLETE,
        analysisType,
        completedAt: new Date().toISOString()
      };
      
      // 결과 요약
      if (result) {
        data.summary = this.generateResultSummary(analysisType, result);
      }
      
      // 알림 내용 구성
      const notification = {
        title: `${this.formatAnalysisType(analysisType)} 분석 완료`,
        body: `${formatDateTime(new Date())}에 ${this.formatAnalysisType(analysisType)} 분석이 완료되었습니다.`
      };
      
      // 알림 전송
      return this.sendTopicMessage(topic, data, notification);
    } catch (error) {
      logger.error(`Failed to send analytics complete notification:`, error);
      throw error;
    }
  }

  /**
   * 사용자 상태 변경 알림 전송
   * @param {string} statusType 상태 변경 유형
   * @param {Object} userData 사용자 데이터
   * @return {Promise<Object>} 전송 결과
   */
  async sendUserStatusChangeNotification(statusType, userData) {
    try {
      // 상태 변경 유형별 토픽 매핑
      let topic = TOPICS.HIGH_VALUE_USERS;
      let notificationTitle = '고가치 사용자 상태 변경';
      let notificationBody = '사용자 상태가 변경되었습니다.';
      
      switch (statusType) {
        case 'active_to_inactive':
          topic = TOPICS.HIGH_VALUE_INACTIVE;
          notificationTitle = '고가치 사용자 비활성화 감지';
          notificationBody = `사용자 ${userData.userName || userData.userId}이(가) 비활성 상태로 전환되었습니다.`;
          break;
        case 'inactive_to_active':
          topic = TOPICS.HIGH_VALUE_REACTIVATION;
          notificationTitle = '고가치 사용자 재활성화 감지';
          notificationBody = `사용자 ${userData.userName || userData.userId}이(가) 활성 상태로 재전환되었습니다.`;
          break;
        case 'high_value_risk':
          topic = TOPICS.HIGH_VALUE_RISK;
          notificationTitle = '고가치 사용자 이탈 위험';
          notificationBody = `사용자 ${userData.userName || userData.userId}이(가) 이탈 위험 상태로 분류되었습니다.`;
          break;
      }
      
      // 알림 데이터 구성
      const data = {
        type: NOTIFICATION_TYPES.USER_STATUS_CHANGE,
        statusType,
        userId: userData.userId.toString(),
        userName: userData.userName || '',
        changedAt: new Date().toISOString()
      };
      
      // 추가 사용자 정보
      if (userData.netBet) data.netBet = userData.netBet.toString();
      if (userData.playDays) data.playDays = userData.playDays.toString();
      if (userData.inactiveDays) data.inactiveDays = userData.inactiveDays.toString();
      if (userData.lastActivity) data.lastActivity = userData.lastActivity;
      
      // 알림 내용 구성
      const notification = {
        title: notificationTitle,
        body: notificationBody
      };
      
      // 알림 전송
      return this.sendTopicMessage(topic, data, notification);
    } catch (error) {
      logger.error(`Failed to send user status change notification:`, error);
      throw error;
    }
  }

  /**
   * 재활성화 캠페인 대상자 알림 전송
   * @param {Object} campaignData 캠페인 데이터
   * @param {Array} targetUsers 대상 사용자 목록
   * @return {Promise<Object>} 전송 결과
   */
  async sendReactivationOpportunityNotification(campaignData, targetUsers) {
    try {
      // 알림 데이터 구성
      const data = {
        type: NOTIFICATION_TYPES.REACTIVATION_OPPORTUNITY,
        campaignId: campaignData.id || '',
        campaignName: campaignData.name || '재활성화 캠페인',
        targetCount: targetUsers.length.toString(),
        createdAt: new Date().toISOString()
      };
      
      // 사용자 목록 요약 (최대 5명)
      if (targetUsers.length > 0) {
        data.topUsers = JSON.stringify(targetUsers.slice(0, 5).map(user => ({
          id: user.userId,
          name: user.userName,
          score: user.reactivationScore
        })));
      }
      
      // 알림 내용 구성
      const notification = {
        title: '재활성화 캠페인 대상자 알림',
        body: `${targetUsers.length}명의 고가치 사용자가 재활성화 캠페인 대상으로 식별되었습니다.`
      };
      
      // 알림 전송
      return this.sendTopicMessage(TOPICS.HIGH_VALUE_REACTIVATION, data, notification);
    } catch (error) {
      logger.error(`Failed to send reactivation opportunity notification:`, error);
      throw error;
    }
  }

  /**
   * 이벤트 효과 알림 전송
   * @param {Object} eventData 이벤트 데이터
   * @param {Object} analysisData 분석 데이터
   * @return {Promise<Object>} 전송 결과
   */
  async sendEventImpactNotification(eventData, analysisData) {
    try {
      // 알림 데이터 구성
      const data = {
        type: NOTIFICATION_TYPES.EVENT_IMPACT,
        eventId: eventData.eventId.toString(),
        eventName: eventData.eventName || '',
        analysisDate: new Date().toISOString()
      };
      
      // 분석 결과 추가
      if (analysisData) {
        if (analysisData.participantCount) data.participantCount = analysisData.participantCount.toString();
        if (analysisData.dormantParticipantCount) data.dormantParticipantCount = analysisData.dormantParticipantCount.toString();
        if (analysisData.conversionCount) data.conversionCount = analysisData.conversionCount.toString();
        if (analysisData.conversionRate) data.conversionRate = analysisData.conversionRate.toString();
      }
      
      // 성과 평가 계산
      let performanceEvaluation = '';
      if (analysisData && analysisData.conversionRate) {
        const conversionRate = parseFloat(analysisData.conversionRate);
        if (conversionRate >= 15) {
          performanceEvaluation = '매우 높음';
        } else if (conversionRate >= 10) {
          performanceEvaluation = '높음';
        } else if (conversionRate >= 5) {
          performanceEvaluation = '보통';
        } else {
          performanceEvaluation = '낮음';
        }
      }
      
      // 알림 내용 구성
      const notification = {
        title: '이벤트 효과 분석 결과',
        body: performanceEvaluation 
          ? `이벤트 "${eventData.eventName}"의 전환율은 ${performanceEvaluation}입니다.`
          : `이벤트 "${eventData.eventName}"의 분석이 완료되었습니다.`
      };
      
      // 알림 전송
      return this.sendTopicMessage(TOPICS.EVENT_ANALYTICS, data, notification);
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
   * @return {Promise<Object>} 전송 결과
   */
  async sendSystemAlert(alertType, message, details = {}, isAdmin = false) {
    try {
      // 알림 데이터 구성
      const data = {
        type: NOTIFICATION_TYPES.SYSTEM_ALERT,
        alertType,
        message,
        timestamp: new Date().toISOString()
      };
      
      // 추가 세부 정보
      if (Object.keys(details).length > 0) {
        data.details = JSON.stringify(details);
      }
      
      // 알림 내용 구성
      const notification = {
        title: `시스템 알림: ${alertType}`,
        body: message
      };
      
      // 알림 전송 (관리자 또는 분석가 토픽)
      const topic = isAdmin ? TOPICS.ALERT_ADMIN : TOPICS.ALERT_ANALYST;
      return this.sendTopicMessage(topic, data, notification);
    } catch (error) {
      logger.error(`Failed to send system alert:`, error);
      throw error;
    }
  }

  /**
   * 사용자 FCM 토큰 구독 처리
   * @param {string} userId 사용자 ID
   * @param {string} token FCM 등록 토큰
   * @param {Array<string>} topics 구독할 토픽 배열
   * @return {Promise<Object>} 처리 결과
   */
  async subscribeUserToTopics(userId, token, topics) {
    try {
      if (!Array.isArray(topics) || topics.length === 0) {
        logger.warn(`No topics specified for user ${userId}`);
        return {
          success: false,
          error: 'No topics specified'
        };
      }
      
      // 토픽 구독 처리
      const subscriptionPromises = topics.map(topic => 
        this.messaging.subscribeToTopic(token, topic)
      );
      
      // 모든 구독 요청 처리
      const results = await Promise.all(subscriptionPromises);
      
      logger.info(`User ${userId} subscribed to ${topics.length} topics`);
      
      return {
        success: true,
        userId,
        topics,
        results
      };
    } catch (error) {
      logger.error(`Failed to subscribe user ${userId} to topics:`, error);
      throw error;
    }
  }

  /**
   * 사용자 FCM 토큰 구독 해제 처리
   * @param {string} userId 사용자 ID
   * @param {string} token FCM 등록 토큰
   * @param {Array<string>} topics 구독 해제할 토픽 배열
   * @return {Promise<Object>} 처리 결과
   */
  async unsubscribeUserFromTopics(userId, token, topics) {
    try {
      if (!Array.isArray(topics) || topics.length === 0) {
        logger.warn(`No topics specified for user ${userId} to unsubscribe`);
        return {
          success: false,
          error: 'No topics specified'
        };
      }
      
      // 토픽 구독 해제 처리
      const unsubscriptionPromises = topics.map(topic => 
        this.messaging.unsubscribeFromTopic(token, topic)
      );
      
      // 모든 구독 해제 요청 처리
      const results = await Promise.all(unsubscriptionPromises);
      
      logger.info(`User ${userId} unsubscribed from ${topics.length} topics`);
      
      return {
        success: true,
        userId,
        topics,
        results
      };
    } catch (error) {
      logger.error(`Failed to unsubscribe user ${userId} from topics:`, error);
      throw error;
    }
  }

  /**
   * 분석 결과 요약 생성
   * @param {string} analysisType 분석 유형
   * @param {Object} result 분석 결과
   * @return {Object} 요약 데이터
   * @private
   */
  generateResultSummary(analysisType, result) {
    // 분석 유형별 요약 생성
    switch (analysisType) {
      case 'highValueUsers':
        return {
          activeUsers: result.activeUsers?.count || 0,
          dormantUsers: result.dormantUsers?.count || 0,
          totalUsers: result.totalUsers || 0
        };
      
      case 'eventAnalytics':
        return {
          events: result.eventConversions?.length || 0,
          avgConversionRate: result.summary?.avgConversionRate || 0,
          bestEvent: result.summary?.bestEvent?.eventName || ''
        };
      
      case 'userSegments':
        return {
          segments: result.segmentDistribution?.length || 0,
          totalUsers: result.totalStats?.totalUsers || 0,
          avgNetBet: result.totalStats?.avgNetBet || 0
        };
      
      default:
        return {
          timestamp: new Date().toISOString(),
          analysisType
        };
    }
  }

  /**
   * 분석 유형 포맷팅
   * @param {string} analysisType 분석 유형
   * @return {string} 포맷팅된 문자열
   * @private
   */
  formatAnalysisType(analysisType) {
    switch (analysisType) {
      case 'highValueUsers':
        return '고가치 사용자';
      case 'eventAnalytics':
        return '이벤트 효과';
      case 'userSegments':
        return '사용자 세그먼트';
      default:
        return analysisType;
    }
  }
}

// 싱글톤 인스턴스 생성
const notificationService = new NotificationService();

// FCM 관련 상수 내보내기
module.exports = {
  notificationService,
  TOPICS,
  NOTIFICATION_TYPES
};
