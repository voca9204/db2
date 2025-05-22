/**
 * API 경로 구성 모듈
 * 
 * Firebase Hosting rewrites 규칙 생성 및 API 경로 관리를 위한 모듈
 * Task #26, 서브태스크 #7 API 경로 표준화 구현
 */

// API 경로 정의
const paths = {
  // 고가치 사용자 API 경로
  highValueUsers: {
    root: '/api/v1/users/high-value',
    active: '/api/v1/users/high-value/active',
    dormant: '/api/v1/users/high-value/dormant',
    export: '/api/v1/users/high-value/export/csv',
    analysis: '/api/v1/users/high-value/analysis',
    report: '/api/v1/users/high-value/report'
  },
  
  // 레거시 지원 경로
  legacy: {
    highValueUsersApi: '/api/highValueUsersApi',
    activeUsers: '/activeUsers',
    dormantUsers: '/dormantUsers'
  },
  
  // 유틸리티 API 경로
  utils: {
    health: '/api/v1/health',
    test: '/api/v1/test/db',
    hello: '/api/v1/hello'
  }
};

/**
 * Firebase Hosting rewrites 구성 생성
 * @returns {Array} Firebase rewrites 구성 배열
 */
function createRewriteRules() {
  return [
    // 표준 API 경로 (v1)
    {
      source: `${paths.highValueUsers.root}`,
      function: "highValueUsersApiV2"
    },
    {
      source: `${paths.highValueUsers.root}/**`,
      function: "highValueUsersApiV2"
    },
    {
      source: `${paths.highValueUsers.active}`,
      function: "activeUsers"
    },
    {
      source: `${paths.highValueUsers.dormant}`,
      function: "dormantUsers"
    },
    {
      source: `${paths.highValueUsers.analysis}`,
      function: "highValueUsersAnalysis"
    },
    {
      source: `${paths.highValueUsers.report}`,
      function: "highValueUserReport"
    },
    
    // 레거시 경로 지원
    {
      source: `${paths.legacy.highValueUsersApi}/**`,
      function: "highValueUsersApi"
    },
    {
      source: `${paths.legacy.activeUsers}`,
      function: "activeUsers"
    },
    {
      source: `${paths.legacy.dormantUsers}`,
      function: "dormantUsers"
    },
    
    // 유틸리티 API
    {
      source: `${paths.utils.health}`,
      function: "healthCheck"
    },
    {
      source: `${paths.utils.test}`,
      function: "testDbConnection"
    },
    {
      source: `${paths.utils.hello}`,
      function: "helloWorld"
    }
  ];
}

module.exports = {
  paths,
  createRewriteRules
};
