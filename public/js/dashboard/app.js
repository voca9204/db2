// app.js - 대시보드 애플리케이션 진입점

// Firebase 앱 설정
const firebaseConfig = {
  apiKey: "AIzaSyD2RY02pN2RrhT8Qt2hTSEilRqV4JAbCR0",
  authDomain: "db888-67827.firebaseapp.com",
  projectId: "db888-67827",
  storageBucket: "db888-67827.firebasestorage.app",
  messagingSenderId: "888497598316",
  appId: "1:888497598316:web:b2cb26b0a825e11a658d49"
};

// Firebase 초기화
firebase.initializeApp(firebaseConfig);
const auth = firebase.auth();
const firestore = firebase.firestore();
const functions = firebase.functions();
const analytics = firebase.analytics();

// React 컴포넌트
const { useState, useEffect, useRef, createContext, useContext } = React;
const { createRoot } = ReactDOM;

// 인증 컨텍스트
const AuthContext = createContext(null);

// 인증 컨텍스트 제공자
function AuthProvider({ children }) {
  const [user, setUser] = useState(null);
  const [loading, setLoading] = useState(true);
  const [userRoles, setUserRoles] = useState([]);

  useEffect(() => {
    // 인증 상태 변경 리스너
    const unsubscribe = auth.onAuthStateChanged(async (authUser) => {
      if (authUser) {
        // 사용자 인증 성공
        setUser(authUser);
        
        // 사용자 역할 정보 조회
        try {
          const userDoc = await firestore.collection('users').doc(authUser.uid).get();
          
          if (userDoc.exists) {
            const userData = userDoc.data();
            setUserRoles(userData.roles || []);
          } else {
            // 사용자 문서가 없으면 기본 사용자 문서 생성
            await firestore.collection('users').doc(authUser.uid).set({
              email: authUser.email,
              displayName: authUser.displayName || '',
              photoURL: authUser.photoURL || '',
              roles: ['user'], // 기본 역할
              createdAt: firebase.firestore.FieldValue.serverTimestamp()
            });
            setUserRoles(['user']);
          }
        } catch (error) {
          console.error('사용자 역할 정보 조회 실패:', error);
          setUserRoles(['user']); // 오류 시 기본 역할 설정
        }
      } else {
        // 로그인하지 않은 상태
        setUser(null);
        setUserRoles([]);
      }
      setLoading(false);
    });
    
    // 컴포넌트 언마운트 시 리스너 해제
    return () => unsubscribe();
  }, []);
  
  // 로그아웃 함수
  const signOut = () => {
    return auth.signOut();
  };
  
  // 역할 확인 함수
  const hasRole = (role) => {
    return userRoles.includes(role);
  };
  
  return (
    <AuthContext.Provider value={{ user, loading, userRoles, hasRole, signOut }}>
      {children}
    </AuthContext.Provider>
  );
}

// 인증 컨텍스트 사용 훅
function useAuth() {
  return useContext(AuthContext);
}

// 레이아웃 컴포넌트
function DashboardLayout({ children }) {
  const [sidebarCollapsed, setSidebarCollapsed] = useState(false);
  const [mobileMenuOpen, setMobileMenuOpen] = useState(false);
  const { user, loading, signOut } = useAuth();
  const [userMenuOpen, setUserMenuOpen] = useState(false);
  const userMenuRef = useRef(null);
  
  // 사이드바 토글
  const toggleSidebar = () => {
    setSidebarCollapsed(!sidebarCollapsed);
  };
  
  // 모바일 메뉴 토글
  const toggleMobileMenu = () => {
    setMobileMenuOpen(!mobileMenuOpen);
  };
  
  // 사용자 메뉴 토글
  const toggleUserMenu = () => {
    setUserMenuOpen(!userMenuOpen);
  };
  
  // 사용자 메뉴 외부 클릭 시 닫기
  useEffect(() => {
    function handleClickOutside(event) {
      if (userMenuRef.current && !userMenuRef.current.contains(event.target)) {
        setUserMenuOpen(false);
      }
    }
    
    document.addEventListener('mousedown', handleClickOutside);
    return () => {
      document.removeEventListener('mousedown', handleClickOutside);
    };
  }, [userMenuRef]);
  
  // 첫 글자 아바타 생성
  const getInitials = (name) => {
    if (!name) return '?';
    return name.charAt(0).toUpperCase();
  };
  
  // 로딩 중이면 로딩 화면 표시
  if (loading) {
    return (
      <div className="loading-container">
        <div className="spinner-border text-primary" role="status">
          <span className="visually-hidden">로딩 중...</span>
        </div>
        <p>사용자 정보 로딩 중...</p>
      </div>
    );
  }
  
  // 로그인하지 않은 경우 로그인 페이지로 리디렉션
  if (!user) {
    window.location.href = '/login.html';
    return null;
  }
  
  return (
    <div className="dashboard-layout">
      {/* 사이드바 */}
      <aside className={`sidebar ${sidebarCollapsed ? 'collapsed' : ''} ${mobileMenuOpen ? 'active' : ''}`}>
        <div className="sidebar-header">
          <div className="sidebar-logo">
            <img src="/assets/logo-placeholder.png" alt="로고" />
            <h1>고가치 사용자 분석</h1>
          </div>
          <button className="sidebar-toggle" onClick={toggleSidebar}>
            <i className={`fas fa-${sidebarCollapsed ? 'chevron-right' : 'chevron-left'}`}></i>
          </button>
        </div>
        
        <ul className="sidebar-menu">
          <li className="sidebar-item">
            <a href="#" className="sidebar-link active">
              <div className="sidebar-icon">
                <i className="fas fa-tachometer-alt"></i>
              </div>
              <span className="sidebar-text">대시보드</span>
            </a>
          </li>
          <li className="sidebar-item">
            <a href="#" className="sidebar-link">
              <div className="sidebar-icon">
                <i className="fas fa-users"></i>
              </div>
              <span className="sidebar-text">고가치 사용자</span>
            </a>
          </li>
          <li className="sidebar-item">
            <a href="#" className="sidebar-link">
              <div className="sidebar-icon">
                <i className="fas fa-user-clock"></i>
              </div>
              <span className="sidebar-text">휴면 사용자</span>
            </a>
          </li>
          <li className="sidebar-item">
            <a href="#" className="sidebar-link">
              <div className="sidebar-icon">
                <i className="fas fa-bullhorn"></i>
              </div>
              <span className="sidebar-text">이벤트 분석</span>
            </a>
          </li>
          <li className="sidebar-item">
            <a href="#" className="sidebar-link">
              <div className="sidebar-icon">
                <i className="fas fa-exchange-alt"></i>
              </div>
              <span className="sidebar-text">전환율 분석</span>
            </a>
          </li>
          <li className="sidebar-item">
            <a href="/api/v1/users/high-value/report?format=html" className="sidebar-link" target="_blank">
              <div className="sidebar-icon">
                <i className="fas fa-file-alt"></i>
              </div>
              <span className="sidebar-text">종합 분석 보고서</span>
            </a>
          </li>
          <li className="sidebar-item">
            <a href="#" className="sidebar-link">
              <div className="sidebar-icon">
                <i className="fas fa-cog"></i>
              </div>
              <span className="sidebar-text">설정</span>
            </a>
          </li>
        </ul>
        
        <div className="sidebar-footer">
          <p>© 2025 DB2 프로젝트</p>
        </div>
      </aside>
      
      {/* 메인 콘텐츠 */}
      <div className={`main-content ${sidebarCollapsed ? 'expanded' : ''}`}>
        <header className="dashboard-header">
          <button className="mobile-menu-button" onClick={toggleMobileMenu}>
            <i className="fas fa-bars"></i>
          </button>
          
          <h1 className="header-title">고가치 사용자 분석 대시보드</h1>
          
          <div className="header-actions">
            <div className="header-search">
              <i className="fas fa-search"></i>
              <input type="text" placeholder="검색..." />
            </div>
            
            <button className="header-button">
              <i className="fas fa-bell"></i>
            </button>
            
            <div className="user-menu" ref={userMenuRef}>
              <div className="user-avatar" onClick={toggleUserMenu}>
                {user.photoURL ? (
                  <img src={user.photoURL} alt="프로필" />
                ) : (
                  <span>{getInitials(user.displayName || user.email)}</span>
                )}
              </div>
              
              <div className={`user-dropdown ${userMenuOpen ? 'active' : ''}`}>
                <div className="user-info">
                  <h4 className="user-info-name">{user.displayName || '사용자'}</h4>
                  <p className="user-info-email">{user.email}</p>
                </div>
                
                <ul className="user-menu-items">
                  <li className="user-menu-item">
                    <i className="user-menu-icon fas fa-user"></i>
                    <span>프로필</span>
                  </li>
                  <li className="user-menu-item">
                    <i className="user-menu-icon fas fa-cog"></i>
                    <span>설정</span>
                  </li>
                  <div className="user-menu-divider"></div>
                  <li className="user-menu-item" onClick={signOut}>
                    <i className="user-menu-icon fas fa-sign-out-alt"></i>
                    <span>로그아웃</span>
                  </li>
                </ul>
              </div>
            </div>
          </div>
        </header>
        
        <main className="dashboard-content">
          {children}
        </main>
        
        <footer className="dashboard-footer">
          <p>© 2025 DB2 프로젝트 | 고가치 사용자 분석 대시보드</p>
        </footer>
      </div>
    </div>
  );
}

// 대시보드 보기
function Dashboard() {
  const { user, hasRole } = useAuth();
  const [stats, setStats] = useState(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(null);
  const [timeRange, setTimeRange] = useState('weekly');
  const [conversionChartData, setConversionChartData] = useState(null);
  const [roiChartData, setRoiChartData] = useState(null);
  
  // 통계 데이터 로딩
  useEffect(() => {
    async function fetchDashboardData() {
      try {
        setLoading(true);
        
        // Firestore에서 최신 분석 데이터 가져오기
        const summaryDoc = await firestore.collection('analyticsResults').doc('latest').get();
        
        if (summaryDoc.exists) {
          setStats(summaryDoc.data());
        } else {
          throw new Error('최신 분석 데이터를 찾을 수 없습니다');
        }
        
        // 비활성 기간별 전환율 데이터 가져오기
        const periodConversionDoc = await firestore.collection('conversionMetrics').doc('latest').get();
        
        if (periodConversionDoc.exists) {
          const data = periodConversionDoc.data();
          if (data.dormancyAnalysis && data.dormancyAnalysis.length > 0) {
            setConversionChartData(data.dormancyAnalysis);
          }
        }
        
        // 이벤트 ROI 데이터 가져오기
        const eventAnalyticsQuery = await firestore.collection('eventAnalytics')
          .orderBy('conversionRate', 'desc')
          .limit(10)
          .get();
          
        const eventData = [];
        eventAnalyticsQuery.forEach(doc => {
          const event = doc.data();
          eventData.push({
            eventName: event.eventName,
            conversionRate: event.conversionRate,
            roi: ((event.totalDepositAmount / (event.rewardAmount * event.participantCount)) - 1) * 100
          });
        });
        
        if (eventData.length > 0) {
          setRoiChartData(eventData);
        }
        
        setLoading(false);
      } catch (error) {
        console.error('대시보드 데이터 로딩 실패:', error);
        setError(error.message);
        setLoading(false);
      }
    }
    
    fetchDashboardData();
  }, []);
  
  // 숫자 포맷
  const formatNumber = (number) => {
    return new Intl.NumberFormat('ko-KR').format(number);
  };
  
  // 현재 날짜 포맷
  const formatDate = (date) => {
    return new Intl.DateTimeFormat('ko-KR', {
      year: 'numeric',
      month: 'long',
      day: 'numeric'
    }).format(date);
  };
  
  // 비활성 기간별 전환율 차트 생성
  const renderConversionChart = () => {
    if (!conversionChartData) return <div>데이터 없음</div>;
    
    const canvas = document.getElementById('conversionChart');
    if (!canvas) return null;
    
    const ctx = canvas.getContext('2d');
    
    // 기존 차트 제거
    if (window.conversionChart) {
      window.conversionChart.destroy();
    }
    
    // 데이터 준비
    const labels = conversionChartData.map(item => item.period);
    const conversionRates = conversionChartData.map(item => item.conversionRate);
    
    // 차트 생성
    window.conversionChart = new Chart(ctx, {
      type: 'bar',
      data: {
        labels: labels,
        datasets: [{
          label: '전환율 (%)',
          data: conversionRates,
          backgroundColor: 'rgba(26, 115, 232, 0.7)',
          borderColor: 'rgba(26, 115, 232, 1)',
          borderWidth: 1
        }]
      },
      options: {
        responsive: true,
        maintainAspectRatio: false,
        scales: {
          y: {
            beginAtZero: true,
            title: {
              display: true,
              text: '전환율 (%)'
            }
          },
          x: {
            title: {
              display: true,
              text: '비활성 기간'
            }
          }
        }
      }
    });
  };
  
  // ROI 차트 생성
  const renderRoiChart = () => {
    if (!roiChartData) return <div>데이터 없음</div>;
    
    const canvas = document.getElementById('roiChart');
    if (!canvas) return null;
    
    const ctx = canvas.getContext('2d');
    
    // 기존 차트 제거
    if (window.roiChart) {
      window.roiChart.destroy();
    }
    
    // 데이터 준비
    const labels = roiChartData.map(item => item.eventName);
    const roi = roiChartData.map(item => item.roi);
    const conversionRates = roiChartData.map(item => item.conversionRate);
    
    // 차트 생성
    window.roiChart = new Chart(ctx, {
      type: 'bar',
      data: {
        labels: labels,
        datasets: [{
          label: 'ROI (%)',
          data: roi,
          backgroundColor: 'rgba(52, 168, 83, 0.7)',
          borderColor: 'rgba(52, 168, 83, 1)',
          borderWidth: 1,
          yAxisID: 'y'
        }, {
          label: '전환율 (%)',
          data: conversionRates,
          type: 'line',
          backgroundColor: 'rgba(234, 67, 53, 0.7)',
          borderColor: 'rgba(234, 67, 53, 1)',
          borderWidth: 2,
          yAxisID: 'y1'
        }]
      },
      options: {
        responsive: true,
        maintainAspectRatio: false,
        scales: {
          y: {
            beginAtZero: true,
            position: 'left',
            title: {
              display: true,
              text: 'ROI (%)'
            }
          },
          y1: {
            beginAtZero: true,
            position: 'right',
            grid: {
              drawOnChartArea: false
            },
            title: {
              display: true,
              text: '전환율 (%)'
            }
          },
          x: {
            title: {
              display: true,
              text: '이벤트'
            }
          }
        }
      }
    });
  };
  
  // 차트 업데이트
  useEffect(() => {
    if (!loading && conversionChartData) {
      renderConversionChart();
    }
    
    if (!loading && roiChartData) {
      renderRoiChart();
    }
  }, [loading, conversionChartData, roiChartData]);
  
  // 데이터 로딩 중이면 로딩 화면 표시
  if (loading) {
    return (
      <div className="loading-container">
        <div className="spinner-border text-primary" role="status">
          <span className="visually-hidden">데이터 로딩 중...</span>
        </div>
        <p>대시보드 데이터 로딩 중...</p>
      </div>
    );
  }
  
  // 오류가 있으면 오류 메시지 표시
  if (error) {
    return (
      <div className="alert alert-danger" role="alert">
        <h4 className="alert-heading">데이터 로딩 중 오류 발생</h4>
        <p>{error}</p>
        <hr />
        <p className="mb-0">Firebase Functions가 정상적으로 실행 중인지 확인하세요.</p>
      </div>
    );
  }
  
  return (
    <div>
      {/* 환영 메시지 */}
      <div className="card mb-4">
        <div className="card-body">
          <h2>안녕하세요, {user.displayName || '사용자'}님!</h2>
          <p>고가치 사용자 분석 대시보드에 오신 것을 환영합니다. 오늘의 분석 결과를 확인하세요.</p>
          <p>마지막 업데이트: {formatDate(new Date())}</p>
        </div>
      </div>
      
      {/* 허용되지 않은 역할에 대한 메시지 */}
      {!hasRole('admin') && !hasRole('analyst') && (
        <div className="alert alert-warning" role="alert">
          <div className="alert-icon">
            <i className="fas fa-exclamation-triangle"></i>
          </div>
          <div className="alert-content">
            <h4 className="alert-title">권한 알림</h4>
            <p className="alert-message">현재 계정은 분석 데이터의 일부만 볼 수 있습니다. 전체 기능을 이용하려면 관리자에게 권한 업그레이드를 요청하세요.</p>
          </div>
        </div>
      )}
      
      {/* 통계 카드 */}
      <div className="widget-grid">
        <div className="stat-card">
          <div className="stat-icon">
            <i className="fas fa-users"></i>
          </div>
          <h3 className="stat-title">고가치 사용자 (활성)</h3>
          <div className="stat-value">{formatNumber(stats?.highValueUsers?.active || 0)}</div>
          <div className="stat-change positive">
            <i className="fas fa-arrow-up stat-change-icon"></i>
            <span>전월 대비 {stats?.highValueUsers?.growthRate || 0}%</span>
          </div>
        </div>
        
        <div className="stat-card">
          <div className="stat-icon red">
            <i className="fas fa-user-clock"></i>
          </div>
          <h3 className="stat-title">고가치 사용자 (휴면)</h3>
          <div className="stat-value">{formatNumber(stats?.highValueUsers?.dormant || 0)}</div>
          <div className="stat-change negative">
            <i className="fas fa-arrow-down stat-change-icon"></i>
            <span>전월 대비 {Math.abs(stats?.highValueUsers?.dormantGrowthRate || 0)}%</span>
          </div>
        </div>
        
        <div className="stat-card">
          <div className="stat-icon green">
            <i className="fas fa-exchange-alt"></i>
          </div>
          <h3 className="stat-title">전환율</h3>
          <div className="stat-value">{stats?.conversion?.rate || 0}%</div>
          <div className="stat-change positive">
            <i className="fas fa-arrow-up stat-change-icon"></i>
            <span>전월 대비 {stats?.conversion?.growthRate || 0}%</span>
          </div>
        </div>
        
        <div className="stat-card">
          <div className="stat-icon yellow">
            <i className="fas fa-chart-line"></i>
          </div>
          <h3 className="stat-title">평균 ROI</h3>
          <div className="stat-value">{stats?.roi?.average || 0}%</div>
          <div className="stat-change positive">
            <i className="fas fa-arrow-up stat-change-icon"></i>
            <span>전월 대비 {stats?.roi?.growthRate || 0}%</span>
          </div>
        </div>
      </div>
      
      {/* 비활성 기간별 전환율 차트 */}
      <div className="chart-container">
        <div className="chart-header">
          <h3 className="chart-title">비활성 기간별 전환율</h3>
          <div className="chart-filters">
            <button className={`chart-filter ${timeRange === 'weekly' ? 'active' : ''}`} onClick={() => setTimeRange('weekly')}>주간</button>
            <button className={`chart-filter ${timeRange === 'monthly' ? 'active' : ''}`} onClick={() => setTimeRange('monthly')}>월간</button>
            <button className={`chart-filter ${timeRange === 'quarterly' ? 'active' : ''}`} onClick={() => setTimeRange('quarterly')}>분기</button>
          </div>
        </div>
        <div className="chart-body">
          <canvas id="conversionChart"></canvas>
        </div>
      </div>
      
      {/* 이벤트 ROI 차트 */}
      <div className="chart-container">
        <div className="chart-header">
          <h3 className="chart-title">이벤트별 ROI 및 전환율</h3>
          <div className="chart-filters">
            <button className={`chart-filter ${timeRange === 'weekly' ? 'active' : ''}`} onClick={() => setTimeRange('weekly')}>주간</button>
            <button className={`chart-filter ${timeRange === 'monthly' ? 'active' : ''}`} onClick={() => setTimeRange('monthly')}>월간</button>
            <button className={`chart-filter ${timeRange === 'quarterly' ? 'active' : ''}`} onClick={() => setTimeRange('quarterly')}>분기</button>
          </div>
        </div>
        <div className="chart-body">
          <canvas id="roiChart"></canvas>
        </div>
      </div>
      
      {/* 재활성화 추천 사용자 테이블 */}
      <div className="data-table-container">
        <div className="data-table-header">
          <h3 className="data-table-title">재활성화 추천 사용자</h3>
          <div className="data-table-actions">
            <div className="data-table-search">
              <i className="fas fa-search"></i>
              <input type="text" placeholder="검색..." />
            </div>
            <button className="filter-button">
              <i className="fas fa-filter"></i>
              <span>필터</span>
            </button>
            <button className="filter-button secondary">
              <i className="fas fa-download"></i>
              <span>내보내기</span>
            </button>
          </div>
        </div>
        <div className="data-table-wrapper">
          <table className="data-table">
            <thead>
              <tr>
                <th>ID</th>
                <th>사용자 이름</th>
                <th>가치 점수</th>
                <th>세그먼트</th>
                <th>비활성 일수</th>
                <th>마지막 활동</th>
                <th>순 베팅액</th>
                <th>예상 전환율</th>
                <th>조치</th>
              </tr>
            </thead>
            <tbody>
              <tr>
                <td>1001</td>
                <td>홍길동</td>
                <td>8.5</td>
                <td>Gold</td>
                <td>45</td>
                <td>2025-04-05</td>
                <td>₩250,000</td>
                <td>32%</td>
                <td>
                  <button className="filter-button">
                    <i className="fas fa-bullhorn"></i>
                    <span>캠페인</span>
                  </button>
                </td>
              </tr>
              <tr>
                <td>1002</td>
                <td>김철수</td>
                <td>7.8</td>
                <td>Gold</td>
                <td>52</td>
                <td>2025-03-29</td>
                <td>₩220,000</td>
                <td>28%</td>
                <td>
                  <button className="filter-button">
                    <i className="fas fa-bullhorn"></i>
                    <span>캠페인</span>
                  </button>
                </td>
              </tr>
              <tr>
                <td>1003</td>
                <td>이영희</td>
                <td>9.2</td>
                <td>Platinum</td>
                <td>38</td>
                <td>2025-04-12</td>
                <td>₩320,000</td>
                <td>45%</td>
                <td>
                  <button className="filter-button">
                    <i className="fas fa-bullhorn"></i>
                    <span>캠페인</span>
                  </button>
                </td>
              </tr>
              <tr>
                <td>1004</td>
                <td>박민수</td>
                <td>6.4</td>
                <td>Silver</td>
                <td>68</td>
                <td>2025-03-13</td>
                <td>₩180,000</td>
                <td>22%</td>
                <td>
                  <button className="filter-button">
                    <i className="fas fa-bullhorn"></i>
                    <span>캠페인</span>
                  </button>
                </td>
              </tr>
              <tr>
                <td>1005</td>
                <td>정지원</td>
                <td>8.9</td>
                <td>Gold</td>
                <td>42</td>
                <td>2025-04-08</td>
                <td>₩280,000</td>
                <td>36%</td>
                <td>
                  <button className="filter-button">
                    <i className="fas fa-bullhorn"></i>
                    <span>캠페인</span>
                  </button>
                </td>
              </tr>
            </tbody>
          </table>
        </div>
        <div className="data-table-footer">
          <div>총 5개 항목 중 1-5 표시</div>
          <div className="data-table-pagination">
            <button className="pagination-button" disabled>
              <i className="fas fa-chevron-left"></i>
            </button>
            <button className="pagination-button active">1</button>
            <button className="pagination-button">
              <i className="fas fa-chevron-right"></i>
            </button>
          </div>
        </div>
      </div>
    </div>
  );
}

// 접근 제어 래퍼
function ProtectedRoute({ requiredRoles = ['user'], children }) {
  const { user, loading, hasRole } = useAuth();
  
  // 로딩 중이면 로딩 화면 표시
  if (loading) {
    return (
      <div className="loading-container">
        <div className="spinner-border text-primary" role="status">
          <span className="visually-hidden">로딩 중...</span>
        </div>
        <p>권한 확인 중...</p>
      </div>
    );
  }
  
  // 로그인하지 않은 경우 로그인 페이지로 리디렉션
  if (!user) {
    window.location.href = '/login.html';
    return null;
  }
  
  // 필요한 역할이 없는 경우
  const hasRequiredRole = requiredRoles.some(role => hasRole(role));
  if (!hasRequiredRole) {
    return (
      <div className="alert alert-danger" role="alert">
        <h4 className="alert-heading">접근 권한 없음</h4>
        <p>이 페이지에 접근할 수 있는 권한이 없습니다.</p>
        <hr />
        <p className="mb-0">필요한 권한: {requiredRoles.join(', ')}</p>
      </div>
    );
  }
  
  return children;
}

// 앱 컴포넌트
function App() {
  return (
    <AuthProvider>
      <DashboardLayout>
        <ProtectedRoute>
          <Dashboard />
        </ProtectedRoute>
      </DashboardLayout>
    </AuthProvider>
  );
}

// React 앱 렌더링
const root = createRoot(document.getElementById('app'));
root.render(<App />);
