// Firebase 인증 관리
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
const mainContent = document.getElementById('main-content');
const logoutButton = document.getElementById('logoutButton');
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

// 인증 상태 확인
onAuthStateChanged(auth, (user) => {
  // 로딩 화면 숨기기
  loadingScreen.style.display = 'none';
  
  if (user) {
    // 사용자가 로그인한 경우
    mainContent.style.display = 'block';
    loginRequired.style.display = 'none';
    
    // 사용자 정보 표시
    if (user.photoURL) {
      userAvatar.src = user.photoURL;
    } else {
      userAvatar.src = 'assets/logo-placeholder.svg';
    }
    
    userName.textContent = user.displayName || user.email || '사용자';
    
    // 태그 필터링 초기화 (이벤트 핸들러가 DOMContentLoaded에서 설정됨)
    const allFilter = document.querySelector('.tag-filter-pill[data-tag="all"]');
    if (allFilter) {
      allFilter.classList.add('active');
    }
  } else {
    // 사용자가 로그인하지 않은 경우
    mainContent.style.display = 'none';
    loginRequired.style.display = 'block';
  }
});
