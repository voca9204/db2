# Task Master 사용 가이드

Task Master는 프로젝트의 태스크 관리를 위한 도구로, 주로 npm/npx를 통해 실행됩니다.

## 기본 구조
- 프로젝트는 원래 tasks.json 파일을 통해 태스크를 관리했으나, 파일이 커지면서 분리된 구조로 전환했습니다.
- 현재는 개별 task_{id}.json 파일에 태스크를 저장하고, tasks_index.json로 인덱싱합니다.
- tasks/taskmaster/ 디렉토리에 호환성 레이어가 구현되어 있습니다.

## 주요 명령어
- `npx taskmaster get_tasks --projectRoot=/users/sinclair/projects/db2`: 모든 태스크 조회
- `npx taskmaster get_task --id={task_id} --projectRoot=/users/sinclair/projects/db2`: 특정 태스크 조회
- `npx taskmaster next_task --projectRoot=/users/sinclair/projects/db2`: 다음 작업할 태스크 추천
- 태스크 상태 필터링: `--status=pending|in-progress|done` 
- 서브태스크 포함 옵션: `--withSubtasks`

## 태스크 관리 스크립트
- `python scripts/split_tasks.py --backup --taskmaster-compat`: 태스크 파일 분리
- `python scripts/rebuild_tasks.py`: 분리된 파일에서 단일 tasks.json 재구성
- `python scripts/validate_tasks.py --fix`: 태스크 파일 구조 검증 및 문제 해결

## 파일 경로
- 프로젝트 루트: /users/sinclair/projects/db2
- 태스크 디렉토리: /users/sinclair/projects/db2/tasks
- 스크립트 디렉토리: /users/sinclair/projects/db2/scripts

## 태스크 구조
태스크는 다음과 같은 구조를 가집니다:
```json
{
  "id": 16,
  "title": "Database Optimization and Analytics Enhancement",
  "description": "데이터베이스 최적화 및 분석 개선을 위한 작업",
  "details": "구체적인 작업 내용...",
  "testStrategy": "테스트 전략...",
  "priority": "medium",
  "dependencies": [5, 11],
  "status": "pending",
  "subtasks": [
    {
      "id": 1,
      "title": "서브태스크 제목",
      "description": "서브태스크 설명",
      "dependencies": [],
      "status": "pending"
    }
  ]
}
```

## 호환성 계층
- `tasks/get_tasks.js`, `tasks/get_task.js`, `tasks/next_task.js`: 메인 진입점
- `tasks/taskmaster/index.js`: 태스크 로딩 및 관리 코어 기능
- `tasks/taskmaster/get_tasks.js`, `tasks/taskmaster/get_task.js`, `tasks/taskmaster/next_task.js`: 각 명령어 구현

## 작업 흐름
1. Task Master 명령 실행 (`npx taskmaster get_tasks`)
2. Task Master가 `tasks/get_tasks.js` 모듈을 로드
3. 이 모듈이 `tasks/taskmaster/get_tasks.js` 호환성 모듈로 위임
4. 호환성 모듈이 `tasks_index.json`에서 태스크 목록을 로드
5. 필요한 태스크 파일을 개별적으로 로드하여 결과 반환

## 주의사항
- `.taskmasterconfig` 파일에는 Task Master의 설정 정보가 저장되어 있습니다.
- 태스크를 수정할 때는 개별 파일(task_{id}.json)을 직접 편집하거나 Task Master 명령어를 사용하세요.
- 대규모 변경이 필요할 경우 `rebuild_tasks.py`로 통합 파일을 만들고, 편집 후 다시 `split_tasks.py`를 실행하는 것이 효율적일 수 있습니다.
