#!/usr/bin/env python3
"""
Memory Bank Python 래퍼 - DB2 프로젝트 상태 관리

사용법:
  python memory_bank.py update "작업 상태 내용"
  python memory_bank.py status
  python memory_bank.py task 18 "태스크 제목"
"""

import os
import sys
import json
import subprocess
from pathlib import Path
from datetime import datetime

# 프로젝트 루트 경로
SCRIPT_DIR = Path(__file__).resolve().parent
PROJECT_ROOT = os.environ.get('PROJECT_ROOT', SCRIPT_DIR.parent)
MEMORY_BANK_DIR = PROJECT_ROOT / 'memory_bank'
STATUS_FILE = MEMORY_BANK_DIR / 'project_status.md'
TASKS_FILE = MEMORY_BANK_DIR / 'active_tasks.json'

def ensure_memory_bank_exists():
    """메모리 뱅크 디렉토리와 기본 파일 확인"""
    if not MEMORY_BANK_DIR.exists():
        MEMORY_BANK_DIR.mkdir(parents=True, exist_ok=True)
        
    if not STATUS_FILE.exists():
        with open(STATUS_FILE, 'w', encoding='utf-8') as f:
            f.write(f"""# DB2 프로젝트 상태
마지막 업데이트: {datetime.now().isoformat()}

## 프로젝트 개요
- 목표: 오랫동안 게임을 하지 않은 사용자가 이벤트를 통해 게임에 참여하고, 결국 입금까지 이어지게 하는 시스템 개발
- 상태: 진행 중

## 최근 작업 내역
- 프로젝트 초기 설정 완료

## 다음 단계
- 휴면 사용자 식별 및 분석 시스템 구현
""")
    
    if not TASKS_FILE.exists():
        with open(TASKS_FILE, 'w', encoding='utf-8') as f:
            json.dump({
                "activeTasks": [
                    {
                        "id": 18,
                        "title": "Inactive User Targeting System Development",
                        "status": "pending"
                    },
                    {
                        "id": 19,
                        "title": "Implement Personalized Event Recommendation System",
                        "status": "pending"
                    }
                ],
                "lastUpdate": datetime.now().isoformat()
            }, f, indent=2)

def update_status(content):
    """프로젝트 상태 업데이트"""
    ensure_memory_bank_exists()
    
    timestamp = datetime.now().isoformat()
    with open(STATUS_FILE, 'a', encoding='utf-8') as f:
        f.write(f"\n\n## 업데이트: {timestamp}\n{content}\n")
    
    print(f"프로젝트 상태가 업데이트되었습니다.")
    return True

def get_status():
    """현재 상태 확인"""
    ensure_memory_bank_exists()
    
    try:
        with open(STATUS_FILE, 'r', encoding='utf-8') as f:
            status_text = f.read()
        
        with open(TASKS_FILE, 'r', encoding='utf-8') as f:
            tasks_data = json.load(f)
            
        print('=== DB2 프로젝트 상태 ===')
        print(f"마지막 업데이트: {tasks_data.get('lastUpdate', '알 수 없음')}")
        print('\n=== 활성 태스크 ===')
        
        for task in tasks_data.get('activeTasks', []):
            print(f"- #{task['id']} {task['title']} ({task['status']})")
            
        print('\n=== 상태 내용 ===')
        print(status_text)
        
    except Exception as e:
        print(f"오류: 상태를 읽는 중 문제가 발생했습니다: {e}")
        return False
    
    return True

def set_current_task(task_id, task_title=''):
    """현재 작업 중인 태스크 설정"""
    ensure_memory_bank_exists()
    
    try:
        task_id = int(task_id)
        
        with open(TASKS_FILE, 'r', encoding='utf-8') as f:
            tasks_data = json.load(f)
        
        tasks = tasks_data.get('activeTasks', [])
        
        # 현재 태스크 찾기 또는 새로 추가
        existing_task = None
        for task in tasks:
            if task['id'] == task_id:
                existing_task = task
                task['status'] = 'in-progress'
                if task_title:
                    task['title'] = task_title
            else:
                task['status'] = 'pending'
        
        if not existing_task:
            tasks.append({
                'id': task_id,
                'title': task_title or f'태스크 #{task_id}',
                'status': 'in-progress'
            })
        
        tasks_data['activeTasks'] = tasks
        tasks_data['lastUpdate'] = datetime.now().isoformat()
        
        with open(TASKS_FILE, 'w', encoding='utf-8') as f:
            json.dump(tasks_data, f, indent=2)
        
        # 상태 업데이트
        with open(STATUS_FILE, 'a', encoding='utf-8') as f:
            f.write(f"\n\n## 업데이트: {datetime.now().isoformat()}\n현재 작업 중인 태스크: #{task_id} {task_title}\n")
        
        print(f"현재 태스크가 #{task_id}로 설정되었습니다.")
        return True
        
    except Exception as e:
        print(f"오류: 태스크 설정 중 문제가 발생했습니다: {e}")
        return False

def main():
    """메인 함수"""
    if len(sys.argv) < 2:
        print(__doc__)
        return
    
    command = sys.argv[1]
    args = sys.argv[2:]
    
    if command == 'update':
        if not args:
            print("오류: 업데이트 내용을 입력하세요.")
            return
        update_status(args[0])
        
    elif command == 'status':
        get_status()
        
    elif command == 'task':
        if not args:
            print("오류: 태스크 ID를 입력하세요.")
            return
        task_id = args[0]
        task_title = args[1] if len(args) > 1 else ''
        set_current_task(task_id, task_title)
        
    else:
        print(__doc__)

if __name__ == "__main__":
    main()
