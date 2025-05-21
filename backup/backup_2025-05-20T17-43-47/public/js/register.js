// Firebase 인증 관련 회원가입 기능 구현
import { initializeApp } from 'https://www.gstatic.com/firebasejs/9.22.0/firebase-app.js';
import { 
  getAuth, 
  createUserWithEmailAndPassword, 
  GoogleAuthProvider, 
  signInWithPopup,
  updateProfile
} from 'https://www.gstatic.com/firebasejs/9.22.0/firebase-auth.js';
import { 
  getFirestore, 
  doc, 
  setDoc 
} from 'https://www.gstatic.com/firebasejs/9.22.0/firebase-firestore.js';

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
const db = getFirestore(app);
const provider = new GoogleAuthProvider();

// DOM 요소
const registerForm = document.getElementById('registerForm');
const nameInput = document.getElementById('name');
const emailInput = document.getElementById('email');
const passwordInput = document.getElementById('password');
const confirmPasswordInput = document.getElementById('confirmPassword');
const googleSignupBtn = document.getElementById('googleSignup');
const errorAlert = document.getElementById('errorAlert');

// 이메일/비밀번호 회원가입
registerForm.addEventListener('submit', async (e) => {
  e.preventDefault();
  
  const name = nameInput.value;
  const email = emailInput.value;
  const password = passwordInput.value;
  const confirmPassword = confirmPasswordInput.value;
  
  // 입력 유효성 검사
  if (password !== confirmPassword) {
    showError('비밀번호가 일치하지 않습니다.');
    return;
  }
  
  if (password.length < 6) {
    showError('비밀번호는 최소 6자 이상이어야 합니다.');
    return;
  }
  
  try {
    // 회원가입 시도
    const userCredential = await createUserWithEmailAndPassword(auth, email, password);
    const user = userCredential.user;
    
    // 사용자 프로필 업데이트
    await updateProfile(user, { displayName: name });
    
    // Firestore에 사용자 정보 저장
    await saveUserToFirestore(user, name);
    
    // 회원가입 성공 - 메인 페이지로 리디렉션
    window.location.href = 'main-index.html';
  } catch (error) {
    // 에러 메시지 표시
    showError(getErrorMessage(error.code));
  }
});

// Google 회원가입
googleSignupBtn.addEventListener('click', async () => {
  try {
    // Google 로그인 팝업 표시
    const result = await signInWithPopup(auth, provider);
    const user = result.user;
    
    // Firestore에 사용자 정보 저장
    await saveUserToFirestore(user, user.displayName);
    
    // 회원가입 성공 - 메인 페이지로 리디렉션
    window.location.href = 'main-index.html';
  } catch (error) {
    // 팝업이 닫히거나 에러 발생 시
    if (error.code !== 'auth/popup-closed-by-user') {
      showError(getErrorMessage(error.code));
    }
  }
});

// Firestore에 사용자 정보 저장
async function saveUserToFirestore(user, name) {
  try {
    const userDocRef = doc(db, 'users', user.uid);
    
    await setDoc(userDocRef, {
      uid: user.uid,
      name: name || user.displayName || '',
      email: user.email,
      photoURL: user.photoURL || '',
      createdAt: new Date(),
      lastLogin: new Date(),
      role: 'user'  // 기본 권한
    });
  } catch (error) {
    console.error('사용자 정보 저장 오류:', error);
    // 계속 진행 (사용자 생성은 성공적으로 완료됨)
  }
}

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
    case 'auth/email-already-in-use':
      return '이미 사용 중인 이메일 주소입니다.';
    case 'auth/invalid-email':
      return '유효하지 않은 이메일 형식입니다.';
    case 'auth/weak-password':
      return '비밀번호가 너무 약합니다. 더 강력한 비밀번호를 사용하세요.';
    case 'auth/operation-not-allowed':
      return '이 작업은 허용되지 않습니다. 관리자에게 문의하세요.';
    case 'auth/network-request-failed':
      return '네트워크 오류가 발생했습니다. 인터넷 연결을 확인하세요.';
    case 'auth/account-exists-with-different-credential':
      return '이미 다른 로그인 방법으로 등록된 이메일입니다.';
    default:
      return `회원가입 중 오류가 발생했습니다: ${errorCode}`;
  }
}

// 로그인 상태 확인
auth.onAuthStateChanged((user) => {
  if (user) {
    // 이미 로그인된 경우 메인 페이지로 이동
    window.location.href = 'main-index.html';
  }
});
