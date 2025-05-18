// Firebase 인증 관련 로그인 기능 구현
import { initializeApp } from 'https://www.gstatic.com/firebasejs/9.22.0/firebase-app.js';
import { 
  getAuth, 
  signInWithEmailAndPassword, 
  GoogleAuthProvider, 
  signInWithPopup,
  sendPasswordResetEmail
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
const provider = new GoogleAuthProvider();

// DOM 요소
const loginForm = document.getElementById('loginForm');
const emailInput = document.getElementById('email');
const passwordInput = document.getElementById('password');
const googleLoginBtn = document.getElementById('googleLogin');
const forgotPasswordLink = document.getElementById('forgotPassword');
const errorAlert = document.getElementById('errorAlert');

// 이메일/비밀번호 로그인
loginForm.addEventListener('submit', async (e) => {
  e.preventDefault();
  
  const email = emailInput.value;
  const password = passwordInput.value;
  
  try {
    // 로그인 시도
    await signInWithEmailAndPassword(auth, email, password);
    // 로그인 성공 - 메인 페이지로 리디렉션
    window.location.href = 'index.html';
  } catch (error) {
    // 에러 메시지 표시
    showError(getErrorMessage(error.code));
  }
});

// Google 로그인
googleLoginBtn.addEventListener('click', async () => {
  try {
    // Google 로그인 팝업 표시
    await signInWithPopup(auth, provider);
    // 로그인 성공 - 메인 페이지로 리디렉션
    window.location.href = 'index.html';
  } catch (error) {
    // 팝업이 닫히거나 에러 발생 시
    if (error.code !== 'auth/popup-closed-by-user') {
      showError(getErrorMessage(error.code));
    }
  }
});

// 비밀번호 재설정
forgotPasswordLink.addEventListener('click', async (e) => {
  e.preventDefault();
  
  const email = emailInput.value;
  
  if (!email) {
    showError('비밀번호 재설정을 위해 이메일을 입력해주세요.');
    emailInput.focus();
    return;
  }
  
  try {
    // 비밀번호 재설정 이메일 전송
    await sendPasswordResetEmail(auth, email);
    showError(`${email}로 비밀번호 재설정 이메일을 전송했습니다.`, 'success');
  } catch (error) {
    showError(getErrorMessage(error.code));
  }
});

// 에러 메시지 표시 함수
function showError(message, type = 'danger') {
  errorAlert.textContent = message;
  errorAlert.className = `alert alert-${type}`;
  errorAlert.style.display = 'block';
  
  // 3초 후 에러 메시지 숨기기
  setTimeout(() => {
    errorAlert.style.display = 'none';
  }, 5000);
}

// Firebase 에러 코드를 사용자 친화적인 메시지로 변환
function getErrorMessage(errorCode) {
  switch (errorCode) {
    case 'auth/user-not-found':
    case 'auth/wrong-password':
      return '이메일 또는 비밀번호가 올바르지 않습니다.';
    case 'auth/invalid-email':
      return '유효하지 않은 이메일 형식입니다.';
    case 'auth/user-disabled':
      return '이 계정은 비활성화되었습니다. 관리자에게 문의하세요.';
    case 'auth/too-many-requests':
      return '너무 많은 로그인 시도가 있었습니다. 나중에 다시 시도하세요.';
    case 'auth/network-request-failed':
      return '네트워크 오류가 발생했습니다. 인터넷 연결을 확인하세요.';
    case 'auth/requires-recent-login':
      return '이 작업을 위해 최근 로그인이 필요합니다. 다시 로그인해주세요.';
    case 'auth/email-already-in-use':
      return '이미 사용 중인 이메일 주소입니다.';
    case 'auth/weak-password':
      return '비밀번호가 너무 약합니다. 더 강력한 비밀번호를 사용하세요.';
    case 'auth/popup-blocked':
      return '팝업이 차단되었습니다. 팝업 차단을 해제하고 다시 시도하세요.';
    case 'auth/account-exists-with-different-credential':
      return '이미 다른 로그인 방법으로 등록된 이메일입니다.';
    default:
      return `로그인 중 오류가 발생했습니다: ${errorCode}`;
  }
}

// 로그인 상태 확인
auth.onAuthStateChanged((user) => {
  if (user) {
    // 이미 로그인된 경우 메인 페이지로 이동
    window.location.href = 'index.html';
  }
});
