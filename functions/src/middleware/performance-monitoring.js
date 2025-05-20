/**
 * 성능 모니터링 미들웨어
 * API 엔드포인트 실행 시간 및 리소스 사용량 추적
 * 서버리스 환경에 최적화됨
 */

const admin = require('firebase-admin');
const { getContextLogger } = require('../utils/logger');

// 요청 ID 메타데이터 키
const REQUEST_ID_HEADER = 'x-request-id';
const MAX_URL_LENGTH = 256;
const SLOW_REQUEST_THRESHOLD_MS = 1000; // 서버리스 환경에서는 더 높은 임계값 사용
const HIGH_MEMORY_THRESHOLD_MB = 50; // 서버리스 환경에서의 메모리 임계값
const METRIC_SAMPLING_RATE = 0.05; // 5%만 Firestore에 저장 (비용 최적화)

// 콜드 스타트 감지
const isColdStart = (() => {
  let isFirst = true;
  return () => {
    const wasColdStart = isFirst;
    isFirst = false;
    return wasColdStart;
  };
})();

/**
 * 요청 ID 생성 (추적용)
 * @return {string} 고유 요청 ID
 */
const generateRequestId = () => {
  const timestamp = Date.now().toString(36);
  const random = Math.random().toString(36).substring(2, 8);
  return `${timestamp}-${random}`;
};

/**
 * URL 경로 정규화 (PII 제거, 길이 제한)
 * @param {string} url 요청 URL
 * @return {string} 정규화된 URL
 */
const normalizeUrl = (url) => {
  try {
    // 경로 매개변수 정규화 (예: /users/123 -> /users/:id)
    const pathWithParams = url.split('?')[0];
    
    // 경로 세그먼트 정규화
    const segments = pathWithParams.split('/');
    const normalizedSegments = segments.map(segment => {
      // 숫자 ID, UUID, 긴 문자열 등 정규화
      if (/^\d+$/.test(segment)) return ':id';
      if (/^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(segment)) return ':uuid';
      if (segment.length > 20) return ':param';
      return segment;
    });
    
    const normalizedPath = normalizedSegments.join('/');
    
    // 최대 길이 제한
    if (normalizedPath.length > MAX_URL_LENGTH) {
      return normalizedPath.substring(0, MAX_URL_LENGTH - 3) + '...';
    }
    
    return normalizedPath;
  } catch (error) {
    console.warn('Error normalizing URL:', error);
    return url.substring(0, MAX_URL_LENGTH);
  }
};

/**
 * 성능 메트릭 저장 - 비동기, 배치 처리를 위한 래퍼
 * 서버리스 환경에서 Firestore 연결 및 쓰기 최적화
 */
const storeMetrics = (() => {
  // 메트릭 배치 처리를 위한 캐시
  let metricsCache = [];
  let lastFlushTime = Date.now();
  const FLUSH_INTERVAL_MS = 10000; // 10초마다 또는 함수 종료 시 플러시
  
  // 플러시 함수 - 배치로 Firestore에 저장
  const flushMetrics = async () => {
    if (metricsCache.length === 0) return;
    
    const metrics = [...metricsCache];
    metricsCache = [];
    lastFlushTime = Date.now();
    
    try {
      const batch = admin.firestore().batch();
      
      metrics.forEach(metric => {
        const docRef = admin.firestore().collection('performanceMetrics').doc(metric.requestId);
        batch.set(docRef, metric);
      });
      
      await batch.commit();
    } catch (error) {
      console.warn(`Failed to store performance metrics batch: ${error.message}`);
    }
  };
  
  // 주기적인 플러시 또는 종료 시 플러시 설정
  setInterval(() => {
    if (Date.now() - lastFlushTime >= FLUSH_INTERVAL_MS) {
      flushMetrics();
    }
  }, FLUSH_INTERVAL_MS);
  
  // Node.js 프로세스 종료 이벤트에 플러시 연결
  process.on('beforeExit', flushMetrics);
  
  // 메트릭 저장 함수
  return (metric) => {
    metricsCache.push(metric);
    
    // 배치 크기가 10개 이상이면 즉시 플러시
    if (metricsCache.length >= 10) {
      flushMetrics();
    }
  };
})();

/**
 * 성능 모니터링 미들웨어
 * 요청 시간, 메모리 사용량 등 추적 - 서버리스 최적화
 * 
 * @param {Request} req Express 요청 객체
 * @param {Response} res Express 응답 객체
 * @param {Function} next 다음 미들웨어 함수
 */
const performanceMonitoring = (req, res, next) => {
  // 콜드 스타트 감지
  const coldStart = isColdStart();
  
  // 요청 시작 시간
  const startTime = Date.now();
  
  // 메모리 측정은 서버리스 환경에서 최적화 - 샘플링
  const shouldMeasureMemory = Math.random() < 0.1; // 10%만 메모리 측정
  const startMemory = shouldMeasureMemory ? process.memoryUsage() : null;
  
  // 컨텍스트 로거 가져오기
  const logger = getContextLogger();
  
  // 요청 ID 생성 또는 전달된 ID 사용
  const requestId = req.headers[REQUEST_ID_HEADER] || generateRequestId();
  req.requestId = requestId;
  
  // 요청 컨텍스트에 로깅 ID 설정
  logger.setRequestContext({ requestId });
  
  // 요청 ID 응답 헤더에 추가
  res.setHeader(REQUEST_ID_HEADER, requestId);
  
  // 요청 정보 로깅
  const method = req.method;
  const normalizedUrl = normalizeUrl(req.originalUrl || req.url);
  
  // 콜드 스타트 로깅
  if (coldStart) {
    logger.info(`[${requestId}] COLD START - ${method} ${normalizedUrl} - Function instance initialized`);
  }
  
  logger.info(`[${requestId}] ${method} ${normalizedUrl} - Request started`);
  
  // 응답 완료 이벤트 리스너
  res.on('finish', () => {
    // 실행 시간 계산
    const duration = Date.now() - startTime;
    
    // 메모리 사용량 변화 계산 (샘플링된 경우만)
    let memoryDiff = null;
    if (shouldMeasureMemory) {
      const endMemory = process.memoryUsage();
      memoryDiff = {
        rss: endMemory.rss - startMemory.rss,
        heapTotal: endMemory.heapTotal - startMemory.heapTotal,
        heapUsed: endMemory.heapUsed - startMemory.heapUsed,
      };
    }
    
    // 성능 지표 로깅
    logger.info(`[${requestId}] ${method} ${normalizedUrl} - Completed ${res.statusCode} in ${duration}ms`);
    
    // 느린 요청 로깅 (임계값 이상)
    if (duration > SLOW_REQUEST_THRESHOLD_MS) {
      logger.warn(`[${requestId}] SLOW REQUEST: ${method} ${normalizedUrl} took ${duration}ms`);
    }
    
    // 상당한 메모리 사용 로깅 (샘플링된 경우만)
    if (memoryDiff && memoryDiff.heapUsed > HIGH_MEMORY_THRESHOLD_MB * 1024 * 1024) {
      logger.warn(`[${requestId}] HIGH MEMORY USAGE: ${method} ${normalizedUrl} used ${Math.round(memoryDiff.heapUsed / (1024 * 1024))}MB heap`);
    }
    
    // Firestore에 성능 데이터 저장 (샘플링 - 지정된 비율만 저장)
    // 콜드 스타트는 항상 저장, 그 외에는 샘플링
    if (coldStart || Math.random() < METRIC_SAMPLING_RATE) {
      try {
        const performanceData = {
          requestId,
          method,
          path: normalizedUrl,
          statusCode: res.statusCode,
          duration,
          timestamp: admin.firestore.FieldValue.serverTimestamp(),
          coldStart,
          // 환경 정보
          environment: process.env.NODE_ENV || 'development',
          region: process.env.FUNCTIONS_REGION || 'unknown',
        };
        
        // 메모리 정보가 있는 경우만 추가
        if (memoryDiff) {
          performanceData.memory = {
            heapUsedMB: Math.round(memoryDiff.heapUsed / (1024 * 1024) * 100) / 100,
          };
        }
        
        // 배치 처리 큐에 추가
        storeMetrics(performanceData);
      } catch (error) {
        logger.warn(`Error logging performance metrics: ${error.message}`);
      }
    }
  });
  
  next();
};

module.exports = performanceMonitoring;

module.exports = performanceMonitoring;
