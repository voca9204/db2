# DB2 - 사용 방법 및 기능 설명

이 문서는 DB2 프로젝트의 사용 방법과 핵심 기능에 대한 상세 설명을 제공합니다.

## 프로젝트 구조

```
db2/
├── docs/                   # 문서 및 가이드
├── src/                    # 소스 코드
│   ├── analysis/           # 분석 모듈
│   │   └── user/           # 사용자 분석 관련 코드
│   │       └── inactive_event_analyzer.py
│   ├── api/                # API 관련 코드
│   ├── config/             # 설정 관련 코드
│   │   └── database.py     # 데이터베이스 설정
│   ├── database/           # 데이터베이스 관련 코드
│   │   ├── connection.py   # 기본 연결 모듈
│   │   └── mariadb_connection.py # MariaDB 전용 연결 모듈
│   ├── reports/            # 보고서 생성 관련 코드
│   ├── utils/              # 유틸리티 함수
│   └── visualization/      # 시각화 관련 코드
│       ├── assets/         # 시각화 자산(CSS, 이미지 등)
│       │   └── dashboard.css
│       └── inactive_event_dashboard.py
├── scripts/                # 실행 스크립트
│   ├── analyze_inactive_events.py
│   └── run_dashboard.py
├── data/                   # 데이터 파일
├── queries/                # SQL 쿼리 파일
│   ├── event/              # 이벤트 관련 쿼리
│   ├── schema/             # 스키마 관련 쿼리
│   └── user/               # 사용자 관련 쿼리
├── reports/                # 생성된 보고서
├── tests/                  # 테스트 코드
├── .env                    # 환경 변수 설정
├── .gitignore              # Git 제외 파일 목록
└── README.md               # 프로젝트 설명
```

## 설치 방법

### 환경 설정

1. 가상 환경 설정
```bash
python -m venv venv
source venv/bin/activate  # Windows: venv\Scripts\activate
```

2. 패키지 설치
```bash
pip install -r requirements.txt
```

3. 데이터베이스 연결 설정
`.env` 파일을 프로젝트 루트 디렉토리에 생성하고 다음 내용을 추가합니다:
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

## 사용 방법

### 비활성 사용자 이벤트 효과 분석

비활성 사용자의 이벤트 효과를 분석하려면 다음 명령어를 실행합니다:

```bash
python scripts/analyze_inactive_events.py --days 10 --output ./reports/user
```

옵션:
- `--days`: 비활성으로 간주할 최소 일수 (기본값: 10)
- `--output`: 결과 저장 디렉토리 (기본값: ./reports/user)
- `--json`: 결과를 JSON 형식으로도 출력

### 고가치 사용자 분석

고가치 사용자를 분석하려면 다음 명령어를 실행합니다:

```bash
python scripts/analyze_high_value_users.py --min-bet 50000 --output ./reports/high_value
```

옵션:
- `--min-bet`: 고가치 사용자로 간주할 최소 유효배팅 금액 (기본값: 50000)
- `--min-days`: 최소 활동 일수 (기본값: 7)
- `--output`: 결과 저장 디렉토리 (기본값: ./reports/high_value)

### 대시보드 실행

분석 결과를 대화형 대시보드로 시각화하려면 다음 명령어를 실행합니다:

```bash
python scripts/run_dashboard.py --port 8050 --debug
```

옵션:
- `--port`: 서버 포트 (기본값: 8050)
- `--debug`: 디버그 모드 활성화

브라우저에서 `http://localhost:8050`에 접속하여 대시보드를 확인할 수 있습니다.

### Firebase Functions API 실행

Firebase Functions API를 로컬에서 실행하려면 다음 명령어를 실행합니다:

```bash
cd functions
npm install
npm run serve
```

## 핵심 기능

### 1. 비활성 사용자 분석

- 특정 기간(예: 10일) 이상 게임을 하지 않은 사용자 식별
- 비활성 기간별 사용자 분포 분석
- 비활성 사용자의 이전 활동 패턴 분석

### 2. 이벤트 효과 분석

- 이벤트 참여율 및 이벤트 유형별 참여도 분석
- 이벤트 이후 사용자 행동 변화 측정
- 비활성 기간별 이벤트 참여율 분석

### 3. 전환율 및 ROI 분석

- 이벤트 이후 입금 전환율 계산
- 비활성 기간별 전환율 비교
- 이벤트 금액별 ROI 분석
- 전환 사용자의 특성 분석

### 4. 데이터 시각화 및 대시보드

- 인터랙티브 대시보드로 결과 시각화
- 필터링 및 세그먼트별 데이터 탐색
- 주요 지표의 시각적 표현 (차트, 그래프)
- 데이터 테이블 (검색, 정렬, 필터링 기능)

### 5. API 엔드포인트

#### 고가치 사용자 API

- `/api/v1/users/high-value`: 고가치 사용자 목록 조회
- `/api/v1/users/high-value/dormant`: 휴면 상태의 고가치 사용자 조회
- `/api/v1/users/high-value/active`: 활성 상태의 고가치 사용자 조회

#### 이벤트 분석 API

- `/api/v1/events/analysis`: 이벤트 효과 분석 결과 조회
- `/api/v1/events/conversion`: 이벤트별 전환율 조회
- `/api/v1/events/roi`: 이벤트별 ROI 분석 결과 조회

## 데이터 분석 쿼리 예시

### 이벤트 지급 후 입금 확인 쿼리

```sql
SELECT
    pl.userId,
    pl.id,
    (SELECT COUNT(*) FROM promotion_players pp WHERE pp.player = pl.id AND pp.appliedAt IS NOT NULL) AS promotion_count,
    (SELECT MIN(pp2.appliedAt) FROM promotion_players pp2 WHERE pp2.player = pl.id AND pp2.appliedAt IS NOT NULL) AS first_promotion_date,
    SUM(CASE WHEN mf.createdAt > (SELECT MIN(pp3.appliedAt) FROM promotion_players pp3 WHERE pp3.player = pl.id AND pp3.appliedAt IS NOT NULL) THEN mf.amount ELSE 0 END) AS deposit_after_promotion
FROM players pl
JOIN money_flows mf ON pl.id = mf.player
WHERE pl.id IN (SELECT player FROM promotion_players WHERE appliedAt IS NOT NULL)
AND mf.type = 0 -- 입금
GROUP BY pl.userId, pl.id
HAVING deposit_after_promotion > 0;
```

### 휴면 고가치 사용자 쿼리

```sql
SELECT 
    p.id, 
    p.userId, 
    COUNT(DISTINCT DATE(g.createdAt)) AS play_days,
    SUM(g.netBet) AS total_net_bet,
    MAX(g.createdAt) AS last_play_date,
    DATEDIFF(NOW(), MAX(g.createdAt)) AS dormant_days
FROM 
    players p
JOIN 
    games g ON p.id = g.player
GROUP BY 
    p.id, p.userId
HAVING 
    play_days >= 7
    AND total_net_bet >= 50000
    AND dormant_days >= 30
ORDER BY 
    total_net_bet DESC;
```

## 기여 방법

1. 이 저장소를 포크합니다.
2. 새로운 브랜치를 생성합니다: `git checkout -b feature/amazing-feature`
3. 변경 사항을 커밋합니다: `git commit -m 'Add amazing feature'`
4. 브랜치를 푸시합니다: `git push origin feature/amazing-feature`
5. Pull Request를 제출합니다.

## 문제 해결

### 데이터베이스 연결 오류

- `.env` 파일에 정확한 데이터베이스 연결 정보가 설정되어 있는지 확인합니다.
- 네트워크 연결 및 방화벽 설정을 확인합니다.
- 오류 메시지를 확인하여 구체적인 문제를 파악합니다.

### 대시보드 실행 오류

- 필요한 모든 패키지가 설치되어 있는지 확인합니다.
- 가상 환경이 활성화되어 있는지 확인합니다.
- 포트가 이미 사용 중인 경우 다른 포트를 지정합니다.

## 자세한 문서

추가적인 개발 문서는 `docs/` 디렉토리에서 확인할 수 있습니다:

- [API 아키텍처](./docs/api-architecture.md)
- [데이터베이스 스키마](./docs/database/schema.md)
- [Firebase Functions 마이그레이션 계획](./docs/plans/firebase_migration.md)
