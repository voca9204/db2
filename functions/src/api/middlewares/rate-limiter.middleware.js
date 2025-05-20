/**
 * 속도 제한(Rate Limiting) 미들웨어
 * 서버리스 환경에 최적화된 Firestore 기반 구현
 */

const admin = require('firebase-admin');
const { TooManyRequestsError } = require('../utils/error-handler');
const { getContextLogger } = require('../../utils/logger');

/**
 * Firestore 기반 속도 제한 미들웨어 생성
 * @param {number} maxRequests - 지정된 기간 내 최대 요청 수
 * @param {number} windowMinutes - 시간 창 (분)
 * @param {Object} options - 추가 옵션
 * @param {boolean} options.adminExempt - 관리자 제외 여부 (기본값: true)
 * @param {boolean} options.storeInDb - DB에 저장 여부 (기본값: true)
 * @param {boolean} options.skipAuthenticatedUsers - 인증된 사용자 제외 여부 (기본값: false)
 * @return {Function} Express 미들웨어
 */
const createRateLimiter = (maxRequests, windowMinutes, options = {}) => {
  const {
    adminExempt = true,
    storeInDb = true,
    skipAuthenticatedUsers = false
  } = options;
  
  const windowMs = windowMinutes * 60 * 1000;
  
  // 메모리 캐시 (서버리스 환경에서는 함수 호출 간에 유지되지 않음)
  const cache = {};
  
  return async (req, res, next) => {
    const logger = getContextLogger();
    const now = Date.now();
    
    try {
      // 요청 식별자 (IP 주소 또는 사용자 ID)
      let identifier = req.ip;
      
      // 인증된 요청인 경우 사용자 ID 사용
      if (req.user && req.user.uid) {
        // 관리자 제외 옵션 확인
        if (adminExempt && req.user.roles && req.user.roles.includes('admin')) {
          return next();
        }
        
        // 인증된 사용자 제외 옵션 확인
        if (skipAuthenticatedUsers) {
          return next();
        }
        
        identifier = req.user.uid;
      }
      
      // API 경로별 분리
      const key = `ratelimit:${req.method}:${req.path}:${identifier}`;
      
      // Firestore 사용 여부 확인
      if (storeInDb) {
        // Firestore에서 제한 정보 조회
        const limitRef = admin.firestore().collection('rateLimits').doc(key);
        const limitDoc = await limitRef.get();
        
        let limitData = {
          count: 0,
          resetTime: now + windowMs
        };
        
        if (limitDoc.exists) {
          limitData = limitDoc.data();
          
          // 시간 창이 초기화되었는지 확인
          if (limitData.resetTime <= now) {
            limitData = {
              count: 0,
              resetTime: now + windowMs
            };
          }
        }
        
        // 제한 초과 확인
        if (limitData.count >= maxRequests) {
          const retryAfter = Math.ceil((limitData.resetTime - now) / 1000);
          
          // 응답 헤더 설정
          res.set('Retry-After', retryAfter.toString());
          
          logger.warn(`Rate limit exceeded for ${key}`);
          return next(new TooManyRequestsError(`Too many requests, please try again in ${retryAfter} seconds`));
        }
        
        // 요청 카운트 증가
        await limitRef.set({
          count: admin.firestore.FieldValue.increment(1),
          resetTime: limitData.resetTime,
          lastRequest: now
        }, { merge: true });
      } else {
        // 메모리 캐시 사용 (개발 환경 또는 짧은 기간 제한용)
        if (!cache[key] || cache[key].resetTime <= now) {
          cache[key] = {
            count: 0,
            resetTime: now + windowMs
          };
        }
        
        // 제한 초과 확인
        if (cache[key].count >= maxRequests) {
          const retryAfter = Math.ceil((cache[key].resetTime - now) / 1000);
          
          // 응답 헤더 설정
          res.set('Retry-After', retryAfter.toString());
          
          logger.warn(`Rate limit exceeded for ${key}`);
          return next(new TooManyRequestsError(`Too many requests, please try again in ${retryAfter} seconds`));
        }
        
        // 요청 카운트 증가
        cache[key].count++;
      }
      
      next();
    } catch (error) {
      logger.error('Rate limiter error:', error);
      
      // 속도 제한 오류가 발생해도 요청은 진행
      next();
    }
  };
};

module.exports = {
  createRateLimiter
};
