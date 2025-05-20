# DB2 - 비활성 사용자 이벤트 효과 분석 프로젝트

이 프로젝트는 오랫동안 게임을 하지 않은 사용자가 이벤트를 통해 게임에 참여하고, 결국 입금까지 이어지는 패턴을 분석하고 시각화하는 도구를 제공합니다.

## 주요 문서

- [사용 방법 및 기능 설명](./USAGE.md)
- [프로젝트 구조](./docs/project_structure.md)
- [API 아키텍처](./docs/api-architecture.md)
- [개발 가이드](./docs/guides/)
- [분석 문서](./docs/analysis/)

## 목표

- 비활성 사용자 식별 및 세그먼트화
- 이벤트 참여 패턴 분석
- 이벤트 이후 입금 행동 분석
- 다양한 조건(비활성 기간, 이벤트 금액 등)에 따른 전환율 분석
- 분석 결과의 인터랙티브 시각화 제공

## 빠른 시작

1. 프로젝트 클론
```bash
git clone https://github.com/voca9204@gmail.com/db2.git
cd db2
```

2. 가상 환경 설정
```bash
python -m venv venv
source venv/bin/activate  # Windows: venv\Scripts\activate
```

3. 패키지 설치
```bash
pip install -r requirements.txt
```

4. 데이터베이스 연결 설정
`.env.example` 파일을 `.env`로 복사하고 데이터베이스 접속 정보를 설정합니다.

5. 대시보드 실행
```bash
python scripts/run_dashboard.py
```

브라우저에서 `http://localhost:8050`에 접속하여 대시보드를 확인할 수 있습니다.

## 최근 개발 현황

- Firebase Functions 마이그레이션 준비 완료
- 활성/휴면 고가치 사용자 조회 API 마이그레이션 진행 중 (5월 20일부터 10% 트래픽 전환 시작)
- 이벤트 효과 분석 모듈 및 시각화 개선
- 활동 로깅 시스템 구현

더 자세한 내용은 [USAGE.md](./USAGE.md) 파일과 `docs/` 디렉토리의 문서를 참조하세요.

## 라이선스

이 프로젝트는 내부 사용 전용이며 모든 권리는 회사에 귀속됩니다.
