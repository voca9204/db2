# 데이터베이스 연결 모듈

이 디렉토리는 Hermes 데이터베이스 연결 및 관리 관련 코드를 포함합니다.

## 파일 구조

- `connection.py`: 데이터베이스 연결 관리 클래스 및 함수
- `schema_analyzer.py`: 데이터베이스 스키마 분석 도구

## 주요 기능

### DatabaseConnection 클래스

`connection.py`에 구현된 `DatabaseConnection` 클래스는 다음 기능을 제공합니다:

- 데이터베이스 연결 관리
- 쿼리 실행 및 결과 반환
- 오류 처리 및 재시도 메커니즘
- 컨텍스트 매니저 지원 (with 구문 사용 가능)

### 사용 예시

```python
from src.database.connection import DatabaseConnection

# 기본 설정으로 연결
db = DatabaseConnection()

# SELECT 쿼리 실행 및 결과 가져오기
results = db.query("SELECT * FROM players LIMIT 10")
for row in results:
    print(row['id'], row['name'])

# 단일 결과 가져오기
player = db.query_one("SELECT * FROM players WHERE id = %s", (123,))
if player:
    print(f"Found player: {player['name']}")

# 컨텍스트 매니저 사용
with DatabaseConnection() as db:
    affected_rows = db.execute("UPDATE players SET status = %s WHERE id = %s", (1, 123))
    print(f"Updated {affected_rows} rows")
```

## 설정

데이터베이스 연결 설정은 `.env` 파일 또는 환경 변수에서 로드됩니다. 필요한 설정:

- `DB_HOST`: 데이터베이스 호스트 (기본값: localhost)
- `DB_PORT`: 데이터베이스 포트 (기본값: 3306)
- `DB_NAME`: 데이터베이스 이름
- `DB_USER`: 데이터베이스 사용자 이름
- `DB_PASSWORD`: 데이터베이스 비밀번호
- `DB_CHARSET`: 문자셋 (기본값: utf8mb4)
- `DB_POOL_SIZE`: 연결 풀 크기 (기본값: 5)
- `DB_TIMEOUT`: 연결 타임아웃 (초, 기본값: 30)
- `DB_RETRY_MAX`: 최대 재시도 횟수 (기본값: 3)
- `DB_RETRY_DELAY`: 기본 재시도 지연 시간 (초, 기본값: 0.1)
- `DB_RETRY_MAX_DELAY`: 최대 재시도 지연 시간 (초, 기본값: 2.0)
