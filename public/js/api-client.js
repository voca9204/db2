// API Endpoints Configuration
const API_CONFIG = {
  // API 기본 설정
  BASE_URL: '/api/v1',
  
  // 활성 고가치 사용자 API 엔드포인트
  ACTIVE_USERS: '/api/v1/users/high-value/active',
  
  // 휴면 고가치 사용자 API 엔드포인트
  DORMANT_USERS: '/api/v1/users/high-value/dormant',
  
  // CSV 내보내기 API 엔드포인트
  EXPORT_CSV: '/api/v1/users/high-value/export/csv',
  
  // 구버전 API 엔드포인트 (백업용)
  LEGACY: {
    ACTIVE_USERS: '/highValueUsersApi/active',
    DORMANT_USERS: '/highValueUsersApi/dormant',
    EXPORT_CSV: '/highValueUsersApi/export/csv'
  }
};

// API 요청 함수
async function callApi(endpoint, params = {}) {
  try {
    // 쿼리 문자열 생성
    const queryParams = new URLSearchParams();
    Object.entries(params).forEach(([key, value]) => {
      if (value !== undefined && value !== null) {
        queryParams.append(key, value);
      }
    });
    
    // API URL 구성
    const url = `${endpoint}?${queryParams.toString()}`;
    console.log(`API 요청: ${url}`);
    
    // API 호출
    const response = await fetch(url);
    
    // 응답 확인
    if (!response.ok) {
      throw new Error(`API 오류: ${response.status} ${response.statusText}`);
    }
    
    // JSON 응답 파싱
    const data = await response.json();
    console.log(`API 응답:`, data);
    
    return data;
  } catch (error) {
    console.error('API 호출 오류:', error);
    throw error;
  }
}

// 활성 고가치 사용자 조회 API
async function fetchActiveUsers(params = {}) {
  try {
    // 기본값 설정
    const defaultParams = {
      minNetBet: 50000,
      page: 1,
      limit: 20,
      sortBy: 'netBet',
      sortOrder: 'desc'
    };
    
    // 파라미터 병합
    const queryParams = { ...defaultParams, ...params };
    
    // API 호출
    const result = await callApi(API_CONFIG.ACTIVE_USERS, queryParams);
    
    // 응답 형식에 따른 처리
    if (result.success) {
      return {
        users: result.data || [],
        total: result.pagination?.total || 0,
        page: result.pagination?.page || 1,
        pages: result.pagination?.pages || 1,
        limit: result.pagination?.limit || defaultParams.limit
      };
    } else {
      throw new Error(result.message || '데이터 조회 중 오류가 발생했습니다.');
    }
  } catch (error) {
    console.error('활성 고가치 사용자 조회 오류:', error);
    
    // 구버전 API 호출 시도 (폴백)
    try {
      console.log('구버전 API 호출 시도...');
      const legacyResult = await callApi(API_CONFIG.LEGACY.ACTIVE_USERS, params);
      return {
        users: legacyResult.data || [],
        total: legacyResult.totalCount || 0,
        page: legacyResult.currentPage || 1,
        pages: legacyResult.pages || 1,
        limit: params.limit || 20
      };
    } catch (fallbackError) {
      console.error('폴백 API 호출 오류:', fallbackError);
      throw error; // 원래 오류 전달
    }
  }
}

// 휴면 고가치 사용자 조회 API
async function fetchDormantUsers(params = {}) {
  try {
    // 기본값 설정
    const defaultParams = {
      minNetBet: 50000,
      page: 1,
      limit: 20,
      sortBy: 'inactiveDays',
      sortOrder: 'desc'
    };
    
    // 파라미터 병합
    const queryParams = { ...defaultParams, ...params };
    
    // API 호출
    const result = await callApi(API_CONFIG.DORMANT_USERS, queryParams);
    
    // 응답 형식에 따른 처리
    if (result.success) {
      return {
        users: result.data || [],
        total: result.pagination?.total || 0,
        page: result.pagination?.page || 1,
        pages: result.pagination?.pages || 1,
        limit: result.pagination?.limit || defaultParams.limit
      };
    } else {
      throw new Error(result.message || '데이터 조회 중 오류가 발생했습니다.');
    }
  } catch (error) {
    console.error('휴면 고가치 사용자 조회 오류:', error);
    
    // 구버전 API 호출 시도 (폴백)
    try {
      console.log('구버전 API 호출 시도...');
      const legacyResult = await callApi(API_CONFIG.LEGACY.DORMANT_USERS, params);
      return {
        users: legacyResult.data || [],
        total: legacyResult.totalCount || 0,
        page: legacyResult.currentPage || 1,
        pages: legacyResult.pages || 1,
        limit: params.limit || 20
      };
    } catch (fallbackError) {
      console.error('폴백 API 호출 오류:', fallbackError);
      throw error; // 원래 오류 전달
    }
  }
}

// CSV 내보내기 URL 생성
function getCsvExportUrl(params = {}) {
  // 기본값 설정
  const defaultParams = {
    minNetBet: 50000,
    type: 'all'
  };
  
  // 파라미터 병합
  const queryParams = { ...defaultParams, ...params };
  
  // 쿼리 문자열 생성
  const urlParams = new URLSearchParams();
  Object.entries(queryParams).forEach(([key, value]) => {
    if (value !== undefined && value !== null) {
      urlParams.append(key, value);
    }
  });
  
  // API URL 구성
  return `${API_CONFIG.EXPORT_CSV}?${urlParams.toString()}`;
}

// API 라이브러리 내보내기
window.highValueUsersApi = {
  fetchActiveUsers,
  fetchDormantUsers,
  getCsvExportUrl
};
