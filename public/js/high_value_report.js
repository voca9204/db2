// 고가치 사용자 보고서 JavaScript

// 전역 변수 및 설정
const ACTIVE_THRESHOLD_DAYS = 30; // 활성/휴면 기준일

window.appState = {
    currentPage: 1,
    pageSize: 20,
    totalPages: 1,
    totalUsers: 0,
    userData: [],
    filteredData: [],
    sortField: 'totalNetBet',
    sortOrder: 'desc',
    filters: {
        status: 'all',
        minBetting: 50000,
        search: ''
    }
};

// API 설정
const API_BASE_URL = 'http://127.0.0.1:9000/db888-67827/us-central1';

// 데이터 로드 함수
async function loadUserData() {
    try {
        updateLoadingState(true);
        
        // API 호출 - limit 파라미터를 제거하거나 동적으로 설정
        const apiUrl = new URL(`${API_BASE_URL}/highValueUsersApi`);
        
        // 필터 조건이 있으면 URL에 추가
        if (window.appState.filters.status !== 'all') {
            apiUrl.searchParams.append('status', window.appState.filters.status);
        }
        if (window.appState.filters.minBetting > 0) {
            apiUrl.searchParams.append('minNetBet', window.appState.filters.minBetting);
        }
        if (window.appState.filters.search) {
            apiUrl.searchParams.append('search', window.appState.filters.search);
        }
        
        // 모든 데이터를 가져오기 위해 큰 limit 설정 또는 limit 제거
        // API가 지원한다면 limit=0 또는 limit을 아예 보내지 않음
        
        const response = await fetch(apiUrl.toString());
        if (!response.ok) {
            throw new Error(`API 오류: ${response.status}`);
        }
        
        const result = await response.json();
        
        if (result.success) {
            // 원본 데이터 저장
            window.appState.userData = result.data.map((user, index) => ({
                ...user,
                rank: index + 1,
                status: user.daysSinceLastGame <= ACTIVE_THRESHOLD_DAYS ? 'active' : 'dormant'
            }));
            
            // 통계 업데이트
            updateStatistics();
            
            // 필터 적용 및 테이블 업데이트
            applyFilters();
            
            updateLoadingState(false);
        } else {
            throw new Error('API 응답 오류');
        }
    } catch (error) {
        console.error('데이터 로드 오류:', error);
        updateLoadingState(false, true);
    }
}

// 통계 업데이트
function updateStatistics() {
    const activeCount = window.appState.userData.filter(user => user.status === 'active').length;
    const dormantCount = window.appState.userData.filter(user => user.status === 'dormant').length;
    const totalCount = window.appState.userData.length;
    
    document.getElementById('totalUsers').textContent = totalCount.toLocaleString() + '명';
    document.getElementById('activeUsers').textContent = activeCount.toLocaleString() + '명';
    document.getElementById('dormantUsers').textContent = dormantCount.toLocaleString() + '명';
}

// 필터 적용
function applyFilters() {
    let filtered = [...window.appState.userData];
    
    // 상태 필터
    if (window.appState.filters.status !== 'all') {
        filtered = filtered.filter(user => user.status === window.appState.filters.status);
    }
    
    // 최소 베팅액 필터
    if (window.appState.filters.minBetting > 0) {
        filtered = filtered.filter(user => user.totalNetBet >= window.appState.filters.minBetting);
    }
    
    // 검색 필터
    if (window.appState.filters.search) {
        const searchTerm = window.appState.filters.search.toLowerCase();
        filtered = filtered.filter(user => 
            user.userId.toLowerCase().includes(searchTerm)
        );
    }
    
    // 정렬 적용
    filtered.sort((a, b) => {
        const aVal = a[window.appState.sortField];
        const bVal = b[window.appState.sortField];
        
        if (window.appState.sortOrder === 'asc') {
            return aVal > bVal ? 1 : -1;
        } else {
            return aVal < bVal ? 1 : -1;
        }
    });
    
    window.appState.filteredData = filtered;
    window.appState.totalUsers = filtered.length;
    window.appState.totalPages = Math.ceil(filtered.length / window.appState.pageSize);
    
    // 현재 페이지가 총 페이지보다 크면 1페이지로 이동
    if (window.appState.currentPage > window.appState.totalPages && window.appState.totalPages > 0) {
        window.appState.currentPage = 1;
    }
    
    updateTable();
    updatePagination();
}

// 테이블 업데이트
function updateTable() {
    const tbody = document.getElementById('userTableBody');
    tbody.innerHTML = '';
    
    if (window.appState.filteredData.length === 0) {
        const emptyRow = document.createElement('tr');
        emptyRow.innerHTML = '<td colspan="7" style="text-align: center;">조건에 맞는 사용자가 없습니다.</td>';
        tbody.appendChild(emptyRow);
        return;
    }
    
    const startIndex = (window.appState.currentPage - 1) * window.appState.pageSize;
    const endIndex = Math.min(startIndex + window.appState.pageSize, window.appState.filteredData.length);
    const pageData = window.appState.filteredData.slice(startIndex, endIndex);
    
    pageData.forEach((user, index) => {
        const row = document.createElement('tr');
        const rank = startIndex + index + 1;
        
        // 날짜 포맷팅
        const lastGameDate = user.lastGameDate ? 
            new Date(user.lastGameDate).toLocaleDateString('ko-KR') : '-';
        
        // 상태 태그
        const statusLabel = user.status === 'active' ? '활성' : '휴면';
        const statusClass = user.status === 'active' ? 'tag-active' : 'tag-dormant';
        
        row.innerHTML = `
            <td>${rank}</td>
            <td>${user.userId}</td>
            <td>${user.gameDays || 0}</td>
            <td>${Math.round(user.totalNetBet || 0).toLocaleString()}원</td>
            <td>${lastGameDate}</td>
            <td>${user.daysSinceLastGame || 0}일</td>
            <td><span class="tag ${statusClass}">${statusLabel}</span></td>
        `;
        
        tbody.appendChild(row);
    });
}

// 페이지네이션 업데이트
function updatePagination() {
    const paginationInfo = document.getElementById('paginationInfo');
    const firstPageBtn = document.getElementById('firstPage');
    const prevPageBtn = document.getElementById('prevPage');
    const nextPageBtn = document.getElementById('nextPage');
    const lastPageBtn = document.getElementById('lastPage');
    const pageNumbers = document.getElementById('pageNumbers');
    
    // 페이지 정보 업데이트
    const start = window.appState.filteredData.length === 0 ? 0 : (window.appState.currentPage - 1) * window.appState.pageSize + 1;
    const end = Math.min(window.appState.currentPage * window.appState.pageSize, window.appState.totalUsers);
    paginationInfo.textContent = `총 ${window.appState.totalUsers.toLocaleString()}명의 사용자 중 ${start.toLocaleString()}-${end.toLocaleString()}명 표시`;
    
    // 버튼 상태 업데이트
    const isFirstPage = window.appState.currentPage <= 1;
    const isLastPage = window.appState.currentPage >= window.appState.totalPages;
    
    firstPageBtn.disabled = isFirstPage;
    prevPageBtn.disabled = isFirstPage;
    nextPageBtn.disabled = isLastPage;
    lastPageBtn.disabled = isLastPage;
    
    // 페이지 번호 생성
    pageNumbers.innerHTML = '';
    
    const maxPageNumbers = 5;
    const pageRange = getPageRange(window.appState.currentPage, window.appState.totalPages, maxPageNumbers);
    
    for (let i = pageRange.start; i <= pageRange.end; i++) {
        const pageBtn = document.createElement('button');
        pageBtn.textContent = i;
        pageBtn.className = 'pagination-btn' + (i === window.appState.currentPage ? ' active' : '');
        
        pageBtn.addEventListener('click', () => {
            if (window.appState.currentPage !== i) {
                window.appState.currentPage = i;
                updateTable();
                updatePagination();
            }
        });
        
        pageNumbers.appendChild(pageBtn);
    }
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
        loadingIndicator.style.display = 'flex';
        errorMessage.style.display = 'none';
        userTable.style.display = 'none';
    } else if (hasError) {
        loadingIndicator.style.display = 'none';
        errorMessage.style.display = 'block';
        userTable.style.display = 'none';
    } else {
        loadingIndicator.style.display = 'none';
        errorMessage.style.display = 'none';
        userTable.style.display = 'table';
    }
}

// CSV 내보내기
function exportToCsv() {
    if (window.appState.filteredData.length === 0) {
        alert('내보낼 데이터가 없습니다.');
        return;
    }
    
    const csvData = [
        ['순위', '유저명', '플레이 일수', '총 유효배팅', '마지막 플레이', '경과일수', '상태']
    ];
    
    window.appState.filteredData.forEach((user, index) => {
        const lastGameDate = user.lastGameDate ? 
            new Date(user.lastGameDate).toLocaleDateString('ko-KR') : '-';
        const statusLabel = user.status === 'active' ? '활성' : '휴면';
        
        csvData.push([
            index + 1,
            user.userId,
            user.gameDays || 0,
            Math.round(user.totalNetBet || 0),
            lastGameDate,
            user.daysSinceLastGame || 0,
            statusLabel
        ]);
    });
    
    const csvContent = csvData.map(row => row.join(',')).join('\n');
    const blob = new Blob(['\uFEFF' + csvContent], { type: 'text/csv;charset=utf-8;' });
    const link = document.createElement('a');
    const url = URL.createObjectURL(blob);
    
    link.setAttribute('href', url);
    link.setAttribute('download', `고가치사용자_${new Date().toISOString().split('T')[0]}.csv`);
    link.style.visibility = 'hidden';
    
    document.body.appendChild(link);
    link.click();
    document.body.removeChild(link);
}

// 이벤트 리스너 등록
document.addEventListener('DOMContentLoaded', function() {
    // 초기 데이터 로드
    loadUserData();
    
    // 필터 이벤트
    document.getElementById('applyFilters').addEventListener('click', function() {
        window.appState.filters.status = document.getElementById('userStatus').value;
        window.appState.filters.minBetting = parseInt(document.getElementById('minBetting').value) || 0;
        window.appState.filters.search = document.getElementById('userSearch').value.trim();
        window.appState.currentPage = 1;
        applyFilters();
    });
    
    // 페이지 크기 변경
    document.getElementById('pageSize').addEventListener('change', function() {
        window.appState.pageSize = parseInt(this.value);
        window.appState.currentPage = 1;
        applyFilters();
    });
    
    // 페이지네이션 버튼
    document.getElementById('firstPage').addEventListener('click', () => {
        window.appState.currentPage = 1;
        updateTable();
        updatePagination();
    });
    
    document.getElementById('prevPage').addEventListener('click', () => {
        if (window.appState.currentPage > 1) {
            window.appState.currentPage--;
            updateTable();
            updatePagination();
        }
    });
    
    document.getElementById('nextPage').addEventListener('click', () => {
        if (window.appState.currentPage < window.appState.totalPages) {
            window.appState.currentPage++;
            updateTable();
            updatePagination();
        }
    });
    
    document.getElementById('lastPage').addEventListener('click', () => {
        window.appState.currentPage = window.appState.totalPages;
        updateTable();
        updatePagination();
    });
    
    // CSV 내보내기
    document.getElementById('exportCsv').addEventListener('click', exportToCsv);
    
    // 재시도 버튼
    document.getElementById('retryButton').addEventListener('click', loadUserData);
    
    // 테이블 정렬
    document.querySelectorAll('th[data-sort]').forEach(header => {
        header.addEventListener('click', function() {
            const field = this.getAttribute('data-sort');
            
            if (window.appState.sortField === field) {
                window.appState.sortOrder = window.appState.sortOrder === 'asc' ? 'desc' : 'asc';
            } else {
                window.appState.sortField = field;
                window.appState.sortOrder = 'desc';
            }
            
            applyFilters();
        });
    });
    
    // Enter 키 검색
    document.getElementById('userSearch').addEventListener('keypress', function(e) {
        if (e.key === 'Enter') {
            document.getElementById('applyFilters').click();
        }
    });
});