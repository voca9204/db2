/**
 * Firebase Functions API 실시간 모니터링 시스템
 * 
 * 이 스크립트는 Firebase Functions API의 상태와 성능을 실시간으로 모니터링하고,
 * 문제가 발생하면 알림을 보내는 시스템을 구현합니다.
 * 
 * 주요 기능:
 * 1. 모든 API 엔드포인트의 가용성과 응답 시간 모니터링
 * 2. 오류율 및 성공률 추적
 * 3. 메모리 사용량 및 CPU 사용량 모니터링
 * 4. 임계값 기반 알림 시스템
 * 5. 모니터링 결과 로깅 및 대시보드 데이터 생성
 */

const axios = require('axios');
const fs = require('fs');
const path = require('path');
const admin = require('firebase-admin');
const { PubSub } = require('@google-cloud/pubsub');
const nodemailer = require('nodemailer');
const cron = require('node-cron');

// 프로젝트 설정
const projectRoot = path.resolve(__dirname, '../..');
const configPath = path.join(projectRoot, 'functions/function-config.json');
const logDir = path.join(projectRoot, 'logs/api-monitor');

// 모니터링 결과 저장 경로
const monitoringResultsPath = path.join(logDir, 'monitoring-results.json');
const alertLogPath = path.join(logDir, 'alerts.json');

// 설정 로드
let config;
try {
  config = JSON.parse(fs.readFileSync(configPath, 'utf8'));
} catch (error) {
  console.error('설정 파일 로드 실패:', error);
  process.exit(1);
}

// Firebase Admin SDK 초기화
let firebaseApp;
try {
  if (process.env.NODE_ENV === 'production') {
    // 프로덕션 환경에서는 기본 인증 사용
    firebaseApp = admin.initializeApp({
      projectId: config.projectId
    });
  } else {
    // 개발 환경에서는 서비스 계정 키 사용
    const serviceAccountPath = path.join(projectRoot, 'service-account-key.json');
    if (fs.existsSync(serviceAccountPath)) {
      const serviceAccount = require(serviceAccountPath);
      firebaseApp = admin.initializeApp({
        credential: admin.credential.cert(serviceAccount),
        projectId: config.projectId
      });
    } else {
      console.warn('서비스 계정 키 파일을 찾을 수 없습니다. 기본 인증을 사용합니다.');
      firebaseApp = admin.initializeApp({
        projectId: config.projectId
      });
    }
  }
} catch (error) {
  console.error('Firebase 초기화 실패:', error);
  process.exit(1);
}

// Firestore 데이터베이스 참조
const db = admin.firestore();
const monitoringCollection = db.collection('api-monitoring');
const alertsCollection = db.collection('api-alerts');

// PubSub 클라이언트 초기화 (알림용)
const pubsub = new PubSub({
  projectId: config.projectId
});

// 이메일 전송을 위한 Nodemailer 설정
const emailTransporter = nodemailer.createTransport({
  service: config.email?.service || 'gmail',
  auth: {
    user: config.email?.user,
    pass: config.email?.password
  }
});

// 로그 디렉토리 생성
if (!fs.existsSync(logDir)) {
  fs.mkdirSync(logDir, { recursive: true });
}

// 초기 모니터링 결과 구조
let monitoringResults = {
  lastUpdated: null,
  endpoints: {},
  alertsTriggered: 0,
  overall: {
    availability: 100,
    averageResponseTime: 0,
    errorRate: 0,
    successRate: 100
  }
};

// 알림 로그 초기화
let alertLog = [];

// 이전 모니터링 결과 로드 (존재하는 경우)
try {
  if (fs.existsSync(monitoringResultsPath)) {
    monitoringResults = JSON.parse(fs.readFileSync(monitoringResultsPath, 'utf8'));
  }

  if (fs.existsSync(alertLogPath)) {
    alertLog = JSON.parse(fs.readFileSync(alertLogPath, 'utf8'));
  }
} catch (error) {
  console.warn('이전 모니터링 결과 로드 실패, 새로 시작합니다:', error);
}

/**
 * API 엔드포인트 구성 로드
 * @returns {Array} 엔드포인트 구성 배열
 */
function loadEndpointConfig() {
  // 엔드포인트 구성 파일 경로
  const endpointConfigPath = path.join(projectRoot, 'functions/src/api-endpoints.json');
  
  // 파일이 존재하면 해당 설정 사용
  if (fs.existsSync(endpointConfigPath)) {
    try {
      return JSON.parse(fs.readFileSync(endpointConfigPath, 'utf8'));
    } catch (error) {
      console.error('엔드포인트 구성 파일 파싱 실패:', error);
    }
  }
  
  // 기본 엔드포인트 설정 (파일이 없는 경우)
  return [
    {
      name: '활성 고가치 사용자 API',
      url: `${config.apiBaseUrl}/api/highValueUsersApi/active`,
      method: 'GET',
      expectedStatus: 200,
      responseTimeThreshold: 2000, // 2초
      headers: {},
      alertThresholds: {
        responseTime: 3000, // 3초 이상 응답 시간
        errorRate: 5, // 5% 이상 오류율
        availability: 95 // 95% 미만 가용성
      }
    },
    {
      name: '휴면 고가치 사용자 API',
      url: `${config.apiBaseUrl}/api/highValueUsersApi/dormant`,
      method: 'GET',
      expectedStatus: 200,
      responseTimeThreshold: 2000,
      headers: {},
      alertThresholds: {
        responseTime: 3000,
        errorRate: 5,
        availability: 95
      }
    },
    {
      name: 'CSV 내보내기 API',
      url: `${config.apiBaseUrl}/api/highValueUsersApi/export/csv`,
      method: 'GET',
      expectedStatus: 200,
      responseTimeThreshold: 5000, // 5초
      headers: {},
      alertThresholds: {
        responseTime: 8000, // 8초
        errorRate: 10, // 10%
        availability: 90 // 90%
      }
    },
    {
      name: '상태 확인 API',
      url: `${config.apiBaseUrl}/api/status`,
      method: 'GET',
      expectedStatus: 200,
      responseTimeThreshold: 1000, // 1초
      headers: {},
      alertThresholds: {
        responseTime: 2000,
        errorRate: 1, // 1%
        availability: 99 // 99%
      }
    }
  ];
}

/**
 * 단일 API 엔드포인트 모니터링
 * @param {Object} endpoint 모니터링할 엔드포인트 정보
 * @returns {Promise<Object>} 모니터링 결과
 */
async function monitorEndpoint(endpoint) {
  const startTime = Date.now();
  let success = false;
  let statusCode = 0;
  let responseTime = 0;
  let error = null;
  
  try {
    const response = await axios({
      method: endpoint.method,
      url: endpoint.url,
      headers: endpoint.headers || {},
      timeout: endpoint.timeout || 30000, // 30초 기본 타임아웃
      validateStatus: null // 모든 상태 코드를 유효한 응답으로 처리
    });
    
    statusCode = response.status;
    responseTime = Date.now() - startTime;
    success = statusCode === endpoint.expectedStatus;
    
  } catch (err) {
    error = {
      message: err.message,
      code: err.code
    };
    responseTime = Date.now() - startTime;
  }
  
  // 결과 구조화
  const result = {
    timestamp: new Date().toISOString(),
    endpoint: endpoint.name,
    url: endpoint.url,
    success,
    statusCode,
    responseTime,
    error
  };
  
  // 알림 조건 확인 및 처리
  await checkAlertConditions(endpoint, result);
  
  // 모니터링 결과 업데이트
  updateMonitoringResults(endpoint, result);
  
  return result;
}

/**
 * 모니터링 결과를 기반으로 알림 조건 확인
 * @param {Object} endpoint 엔드포인트 설정
 * @param {Object} result 모니터링 결과
 */
async function checkAlertConditions(endpoint, result) {
  const thresholds = endpoint.alertThresholds || {};
  const alerts = [];
  
  // 응답 시간 확인
  if (thresholds.responseTime && result.responseTime > thresholds.responseTime) {
    alerts.push({
      type: 'responseTime',
      message: `${endpoint.name}의 응답 시간(${result.responseTime}ms)이 임계값(${thresholds.responseTime}ms)을 초과했습니다.`,
      severity: 'warning'
    });
  }
  
  // 오류 확인
  if (!result.success) {
    alerts.push({
      type: 'error',
      message: `${endpoint.name} 호출 실패: ${result.error ? result.error.message : `상태 코드 ${result.statusCode}`}`,
      severity: 'error'
    });
  }
  
  // 가용성 확인 (이전 결과와 비교)
  if (monitoringResults.endpoints[endpoint.name]) {
    const endpointData = monitoringResults.endpoints[endpoint.name];
    const availability = endpointData.successCount / endpointData.totalCount * 100;
    
    if (thresholds.availability && availability < thresholds.availability) {
      alerts.push({
        type: 'availability',
        message: `${endpoint.name}의 가용성(${availability.toFixed(2)}%)이 임계값(${thresholds.availability}%) 미만입니다.`,
        severity: 'critical'
      });
    }
  }
  
  // 알림 처리
  if (alerts.length > 0) {
    await sendAlerts(endpoint, result, alerts);
  }
}

/**
 * 알림 발송
 * @param {Object} endpoint 엔드포인트 설정
 * @param {Object} result 모니터링 결과
 * @param {Array} alerts 발생한 알림 목록
 */
async function sendAlerts(endpoint, result, alerts) {
  // 타임스탬프 추가
  const timestamp = new Date().toISOString();
  
  // 알림 로그에 추가
  alerts.forEach(alert => {
    const alertRecord = {
      ...alert,
      timestamp,
      endpoint: endpoint.name,
      url: endpoint.url,
      result: {
        success: result.success,
        statusCode: result.statusCode,
        responseTime: result.responseTime
      }
    };
    
    alertLog.push(alertRecord);
    
    // Firestore에 알림 기록
    alertsCollection.add(alertRecord)
      .catch(error => console.error('Firestore에 알림 저장 실패:', error));
    
    // 알림 동작 수행 (심각도에 따라)
    switch (alert.severity) {
      case 'critical':
        // 이메일, PubSub, 텍스트 메시지 등 모든 채널로 알림
        sendEmailAlert(alertRecord);
        publishAlertToPubSub(alertRecord);
        break;
      
      case 'error':
        // 이메일과 PubSub으로 알림
        sendEmailAlert(alertRecord);
        publishAlertToPubSub(alertRecord);
        break;
      
      case 'warning':
        // PubSub으로만 알림
        publishAlertToPubSub(alertRecord);
        break;
      
      default:
        // 로그만 남김
        break;
    }
  });
  
  // alertLog 저장
  saveAlertLog();
  
  // 알림 카운터 증가
  monitoringResults.alertsTriggered += alerts.length;
}

/**
 * 이메일 알림 전송
 * @param {Object} alert 알림 정보
 */
function sendEmailAlert(alert) {
  if (!config.email?.recipients) {
    console.warn('이메일 수신자가 설정되지 않았습니다. 알림 이메일을 보낼 수 없습니다.');
    return;
  }
  
  const mailOptions = {
    from: config.email.user,
    to: config.email.recipients,
    subject: `[API 모니터링 알림] ${alert.severity.toUpperCase()}: ${alert.endpoint}`,
    html: `
      <h1>API 모니터링 알림</h1>
      <p><strong>심각도:</strong> ${alert.severity}</p>
      <p><strong>엔드포인트:</strong> ${alert.endpoint}</p>
      <p><strong>URL:</strong> ${alert.url}</p>
      <p><strong>시간:</strong> ${new Date(alert.timestamp).toLocaleString()}</p>
      <p><strong>메시지:</strong> ${alert.message}</p>
      <h2>상세 정보</h2>
      <p><strong>상태:</strong> ${alert.result.success ? '성공' : '실패'}</p>
      <p><strong>상태 코드:</strong> ${alert.result.statusCode}</p>
      <p><strong>응답 시간:</strong> ${alert.result.responseTime}ms</p>
    `
  };
  
  emailTransporter.sendMail(mailOptions)
    .catch(error => console.error('이메일 알림 전송 실패:', error));
}

/**
 * PubSub을 통한 알림 발행
 * @param {Object} alert 알림 정보
 */
async function publishAlertToPubSub(alert) {
  if (!config.pubsub?.topic) {
    console.warn('PubSub 토픽이 설정되지 않았습니다. PubSub 알림을 발행할 수 없습니다.');
    return;
  }
  
  try {
    const topic = pubsub.topic(config.pubsub.topic);
    const messageId = await topic.publish(Buffer.from(JSON.stringify(alert)));
    console.log(`PubSub 알림 발행됨: ${messageId}`);
  } catch (error) {
    console.error('PubSub 알림 발행 실패:', error);
  }
}

/**
 * 전체 모니터링 결과 업데이트
 * @param {Object} endpoint 엔드포인트 설정
 * @param {Object} result 모니터링 결과
 */
function updateMonitoringResults(endpoint, result) {
  const now = new Date().toISOString();
  
  // 엔드포인트별 결과 초기화 (필요한 경우)
  if (!monitoringResults.endpoints[endpoint.name]) {
    monitoringResults.endpoints[endpoint.name] = {
      lastChecked: null,
      lastSuccess: null,
      lastFailure: null,
      totalCount: 0,
      successCount: 0,
      failureCount: 0,
      responseTimeAvg: 0,
      responseTimeHistory: [],
      statusCodeHistory: []
    };
  }
  
  const endpointData = monitoringResults.endpoints[endpoint.name];
  
  // 카운터 업데이트
  endpointData.totalCount += 1;
  if (result.success) {
    endpointData.successCount += 1;
    endpointData.lastSuccess = now;
  } else {
    endpointData.failureCount += 1;
    endpointData.lastFailure = now;
  }
  
  // 응답 시간 평균 업데이트 (이동 평균)
  endpointData.responseTimeAvg = 
    (endpointData.responseTimeAvg * (endpointData.totalCount - 1) + result.responseTime) / 
    endpointData.totalCount;
  
  // 이력 업데이트 (최대 100개 유지)
  const MAX_HISTORY = 100;
  
  endpointData.responseTimeHistory.push({
    timestamp: now,
    value: result.responseTime
  });
  
  if (endpointData.responseTimeHistory.length > MAX_HISTORY) {
    endpointData.responseTimeHistory.shift();
  }
  
  endpointData.statusCodeHistory.push({
    timestamp: now,
    value: result.statusCode
  });
  
  if (endpointData.statusCodeHistory.length > MAX_HISTORY) {
    endpointData.statusCodeHistory.shift();
  }
  
  // 체크 시간 업데이트
  endpointData.lastChecked = now;
  
  // 전체 통계 업데이트
  updateOverallStatistics();
  
  // 타임스탬프 업데이트
  monitoringResults.lastUpdated = now;
  
  // Firestore에 결과 저장
  saveMonitoringResultsToFirestore(endpoint.name, endpointData);
  
  // 로컬 파일에 결과 저장
  saveMonitoringResults();
}

/**
 * 전체 통계 업데이트
 */
function updateOverallStatistics() {
  const endpoints = Object.values(monitoringResults.endpoints);
  
  if (endpoints.length === 0) return;
  
  // 전체 성공 및 실패 카운트 계산
  const totalCount = endpoints.reduce((sum, endpoint) => sum + endpoint.totalCount, 0);
  const successCount = endpoints.reduce((sum, endpoint) => sum + endpoint.successCount, 0);
  
  // 전체 통계 업데이트
  monitoringResults.overall = {
    availability: (successCount / totalCount) * 100,
    averageResponseTime: endpoints.reduce((sum, endpoint) => sum + endpoint.responseTimeAvg, 0) / endpoints.length,
    errorRate: ((totalCount - successCount) / totalCount) * 100,
    successRate: (successCount / totalCount) * 100
  };
}

/**
 * 모니터링 결과를 로컬 파일로 저장
 */
function saveMonitoringResults() {
  try {
    fs.writeFileSync(monitoringResultsPath, JSON.stringify(monitoringResults, null, 2));
  } catch (error) {
    console.error('모니터링 결과 저장 실패:', error);
  }
}

/**
 * 알림 로그를 로컬 파일로 저장
 */
function saveAlertLog() {
  try {
    // 최대 1000개 항목만 유지
    if (alertLog.length > 1000) {
      alertLog = alertLog.slice(-1000);
    }
    
    fs.writeFileSync(alertLogPath, JSON.stringify(alertLog, null, 2));
  } catch (error) {
    console.error('알림 로그 저장 실패:', error);
  }
}

/**
 * 모니터링 결과를 Firestore에 저장
 * @param {string} endpointName 엔드포인트 이름
 * @param {Object} endpointData 엔드포인트 모니터링 데이터
 */
async function saveMonitoringResultsToFirestore(endpointName, endpointData) {
  try {
    // 엔드포인트별 문서 저장
    await monitoringCollection.doc(endpointName).set({
      lastUpdated: admin.firestore.FieldValue.serverTimestamp(),
      name: endpointName,
      ...endpointData
    });
    
    // 전체 통계 저장
    await monitoringCollection.doc('overall').set({
      lastUpdated: admin.firestore.FieldValue.serverTimestamp(),
      ...monitoringResults.overall,
      alertsTriggered: monitoringResults.alertsTriggered
    });
    
    // 응답 시간 이력 저장 (최근 데이터만)
    const latestResponseTime = endpointData.responseTimeHistory[endpointData.responseTimeHistory.length - 1];
    if (latestResponseTime) {
      await monitoringCollection.doc('responseTimeHistory').collection(endpointName).add({
        timestamp: admin.firestore.Timestamp.fromDate(new Date(latestResponseTime.timestamp)),
        value: latestResponseTime.value
      });
    }
  } catch (error) {
    console.error('Firestore에 모니터링 결과 저장 실패:', error);
  }
}

/**
 * 모든 엔드포인트에 대한 모니터링 실행
 */
async function runMonitoring() {
  console.log('API 모니터링 실행 중...');
  
  // 엔드포인트 구성 로드
  const endpoints = loadEndpointConfig();
  
  // 모든 엔드포인트 모니터링
  const monitoringPromises = endpoints.map(endpoint => monitorEndpoint(endpoint));
  
  try {
    // 병렬로 모니터링 실행
    const results = await Promise.all(monitoringPromises);
    
    // 결과 요약 출력
    console.log('\n모니터링 결과 요약:');
    results.forEach(result => {
      console.log(`- ${result.endpoint}: ${result.success ? '✓' : '✗'} (${result.responseTime}ms)`);
    });
    
    console.log(`\n전체 가용성: ${monitoringResults.overall.availability.toFixed(2)}%`);
    console.log(`평균 응답 시간: ${monitoringResults.overall.averageResponseTime.toFixed(2)}ms`);
    console.log(`오류율: ${monitoringResults.overall.errorRate.toFixed(2)}%`);
    
    return results;
  } catch (error) {
    console.error('모니터링 실행 중 오류 발생:', error);
    throw error;
  }
}

/**
 * 스케줄링된 모니터링 설정
 */
function scheduleMonitoring() {
  // 기본 스케줄: 1분마다 실행
  const schedule = config.monitoringSchedule || '*/1 * * * *';
  
  console.log(`모니터링 스케줄링: ${schedule}`);
  
  cron.schedule(schedule, async () => {
    try {
      await runMonitoring();
    } catch (error) {
      console.error('스케줄링된 모니터링 실행 실패:', error);
    }
  });
}

/**
 * API 모니터링 시스템 시작
 */
async function startApiMonitoring() {
  console.log('API 모니터링 시스템 시작...');
  
  // 즉시 한 번 실행
  try {
    await runMonitoring();
  } catch (error) {
    console.error('초기 모니터링 실행 실패:', error);
  }
  
  // 스케줄링 설정
  scheduleMonitoring();
  
  console.log('API 모니터링 시스템이 성공적으로 시작되었습니다.');
}

// 스크립트가 직접 실행된 경우 모니터링 시작
if (require.main === module) {
  startApiMonitoring()
    .catch(error => {
      console.error('API 모니터링 시스템 시작 실패:', error);
      process.exit(1);
    });
}

module.exports = {
  startApiMonitoring,
  runMonitoring,
  monitorEndpoint,
  loadEndpointConfig
};
