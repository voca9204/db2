#!/usr/bin/env python
"""
데이터베이스 테이블 구조 확인 스크립트
"""

import sys
from pathlib import Path
import logging

# 프로젝트 루트 디렉토리를 시스템 경로에 추가
project_root = Path(__file__).parent.parent
sys.path.append(str(project_root))

# 로깅 설정
logging.basicConfig(level=logging.INFO)
logger = logging.getLogger(__name__)

from src.database.mariadb_connection import MariaDBConnection

def check_table_structure(table_name):
    """테이블 구조 확인"""
    try:
        conn = MariaDBConnection()
        
        # 테이블 구조 조회
        columns = conn.query(f"DESCRIBE {table_name}")
        print(f"\n테이블 '{table_name}' 구조:")
        print("-" * 80)
        print(f"{'필드명':<20} {'타입':<20} {'Null':<10} {'키':<10} {'기본값':<20} {'추가정보'}")
        print("-" * 80)
        for col in columns:
            print(f"{col.get('Field', ''):<20} {col.get('Type', ''):<20} {col.get('Null', ''):<10} {col.get('Key', ''):<10} {col.get('Default', ''):<20} {col.get('Extra', '')}")
        print("-" * 80)
        
        # 전화번호 관련 필드 찾기
        phone_fields = [col for col in columns if any(phone_term in col.get('Field', '').lower() for phone_term in ['phone', 'mobile', 'tel', 'contact'])]
        if phone_fields:
            print("\n전화번호 관련 필드:")
            for field in phone_fields:
                print(f"- {field.get('Field')}")
        else:
            print(f"\n'{table_name}' 테이블에 전화번호 관련 필드가 없습니다.")
        
        conn.close_pool()
    except Exception as e:
        logger.error(f"테이블 구조 확인 중 오류 발생: {str(e)}")

def find_tables_with_phone_fields():
    """전화번호 필드가 있는 테이블 찾기"""
    try:
        conn = MariaDBConnection()
        
        # 모든 테이블 조회
        tables = conn.query("SHOW TABLES")
        tables = [list(table.values())[0] for table in tables]
        
        print(f"\n전체 {len(tables)}개 테이블 중 전화번호 관련 필드 검색:")
        print("-" * 80)
        
        phone_tables = []
        
        for table in tables:
            # 각 테이블의 모든 컬럼 조회
            columns = conn.query(f"DESCRIBE {table}")
            
            # 전화번호 관련 필드 찾기
            phone_fields = [col.get('Field') for col in columns if any(phone_term in col.get('Field', '').lower() for phone_term in ['phone', 'mobile', 'tel', 'contact'])]
            
            if phone_fields:
                phone_tables.append((table, phone_fields))
                print(f"테이블: {table} - 필드: {', '.join(phone_fields)}")
        
        print("-" * 80)
        print(f"전화번호 관련 필드가 있는 테이블: {len(phone_tables)}개")
        
        conn.close_pool()
        return phone_tables
    except Exception as e:
        logger.error(f"전화번호 필드 검색 중 오류 발생: {str(e)}")
        return []

if __name__ == "__main__":
    # 주요 테이블 구조 확인
    check_table_structure("players")
    check_table_structure("player_contacts")
    check_table_structure("customers")
    check_table_structure("customer_contacts")
    
    # 전화번호 관련 필드가 있는 테이블 찾기
    find_tables_with_phone_fields()
