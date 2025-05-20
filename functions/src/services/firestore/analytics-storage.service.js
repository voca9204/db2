/**
 * Analytics Storage Service
 * 
 * Firestore를 사용하여 분석 결과를 저장하고 관리하는 서비스 모듈
 * - 고가치 사용자 분석 결과 저장
 * - 이벤트 분석 결과 저장
 * - 정기적인 분석 결과 스냅샷 관리
 * - 실시간 데이터 업데이트 처리
 */

const { getFirestore, admin } = require('../../firebase/admin');
const { getContextLogger } = require('../../utils/logger');
const FirestoreRepository = require('../../database/repositories/firestore.repository');
const { COLLECTIONS } = require('../../models/firestore');

// 분석 결과 저장소 컬렉션명
const ANALYTICS_COLLECTION = 'analyticsResults';
const HIGH_VALUE_USERS_COLLECTION = 'highValueUsers';
const EVENT_ANALYTICS_COLLECTION = 'eventAnalytics';
const USER_SEGMENTS_COLLECTION = 'userSegments';
const CONVERSION_METRICS_COLLECTION = 'conversionMetrics';

// 로거 초기화
const logger = getContextLogger('analytics-storage');

/**
 * 기본 분석 결과 저장소 클래스
 */
class AnalyticsStorageService {
  /**
   * 생성자
   */
  constructor() {
    this.db = getFirestore();
    this.highValueUsersRepo = new FirestoreRepository(HIGH_VALUE_USERS_COLLECTION);
    this.eventAnalyticsRepo = new FirestoreRepository(EVENT_ANALYTICS_COLLECTION);
    this.userSegmentsRepo = new FirestoreRepository(USER_SEGMENTS_COLLECTION);
    this.conversionMetricsRepo = new FirestoreRepository(CONVERSION_METRICS_COLLECTION);
    this.analyticsRepo = new FirestoreRepository(ANALYTICS_COLLECTION);
  }

  /**
   * 고가치 사용자 분석 결과 저장
   * @param {Array} users 사용자 데이터 배열
   * @param {Object} metadata 메타데이터
   * @return {Promise<Object>} 저장 결과
   */
  async saveHighValueUsers(users, metadata = {}) {
    try {
      const batch = this.db.batch();
      
      // 메타데이터 저장
      const metaRef = this.db.collection(ANALYTICS_COLLECTION).doc('high_value_users');
      const metaData = {
        lastUpdated: admin.firestore.FieldValue.serverTimestamp(),
        userCount: users.length,
        ...metadata
      };
      batch.set(metaRef, metaData);
      
      // 사용자 데이터 저장 (배치 처리)
      const batchSize = 500; // Firestore 배치 최대 크기
      let processedCount = 0;
      
      // 500개씩 나누어 처리
      for (let i = 0; i < users.length; i += batchSize) {
        const currentBatch = this.db.batch();
        const currentUsers = users.slice(i, i + batchSize);
        
        // 각 사용자 데이터 처리
        for (const user of currentUsers) {
          const docRef = this.db.collection(HIGH_VALUE_USERS_COLLECTION).doc(user.userId.toString());
          currentBatch.set(docRef, {
            ...user,
            updatedAt: admin.firestore.FieldValue.serverTimestamp()
          });
        }
        
        // 현재 배치 커밋
        await currentBatch.commit();
        processedCount += currentUsers.length;
        logger.info(`Processed ${processedCount}/${users.length} high value users`);
      }
      
      // 메타데이터 배치 커밋
      await batch.commit();
      
      logger.info(`Successfully saved ${users.length} high value users to Firestore`);
      
      // 스냅샷 생성 (별도의 비동기 처리로 응답 지연 방지)
      this.createDailySnapshot('highValueUsers', {
        userCount: users.length,
        metadata,
        timestamp: new Date().toISOString()
      }).catch(error => {
        logger.error('Failed to create daily snapshot:', error);
      });
      
      return {
        success: true,
        count: users.length,
        metadata: metaData
      };
    } catch (error) {
      logger.error('Failed to save high value users to Firestore:', error);
      throw error;
    }
  }

  /**
   * 사용자 세그먼트 분석 결과 저장
   * @param {Object} segmentData 세그먼트 분석 데이터
   * @return {Promise<Object>} 저장 결과
   */
  async saveUserSegments(segmentData) {
    try {
      // 최신 분석 결과 저장
      const latestRef = this.db.collection(USER_SEGMENTS_COLLECTION).doc('latest');
      await latestRef.set({
        ...segmentData,
        updatedAt: admin.firestore.FieldValue.serverTimestamp()
      });
      
      // 타임스탬프 기반 문서 ID 생성 (보존용)
      const timestamp = new Date();
      const docId = timestamp.toISOString().split('T')[0]; // YYYY-MM-DD
      
      // 타임시리즈 데이터로도 저장
      const timeseriesRef = this.db.collection(USER_SEGMENTS_COLLECTION).doc(docId);
      await timeseriesRef.set({
        ...segmentData,
        date: docId,
        timestamp: admin.firestore.FieldValue.serverTimestamp()
      });
      
      logger.info(`Successfully saved user segment analysis to Firestore with ID ${docId}`);
      
      return {
        success: true,
        docId
      };
    } catch (error) {
      logger.error('Failed to save user segments to Firestore:', error);
      throw error;
    }
  }

  /**
   * 이벤트 분석 결과 저장
   * @param {Array} events 이벤트 데이터 배열
   * @param {Object} metadata 메타데이터
   * @return {Promise<Object>} 저장 결과
   */
  async saveEventAnalytics(events, metadata = {}) {
    try {
      const batch = this.db.batch();
      
      // 메타데이터 저장
      const metaRef = this.db.collection(ANALYTICS_COLLECTION).doc('events');
      const metaData = {
        lastUpdated: admin.firestore.FieldValue.serverTimestamp(),
        eventCount: events.length,
        ...metadata
      };
      batch.set(metaRef, metaData);
      
      // 이벤트 데이터 저장 (배치 처리)
      const batchSize = 500; // Firestore 배치 최대 크기
      let processedCount = 0;
      
      // 500개씩 나누어 처리
      for (let i = 0; i < events.length; i += batchSize) {
        const currentBatch = this.db.batch();
        const currentEvents = events.slice(i, i + batchSize);
        
        // 각 이벤트 데이터 처리
        for (const event of currentEvents) {
          const docRef = this.db.collection(EVENT_ANALYTICS_COLLECTION).doc(event.eventId.toString());
          currentBatch.set(docRef, {
            ...event,
            updatedAt: admin.firestore.FieldValue.serverTimestamp()
          });
        }
        
        // 현재 배치 커밋
        await currentBatch.commit();
        processedCount += currentEvents.length;
        logger.info(`Processed ${processedCount}/${events.length} event analytics`);
      }
      
      // 메타데이터 배치 커밋
      await batch.commit();
      
      logger.info(`Successfully saved ${events.length} event analytics to Firestore`);
      
      // 스냅샷 생성 (별도의 비동기 처리로 응답 지연 방지)
      this.createDailySnapshot('eventAnalytics', {
        eventCount: events.length,
        metadata,
        timestamp: new Date().toISOString()
      }).catch(error => {
        logger.error('Failed to create daily snapshot:', error);
      });
      
      return {
        success: true,
        count: events.length,
        metadata: metaData
      };
    } catch (error) {
      logger.error('Failed to save event analytics to Firestore:', error);
      throw error;
    }
  }

  /**
   * 전환율 메트릭을 Firestore에 저장
   * @param {Object} conversionData 전환율 데이터
   * @return {Promise<Object>} 저장 결과
   */
  async saveConversionMetrics(conversionData) {
    try {
      // 최신 분석 결과 저장
      const latestRef = this.db.collection(CONVERSION_METRICS_COLLECTION).doc('latest');
      await latestRef.set({
        ...conversionData,
        updatedAt: admin.firestore.FieldValue.serverTimestamp()
      });
      
      // 타임스탬프 기반 문서 ID 생성 (보존용)
      const timestamp = new Date();
      const docId = timestamp.toISOString().split('T')[0]; // YYYY-MM-DD
      
      // 타임시리즈 데이터로도 저장
      const timeseriesRef = this.db.collection(CONVERSION_METRICS_COLLECTION).doc(docId);
      await timeseriesRef.set({
        ...conversionData,
        date: docId,
        timestamp: admin.firestore.FieldValue.serverTimestamp()
      });
      
      logger.info(`Successfully saved conversion metrics to Firestore with ID ${docId}`);
      
      return {
        success: true,
        docId
      };
    } catch (error) {
      logger.error('Failed to save conversion metrics to Firestore:', error);
      throw error;
    }
  }

  /**
   * 일일/주간/월간 분석 스냅샷 생성
   * @param {string} analysisType 분석 유형
   * @param {Object} data 분석 데이터
   * @param {string} period 기간 (daily, weekly, monthly)
   * @return {Promise<Object>} 저장 결과
   */
  async createDailySnapshot(analysisType, data, period = 'daily') {
    try {
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
      const collectionPath = `${ANALYTICS_COLLECTION}/${analysisType}/${period}`;
      
      // 문서 저장
      await this.db.collection(collectionPath).doc(docId).set({
        ...data,
        period,
        analysisType,
        timestamp: admin.firestore.FieldValue.serverTimestamp()
      });
      
      logger.info(`Successfully created ${analysisType} ${period} snapshot to Firestore with ID ${docId}`);
      
      return {
        success: true,
        docId,
        path: `${collectionPath}/${docId}`
      };
    } catch (error) {
      logger.error(`Failed to create ${analysisType} ${period} snapshot to Firestore:`, error);
      throw error;
    }
  }

  /**
   * 분석 결과 조회
   * @param {string} type 분석 유형
   * @param {string} id 문서 ID (없으면 'latest')
   * @return {Promise<Object>} 분석 결과 데이터
   */
  async getAnalyticsResult(type, id = 'latest') {
    try {
      let collectionPath;
      
      switch (type) {
        case 'highValueUsers':
          collectionPath = HIGH_VALUE_USERS_COLLECTION;
          break;
        case 'userSegments':
          collectionPath = USER_SEGMENTS_COLLECTION;
          break;
        case 'eventAnalytics':
          collectionPath = EVENT_ANALYTICS_COLLECTION;
          break;
        case 'conversionMetrics':
          collectionPath = CONVERSION_METRICS_COLLECTION;
          break;
        default:
          collectionPath = ANALYTICS_COLLECTION;
      }
      
      const docRef = this.db.collection(collectionPath).doc(id);
      const doc = await docRef.get();
      
      if (!doc.exists) {
        logger.warn(`Analytics result ${type}/${id} not found`);
        return null;
      }
      
      return doc.data();
    } catch (error) {
      logger.error(`Failed to get analytics result ${type}/${id}:`, error);
      throw error;
    }
  }

  /**
   * 실시간 변경 리스너 등록
   * @param {string} type 분석 유형
   * @param {Function} callback 콜백 함수
   * @return {Function} 리스너 해제 함수
   */
  registerRealTimeListener(type, callback) {
    let collectionPath;
    
    switch (type) {
      case 'highValueUsers':
        collectionPath = HIGH_VALUE_USERS_COLLECTION;
        break;
      case 'userSegments':
        collectionPath = USER_SEGMENTS_COLLECTION;
        break;
      case 'eventAnalytics':
        collectionPath = EVENT_ANALYTICS_COLLECTION;
        break;
      case 'conversionMetrics':
        collectionPath = CONVERSION_METRICS_COLLECTION;
        break;
      default:
        collectionPath = ANALYTICS_COLLECTION;
    }
    
    // 최신 문서에 대한 실시간 리스너 등록
    const unsubscribe = this.db.collection(collectionPath)
      .doc('latest')
      .onSnapshot((doc) => {
        if (doc.exists) {
          callback(doc.data());
        }
      }, (error) => {
        logger.error(`Error in real-time listener for ${type}:`, error);
      });
    
    return unsubscribe;
  }

  /**
   * 시계열 데이터 조회 (추세 분석용)
   * @param {string} type 분석 유형
   * @param {Object} options 조회 옵션
   * @return {Promise<Array>} 시계열 데이터 배열
   */
  async getTimeSeriesData(type, options = {}) {
    try {
      const {
        startDate = null,
        endDate = null,
        limit = 30,
        orderBy = 'date',
        orderDirection = 'desc'
      } = options;
      
      let collectionPath;
      
      switch (type) {
        case 'highValueUsers':
          collectionPath = `${ANALYTICS_COLLECTION}/highValueUsers/daily`;
          break;
        case 'userSegments':
          collectionPath = USER_SEGMENTS_COLLECTION;
          break;
        case 'eventAnalytics':
          collectionPath = `${ANALYTICS_COLLECTION}/eventAnalytics/daily`;
          break;
        case 'conversionMetrics':
          collectionPath = CONVERSION_METRICS_COLLECTION;
          break;
        default:
          collectionPath = `${ANALYTICS_COLLECTION}/${type}/daily`;
      }
      
      let query = this.db.collection(collectionPath);
      
      // 날짜 필터 적용
      if (startDate) {
        query = query.where('date', '>=', startDate);
      }
      
      if (endDate) {
        query = query.where('date', '<=', endDate);
      }
      
      // 정렬 및 제한 적용
      query = query
        .orderBy(orderBy, orderDirection)
        .limit(limit);
      
      // 쿼리 실행
      const snapshot = await query.get();
      
      if (snapshot.empty) {
        return [];
      }
      
      // 결과 변환
      return snapshot.docs.map(doc => ({
        id: doc.id,
        ...doc.data()
      }));
    } catch (error) {
      logger.error(`Failed to get time series data for ${type}:`, error);
      throw error;
    }
  }

  /**
   * 분석 결과 캐싱 (임시 저장)
   * @param {string} key 캐시 키
   * @param {Object} data 캐시 데이터
   * @param {number} ttl TTL (초)
   * @return {Promise<Object>} 캐시 저장 결과
   */
  async cacheResult(key, data, ttl = 300) {
    try {
      const expiration = new Date();
      expiration.setSeconds(expiration.getSeconds() + ttl);
      
      await this.db.collection('cache').doc(key).set({
        data,
        createdAt: admin.firestore.FieldValue.serverTimestamp(),
        expiresAt: admin.firestore.Timestamp.fromDate(expiration),
        ttl
      });
      
      logger.debug(`Cached result with key ${key} and TTL ${ttl}s`);
      
      return { success: true, key, ttl };
    } catch (error) {
      logger.error(`Failed to cache result with key ${key}:`, error);
      throw error;
    }
  }

  /**
   * 캐시된 결과 조회
   * @param {string} key 캐시 키
   * @return {Promise<Object|null>} 캐시된 데이터 또는 null
   */
  async getCachedResult(key) {
    try {
      const doc = await this.db.collection('cache').doc(key).get();
      
      if (!doc.exists) {
        return null;
      }
      
      const cachedData = doc.data();
      
      // 캐시 만료 확인
      if (cachedData.expiresAt && cachedData.expiresAt.toDate() < new Date()) {
        // 만료된 캐시 자동 삭제 (백그라운드에서)
        this.db.collection('cache').doc(key).delete().catch(error => {
          logger.warn(`Error deleting expired cache for ${key}:`, error);
        });
        
        return null;
      }
      
      return cachedData.data;
    } catch (error) {
      logger.error(`Failed to get cached result with key ${key}:`, error);
      return null;
    }
  }
  
  /**
   * 만료된 캐시 정리
   * @return {Promise<number>} 삭제된 캐시 항목 수
   */
  async cleanupExpiredCache() {
    try {
      const now = admin.firestore.Timestamp.now();
      
      // 만료된 캐시 항목 조회
      const snapshot = await this.db.collection('cache')
        .where('expiresAt', '<', now)
        .get();
      
      if (snapshot.empty) {
        return 0;
      }
      
      // 배치 삭제 처리
      const batch = this.db.batch();
      snapshot.docs.forEach(doc => {
        batch.delete(doc.ref);
      });
      
      await batch.commit();
      
      logger.info(`Cleaned up ${snapshot.size} expired cache items`);
      
      return snapshot.size;
    } catch (error) {
      logger.error('Failed to cleanup expired cache:', error);
      throw error;
    }
  }
}

// 싱글톤 인스턴스 관리
let instance = null;

/**
 * 싱글톤 인스턴스 반환 함수
 * @return {AnalyticsStorageService} 서비스 인스턴스
 */
function getAnalyticsStorageService() {
  if (!instance) {
    instance = new AnalyticsStorageService();
    logger.debug('AnalyticsStorageService instance created');
  }
  return instance;
}

// 모듈 내보내기
module.exports = {
  AnalyticsStorageService,
  getAnalyticsStorageService
};

