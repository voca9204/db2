# Firebase 연동 가이드

이 문서는 db2 프로젝트와 Firebase의 db888 프로젝트를 연동하는 방법을 설명합니다.

## 필요 조건
- Firebase 계정
- 기존 Firebase 프로젝트 (db888)
- Node.js와 npm 설치

## 1. Firebase CLI 설치
```bash
npm install -g firebase-tools
```

## 2. Firebase 로그인
```bash
firebase login
```

## 3. 기존 프로젝트에 새 웹 앱 추가

1. [Firebase 콘솔](https://console.firebase.google.com/)에 접속
2. db888 프로젝트 선택
3. "프로젝트 개요" 페이지에서 웹 아이콘(</>) 클릭
4. 앱 닉네임을 "db2"로 설정하고 등록
5. 표시되는 Firebase 구성 설정을 복사

## 4. 구성 파일 업데이트

`firebase/firebase-config.js` 파일을 열고 복사한 설정으로 `firebaseConfig` 객체를 업데이트합니다.

```javascript
const firebaseConfig = {
  apiKey: "YOUR_ACTUAL_API_KEY",
  authDomain: "db888.firebaseapp.com",
  projectId: "db888",
  storageBucket: "db888.appspot.com",
  messagingSenderId: "YOUR_ACTUAL_MESSAGING_SENDER_ID",
  appId: "YOUR_ACTUAL_APP_ID",
  measurementId: "YOUR_ACTUAL_MEASUREMENT_ID"
};
```

## 5. 프로젝트 초기화

```bash
cd /users/sinclair/projects/db2
firebase init
```

초기화 과정에서:
- 기존 프로젝트 선택 (db888)
- 필요한 서비스 선택: Hosting, Firestore, Storage 등
- 공개 디렉토리를 "public"으로 설정
- single-page app 설정: Yes

## 6. 호스팅 설정

호스팅을 위한 기본 파일을 생성합니다:

```bash
mkdir -p public
touch public/index.html
```

`public/index.html`에 기본 HTML 구조를 추가합니다.

## 7. Firebase 배포

```bash
firebase deploy
```

또는 특정 서비스만 배포:

```bash
firebase deploy --only hosting
```

## 8. 커스텀 도메인 설정 (선택 사항)

1. Firebase 콘솔의 Hosting 섹션으로 이동
2. "커스텀 도메인 추가" 클릭
3. 안내에 따라 도메인 설정

## 인증 시스템 공유

Firebase 인증은 프로젝트 수준에서 관리되므로, db888과 db2 사이에 자동으로 공유됩니다. 하지만 각 앱에서 사용자 권한을 다르게 관리하려면 Firestore 보안 규칙을 구성해야 합니다.

`firestore.rules` 파일 예시:

```
rules_version = '2';
service cloud.firestore {
  match /databases/{database}/documents {
    // 모든 앱에 공통 규칙
    match /users/{userId} {
      allow read: if request.auth != null && request.auth.uid == userId;
      allow write: if request.auth != null && request.auth.uid == userId;
    }
    
    // db2 앱용 데이터
    match /db2/{document=**} {
      allow read: if request.auth != null;
      allow write: if request.auth != null && exists(/databases/$(database)/documents/users/$(request.auth.uid)/roles/db2Admin);
    }
    
    // db888 앱용 데이터
    match /db888/{document=**} {
      allow read: if request.auth != null;
      allow write: if request.auth != null && exists(/databases/$(database)/documents/users/$(request.auth.uid)/roles/db888Admin);
    }
  }
}
```

## 주의 사항

1. 보안 규칙을 신중하게 설정하여 한 앱의 데이터가 다른 앱에서 부적절하게 접근되지 않도록 합니다.
2. 공유 Firebase 프로젝트의 무료 할당량은 모든 앱에 걸쳐 공유됩니다.
3. 프로젝트가 성장함에 따라 별도의 Firebase 프로젝트로 분리하는 것이 더 적합할 수 있습니다.
