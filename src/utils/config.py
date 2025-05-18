"""
전역 설정 모듈

이 모듈은 애플리케이션 전체에서 사용되는 설정을 정의합니다.
"""

import os
import json
from pathlib import Path
import logging

logger = logging.getLogger(__name__)

# 기본 설정 파일 경로
DEFAULT_CONFIG_PATH = Path(__file__).parent.parent.parent / "config" / "app_config.json"

class AppConfig:
    """애플리케이션 설정 관리 클래스"""
    
    _instance = None
    
    def __new__(cls, config_path=None):
        """싱글톤 패턴 구현"""
        if cls._instance is None:
            cls._instance = super(AppConfig, cls).__new__(cls)
            cls._instance._initialize(config_path)
        return cls._instance
    
    def _initialize(self, config_path):
        """설정 초기화"""
        self.config_path = config_path or DEFAULT_CONFIG_PATH
        self.config = self._load_config()
        
        # 환경 변수에서 설정 오버라이드
        self._override_from_env()
        
        logger.info("Application configuration loaded")
    
    def _load_config(self):
        """설정 파일 로드"""
        # 기본 설정
        config = {
            # 데이터 표시 설정
            "display": {
                "hide_player_names": True,  # 플레이어 이름 숨김
                "hide_player_numbers": True,  # 플레이어 번호 숨김
                "id_masking_char": "***",  # ID 마스킹 문자
                "mask_partial": True,  # 부분 마스킹 (예: abcd -> a**d)
                "sensitive_fields": [
                    "name", "player_name", "account", "email", "phone", 
                    "id", "player_id", "user_id"
                ]
            },
            # 보안 설정
            "security": {
                "data_masking_enabled": True,  # 데이터 마스킹 활성화
                "log_sensitive_data": False  # 민감한 데이터 로깅 비활성화
            }
        }
        
        # 설정 파일이 존재하면 로드
        if os.path.exists(self.config_path):
            try:
                with open(self.config_path, 'r', encoding='utf-8') as f:
                    file_config = json.load(f)
                    # 기본 설정에 파일 설정 병합
                    self._merge_config(config, file_config)
            except Exception as e:
                logger.error(f"Error loading config file: {str(e)}")
        else:
            # 설정 파일이 없으면 기본 설정 저장
            os.makedirs(os.path.dirname(self.config_path), exist_ok=True)
            try:
                with open(self.config_path, 'w', encoding='utf-8') as f:
                    json.dump(config, f, indent=2)
            except Exception as e:
                logger.error(f"Error saving default config: {str(e)}")
        
        return config
    
    def _merge_config(self, target, source):
        """두 설정 딕셔너리 병합"""
        for key, value in source.items():
            if key in target and isinstance(target[key], dict) and isinstance(value, dict):
                self._merge_config(target[key], value)
            else:
                target[key] = value
    
    def _override_from_env(self):
        """환경 변수에서 설정 오버라이드"""
        # 환경 변수에서 설정 로드
        # 예: DISPLAY_HIDE_PLAYER_NAMES=true는 config['display']['hide_player_names']를 True로 설정
        for var, value in os.environ.items():
            if var.startswith('DISPLAY_') or var.startswith('SECURITY_'):
                parts = var.lower().split('_')
                category = parts[0].lower()
                key = '_'.join(parts[1:]).lower()
                
                if category in self.config and key in self.config[category]:
                    # 타입 변환
                    if isinstance(self.config[category][key], bool):
                        self.config[category][key] = value.lower() in ('true', 'yes', '1')
                    elif isinstance(self.config[category][key], int):
                        try:
                            self.config[category][key] = int(value)
                        except ValueError:
                            pass
                    else:
                        self.config[category][key] = value
    
    def get(self, category, key=None, default=None):
        """설정 값 조회"""
        if category not in self.config:
            return default
        
        if key is None:
            return self.config[category]
            
        if key not in self.config[category]:
            return default
            
        return self.config[category][key]
    
    def set(self, category, key, value):
        """설정 값 변경"""
        if category not in self.config:
            self.config[category] = {}
        
        self.config[category][key] = value
        
        # 변경 사항 파일에 저장
        try:
            with open(self.config_path, 'w', encoding='utf-8') as f:
                json.dump(self.config, f, indent=2)
            logger.info(f"Updated configuration saved to {self.config_path}")
        except Exception as e:
            logger.error(f"Error saving config: {str(e)}")
    
    def __str__(self):
        """설정 정보를 문자열로 반환"""
        return json.dumps(self.config, indent=2)

# 데이터 마스킹 유틸리티 함수
def mask_sensitive_data(data, sensitive_fields=None):
    """민감한 데이터 마스킹"""
    config = AppConfig()
    
    if not config.get('security', 'data_masking_enabled', True):
        return data
    
    # 설정에서 민감 필드 목록 가져오기
    if sensitive_fields is None:
        sensitive_fields = config.get('display', 'sensitive_fields', [])
    
    # 마스킹 문자
    masking_char = config.get('display', 'id_masking_char', '***')
    mask_partial = config.get('display', 'mask_partial', True)
    
    # 데이터 타입에 따라 처리
    if isinstance(data, dict):
        masked_data = {}
        for key, value in data.items():
            if key in sensitive_fields:
                if (config.get('display', f'hide_{key}s', False) or 
                    key == 'name' and config.get('display', 'hide_player_names', False) or 
                    key in ('id', 'player_id', 'user_id') and config.get('display', 'hide_player_numbers', False) or
                    key in ('phone', 'phoneName', 'contact') and config.get('display', 'hide_phone_numbers', False)):
                    # 플레이어 이름, 번호 또는 전화번호를 숨김
                    masked_data[key] = masking_char
                elif mask_partial and isinstance(value, str) and len(value) > 2:
                    # 부분 마스킹 (첫 글자와 마지막 글자만 표시)
                    masked_data[key] = value[0] + masking_char + (value[-1] if len(value) > 2 else '')
                else:
                    # 완전 마스킹
                    masked_data[key] = masking_char
            elif isinstance(value, (dict, list)):
                # 중첩된 구조 재귀적으로 처리
                masked_data[key] = mask_sensitive_data(value, sensitive_fields)
            else:
                masked_data[key] = value
        return masked_data
    
    elif isinstance(data, list):
        return [mask_sensitive_data(item, sensitive_fields) for item in data]
    
    else:
        return data
