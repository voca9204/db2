#!/usr/bin/env python
"""
데이터베이스 테이블 구조 확인 스크립트 (PyMySQL 사용)
"""

import sys
from pathlib import Path
import logging
import pymysql
from pymysql.cursors import DictCursor

# 프로젝트 루트 디렉토리를 시스템 경로에 추가
project_root = Path(__file__).parent.parent
sys.path.append(str(project_root))

# 로깅 설정
logging.basicConfig(level=logging.INFO)
logger = logging.getLogger(__name__)

def get_connection():
    """데이터베이스 연결 획득"""
    return pymysql.connect(
        host="211.248.190.46",
        user="hermes",
        password="mcygicng!022",
        database="hermes",
        cursorclass=DictCursor
    )

def check_table_structure(table_name):
    """테이블 구조 확인"""
    try:
        conn = get_connection()
        
        with conn.cursor() as cursor:
            # 테이블 구조 조회
            cursor.execute(f"DESCRIBE {table_name}")
            columns = cursor.fetchall()
            
            print(f"\n테이블 '{table_name}' 구조:")
            print("-" * 80)
            print(f"{'필드명':<20} {'타입':<20} {'Null':<10} {'키':<10} {'기본값':<20} {'추가정보'}")
            print("-" * 80)
            for col in columns:
                print(f"{col.get('Field', ''):<20} {col.get('Type', ''):<20} {col.get('Null', ''):<10} {col.get('Key', ''):<10} {str(col.get('Default', '')):<20} {col.get('Extra', '')}")
            print("-" * 80)
            
            # 전화번호 관련 필드 찾기
            phone_fields = [col for col in columns if any(phone_term in col.get('Field', '').lower() for phone_term in ['phone', 'mobile', 'tel', 'contact'])]
            if phone_fields:
                print("\n전화번호 관련 필드:")
                for field in phone_fields:
                    print(f"- {field.get('Field')}")
            else:
                print(f"\n'{table_name}' 테이블에 전화번호 관련 필드가 없습니다.")
        
        conn.close()
    except Exception as e:
        logger.error(f"테이블 구조 확인 중 오류 발생: {str(e)}")

def find_tables_with_phone_fields():
    """전화번호 필드가 있는 테이블 찾기"""
    try:
        conn = get_connection()
        
        with conn.cursor() as cursor:
            # 모든 테이블 조회
            cursor.execute("SHOW TABLES")
            tables_result = cursor.fetchall()
            tables = [list(table.values())[0] for table in tables_result]
            
            print(f"\n전체 {len(tables)}개 테이블 중 전화번호 관련 필드 검색:")
            print("-" * 80)
            
            phone_tables = []
            
            for table in tables:
                # 각 테이블의 모든 컬럼 조회
                cursor.execute(f"DESCRIBE {table}")
                columns = cursor.fetchall()
                
                # 전화번호 관련 필드 찾기
                phone_fields = [col.get('Field') for col in columns if any(phone_term in col.get('Field', '').lower() for phone_term in ['phone', 'mobile', 'tel', 'contact'])]
                
                if phone_fields:
                    phone_tables.append((table, phone_fields))
                    print(f"테이블: {table} - 필드: {', '.join(phone_fields)}")
            
            print("-" * 80)
            print(f"전화번호 관련 필드가 있는 테이블: {len(phone_tables)}개")
            
            # 각 테이블에서 데이터 샘플 확인
            print("\n각 테이블의 데이터 샘플:")
            print("-" * 80)
            
            for table, fields in phone_tables:
                field_names = ", ".join(fields)
                try:
                    cursor.execute(f"SELECT * FROM {table} WHERE {fields[0]} IS NOT NULL LIMIT 5")
                    samples = cursor.fetchall()
                    
                    print(f"\n테이블: {table}")
                    if samples:
                        for sample in samples:
                            field_values = [f"{field}: {sample.get(field, 'NULL')}" for field in fields]
                            print(f"- {', '.join(field_values)}")
                    else:
                        print("- 해당 필드에 데이터가 없습니다.")
                except Exception as e:
                    print(f"- 샘플 조회 중 오류: {str(e)}")
        
        conn.close()
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
