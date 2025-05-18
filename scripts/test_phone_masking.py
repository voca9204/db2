#!/usr/bin/env python
"""
전화번호 마스킹 테스트 스크립트
"""

import sys
from pathlib import Path
import logging
import json
import pymysql
from pymysql.cursors import DictCursor

# 프로젝트 루트 디렉토리를 시스템 경로에 추가
project_root = Path(__file__).parent.parent
sys.path.append(str(project_root))

# 로깅 설정
logging.basicConfig(level=logging.INFO)
logger = logging.getLogger(__name__)

from src.utils.config import AppConfig, mask_sensitive_data
# PyMySQL로 대체

def get_connection():
    """데이터베이스 연결 획득"""
    return pymysql.connect(
        host="211.248.190.46",
        user="hermes",
        password="mcygicng!022",
        database="hermes",
        cursorclass=DictCursor
    )

def test_phone_masking():
    """전화번호 마스킹 테스트"""
    # 테스트 데이터
    test_data = [
        {"id": 1, "name": "홍길동", "phoneName": "iPhone", "contact": "01012345678"},
        {"id": 2, "name": "김철수", "phoneName": "Galaxy", "contact": "01087654321"},
        {"id": 3, "name": "이영희", "phoneName": "Pixel", "contact": "01011112222"}
    ]
    
    # 설정 확인
    config = AppConfig()
    print("현재 설정:")
    print(f"- 이름 숨김: {config.get('display', 'hide_player_names', False)}")
    print(f"- ID 숨김: {config.get('display', 'hide_player_numbers', False)}")
    print(f"- 전화번호 숨김: {config.get('display', 'hide_phone_numbers', False)}")
    
    # 마스킹 테스트
    masked_data = mask_sensitive_data(test_data)
    
    print("\n마스킹 후 데이터:")
    print(json.dumps(masked_data, indent=2, ensure_ascii=False))
    
    # 각 설정 변경 후 테스트
    print("\n1. 이름만 숨기기:")
    config.set('display', 'hide_player_names', True)
    config.set('display', 'hide_player_numbers', False)
    config.set('display', 'hide_phone_numbers', False)
    masked_data = mask_sensitive_data(test_data)
    print(json.dumps(masked_data, indent=2, ensure_ascii=False))
    
    print("\n2. ID만 숨기기:")
    config.set('display', 'hide_player_names', False)
    config.set('display', 'hide_player_numbers', True)
    config.set('display', 'hide_phone_numbers', False)
    masked_data = mask_sensitive_data(test_data)
    print(json.dumps(masked_data, indent=2, ensure_ascii=False))
    
    print("\n3. 전화번호만 숨기기:")
    config.set('display', 'hide_player_names', False)
    config.set('display', 'hide_player_numbers', False)
    config.set('display', 'hide_phone_numbers', True)
    masked_data = mask_sensitive_data(test_data)
    print(json.dumps(masked_data, indent=2, ensure_ascii=False))
    
    print("\n4. 모두 숨기기:")
    config.set('display', 'hide_player_names', True)
    config.set('display', 'hide_player_numbers', True)
    config.set('display', 'hide_phone_numbers', True)
    masked_data = mask_sensitive_data(test_data)
    print(json.dumps(masked_data, indent=2, ensure_ascii=False))
    
    # 실제 데이터베이스 쿼리 테스트
    try:
        conn = get_connection()
        
        with conn.cursor() as cursor:
            # player_contacts 테이블에서 전화번호 조회
            query = """
            SELECT p.id, p.name, p.phoneName, pc.contactType, pc.contact
            FROM players p
            LEFT JOIN player_contacts pc ON p.id = pc.player
            WHERE pc.contactType = 'phone'
            LIMIT 5
            """
            
            cursor.execute(query)
            results = cursor.fetchall()
            
            print("\n실제 데이터베이스 쿼리 결과 (마스킹 전):")
            print(json.dumps(results, indent=2, ensure_ascii=False))
            
            print("\n실제 데이터베이스 쿼리 결과 (마스킹 후):")
            masked_results = mask_sensitive_data(results)
            print(json.dumps(masked_results, indent=2, ensure_ascii=False))
        
        conn.close()
    except Exception as e:
        logger.error(f"데이터베이스 쿼리 중 오류 발생: {str(e)}")

if __name__ == "__main__":
    test_phone_masking()
