/**
 * 로깅 유틸리티
 * 구조화된 로깅 및 로그 수준 관리
 * 서버리스 환경 최적화 버전
 */

const winston = require('winston');
const { format, transports } = winston;
const AsyncLocalStorage = require('async_hooks').AsyncLocalStorage;

// 스레드 로컬 스토리지 (요청 컨텍스트 관리)
const asyncLocalStorage = new AsyncLocalStorage();

// 서버리스 환경에서 로깅 최적화 플래그
const ENABLE_DETAILED_LOGS = process.env.NODE_ENV !== 'production' || process.env.DEBUG === 'true';
const MAX_META_SIZE = 10 * 1024; // 최대 메타데이터 크기 제한 (10KB)

// 로그 레벨 정의
const logLevels = {
  error: 0,
  warn: 1,
  info: 2,
  http: 3,
  debug: 4,
};

// 환경에 따른 기본 로그 레벨 설정
const getLogLevel = () => {
  const env = process.env.NODE_ENV || 'development';
  const configuredLevel = process.env.LOG_LEVEL?.toLowerCase();
  
  if (configuredLevel && logLevels[configuredLevel] !== undefined) {
    return configuredLevel;
  }
  
  // 기본값: 프로덕션은 info, 개발은 debug
  return env === 'production' ? 'info' : 'debug';
};

/**
 * 메타데이터 크기 제한 함수
 * 서버리스 환경에서 로그 크기 최적화
 */
const limitMetaSize = (meta) => {
  if (!meta || typeof meta !== 'object') return meta;
  
  try {
    const jsonString = JSON.stringify(meta);
    
    if (jsonString.length <= MAX_META_SIZE) {
      return meta; // 크기 제한 내이면 원본 반환
    }
    
    // 크기 제한 초과 시 축약된 버전 반환
    return {
      _truncated: true,
      _originalSize: jsonString.length,
      message: 'Metadata exceeded size limit and was truncated',
      // 기본 속성 보존 (첫 수준만)
      ...Object.keys(meta)
        .slice(0, 10) // 최대 10개 최상위 키만 유지
        .reduce((acc, key) => {
          const value = meta[key];
          
          // 스칼라 값이나 작은 객체만 유지
          if (
            typeof value !== 'object' || 
            value === null ||
            (typeof value === 'object' && JSON.stringify(value).length <= 100)
          ) {
            acc[key] = value;
          } else {
            acc[key] = '[Complex Object]';
          }
          
          return acc;
        }, {})
    };
  } catch (e) {
    return {
      _error: 'Failed to process metadata',
      _reason: e.message
    };
  }
};

// 로그 포맷 정의 - 서버리스 환경에 최적화
const serverlessFormat = format.combine(
  format.timestamp({ format: 'YYYY-MM-DD HH:mm:ss.SSS' }),
  format.errors({ stack: true }),
  format((info) => {
    // 불필요한 큰 메타데이터 제한
    if (info.metadata) {
      info.metadata = limitMetaSize(info.metadata);
    }
    
    // 스택 트레이스 간소화 (프로덕션에서)
    if (info.stack && process.env.NODE_ENV === 'production') {
      // 스택 트레이스 최대 3줄로 제한
      info.stack = info.stack
        .split('\n')
        .slice(0, 3)
        .join('\n') + '\n  ...';
    }
    
    return info;
  })(),
  format.json()
);

// 개발 환경용 가독성 포맷
const developmentFormat = format.combine(
  format.colorize(),
  format.timestamp({ format: 'YYYY-MM-DD HH:mm:ss.SSS' }),
  format.errors({ stack: true }),
  format.splat(),
  format.printf(({ timestamp, level, message, requestId, traceId, ...rest }) => {
    // 요청 및 추적 ID 포함 (있는 경우)
    const reqId = requestId ? `[${requestId}] ` : '';
    const trace = traceId ? `(trace: ${traceId}) ` : '';
    
    // 추가 메타데이터가 있는 경우 포함 (크기 제한)
    let meta = '';
    if (Object.keys(rest).length > 0) {
      const metaObj = limitMetaSize(rest);
      meta = `\n${JSON.stringify(metaObj, null, 2)}`;
    }
    
    return `${timestamp} ${level}: ${reqId}${trace}${message}${meta}`;
  })
);

// Winston 로거 구성 - 서버리스 환경 최적화
const logger = winston.createLogger({
  level: getLogLevel(),
  levels: logLevels,
  format: process.env.NODE_ENV === 'production' ? serverlessFormat : developmentFormat,
  defaultMeta: { 
    service: 'hermes-analytics',
    environment: process.env.NODE_ENV || 'development',
    region: process.env.FUNCTIONS_REGION || 'unknown'
  },
  transports: [
    new transports.Console({ 
      // 비동기 로깅 비활성화 (서버리스에서는 동기식이 더 안전)
      handleExceptions: true,
      handleRejections: true
    }),
  ],
});

// 고유 요청 ID 생성
const generateRequestId = () => {
  const timestamp = Date.now().toString(36);
  const random = Math.random().toString(36).substring(2, 8);
  return `${timestamp}-${random}`;
};

// Express 미들웨어: 요청 별 컨텍스트 설정
const requestLogger = (req, res, next) => {
  // 요청 ID 설정
  const requestId = req.requestId || req.headers['x-request-id'] || generateRequestId();
  req.requestId = requestId;
  
  // 크라우드 트레이스 ID 캡처 (Google Cloud Functions 환경)
  const traceHeader = req.headers['x-cloud-trace-context'];
  let traceId = null;
  
  if (traceHeader) {
    const [trace] = traceHeader.split('/');
    traceId = trace;
  }
  
  // 스토어에 컨텍스트 정보 설정
  const store = { 
    requestId,
    traceId,
    startTime: Date.now()
  };
  
  // 요청 로깅 (프로덕션에서는 상세 정보 제한)
  const logContext = {
    requestId,
    traceId,
    method: req.method,
    url: req.originalUrl || req.url,
  };
  
  // 개발 환경 또는 디버그 모드에서만 상세 정보 로깅
  if (ENABLE_DETAILED_LOGS) {
    logContext.ip = req.ip || req.connection.remoteAddress;
    logContext.userAgent = req.get('user-agent');
    
    // 쿼리 및 헤더 기본 정보
    if (Object.keys(req.query).length > 0) {
      logContext.query = limitMetaSize(req.query);
    }
    
    // 인증된 사용자 정보 (있는 경우)
    if (req.user) {
      logContext.userId = req.user.uid || req.user.id;
    }
  }
  
  // 요청 시작 로깅
  logger.info('Request started', logContext);
  
  // 응답 완료 이벤트 리스너
  res.on('finish', () => {
    const duration = Date.now() - store.startTime;
    
    // 응답 로깅 (기본 정보)
    const responseLog = {
      requestId,
      traceId,
      method: req.method,
      url: req.originalUrl || req.url,
      statusCode: res.statusCode,
      duration: `${duration}ms`
    };
    
    // 4xx, 5xx 오류는 더 자세히 로깅
    const isError = res.statusCode >= 400;
    
    if (isError) {
      logger.warn(`Request completed with error: ${res.statusCode}`, responseLog);
    } else {
      logger.info('Request completed successfully', responseLog);
    }
  });
  
  // 요청 컨텍스트에서 미들웨어 체인 실행
  asyncLocalStorage.run(store, next);
};

// 컨텍스트 값 설정 함수 (재사용)
const setRequestContext = (key, value) => {
  const store = asyncLocalStorage.getStore();
  if (store) {
    store[key] = value;
  }
};

// 현재 요청 컨텍스트의 로거 가져오기 - 서버리스 최적화 버전
const getContextLogger = () => {
  const store = asyncLocalStorage.getStore();
  const requestId = store?.requestId;
  const traceId = store?.traceId;
  
  // 컨텍스트 메타데이터
  const contextMeta = {};
  if (requestId) contextMeta.requestId = requestId;
  if (traceId) contextMeta.traceId = traceId;
  
  // 컨텍스트 로거 객체 생성
  const contextLogger = {
    error: (message, meta = {}) => logger.error(message, { ...contextMeta, ...meta }),
    warn: (message, meta = {}) => logger.warn(message, { ...contextMeta, ...meta }),
    info: (message, meta = {}) => logger.info(message, { ...contextMeta, ...meta }),
    http: (message, meta = {}) => logger.http(message, { ...contextMeta, ...meta }),
    debug: (message, meta = {}) => logger.debug(message, { ...contextMeta, ...meta }),
    
    // 컨텍스트 값 설정 함수 추가
    setRequestContext: (key, value) => {
      if (store) {
        store[key] = value;
      }
    }
  };
  
  return contextLogger;
};

/**
 * 콘솔 로깅 오버라이드
 * winston 로거를 사용하도록 콘솔 메서드 재정의
 * 서버리스 환경에서의 최적화: 출력 최소화 & 구조화
 */
if (process.env.NODE_ENV === 'production') {
  // 원본 콘솔 메서드 백업
  const originalConsole = {
    log: console.log,
    info: console.info,
    warn: console.warn,
    error: console.error,
    debug: console.debug,
  };
  
  // 인자 포맷팅 도우미 함수
  const formatArgs = (args) => {
    if (args.length === 0) return { message: '' };
    
    // 첫 번째 인자가 Error 객체인 경우 특수 처리
    if (args[0] instanceof Error) {
      const error = args[0];
      return {
        message: error.message,
        stack: error.stack,
        name: error.name,
        code: error.code,
        additionalArgs: args.length > 1 ? limitMetaSize(args.slice(1)) : undefined
      };
    }
    
    // 첫 번째 인자가 문자열인 경우
    if (typeof args[0] === 'string') {
      return {
        message: args[0],
        additionalArgs: args.length > 1 ? limitMetaSize(args.slice(1)) : undefined
      };
    }
    
    // 그 외 경우
    return {
      message: 'Log message',
      data: limitMetaSize(args)
    };
  };
  
  // 콘솔 메서드 오버라이드
  console.log = (...args) => {
    getContextLogger().info(formatArgs(args).message, formatArgs(args));
  };
  
  console.info = (...args) => {
    getContextLogger().info(formatArgs(args).message, formatArgs(args));
  };
  
  console.warn = (...args) => {
    getContextLogger().warn(formatArgs(args).message, formatArgs(args));
  };
  
  console.error = (...args) => {
    getContextLogger().error(formatArgs(args).message, formatArgs(args));
  };
  
  console.debug = (...args) => {
    getContextLogger().debug(formatArgs(args).message, formatArgs(args));
  };
  
  // 원본 콘솔에 액세스할 수 있는 방법 제공
  console.original = originalConsole;
}

module.exports = {
  logger,
  requestLogger,
  getContextLogger,
  setRequestContext
};

module.exports = {
  logger,
  requestLogger,
  getContextLogger,
};
