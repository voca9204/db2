/**
 * 이메일 알림 서비스
 * 
 * Firebase Extensions 또는 Nodemailer를 사용한 이메일 알림 전송 기능
 */

const admin = require('firebase-admin');
const { getContextLogger } = require('../../utils/logger');

// Nodemailer (대체 이메일 전송 라이브러리)
let nodemailer = null;
try {
  nodemailer = require('nodemailer');
} catch (error) {
  // 라이브러리가 설치되지 않은 경우 무시
}

// 로거 초기화
const logger = getContextLogger('email-service');

/**
 * 이메일 서비스 클래스
 */
class EmailService {
  /**
   * 생성자
   */
  constructor() {
    this.transporter = null;
    this.useFirebaseExtension = process.env.USE_FIREBASE_EMAIL_EXTENSION === 'true';
    this.defaultSender = process.env.DEFAULT_EMAIL_SENDER || 'noreply@example.com';
    
    // Nodemailer 사용 시 트랜스포터 초기화
    if (!this.useFirebaseExtension && nodemailer) {
      this.initializeTransporter();
    }
  }

  /**
   * Nodemailer 트랜스포터 초기화
   * @private
   */
  initializeTransporter() {
    try {
      // SMTP 설정이 있는 경우에만 초기화
      if (process.env.SMTP_HOST && process.env.SMTP_PORT) {
        this.transporter = nodemailer.createTransport({
          host: process.env.SMTP_HOST,
          port: parseInt(process.env.SMTP_PORT, 10),
          secure: process.env.SMTP_SECURE === 'true',
          auth: {
            user: process.env.SMTP_USER,
            pass: process.env.SMTP_PASSWORD
          }
        });
        
        logger.info('Nodemailer transporter initialized successfully');
      } else {
        logger.warn('SMTP configuration not found, email service will not be available');
      }
    } catch (error) {
      logger.error('Failed to initialize Nodemailer transporter:', error);
    }
  }

  /**
   * 이메일 전송
   * @param {string|Array<string>} to 수신자 이메일 주소 또는 배열
   * @param {string} subject 이메일 제목
   * @param {string} html 이메일 HTML 내용
   * @param {Object} options 추가 옵션
   * @return {Promise<Object>} 전송 결과
   */
  async sendEmail(to, subject, html, options = {}) {
    try {
      // 수신자 배열 변환
      const recipients = Array.isArray(to) ? to : [to];
      
      if (recipients.length === 0) {
        logger.warn('No recipients specified for email');
        return {
          success: false,
          error: 'No recipients specified'
        };
      }
      
      // Firebase Extensions 사용 시
      if (this.useFirebaseExtension) {
        return this.sendWithFirebaseExtension(recipients, subject, html, options);
      }
      
      // Nodemailer 사용 시
      if (this.transporter) {
        return this.sendWithNodemailer(recipients, subject, html, options);
      }
      
      // 이메일 서비스가 구성되지 않은 경우
      logger.error('Email service is not configured properly');
      return {
        success: false,
        error: 'Email service not configured'
      };
    } catch (error) {
      logger.error('Failed to send email:', error);
      throw error;
    }
  }

  /**
   * Firebase Extensions를 사용한 이메일 전송
   * @param {Array<string>} recipients 수신자 배열
   * @param {string} subject 이메일 제목
   * @param {string} html 이메일 HTML 내용
   * @param {Object} options 추가 옵션
   * @return {Promise<Object>} 전송 결과
   * @private
   */
  async sendWithFirebaseExtension(recipients, subject, html, options = {}) {
    try {
      const db = admin.firestore();
      const batch = db.batch();
      
      // 각 수신자별 이메일 문서 생성
      const emailRefs = recipients.map(recipient => {
        const emailRef = db.collection('mail').doc();
        
        batch.set(emailRef, {
          to: recipient,
          subject,
          html,
          from: options.from || this.defaultSender,
          cc: options.cc || null,
          bcc: options.bcc || null,
          attachments: options.attachments || null,
          createdAt: admin.firestore.FieldValue.serverTimestamp()
        });
        
        return emailRef;
      });
      
      // 배치 커밋
      await batch.commit();
      
      logger.info(`Queued ${recipients.length} emails using Firebase Extension`);
      
      return {
        success: true,
        count: recipients.length,
        messageIds: emailRefs.map(ref => ref.id)
      };
    } catch (error) {
      logger.error('Failed to send email with Firebase Extension:', error);
      throw error;
    }
  }

  /**
   * Nodemailer를 사용한 이메일 전송
   * @param {Array<string>} recipients 수신자 배열
   * @param {string} subject 이메일 제목
   * @param {string} html 이메일 HTML 내용
   * @param {Object} options 추가 옵션
   * @return {Promise<Object>} 전송 결과
   * @private
   */
  async sendWithNodemailer(recipients, subject, html, options = {}) {
    try {
      if (!this.transporter) {
        throw new Error('Nodemailer transporter not initialized');
      }
      
      // 이메일 옵션 구성
      const mailOptions = {
        from: options.from || this.defaultSender,
        to: recipients.join(', '),
        subject,
        html
      };
      
      // CC 추가
      if (options.cc) {
        mailOptions.cc = Array.isArray(options.cc) ? options.cc.join(', ') : options.cc;
      }
      
      // BCC 추가
      if (options.bcc) {
        mailOptions.bcc = Array.isArray(options.bcc) ? options.bcc.join(', ') : options.bcc;
      }
      
      // 첨부 파일 추가
      if (options.attachments) {
        mailOptions.attachments = options.attachments;
      }
      
      // 이메일 전송
      const info = await this.transporter.sendMail(mailOptions);
      
      logger.info(`Sent email to ${recipients.length} recipients using Nodemailer, messageId: ${info.messageId}`);
      
      return {
        success: true,
        count: recipients.length,
        messageId: info.messageId,
        response: info.response
      };
    } catch (error) {
      logger.error('Failed to send email with Nodemailer:', error);
      throw error;
    }
  }

  /**
   * 템플릿 기반 이메일 전송
   * @param {string|Array<string>} to 수신자 이메일 주소 또는 배열
   * @param {string} templateName 템플릿 이름
   * @param {Object} templateData 템플릿 데이터
   * @param {Object} options 추가 옵션
   * @return {Promise<Object>} 전송 결과
   */
  async sendTemplatedEmail(to, templateName, templateData, options = {}) {
    try {
      // 템플릿 조회
      const template = await this.getEmailTemplate(templateName);
      
      if (!template) {
        throw new Error(`Email template "${templateName}" not found`);
      }
      
      // 제목 및 내용 생성
      const subject = this.renderTemplate(template.subject, templateData);
      const html = this.renderTemplate(template.html, templateData);
      
      // 이메일 전송
      return this.sendEmail(to, subject, html, options);
    } catch (error) {
      logger.error(`Failed to send templated email "${templateName}":`, error);
      throw error;
    }
  }

  /**
   * 이메일 템플릿 조회
   * @param {string} templateName 템플릿 이름
   * @return {Promise<Object|null>} 템플릿 데이터
   * @private
   */
  async getEmailTemplate(templateName) {
    try {
      const db = admin.firestore();
      const templateDoc = await db.collection('emailTemplates').doc(templateName).get();
      
      if (!templateDoc.exists) {
        logger.warn(`Email template "${templateName}" not found`);
        return null;
      }
      
      return templateDoc.data();
    } catch (error) {
      logger.error(`Failed to get email template "${templateName}":`, error);
      throw error;
    }
  }

  /**
   * 템플릿 렌더링
   * @param {string} template 템플릿 문자열
   * @param {Object} data 템플릿 데이터
   * @return {string} 렌더링된 템플릿
   * @private
   */
  renderTemplate(template, data) {
    return template.replace(/\{\{\s*([a-zA-Z0-9_]+)\s*\}\}/g, (match, key) => {
      return data.hasOwnProperty(key) ? data[key] : match;
    });
  }

  /**
   * 고가치 사용자 상태 변경 알림 이메일 전송
   * @param {string} statusType 상태 변경 유형
   * @param {Object} userData 사용자 데이터
   * @param {Array<string>} recipients 수신자 배열
   * @return {Promise<Object>} 전송 결과
   */
  async sendUserStatusChangeEmail(statusType, userData, recipients) {
    try {
      // 이메일 제목 및 내용 구성
      let subject = '고가치 사용자 상태 변경';
      let templateName = 'user-status-change';
      
      switch (statusType) {
        case 'active_to_inactive':
          subject = '고가치 사용자 비활성화 알림';
          templateName = 'user-inactive';
          break;
        case 'inactive_to_active':
          subject = '고가치 사용자 재활성화 알림';
          templateName = 'user-reactivated';
          break;
        case 'high_value_risk':
          subject = '고가치 사용자 이탈 위험 알림';
          templateName = 'user-risk';
          break;
      }
      
      // 템플릿 데이터 구성
      const templateData = {
        userId: userData.userId,
        userName: userData.userName || `사용자 ${userData.userId}`,
        netBet: userData.netBet || 'N/A',
        playDays: userData.playDays || 'N/A',
        inactiveDays: userData.inactiveDays || 'N/A',
        lastActivity: userData.lastActivity || 'N/A',
        statusType: this.formatStatusType(statusType),
        timestamp: new Date().toLocaleString('ko-KR')
      };
      
      // 이메일 전송
      return this.sendTemplatedEmail(recipients, templateName, templateData, {
        subject
      });
    } catch (error) {
      logger.error(`Failed to send user status change email:`, error);
      throw error;
    }
  }

  /**
   * 재활성화 캠페인 알림 이메일 전송
   * @param {Object} campaignData 캠페인 데이터
   * @param {Array} targetUsers 대상 사용자 목록
   * @param {Array<string>} recipients 수신자 배열
   * @return {Promise<Object>} 전송 결과
   */
  async sendReactivationCampaignEmail(campaignData, targetUsers, recipients) {
    try {
      // 이메일 제목
      const subject = `재활성화 캠페인 대상자 알림: ${targetUsers.length}명 식별됨`;
      
      // 템플릿 데이터 구성
      const templateData = {
        campaignName: campaignData.name || '재활성화 캠페인',
        campaignId: campaignData.id || '',
        targetCount: targetUsers.length,
        topUsers: targetUsers.slice(0, 10).map(user => ({
          id: user.userId,
          name: user.userName || `사용자 ${user.userId}`,
          score: user.reactivationScore || 'N/A',
          inactiveDays: user.inactiveDays || 'N/A',
          netBet: user.netBet || 'N/A'
        })),
        timestamp: new Date().toLocaleString('ko-KR')
      };
      
      // 이메일 전송
      return this.sendTemplatedEmail(recipients, 'reactivation-campaign', templateData, {
        subject
      });
    } catch (error) {
      logger.error(`Failed to send reactivation campaign email:`, error);
      throw error;
    }
  }

  /**
   * 이벤트 효과 분석 알림 이메일 전송
   * @param {Object} eventData 이벤트 데이터
   * @param {Object} analysisData 분석 데이터
   * @param {Array<string>} recipients 수신자 배열
   * @return {Promise<Object>} 전송 결과
   */
  async sendEventAnalysisEmail(eventData, analysisData, recipients) {
    try {
      // 이메일 제목
      const subject = `이벤트 효과 분석 결과: ${eventData.eventName || '이벤트'}`;
      
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
      
      // 템플릿 데이터 구성
      const templateData = {
        eventId: eventData.eventId,
        eventName: eventData.eventName || `이벤트 ${eventData.eventId}`,
        startDate: eventData.startDate || 'N/A',
        endDate: eventData.endDate || 'N/A',
        participantCount: analysisData?.participantCount || 0,
        dormantParticipantCount: analysisData?.dormantParticipantCount || 0,
        conversionCount: analysisData?.conversionCount || 0,
        conversionRate: analysisData?.conversionRate || 0,
        performanceEvaluation: performanceEvaluation || '평가 불가',
        timestamp: new Date().toLocaleString('ko-KR')
      };
      
      // 이메일 전송
      return this.sendTemplatedEmail(recipients, 'event-analysis', templateData, {
        subject
      });
    } catch (error) {
      logger.error(`Failed to send event analysis email:`, error);
      throw error;
    }
  }

  /**
   * 정기 분석 보고서 이메일 전송
   * @param {string} reportType 보고서 유형 (daily, weekly, monthly)
   * @param {Object} reportData 보고서 데이터
   * @param {Array<string>} recipients 수신자 배열
   * @return {Promise<Object>} 전송 결과
   */
  async sendAnalyticsReportEmail(reportType, reportData, recipients) {
    try {
      // 이메일 제목 및 템플릿 구성
      let subject = '분석 보고서';
      let templateName = 'analytics-report';
      
      switch (reportType) {
        case 'daily':
          subject = '일일 분석 보고서';
          templateName = 'daily-report';
          break;
        case 'weekly':
          subject = '주간 분석 보고서';
          templateName = 'weekly-report';
          break;
        case 'monthly':
          subject = '월간 분석 보고서';
          templateName = 'monthly-report';
          break;
      }
      
      // 날짜 추가
      const today = new Date();
      const dateStr = today.toLocaleDateString('ko-KR', {
        year: 'numeric',
        month: 'long',
        day: 'numeric'
      });
      
      subject = `${subject} - ${dateStr}`;
      
      // 템플릿 데이터 구성
      const templateData = {
        reportType: this.formatReportType(reportType),
        date: dateStr,
        ...reportData,
        timestamp: today.toLocaleString('ko-KR')
      };
      
      // 이메일 전송
      return this.sendTemplatedEmail(recipients, templateName, templateData, {
        subject
      });
    } catch (error) {
      logger.error(`Failed to send analytics report email:`, error);
      throw error;
    }
  }

  /**
   * 시스템 알림 이메일 전송
   * @param {string} alertType 알림 유형
   * @param {string} message 알림 메시지
   * @param {Object} details 추가 세부 정보
   * @param {Array<string>} recipients 수신자 배열
   * @return {Promise<Object>} 전송 결과
   */
  async sendSystemAlertEmail(alertType, message, details, recipients) {
    try {
      // 이메일 제목
      const subject = `시스템 알림: ${alertType}`;
      
      // 템플릿 데이터 구성
      const templateData = {
        alertType,
        message,
        details: JSON.stringify(details, null, 2),
        timestamp: new Date().toLocaleString('ko-KR')
      };
      
      // 이메일 전송
      return this.sendTemplatedEmail(recipients, 'system-alert', templateData, {
        subject
      });
    } catch (error) {
      logger.error(`Failed to send system alert email:`, error);
      throw error;
    }
  }

  /**
   * 상태 변경 유형 포맷팅
   * @param {string} statusType 상태 변경 유형
   * @return {string} 포맷팅된 문자열
   * @private
   */
  formatStatusType(statusType) {
    switch (statusType) {
      case 'active_to_inactive':
        return '활성 → 비활성';
      case 'inactive_to_active':
        return '비활성 → 활성';
      case 'high_value_risk':
        return '이탈 위험';
      default:
        return statusType;
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
const emailService = new EmailService();

module.exports = {
  emailService
};
