/**
 * API 버전 관리 유틸리티
 * API 버전 관리를 위한 라우터 및 유틸리티 함수
 */

const express = require('express');
const { getContextLogger } = require('../../utils/logger');

/**
 * 버전별 라우터 생성
 * 
 * @param {string} version - API 버전 (예: 'v1', 'v2')
 * @return {express.Router} 버전별 라우터
 */
const createVersionedRouter = (version) => {
  const router = express.Router();
  const logger = getContextLogger();
  
  // 버전 정보를 요청 객체에 추가
  router.use((req, res, next) => {
    req.apiVersion = version;
    
    // 응답 헤더에 API 버전 정보 추가
    res.setHeader('X-API-Version', version);
    
    logger.debug(`API request [${version}]: ${req.method} ${req.originalUrl}`);
    
    next();
  });
  
  return router;
};

/**
 * API 버전 관리를 위한 라우터 팩토리
 */
class ApiVersionManager {
  /**
   * 생성자
   */
  constructor() {
    this.versions = {};
    this.mainRouter = express.Router();
    this.latestVersion = null;
  }
  
  /**
   * 버전별 라우터 등록
   * 
   * @param {string} version - API 버전 (예: 'v1', 'v2')
   * @param {Function} setupFn - 라우터 설정 함수
   * @return {ApiVersionManager} 체인 호출을 위한 인스턴스 반환
   */
  addVersion(version, setupFn) {
    // 버전 형식 확인
    if (!version.match(/^v\d+$/)) {
      throw new Error(`Invalid API version format: ${version}. Expected format: 'v1', 'v2', etc.`);
    }
    
    // 중복 버전 확인
    if (this.versions[version]) {
      throw new Error(`API version ${version} already registered`);
    }
    
    // 버전별 라우터 생성
    const versionedRouter = createVersionedRouter(version);
    
    // 라우터 설정 함수 실행
    if (typeof setupFn === 'function') {
      setupFn(versionedRouter);
    }
    
    // 버전별 라우터 등록
    this.versions[version] = versionedRouter;
    
    // 최신 버전 업데이트
    const versionNumber = parseInt(version.substring(1), 10);
    const latestNumber = this.latestVersion ? parseInt(this.latestVersion.substring(1), 10) : 0;
    
    if (versionNumber > latestNumber) {
      this.latestVersion = version;
    }
    
    return this;
  }
  
  /**
   * 버전별 라우터 가져오기
   * 
   * @param {string} version - API 버전
   * @return {express.Router|null} 버전별 라우터 또는 null
   */
  getRouter(version) {
    return this.versions[version] || null;
  }
  
  /**
   * 모든 버전 라우터 설정
   * 
   * @return {express.Router} 메인 라우터
   */
  setup() {
    const logger = getContextLogger();
    
    // 각 버전별 라우터 등록
    Object.entries(this.versions).forEach(([version, router]) => {
      this.mainRouter.use(`/${version}`, router);
      logger.info(`API version ${version} registered`);
    });
    
    // 최신 버전을 기본 경로로 설정
    if (this.latestVersion && this.versions[this.latestVersion]) {
      this.mainRouter.use('/', this.versions[this.latestVersion]);
      logger.info(`API version ${this.latestVersion} set as default`);
    }
    
    return this.mainRouter;
  }
  
  /**
   * 버전 전환 지원 미들웨어
   * 요청 헤더를 통한 버전 전환 지원
   * 
   * @return {Function} 미들웨어 함수
   */
  versionSwitchMiddleware() {
    return (req, res, next) => {
      // API 버전 헤더 확인
      const requestedVersion = req.headers['x-api-version'];
      
      if (requestedVersion && this.versions[requestedVersion]) {
        // URL 경로에서 버전 접두사 제거
        const pathSegments = req.path.split('/');
        if (pathSegments[1] && pathSegments[1].match(/^v\d+$/)) {
          pathSegments.splice(1, 1);
        }
        
        // 요청 경로 재작성
        req.url = pathSegments.join('/');
        
        // 버전별 라우터로 전달
        return this.versions[requestedVersion](req, res, next);
      }
      
      next();
    };
  }
  
  /**
   * API 버전 가용성 확인 라우트 생성
   * 
   * @return {ApiVersionManager} 체인 호출을 위한 인스턴스 반환
   */
  addVersionEndpoint() {
    this.mainRouter.get('/versions', (req, res) => {
      // 지원 버전 목록 생성
      const supportedVersions = Object.keys(this.versions).sort((a, b) => {
        const aNum = parseInt(a.substring(1), 10);
        const bNum = parseInt(b.substring(1), 10);
        return bNum - aNum; // 내림차순 정렬
      });
      
      res.json({
        success: true,
        message: 'API version information',
        data: {
          latest: this.latestVersion,
          current: req.apiVersion || this.latestVersion,
          supported: supportedVersions
        },
        timestamp: new Date().toISOString()
      });
    });
    
    return this;
  }
}

/**
 * API 버전 호환성 검사 미들웨어
 * 
 * @param {Array} supportedVersions - 지원되는 버전 배열
 * @return {Function} 미들웨어 함수
 */
const versionCompatibilityCheck = (supportedVersions = []) => {
  return (req, res, next) => {
    const logger = getContextLogger();
    const clientVersion = req.headers['x-client-version'];
    
    // 클라이언트 버전이 없는 경우 건너뛰기
    if (!clientVersion) {
      return next();
    }
    
    // 지원되는 버전인지 확인
    const isSupported = supportedVersions.some(version => {
      if (version.endsWith('*')) {
        // 와일드카드 버전 지원 (예: '1.*')
        const prefix = version.replace('*', '');
        return clientVersion.startsWith(prefix);
      }
      
      return version === clientVersion;
    });
    
    if (!isSupported) {
      logger.warn(`Unsupported client version: ${clientVersion}`);
      
      // 경고 헤더 추가
      res.setHeader('X-API-Version-Warning', 'Outdated client version');
    }
    
    next();
  };
};

module.exports = {
  createVersionedRouter,
  ApiVersionManager,
  versionCompatibilityCheck
};
