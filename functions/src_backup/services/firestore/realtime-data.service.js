/**
 * Real-time Data Service
 * 
 * Firestore 기반 실시간 데이터 업데이트 처리 서비스
 * - 실시간 리스너 관리
 * - 데이터 변경 이벤트 처리
 * - 알림 발송 기능
 */

const { getFirestore, getMessaging, admin } = require('../../firebase/admin');
const { getContextLogger } = require('../../utils/logger');

// 로거 초기화
const logger = getContextLogger('realtime-data');

// 리스너 저장소
const listeners = new Map();

/**
 * 실시간 데이터 서비스 클래스
 */
class RealTimeDataService {
  /**
   * 생성자
   */
  constructor() {
    this.db = getFirestore();
    this.initialized = true;
    logger.info('RealTimeDataService initialized');
  }

  /**
   * 서비스 초기화 (이미 생성자에서 초기화됨)
   */
  initialize() {
    // 이미 초기화됨
    return;
  }

  /**
   * 문서 변경 리스너 등록
   * @param {string} collectionPath 컬렉션 경로
   * @param {string} docId 문서 ID (옵션)
   * @param {Function} callback 콜백 함수
   * @return {string} 리스너 ID
   */
  registerDocumentListener(collectionPath, docId, callback) {
    this.initialize();
    
    let query;
    const listenerId = `${collectionPath}${docId ? `/${docId}` : ''}`;
    
    if (docId) {
      // 단일 문서 리스너
      query = this.db.collection(collectionPath).doc(docId);
    } else {
      // 컬렉션 리스너
      query = this.db.collection(collectionPath);
    }
    
    // 콜백 래퍼 - 에러 처리 및 로깅 추가
    const callbackWrapper = (snapshot) => {
      try {
        if (docId) {
          // 단일 문서 변경
          if (snapshot.exists) {
            const data = snapshot.data();
            callback({
              type: 'modified',
              id: snapshot.id,
              data,
              exists: true
            });
          } else {
            callback({
              type: 'deleted',
              id: snapshot.id,
              exists: false
            });
          }
        } else {
          // 복수 문서 변경
          const changes = snapshot.docChanges();
          
          if (changes.length === 0) {
            return;
          }
          
          // 변경 유형별 처리
          const addedDocs = [];
          const modifiedDocs = [];
          const removedDocs = [];
          
          changes.forEach(change => {
            const doc = change.doc;
            const changeData = {
              id: doc.id,
              data: doc.data(),
              exists: doc.exists
            };
            
            if (change.type === 'added') {
              addedDocs.push(changeData);
            } else if (change.type === 'modified') {
              modifiedDocs.push(changeData);
            } else if (change.type === 'removed') {
              removedDocs.push(changeData);
            }
          });
          
          callback({
            added: addedDocs,
            modified: modifiedDocs,
            removed: removedDocs,
            size: snapshot.size
          });
        }
      } catch (error) {
        logger.error(`Error in Firestore listener callback (${listenerId}):`, error);
      }
    };
    
    // 에러 핸들러
    const errorHandler = (error) => {
      logger.error(`Firestore listener error (${listenerId}):`, error);
      
      // 리스너 자동 재등록 시도
      setTimeout(() => {
        logger.info(`Attempting to re-register listener for ${listenerId}`);
        this.unregisterListener(listenerId);
        this.registerDocumentListener(collectionPath, docId, callback);
      }, 5000); // 5초 후 재시도
    };
    
    // 리스너 등록
    const unsubscribe = docId
      ? query.onSnapshot(callbackWrapper, errorHandler)
      : query.onSnapshot(callbackWrapper, errorHandler);
    
    // 리스너 저장
    listeners.set(listenerId, {
      unsubscribe,
      collectionPath,
      docId,
      createdAt: new Date()
    });
    
    logger.info(`Registered Firestore listener for ${listenerId}`);
    
    return listenerId;
  }

  /**
   * 쿼리 기반 리스너 등록
   * @param {string} collectionPath 컬렉션 경로
   * @param {Object} queryOptions 쿼리 옵션
   * @param {Function} callback 콜백 함수
   * @return {string} 리스너 ID
   */
  registerQueryListener(collectionPath, queryOptions = {}, callback) {
    this.initialize();
    
    const { 
      field, 
      operator = '==', 
      value,
      limit = null,
      orderByField = null,
      orderByDirection = 'asc'
    } = queryOptions;
    
    let query = this.db.collection(collectionPath);
    
    // 필터 적용
    if (field && value !== undefined) {
      query = query.where(field, operator, value);
    }
    
    // 정렬 적용
    if (orderByField) {
      query = query.orderBy(orderByField, orderByDirection);
    }
    
    // 결과 제한
    if (limit) {
      query = query.limit(limit);
    }
    
    // 리스너 ID 생성
    const listenerId = `${collectionPath}/query/${JSON.stringify(queryOptions)}`;
    
    // 콜백 래퍼
    const callbackWrapper = (snapshot) => {
      try {
        if (snapshot.empty) {
          callback({
            empty: true,
            added: [],
            modified: [],
            removed: [],
            size: 0
          });
          return;
        }
        
        const changes = snapshot.docChanges();
        
        if (changes.length === 0) {
          callback({
            empty: false,
            added: [],
            modified: [],
            removed: [],
            size: snapshot.size,
            docs: snapshot.docs.map(doc => ({
              id: doc.id,
              data: doc.data()
            }))
          });
          return;
        }
        
        // 변경 유형별 처리
        const addedDocs = [];
        const modifiedDocs = [];
        const removedDocs = [];
        
        changes.forEach(change => {
          const doc = change.doc;
          const changeData = {
            id: doc.id,
            data: doc.data()
          };
          
          if (change.type === 'added') {
            addedDocs.push(changeData);
          } else if (change.type === 'modified') {
            modifiedDocs.push(changeData);
          } else if (change.type === 'removed') {
            removedDocs.push(changeData);
          }
        });
        
        callback({
          empty: false,
          added: addedDocs,
          modified: modifiedDocs,
          removed: removedDocs,
          size: snapshot.size,
          docs: snapshot.docs.map(doc => ({
            id: doc.id,
            data: doc.data()
          }))
        });
      } catch (error) {
        logger.error(`Error in Firestore query listener callback (${listenerId}):`, error);
      }
    };
    
    // 에러 핸들러
    const errorHandler = (error) => {
      logger.error(`Firestore query listener error (${listenerId}):`, error);
      
      // 리스너 자동 재등록 시도
      setTimeout(() => {
        logger.info(`Attempting to re-register query listener for ${listenerId}`);
        this.unregisterListener(listenerId);
        this.registerQueryListener(collectionPath, queryOptions, callback);
      }, 5000); // 5초 후 재시도
    };
    
    // 리스너 등록
    const unsubscribe = query.onSnapshot(callbackWrapper, errorHandler);
    
    // 리스너 저장
    listeners.set(listenerId, {
      unsubscribe,
      collectionPath,
      queryOptions,
      createdAt: new Date()
    });
    
    logger.info(`Registered Firestore query listener for ${listenerId}`);
    
    return listenerId;
  }

  /**
   * 리스너 해제
   * @param {string} listenerId 리스너 ID
   * @return {boolean} 성공 여부
   */
  unregisterListener(listenerId) {
    if (!listeners.has(listenerId)) {
      logger.warn(`Listener ${listenerId} not found`);
      return false;
    }
    
    try {
      const listener = listeners.get(listenerId);
      listener.unsubscribe();
      listeners.delete(listenerId);
      
      logger.info(`Unregistered Firestore listener ${listenerId}`);
      return true;
    } catch (error) {
      logger.error(`Error unregistering listener ${listenerId}:`, error);
      return false;
    }
  }

  /**
   * 모든 리스너 해제
   * @return {number} 해제된 리스너 수
   */
  unregisterAllListeners() {
    let count = 0;
    
    for (const listenerId of listeners.keys()) {
      if (this.unregisterListener(listenerId)) {
        count++;
      }
    }
    
    logger.info(`Unregistered ${count} Firestore listeners`);
    return count;
  }

  /**
   * 활성 리스너 목록 조회
   * @return {Array} 리스너 정보 배열
   */
  getActiveListeners() {
    const result = [];
    
    for (const [id, listener] of listeners.entries()) {
      result.push({
        id,
        collectionPath: listener.collectionPath,
        docId: listener.docId,
        queryOptions: listener.queryOptions,
        createdAt: listener.createdAt
      });
    }
    
    return result;
  }

  /**
   * 고가치 사용자 변경 리스너 등록
   * @param {Function} callback 콜백 함수
   * @return {string} 리스너 ID
   */
  listenToHighValueUsers(callback) {
    return this.registerDocumentListener('highValueUsers', 'latest', callback);
  }

  /**
   * 사용자 세그먼트 변경 리스너 등록
   * @param {Function} callback 콜백 함수
   * @return {string} 리스너 ID
   */
  listenToUserSegments(callback) {
    return this.registerDocumentListener('userSegments', 'latest', callback);
  }

  /**
   * 이벤트 분석 변경 리스너 등록
   * @param {Function} callback 콜백 함수
   * @return {string} 리스너 ID
   */
  listenToEventAnalytics(callback) {
    return this.registerDocumentListener('eventAnalytics', 'latest', callback);
  }

  /**
   * 전환율 메트릭 변경 리스너 등록
   * @param {Function} callback 콜백 함수
   * @return {string} 리스너 ID
   */
  listenToConversionMetrics(callback) {
    return this.registerDocumentListener('conversionMetrics', 'latest', callback);
  }

  /**
   * 특정 고가치 사용자 그룹 리스너 등록
   * @param {Object} criteria 검색 조건
   * @param {Function} callback 콜백 함수
   * @return {string} 리스너 ID
   */
  listenToHighValueUserGroup(criteria = {}, callback) {
    const queryOptions = {
      // 예시: 30일 이상 활동이 없는 휴면 고가치 사용자
      field: 'inactiveDays',
      operator: '>=',
      value: criteria.minInactiveDays || 30,
      orderByField: criteria.orderBy || 'inactiveDays',
      orderByDirection: criteria.orderDirection || 'desc',
      limit: criteria.limit || 100
    };
    
    return this.registerQueryListener('highValueUsers', queryOptions, callback);
  }

  /**
   * 데이터 업데이트 푸시 알림 전송
   * @param {string} topic 푸시 알림 토픽
   * @param {Object} data 알림 데이터
   * @return {Promise<Object>} 전송 결과
   */
  async sendDataUpdateNotification(topic, data) {
    try {
      const messaging = getMessaging();
      
      const message = {
        data: {
          type: 'data_update',
          dataType: data.type || 'analytics',
          timestamp: new Date().toISOString(),
          ...data
        },
        topic
      };
      
      // 외부 참조 변환 (FCM은 문자열만 지원)
      Object.keys(message.data).forEach(key => {
        if (typeof message.data[key] !== 'string') {
          message.data[key] = JSON.stringify(message.data[key]);
        }
      });
      
      const response = await messaging.send(message);
      
      logger.info(`Sent data update notification to topic ${topic}, message ID: ${response}`);
      
      return {
        success: true,
        messageId: response
      };
    } catch (error) {
      logger.error(`Failed to send data update notification to topic ${topic}:`, error);
      throw error;
    }
  }
}

// 싱글톤 인스턴스 관리
let instance = null;

/**
 * 싱글톤 인스턴스 반환 함수
 * @return {RealTimeDataService} 서비스 인스턴스
 */
function getRealTimeDataService() {
  if (!instance) {
    instance = new RealTimeDataService();
  }
  return instance;
}

// 모듈 내보내기
module.exports = {
  RealTimeDataService,
  getRealTimeDataService
};
