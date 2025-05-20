"""
PyMySQL을 사용한 간소화된 테스트 스크립트

이 스크립트는 PyMySQL을 사용하여 기본적인 데이터베이스 연결 및 쿼리 기능을 테스트합니다.
복잡한 재시도 메커니즘을 제거하고 핵심 기능에 집중합니다.
"""

import sys
import time
import logging
import os
from pathlib import Path
from dotenv import load_dotenv

# .env 파일 로드
load_dotenv()


# 로깅 설정
logging.basicConfig(level=logging.INFO, format='%(asctime)s - %(name)s - %(levelname)s - %(message)s')
logger = logging.getLogger(__name__)

# 프로젝트 루트 디렉토리를 시스템 경로에 추가
project_root = Path(__file__).parent.parent
sys.path.append(str(project_root))

# PyMySQL 임포트
import pymysql
from pymysql.cursors import DictCursor

# 데이터베이스 연결 정보
DB_CONFIG = {
    "host": os.getenv("DB_HOST", "211.248.190.46"),
    "user": os.getenv("DB_USER", "hermes"),
    "password": os.getenv("DB_PASSWORD", ""),
    "database": os.getenv("DB_NAME", "hermes"),
    "charset": os.getenv("DB_CHARSET", "utf8mb4"),
    "cursorclass": DictCursor
}

def test_database_connection():
    """데이터베이스 연결 테스트"""
    logger.info("데이터베이스 연결 테스트 시작...")
    
    try:
        # 연결 생성
        conn = pymysql.connect(**DB_CONFIG)
        logger.info(f"데이터베이스 '{DB_CONFIG['database']}'에 성공적으로 연결")
        
        # 테이블 목록 조회
        with conn.cursor() as cursor:
            cursor.execute("SHOW TABLES")
            tables = cursor.fetchall()
            table_names = [list(table.values())[0] for table in tables]
            logger.info(f"데이터베이스에 {len(tables)}개의 테이블이 있습니다")
            logger.info(f"처음 5개 테이블: {', '.join(table_names[:5])}")
        
        # 플레이어 테이블 정보 조회
        with conn.cursor() as cursor:
            cursor.execute("SELECT COUNT(*) AS count FROM players")
            result = cursor.fetchone()
            logger.info(f"players 테이블에 {result['count']}개의 레코드가 있습니다")
            
            cursor.execute("SELECT * FROM players LIMIT 3")
            players = cursor.fetchall()
            for player in players:
                logger.info(f"플레이어: ID={player['id']}, 이름={player.get('name', 'N/A')}, 계정={player.get('account', 'N/A')}")
        
        # 복합 쿼리 실행
        with conn.cursor() as cursor:
            complex_query = """
            SELECT 
                p.id, p.name, p.account, p.status, p.createdAt,
                COUNT(pc.contact) AS contact_count
            FROM 
                players p
            LEFT JOIN 
                player_contacts pc ON p.id = pc.player
            GROUP BY 
                p.id
            ORDER BY 
                contact_count DESC
            LIMIT 5
            """
            cursor.execute(complex_query)
            results = cursor.fetchall()
            logger.info(f"복합 쿼리 결과: {len(results)}개의 행")
            for row in results:
                logger.info(f"플레이어: ID={row['id']}, 이름={row.get('name', 'N/A')}, "
                          f"계정={row.get('account', 'N/A')}, 연락처 수={row['contact_count']}")
        
        # 트랜잭션 테스트
        logger.info("트랜잭션 테스트 시작...")
        conn.autocommit(False)
        try:
            # 테스트용 임시 테이블 생성
            with conn.cursor() as cursor:
                cursor.execute("DROP TABLE IF EXISTS pymysql_test")
                cursor.execute("""
                CREATE TABLE pymysql_test (
                    id INT AUTO_INCREMENT PRIMARY KEY,
                    name VARCHAR(100) NOT NULL,
                    value INT,
                    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
                )
                """)
                
                # 데이터 삽입
                cursor.execute(
                    "INSERT INTO pymysql_test (name, value) VALUES (%s, %s)",
                    ("테스트1", 100)
                )
                cursor.execute(
                    "INSERT INTO pymysql_test (name, value) VALUES (%s, %s)",
                    ("테스트2", 200)
                )
            
            # 커밋
            conn.commit()
            logger.info("트랜잭션 커밋 완료")
            
            # 데이터 확인
            with conn.cursor() as cursor:
                cursor.execute("SELECT * FROM pymysql_test")
                results = cursor.fetchall()
                logger.info(f"삽입된 데이터: {len(results)}개의 행")
                for row in results:
                    logger.info(f"행: ID={row['id']}, 이름={row['name']}, 값={row['value']}")
            
            # 테스트 테이블 삭제
            with conn.cursor() as cursor:
                cursor.execute("DROP TABLE IF EXISTS pymysql_test")
        except Exception as e:
            # 롤백
            conn.rollback()
            logger.error(f"트랜잭션 오류 발생, 롤백: {str(e)}")
        finally:
            # 자동 커밋 복원
            conn.autocommit(True)
        
        # 연결 종료
        conn.close()
        logger.info("데이터베이스 연결 테스트 성공적으로 완료")
        return True
    
    except Exception as e:
        logger.error(f"데이터베이스 연결 테스트 중 오류 발생: {str(e)}")
        return False

if __name__ == "__main__":
    success = test_database_connection()
    sys.exit(0 if success else 1)
