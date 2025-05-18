# DB2 프로젝트

Hermes 데이터베이스 시스템의 분석 및 관리를 위한 프로젝트입니다.

## 프로젝트 개요

DB2는 데이터베이스 구조를 체계적으로 분석하고, 사용자 행동 패턴과 이벤트 효과를 측정하며, 데이터베이스 운영을 최적화하기 위한 프로젝트입니다.

## 주요 목표

1. 데이터베이스 구조의 체계적인 분석 및 문서화
2. 사용자 행동 패턴 분석 및 인사이트 도출
3. 이벤트 효과 측정 및 최적화 방안 제시
4. 데이터베이스 연결 및 쿼리 실행을 위한 모듈 개발
5. 분석 결과 시각화 및 보고서 생성 시스템 구축
6. 데이터베이스 성능 모니터링 및 최적화 도구 개발

## 프로젝트 구조

```
/users/sinclair/projects/db2/
│
├── docs/                      # 문서 디렉토리
│   ├── database/              # 데이터베이스 관련 문서
│   ├── analysis/              # 분석 방법론 및 설명
│   ├── guides/                # 사용 가이드 및 매뉴얼
│   └── plans/                 # 프로젝트 계획 문서
│
├── src/                       # 소스 코드 디렉토리
│   ├── config/                # 설정 파일
│   ├── database/              # 데이터베이스 관련 코드
│   ├── analysis/              # 분석 코드
│   ├── visualization/         # 시각화 코드
│   └── utils/                 # 유틸리티 함수
│
├── scripts/                   # 실행 스크립트
│
├── data/                      # 데이터 파일
│   ├── raw/                   # 원본 데이터
│   ├── processed/             # 처리된 데이터
│   └── external/              # 외부 데이터 (필요시)
│
├── queries/                   # SQL 쿼리 파일
│   ├── event/                 # 이벤트 관련 쿼리
│   ├── user/                  # 사용자 관련 쿼리
│   └── schema/                # 스키마 관련 쿼리
│
├── reports/                   # 분석 보고서
│   ├── event_analysis/        # 이벤트 분석 보고서
│   └── user_analysis/         # 사용자 분석 보고서
│
└── tests/                     # 테스트 파일
    ├── database/              # 데이터베이스 관련 테스트
    └── analysis/              # 분석 코드 테스트
```

## 시작하기

### 필요한 패키지 설치

```bash
pip install -r requirements.txt
```

### 환경 설정

1. `.env.example` 파일을 `.env`로 복사하고 필요한 설정을 업데이트합니다.
2. 데이터베이스 연결 정보를 설정합니다.

### 기본 작업 실행

```bash
python scripts/setup.py  # 초기 설정
python scripts/analyze_events.py  # 이벤트 분석 실행
python scripts/generate_report.py  # 보고서 생성
```

## 문서

자세한 문서는 `docs/` 디렉토리에서 확인할 수 있습니다:

- [데이터베이스 스키마](docs/database/schema.md)
- [분석 방법론](docs/analysis/methodology.md)
- [사용 가이드](docs/guides/setup.md)

## 태스크 관리

이 프로젝트는 TaskMaster를 사용하여 태스크를 관리합니다. 다음 명령어로 현재 태스크 확인이 가능합니다:

```bash
tm get-tasks
```

## 데이터베이스 연결 정보

Hermes 데이터베이스 연결 정보는 다음과 같습니다:

- Host: 211.248.190.46
- Database: hermes
- User: hermes

보안을 위해 비밀번호는 `.env` 파일에 저장하고 코드에서 참조합니다.
