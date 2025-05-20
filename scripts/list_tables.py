"""
데이터베이스 테이블 목록 확인 스크립트
"""

import os
import sys

# 상위 디렉토리 추가하여 모듈 import 가능하게 설정
sys.path.insert(0, os.path.abspath(os.path.join(os.path.dirname(__file__), '..')))

from src.database.connection import DatabaseConnection

def main():
    # 데이터베이스 연결
    print("데이터베이스에 연결 중...")
    db = DatabaseConnection()
    
    try:
        # 테이블 목록 쿼리
        query = """
        SELECT table_name
        FROM information_schema.tables
        WHERE table_schema = DATABASE()
        ORDER BY table_name;
        """
        
        # 쿼리 실행
        print("테이블 목록 조회 중...")
        results = db.query(query)
        
        # 결과 출력
        print("\n데이터베이스 테이블 목록:")
        print("=" * 40)
        for idx, row in enumerate(results, 1):
            print(f"{idx:3}. {row['table_name']}")
        print("=" * 40)
        print(f"총 {len(results)}개의 테이블이 있습니다.")
        
    except Exception as e:
        print(f"오류 발생: {str(e)}")
    finally:
        # 연결 종료
        if 'db' in locals():
            db.close()

if __name__ == '__main__':
    main()
