# 태스크 목록 분리 방안

현재 `/users/sinclair/projects/db2/tasks/tasks.json` 파일이 100KB를 초과하여 한 번에 읽기 어려운 상황입니다. 이 문제를 해결하기 위해 다음과 같이 태스크 목록을 여러 파일로 분리하는 방안을 제안합니다.

## 분리 방안

1. **메인 태스크 목록**
   - 파일명: `tasks/tasks_index.json`
   - 내용: 상위 레벨 태스크 목록 및 메타데이터
   - 각 태스크의 상세 정보와 서브태스크는 별도 파일로 링크

2. **개별 태스크 파일**
   - 파일명 패턴: `tasks/task_{id}.json`
   - 내용: 특정 태스크의 상세 정보 및 서브태스크
   - 분리된 파일을 통해 개별 태스크를 더 효율적으로 관리

3. **관련 태스크 그룹**
   - 파일명 패턴: `tasks/group_{category}.json`
   - 내용: 관련된 태스크 그룹(예: Firebase 마이그레이션 관련 태스크)
   - 프로젝트 영역별로 태스크를 구성하여 관리 용이성 향상

## 구현 방법

다음은 이 분리 작업을 구현하기 위한 단계입니다:

1. **분석 단계**
   - 현재 tasks.json 파일 분석
   - 태스크 간 의존성 맵 생성
   - 분리 기준 정의 (태스크 ID, 카테고리 등)

2. **파일 분리 스크립트 작성**
   - Python 스크립트를 작성하여 자동화
   - 입력: 현재 tasks.json 파일
   - 출력: 분리된 여러 JSON 파일

3. **참조 구조 설계**
   - 파일 간 참조 메커니즘 정의
   - 의존성 보존 방법 결정
   - 업데이트 시 일관성 유지 방안

4. **도구 수정**
   - Task Master 도구가 분리된 파일 구조를 지원하도록 수정
   - 명령줄 작업 시 여러 파일을 자동으로 처리하는 래퍼 개발

## 파일 구조 예시

```
tasks/
├── tasks_index.json           # 메인 인덱스 파일
├── task_1.json                # 태스크 1(Project Structure Setup)
├── task_2.json                # 태스크 2(Database Connection Module)
├── task_3.json                # 태스크 3(Database Schema Analysis Module)
├── ...
├── group_firebase.json        # Firebase 관련 태스크 그룹
├── group_analysis.json        # 분석 관련 태스크 그룹
└── group_dashboard.json       # 대시보드 관련 태스크 그룹
```

## 확장 JSON 스키마

각 파일이 어떻게 서로 참조하는지 보여주는 JSON 스키마 예시:

```json
// tasks_index.json
{
  "metadata": {
    "lastUpdated": "2025-05-19T12:00:00Z",
    "totalTasks": 18,
    "completedTasks": 15
  },
  "tasks": [
    {
      "id": 1,
      "title": "Project Structure Setup",
      "status": "done",
      "file": "task_1.json"
    },
    {
      "id": 2,
      "title": "Database Connection Module",
      "status": "done",
      "file": "task_2.json"
    },
    // ... 기타 태스크
  ],
  "groups": [
    {
      "name": "firebase",
      "title": "Firebase Migration Tasks",
      "file": "group_firebase.json"
    },
    // ... 기타 그룹
  ]
}
```

```json
// task_1.json
{
  "id": 1,
  "title": "Project Structure Setup",
  "description": "Set up the initial project structure according to the specified directory layout in the PRD.",
  "details": "...",
  "testStrategy": "...",
  "priority": "high",
  "dependencies": [],
  "status": "done",
  "subtasks": [
    // ... 서브태스크
  ]
}
```

## 구현 일정

1. **계획 수립 및 승인**: 1일
2. **스크립트 개발 및 테스트**: 2일
3. **파일 분리 실행 및 검증**: 1일
4. **도구 수정 및 테스트**: 2일
5. **문서화 및 팀 교육**: 1일

총 소요 기간: 약 1주일

## 이점

- **성능 향상**: 파일 크기 감소로 인한 로딩/처리 속도 개선
- **협업 개선**: 여러 개발자가 다른 태스크 영역을 동시에 수정 가능
- **관리 용이성**: 관련 태스크를 그룹화하여 관리 효율성 향상
- **확장성**: 태스크 수가 증가해도 성능 저하 없이 확장 가능

## 리스크 및 대응 방안

- **일관성 문제**: 여러 파일 간 일관성을 유지하기 위한 검증 스크립트 개발
- **도구 호환성**: 기존 도구와의 호환성을 보장하기 위한 래퍼 또는 어댑터 개발
- **마이그레이션 실패**: 기존 파일 백업 및 단계적 마이그레이션 전략 수립
