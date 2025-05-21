# Firebase Service Account 설정 안내

이 디렉토리에는 Firebase Admin SDK를 사용하기 위한 서비스 계정 키 파일이 필요합니다.

## 서비스 계정 키 생성 방법

1. Firebase 콘솔(https://console.firebase.google.com)에 접속합니다.
2. 프로젝트 설정으로 이동합니다.
3. "서비스 계정" 탭을 선택합니다.
4. "새 비공개 키 생성" 버튼을 클릭합니다.
5. 다운로드된 JSON 파일을 이 디렉토리에 `service-account.json` 이름으로 저장합니다.

## 주의사항

- 서비스 계정 키는 민감한 정보이므로 git에 커밋하지 마세요.
- `.gitignore` 파일에 `service-account.json`이 포함되어 있는지 확인하세요.
- 서비스 계정 키는 안전한 위치에 백업해두세요.

## 테스트 목적의 더미 파일

개발 시작을 위해 다음 명령어로 더미 서비스 계정 키 파일을 생성할 수 있습니다:

```bash
cat << EOF > service-account.json
{
  "type": "service_account",
  "project_id": "db888-67827",
  "private_key_id": "dummy_key_id",
  "private_key": "-----BEGIN PRIVATE KEY-----\ndummy_private_key\n-----END PRIVATE KEY-----\n",
  "client_email": "firebase-adminsdk-dummy@db888-67827.iam.gserviceaccount.com",
  "client_id": "dummy_client_id",
  "auth_uri": "https://accounts.google.com/o/oauth2/auth",
  "token_uri": "https://oauth2.googleapis.com/token",
  "auth_provider_x509_cert_url": "https://www.googleapis.com/oauth2/v1/certs",
  "client_x509_cert_url": "https://www.googleapis.com/robot/v1/metadata/x509/firebase-adminsdk-dummy%40db888-67827.iam.gserviceaccount.com",
  "universe_domain": "googleapis.com"
}
EOF
```

이 더미 파일은 실제 Firebase 서비스에 연결되지 않으므로, 실제 서비스 계정 키를 얻은 후 반드시 교체해야 합니다.
