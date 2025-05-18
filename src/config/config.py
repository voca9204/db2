"""
환경 변수 설정 모듈

이 모듈은 .env 파일 또는 시스템 환경 변수에서 설정을 로드합니다.
"""

import os
import logging
from pathlib import Path
from typing import Dict, Any, Optional
from dotenv import load_dotenv

# 로깅 설정
logger = logging.getLogger(__name__)

# 프로젝트 루트 디렉토리 설정
PROJECT_ROOT = Path(__file__).parent.parent.parent.absolute()

# .env 파일 로드
dotenv_path = os.path.join(PROJECT_ROOT, '.env')
load_dotenv(dotenv_path)

class Config:
    """설정 관리 클래스"""
    
    @staticmethod
    def get(key: str, default: Any = None) -> Any:
        """
        환경 변수 값을 가져옵니다.
        
        Args:
            key (str): 환경 변수 키
            default (Any, optional): 기본값. 기본값은 None.
            
        Returns:
            Any: 환경 변수 값 또는 기본값
        """
        return os.environ.get(key, default)
    
    @staticmethod
    def get_bool(key: str, default: bool = False) -> bool:
        """
        부울 환경 변수 값을 가져옵니다.
        
        Args:
            key (str): 환경 변수 키
            default (bool, optional): 기본값. 기본값은 False.
            
        Returns:
            bool: 부울 환경 변수 값 또는 기본값
        """
        value = os.environ.get(key, str(default).lower())
        return value.lower() in ('true', 'yes', '1', 't', 'y')
    
    @staticmethod
    def get_int(key: str, default: int = 0) -> int:
        """
        정수 환경 변수 값을 가져옵니다.
        
        Args:
            key (str): 환경 변수 키
            default (int, optional): 기본값. 기본값은 0.
            
        Returns:
            int: 정수 환경 변수 값 또는 기본값
        """
        try:
            return int(os.environ.get(key, default))
        except ValueError:
            logger.warning(f"환경 변수 {key}가 정수가 아닙니다. 기본값 {default}를 사용합니다.")
            return default
    
    @staticmethod
    def get_float(key: str, default: float = 0.0) -> float:
        """
        부동소수점 환경 변수 값을 가져옵니다.
        
        Args:
            key (str): 환경 변수 키
            default (float, optional): 기본값. 기본값은 0.0.
            
        Returns:
            float: 부동소수점 환경 변수 값 또는 기본값
        """
        try:
            return float(os.environ.get(key, default))
        except ValueError:
            logger.warning(f"환경 변수 {key}가 부동소수점이 아닙니다. 기본값 {default}를 사용합니다.")
            return default

# 데이터베이스 설정
DATABASE_CONFIG = {
    'host': Config.get('DB_HOST', '127.0.0.1'),
    'port': Config.get_int('DB_PORT', 3306),
    'database': Config.get('DB_NAME', 'hermes'),
    'user': Config.get('DB_USER', 'root'),
    'password': Config.get('DB_PASSWORD', ''),
    'charset': Config.get('DB_CHARSET', 'utf8mb4'),
    'pool_size': Config.get_int('DB_POOL_SIZE', 5),
    'timeout': Config.get_int('DB_TIMEOUT', 30),
    'retry_max': Config.get_int('DB_RETRY_MAX', 3),
    'retry_delay': Config.get_float('DB_RETRY_DELAY', 0.1),
    'retry_max_delay': Config.get_float('DB_RETRY_MAX_DELAY', 2.0),
}

# 웹 애플리케이션 설정
WEB_CONFIG = {
    'host': Config.get('FLASK_HOST', '0.0.0.0'),
    'port': Config.get_int('FLASK_PORT', 5000),
    'debug': Config.get_bool('FLASK_DEBUG', False),
    'secret_key': Config.get('SECRET_KEY', 'dev_key'),
}

# 보안 및 데이터 표시 설정
SECURITY_CONFIG = {
    'hide_player_names': Config.get_bool('DISPLAY_HIDE_PLAYER_NAMES', True),
    'hide_player_numbers': Config.get_bool('DISPLAY_HIDE_PLAYER_NUMBERS', True),
    'id_masking_char': Config.get('DISPLAY_ID_MASKING_CHAR', '***'),
    'data_masking_enabled': Config.get_bool('SECURITY_DATA_MASKING_ENABLED', True),
    'log_sensitive_data': Config.get_bool('SECURITY_LOG_SENSITIVE_DATA', False),
}

# 데이터 소스 설정
DATA_CONFIG = {
    'use_real_data': Config.get_bool('USE_REAL_DATA', True),
}

# Firebase 설정
FIREBASE_CONFIG = {
    'apiKey': Config.get('FIREBASE_API_KEY', ''),
    'authDomain': Config.get('FIREBASE_AUTH_DOMAIN', ''),
    'projectId': Config.get('FIREBASE_PROJECT_ID', ''),
    'storageBucket': Config.get('FIREBASE_STORAGE_BUCKET', ''),
    'messagingSenderId': Config.get('FIREBASE_MESSAGING_SENDER_ID', ''),
    'appId': Config.get('FIREBASE_APP_ID', ''),
}
