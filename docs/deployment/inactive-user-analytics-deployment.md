# 비활성 사용자 이벤트 분석 시스템 배포 가이드

이 문서는 비활성 사용자 이벤트 분석 시스템의 배포 및 실행 프로세스를 설명합니다. 이 시스템은 오랫동안 게임을 하지 않은 사용자가 이벤트를 통해 게임에 참여하고, 결국 입금까지 이어지게 하는 것을 목표로 합니다.

## 개요

비활성 사용자 이벤트 분석 시스템은 다음과 같은 컴포넌트로 구성됩니다:

1. **데이터베이스 연결 모듈** - 헤르메스 데이터베이스 접속 및 쿼리 실행
2. **사용자 행동 분석 모듈** - 비활성 사용자 식별 및 이벤트 참여 패턴 분석
3. **이벤트 효과 분석 모듈** - 이벤트 참여 후 사용자 행동 변화 분석 
4. **데이터 시각화 컴포넌트** - 분석 결과를 시각적으로 표현
5. **인터랙티브 대시보드** - 분석 결과 탐색을 위한 사용자 인터페이스
6. **Firebase Functions API** - 서버리스 환경에서 분석 API 제공

## 사전 요구사항

배포 전 다음 사항을 확인하세요:

1. Python 3.9 이상이 설치되어 있어야 합니다.
2. 필요한 Python 패키지가 설치되어 있어야 합니다:
   ```bash
   pip install -r requirements.txt
   ```
3. Firebase CLI가 설치되어 있어야 합니다 (API 배포용):
   ```bash
   npm install -g firebase-tools
   ```
4. 데이터베이스 접속 정보가 올바르게 설정되어 있어야 합니다:
   - Host: 211.248.190.46
   - User: hermes
   - Password: mcygicng!022
   - Database: hermes

## 로컬 배포 및 실행

### 1. 분석 스크립트 실행

비활성 사용자 분석을 실행하려면 다음 명령어를 사용합니다:

```bash
# 기본 분석 실행
python scripts/analyze_inactive_users.py

# 특정 기간 지정 분석
python scripts/analyze_inactive_users.py --inactive-days 30 --lookback-days 90

# 특정 이벤트 분석
python scripts/analyze_inactive_users.py --event-id EVENT123
```

### 2. 대시보드 실행

인터랙티브 대시보드를 실행하려면 다음 명령어를 사용합니다:

```bash
python scripts/run_dashboard.py
```

기본적으로 대시보드는 http://localhost:8050 에서 접근할 수 있습니다.

## Firebase Functions 배포

API를 Firebase Functions로 배포하려면 다음 절차를 따르세요:

### 1. Firebase 프로젝트 선택

```bash
# 개발 환경
firebase use db2-dev

# 스테이징 환경
firebase use db2-staging

# 프로덕션 환경
firebase use db2-prod
```

### 2. 환경 변수 설정

각 환경에 맞는 데이터베이스 연결 정보를 설정합니다:

```bash
# 개발 환경
firebase functions:config:set database.host="211.248.190.46" database.user="hermes" database.password="mcygicng!022" database.name="hermes"

# 프로덕션 환경도 동일하게 설정
```

### 3. API 함수 배포

```bash
# 모든 함수 배포
firebase deploy --only functions

# 특정 함수만 배포
firebase deploy --only functions:getInactiveUsers,functions:getEventParticipants
```

## 성능 최적화 구성

### 데이터베이스 쿼리 최적화

비활성 사용자 및 이벤트 분석을 위한 데이터베이스 쿼리는 대량의 데이터를 처리해야 할 수 있습니다. 다음과 같은 최적화 방법을 사용합니다:

1. **인덱싱**: 
   - 사용자 로그인 시간 컬럼
   - 이벤트 참여 시간 컬럼
   - 사용자 ID와 이벤트 ID 조합 컬럼

2. **쿼리 최적화**:
   - 불필요한 SELECT * 지양
   - 필요한 컬럼만 선택
   - WHERE 조건 최적화
   - JOIN 전 서브쿼리로 데이터셋 축소

3. **결과 제한**:
   - LIMIT 사용하여 큰 결과셋 페이징
   - 집계 쿼리 사용하여 데이터 요약

### Firebase Functions 최적화

Firebase Functions의 성능을 최적화하기 위한 구성:

1. **메모리 할당**:
   - 분석 API 함수: 1GB 메모리 할당
   ```json
   {
     "getInactiveUsers": {
       "memory": "1GB",
       "timeoutSeconds": 60
     },
     "getEventParticipants": {
       "memory": "1GB",
       "timeoutSeconds": 60
     }
   }
   ```

2. **인스턴스 설정**:
   - 프로덕션 환경: 최소 1개 인스턴스 유지 (콜드 스타트 방지)
   ```json
   {
     "getInactiveUsers": {
       "minInstances": 1
     },
     "getEventParticipants": {
       "minInstances": 1
     }
   }
   ```

3. **타임아웃 설정**:
   - API 함수: 60초
   - 배치 분석 함수: 540초 (9분)

## 대시보드 환경 구성

인터랙티브 대시보드의 최적 사용을 위한 환경 구성:

1. **서버 설정**:
   - 기본 포트: 8050
   - 외부 접속 허용: `--host 0.0.0.0` 옵션 사용
   - 워커 수: `--workers 4` 옵션으로 멀티프로세싱 활성화

2. **캐싱 설정**:
   - 쿼리 결과 캐싱: 5분 (300초)
   - 시각화 컴포넌트 캐싱: 1분 (60초)

3. **보안 설정**:
   - 기본 인증 활성화: `--enable-auth` 옵션
   - HTTPS 활성화: SSL 인증서 구성 필요

## 모니터링 및 로깅

시스템 성능 및 동작 모니터링:

1. **로깅 구성**:
   - 로그 레벨: INFO (프로덕션), DEBUG (개발)
   - 로그 파일: `/logs/inactive_user_analysis.log`
   - 로그 로테이션: 일별, 최대 30일 보관

2. **성능 모니터링**:
   - 쿼리 실행 시간 기록
   - 메모리 사용량 모니터링
   - API 응답 시간 측정

3. **알림 설정**:
   - 분석 오류 발생 시 이메일 알림
   - API 응답 시간 기준치 초과 시 알림

## 문제 해결

일반적인 문제 및 해결 방법:

1. **데이터베이스 연결 오류**:
   - 네트워크 연결 확인
   - 데이터베이스 자격 증명 확인
   - 재시도 메커니즘 확인

2. **메모리 부족 오류**:
   - 쿼리 최적화로 결과셋 크기 감소
   - 배치 처리 사용
   - 메모리 할당 증가

3. **대시보드 로딩 속도 저하**:
   - 쿼리 최적화
   - 데이터 캐싱 활성화
   - 데이터 집계 사전 계산

4. **Firebase Functions 타임아웃**:
   - 함수 논리 최적화
   - 타임아웃 설정 증가
   - 작업 분할 및 비동기 처리

## 확장 및 유지보수

시스템 확장 및 유지보수를 위한 지침:

1. **새로운 분석 모듈 추가**:
   - `src/analysis/user/` 디렉토리에 새 모듈 추가
   - 기존 인터페이스 준수
   - 단위 테스트 작성

2. **대시보드 컴포넌트 확장**:
   - `src/visualization/` 디렉토리에 새 컴포넌트 추가
   - 기존 대시보드에 통합

3. **API 엔드포인트 추가**:
   - `functions/src/api/` 디렉토리에 새 엔드포인트 추가
   - API 문서 업데이트
   - 접근 제어 구성

4. **정기 유지보수 작업**:
   - 월간 성능 검토
   - 인덱스 최적화
   - 로그 파일 정리

## 참조

- [Firebase Functions 문서](https://firebase.google.com/docs/functions)
- [Dash 대시보드 문서](https://dash.plotly.com/)
- [PyMySQL 문서](https://pymysql.readthedocs.io/)
- [Pandas 문서](https://pandas.pydata.org/docs/)
