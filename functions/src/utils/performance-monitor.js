/**
 * Firebase Functions 성능 모니터링 및 최적화 유틸리티
 * 콜드 스타트 최소화, 메모리 사용량 모니터링, 실행 시간 추적 구현
 */

const admin = require('firebase-admin');
const { getContextLogger } = require('./logger');

/**
 * 성능 모니터링 클래스
 * 함수 성능 추적 및 최적화 기능 제공
 */
class PerformanceMonitor {
  /**
   * 생성자
   * @param {Object} options 옵션
   * @param {boolean} options.enabled 활성화 여부
   * @param {number} options.sampleRate 샘플링 비율 (0.0-1.0)
   */
  constructor(options = {}) {
    this.options = {
      enabled: process.env.ENABLE_PERFORMANCE_MONITORING === 'true',
      sampleRate: parseFloat(process.env.PERFORMANCE_SAMPLE_RATE || '0.1'),
      logLevel: process.env.LOGGING_LEVEL || 'info',
      ...options
    };
    
    this.logger = getContextLogger();
    this.traces = new Map();
    this.metrics = {};
    this.initMetrics();
  }
  
  /**
   * 메트릭 초기화
   * @private
   */
  initMetrics() {
    this.metrics = {
      functionInvocations: 0,
      coldStarts: 0,
      errors: 0,
      averageExecutionTime: 0,
      totalExecutionTime: 0,
      maxExecutionTime: 0,
      memoryUsage: {
        average: 0,
        max: 0,
        total: 0,
        samples: 0
      }
    };
  }
  
  /**
   * 추적 시작
   * @param {string} name 추적 이름
   * @param {Object} metadata 메타데이터
   * @return {Object} 추적 객체
   */
  startTrace(name, metadata = {}) {
    if (!this.options.enabled || Math.random() > this.options.sampleRate) {
      return { skip: true };
    }
    
    const traceId = `${name}_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`;
    
    const trace = {
      id: traceId,
      name,
      metadata,
      startTime: process.hrtime(),
      startMemory: process.memoryUsage(),
      isColdStart: this.isColdStart(),
      skip: false,
      spans: [],
      currentSpan: null
    };
    
    this.traces.set(traceId, trace);
    
    if (trace.isColdStart) {
      this.metrics.coldStarts++;
    }
    
    this.metrics.functionInvocations++;
    
    if (this.options.logLevel === 'debug') {
      this.logger.debug(`Start trace: ${name}${trace.isColdStart ? ' (cold start)' : ''}`);
    }
    
    return trace;
  }
  
  /**
   * 스팬 시작
   * @param {Object} trace 추적 객체
   * @param {string} name 스팬 이름
   * @param {Object} metadata 메타데이터
   */
  startSpan(trace, name, metadata = {}) {
    if (trace.skip) {
      return;
    }
    
    if (trace.currentSpan) {
      this.endSpan(trace);
    }
    
    const span = {
      name,
      metadata,
      startTime: process.hrtime(),
      startMemory: process.memoryUsage()
    };
    
    trace.currentSpan = span;
    
    if (this.options.logLevel === 'debug') {
      this.logger.debug(`Start span: ${trace.name} > ${name}`);
    }
  }
  
  /**
   * 스팬 종료
   * @param {Object} trace 추적 객체
   */
  endSpan(trace) {
    if (trace.skip || !trace.currentSpan) {
      return;
    }
    
    const span = trace.currentSpan;
    const duration = this.getElapsedTime(span.startTime);
    const memory = this.getMemoryDiff(span.startMemory);
    
    span.duration = duration;
    span.memory = memory;
    span.endTime = process.hrtime();
    
    trace.spans.push(span);
    trace.currentSpan = null;
    
    if (this.options.logLevel === 'debug') {
      this.logger.debug(`End span: ${trace.name} > ${span.name} (${duration.toFixed(2)}ms)`);
    }
  }
  
  /**
   * 추적 종료
   * @param {Object} trace 추적 객체
   * @return {Object} 추적 결과
   */
  endTrace(trace) {
    if (trace.skip) {
      return null;
    }
    
    if (trace.currentSpan) {
      this.endSpan(trace);
    }
    
    const duration = this.getElapsedTime(trace.startTime);
    const memory = this.getMemoryDiff(trace.startMemory);
    
    trace.duration = duration;
    trace.memory = memory;
    trace.endTime = process.hrtime();
    
    // 메트릭 업데이트
    this.updateMetrics(trace);
    
    // 추적 정보 저장 (로깅 또는 Firestore)
    this.storeTrace(trace);
    
    this.traces.delete(trace.id);
    
    if (this.options.logLevel !== 'silent') {
      this.logger.info(
        `Trace complete: ${trace.name} (${duration.toFixed(2)}ms)${trace.isColdStart ? ' [cold start]' : ''}`
      );
    }
    
    return {
      name: trace.name,
      duration,
      memory,
      isColdStart: trace.isColdStart,
      spans: trace.spans.map(span => ({
        name: span.name,
        duration: span.duration,
        memory: span.memory
      }))
    };
  }
  
  /**
   * 메트릭 업데이트
   * @param {Object} trace 추적 객체
   * @private
   */
  updateMetrics(trace) {
    const { duration } = trace;
    const heapUsed = trace.memory.heapUsed;
    
    // 실행 시간 메트릭 업데이트
    this.metrics.totalExecutionTime += duration;
    this.metrics.averageExecutionTime = this.metrics.totalExecutionTime / this.metrics.functionInvocations;
    
    if (duration > this.metrics.maxExecutionTime) {
      this.metrics.maxExecutionTime = duration;
    }
    
    // 메모리 사용량 메트릭 업데이트
    this.metrics.memoryUsage.total += heapUsed;
    this.metrics.memoryUsage.samples++;
    this.metrics.memoryUsage.average = this.metrics.memoryUsage.total / this.metrics.memoryUsage.samples;
    
    if (heapUsed > this.metrics.memoryUsage.max) {
      this.metrics.memoryUsage.max = heapUsed;
    }
    
    // 이상치 감지 (실행 시간 또는 메모리 사용량이 예상보다 높은 경우)
    const avgTime = this.metrics.averageExecutionTime;
    const avgMemory = this.metrics.memoryUsage.average;
    
    if (duration > avgTime * 3) {
      this.logger.warn(
        `Slow execution detected: ${trace.name} took ${duration.toFixed(2)}ms (avg: ${avgTime.toFixed(2)}ms)`
      );
    }
    
    if (heapUsed > avgMemory * 3) {
      this.logger.warn(
        `High memory usage detected: ${trace.name} used ${(heapUsed / 1024 / 1024).toFixed(2)}MB (avg: ${(avgMemory / 1024 / 1024).toFixed(2)}MB)`
      );
    }
  }
  
  /**
   * 추적 정보 저장
   * @param {Object} trace 추적 객체
   * @private
   */
  storeTrace(trace) {
    // 프로덕션 환경에서 Firestore에 성능 추적 데이터 저장
    if (process.env.NODE_ENV === 'production' && process.env.STORE_PERFORMANCE_METRICS === 'true') {
      try {
        const traceData = {
          name: trace.name,
          duration: trace.duration,
          memory: trace.memory,
          isColdStart: trace.isColdStart,
          metadata: trace.metadata,
          timestamp: admin.firestore.FieldValue.serverTimestamp(),
          spans: trace.spans.map(span => ({
            name: span.name,
            duration: span.duration,
            memory: span.memory,
            metadata: span.metadata
          }))
        };
        
        // 컬렉션 경로 생성 (성능 데이터 일자별 분리)
        const date = new Date();
        const year = date.getUTCFullYear();
        const month = String(date.getUTCMonth() + 1).padStart(2, '0');
        const day = String(date.getUTCDate()).padStart(2, '0');
        
        const collectionPath = `performance/${year}${month}${day}/traces`;
        
        // 비동기 저장 (응답 지연 방지)
        admin.firestore().collection(collectionPath).add(traceData)
          .catch(error => {
            this.logger.warn(`Error storing trace data: ${error.message}`);
          });
      } catch (error) {
        this.logger.warn(`Error preparing trace data: ${error.message}`);
      }
    }
  }
  
  /**
   * 경과 시간 계산 (밀리초)
   * @param {Array} startTime process.hrtime() 결과
   * @return {number} 경과 시간 (밀���초)
   * @private
   */
  getElapsedTime(startTime) {
    const diff = process.hrtime(startTime);
    return (diff[0] * 1e9 + diff[1]) / 1e6; // 나노초 -> 밀리초
  }
  
  /**
   * 메모리 사용량 차이 계산
   * @param {Object} startMemory process.memoryUsage() 결과
   * @return {Object} 메모리 사용량 차이
   * @private
   */
  getMemoryDiff(startMemory) {
    const endMemory = process.memoryUsage();
    
    return {
      rss: endMemory.rss - startMemory.rss,
      heapTotal: endMemory.heapTotal - startMemory.heapTotal,
      heapUsed: endMemory.heapUsed - startMemory.heapUsed,
      external: endMemory.external - startMemory.external
    };
  }
  
  /**
   * 콜드 스타트 여부 확인
   * @return {boolean} 콜드 스타트 여부
   * @private
   */
  isColdStart() {
    // 전역 변수를 통한 콜드 스타트 감지
    if (global.__isColdStart === undefined) {
      global.__isColdStart = true;
      return true;
    }
    
    return false;
  }
  
  /**
   * 현재 메트릭 조회
   * @return {Object} 메트릭
   */
  getMetrics() {
    return {
      ...this.metrics,
      timestamp: new Date().toISOString()
    };
  }
  
  /**
   * Express 미들웨어 생성
   * 요청 처리 성능 추적
   * @return {Function} Express 미들웨어
   */
  createMiddleware() {
    return (req, res, next) => {
      const requestPath = req.path;
      const method = req.method;
      
      // 헬스 체크 등의 모니터링 요청은 제외
      if (requestPath === '/health' || requestPath === '/favicon.ico') {
        return next();
      }
      
      const traceName = `${method} ${requestPath}`;
      const trace = this.startTrace(traceName, {
        method,
        path: requestPath,
        query: req.query,
        userAgent: req.get('User-Agent'),
        referer: req.get('Referer')
      });
      
      // 응답 시작
      this.startSpan(trace, 'request_start');
      
      // 원본 end 메서드 저장
      const originalEnd = res.end;
      
      // end 메서드 오버라이드
      res.end = function(...args) {
        // 스팬 종료
        monitor.endSpan(trace);
        
        // 응답 종료 스팬 시작
        monitor.startSpan(trace, 'request_end', {
          statusCode: res.statusCode,
          contentLength: res.get('Content-Length')
        });
        
        // 추적 종료
        const traceResult = monitor.endTrace(trace);
        
        // 성능 헤더 추가 (개발 환경에서만)
        if (process.env.NODE_ENV !== 'production' && traceResult) {
          res.set('X-Execution-Time', `${traceResult.duration.toFixed(2)}ms`);
          res.set('X-Memory-Used', `${(traceResult.memory.heapUsed / 1024 / 1024).toFixed(2)}MB`);
          res.set('X-Cold-Start', traceResult.isColdStart ? 'true' : 'false');
        }
        
        // 원본 end 메서드 호출
        return originalEnd.apply(this, args);
      };
      
      next();
    };
  }
}

// 싱글톤 인스턴스 생성
const monitor = new PerformanceMonitor();

module.exports = {
  PerformanceMonitor,
  monitor,
  monitorMiddleware: monitor.createMiddleware(),
  startTrace: (name, metadata) => monitor.startTrace(name, metadata),
  endTrace: (trace) => monitor.endTrace(trace),
  startSpan: (trace, name, metadata) => monitor.startSpan(trace, name, metadata),
  endSpan: (trace) => monitor.endSpan(trace),
  getMetrics: () => monitor.getMetrics()
};
