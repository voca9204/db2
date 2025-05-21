/**
 * 고가치 사용자 상태 모니터링 및 알림 시스템
 * 사용자 상태 변경 감지 및 알림 트리거
 */

const admin = require('firebase-admin');
const { executeQuery } = require('../../db');
const { getContextLogger } = require('../utils/logger');
const { sendNotification, sendEmail } = require('../utils/notification');

// 로거 초기화
const logger = getContextLogger('user-state-monitor');

/**
 * 고가치 사용자 상태 변경 모니터링
 * 활성->휴면, 휴면->활성 상태 변경 감지 및 알림 처리
 * @param {Object} context Cloud Functions 실행 컨텍스트
 * @return {Promise} 작업 실행 결과
 */
const monitorUserStateChanges = async (context) => {
  try {
    logger.info('Starting high value user state monitoring:', new Date().toISOString());
    
    // 작업 시작 기록
    const jobRef = admin.firestore().collection('analyticsJobs').doc();
    await jobRef.set({
      jobType: 'userStateMonitoring',
      status: 'running',
      startTime: admin.firestore.FieldValue.serverTimestamp(),
      parameters: {
        minNetBet: 50000,
        minPlayDays: 7,
        inactiveDaysThreshold: 30
      },
      createdAt: admin.firestore.FieldValue.serverTimestamp(),
    });
    
    // 이전 상태 데이터 로드 (Firestore에서)
    const db = admin.firestore();
    const prevStateDoc = await db.collection('userStateMonitoring').doc('prevState').get();
    
    // 이전 상태가 없으면 새로 생성
    const prevUserStates = prevStateDoc.exists ? prevStateDoc.data().userStates || {} : {};
    
    // 현재 고가치 사용자 상태 조회
    const currentUsersQuery = `
      SELECT 
        u.id as userId,
        u.username as userName,
        u.email,
        COUNT(DISTINCT g.date) as playDays,
        SUM(g.net_bet) as netBet,
        MAX(g.date) as lastActivity,
        DATEDIFF(CURRENT_DATE, MAX(g.date)) as inactiveDays,
        CASE 
          WHEN DATEDIFF(CURRENT_DATE, MAX(g.date)) <= 30 THEN 'active'
          ELSE 'dormant'
        END as userState
      FROM users u
      JOIN game_logs g ON u.id = g.user_id
      GROUP BY u.id, u.username, u.email
      HAVING 
        playDays >= 7 
        AND netBet >= 50000
      ORDER BY userState, netBet DESC
    `;
    
    const currentUsers = await executeQuery(currentUsersQuery);
    logger.info(`Found ${currentUsers.length} high value users`);
    
    // 상태 변경 감지
    const stateChanges = {
      activeToDormant: [], // 활성 -> 휴면 변경
      dormantToActive: [], // 휴면 -> 활성 변경
      newHighValue: []     // 새로운 고가치 사용자
    };
    
    // 현재 사용자 상태 맵 구성
    const currentUserStates = {};
    
    for (const user of currentUsers) {
      const userId = user.userId.toString();
      currentUserStates[userId] = user.userState;
      
      // 이전 상태가 있는 경우 비교
      if (prevUserStates[userId]) {
        const prevState = prevUserStates[userId];
        
        // 활성 -> 휴면 변경
        if (prevState === 'active' && user.userState === 'dormant') {
          stateChanges.activeToDormant.push({
            ...user,
            previousState: prevState,
            inactiveSinceDays: user.inactiveDays
          });
        }
        
        // 휴면 -> 활성 변경
        else if (prevState === 'dormant' && user.userState === 'active') {
          stateChanges.dormantToActive.push({
            ...user,
            previousState: prevState
          });
        }
      } else {
        // 새로운 고가치 사용자 (이전에 없었음)
        stateChanges.newHighValue.push(user);
      }
    }
    
    logger.info(`Detected state changes:`, {
      activeToDormant: stateChanges.activeToDormant.length,
      dormantToActive: stateChanges.dormantToActive.length,
      newHighValue: stateChanges.newHighValue.length
    });
    
    // 상태 변경이 있는 경우 알림 전송
    if (stateChanges.activeToDormant.length > 0) {
      await sendUserStateChangeNotifications('activeToDormant', stateChanges.activeToDormant);
    }
    
    if (stateChanges.dormantToActive.length > 0) {
      await sendUserStateChangeNotifications('dormantToActive', stateChanges.dormantToActive);
    }
    
    if (stateChanges.newHighValue.length > 0) {
      await sendUserStateChangeNotifications('newHighValue', stateChanges.newHighValue);
    }
    
    // 현재 상태를 Firestore에 저장 (다음 비교를 위해)
    await db.collection('userStateMonitoring').doc('prevState').set({
      userStates: currentUserStates,
      updatedAt: admin.firestore.FieldValue.serverTimestamp(),
      userCount: Object.keys(currentUserStates).length
    });
    
    // 상태 변경 로그 저장
    const timestamp = new Date().toISOString().split('T')[0]; // YYYY-MM-DD
    await db.collection('userStateChanges').doc(timestamp).set({
      date: timestamp,
      changes: {
        activeToDormant: stateChanges.activeToDormant.map(u => ({
          userId: u.userId,
          userName: u.userName,
          inactiveDays: u.inactiveDays,
          netBet: u.netBet
        })),
        dormantToActive: stateChanges.dormantToActive.map(u => ({
          userId: u.userId,
          userName: u.userName,
          inactiveDays: u.inactiveDays,
          netBet: u.netBet
        })),
        newHighValue: stateChanges.newHighValue.map(u => ({
          userId: u.userId,
          userName: u.userName,
          inactiveDays: u.inactiveDays,
          netBet: u.netBet
        }))
      },
      summary: {
        activeToDormantCount: stateChanges.activeToDormant.length,
        dormantToActiveCount: stateChanges.dormantToActive.length,
        newHighValueCount: stateChanges.newHighValue.length
      },
      timestamp: admin.firestore.FieldValue.serverTimestamp()
    });
    
    // 작업 완료 기록
    await jobRef.update({
      status: 'completed',
      endTime: admin.firestore.FieldValue.serverTimestamp(),
      resultSummary: {
        activeToDormantCount: stateChanges.activeToDormant.length,
        dormantToActiveCount: stateChanges.dormantToActive.length,
        newHighValueCount: stateChanges.newHighValue.length,
        totalProcessed: currentUsers.length
      }
    });
    
    logger.info('High value user state monitoring completed successfully');
    return {
      success: true,
      changes: {
        activeToDormant: stateChanges.activeToDormant.length,
        dormantToActive: stateChanges.dormantToActive.length,
        newHighValue: stateChanges.newHighValue.length
      }
    };
  } catch (error) {
    logger.error('High value user state monitoring failed:', error);
    
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
 * 사용자 상태 변경 알림 전송
 * @param {string} changeType 변경 유형 (activeToDormant, dormantToActive, newHighValue)
 * @param {Array} users 사용자 목록
 * @return {Promise} 알림 전송 결과
 */
const sendUserStateChangeNotifications = async (changeType, users) => {
  try {
    if (!users || users.length === 0) return;
    
    // 알림 메시지 구성
    let title, body, emailSubject, emailTemplate;
    
    switch (changeType) {
      case 'activeToDormant':
        title = '고가치 사용자 휴면 전환 알림';
        body = `${users.length}명의 고가치 사용자가 활성 상태에서 휴면 상태로 전환되었습니다.`;
        emailSubject = '�� 고가치 사용자 휴면 전환 알림';
        emailTemplate = 'user-dormant-alert';
        break;
      case 'dormantToActive':
        title = '고가치 사용자 활성화 알림';
        body = `${users.length}명의 고가치 사용자가 휴면 상태에서 활성 상태로 전환되었습니다.`;
        emailSubject = '🟢 고가치 사용자 활성화 알림';
        emailTemplate = 'user-activated-alert';
        break;
      case 'newHighValue':
        title = '신규 고가치 사용자 알림';
        body = `${users.length}명의 신규 고가치 사용자가 발견되었습니다.`;
        emailSubject = '✨ 신규 고가치 사용자 알림';
        emailTemplate = 'new-high-value-user-alert';
        break;
      default:
        throw new Error(`Unknown change type: ${changeType}`);
    }
    
    // FCM 토픽 알림 전송
    await sendNotification('high_value_users', {
      notification: {
        title,
        body
      },
      data: {
        type: changeType,
        count: users.length.toString(),
        timestamp: new Date().toISOString(),
        click_action: 'OPEN_HIGH_VALUE_USERS_DASHBOARD'
      }
    });
    
    // 관리자 이메일 조회 및 전송
    const db = admin.firestore();
    const adminUsersSnapshot = await db.collection('users')
      .where('roles', 'array-contains', 'admin')
      .where('notifications.email', '==', true)
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
        // 이메일 데이터 구성
        const emailData = {
          users: users.map(user => ({
            userName: user.userName,
            userId: user.userId,
            netBet: user.netBet.toLocaleString(),
            inactiveDays: user.inactiveDays,
            lastActivity: user.lastActivity
          })).slice(0, 20), // 최대 20명만 포함
          totalUsers: users.length,
          date: new Date().toISOString().split('T')[0],
          dashboardUrl: process.env.DASHBOARD_URL || 'https://dashboard.example.com'
        };
        
        // 이메일 전송
        await sendEmail(adminEmails, emailSubject, emailTemplate, emailData);
      }
    }
    
    // Firestore에 알림 기록 저장
    await db.collection('notifications').add({
      type: 'userStateChange',
      changeType,
      title,
      body,
      userCount: users.length,
      timestamp: admin.firestore.FieldValue.serverTimestamp(),
      read: false
    });
    
    logger.info(`Sent ${changeType} notifications for ${users.length} users`);
    return { success: true };
  } catch (error) {
    logger.error(`Failed to send ${changeType} notifications:`, error);
    throw error;
  }
};

/**
 * 재활성화 캠페인 대상 사용자 추출
 * @param {Object} options 옵션
 * @return {Promise} 추출 결과
 */
const extractReactivationTargets = async (options = {}) => {
  try {
    logger.info('Extracting reactivation campaign targets:', options);
    
    const {
      minNetBet = 50000,
      minInactiveDays = 30,
      maxInactiveDays = 180,
      minPlayDays = 7,
      limit = 1000
    } = options;
    
    // 재활성화 타겟 쿼리
    const reactivationTargetsQuery = `
      SELECT 
        u.id as userId,
        u.username as userName,
        u.email,
        COUNT(DISTINCT g.date) as playDays,
        SUM(g.net_bet) as netBet,
        MAX(g.date) as lastActivity,
        DATEDIFF(CURRENT_DATE, MAX(g.date)) as inactiveDays,
        (netBet / playDays) as avgBetPerDay,
        (SELECT COUNT(*) FROM deposits d WHERE d.user_id = u.id) as depositCount,
        (SELECT SUM(amount) FROM deposits d WHERE d.user_id = u.id) as totalDeposits
      FROM users u
      JOIN game_logs g ON u.id = g.user_id
      WHERE u.email IS NOT NULL
      GROUP BY u.id, u.username, u.email
      HAVING 
        playDays >= ${minPlayDays}
        AND netBet >= ${minNetBet}
        AND inactiveDays >= ${minInactiveDays}
        AND inactiveDays <= ${maxInactiveDays}
      ORDER BY 
        netBet DESC, 
        inactiveDays ASC
      LIMIT ${limit}
    `;
    
    const targets = await executeQuery(reactivationTargetsQuery);
    logger.info(`Found ${targets.length} reactivation campaign targets`);
    
    // 가치 점수 계산 및 세그먼트 지정
    const scoredTargets = targets.map(user => {
      // 가치 점수 계산 (높을수록 가치 있는 사용자)
      const netBetScore = Math.min(user.netBet / 100000, 5); // 최대 5점
      const playDaysScore = Math.min(user.playDays / 20, 3); // 최대 3점
      const recencyScore = Math.max(0, 5 - user.inactiveDays / 30); // 최대 5점 (최근일수록 높음)
      const depositScore = Math.min(user.depositCount / 3, 2); // 최대 2점
      
      const valueScore = netBetScore + playDaysScore + recencyScore + depositScore;
      
      // 세그먼트 지정
      let segment;
      if (valueScore >= 12) {
        segment = 'platinum';
      } else if (valueScore >= 9) {
        segment = 'gold';
      } else if (valueScore >= 6) {
        segment = 'silver';
      } else {
        segment = 'bronze';
      }
      
      return {
        ...user,
        valueScore: parseFloat(valueScore.toFixed(2)),
        segment
      };
    });
    
    // Firestore에 저장
    const db = admin.firestore();
    const batch = db.batch();
    
    // 메타데이터
    const metaRef = db.collection('reactivationCampaigns').doc('latest');
    batch.set(metaRef, {
      timestamp: admin.firestore.FieldValue.serverTimestamp(),
      targetCount: scoredTargets.length,
      criteria: {
        minNetBet,
        minInactiveDays,
        maxInactiveDays,
        minPlayDays
      },
      segments: {
        platinum: scoredTargets.filter(u => u.segment === 'platinum').length,
        gold: scoredTargets.filter(u => u.segment === 'gold').length,
        silver: scoredTargets.filter(u => u.segment === 'silver').length,
        bronze: scoredTargets.filter(u => u.segment === 'bronze').length
      }
    });
    
    // 날짜 기반 버전으로도 저장
    const dateStr = new Date().toISOString().split('T')[0];
    const dateRef = db.collection('reactivationCampaigns').doc(dateStr);
    batch.set(dateRef, {
      date: dateStr,
      timestamp: admin.firestore.FieldValue.serverTimestamp(),
      targetCount: scoredTargets.length,
      criteria: {
        minNetBet,
        minInactiveDays,
        maxInactiveDays,
        minPlayDays
      },
      segments: {
        platinum: scoredTargets.filter(u => u.segment === 'platinum').length,
        gold: scoredTargets.filter(u => u.segment === 'gold').length,
        silver: scoredTargets.filter(u => u.segment === 'silver').length,
        bronze: scoredTargets.filter(u => u.segment === 'bronze').length
      }
    });
    
    // 개별 타겟 저장 (최대 100명까지만 배치로 처리)
    const targetsToSave = scoredTargets.slice(0, 100);
    
    for (const target of targetsToSave) {
      const targetRef = db.collection('reactivationCampaigns')
        .doc(dateStr)
        .collection('targets')
        .doc(target.userId.toString());
      
      batch.set(targetRef, {
        ...target,
        extractedAt: admin.firestore.FieldValue.serverTimestamp()
      });
    }
    
    // 배치 커밋
    await batch.commit();
    
    // 나머지 타겟 저장 (100명 초과인 경우)
    if (scoredTargets.length > 100) {
      logger.info(`Saving additional ${scoredTargets.length - 100} targets...`);
      
      // 100명씩 나눠서 저장
      for (let i = 100; i < scoredTargets.length; i += 100) {
        const batchSlice = db.batch();
        const sliceTargets = scoredTargets.slice(i, i + 100);
        
        for (const target of sliceTargets) {
          const targetRef = db.collection('reactivationCampaigns')
            .doc(dateStr)
            .collection('targets')
            .doc(target.userId.toString());
          
          batchSlice.set(targetRef, {
            ...target,
            extractedAt: admin.firestore.FieldValue.serverTimestamp()
          });
        }
        
        await batchSlice.commit();
      }
    }
    
    // 세그먼트별 요약 계산
    const segmentSummary = {
      platinum: {
        count: scoredTargets.filter(u => u.segment === 'platinum').length,
        avgNetBet: calculateAverage(
          scoredTargets.filter(u => u.segment === 'platinum'),
          'netBet'
        ),
        avgInactiveDays: calculateAverage(
          scoredTargets.filter(u => u.segment === 'platinum'),
          'inactiveDays'
        )
      },
      gold: {
        count: scoredTargets.filter(u => u.segment === 'gold').length,
        avgNetBet: calculateAverage(
          scoredTargets.filter(u => u.segment === 'gold'),
          'netBet'
        ),
        avgInactiveDays: calculateAverage(
          scoredTargets.filter(u => u.segment === 'gold'),
          'inactiveDays'
        )
      },
      silver: {
        count: scoredTargets.filter(u => u.segment === 'silver').length,
        avgNetBet: calculateAverage(
          scoredTargets.filter(u => u.segment === 'silver'),
          'netBet'
        ),
        avgInactiveDays: calculateAverage(
          scoredTargets.filter(u => u.segment === 'silver'),
          'inactiveDays'
        )
      },
      bronze: {
        count: scoredTargets.filter(u => u.segment === 'bronze').length,
        avgNetBet: calculateAverage(
          scoredTargets.filter(u => u.segment === 'bronze'),
          'netBet'
        ),
        avgInactiveDays: calculateAverage(
          scoredTargets.filter(u => u.segment === 'bronze'),
          'inactiveDays'
        )
      }
    };
    
    logger.info('Successfully extracted and saved reactivation campaign targets');
    
    return {
      success: true,
      totalTargets: scoredTargets.length,
      segmentSummary,
      topTargets: scoredTargets.slice(0, 10) // 상위 10명만 반환
    };
  } catch (error) {
    logger.error('Failed to extract reactivation targets:', error);
    throw error;
  }
};

/**
 * 평균 계산 헬퍼 함수
 * @param {Array} array 배열
 * @param {string} field 필드명
 * @return {number} 평균값
 */
const calculateAverage = (array, field) => {
  if (!array.length) return 0;
  const sum = array.reduce((acc, curr) => acc + curr[field], 0);
  return parseFloat((sum / array.length).toFixed(2));
};

module.exports = {
  monitorUserStateChanges,
  extractReactivationTargets
};
