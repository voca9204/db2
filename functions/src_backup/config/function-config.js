/**
 * Firebase Functions 구성 관리
 * 환경별 설정 및 최적화된 성능 구성 제공
 */

const functions = require('firebase-functions');
const fs = require('fs');
const path = require('path');

// 환경 변수 기본값
const defaults = {
  region: 'asia-northeast3',
  timeoutSeconds: 60,
  memory: '512MB',
  minInstances: 0,
  maxInstances: 10,
  vpcConnector: null,
  ingressSettings: 'ALLOW_ALL',
  labels: {
    environment: process.env.NODE_ENV || 'development'
  }
};

// 환경별 설정
const environments = {
  development: {
    minInstances: 0,
    memory: '256MB',
    timeoutSeconds: 60
  },
  staging: {
    minInstances: 0,
    memory: '512MB',
    timeoutSeconds: 60
  },
  production: {
    minInstances: 1, // 콜드 스타트 최소화를 위한 상시 실행 인스턴스
    memory: '512MB',
    timeoutSeconds: 60
  }
};

// 함수 유형별 설정
const functionTypes = {
  api: {
    timeoutSeconds: 60,
    memory: '512MB',
    maxInstances: 10,
    labels: { module: 'api' }
  },
  analyticsJob: {
    timeoutSeconds: 540, // 9분 (최대 10분)
    memory: '1GB',
    maxInstances: 5,
    labels: { module: 'analytics' }
  },
  scheduler: {
    timeoutSeconds: 540, // 9분 (최대 10분)
    memory: '1GB',
    maxInstances: 3,
    labels: { module: 'scheduler' }
  },
  utility: {
    timeoutSeconds: 60,
    memory: '512MB',
    maxInstances: 5,
    labels: { module: 'utility' }
  }
};

/**
 * 구성 파일 조회
 * @return {Object} 구성 객체
 */
function getConfig() {
  try {
    // 함수 구성 파일 불러오기
    const configPath = path.join(__dirname, '../../function-config.json');
    
    if (fs.existsSync(configPath)) {
      return JSON.parse(fs.readFileSync(configPath, 'utf8'));
    }
  } catch (error) {
    console.warn('Error loading function-config.json:', error.message);
  }
  
  return null;
}

/**
 * 현재 환경에 맞는 설정 가져오기
 * @param {string} functionType 함수 유형
 * @return {Object} 환경 설정
 */
function getEnvironmentConfig(functionType) {
  const env = process.env.NODE_ENV || 'development';
  const envConfig = environments[env] || environments.development;
  const typeConfig = functionTypes[functionType] || functionTypes.api;
  
  // 환경 변수 기반 설정 우선
  const config = {
    ...defaults,
    ...envConfig,
    ...typeConfig,
    labels: {
      ...defaults.labels,
      ...typeConfig.labels,
      environment: env
    }
  };
  
  // 환경 변수에서 설정 덮어쓰기
  if (process.env.FUNCTIONS_TIMEOUT_SECONDS) {
    config.timeoutSeconds = parseInt(process.env.FUNCTIONS_TIMEOUT_SECONDS, 10);
  }
  
  if (process.env.FUNCTIONS_MEMORY) {
    config.memory = process.env.FUNCTIONS_MEMORY;
  }
  
  if (process.env.FUNCTIONS_MIN_INSTANCES) {
    config.minInstances = parseInt(process.env.FUNCTIONS_MIN_INSTANCES, 10);
  }
  
  if (process.env.FUNCTIONS_MAX_INSTANCES) {
    config.maxInstances = parseInt(process.env.FUNCTIONS_MAX_INSTANCES, 10);
  }
  
  if (process.env.FUNCTIONS_VPC_CONNECTOR) {
    config.vpcConnector = process.env.FUNCTIONS_VPC_CONNECTOR;
  }
  
  return config;
}

/**
 * Functions 구성 객체 생성
 * @param {string} functionType 함수 유형
 * @return {Object} Functions 구성 객체
 */
function createFunctionConfig(functionType) {
  const config = getEnvironmentConfig(functionType);
  const fileConfig = getConfig();
  
  // 파일 기반 함수별 구성 적용
  if (fileConfig && fileConfig.functions) {
    const functionConfig = fileConfig.functions.find(f => f.id === functionType);
    
    if (functionConfig) {
      return functions
        .region(functionConfig.region || config.region)
        .runWith({
          timeoutSeconds: functionConfig.timeoutSeconds || config.timeoutSeconds,
          memory: functionConfig.memory || config.memory,
          minInstances: functionConfig.minInstances || config.minInstances,
          maxInstances: functionConfig.maxInstances || config.maxInstances,
          vpcConnector: functionConfig.vpcConnector || config.vpcConnector,
          ingressSettings: functionConfig.ingressSettings || config.ingressSettings,
          labels: {
            ...config.labels,
            ...(functionConfig.labels || {})
          }
        });
    }
  }
  
  // 기본 구성 적용
  return functions
    .region(config.region)
    .runWith({
      timeoutSeconds: config.timeoutSeconds,
      memory: config.memory,
      minInstances: config.minInstances,
      maxInstances: config.maxInstances,
      vpcConnector: config.vpcConnector,
      ingressSettings: config.ingressSettings,
      labels: config.labels
    });
}

// API 함수 구성
function getApiConfig() {
  return createFunctionConfig('api');
}

// 분석 작업 함수 구성
function getAnalysisJobConfig() {
  return createFunctionConfig('analyticsJob');
}

// 스케줄러 함수 구성
function getSchedulerConfig() {
  return createFunctionConfig('scheduler');
}

// 유틸리티 함수 구성
function getUtilityConfig() {
  return createFunctionConfig('utility');
}

module.exports = {
  getApiConfig,
  getAnalysisJobConfig,
  getSchedulerConfig,
  getUtilityConfig
};
