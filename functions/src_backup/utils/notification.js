/**
 * 알림 유틸리티
 * FCM 메시지 및 이메일 전송 기능 제공
 */

const admin = require('firebase-admin');
const functions = require('firebase-functions');
const nodemailer = require('nodemailer');
const { getContextLogger } = require('./logger');

// 로거 초기화
const logger = getContextLogger('notification-utils');

// 환경 설정
const EMAIL_FROM = process.env.EMAIL_FROM || 'noreply@example.com';
const EMAIL_HOST = process.env.EMAIL_HOST || 'smtp.gmail.com';
const EMAIL_PORT = parseInt(process.env.EMAIL_PORT || '587', 10);
const EMAIL_SECURE = process.env.EMAIL_SECURE === 'true';
const EMAIL_USER = process.env.EMAIL_USER;
const EMAIL_PASS = process.env.EMAIL_PASS;

// Nodemailer 트랜스포터 생성
let transporter;

// 이메일 템플릿
const EMAIL_TEMPLATES = {
  'user-dormant-alert': (data) => ({
    subject: `🔴 고가치 사용자 휴면 전환 알림 (${data.totalUsers}명)`,
    text: `
      ${data.date} 기준으로 ${data.totalUsers}명의 고가치 사용자가 활성 상태에서 휴면 상태로 전환되었습니다.
      
      ${data.users.map(user => `
      - ${user.userName} (ID: ${user.userId}): 
        순 베팅액: ${user.netBet}원
        마지막 활동: ${user.lastActivity}
        휴면 일수: ${user.inactiveDays}일
      `).join('\n')}
      ${data.totalUsers > data.users.length ? `\n...외 ${data.totalUsers - data.users.length}명` : ''}
      
      자세한 내용은 대시보드에서 확인하세요:
      ${data.dashboardUrl}
    `.trim(),
    html: `
      <h2>고가치 사용자 휴면 전환 알림</h2>
      <p>${data.date} 기준으로 <strong>${data.totalUsers}명</strong>의 고가치 사용자가 활성 상태에서 휴면 상태로 전환되었습니다.</p>
      
      <table border="1" cellpadding="5" cellspacing="0" style="border-collapse: collapse; width: 100%;">
        <tr style="background-color: #f0f0f0;">
          <th>사용자</th>
          <th>순 베팅액</th>
          <th>마지막 활동</th>
          <th>휴면 일수</th>
        </tr>
        ${data.users.map(user => `
        <tr>
          <td>${user.userName} (ID: ${user.userId})</td>
          <td style="text-align: right;">${user.netBet}원</td>
          <td>${user.lastActivity}</td>
          <td style="text-align: right;">${user.inactiveDays}일</td>
        </tr>
        `).join('')}
      </table>
      
      ${data.totalUsers > data.users.length ? `<p>...외 ${data.totalUsers - data.users.length}명</p>` : ''}
      
      <p>자세한 내용은 <a href="${data.dashboardUrl}">대시보드</a>에서 확인하세요.</p>
    `
  }),
  
  'user-activated-alert': (data) => ({
    subject: `🟢 고가치 사용자 활성화 알림 (${data.totalUsers}명)`,
    text: `
      ${data.date} 기준으로 ${data.totalUsers}명의 고가치 사용자가 휴면 상태에서 활성 상태로 전환되었습니다.
      
      ${data.users.map(user => `
      - ${user.userName} (ID: ${user.userId}): 
        순 베팅액: ${user.netBet}원
        마지막 활동: ${user.lastActivity}
        이전 휴면 일수: ${user.inactiveDays}일
      `).join('\n')}
      ${data.totalUsers > data.users.length ? `\n...외 ${data.totalUsers - data.users.length}명` : ''}
      
      자세한 내용은 대시보드에서 확인하세요:
      ${data.dashboardUrl}
    `.trim(),
    html: `
      <h2>고가치 사용자 활성화 알림</h2>
      <p>${data.date} 기준으로 <strong>${data.totalUsers}명</strong>의 고가치 사용자가 휴면 상태에서 활성 상태로 전환되었습니다.</p>
      
      <table border="1" cellpadding="5" cellspacing="0" style="border-collapse: collapse; width: 100%;">
        <tr style="background-color: #f0f0f0;">
          <th>사용자</th>
          <th>순 베팅액</th>
          <th>마지막 활동</th>
          <th>이전 휴면 일수</th>
        </tr>
        ${data.users.map(user => `
        <tr>
          <td>${user.userName} (ID: ${user.userId})</td>
          <td style="text-align: right;">${user.netBet}원</td>
          <td>${user.lastActivity}</td>
          <td style="text-align: right;">${user.inactiveDays}일</td>
        </tr>
        `).join('')}
      </table>
      
      ${data.totalUsers > data.users.length ? `<p>...외 ${data.totalUsers - data.users.length}명</p>` : ''}
      
      <p>자세한 내용은 <a href="${data.dashboardUrl}">대시보드</a>에서 확인하세요.</p>
    `
  }),
  
  'new-high-value-user-alert': (data) => ({
    subject: `✨ 신규 고가치 사용자 알림 (${data.totalUsers}명)`,
    text: `
      ${data.date} 기준으로 ${data.totalUsers}명의 신규 고가치 사용자가 발견되었습니다.
      
      ${data.users.map(user => `
      - ${user.userName} (ID: ${user.userId}): 
        순 베팅액: ${user.netBet}원
        마지막 활동: ${user.lastActivity}
        휴면 일수: ${user.inactiveDays}일
      `).join('\n')}
      ${data.totalUsers > data.users.length ? `\n...외 ${data.totalUsers - data.users.length}명` : ''}
      
      자세한 내용은 대시보드에서 확인하세요:
      ${data.dashboardUrl}
    `.trim(),
    html: `
      <h2>신규 고가치 사용자 알림</h2>
      <p>${data.date} 기준으로 <strong>${data.totalUsers}명</strong>의 신규 고가치 사용자가 발견되었습니다.</p>
      
      <table border="1" cellpadding="5" cellspacing="0" style="border-collapse: collapse; width: 100%;">
        <tr style="background-color: #f0f0f0;">
          <th>사용자</th>
          <th>순 베팅액</th>
          <th>마지막 활동</th>
          <th>휴면 일수</th>
        </tr>
        ${data.users.map(user => `
        <tr>
          <td>${user.userName} (ID: ${user.userId})</td>
          <td style="text-align: right;">${user.netBet}원</td>
          <td>${user.lastActivity}</td>
          <td style="text-align: right;">${user.inactiveDays}일</td>
        </tr>
        `).join('')}
      </table>
      
      ${data.totalUsers > data.users.length ? `<p>...외 ${data.totalUsers - data.users.length}명</p>` : ''}
      
      <p>자세한 내용은 <a href="${data.dashboardUrl}">대시보드</a>에서 확인하세요.</p>
    `
  }),
  
  'reactivation-campaign-report': (data) => ({
    subject: `📊 재활성화 캠페인 대상자 보고서 (${data.totalTargets}명)`,
    text: `
      ${data.date} 기준으로 추출된 재활성화 캠페인 대상자 보고서입니다.
      
      총 대상자 수: ${data.totalTargets}명
      
      세그먼트별 요약:
      - Platinum: ${data.segments.platinum.count}명 (평균 베팅액: ${data.segments.platinum.avgBet}원, 평균 휴면일: ${data.segments.platinum.avgInactiveDays}일)
      - Gold: ${data.segments.gold.count}명 (평균 베팅액: ${data.segments.gold.avgBet}원, 평균 휴면일: ${data.segments.gold.avgInactiveDays}일)
      - Silver: ${data.segments.silver.count}명 (평균 베팅액: ${data.segments.silver.avgBet}원, 평균 휴면일: ${data.segments.silver.avgInactiveDays}일)
      - Bronze: ${data.segments.bronze.count}명 (평균 베팅액: ${data.segments.bronze.avgBet}원, 평균 휴면일: ${data.segments.bronze.avgInactiveDays}일)
      
      상위 대상자:
      ${data.topTargets.map(user => `
      - ${user.userName} (ID: ${user.userId}): 
        세그먼트: ${user.segment}
        가치 점수: ${user.valueScore}
        순 베팅액: ${user.netBet}원
        휴면 일수: ${user.inactiveDays}일
      `).join('\n')}
      
      자세한 내용은 대시보드에서 확인하세요:
      ${data.dashboardUrl}
    `.trim(),
    html: `
      <h2>재활성화 캠페인 대상자 보고서</h2>
      <p>${data.date} 기준으로 추출된 <strong>${data.totalTargets}명</strong>의 재활성화 캠페인 대상�� 보고서입니다.</p>
      
      <h3>세그먼트별 요약</h3>
      <table border="1" cellpadding="5" cellspacing="0" style="border-collapse: collapse; width: 100%;">
        <tr style="background-color: #f0f0f0;">
          <th>세그먼트</th>
          <th>대상자 수</th>
          <th>평균 베팅액</th>
          <th>평균 휴면일</th>
        </tr>
        <tr>
          <td><strong style="color: #8B00FF;">Platinum</strong></td>
          <td style="text-align: right;">${data.segments.platinum.count}명</td>
          <td style="text-align: right;">${data.segments.platinum.avgBet}원</td>
          <td style="text-align: right;">${data.segments.platinum.avgInactiveDays}일</td>
        </tr>
        <tr>
          <td><strong style="color: #DAA520;">Gold</strong></td>
          <td style="text-align: right;">${data.segments.gold.count}명</td>
          <td style="text-align: right;">${data.segments.gold.avgBet}원</td>
          <td style="text-align: right;">${data.segments.gold.avgInactiveDays}일</td>
        </tr>
        <tr>
          <td><strong style="color: #C0C0C0;">Silver</strong></td>
          <td style="text-align: right;">${data.segments.silver.count}명</td>
          <td style="text-align: right;">${data.segments.silver.avgBet}원</td>
          <td style="text-align: right;">${data.segments.silver.avgInactiveDays}일</td>
        </tr>
        <tr>
          <td><strong style="color: #CD7F32;">Bronze</strong></td>
          <td style="text-align: right;">${data.segments.bronze.count}명</td>
          <td style="text-align: right;">${data.segments.bronze.avgBet}원</td>
          <td style="text-align: right;">${data.segments.bronze.avgInactiveDays}일</td>
        </tr>
      </table>
      
      <h3>상위 대상자</h3>
      <table border="1" cellpadding="5" cellspacing="0" style="border-collapse: collapse; width: 100%;">
        <tr style="background-color: #f0f0f0;">
          <th>사용자</th>
          <th>세그먼트</th>
          <th>가치 점수</th>
          <th>순 베팅액</th>
          <th>휴면 일수</th>
        </tr>
        ${data.topTargets.map(user => `
        <tr>
          <td>${user.userName} (ID: ${user.userId})</td>
          <td><strong style="color: ${
            user.segment === 'platinum' ? '#8B00FF' :
            user.segment === 'gold' ? '#DAA520' :
            user.segment === 'silver' ? '#C0C0C0' :
            '#CD7F32'
          };">${user.segment}</strong></td>
          <td style="text-align: right;">${user.valueScore}</td>
          <td style="text-align: right;">${user.netBet}원</td>
          <td style="text-align: right;">${user.inactiveDays}일</td>
        </tr>
        `).join('')}
      </table>
      
      <p>자세한 내용은 <a href="${data.dashboardUrl}">대시보드</a>에서 확인하세요.</p>
    `
  })
};

/**
 * FCM 알림 전송
 * @param {string} topic 토픽 또는 토큰
 * @param {Object} payload 알림 페이로드
 * @return {Promise} 전송 결과
 */
const sendNotification = async (topic, payload) => {
  try {
    logger.info(`Sending notification to topic: ${topic}`);
    
    // 토픽에 '/topics/'가 없으면 추가
    const actualTopic = topic.startsWith('/topics/') ? topic : `/topics/${topic}`;
    
    // FCM 메시지 전송
    const response = await admin.messaging().send({
      topic: actualTopic.replace('/topics/', ''), // FCM API에서는 '/topics/'를 제거한 형태로 전송
      ...payload
    });
    
    logger.info(`Successfully sent notification: ${response}`);
    return { success: true, messageId: response };
  } catch (error) {
    logger.error(`Error sending notification to topic ${topic}:`, error);
    throw error;
  }
};

/**
 * 이메일 전송
 * @param {Array|string} recipients 수신자 이메일 또는 배열
 * @param {string} subject 이메일 제목
 * @param {string} templateName 이메일 템플릿 이름
 * @param {Object} data 템플릿 데이터
 * @return {Promise} 전송 결과
 */
const sendEmail = async (recipients, subject, templateName, data) => {
  try {
    // 템플릿 조회
    const template = EMAIL_TEMPLATES[templateName];
    if (!template) {
      throw new Error(`Email template not found: ${templateName}`);
    }
    
    // 수신자 배열 변환
    const to = Array.isArray(recipients) ? recipients.join(', ') : recipients;
    
    // 템플릿 렌더링
    const rendered = template(data);
    
    // Nodemailer 트랜스포터 초기화 (최초 1회)
    if (!transporter && EMAIL_USER && EMAIL_PASS) {
      transporter = nodemailer.createTransport({
        host: EMAIL_HOST,
        port: EMAIL_PORT,
        secure: EMAIL_SECURE,
        auth: {
          user: EMAIL_USER,
          pass: EMAIL_PASS
        }
      });
    }
    
    // 이메일 전송
    if (transporter) {
      logger.info(`Sending email to ${to}`);
      
      const result = await transporter.sendMail({
        from: EMAIL_FROM,
        to,
        subject: rendered.subject || subject,
        text: rendered.text,
        html: rendered.html
      });
      
      logger.info(`Email sent: ${result.messageId}`);
      return { success: true, messageId: result.messageId };
    } else {
      // Firebase 이메일 확장 사용 시
      logger.info(`Using Firebase Extensions to send email to ${to}`);
      
      // Firestore에 이메일 요청 저장
      const db = admin.firestore();
      const emailRef = await db.collection('mail').add({
        to,
        message: {
          subject: rendered.subject || subject,
          html: rendered.html,
          text: rendered.text
        },
        template: templateName,
        timestamp: admin.firestore.FieldValue.serverTimestamp()
      });
      
      logger.info(`Email request created: ${emailRef.id}`);
      return { success: true, requestId: emailRef.id };
    }
  } catch (error) {
    logger.error(`Error sending email to ${recipients}:`, error);
    throw error;
  }
};

module.exports = {
  sendNotification,
  sendEmail
};
