/**
 * Firestore 데이터 모델 및 유틸리티
 * 고가치 사용자 분석 데이터의 Firestore 모델 정의
 */

const admin = require('firebase-admin');

// Firestore 컬렉션 이름
const COLLECTIONS = {
  ANALYTICS_RESULTS: 'analyticsResults',
  HIGH_VALUE_USERS: 'highValueUsers',
  USER_SEGMENTS: 'userSegments',
  EVENTS: 'events',
  EVENT_ANALYTICS: 'eventAnalytics',
  CONVERSION_METRICS: 'conversionMetrics',
};

/**
 * 고가치 사용자 데이터를 Firestore에 저장
 * @param {Array} users 사용자 데이터 배열
 * @param {Object} metadata 메타데이터
 * @return {Promise} 저장 작업 결과
 */
const saveHighValueUsers = async (users, metadata = {}) => {
  try {
    const db = admin.firestore();
    const batch = db.batch();
    const collectionRef = db.collection(COLLECTIONS.HIGH_VALUE_USERS);
    
    // 메타데이터 저장
    const metaRef = db.collection(COLLECTIONS.ANALYTICS_RESULTS).doc('high_value_users');
    batch.set(metaRef, {
      lastUpdated: admin.firestore.FieldValue.serverTimestamp(),
      userCount: users.length,
      ...metadata,
    });
    
    // 사용자 데이터 저장
    users.forEach(user => {
      const docRef = collectionRef.doc(user.userId.toString());
      batch.set(docRef, {
        ...user,
        updatedAt: admin.firestore.FieldValue.serverTimestamp(),
      });
    });
    
    // 배치 커밋
    await batch.commit();
    
    console.log(`Saved ${users.length} high value users to Firestore`);
    return { success: true, count: users.length };
  } catch (error) {
    console.error('Failed to save high value users to Firestore:', error);
    throw error;
  }
};

/**
 * 사용자 세그먼트 분석 결과를 Firestore에 저장
 * @param {Object} segmentData 세그먼트 분석 데이터
 * @return {Promise} 저장 작업 결과
 */
const saveUserSegments = async (segmentData) => {
  try {
    const db = admin.firestore();
    const docRef = db.collection(COLLECTIONS.USER_SEGMENTS).doc('latest');
    
    await docRef.set({
      ...segmentData,
      updatedAt: admin.firestore.FieldValue.serverTimestamp(),
    });
    
    console.log('User segment analysis saved to Firestore');
    return { success: true };
  } catch (error) {
    console.error('Failed to save user segments to Firestore:', error);
    throw error;
  }
};

/**
 * 이벤트 분석 결과를 Firestore에 저장
 * @param {Array} events 이벤트 데이터 배열
 * @param {Object} metadata 메타데이터
 * @return {Promise} 저장 작업 결과
 */
const saveEventAnalytics = async (events, metadata = {}) => {
  try {
    const db = admin.firestore();
    const batch = db.batch();
    const collectionRef = db.collection(COLLECTIONS.EVENT_ANALYTICS);
    
    // 메타데이터 저장
    const metaRef = db.collection(COLLECTIONS.ANALYTICS_RESULTS).doc('events');
    batch.set(metaRef, {
      lastUpdated: admin.firestore.FieldValue.serverTimestamp(),
      eventCount: events.length,
      ...metadata,
    });
    
    // 이벤트 데이터 저장
    events.forEach(event => {
      const docRef = collectionRef.doc(event.eventId.toString());
      batch.set(docRef, {
        ...event,
        updatedAt: admin.firestore.FieldValue.serverTimestamp(),
      });
    });
    
    // 배치 커밋
    await batch.commit();
    
    console.log(`Saved ${events.length} event analytics to Firestore`);
    return { success: true, count: events.length };
  } catch (error) {
    console.error('Failed to save event analytics to Firestore:', error);
    throw error;
  }
};

/**
 * 일일 또는 주간 분석 스냅샷 저장
 * @param {string} analysisType 분석 유형
 * @param {Object} data 분석 데이터
 * @param {string} period 기간 (daily, weekly, monthly)
 * @return {Promise} 저장 작업 결과
 */
const saveAnalyticsSnapshot = async (analysisType, data, period = 'daily') => {
  try {
    const db = admin.firestore();
    
    // 날짜 형식 설정
    const now = new Date();
    const year = now.getFullYear();
    const month = String(now.getMonth() + 1).padStart(2, '0');
    const day = String(now.getDate()).padStart(2, '0');
    
    let docId;
    if (period === 'daily') {
      docId = `${year}-${month}-${day}`;
    } else if (period === 'weekly') {
      // 주의 시작일 계산 (월요일 기준)
      const dayOfWeek = now.getDay(); // 0: 일요일, 1: 월요일, ...
      const diff = dayOfWeek === 0 ? 6 : dayOfWeek - 1; // 월요일이 첫날이 되도록 조정
      const monday = new Date(now);
      monday.setDate(now.getDate() - diff);
      
      const mondayDay = String(monday.getDate()).padStart(2, '0');
      const mondayMonth = String(monday.getMonth() + 1).padStart(2, '0');
      const mondayYear = monday.getFullYear();
      
      docId = `${mondayYear}-${mondayMonth}-${mondayDay}`;
    } else if (period === 'monthly') {
      docId = `${year}-${month}`;
    }
    
    // 컬렉션 경로 설정
    const collectionPath = `${COLLECTIONS.ANALYTICS_RESULTS}/${analysisType}/${period}`;
    
    // 문서 저장
    await db.collection(collectionPath).doc(docId).set({
      ...data,
      period,
      analysisType,
      timestamp: admin.firestore.FieldValue.serverTimestamp(),
    });
    
    console.log(`Saved ${analysisType} ${period} snapshot to Firestore`);
    return { success: true };
  } catch (error) {
    console.error(`Failed to save ${analysisType} ${period} snapshot to Firestore:`, error);
    throw error;
  }
};

/**
 * 전환율 메트릭을 Firestore에 저장
 * @param {Object} conversionData 전환율 데이터
 * @return {Promise} 저장 작업 결과
 */
const saveConversionMetrics = async (conversionData) => {
  try {
    const db = admin.firestore();
    const docRef = db.collection(COLLECTIONS.CONVERSION_METRICS).doc('latest');
    
    await docRef.set({
      ...conversionData,
      updatedAt: admin.firestore.FieldValue.serverTimestamp(),
    });
    
    // 타임시리즈 데이터로도 저장
    const now = new Date();
    const dateStr = now.toISOString().split('T')[0]; // YYYY-MM-DD
    
    const timeseriesRef = db.collection(COLLECTIONS.CONVERSION_METRICS).doc(dateStr);
    await timeseriesRef.set({
      ...conversionData,
      date: dateStr,
      timestamp: admin.firestore.FieldValue.serverTimestamp(),
    });
    
    console.log('Conversion metrics saved to Firestore');
    return { success: true };
  } catch (error) {
    console.error('Failed to save conversion metrics to Firestore:', error);
    throw error;
  }
};

/**
 * 특정 유형의 분석 결과 가져오기
 * @param {string} type 분석 유형
 * @param {string} id 문서 ID (없으면 'latest')
 * @return {Promise<Object>} 분석 결과 데이터
 */
const getAnalyticsResult = async (type, id = 'latest') => {
  try {
    const db = admin.firestore();
    let collectionPath;
    
    switch (type) {
      case 'highValueUsers':
        collectionPath = COLLECTIONS.HIGH_VALUE_USERS;
        break;
      case 'userSegments':
        collectionPath = COLLECTIONS.USER_SEGMENTS;
        break;
      case 'eventAnalytics':
        collectionPath = COLLECTIONS.EVENT_ANALYTICS;
        break;
      case 'conversionMetrics':
        collectionPath = COLLECTIONS.CONVERSION_METRICS;
        break;
      default:
        collectionPath = COLLECTIONS.ANALYTICS_RESULTS;
    }
    
    const docRef = db.collection(collectionPath).doc(id);
    const doc = await docRef.get();
    
    if (!doc.exists) {
      console.warn(`Analytics result ${type}/${id} not found`);
      return null;
    }
    
    return doc.data();
  } catch (error) {
    console.error(`Failed to get analytics result ${type}/${id}:`, error);
    throw error;
  }
};

module.exports = {
  COLLECTIONS,
  saveHighValueUsers,
  saveUserSegments,
  saveEventAnalytics,
  saveAnalyticsSnapshot,
  saveConversionMetrics,
  getAnalyticsResult,
};
