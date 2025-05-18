#!/usr/bin/env python
"""
DB2 웹 애플리케이션 시작 스크립트

이 스크립트는 Flask 애플리케이션을 시작합니다.
"""

import os
import sys
from pathlib import Path
import logging
import argparse

# 로깅 설정
logging.basicConfig(
    level=logging.INFO,
    format='%(asctime)s - %(name)s - %(levelname)s - %(message)s'
)
logger = logging.getLogger(__name__)

# 프로젝트 루트 디렉토리를 시스템 경로에 추가
project_root = Path(__file__).parent.parent
sys.path.append(str(project_root))

# .env 파일 로드
from dotenv import load_dotenv
load_dotenv(project_root / ".env")

def parse_args():
    """명령줄 인수 파싱"""
    parser = argparse.ArgumentParser(description='Start the DB2 web application')
    parser.add_argument('--host', default='0.0.0.0', help='Server host (default: 0.0.0.0)')
    parser.add_argument('--port', type=int, default=5000, help='Server port (default: 5000)')
    parser.add_argument('--debug', action='store_true', help='Run in debug mode')
    return parser.parse_args()

def main():
    """애플리케이션 메인 함수"""
    args = parse_args()
    
    # Flask 앱 생성
    from src.visualization import create_app
    app = create_app()
    
    # 환경 변수에서 설정 가져오기
    host = os.environ.get('FLASK_HOST', args.host)
    port = int(os.environ.get('FLASK_PORT', args.port))
    debug = os.environ.get('FLASK_DEBUG', str(args.debug)).lower() == 'true'
    
    # 개발 모드 여부 로깅
    mode = "Development" if debug else "Production"
    logger.info(f"Starting DB2 application in {mode} mode")
    logger.info(f"Server running at http://{host}:{port}")
    
    # 애플리케이션 실행
    app.run(host=host, port=port, debug=debug)

if __name__ == '__main__':
    main()
