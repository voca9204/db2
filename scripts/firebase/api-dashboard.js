/**
 * API 모니터링 대시보드
 * 
 * 이 스크립트는 Firebase Functions API 모니터링 결과를 시각화하기 위한
 * 웹 대시보드를 제공합니다. Express.js를 사용하여 구현되었습니다.
 */

const express = require('express');
const http = require('http');
const path = require('path');
const fs = require('fs');
const admin = require('firebase-admin');
const socketIo = require('socket.io');
const moment = require('moment');

// 프로젝트 루트 경로
const projectRoot = path.resolve(__dirname, '../..');
const configPath = path.join(projectRoot, 'functions/function-config.json');
const logDir = path.join(projectRoot, 'logs/api-monitor');

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
  // 개발 환경에서는 서비스 계정 키 사용
  const serviceAccountPath = path.join(projectRoot, 'service-account-key.json');
  if (fs.existsSync(serviceAccountPath)) {
    const serviceAccount = require(serviceAccountPath);
    firebaseApp = admin.initializeApp({
      credential: admin.credential.cert(serviceAccount),
      projectId: config.projectId
    });
  } else {
    // 서비스 계정 키 없이 기본 인증 사용
    firebaseApp = admin.initializeApp({
      projectId: config.projectId
    });
  }
} catch (error) {
  console.error('Firebase 초기화 실패:', error);
  process.exit(1);
}

// Firestore 데이터베이스 참조
const db = admin.firestore();
const monitoringCollection = db.collection('api-monitoring');
const alertsCollection = db.collection('api-alerts');

// Express 앱 생성
const app = express();
const server = http.createServer(app);
const io = socketIo(server);

// 정적 파일 제공
app.use(express.static(path.join(__dirname, 'public')));
app.use(express.json());

// 뷰 엔진 설정
app.set('view engine', 'ejs');
app.set('views', path.join(__dirname, 'views'));

// 대시보드 템플릿 디렉토리 생성
const viewsDir = path.join(__dirname, 'views');
if (!fs.existsSync(viewsDir)) {
  fs.mkdirSync(viewsDir, { recursive: true });
}

// 정적 파일 디렉토리 생성
const publicDir = path.join(__dirname, 'public');
if (!fs.existsSync(publicDir)) {
  fs.mkdirSync(publicDir, { recursive: true });
  fs.mkdirSync(path.join(publicDir, 'css'), { recursive: true });
  fs.mkdirSync(path.join(publicDir, 'js'), { recursive: true });
}

// 기본 대시보드 HTML 템플릿 생성
const dashboardTemplate = `
<!DOCTYPE html>
<html lang="ko">
<head>
  <meta charset="UTF-8">
  <meta name="viewport" content="width=device-width, initial-scale=1.0">
  <title>API 모니터링 대시보드</title>
  <link href="https://cdn.jsdelivr.net/npm/bootstrap@5.2.3/dist/css/bootstrap.min.css" rel="stylesheet">
  <link href="/css/dashboard.css" rel="stylesheet">
  <script src="https://cdn.jsdelivr.net/npm/chart.js@3.9.1/dist/chart.min.js"></script>
  <script src="/socket.io/socket.io.js"></script>
</head>
<body>
  <nav class="navbar navbar-dark bg-dark">
    <div class="container-fluid">
      <a class="navbar-brand" href="#">API 모니터링 대시보드</a>
      <div class="navbar-text text-light" id="last-updated"></div>
    </div>
  </nav>
  
  <div class="container-fluid mt-3">
    <div class="row">
      <div class="col-md-3">
        <div class="card">
          <div class="card-header">전체 상태</div>
          <div class="card-body">
            <div id="overall-status" class="text-center p-3">
              <div class="display-1" id="overall-status-icon">⌛</div>
              <div class="mt-2" id="overall-status-text">로딩 중...</div>
            </div>
            <div class="row mt-3">
              <div class="col-6">
                <div class="text-muted">가용성</div>
                <div class="h4" id="overall-availability">-</div>
              </div>
              <div class="col-6">
                <div class="text-muted">오류율</div>
                <div class="h4" id="overall-error-rate">-</div>
              </div>
            </div>
          </div>
        </div>
        
        <div class="card mt-3">
          <div class="card-header">알림</div>
          <div class="card-body p-0">
            <div id="alerts-container" class="list-group list-group-flush">
              <div class="list-group-item text-center text-muted">
                알림 데이터 로딩 중...
              </div>
            </div>
          </div>
        </div>
      </div>
      
      <div class="col-md-9">
        <div class="card">
          <div class="card-header">
            <ul class="nav nav-tabs card-header-tabs" id="endpoint-tabs">
              <li class="nav-item">
                <a class="nav-link active" data-bs-toggle="tab" href="#overview">개요</a>
              </li>
            </ul>
          </div>
          <div class="card-body">
            <div class="tab-content">
              <div class="tab-pane fade show active" id="overview">
                <div class="row">
                  <div class="col-md-6">
                    <canvas id="response-time-chart"></canvas>
                  </div>
                  <div class="col-md-6">
                    <canvas id="availability-chart"></canvas>
                  </div>
                </div>
                
                <div class="table-responsive mt-4">
                  <table class="table table-hover">
                    <thead>
                      <tr>
                        <th>엔드포인트</th>
                        <th>상태</th>
                        <th>평균 응답 시간</th>
                        <th>가용성</th>
                        <th>마지막 확인</th>
                      </tr>
                    </thead>
                    <tbody id="endpoints-table">
                      <tr>
                        <td colspan="5" class="text-center">데이터 로딩 중...</td>
                      </tr>
                    </tbody>
                  </table>
                </div>
              </div>
            </div>
          </div>
        </div>
        
        <div class="card mt-3">
          <div class="card-header">실시간 모니터링 로그</div>
          <div class="card-body p-0">
            <div id="monitoring-log" class="log-container">
              <div class="log-entry text-muted">로그 데이터 로딩 중...</div>
            </div>
          </div>
        </div>
      </div>
    </div>
  </div>
  
  <script src="https://cdn.jsdelivr.net/npm/bootstrap@5.2.3/dist/js/bootstrap.bundle.min.js"></script>
  <script src="/js/dashboard.js"></script>
</body>
</html>
`;

// 대시보드 CSS 생성
const dashboardCss = `
body {
  font-family: 'Segoe UI', Tahoma, Geneva, Verdana, sans-serif;
  background-color: #f8f9fa;
}

.card {
  box-shadow: 0 0.125rem 0.25rem rgba(0, 0, 0, 0.075);
  border-radius: 0.5rem;
  border: none;
}

.card-header {
  background-color: #fff;
  border-bottom: 1px solid rgba(0, 0, 0, 0.05);
  font-weight: 600;
}

.log-container {
  max-height: 300px;
  overflow-y: auto;
  font-family: 'Courier New', Courier, monospace;
  font-size: 0.85rem;
  background-color: #f8f9fa;
}

.log-entry {
  padding: 0.5rem 1rem;
  border-bottom: 1px solid rgba(0, 0, 0, 0.05);
}

.log-entry:last-child {
  border-bottom: none;
}

.log-entry.error {
  background-color: #fff3f3;
  border-left: 3px solid #dc3545;
}

.log-entry.warning {
  background-color: #fff9e6;
  border-left: 3px solid #ffc107;
}

.log-entry.success {
  background-color: #f0fff4;
  border-left: 3px solid #28a745;
}

.status-healthy {
  color: #28a745;
}

.status-warning {
  color: #ffc107;
}

.status-critical {
  color: #dc3545;
}
`;

// 대시보드 JavaScript 생성
const dashboardJs = `
// Socket.IO 연결
const socket = io();

// 차트 객체
let responseTimeChart;
let availabilityChart;

// 엔드포인트 데이터
let endpointsData = {};

// 페이지 로드 시 초기화
document.addEventListener('DOMContentLoaded', () => {
  initCharts();
  initSocketListeners();
  loadInitialData();
});

// 차트 초기화
function initCharts() {
  // 응답 시간 차트
  const responseTimeCtx = document.getElementById('response-time-chart').getContext('2d');
  responseTimeChart = new Chart(responseTimeCtx, {
    type: 'line',
    data: {
      labels: [],
      datasets: []
    },
    options: {
      responsive: true,
      plugins: {
        title: {
          display: true,
          text: '응답 시간 (ms)'
        },
        legend: {
          position: 'bottom'
        }
      },
      scales: {
        y: {
          beginAtZero: true
        }
      }
    }
  });

  // 가용성 차트
  const availabilityCtx = document.getElementById('availability-chart').getContext('2d');
  availabilityChart = new Chart(availabilityCtx, {
    type: 'bar',
    data: {
      labels: [],
      datasets: [{
        label: '가용성 (%)',
        backgroundColor: '#4CAF50',
        data: []
      }]
    },
    options: {
      responsive: true,
      plugins: {
        title: {
          display: true,
          text: '가용성 (%)'
        },
        legend: {
          display: false
        }
      },
      scales: {
        y: {
          min: 0,
          max: 100
        }
      }
    }
  });
}

// Socket.IO 이벤트 리스너 설정
function initSocketListeners() {
  // 모니터링 결과 업데이트
  socket.on('monitoring-update', (data) => {
    updateDashboard(data);
  });

  // 알림 업데이트
  socket.on('alert', (alert) => {
    addAlert(alert);
    addLogEntry({
      timestamp: alert.timestamp,
      message: alert.message,
      type: alert.severity
    });
  });

  // 로그 업데이트
  socket.on('log', (logEntry) => {
    addLogEntry(logEntry);
  });
}

// 초기 데이터 로드
function loadInitialData() {
  fetch('/api/monitoring-data')
    .then(response => response.json())
    .then(data => {
      updateDashboard(data);
    })
    .catch(error => {
      console.error('초기 데이터 로드 실패:', error);
      addLogEntry({
        timestamp: new Date().toISOString(),
        message: '초기 데이터 로드 실패: ' + error.message,
        type: 'error'
      });
    });

  fetch('/api/alerts')
    .then(response => response.json())
    .then(alerts => {
      // 알림 컨테이너 초기화
      const alertsContainer = document.getElementById('alerts-container');
      alertsContainer.innerHTML = '';

      // 알림이 없는 경우
      if (alerts.length === 0) {
        alertsContainer.innerHTML = '<div class="list-group-item text-center text-muted">알림 없음</div>';
        return;
      }

      // 최신 알림 10개만 표시
      alerts.slice(0, 10).forEach(alert => {
        addAlert(alert, false);
      });
    })
    .catch(error => {
      console.error('알림 데이터 로드 실패:', error);
    });
}

// 대시보드 업데이트
function updateDashboard(data) {
  // 마지막 업데이트 시간
  document.getElementById('last-updated').textContent = '마지막 업데이트: ' + formatDateTime(data.lastUpdated);

  // 전체 상태 업데이트
  updateOverallStatus(data.overall);

  // 엔드포인트 데이터 저장
  endpointsData = data.endpoints;

  // 엔드포인트 테이블 업데이트
  updateEndpointsTable(endpointsData);

  // 차트 업데이트
  updateCharts(endpointsData);

  // 탭 업데이트
  updateEndpointTabs(endpointsData);
}

// 전체 상태 업데이트
function updateOverallStatus(overall) {
  const statusIcon = document.getElementById('overall-status-icon');
  const statusText = document.getElementById('overall-status-text');
  const availabilityEl = document.getElementById('overall-availability');
  const errorRateEl = document.getElementById('overall-error-rate');

  // 가용성 및 오류율 표시
  availabilityEl.textContent = overall.availability.toFixed(2) + '%';
  errorRateEl.textContent = overall.errorRate.toFixed(2) + '%';

  // 상태 아이콘 및 텍스트 설정
  if (overall.availability >= 99) {
    statusIcon.textContent = '✅';
    statusIcon.className = 'display-1 status-healthy';
    statusText.textContent = '정상';
    statusText.className = 'mt-2 status-healthy';
  } else if (overall.availability >= 90) {
    statusIcon.textContent = '⚠️';
    statusIcon.className = 'display-1 status-warning';
    statusText.textContent = '주의';
    statusText.className = 'mt-2 status-warning';
  } else {
    statusIcon.textContent = '❌';
    statusIcon.className = 'display-1 status-critical';
    statusText.textContent = '위험';
    statusText.className = 'mt-2 status-critical';
  }
}

// 엔드포인트 테이블 업데이트
function updateEndpointsTable(endpoints) {
  const table = document.getElementById('endpoints-table');
  table.innerHTML = '';

  Object.entries(endpoints).forEach(([name, data]) => {
    const row = document.createElement('tr');
    
    // 가용성 계산
    const availability = data.totalCount > 0 
      ? (data.successCount / data.totalCount * 100).toFixed(2) 
      : '0.00';
    
    // 상태 클래스 설정
    let statusClass = 'status-healthy';
    let statusText = '정상';
    
    if (availability < 90) {
      statusClass = 'status-critical';
      statusText = '위험';
    } else if (availability < 99) {
      statusClass = 'status-warning';
      statusText = '주의';
    }
    
    row.innerHTML = `
      <td>${name}</td>
      <td><span class="${statusClass}">${statusText}</span></td>
      <td>${data.responseTimeAvg.toFixed(0)} ms</td>
      <td>${availability}%</td>
      <td>${formatDateTime(data.lastChecked)}</td>
    `;
    
    table.appendChild(row);
  });
}

// 차트 업데이트
function updateCharts(endpoints) {
  // 차트 데이터 준비
  const endpointNames = Object.keys(endpoints);
  const responseTimeData = [];
  const availabilityData = [];
  
  // 각 엔드포인트에 대한 데이터 설정
  endpointNames.forEach((name, index) => {
    const endpoint = endpoints[name];
    
    // 가용성 계산
    const availability = endpoint.totalCount > 0 
      ? (endpoint.successCount / endpoint.totalCount * 100) 
      : 0;
    
    availabilityData.push(availability);
    
    // 응답 시간 데이터 세트가 없으면 추가
    if (responseTimeChart.data.datasets.length <= index) {
      responseTimeChart.data.datasets.push({
        label: name,
        data: [],
        borderColor: getRandomColor(),
        fill: false,
        tension: 0.1
      });
    }
    
    // 최근 10개의 응답 시간 데이터 사용
    const recentTimes = endpoint.responseTimeHistory
      .slice(-10)
      .map(item => item.value);
    
    responseTimeChart.data.datasets[index].data = recentTimes;
  });
  
  // 시간 레이블 준비 (최근 10개)
  const timeLabels = endpoints[endpointNames[0]]?.responseTimeHistory
    .slice(-10)
    .map(item => formatTime(item.timestamp)) || [];
  
  responseTimeChart.data.labels = timeLabels;
  
  // 가용성 차트 업데이트
  availabilityChart.data.labels = endpointNames;
  availabilityChart.data.datasets[0].data = availabilityData;
  
  // 차트 업데이트
  responseTimeChart.update();
  availabilityChart.update();
}

// 엔드포인트 탭 업데이트
function updateEndpointTabs(endpoints) {
  const tabsContainer = document.getElementById('endpoint-tabs');
  const tabContent = document.querySelector('.tab-content');
  
  // 이미 개요 탭이 있는지 확인
  const hasOverviewTab = tabsContainer.querySelector('a[href="#overview"]');
  
  // 개요 탭이 없으면 추가
  if (!hasOverviewTab) {
    const overviewTab = document.createElement('li');
    overviewTab.className = 'nav-item';
    overviewTab.innerHTML = '<a class="nav-link active" data-bs-toggle="tab" href="#overview">개요</a>';
    tabsContainer.appendChild(overviewTab);
    
    const overviewPane = document.createElement('div');
    overviewPane.className = 'tab-pane fade show active';
    overviewPane.id = 'overview';
    tabContent.appendChild(overviewPane);
  }
  
  // 각 엔드포인트에 대한 탭 추가
  Object.keys(endpoints).forEach(name => {
    const tabId = 'tab-' + name.replace(/[^a-z0-9]/gi, '-').toLowerCase();
    const paneId = 'pane-' + name.replace(/[^a-z0-9]/gi, '-').toLowerCase();
    
    // 이미 탭이 있는지 확인
    const existingTab = tabsContainer.querySelector(`a[href="#${paneId}"]`);
    
    if (!existingTab) {
      // 탭 생성
      const tab = document.createElement('li');
      tab.className = 'nav-item';
      tab.innerHTML = `<a class="nav-link" data-bs-toggle="tab" href="#${paneId}">${name}</a>`;
      tabsContainer.appendChild(tab);
      
      // 탭 콘텐츠 생성
      const pane = document.createElement('div');
      pane.className = 'tab-pane fade';
      pane.id = paneId;
      
      // 엔드포인트 상세 정보 추가
      pane.innerHTML = `
        <div class="endpoint-details mb-4">
          <h4>${name}</h4>
          <div class="row g-4 mt-2">
            <div class="col-md-6">
              <div class="card h-100">
                <div class="card-header">상태 정보</div>
                <div class="card-body">
                  <div class="row">
                    <div class="col-6">
                      <div class="text-muted">총 요청</div>
                      <div class="h5" id="${tabId}-total-count">-</div>
                    </div>
                    <div class="col-6">
                      <div class="text-muted">성공 요청</div>
                      <div class="h5" id="${tabId}-success-count">-</div>
                    </div>
                  </div>
                  <div class="row mt-3">
                    <div class="col-6">
                      <div class="text-muted">마지막 성공</div>
                      <div class="small" id="${tabId}-last-success">-</div>
                    </div>
                    <div class="col-6">
                      <div class="text-muted">마지막 실패</div>
                      <div class="small" id="${tabId}-last-failure">-</div>
                    </div>
                  </div>
                </div>
              </div>
            </div>
            <div class="col-md-6">
              <div class="card h-100">
                <div class="card-header">응답 시간</div>
                <div class="card-body">
                  <canvas id="${tabId}-response-time-chart" height="200"></canvas>
                </div>
              </div>
            </div>
          </div>
          
          <div class="card mt-4">
            <div class="card-header">상태 코드 이력</div>
            <div class="card-body">
              <canvas id="${tabId}-status-code-chart" height="100"></canvas>
            </div>
          </div>
        </div>
      `;
      
      tabContent.appendChild(pane);
      
      // 엔드포인트별 차트 초기화
      initEndpointCharts(name, tabId);
    }
    
    // 상태 정보 업데이트
    updateEndpointDetails(name, tabId);
  });
}

// 엔드포인트별 차트 초기화
function initEndpointCharts(endpointName, tabId) {
  // 응답 시간 차트
  const responseTimeCtx = document.getElementById(`${tabId}-response-time-chart`).getContext('2d');
  new Chart(responseTimeCtx, {
    type: 'line',
    data: {
      labels: [],
      datasets: [{
        label: '응답 시간 (ms)',
        data: [],
        borderColor: '#4CAF50',
        fill: false,
        tension: 0.1
      }]
    },
    options: {
      responsive: true,
      plugins: {
        legend: {
          display: false
        }
      },
      scales: {
        y: {
          beginAtZero: true
        }
      }
    }
  });
  
  // 상태 코드 차트
  const statusCodeCtx = document.getElementById(`${tabId}-status-code-chart`).getContext('2d');
  new Chart(statusCodeCtx, {
    type: 'line',
    data: {
      labels: [],
      datasets: [{
        label: '상태 코드',
        data: [],
        borderColor: '#2196F3',
        fill: false,
        tension: 0.1
      }]
    },
    options: {
      responsive: true,
      plugins: {
        legend: {
          display: false
        }
      },
      scales: {
        y: {
          beginAtZero: false
        }
      }
    }
  });
}

// 엔드포인트 상세 정보 업데이트
function updateEndpointDetails(endpointName, tabId) {
  const endpoint = endpointsData[endpointName];
  if (!endpoint) return;
  
  // 상태 정보 업데이트
  document.getElementById(`${tabId}-total-count`).textContent = endpoint.totalCount;
  document.getElementById(`${tabId}-success-count`).textContent = endpoint.successCount;
  document.getElementById(`${tabId}-last-success`).textContent = formatDateTime(endpoint.lastSuccess) || '-';
  document.getElementById(`${tabId}-last-failure`).textContent = formatDateTime(endpoint.lastFailure) || '-';
  
  // 차트 업데이트
  updateEndpointCharts(endpointName, tabId);
}

// 엔드포인트별 차트 업데이트
function updateEndpointCharts(endpointName, tabId) {
  const endpoint = endpointsData[endpointName];
  if (!endpoint) return;
  
  // 응답 시간 차트 업데이트
  const responseTimeChart = Chart.getChart(`${tabId}-response-time-chart`);
  if (responseTimeChart) {
    const responseTimeHistory = endpoint.responseTimeHistory || [];
    
    responseTimeChart.data.labels = responseTimeHistory.map(item => formatTime(item.timestamp));
    responseTimeChart.data.datasets[0].data = responseTimeHistory.map(item => item.value);
    
    responseTimeChart.update();
  }
  
  // 상태 코드 차트 업데이트
  const statusCodeChart = Chart.getChart(`${tabId}-status-code-chart`);
  if (statusCodeChart) {
    const statusCodeHistory = endpoint.statusCodeHistory || [];
    
    statusCodeChart.data.labels = statusCodeHistory.map(item => formatTime(item.timestamp));
    statusCodeChart.data.datasets[0].data = statusCodeHistory.map(item => item.value);
    
    statusCodeChart.update();
  }
}

// 알림 추가
function addAlert(alert, prepend = true) {
  const alertsContainer = document.getElementById('alerts-container');
  
  // "알림 없음" 메시지 제거
  const emptyMessage = alertsContainer.querySelector('.text-center.text-muted');
  if (emptyMessage) {
    alertsContainer.removeChild(emptyMessage);
  }
  
  // 알림 항목 생성
  const alertItem = document.createElement('div');
  alertItem.className = 'list-group-item';
  
  // 심각도에 따른 스타일 적용
  let severityClass = '';
  let severityIcon = '';
  
  switch (alert.severity) {
    case 'critical':
      severityClass = 'text-danger';
      severityIcon = '❌';
      break;
    case 'error':
      severityClass = 'text-danger';
      severityIcon = '⛔';
      break;
    case 'warning':
      severityClass = 'text-warning';
      severityIcon = '⚠️';
      break;
    default:
      severityClass = 'text-info';
      severityIcon = 'ℹ️';
  }
  
  alertItem.innerHTML = `
    <div class="d-flex align-items-center">
      <div class="me-2 ${severityClass}">${severityIcon}</div>
      <div class="flex-grow-1">
        <div class="small text-truncate">${alert.message}</div>
        <div class="small text-muted">${formatDateTime(alert.timestamp)}</div>
      </div>
    </div>
  `;
  
  // 알림 추가 (최신 알림이 위에 오도록)
  if (prepend) {
    alertsContainer.insertBefore(alertItem, alertsContainer.firstChild);
  } else {
    alertsContainer.appendChild(alertItem);
  }
  
  // 최대 10개 알림만 유지
  while (alertsContainer.children.length > 10) {
    alertsContainer.removeChild(alertsContainer.lastChild);
  }
}

// 로그 항목 추가
function addLogEntry(entry) {
  const logContainer = document.getElementById('monitoring-log');
  
  // "로그 없음" 메시지 제거
  const emptyMessage = logContainer.querySelector('.text-center.text-muted');
  if (emptyMessage) {
    logContainer.removeChild(emptyMessage);
  }
  
  // 로그 항목 생성
  const logItem = document.createElement('div');
  logItem.className = 'log-entry';
  
  // 로그 타입에 따른 스타일 적용
  if (entry.type === 'error' || entry.type === 'critical') {
    logItem.className += ' error';
  } else if (entry.type === 'warning') {
    logItem.className += ' warning';
  } else if (entry.type === 'success') {
    logItem.className += ' success';
  }
  
  // 시간 포맷팅
  const timestamp = formatDateTime(entry.timestamp);
  
  logItem.innerHTML = `<span class="text-muted">[${timestamp}]</span> ${entry.message}`;
  
  // 로그 추가 (최신 로그가 위에 오도록)
  logContainer.insertBefore(logItem, logContainer.firstChild);
  
  // 최대 100개 로그만 유지
  while (logContainer.children.length > 100) {
    logContainer.removeChild(logContainer.lastChild);
  }
}

// 날짜 및 시간 포맷팅
function formatDateTime(isoString) {
  if (!isoString) return '-';
  
  const date = new Date(isoString);
  return date.toLocaleString('ko-KR', { 
    year: 'numeric', 
    month: '2-digit', 
    day: '2-digit',
    hour: '2-digit', 
    minute: '2-digit', 
    second: '2-digit' 
  });
}

// 시간만 포맷팅
function formatTime(isoString) {
  if (!isoString) return '-';
  
  const date = new Date(isoString);
  return date.toLocaleTimeString('ko-KR', { 
    hour: '2-digit', 
    minute: '2-digit', 
    second: '2-digit' 
  });
}

// 랜덤 색상 생성
function getRandomColor() {
  const colors = [
    '#4CAF50', '#2196F3', '#F44336', '#FFC107', '#9C27B0',
    '#00BCD4', '#FF9800', '#795548', '#607D8B', '#E91E63'
  ];
  
  return colors[Math.floor(Math.random() * colors.length)];
}
`;

// 템플릿 및 정적 파일 생성
if (!fs.existsSync(path.join(viewsDir, 'dashboard.ejs'))) {
  fs.writeFileSync(path.join(viewsDir, 'dashboard.ejs'), dashboardTemplate);
}

if (!fs.existsSync(path.join(publicDir, 'css/dashboard.css'))) {
  fs.writeFileSync(path.join(publicDir, 'css/dashboard.css'), dashboardCss);
}

if (!fs.existsSync(path.join(publicDir, 'js/dashboard.js'))) {
  fs.writeFileSync(path.join(publicDir, 'js/dashboard.js'), dashboardJs);
}

// 라우트 설정
app.get('/', (req, res) => {
  res.render('dashboard');
});

// API 엔드포인트
app.get('/api/monitoring-data', async (req, res) => {
  try {
    // 전체 상태 조회
    const overallDoc = await monitoringCollection.doc('overall').get();
    
    // 엔드포인트별 데이터 조회
    const endpointsSnapshot = await monitoringCollection.where('lastUpdated', '>', 0).get();
    
    // 결과 구성
    const monitoringData = {
      lastUpdated: new Date().toISOString(),
      overall: overallDoc.exists ? overallDoc.data() : {
        availability: 100,
        averageResponseTime: 0,
        errorRate: 0,
        successRate: 100
      },
      endpoints: {}
    };
    
    // 엔드포인트 데이터 추가
    endpointsSnapshot.forEach(doc => {
      const data = doc.data();
      if (data.name && doc.id !== 'overall') {
        monitoringData.endpoints[data.name] = data;
      }
    });
    
    res.json(monitoringData);
  } catch (error) {
    console.error('모니터링 데이터 조회 실패:', error);
    res.status(500).json({ error: 'Internal Server Error' });
  }
});

// 알림 조회 API
app.get('/api/alerts', async (req, res) => {
  try {
    // 최신 알림 50개 조회
    const alertsSnapshot = await alertsCollection
      .orderBy('timestamp', 'desc')
      .limit(50)
      .get();
    
    const alerts = [];
    
    alertsSnapshot.forEach(doc => {
      alerts.push(doc.data());
    });
    
    res.json(alerts);
  } catch (error) {
    console.error('알림 데이터 조회 실패:', error);
    res.status(500).json({ error: 'Internal Server Error' });
  }
});

// Socket.IO 이벤트 설정
io.on('connection', (socket) => {
  console.log('클라이언트 연결됨');
  
  // 연결 해제 처리
  socket.on('disconnect', () => {
    console.log('클라이언트 연결 해제됨');
  });
});

// 모니터링 결과를 실시간으로 전달하는 함수
function broadcastMonitoringResults(results) {
  io.emit('monitoring-update', results);
}

// 알림을 실시간으로 전달하는 함수
function broadcastAlert(alert) {
  io.emit('alert', alert);
}

// 로그 항목을 실시간으로 전달하는 함수
function broadcastLogEntry(logEntry) {
  io.emit('log', logEntry);
}

// Firestore 변경 감지 설정
function setupFirestoreListeners() {
  // 모니터링 결과 변경 감지
  monitoringCollection.doc('overall').onSnapshot(doc => {
    if (doc.exists) {
      const overallData = doc.data();
      
      // 엔드포인트 데이터 조회
      monitoringCollection.where('lastUpdated', '>', 0).get()
        .then(snapshot => {
          const monitoringData = {
            lastUpdated: new Date().toISOString(),
            overall: overallData,
            endpoints: {}
          };
          
          // 엔드포인트 데이터 추가
          snapshot.forEach(endpointDoc => {
            const data = endpointDoc.data();
            if (data.name && endpointDoc.id !== 'overall') {
              monitoringData.endpoints[data.name] = data;
            }
          });
          
          // 결과 브로드캐스트
          broadcastMonitoringResults(monitoringData);
        })
        .catch(error => {
          console.error('엔드포인트 데이터 조회 실패:', error);
        });
    }
  });
  
  // 알림 추가 감지
  alertsCollection
    .orderBy('timestamp', 'desc')
    .limit(1)
    .onSnapshot(snapshot => {
      // 알림 추가 확인
      const changes = snapshot.docChanges();
      
      changes.forEach(change => {
        if (change.type === 'added') {
          const alert = change.doc.data();
          broadcastAlert(alert);
        }
      });
    });
}

// 서버 시작
const PORT = process.env.PORT || 3000;

server.listen(PORT, () => {
  console.log(`API 모니터링 대시보드가 http://localhost:${PORT} 에서 실행 중입니다.`);
  
  // Firestore 리스너 설정
  setupFirestoreListeners();
  
  // 시작 로그
  broadcastLogEntry({
    timestamp: new Date().toISOString(),
    message: 'API 모니터링 대시보드가 시작되었습니다.',
    type: 'success'
  });
});

module.exports = {
  app,
  server,
  broadcastMonitoringResults,
  broadcastAlert,
  broadcastLogEntry
};
