/**
 * 인증 및 권한 미들웨어
 * Firebase Authentication 기반 인증 및 역할 기반 접근 제어
 */

const admin = require('firebase-admin');
const { getContextLogger } = require('../../utils/logger');
const { UnauthorizedError, ForbiddenError } = require('../utils/error-handler');

/**
 * 인증 미들웨어
 * Firebase Authentication 토큰 검증
 * @param {Request} req - Express 요청 객체
 * @param {Response} res - Express 응답 객체
 * @param {Function} next - 다음 미들웨어 함수
 */
const authenticate = async (req, res, next) => {
  const logger = getContextLogger();
  
  try {
    // 개발 환경에서 인증 우회 (환경 변수로 설정된 경우)
    if (process.env.NODE_ENV === 'development' && process.env.AUTH_BYPASS === 'true') {
      logger.warn('Authentication bypassed in development environment!');
      
      // 테스트용 사용자 정보 설정
      req.user = {
        uid: 'dev-user-123',
        email: 'dev@example.com',
        name: 'Development User',
        roles: ['admin']
      };
      
      return next();
    }
    
    // Authorization 헤더에서 토큰 추출
    const authHeader = req.headers.authorization;
    
    if (!authHeader || !authHeader.startsWith('Bearer ')) {
      throw new UnauthorizedError('Authentication token is required');
    }
    
    const idToken = authHeader.split('Bearer ')[1];
    
    // Firebase Authentication 토큰 검증
    const decodedToken = await admin.auth().verifyIdToken(idToken);
    
    if (!decodedToken) {
      throw new UnauthorizedError('Invalid authentication token');
    }
    
    // 요청 객체에 사용자 정보 설정
    req.user = decodedToken;
    
    // 사용자 프로필 조회 (추가 정보)
    try {
      const userDoc = await admin.firestore().collection('users').doc(decodedToken.uid).get();
      
      if (userDoc.exists) {
        // Firestore에서 사용자 프로필 정보 추가
        req.userProfile = userDoc.data();
        
        // 역할 정보 설정
        if (req.userProfile.roles && Array.isArray(req.userProfile.roles)) {
          req.user.roles = req.userProfile.roles;
        } else {
          req.user.roles = [];
        }
      } else {
        // 사용자 프로필이 없는 경우 역할 배열 초기화
        req.user.roles = [];
      }
    } catch (profileError) {
      logger.warn('Error fetching user profile:', profileError);
      req.user.roles = [];
    }
    
    logger.info(`User authenticated: ${req.user.email || req.user.uid}`);
    next();
  } catch (error) {
    logger.error('Authentication error:', error);
    
    if (error instanceof UnauthorizedError) {
      return next(error);
    }
    
    next(new UnauthorizedError('Authentication failed'));
  }
};

/**
 * 역할 기반 권한 부여 미들웨어
 * 지정된 역할을 가진 사용자만 접근 허용
 * @param {Array<string>} allowedRoles - 허용된 역할 배열
 * @return {Function} Express 미들웨어
 */
const authorize = (allowedRoles = []) => {
  return (req, res, next) => {
    const logger = getContextLogger();
    
    try {
      // 인증되지 않은 요청 확인
      if (!req.user) {
        throw new UnauthorizedError('User not authenticated');
      }
      
      // 개발 환경에서 권한 우회 (환경 변수로 설정된 경우)
      if (process.env.NODE_ENV === 'development' && process.env.AUTH_BYPASS === 'true') {
        logger.warn('Authorization bypassed in development environment!');
        return next();
      }
      
      // 사용자의 역할 확인
      const userRoles = req.user.roles || [];
      
      // 필요한 역할이 없는 경우 모든 인증된 사용자 허용
      if (allowedRoles.length === 0) {
        return next();
      }
      
      // 사용자의 역할이 허용된 역할 목록에 포함되는지 확인
      const hasPermission = allowedRoles.some(role => userRoles.includes(role));
      
      if (!hasPermission) {
        logger.warn(`Access denied: User ${req.user.email || req.user.uid} with roles [${userRoles.join(', ')}] attempted to access resource requiring roles [${allowedRoles.join(', ')}]`);
        throw new ForbiddenError('Insufficient permissions to access this resource');
      }
      
      logger.info(`User ${req.user.email || req.user.uid} granted access with role(s): [${userRoles.join(', ')}]`);
      next();
    } catch (error) {
      next(error);
    }
  };
};

/**
 * 개발 환경용 인증 우회 미들웨어
 * 개발 및 테스트 환경에서만 사용
 * @param {Request} req - Express 요청 객체
 * @param {Response} res - Express 응답 객체
 * @param {Function} next - 다음 미들웨어 함수
 */
const devAuthenticate = (req, res, next) => {
  const logger = getContextLogger();
  
  if (process.env.NODE_ENV !== 'development' && process.env.NODE_ENV !== 'test') {
    logger.error('Development authentication attempted in production environment!');
    return next(new UnauthorizedError('Authentication failed'));
  }
  
  logger.warn('Using development authentication bypass!');
  
  // 테스트용 사용자 정보 설정
  req.user = {
    uid: 'dev-user-123',
    email: 'dev@example.com',
    name: 'Development User',
    roles: ['admin', 'analyst']
  };
  
  next();
};

module.exports = {
  authenticate,
  authorize,
  devAuthenticate
};
