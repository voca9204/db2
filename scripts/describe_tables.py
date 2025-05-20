"""
테이블 구조 확인 스크립트
"""

import os
import sys

# 상위 디렉토리 추가하여 모듈 import 가능하게 설정
sys.path.insert(0, os.path.abspath(os.path.join(os.path.dirname(__file__), '..')))

from src.database.connection import DatabaseConnection

def main():
    # 확인할 테이블 이름 목록
    tables_to_check = [
        'game_attends',
        'money_flows',
        'player_wallets',
        'players'
    ]
    
    # 데이터베이스 연결
    print("데이터베이스에 연결 중...")
    db = DatabaseConnection()
    
    try:
        for table_name in tables_to_check:
            # 테이블 구조 쿼리
            query = f"""
            DESCRIBE {table_name};
            """
            
            # 쿼리 실행
            print(f"\n{table_name} 테이블 구조 조회 중...")
            results = db.query(query)
            
            # 결과 출력
            print(f"\n{table_name} 테이블 구조:")
            print("=" * 80)
            print(f"{'필드':20} {'타입':25} {'NULL':6} {'키':5} {'기본값':15} {'추가 정보'}")
            print("-" * 80)
            for row in results:
                print(f"{row['Field']:20} {row['Type']:25} {row['Null']:6} {row['Key']:5} {str(row['Default'] or ''):15} {row['Extra'] or ''}")
            print("=" * 80)
            
    except Exception as e:
        print(f"오류 발생: {str(e)}")
    finally:
        # 연결 종료
        if 'db' in locals():
            db.close()

if __name__ == '__main__':
    main()
