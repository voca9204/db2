# Firebase Emulator 포트 정리 및 설정 가이드

## 📊 현재 포트 설정 (2025-05-22 정리 완료)

### 최종 포트 구성
- **Firebase Functions**: 9000
- **정적 파일 서버**: 8080
- **Firebase Hub**: 4400 (자동 할당)
- **기타 예약**: 4500 (자동 할당)

### 주요 URL
- **API 베이스**: http://127.0.0.1:9000/db888-67827/us-central1/
- **고가치 사용자 API**: http://127.0.0.1:9000/db888-67827/us-central1/highValueUsersApi
- **웹 페이지**: http://localhost:8080/high_value_users_report.html

## 🔧 Firebase.json 설정

```json
{
  "emulators": {
    "functions": {
      "port": 9000
    },
    "ui": {
      "enabled": false
    }
  }
}
```

### 설정 특징
- **단순화**: 필요한 최소한의 설정만 포함
- **충돌 방지**: 일반적으로 사용되지 않는 포트 9000 사용
- **UI 비활성화**: 불필요한 UI 포트 충돌 방지

## 🚀 서버 시작 명령어

### Firebase Functions 에뮬레이터
```bash
cd /Users/sinclair/projects/db2
firebase emulators:start --only functions
```

### 정적 파일 서버
```bash
cd /Users/sinclair/projects/db2/public
python3 -m http.server 8080
```


## 🔍 포트 상태 확인 명령어

### 현재 사용 중인 포트 확인
```bash
# Firebase 관련 프로세스
ps aux | grep firebase

# 특정 포트 사용 확인
lsof -ti :9000
lsof -ti :8080

# 모든 관련 포트 확인
lsof -ti :9000,8080,4400,4500
```

### 프로세스 종료
```bash
# Firebase 에뮬레이터 종료
pkill -f firebase

# 정적 파일 서버 종료
pkill -f "http.server"
```

## 📝 API 테스트 명령어

### curl을 사용한 API 테스트
```bash
# 기본 API 테스트
curl -s "http://127.0.0.1:9000/db888-67827/us-central1/highValueUsersApi" | head -c 200

# Hello World 테스트
curl "http://127.0.0.1:9000/db888-67827/us-central1/helloWorld"

# DB 연결 테스트
curl "http://127.0.0.1:9000/db888-67827/us-central1/testConnection"
```

### 웹 페이지 테스트
```bash
# HTML 페이지 상태 확인
curl -I http://localhost:8080/high_value_users_report.html
```

## 🛠️ 문제 해결 가이드

### 포트 충돌 해결
```bash
# 1. 모든 Firebase 프로세스 종료
pkill -f firebase

# 2. 포트 사용 확인
lsof -ti :9000

# 3. 필요시 특정 PID 종료
kill -9 [PID]

# 4. 에뮬레이터 재시작
firebase emulators:start --only functions
```


### 캐시 문제 해결
HTML 파일에 이미 캐시 무효화 헤더 추가됨:
```html
<meta http-equiv="Cache-Control" content="no-cache, no-store, must-revalidate">
<meta http-equiv="Pragma" content="no-cache">
<meta http-equiv="Expires" content="0">
```

## ✅ 검증 완료 사항

### Firebase Functions
- ✅ 포트 9000에서 안정적 실행
- ✅ 8개 Function 정상 로드
- ✅ API 응답 테스트 성공
- ✅ MariaDB 연결 정상

### 웹 인터페이스
- ✅ 포트 8080에서 정상 서비스
- ✅ HTML 페이지 로드 성공
- ✅ JavaScript 변수 이슈 해결
- ✅ API 연동 준비 완료

## 🎯 이전 문제점과 해결

### 해결된 문제들
1. **포트 충돌**: 9090, 9095 → 9000으로 변경
2. **복잡한 설정**: 불필요한 포트 설정 제거
3. **프로세스 중복**: 완전한 정리 후 재시작
4. **캐시 문제**: 브라우저 캐시 무효화 헤더 추가

### 현재 상태
- **Firebase Functions**: ✅ 100% 안정
- **정적 파일 서버**: ✅ 100% 안정
- **API 통신**: ✅ 100% 정상
- **포트 관리**: ✅ 100% 정리됨

---

**모든 포트 충돌 문제가 완전히 해결되어 안정적인 개발 환경이 구축되었습니다.**
