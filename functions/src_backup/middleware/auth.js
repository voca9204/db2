/**
 * 인증 및 권한 관리 미들웨어
 */

const admin = require('firebase-admin');
const { UnauthorizedError, ForbiddenError } = require('./error-handler');

/**
 * Firebase Auth 토큰 검증 미들웨어
 * @param {Request} req 요청 객체
 * @param {Response} res 응답 객체
 * @param {NextFunction} next Express 다음 미들웨어
 * @return {void}
 */
const authenticate = async (req, res, next) => {
  const authHeader = req.headers.authorization;
  
  // 인증 헤더가 없는 경우 예외 처리
  if (!authHeader || !authHeader.startsWith('Bearer ')) {
    return next(new UnauthorizedError('Authorization header is required'));
  }
  
  const token = authHeader.split('Bearer ')[1];
  
  try {
    const decodedToken = await admin.auth().verifyIdToken(token);
    req.user = decodedToken;
    next();
  } catch (error) {
    console.error('Authentication error:', error);
    next(new UnauthorizedError('Invalid authentication token'));
  }
};

/**
 * 특정 권한을 가진 사용자만 접근 허용하는 미들웨어
 * @param {Array|string} roles 필요한 권한 목록
 * @return {Function} 미들웨어 함수
 */
const authorize = (roles = []) => {
  // 단일 문자열을 배열로 변환
  const requiredRoles = Array.isArray(roles) ? roles : [roles];
  
  return async (req, res, next) => {
    // 사용자 인증 정보 확인
    if (!req.user) {
      return next(new UnauthorizedError('Authentication required'));
    }
    
    // 필요한 권한이 없으면 모든 인증된 사용자 허용
    if (requiredRoles.length === 0) {
      return next();
    }
    
    try {
      // Firestore에서 사용자 권한 정보 가져오기
      const userDoc = await admin.firestore()
        .collection('users')
        .doc(req.user.uid)
        .get();
      
      if (!userDoc.exists) {
        return next(new ForbiddenError('User profile not found'));
      }
      
      const userData = userDoc.data();
      const userRoles = userData.roles || [];
      
      // 필요한 권한 확인
      const hasRequiredRole = requiredRoles.some(role => userRoles.includes(role));
      
      if (!hasRequiredRole) {
        return next(new ForbiddenError('Insufficient permissions'));
      }
      
      // 사용자 정보를 요청 객체에 추가
      req.userData = userData;
      next();
    } catch (error) {
      console.error('Authorization error:', error);
      next(new ForbiddenError('Error checking permissions'));
    }
  };
};

/**
 * 개발 환경에서 인증 우회를 위한 미들웨어
 * @param {Request} req 요청 객체
 * @param {Response} res 응답 객체
 * @param {NextFunction} next Express 다음 미들웨어
 */
const devAuthenticate = (req, res, next) => {
  // 개발 환경에서만 사용 가능
  if (process.env.NODE_ENV !== 'development') {
    return next(new UnauthorizedError('Authentication required'));
  }
  
  // 개발 환경에서 테스트를 위한 사용자 정보 설정
  req.user = {
    uid: 'dev-user',
    email: 'dev@example.com',
    name: 'Development User',
  };
  
  req.userData = {
    uid: 'dev-user',
    email: 'dev@example.com',
    name: 'Development User',
    roles: ['admin'],
  };
  
  next();
};

module.exports = {
  authenticate,
  authorize,
  devAuthenticate,
};
