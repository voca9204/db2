# Task Master와 분리된 파일 구조 통합하기

이 문서는 Task Master 도구와 분리된 파일 구조의 통합에 대해 설명합니다.

## 배경

`tasks.json` 파일이 너무 커서 관리하기 어려워지면서, 우리는 다음과 같이 분리된 파일 구조로 전환했습니다:

1. `tasks_index.json` - 모든 태스크의 인덱스
2. `task_[id].json` - 각 태스크의 개별 파일
3. `group_[category].json` - 관련 태스크 그룹
4. `taskmaster/` - Task Master 호환성 계층

그러나 Task Master 도구는 기본적으로 단일 `tasks.json` 파일만 지원합니다. 이 문제를 해결하기 위해 호환성 계층을 개발했습니다.

## 호환성 계층 구조

호환성 계층은 다음과 같은 파일로 구성됩니다:

- `taskmaster/index.js` - 태스크 로딩 및 관리 코어 기능
- `taskmaster/get_tasks.js` - `get_tasks` 명령 구현
- `taskmaster/get_task.js` - `get_task` 명령 구현
- `taskmaster/next_task.js` - `next_task` 명령 구현
- `tasks/get_tasks.js` - Task Master가 찾는 원래 경로에서 호환성 계층으로 위임
- `tasks/get_task.js` - Task Master가 찾는 원래 경로에서 호환성 계층으로 위임
- `tasks/next_task.js` - Task Master가 찾는 원래 경로에서 호환성 계층으로 위임

## 작업 흐름

1. Task Master 명령 실행 (`npx taskmaster get_tasks`)
2. Task Master가 `tasks/get_tasks.js` 모듈을 로드
3. 이 모듈이 `tasks/taskmaster/get_tasks.js` 호환성 모듈로 위임
4. 호환성 모듈이 `tasks_index.json`에서 태스크 목록을 로드
5. 필요한 태스크 파일을 개별적으로 로드하여 결과 반환

## 사용 가능한 도구

분리된 파일 구조를 관리하기 위해 다음 스크립트를 사용할 수 있습니다:

- `scripts/split_tasks.py` - 단일 tasks.json을 분리된 파일로 변환
- `scripts/rebuild_tasks.py` - 분리된 파일에서 tasks.json 재구성
- `scripts/validate_tasks.py` - 파일 구조 유효성 검사 및 문제 해결

예시:

```bash
# 분리된 파일 구조로 변환
python scripts/split_tasks.py --backup --taskmaster-compat

# 유효성 검사 및 문제 해결
python scripts/validate_tasks.py --fix

# 필요 시 원래 형식으로 재구성
python scripts/rebuild_tasks.py
```

## 새로운 태스크 생성

새 태스크를 생성할 때는 다음 두 가지 방법을 사용할 수 있습니다:

1. Task Master 도구를 사용하여 생성 (자동으로 호환성 계층을 통해 처리됨)
2. 직접 개별 태스크 파일을 생성하고 `tasks_index.json`에 항목 추가

## 제한 사항

- 일부 복잡한 Task Master 명령은 아직 호환성 계층에서 완전히 지원되지 않을 수 있습니다.
- 태스크 파일에 대한 동시 편집은 충돌을 일으킬 수 있으므로 주의해야 합니다.
