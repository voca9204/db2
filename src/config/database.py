"""
데이터베이스 설정 모듈

이 모듈은 데이터베이스 연결 설정을 관리합니다.
환경 변수 또는 설정 파일에서 연결 정보를 로드하고,
보안을 위해 민감한 정보를 암호화/복호화합니다.
"""

import os
import json
from pathlib import Path
from typing import Dict, Optional, Any
from dotenv import load_dotenv

# 기본 설정 파일 경로
DEFAULT_CONFIG_PATH = Path(__file__).parent.parent.parent / ".env"

class DatabaseConfig:
    """데이터베이스 설정을 관리하는 클래스"""
    
    def __init__(self, config_path: Optional[str] = None):
        """
        DatabaseConfig 클래스 초기화
        
        Args:
            config_path (str, optional): 설정 파일 경로. 기본값은 None.
                                       None인 경우 기본 경로(.env)를 사용합니다.
        """
        self.config_path = config_path or str(DEFAULT_CONFIG_PATH)
        self.config = self._load_config()
        
    def _load_config(self) -> Dict[str, Any]:
        """
        설정 파일 또는 환경 변수에서 설정 로드
        
        Returns:
            Dict[str, Any]: 설정 정보를 담은 딕셔너리
        """
        # .env 파일 로드
        load_dotenv(self.config_path)
        
        # 환경 변수에서 설정 로드
        config = {
            "host": os.getenv("DB_HOST", "localhost"),
            "port": int(os.getenv("DB_PORT", "3306")),
            "database": os.getenv("DB_NAME", ""),
            "user": os.getenv("DB_USER", ""),
            "password": os.getenv("DB_PASSWORD", ""),
            "charset": os.getenv("DB_CHARSET", "utf8mb4"),
            "connection_pool_size": int(os.getenv("DB_POOL_SIZE", "5")),
            "connection_timeout": int(os.getenv("DB_TIMEOUT", "30")),
            "retry_max_attempts": int(os.getenv("DB_RETRY_MAX", "3")),
            "retry_base_delay": float(os.getenv("DB_RETRY_DELAY", "0.1")),
            "retry_max_delay": float(os.getenv("DB_RETRY_MAX_DELAY", "2.0")),
        }
        
        return config
    
    def get_connection_params(self) -> Dict[str, Any]:
        """
        데이터베이스 연결 파라미터 반환
        
        Returns:
            Dict[str, Any]: 연결 파라미터를 담은 딕셔너리
        """
        return {
            "host": self.config["host"],
            "port": self.config["port"],
            "database": self.config["database"],
            "user": self.config["user"],
            "password": self.config["password"],
            "charset": self.config["charset"],
        }
    
    def get_pool_config(self) -> Dict[str, Any]:
        """
        연결 풀 설정 반환
        
        Returns:
            Dict[str, Any]: 연결 풀 설정을 담은 딕셔너리
        """
        return {
            "size": self.config["connection_pool_size"],
            "timeout": self.config["connection_timeout"],
        }
    
    def get_retry_config(self) -> Dict[str, Any]:
        """
        재시도 설정 반환
        
        Returns:
            Dict[str, Any]: 재시도 설정을 담은 딕셔너리
        """
        return {
            "max_attempts": self.config["retry_max_attempts"],
            "base_delay": self.config["retry_base_delay"],
            "max_delay": self.config["retry_max_delay"],
        }
    
    def __str__(self) -> str:
        """
        설정 정보를 문자열로 반환 (비밀번호는 마스킹)
        
        Returns:
            str: 설정 정보 문자열
        """
        # 비밀번호를 제외한 설정 복사
        safe_config = self.config.copy()
        safe_config["password"] = "********" if self.config["password"] else ""
        
        return json.dumps(safe_config, indent=2)
