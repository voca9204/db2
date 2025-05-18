"""
데이터베이스 연결 및 쿼리 테스트 스크립트
"""

import sys
import os
from pathlib import Path

# 프로젝트 루트 디렉토리 추가
project_root = Path(__file__).parent.parent
sys.path.insert(0, str(project_root))

from src.utils.logging import setup_logging
from src.database.connection import DatabaseConnection

# 로깅 설정
setup_logging(log_level="INFO")

def main():
    """데이터베이스 연결 및 쿼리 테스트"""
    try:
        # 데이터베이스 연결
        print("데이터베이스 연결 시도...")
        with DatabaseConnection() as db:
            # 테이블 목록 조회
            print("\n테이블 목록:")
            tables = db.query("SHOW TABLES")
            for table in tables:
                table_name = list(table.values())[0]
                print(f"- {table_name}")
            
            # promotion_players 테이블 구조 조회
            print("\npromotion_players 테이블 구조:")
            fields = db.query("DESCRIBE promotion_players")
            for field in fields:
                print(f"- {field['Field']} ({field['Type']})")
            
            # 이벤트 참여 사용자 수 조회
            print("\n이벤트 참여 사용자 통계:")
            stats = db.query("""
                SELECT 
                    COUNT(*) AS total_count,
                    SUM(reward) AS total_reward,
                    MIN(appliedAt) AS first_applied,
                    MAX(appliedAt) AS last_applied
                FROM promotion_players
                WHERE appliedAt IS NOT NULL
            """)
            if stats and stats[0]:
                stat = stats[0]
                print(f"- 총 사용자 수: {stat['total_count']}")
                print(f"- 총 지급 금액: {stat['total_reward']}")
                print(f"- 첫 지급 시간: {stat['first_applied']}")
                print(f"- 마지막 지급 시간: {stat['last_applied']}")
            
            # 최근 이벤트 참여 사용자 조회
            print("\n최근 이벤트 참여 사용자 (상위 5명):")
            recent_users = db.query("""
                SELECT 
                    pp.player, 
                    p.name, 
                    pp.reward, 
                    pp.appliedAt
                FROM promotion_players pp
                JOIN players p ON pp.player = p.id
                WHERE pp.appliedAt IS NOT NULL
                ORDER BY pp.appliedAt DESC
                LIMIT 5
            """)
            for user in recent_users:
                print(f"- 사용자: {user['name']} (ID: {user['player']})")
                print(f"  지급 금액: {user['reward']}, 지급 시간: {user['appliedAt']}")
            
            print("\n데이터베이스 연결 및 쿼리 테스트 완료")
    except Exception as e:
        print(f"오류 발생: {e}")
        return 1
    
    return 0

if __name__ == "__main__":
    sys.exit(main())
