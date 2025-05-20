"""
데이터베이스 스키마 탐색 스크립트

Hermes 데이터베이스의 스키마를 탐색하고 테이블 및 필드 정보를 출력합니다.
"""

import sys
import os
from pathlib import Path

# 프로젝트 루트 디렉토리를 Python 경로에 추가
project_root = Path(__file__).parent.parent
sys.path.append(str(project_root))

from src.database.connection import DatabaseConnection
from src.config.database import DatabaseConfig

def get_tables(db_conn):
    """
    데이터베이스의 모든 테이블 목록을 가져옵니다.
    
    Args:
        db_conn: 데이터베이스 연결 객체
        
    Returns:
        list: 테이블 이름 목록
    """
    query = """
    SELECT TABLE_NAME 
    FROM information_schema.TABLES 
    WHERE TABLE_SCHEMA = %s
    ORDER BY TABLE_NAME
    """
    
    results = db_conn.query(query, (db_conn.config.config["database"],))
    return [row["TABLE_NAME"] for row in results]

def get_table_columns(db_conn, table_name):
    """
    테이블의 모든 컬럼 정보를 가져옵니다.
    
    Args:
        db_conn: 데이터베이스 연결 객체
        table_name: 테이블 이름
        
    Returns:
        list: 컬럼 정보 목록
    """
    query = """
    SELECT 
        COLUMN_NAME, 
        DATA_TYPE, 
        CHARACTER_MAXIMUM_LENGTH, 
        IS_NULLABLE, 
        COLUMN_KEY,
        COLUMN_COMMENT
    FROM information_schema.COLUMNS 
    WHERE 
        TABLE_SCHEMA = %s AND 
        TABLE_NAME = %s
    ORDER BY ORDINAL_POSITION
    """
    
    return db_conn.query(query, (db_conn.config.config["database"], table_name))

def get_table_indices(db_conn, table_name):
    """
    테이블의 모든 인덱스 정보를 가져옵니다.
    
    Args:
        db_conn: 데이터베이스 연결 객체
        table_name: 테이블 이름
        
    Returns:
        list: 인덱스 정보 목록
    """
    query = """
    SELECT 
        INDEX_NAME,
        COLUMN_NAME,
        NON_UNIQUE,
        SEQ_IN_INDEX
    FROM information_schema.STATISTICS
    WHERE 
        TABLE_SCHEMA = %s AND 
        TABLE_NAME = %s
    ORDER BY INDEX_NAME, SEQ_IN_INDEX
    """
    
    return db_conn.query(query, (db_conn.config.config["database"], table_name))

def get_foreign_keys(db_conn, table_name):
    """
    테이블의 외래 키 정보를 가져옵니다.
    
    Args:
        db_conn: 데이터베이스 연결 객체
        table_name: 테이블 이름
        
    Returns:
        list: 외래 키 정보 목록
    """
    query = """
    SELECT 
        CONSTRAINT_NAME,
        COLUMN_NAME,
        REFERENCED_TABLE_NAME,
        REFERENCED_COLUMN_NAME
    FROM information_schema.KEY_COLUMN_USAGE
    WHERE 
        TABLE_SCHEMA = %s AND 
        TABLE_NAME = %s AND
        REFERENCED_TABLE_NAME IS NOT NULL
    ORDER BY CONSTRAINT_NAME
    """
    
    return db_conn.query(query, (db_conn.config.config["database"], table_name))

def explore_database():
    """
    데이터베이스 스키마를 탐색하고 정보를 출력합니다.
    """
    # 데이터베이스 연결 설정
    config = DatabaseConfig()
    config.config["host"] = "211.248.190.46"
    config.config["user"] = "hermes"
    # 환경 변수 파일에서 설정 로드
    from dotenv import load_dotenv
    load_dotenv()
    import os
    
    # 환경 변수에서 비밀번호 가져오기
    db_password = os.getenv("DB_PASSWORD")
    config.config["database"] = "hermes"
    
    # 데이터베이스 연결
    db_conn = DatabaseConnection(None)
    db_conn.config = config
    
    try:
        print("데이터베이스에 연결 중...")
        db_conn.connect()
        print(f"데이터베이스 '{config.config['database']}'에 연결되었습니다.")
        
        # 테이블 목록 가져오기
        tables = get_tables(db_conn)
        print(f"\n총 {len(tables)}개의 테이블이 있습니다.\n")
        
        # 각 테이블에 대한 상세 정보 출력
        for table_name in tables:
            print(f"\n== 테이블: {table_name} ==")
            
            # 컬럼 정보 출력
            columns = get_table_columns(db_conn, table_name)
            print(f"\n  컬럼 ({len(columns)}개):")
            for col in columns:
                pk_marker = "PK" if col["COLUMN_KEY"] == "PRI" else ""
                nullable = "NULL" if col["IS_NULLABLE"] == "YES" else "NOT NULL"
                data_type = col["DATA_TYPE"]
                if col["CHARACTER_MAXIMUM_LENGTH"]:
                    data_type += f"({col['CHARACTER_MAXIMUM_LENGTH']})"
                
                comment = f"-- {col['COLUMN_COMMENT']}" if col["COLUMN_COMMENT"] else ""
                
                print(f"    {col['COLUMN_NAME']} {data_type} {nullable} {pk_marker} {comment}")
            
            # 인덱스 정보 출력
            indices = get_table_indices(db_conn, table_name)
            if indices:
                print("\n  인덱스:")
                current_index = None
                for idx in indices:
                    if current_index != idx["INDEX_NAME"]:
                        current_index = idx["INDEX_NAME"]
                        unique = "UNIQUE" if idx["NON_UNIQUE"] == 0 else ""
                        print(f"    {current_index} {unique}:")
                    
                    print(f"      {idx['SEQ_IN_INDEX']}. {idx['COLUMN_NAME']}")
            
            # 외래 키 정보 출력
            foreign_keys = get_foreign_keys(db_conn, table_name)
            if foreign_keys:
                print("\n  외래 키:")
                current_fk = None
                for fk in foreign_keys:
                    if current_fk != fk["CONSTRAINT_NAME"]:
                        current_fk = fk["CONSTRAINT_NAME"]
                        print(f"    {current_fk}:")
                    
                    print(f"      {fk['COLUMN_NAME']} -> {fk['REFERENCED_TABLE_NAME']}.{fk['REFERENCED_COLUMN_NAME']}")
    
    except Exception as e:
        print(f"오류 발생: {str(e)}")
    
    finally:
        # 연결 종료
        db_conn.close()

if __name__ == "__main__":
    explore_database()
