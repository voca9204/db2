#!/usr/bin/env python3
"""
API 서버 실행 스크립트

이 스크립트는 고가치 사용자 데이터 API 서버를 실행합니다.
"""

import sys
import os
from pathlib import Path

# 프로젝트 루트 디렉토리 추가
project_root = Path(__file__).parent.parent
sys.path.insert(0, str(project_root))

# API 모듈 임포트
from src.api.high_value_users_api import app

if __name__ == "__main__":
    print("=" * 80)
    print("고가치 사용자 데이터 API 서버 시작")
    print("=" * 80)
    
    port = int(os.environ.get('PORT', 5051))  # 포트 5051으로 변경
    print(f"API 서버가 http://localhost:{port} 에서 실행됩니다...")
    print(f"고가치 사용자 목록 API: http://localhost:{port}/api/high-value-users")
    
    app.run(host='0.0.0.0', port=port, debug=True)
