# DB2 프로젝트 설치 및 설정 가이드

이 문서는 DB2 프로젝트를 처음 설치하고 설정하는 방법에 대한 상세한 안내를 제공합니다.

## 목차

1. [시스템 요구사항](#시스템-요구사항)
2. [기본 설치](#기본-설치)
3. [데이터베이스 설정](#데이터베이스-설정)
4. [Firebase 설정](#firebase-설정)
5. [개발 환경 설정](#개발-환경-설정)
6. [배포 설정](#배포-설정)
7. [문제 해결](#문제-해결)

## 시스템 요구사항

- Python 3.8 이상
- Node.js 14.x 이상 (Firebase Functions용)
- MariaDB 10.5 이상
- Git

## 기본 설치

### 1. 저장소 클론

```bash
git clone https://github.com/voca9204@gmail.com/db2.git
cd db2
```

### 2. Python 가상 환경 설정

```bash
# venv 생성
python -m venv venv

# 가상 환경 활성화
# Linux/macOS
source venv/bin/activate
# Windows
venv\Scripts\activate
```

### 3. 필요한 패키지 설치

```bash
pip install -r requirements.txt
```

## 데이터베이스 설정

### 1. 환경 변수 설정

프로젝트 루트 디렉토리에 `.env` 파일을 생성하고 다음 내용을 추가합니다:

```
DB_HOST=211.248.190.46
DB_PORT=3306
DB_NAME=hermes
DB_USER=hermes
DB_PASSWORD=mcygicng!022
DB_CHARSET=utf8mb4
DB_POOL_SIZE=5
DB_TIMEOUT=30
DB_RETRY_MAX=3
DB_RETRY_DELAY=0.1
DB_RETRY_MAX_DELAY=2.0
```

### 2. 데이터베이스 연결 테스트

```bash
python -c "from src.database.connection import get_connection; conn = get_connection(); print('Connection successful' if conn else 'Connection failed'); conn.close() if conn else None"
```

정상적으로 연결되면 "Connection successful" 메시지가 출력됩니다.

## Firebase 설정

### 1. Firebase CLI 설치

```bash
npm install -g firebase-tools
```

### 2. Firebase 로그인

```bash
firebase login
```

### 3. Firebase 프로젝트 초기화

이미 `.firebaserc` 파일이 있으므로 별도의 초기화는 필요하지 않습니다. 기존 설정을 확인하려면:

```bash
cat .firebaserc
```

### 4. Firebase Functions 패키지 설치

```bash
cd functions
npm install
cd ..
```

## 개발 환경 설정

### 1. 로컬에서 Flask 애플리케이션 실행

```bash
python src/app.py
```

이제 `http://localhost:5000`에서 API를 사용할 수 있습니다.

### 2. Dash 대시보드 실행

```bash
python scripts/run_dashboard.py
```

이제 `http://localhost:8050`에서 대시보드를 확인할 수 있습니다.

### 3. Firebase Functions 로컬 에뮬레이터 실행

```bash
cd functions
npm run serve
cd ..
```

## 배포 설정

### 1. Firebase Functions 배포

```bash
firebase deploy --only functions
```

### 2. 대시보드 서버 설정 (프로덕션 환경)

프로덕션 환경에서는 Gunicorn을 사용하여 Dash 애플리케이션을 실행하는 것이 좋습니다:

```bash
pip install gunicorn
gunicorn -b 0.0.0.0:8050 -w 4 "src.visualization.inactive_event_dashboard:server"
```

## 문제 해결

### 데이터베이스 연결 오류

#### 1. 네트워크 연결 확인

```bash
ping 211.248.190.46
```

#### 2. 데이터베이스 사용자 권한 확인

MariaDB 클라이언트를 사용하여 직접 연결을 시도합니다:

```bash
mysql -h 211.248.190.46 -u hermes -p hermes
```

### Firebase 오류

#### 1. 권한 문제

Firebase 계정에 적절한 권한이 있는지 확인합니다:

```bash
firebase projects:list
```

#### 2. 배포 오류

배포 실패 시 자세한 로그를 확인합니다:

```bash
firebase deploy --only functions --debug
```

### Python 패키지 오류

특정 패키지 설치 문제가 있다면 개별적으로 설치를 시도합니다:

```bash
pip install --upgrade <package_name>
```

설치 문제가 지속되면 `requirements.txt`에서 버전 제약을 확인하고 필요한 경우 조정합니다.

## 추가 도움말

더 자세한 정보나 도움이 필요한 경우 다음 방법을 사용할 수 있습니다:

1. 프로젝트 이슈 트래커에 질문 등록
2. 팀 Slack 채널(#db2-project)에 질문
3. 프로젝트 문서 확인: `docs/` 디렉토리
