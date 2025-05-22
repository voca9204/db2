// 고가치 사용자 분석 페이지 - 통합 JavaScript 파일
// 문제 해결: 변수 스코프 이슈 및 API 호출 오류 수정

// ============================
// 전역 변수 및 설정
// ============================

// 페이지 상태 관리 변수
let currentPage = 1;
let pageSize = 20;
let totalPages = 1;
let totalUsers = 0;
let userData = [];
let sortField = 'netBet';
let sortOrder = 'desc';

// API 설정
const API_CONFIG = {
  version: 'v1',
  
  // Firebase Functions 에뮬레이터 URL
  baseUrl: 'http://127.0.0.1:9090/db888-67827/us-central1',
  
  endpoints: {
    active: '/highValueUsersApi/active',
    dormant: '/highValueUsersApi/dormant',
    export: '/highValueUsersApi/export/csv'
  },
  
  // 레거시 호환성 (현재 테스트용)
  legacy: {
    baseUrl: 'http://127.0.0.1:9090/db888-67827/us-central1/highValueUsersApi',
    forceUseLegacy: true  // Firebase Functions 테스트를 위해 true로 설정
  }
};

// ============================
// API 관련 함수
// ============================

// API 호출 함수
async function fetchApiData(endpoint, params = {}) {
  const baseUrl = API_CONFIG.legacy.forceUseLegacy 
    ? API_CONFIG.legacy.baseUrl
    : API_CONFIG.baseUrl;
    
  const queryParams = new URLSearchParams(params);
  const url = `${baseUrl}${endpoint}?${queryParams.toString()}`;
  
  console.log('API 호출:', url);
  
  try {
    const response = await fetch(url);
    
    if (!response.ok) {
      throw new Error(`API 오류: ${response.status} ${response.statusText}`);
    }
    
    const data = await response.json();
    return normalizeApiResponse(data, endpoint);
    
  } catch (error) {
    console.error('API 호출 오류:', error);
    
    if (!API_CONFIG.legacy.forceUseLegacy) {
      console.log('레거시 API로 폴백 시도...');
      API_CONFIG.legacy.forceUseLegacy = true;
      return fetchApiData(endpoint, params);
    }
    
    throw error;
  }
}

// API 응답 구조 정규화
function normalizeApiResponse(data, endpoint) {
  const isLegacyResponse = !data.metadata && data.data;
  const isV1Response = !!data.metadata;
  
  if (isV1Response) {
    return {
      data: data.data || [],
      totalCount: data.metadata.pagination.totalCount,
      currentPage: data.metadata.pagination.currentPage,
      pageSize: data.metadata.pagination.pageSize,
      totalPages: data.metadata.pagination.totalPages,
      success: data.success
    };
  } else if (isLegacyResponse) {
    return {
      data: data.data || [],
      totalCount: data.count || data.data.length || 0,
      currentPage: currentPage,
      pageSize: pageSize,
      totalPages: Math.ceil((data.count || data.data.length || 0) / pageSize),
      success: data.status === 'success'
    };
  } else {
    console.warn('알 수 없는 API 응답 형식:', data);
    return {
      data: Array.isArray(data.data) ? data.data : [],
      totalCount: 0,
      currentPage: 1,
      pageSize: 20,
      totalPages: 1,
      success: false
    };
  }
}

// CSV 내보내기 URL 생성
function generateCsvExportUrl(params = {}) {
  const baseUrl = API_CONFIG.legacy.forceUseLegacy 
    ? API_CONFIG.legacy.baseUrl
    : API_CONFIG.baseUrl;
    
  const queryParams = new URLSearchParams(params);
  return `${baseUrl}${API_CONFIG.endpoints.export}?${queryParams.toString()}`;
}

// ============================
// 데이터 로드 함수
// ============================

// 사용자 데이터 로드
async function loadUserData() {
  updateLoadingState(true);
  
  try {
    // 필터 옵션 가져오기
    const statusFilter = document.getElementById('userStatus')?.value || 'all';
    const minBettingValue = parseInt(document.getElementById('minBetting')?.value || '50000', 10);
    const searchTerm = document.getElementById('userSearch')?.value?.trim() || '';
    
    // API 파라미터 구성
    const params = {
      page: currentPage,
      limit: pageSize,
      sortBy: sortField,
      sortOrder: sortOrder,
      minNetBet: minBettingValue
    };
    
    // 엔드포인트 선택
    let endpoint = '';
    if (statusFilter === 'dormant') {
      endpoint = '/dormant';
    } else if (statusFilter === 'all') {
      endpoint = '';
    }
    
    // 검색어 추가
    if (searchTerm) {
      params.search = searchTerm;
    }
    
    console.log('로드 파라미터:', params);
    
    // API 호출
    const result = await fetchApiData(endpoint, params);
    
    if (result.success && Array.isArray(result.data)) {
      // 전역 변수 업데이트
      userData = result.data;
      totalUsers = result.totalCount;
      totalPages = result.totalPages;
      currentPage = result.currentPage;
      
      console.log(`데이터 로드 성공: ${userData.length}명, 총 ${totalUsers}명`);
      
      // UI 업데이트
      updateTable();
      updatePagination();
      updateLoadingState(false);
    } else {
      throw new Error('유효하지 않은 API 응답');
    }
  } catch (error) {
    console.error('데이터 로드 오류:', error);
    updateLoadingState(false, true);
  }
}

// ============================
// UI 업데이트 함수
// ============================

// 테이블 업데이트
function updateTable() {
  const userTableBody = document.getElementById('userTableBody');
  if (!userTableBody) {
    console.error('테이블 요소를 찾을 수 없습니다.');
    return;
  }
  
  userTableBody.innerHTML = '';
  
  if (!userData || userData.length === 0) {
    const emptyRow = document.createElement('tr');
    emptyRow.innerHTML = `<td colspan="7" style="text-align: center; padding: 20px;">조건에 맞는 사용자가 없습니다.</td>`;
    userTableBody.appendChild(emptyRow);
    return;
  }
  
  userData.forEach((user, index) => {
    const row = document.createElement('tr');
    const rank = (currentPage - 1) * pageSize + index + 1;
    
    // 데이터 안전하게 처리
    const userId = user.userId || user.userName || '알 수 없음';
    const gameDays = user.gameDays || user.playDays || user.loginCount || 0;
    const totalNetBet = (user.totalNetBet || user.netBet || 0);
    const lastGameDate = user.lastGameDate || user.lastActivity || '-';
    const daysSinceLastGame = user.daysSinceLastGame || user.inactiveDays || 0;
    
    // 상태 판단
    const isActive = daysSinceLastGame <= 30;
    const status = isActive ? 'active' : 'dormant';
    const statusLabel = isActive ? '활성' : '휴면';
    
    // 날짜 포맷팅
    let formattedDate = '-';
    if (lastGameDate !== '-' && lastGameDate) {
      try {
        const date = new Date(lastGameDate);
        if (!isNaN(date.getTime())) {
          formattedDate = date.toLocaleDateString('ko-KR');
        }
      } catch (e) {
        formattedDate = lastGameDate;
      }
    }
    
    row.innerHTML = `
      <td style="text-align: center;">${rank}</td>
      <td style="font-weight: bold;">${userId}</td>
      <td style="text-align: center;">${gameDays}</td>
      <td style="text-align: right; font-weight: bold;">${totalNetBet.toLocaleString()}원</td>
      <td style="text-align: center;">${formattedDate}</td>
      <td style="text-align: center;">${daysSinceLastGame}일</td>
      <td style="text-align: center;"><span class="tag tag-${status}">${statusLabel}</span></td>
    `;
    
    userTableBody.appendChild(row);
  });
  
  console.log(`테이블 업데이트 완료: ${userData.length}개 행`);
}

// 페이지네이션 업데이트
function updatePagination() {
  const paginationInfo = document.getElementById('paginationInfo');
  const firstPageBtn = document.getElementById('firstPage');
  const prevPageBtn = document.getElementById('prevPage');
  const nextPageBtn = document.getElementById('nextPage');
  const lastPageBtn = document.getElementById('lastPage');
  const pageNumbers = document.getElementById('pageNumbers');
  
  if (!paginationInfo) return;
  
  // 페이지 정보 업데이트
  const start = (currentPage - 1) * pageSize + 1;
  const end = Math.min(currentPage * pageSize, totalUsers);
  paginationInfo.textContent = `총 ${totalUsers.toLocaleString()}명의 사용자 중 ${start.toLocaleString()}-${end.toLocaleString()}명 표시`;
  
  // 페이지 버튼 상태 업데이트
  if (firstPageBtn) firstPageBtn.disabled = currentPage === 1;
  if (prevPageBtn) prevPageBtn.disabled = currentPage === 1;
  if (nextPageBtn) nextPageBtn.disabled = currentPage === totalPages;
  if (lastPageBtn) lastPageBtn.disabled = currentPage === totalPages;
  
  // 페이지 번호 생성
  if (pageNumbers) {
    pageNumbers.innerHTML = '';
    
    const maxPageNumbers = 5;
    const pageRange = getPageRange(currentPage, totalPages, maxPageNumbers);
    
    for (let i = pageRange.start; i <= pageRange.end; i++) {
      const pageBtn = document.createElement('button');
      pageBtn.textContent = i;
      pageBtn.className = 'pagination-btn' + (i === currentPage ? ' active' : '');
      
      pageBtn.addEventListener('click', function() {
        if (currentPage !== i) {
          currentPage = i;
          loadUserData();
        }
      });
      
      pageNumbers.appendChild(pageBtn);
    }
  }
  
  console.log(`페이지네이션 업데이트: ${currentPage}/${totalPages} 페이지`);
}

// 페이지 범위 계산
function getPageRange(current, total, max) {
  let start = Math.max(1, current - Math.floor(max / 2));
  let end = start + max - 1;
  
  if (end > total) {
    end = total;
    start = Math.max(1, end - max + 1);
  }
  
  return { start, end };
}

// 로딩 상태 업데이트
function updateLoadingState(isLoading, hasError = false) {
  const loadingIndicator = document.getElementById('loadingIndicator');
  const errorMessage = document.getElementById('errorMessage');
  const userTable = document.getElementById('userTable');
  
  if (isLoading) {
    if (loadingIndicator) loadingIndicator.style.display = 'flex';
    if (errorMessage) errorMessage.style.display = 'none';
    if (userTable) userTable.style.display = 'none';
  } else if (hasError) {
    if (loadingIndicator) loadingIndicator.style.display = 'none';
    if (errorMessage) errorMessage.style.display = 'block';
    if (userTable) userTable.style.display = 'none';
  } else {
    if (loadingIndicator) loadingIndicator.style.display = 'none';
    if (errorMessage) errorMessage.style.display = 'none';
    if (userTable) userTable.style.display = 'table';
  }
}

// ============================
// 이벤트 핸들러 함수
// ============================

// CSV 내보내기
function exportUserDataToCsv() {
  const statusFilter = document.getElementById('userStatus')?.value || 'all';
  const minBettingValue = parseInt(document.getElementById('minBetting')?.value || '50000', 10);
  const searchTerm = document.getElementById('userSearch')?.value?.trim() || '';
  
  const params = {
    minNetBet: minBettingValue
  };
  
  if (statusFilter !== 'all') {
    params.type = statusFilter;
  }
  
  if (searchTerm) {
    params.search = searchTerm;
  }
  
  const exportUrl = generateCsvExportUrl(params);
  window.open(exportUrl, '_blank');
}

// 테이블 정렬
function handleSort(headerText) {
  const columnMapping = {
    '유저명': 'userId',
    '플레이 일수': 'gameDays',
    '총 유효배팅': 'totalNetBet',
    '마지막 플레이': 'lastGameDate',
    '경과일수': 'daysSinceLastGame'
  };
  
  const columnName = columnMapping[headerText];
  
  if (columnName) {
    if (sortField === columnName) {
      sortOrder = sortOrder === 'asc' ? 'desc' : 'asc';
    } else {
      sortField = columnName;
      sortOrder = 'desc';
    }
    
    currentPage = 1;
    loadUserData();
  }
}

// ============================
// 초기화 함수
// ============================

// DOM 로드 완료 시 초기화
document.addEventListener('DOMContentLoaded', function() {
  console.log('고가치 사용자 페이지 초기화 시작');
  
  // 페이지 크기 초기화
  const pageSizeSelect = document.getElementById('pageSize');
  if (pageSizeSelect) {
    pageSize = parseInt(pageSizeSelect.value, 10);
  }
  
  // 이벤트 리스너 등록
  setupEventListeners();
  
  // 초기 데이터 로드
  loadUserData();
  
  console.log('고가치 사용자 페이지 초기화 완료');
});

// 이벤트 리스너 설정
function setupEventListeners() {
  // 필터 적용 버튼
  const applyFilters = document.getElementById('applyFilters');
  if (applyFilters) {
    applyFilters.addEventListener('click', function() {
      currentPage = 1;
      loadUserData();
    });
  }
  
  // 재시도 버튼
  const retryButton = document.getElementById('retryButton');
  if (retryButton) {
    retryButton.addEventListener('click', loadUserData);
  }
  
  // CSV 내보내기 버튼
  const exportCsv = document.getElementById('exportCsv');
  if (exportCsv) {
    exportCsv.addEventListener('click', exportUserDataToCsv);
  }
  
  // 페이지 크기 변경
  const pageSizeSelect = document.getElementById('pageSize');
  if (pageSizeSelect) {
    pageSizeSelect.addEventListener('change', function() {
      pageSize = parseInt(this.value, 10);
      currentPage = 1;
      loadUserData();
    });
  }
  
  // 페이지네이션 버튼들
  const firstPageBtn = document.getElementById('firstPage');
  const prevPageBtn = document.getElementById('prevPage');
  const nextPageBtn = document.getElementById('nextPage');
  const lastPageBtn = document.getElementById('lastPage');
  
  if (firstPageBtn) {
    firstPageBtn.addEventListener('click', function() {
      if (currentPage !== 1) {
        currentPage = 1;
        loadUserData();
      }
    });
  }
  
  if (prevPageBtn) {
    prevPageBtn.addEventListener('click', function() {
      if (currentPage > 1) {
        currentPage--;
        loadUserData();
      }
    });
  }
  
  if (nextPageBtn) {
    nextPageBtn.addEventListener('click', function() {
      if (currentPage < totalPages) {
        currentPage++;
        loadUserData();
      }
    });
  }
  
  if (lastPageBtn) {
    lastPageBtn.addEventListener('click', function() {
      if (currentPage !== totalPages && totalPages > 0) {
        currentPage = totalPages;
        loadUserData();
      }
    });
  }
  
  // 테이블 헤더 정렬 기능
  document.querySelectorAll('#userTable th').forEach(header => {
    if (header.textContent.trim() !== '순위') { // 순위 열은 정렬 불가
      header.style.cursor = 'pointer';
      header.addEventListener('click', function() {
        handleSort(this.textContent.trim());
      });
    }
  });
  
  console.log('이벤트 리스너 설정 완료');
}

// ============================
// 전역 함수 노출 (HTML에서 호출 가능)
// ============================

// 전역 범위에 함수들 노출
window.loadUserData = loadUserData;
window.exportUserDataToCsv = exportUserDataToCsv;
window.handleSort = handleSort;

console.log('고가치 사용자 JavaScript 모듈 로드 완료');
