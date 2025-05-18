"""
MariaDB 커넥터 및 ORM 테스트 스크립트

이 스크립트는 새로 구현된 MariaDB 전용 커넥터와 SQLAlchemy ORM 기능을 테스트합니다.
"""

import os
import sys
import logging
from pathlib import Path

# 로깅 설정
logging.basicConfig(level=logging.INFO, format='%(asctime)s - %(name)s - %(levelname)s - %(message)s')
logger = logging.getLogger(__name__)

# 프로젝트 루트 디렉토리를 시스템 경로에 추가
project_root = Path(__file__).parent.parent
sys.path.append(str(project_root))

# .env 파일 로드 (필요한 경우)
from dotenv import load_dotenv
load_dotenv(project_root / ".env")

# 데이터베이스 연결 모듈 임포트
from src.database.mariadb_connection import MariaDBConnection
from src.database.orm import DatabaseSession, Repository
from src.database.models import Player, PlayerWallet, PlayerComment

def test_mariadb_connection():
    """
    MariaDB 전용 커넥터 테스트
    """
    logger.info("Testing MariaDB connection...")
    
    try:
        conn = MariaDBConnection()
        
        # 테이블 목록 조회
        result = conn.query("SHOW TABLES")
        logger.info(f"Found {len(result)} tables in the database")
        
        # 플레이어 수 조회
        player_count = conn.query_one("SELECT COUNT(*) as count FROM players")
        logger.info(f"Player count: {player_count['count']}")
        
        # 샘플 플레이어 조회
        sample_player = conn.query_one("SELECT * FROM players LIMIT 1")
        if sample_player:
            logger.info(f"Sample player: ID={sample_player['id']}, Name={sample_player.get('name', 'N/A')}")
        else:
            logger.info("No players found in the database")
        
        # 복잡한 조인 쿼리 실행
        complex_query = """
        SELECT p.id, p.name, pw.currency, pw.balance
        FROM players p
        LEFT JOIN player_wallets pw ON p.id = pw.player_id
        WHERE p.status = 'active'
        ORDER BY pw.balance DESC
        LIMIT 5
        """
        
        rich_players = conn.query(complex_query)
        logger.info(f"Found {len(rich_players)} active players with wallets")
        for player in rich_players:
            logger.info(f"Player: ID={player['id']}, Name={player.get('name', 'N/A')}, "
                        f"Currency={player.get('currency', 'N/A')}, Balance={player.get('balance', 0)}")
        
        conn.close_pool()
        logger.info("MariaDB connection test completed successfully")
        return True
    except Exception as e:
        logger.error(f"MariaDB connection test failed: {str(e)}")
        return False

def test_orm():
    """
    SQLAlchemy ORM 테스트
    """
    logger.info("Testing SQLAlchemy ORM...")
    
    try:
        # 데이터베이스 세션 생성
        db_session = DatabaseSession(echo=False)
        
        # 테이블 목록 조회
        tables = db_session.get_tables()
        logger.info(f"Found {len(tables)} tables in the database")
        
        # Player 모델에 대한 Repository 생성
        player_repo = Repository(db_session, Player)
        
        # 플레이어 수 조회
        player_count = player_repo.count()
        logger.info(f"Player count: {player_count}")
        
        # 처음 5명의 플레이어 조회
        with db_session.session_scope() as session:
            players = session.query(Player).limit(5).all()
            logger.info(f"Retrieved {len(players)} players")
            
            for player in players:
                logger.info(f"Player: ID={player.id}, Name={player.name}, Account={player.account}")
                
                # 플레이어의 지갑 정보 조회 (관계 활용)
                if hasattr(player, 'wallets') and player.wallets:
                    for wallet in player.wallets:
                        logger.info(f"  Wallet: Currency={wallet.currency}, Balance={wallet.balance}")
        
        # 커스텀 쿼리 실행
        def custom_player_query(session):
            # 활성 상태인 플레이어만 조회
            return session.query(Player).filter(Player.status == 'active').limit(3).all()
        
        active_players = player_repo.execute_custom_query(custom_player_query)
        logger.info(f"Found {len(active_players)} active players")
        
        logger.info("SQLAlchemy ORM test completed successfully")
        return True
    except Exception as e:
        logger.error(f"SQLAlchemy ORM test failed: {str(e)}")
        return False

if __name__ == "__main__":
    logger.info("Starting MariaDB connector and ORM test script")
    
    # MariaDB 연결 테스트
    conn_success = test_mariadb_connection()
    
    # ORM 테스트
    if conn_success:
        orm_success = test_orm()
    else:
        logger.error("Skipping ORM test due to connection failure")
        orm_success = False
    
    # 최종 결과 출력
    if conn_success and orm_success:
        logger.info("All tests completed successfully")
    else:
        logger.error("Tests failed")
