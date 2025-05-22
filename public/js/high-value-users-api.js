// 업데이트된 API 호출 스크립트 (high_value_users_report.html에 적용)
// API 경로 표준화 및 응답 처리 개선 (Task #26, 서브태스크 #7)

// 전역 변수 선언 (페이지 상태 관리)
window.currentPage = 1;
window.pageSize = 20;
window.totalPages = 1;
window.totalUsers = 0;
window.userData = [];
window.sortField = 'netBet';
window.sortOrder = 'desc';

// API 경로 구성
const API_CONFIG = {
  // API 버전
  version: 'v1',
  
  // 베이스 URL (Firebase Functions 에뮬레이터)
  baseUrl: 'http://127.0.0.1:9000/db888-67827/us-central1',
  
  // 엔드포인트
  endpoints: {
    active: '/highValueUsersApi/active',
    dormant: '/highValueUsersApi/dormant',
    export: '/highValueUsersApi/export/csv'
  },
  
  // 레거시 호환성 (V1 기반 API 응답 완료 전까지 사용)
  legacy: {
    baseUrl: 'http://127.0.0.1:9000/db888-67827/us-central1/highValueUsersApi',
    forceUseLegacy: true  // Firebase Functions 테스트를 위해 true로 설정
  }
};

// API 호출 함수
async function fetchApiData(endpoint, params = {}) {
  // 현재 API 선택 (레거시 또는 V1)
  const baseUrl = API_CONFIG.legacy.forceUseLegacy 
    ? API_CONFIG.legacy.baseUrl
    : API_CONFIG.baseUrl;
    
  // URL 구성
  const queryParams = new URLSearchParams(params);
  const url = `${baseUrl}${endpoint}?${queryParams.toString()}`;
  
  console.log('API 호출:', url);
  
  try {
    // API 호출
    const response = await fetch(url);
    
    if (!response.ok) {
      throw new Error(`API 오류: ${response.status} ${response.statusText}`);
    }
    
    const data = await response.json();
    
    // 응답 구조 정규화 (레거시 API와 V1 API 응답 포맷 차이 처리)
    return normalizeApiResponse(data, endpoint);
    
  } catch (error) {
    console.error('API 호출 오류:', error);
    
    // 오류 시 레거시 API 폴백 시도
    if (!API_CONFIG.legacy.forceUseLegacy) {
      console.log('레거시 API로 폴백 시도...');
      API_CONFIG.legacy.forceUseLegacy = true;
      return fetchApiData(endpoint, params);
    }
    
    throw error;
  }
}

// API 응답 구조 정규화 (양쪽 API 포맷 차이 처리)
function normalizeApiResponse(data, endpoint) {
  // API 버전 감지
  const isLegacyResponse = !data.metadata && data.data;
  const isV1Response = !!data.metadata;
  
  if (isV1Response) {
    // 이미 V1 API 응답 형식인 경우 그대로 반환
    return {
      data: data.data || [],
      totalCount: data.metadata.pagination.totalCount,
      currentPage: data.metadata.pagination.currentPage,
      pageSize: data.metadata.pagination.pageSize,
      totalPages: data.metadata.pagination.totalPages,
      success: data.success
    };
  } else if (isLegacyResponse) {
    // 레거시 API 응답 형식을 V1 형식으로 변환
    return {
      data: data.data || [],
      totalCount: data.totalCount || 0,
      currentPage: data.currentPage || 1,
      pageSize: data.params?.limit || 20,
      totalPages: data.pages || 1,
      success: data.success
    };
  } else {
    // 알 수 없는 응답 형식
    console.warn('알 수 없는 API 응답 형식:', data);
    return {
      data: [],
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

// 페이지 로딩 시 사용자 데이터 로드
async function loadUserData() {
  // UI 상태 업데이트
  updateLoadingState(true);
  
  try {
    // 필터 옵션 가져오기
    const statusFilter = document.getElementById('userStatus').value;
    const minBettingValue = parseInt(document.getElementById('minBetting').value, 10);
    const searchTerm = document.getElementById('userSearch').value.trim();
    
    // 정렬 및 페이지네이션 옵션 (전역 변수 사용)
    const sortParams = { sortBy: window.sortField || 'totalNetBet', sortOrder: window.sortOrder || 'desc' };
    const paginationParams = { page: window.currentPage || 1, limit: window.pageSize || 20 };
    
    // API 경로 선택
    let endpoint = '';
    let params = {
      ...paginationParams,
      ...sortParams,
      minNetBet: minBettingValue
    };
    
    if (statusFilter === 'dormant') {
      endpoint = '/dormant';
    } else if (statusFilter === 'all') {
      // 'all' 옵션은 현재 active API로 처리 (추후 통합 API 개발 시 변경)
      endpoint = '';
    }
    
    // 검색어 추가
    if (searchTerm) {
      params.search = searchTerm;
    }
    
    // API 호출
    const result = await fetchApiData(endpoint, params);
    
    if (result.success) {
      // 데이터 업데이트
      window.userData = result.data || [];
      window.totalUsers = result.totalCount || 0;
      window.totalPages = result.totalPages || 1;
      
      // UI 업데이트
      updateTable();
      updatePagination();
      
      // 로딩 상태 업데이트
      updateLoadingState(false);
    } else {
      // 오류 처리
      throw new Error('API 응답 오류');
    }
  } catch (error) {
    console.error('데이터 로드 오류:', error);
    
    // 오류 메시지 표시
    updateLoadingState(false, true);
  }
}

// CSV 내보내기 함수
function exportUserDataToCsv() {
  // 필터 옵션 가져오기
  const statusFilter = document.getElementById('userStatus').value;
  const minBettingValue = parseInt(document.getElementById('minBetting').value, 10);
  const searchTerm = document.getElementById('userSearch').value.trim();
  
  // 엑스포트 URL 생성
  const params = {
    minNetBet: minBettingValue
  };
  
  // 유저 타입 추가
  if (statusFilter !== 'all') {
    params.type = statusFilter;
  }
  
  // 검색어 추가
  if (searchTerm) {
    params.search = searchTerm;
  }
  
  // CSV 내보내기 URL 생성
  const exportUrl = generateCsvExportUrl(params);
  
  // 새 탭에서 URL 열기 (다운로드 트리거)
  window.open(exportUrl, '_blank');
}

// UI 상태 업데이트 함수
function updateLoadingState(isLoading, hasError = false) {
  const loadingIndicator = document.getElementById('loadingIndicator');
  const errorMessage = document.getElementById('errorMessage');
  const userTable = document.getElementById('userTable');
  
  if (isLoading) {
    // 로딩 상태 표시
    loadingIndicator.style.display = 'flex';
    errorMessage.style.display = 'none';
    userTable.style.display = 'none';
  } else if (hasError) {
    // 오류 상태 표시
    loadingIndicator.style.display = 'none';
    errorMessage.style.display = 'block';
    userTable.style.display = 'none';
  } else {
    // 정상 상태 표시
    loadingIndicator.style.display = 'none';
    errorMessage.style.display = 'none';
    userTable.style.display = 'table';
  }
}
