# Firebase 서비스 계정 및 IAM 권한 설정 가이드

Firebase Functions 마이그레이션을 위한 서비스 계정 및 IAM 권한 설정 가이드입니다. 이 문서는 로컬 개발 환경과 클라우드 환경에서 필요한 서비스 계정 설정 및 IAM 권한 구성에 대한 내용을 다룹니다.

## 1. 서비스 계정 확인 및 설정

### Google Cloud Console에서 서비스 계정 확인

1. [Google Cloud Console](https://console.cloud.google.com/)에 로그인합니다.
2. 프로젝트 선택 드롭다운에서 `db888-67827` 프로젝트를 선택합니다.
3. 왼쪽 메뉴에서 "IAM 및 관리 > 서비스 계정"을 선택합니다.
4. 서비스 계정 목록에서 다음 계정이 있는지 확인합니다:
   - `[PROJECT_ID]@appspot.gserviceaccount.com` (앱 엔진 기본 서비스 계정)
   - `[PROJECT_NUMBER]-compute@developer.gserviceaccount.com` (Compute Engine 기본 서비스 계정)
   - `firebase-adminsdk-[HASH]@[PROJECT_ID].iam.gserviceaccount.com` (Firebase Admin SDK 서비스 계정)

### 서비스 계정 생성 (필요한 경우)

기본 서비스 계정이 없거나 새로운 서비스 계정이 필요한 경우:

1. "서비스 계정 만들기" 버튼을 클릭합니다.
2. 다음 정보를 입력합니다:
   - 서비스 계정 이름: `firebase-functions`
   - 서비스 계정 ID: `firebase-functions`
   - 설명: `Firebase Functions 실행을 위한 서비스 계정`
3. "만들고 계속하기" 버튼을 클릭합니다.

## 2. 필요한 IAM 권한 부여

### 필수 역할

Firebase Functions 및 관련 서비스를 사용하기 위해 서비스 계정에 다음 역할이 필요합니다:

1. **Firebase 관련 역할**:
   - `roles/firebase.admin` (Firebase Admin): Firebase 리소스에 대한 전체 접근 권한
   - `roles/firebasefunctions.admin` (Cloud Functions Admin): Functions 관리 권한
   - `roles/firebaseauth.admin` (Firebase Authentication Admin): 인증 관리 권한
   - `roles/datastore.user` (Datastore/Firestore 사용자): Firestore 읽기/쓰기 권한

2. **Compute Engine 관련 역할**:
   - `roles/compute.serviceAgent` (Compute Engine 서비스 계정): Compute Engine 리소스 접근 권한

3. **Cloud Storage 관련 역할**:
   - `roles/storage.objectAdmin` (Storage Object Admin): Cloud Storage 객체 관리 권한

4. **로그 관련 역할**:
   - `roles/logging.logWriter` (Logs Writer): 로그 작성 권한
   - `roles/monitoring.metricWriter` (Monitoring Metric Writer): 모니터링 메트릭 작성 권한

### 권한 부여 방법

1. Google Cloud Console의 "IAM 및 관리 > IAM" 페이지로 이동합니다.
2. "주 구성원 추가" 버튼을 클릭합니다.
3. 추가할 서비스 계정 이메일을 입력합니다.
4. "역할 선택" 드롭다운에서 위에 나열된 각 역할을 추가합니다.
5. "저장" 버튼을 클릭합니다.

## 3. 서비스 계정 키 관리 (로컬 개발용)

### 서비스 계정 키 생성

로컬 개발 환경에서 Firebase 서비스에 접근하려면 서비스 계정 키가 필요합니다:

1. 서비스 계정 목록에서 Firebase Admin SDK 서비스 계정을 선택합니다.
2. "키" 탭을 클릭합니다.
3. "키 추가 > 새 키 만들기"를 선택합니다.
4. "JSON" 형식을 선택하고 "만들기" 버튼을 클릭합니다.
5. 서비스 계정 키 JSON 파일이 로컬 컴퓨터에 다운로드됩니다.

### 키 파일 보안 관리

⚠️ **주의**: 서비스 계정 키는 민감한 정보이므로 안전하게 관리해야 합니다:

1. 다운로드한 키 파일을 안전한 위치에 저장합니다 (프로젝트 디렉토리 외부).
2. `.env` 파일에 키 파일 경로를 환경 변수로 설정합니다:
   ```
   GOOGLE_APPLICATION_CREDENTIALS=/path/to/service-account-key.json
   ```
3. `.gitignore` 파일에 다음 항목을 추가하여 실수로 키 파일이 저장소에 업로드되지 않도록 합니다:
   ```
   *.json
   !package.json
   !package-lock.json
   !firebase.json
   !firestore.rules
   !firestore.indexes.json
   .env
   ```

## 4. Firebase CLI 인증 설정

### Firebase CLI 설치 및 로그인

```bash
# Firebase CLI 설치
npm install -g firebase-tools

# Firebase 계정으로 로그인
firebase login

# 프로젝트 설정
firebase use --add
# 프로젝트 ID를 선택하고 별칭 지정 (예: default)
```

### 여러 환경 설정

개발, 스테이징, 프로덕션 환경을 구분하여 설정:

```bash
# 개발 환경
firebase use --add
# 프로젝트 ID 선택 후 별칭 'development' 지정

# 스테이징 환경
firebase use --add
# 프로젝트 ID 선택 후 별칭 'staging' 지정

# 프로덕션 환경
firebase use --add
# 프로젝트 ID 선택 후 별칭 'production' 지정

# 현재 활성 프로젝트 확인
firebase use
```

## 5. 서비스 계정 연결 테스트

다음 테스트 스크립트를 실행하여 서비스 계정이 올바르게 설정되었는지 확인합니다:

```javascript
// test-service-account.js
const admin = require('firebase-admin');

// Firebase 앱 초기화
admin.initializeApp();

async function testServiceAccount() {
  try {
    console.log('Testing Firebase service account...');
    
    // 프로젝트 ID 확인
    const projectId = admin.app().options.projectId;
    console.log(`Project ID: ${projectId}`);
    
    // Firestore 연결 테스트
    const db = admin.firestore();
    const testDocRef = db.collection('test').doc('service-account-test');
    await testDocRef.set({
      timestamp: admin.firestore.FieldValue.serverTimestamp(),
      message: 'Service account connection test'
    });
    console.log('Firestore write test: SUCCESS');
    
    // Authentication 서비스 연결 테스트
    const auth = admin.auth();
    const userCount = (await auth.listUsers(1)).users.length;
    console.log(`Authentication test: SUCCESS (found ${userCount} user)`);
    
    console.log('Service account configuration test completed successfully!');
  } catch (error) {
    console.error('Service account test failed:', error);
    process.exit(1);
  }
}

testServiceAccount();
```

## 6. 문제 해결

### 서비스 계정이 없는 경우

배포 시 "Default service account '888497598316-compute@developer.gserviceaccount.com' doesn't exist" 오류가 발생하는 경우:

1. Google Cloud API & Services > 대시보드로 이동합니다.
2. Cloud Functions API와 Compute Engine API가 활성화되어 있는지 확인합니다.
3. 활성화되어 있지 않다면 "API 및 서비스 사용 설정" 버튼을 클릭하여 활성화합니다.
4. Service Usage API가 활성화되어 있는지 확인합니다.
5. IAM & Admin > 서비스 계정으로 이동하여 서비스 계정을 생성하거나 복원합니다.

### 권한 부족 오류

"Permission denied" 또는 "Insufficient Permissions" 오류가 발생하는 경우:

1. 해당 서비스 계정에 필요한 모든 역할이 부여되었는지 확인합니다.
2. 특히 `roles/cloudfunctions.serviceAgent` 권한이 중요합니다.
3. Google Cloud Console에서 "IAM 및 관리 > IAM"으로 이동하여 서비스 계정에 필요한 역할을 추가합니다.

## 7. 보안 모범 사례

1. **최소 권한 원칙 적용**: 서비스 계정에는 필요한 최소한의 권한만 부여합니다.
2. **키 순환**: 서비스 계정 키를 정기적으로 교체합니다 (3-6개월마다).
3. **키 철회**: 더 이상 필요하지 않거나 노출된 키는 즉시 철회합니다.
4. **환경 분리**: 개발, 스테이징, 프로덕션 환경에 별도의 서비스 계정을 사용합니다.
5. **비밀 관리**: Secret Manager를 사용하여 API 키, 비밀번호 등을 안전하게 관리합니다.

## 8. 다음 단계

서비스 계정 설정 및 IAM 권한 구성이 완료되면 다음을 진행합니다:

1. Firebase Functions 에뮬레이터 설정
2. 로컬 개발 환경 구성
3. 간단한 테스트 함수 배포 및 검증
