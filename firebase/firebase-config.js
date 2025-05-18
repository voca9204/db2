// Firebase 설정 파일
// db888 프로젝트에 추가적인 웹 앱으로 db2를 등록한 후 여기에 설정을 저장하세요

// 실제 Firebase 프로젝트에서 받은 설정으로 대체하세요
const firebaseConfig = {
  apiKey: "YOUR_API_KEY",
  authDomain: "db888.firebaseapp.com",
  projectId: "db888",
  storageBucket: "db888.appspot.com",
  messagingSenderId: "YOUR_MESSAGING_SENDER_ID",
  appId: "YOUR_APP_ID",
  measurementId: "YOUR_MEASUREMENT_ID"
};

// Firebase 초기화
import { initializeApp } from 'firebase/app';
import { getAuth } from 'firebase/auth';
import { getFirestore } from 'firebase/firestore';
import { getStorage } from 'firebase/storage';
import { getAnalytics } from 'firebase/analytics';

const app = initializeApp(firebaseConfig);
const auth = getAuth(app);
const db = getFirestore(app);
const storage = getStorage(app);
const analytics = getAnalytics(app);

export { app, auth, db, storage, analytics };
