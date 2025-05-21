# Firebase 변경 검증 프레임워크

Firebase 변경 검증 프레임워크는 Firebase 애플리케이션의 변경사항을 체계적으로 검증하여 안정적인 배포를 지원하는 도구입니다. 이 프레임워크는 Firestore 스키마, Security Rules, Firebase Functions, 환경 구성 등 Firebase 애플리케이션의 주요 구성 요소를 검증하고 권장사항을 제공합니다.

## 기능

### 1. 통합 검증 시스템
- 모든 검증 모듈을 단일 명령으로 실행
- 검증 결과 집계 및 종합 보고서 생성
- CLI 인터페이스를 통한 사용자 친화적 실행 환경

### 2. Firestore 스키마 검증
- JSON Schema를 사용한 Firestore 데이터 구조 검증
- 스키마 자동 탐지 및 템플릿 생성
- 유효성 검사 결과 보고

### 3. Security Rules 검증
- Firebase Security Rules 정적 분석
- 보안 취약점 및 모범 사례 위반 탐지
- 배포 전 구문 유효성 검사

### 4. Firebase Functions 검증
- 코드 품질 검사 (ESLint)
- 종속성 및 취약점 검사
- 메모리 사용량 및 타임아웃 설정 분석

### 5. Firestore 인덱스 검증
- 인덱스 정의 파일 검증
- 실제 인덱스와 정의 파일 비교
- 쿼리와 인덱스 연결 분석
- 성능 영향 분석 및 권장사항 제공

### 6. 환경 구성 검증
- 다중 환경 설정 검증 (개발, 스테이징, 프로덕션)
- 환경 간 구성 일관성 검사
- 보안 관련 이슈 탐지 및 권장사항 제공

### 7. CI/CD 통합
- GitHub Actions 워크플로우를 통한 자동 검증
- PR에 검증 결과 자동 댓글 게시
- 로컬 Git 훅을 통한 변경사항 사전 검증
## 설치 및 사용 방법

### 로컬 설치

1. 의존성 설치:
   ```bash
   cd scripts/validation
   npm install
   ```

2. Git 훅 설치 (선택사항):
   ```bash
   chmod +x scripts/hooks/install-hooks.sh
   ./scripts/hooks/install-hooks.sh
   ```

### 명령행 사용법

기본 사용법:
```bash
cd scripts/validation
node validate.js [options]
```

옵션:
- `--all`: 모든 검증 수행
- `--schema`: Firestore 스키마 검증만 수행
- `--rules`: Security Rules 검증만 수행
- `--functions`: Firebase Functions 검증만 수행
- `--indexes`: Firestore 인덱스 검증만 수행
- `--environments`: 환경 구성 검증만 수행
- `--generate-templates`: 누락된 스키마 템플릿 자동 생성
- `--report`: 검증 보고서 생성
- `--report-format <format>`: 보고서 형식 지정 (json 또는 html)
- `--verbose`: 상세 로그 출력
- `--silent`: 최소 로그만 출력

예시:
```bash
# 모든 검증 실행 및 보고서 생성
node validate.js --all --report

# Firestore 스키마와 인덱스만 검증
node validate.js --schema --indexes

# Firebase Functions 검증 및 상세 로그 출력
node validate.js --functions --verbose
```