"""
데이터베이스 스키마 분석 스크립트
"""

import sys
import os
import json
from pathlib import Path

# 프로젝트 루트 디렉토리 추가
project_root = Path(__file__).parent.parent
sys.path.insert(0, str(project_root))

from src.utils.logging import setup_logging
from src.database.connection import DatabaseConnection

# 로깅 설정
setup_logging(log_level="INFO")

def main():
    """데이터베이스 스키마 분석"""
    try:
        # 데이터베이스 연결
        print("데이터베이스 연결 시도...")
        with DatabaseConnection() as db:
            # 테이블 목록 조회
            print("\n테이블 목록 조회 중...")
            tables = db.query("SHOW TABLES")
            table_names = [list(table.values())[0] for table in tables]
            print(f"총 {len(table_names)}개 테이블 발견")
            
            # 테이블 구조 분석
            schema = {}
            for table_name in table_names:
                print(f"\n{table_name} 테이블 분석 중...")
                
                # 테이블 필드 조회
                fields = db.query(f"DESCRIBE {table_name}")
                
                # 테이블 정보 저장
                schema[table_name] = {
                    "fields": fields,
                    "primaryKey": None,
                    "foreignKeys": []
                }
                
                # 기본키 식별
                for field in fields:
                    if field['Key'] == 'PRI':
                        if schema[table_name]["primaryKey"] is None:
                            schema[table_name]["primaryKey"] = field['Field']
                        else:
                            # 복합 기본키
                            if isinstance(schema[table_name]["primaryKey"], str):
                                schema[table_name]["primaryKey"] = [schema[table_name]["primaryKey"]]
                            schema[table_name]["primaryKey"].append(field['Field'])
            
            # 외래키 관계 조회
            print("\n외래키 관계 조회 중...")
            foreign_keys = db.query("""
                SELECT 
                    tc.constraint_name,
                    kcu.table_name AS 'source_table',
                    kcu.column_name AS 'source_column',
                    kcu.referenced_table_name AS 'target_table',
                    kcu.referenced_column_name AS 'target_column'
                FROM information_schema.table_constraints tc
                JOIN information_schema.key_column_usage kcu
                    ON tc.constraint_name = kcu.constraint_name
                    AND tc.table_schema = kcu.table_schema
                WHERE tc.constraint_type = 'FOREIGN KEY'
                AND tc.table_schema = DATABASE()
                AND kcu.referenced_table_name IS NOT NULL
                ORDER BY tc.table_name, kcu.ordinal_position
            """)
            
            # 외래키 관계를 테이블 정보에 저장
            for fk in foreign_keys:
                source_table = fk['source_table']
                if source_table in schema:
                    schema[source_table]["foreignKeys"].append({
                        "column": fk['source_column'],
                        "references": {
                            "table": fk['target_table'],
                            "column": fk['target_column']
                        }
                    })
            
            # 결과 저장
            output_file = project_root / "db_structure.json"
            with open(output_file, "w") as f:
                # 직렬화 가능한 형태로 변환
                serializable_schema = {}
                for table_name, table_info in schema.items():
                    serializable_schema[table_name] = {
                        "fields": [dict(field) for field in table_info["fields"]],
                        "primaryKey": table_info["primaryKey"],
                        "foreignKeys": table_info["foreignKeys"]
                    }
                
                json.dump(serializable_schema, f, indent=2)
            
            print(f"\n스키마 분석 결과가 {output_file}에 저장되었습니다.")
            
            # 테이블 목록만 별도 저장
            tables_list_file = project_root / "tables_list.json"
            with open(tables_list_file, "w") as f:
                json.dump(table_names, f, indent=2)
            
            print(f"테이블 목록이 {tables_list_file}에 저장되었습니다.")
            
            # 테이블 수, 필드 수, 관계 수 통계
            total_fields = sum(len(table_info["fields"]) for table_info in schema.values())
            total_relations = sum(len(table_info["foreignKeys"]) for table_info in schema.values())
            
            print(f"\n데이터베이스 통계:")
            print(f"- 총 테이블 수: {len(table_names)}")
            print(f"- 총 필드 수: {total_fields}")
            print(f"- 총 관계 수: {total_relations}")
            
            print("\n데이터베이스 스키마 분석 완료")
    except Exception as e:
        print(f"오류 발생: {e}")
        return 1
    
    return 0

if __name__ == "__main__":
    sys.exit(main())
