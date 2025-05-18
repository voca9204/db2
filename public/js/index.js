// 인증 상태 및 대시보드 기능 관리
import { initializeApp } from 'https://www.gstatic.com/firebasejs/9.22.0/firebase-app.js';
import { 
  getAuth, 
  signOut,
  onAuthStateChanged
} from 'https://www.gstatic.com/firebasejs/9.22.0/firebase-auth.js';

// Firebase 설정
const firebaseConfig = {
  apiKey: "AIzaSyD2RY02pN2RrhT8Qt2hTSEilRqV4JAbCR0",
  authDomain: "db888-67827.firebaseapp.com",
  projectId: "db888-67827",
  storageBucket: "db888-67827.firebasestorage.app",
  messagingSenderId: "888497598316",
  appId: "1:888497598316:web:b2cb26b0a825e11a658d49"
};

// Firebase 초기화
const app = initializeApp(firebaseConfig);
const auth = getAuth(app);

// DOM 요소
const loadingScreen = document.getElementById('loadingScreen');
const loginRequired = document.getElementById('loginRequired');
const authenticatedContent = document.getElementById('authenticatedContent');
const logoutButton = document.getElementById('logoutButton');
const sidebarToggle = document.getElementById('sidebarToggle');
const sidebar = document.getElementById('sidebar');
const content = document.getElementById('content');
const userAvatar = document.getElementById('userAvatar');
const userName = document.getElementById('userName');

// 로그아웃 기능
logoutButton.addEventListener('click', async (e) => {
  e.preventDefault();
  
  try {
    await signOut(auth);
    // 로그아웃 성공 시 로그인 페이지로 리디렉션
    window.location.href = 'login.html';
  } catch (error) {
    console.error('로그아웃 오류:', error);
  }
});

// 사이드바 토글 기능
sidebarToggle.addEventListener('click', () => {
  sidebar.classList.toggle('collapsed');
  content.classList.toggle('expanded');
});

// 인증 상태 확인
onAuthStateChanged(auth, (user) => {
  // 로딩 화면 숨기기
  loadingScreen.style.display = 'none';
  
  if (user) {
    // 사용자가 로그인한 경우
    authenticatedContent.style.display = 'block';
    loginRequired.style.display = 'none';
    
    // 사용자 정보 표시
    if (user.photoURL) {
      userAvatar.src = user.photoURL;
    } else {
      userAvatar.src = 'assets/logo-placeholder.svg';
    }
    
    userName.textContent = user.displayName || user.email;
    
    // 여기에 대시보드 데이터 로드 및 그래프 생성 코드 추가
    loadDashboardData();
  } else {
    // 사용자가 로그인하지 않은 경우
    authenticatedContent.style.display = 'none';
    loginRequired.style.display = 'block';
  }
});

// 대시보드 데이터 로드 함수 (여기서는 실제 구현하지 않음)
function loadDashboardData() {
  // 실제 구현에서는 Firestore나 서버 API에서 데이터를 가져와 대시보드를 업데이트합니다.
  console.log('대시보드 데이터 로드 중...');
  
  // 이 예시에서는 대시보드 데이터를 로드하는 시뮬레이션만 수행합니다.
  // 실제 구현에서는 API 호출 및 데이터 처리 로직이 추가되어야 합니다.
}

// 화면 크기에 따른 사이드바 표시 처리
function handleResize() {
  if (window.innerWidth < 768) {
    sidebar.classList.add('collapsed');
    content.classList.add('expanded');
  } else {
    sidebar.classList.remove('collapsed');
    content.classList.remove('expanded');
  }
}

// 초기화 시 화면 크기 처리
handleResize();

// 창 크기 변경 감지
window.addEventListener('resize', handleResize);
