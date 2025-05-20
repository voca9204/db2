#!/usr/bin/env python
"""
비활성 사용자 이벤트 효과 대시보드 실행 스크립트

이 스크립트는 오랫동안 게임을 하지 않은 사용자가 이벤트를 통해
게임에 참여하고 입금까지 이어지는 패턴을 시각화하는 대시보드를 실행합니다.
"""

import os
import sys
import argparse
from pathlib import Path

# 프로젝트 루트 디렉토리를 sys.path에 추가
project_root = Path(__file__).resolve().parent.parent
sys.path.append(str(project_root))

from src.visualization.inactive_event_dashboard import InactiveUserEventDashboard

def parse_args():
    """명령행 인수 파싱"""
    parser = argparse.ArgumentParser(description='비활성 사용자 이벤트 효과 대시보드')
    parser.add_argument(
        '--port', 
        type=int, 
        default=8050, 
        help='서버 포트 (기본값: 8050)'
    )
    parser.add_argument(
        '--debug', 
        action='store_true', 
        help='디버그 모드 활성화'
    )
    
    return parser.parse_args()

def main():
    """메인 함수"""
    # 명령행 인수 파싱
    args = parse_args()
    
    # 대시보드 초기화 및 실행
    dashboard = InactiveUserEventDashboard()
    dashboard.run_server(debug=args.debug, port=args.port)

if __name__ == "__main__":
    main()
