"""
로깅 설정 모듈

이 모듈은 애플리케이션 전체에서 사용할 로깅 설정을 제공합니다.
"""

import logging
import sys
from pathlib import Path

def setup_logging(
    log_level: str = "INFO",
    log_file: str = None,
    log_format: str = "%(asctime)s - %(name)s - %(levelname)s - %(message)s"
) -> None:
    """
    애플리케이션 로깅 설정
    
    Args:
        log_level (str): 로그 레벨 ("DEBUG", "INFO", "WARNING", "ERROR", "CRITICAL")
        log_file (str, optional): 로그 파일 경로. 기본값은 None (콘솔만 사용).
        log_format (str): 로그 포맷 문자열
    """
    # 문자열을 로그 레벨로 변환
    level = getattr(logging, log_level.upper(), logging.INFO)
    
    # 로그 핸들러 설정
    handlers = [logging.StreamHandler(sys.stdout)]
    
    # 로그 파일이 지정된 경우 파일 핸들러 추가
    if log_file:
        log_path = Path(log_file)
        log_path.parent.mkdir(parents=True, exist_ok=True)
        handlers.append(logging.FileHandler(log_file))
    
    # 기본 로깅 설정
    logging.basicConfig(
        level=level,
        format=log_format,
        handlers=handlers
    )
    
    # 라이브러리 로그 레벨 조정
    logging.getLogger("pymysql").setLevel(logging.WARNING)
