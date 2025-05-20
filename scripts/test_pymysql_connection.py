#!/usr/bin/env python
"""
PyMySQL을 사용한 데이터베이스 연결 테스트 스크립트

이 스크립트는 PyMySQL을 사용하여 데이터베이스 연결 및 기본적인 쿼리 실행을 테스트합니다.
MariaDB 패키지 대신 PyMySQL만을 사용하여 호환성 문제를 우회합니다.
"""

import sys
import os
from dotenv import load_dotenv

# .env 파일 로드
load_dotenv()
import time
import logging
from pathlib import Path
from typing import Any, Dict, List, Optional, Tuple

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
    "host": "211.248.190.46",
    "user": "hermes",
    "password": os.getenv("DB_PASSWORD", ""),
    "database": "hermes",
    "charset": "utf8mb4",
    "cursorclass": DictCursor
}

class PyMySQLTester:
    """PyMySQL 테스트 클래스"""
    
    def __init__(self, config: Dict[str, Any]):
        """
        테스터 클래스 초기화
        
        Args:
            config (Dict[str, Any]): 데이터베이스 연결 설정
        """
        self.config = config
        self.connection = None
        logger.info("PyMySQL 테스터 초기화 완료")
    
    def connect(self) -> bool:
        """
        데이터베이스 연결
        
        Returns:
            bool: 연결 성공 여부
        """
        try:
            self.connection = pymysql.connect(**self.config)
            logger.info(f"데이터베이스 '{self.config['database']}'에 성공적으로 연결")
            return True
        except pymysql.Error as e:
            logger.error(f"데이터베이스 연결 실패: {str(e)}")
            return False
    
    def close(self) -> None:
        """데이터베이스 연결 종료"""
        if self.connection and self.connection.open:
            self.connection.close()
            logger.info("데이터베이스 연결 종료")
    
    def test_simple_query(self) -> bool:
        """
        간단한 쿼리 테스트
        
        Returns:
            bool: 테스트 성공 여부
        """
        if not self.connection or not self.connection.open:
            logger.error("데이터베이스 연결이 없습니다")
            return False
        
        try:
            # 테이블 목록 조회
            with self.connection.cursor() as cursor:
                cursor.execute("SHOW TABLES")
                tables = cursor.fetchall()
                table_names = [list(table.values())[0] for table in tables]
                logger.info(f"데이터베이스에 {len(tables)}개의 테이블이 있습니다")
                logger.info(f"테이블 목록: {', '.join(table_names[:5])}...")
            
            # 테이블 구조 조회
            if tables:
                first_table = list(tables[0].values())[0]
                with self.connection.cursor() as cursor:
                    cursor.execute(f"DESCRIBE {first_table}")
                    columns = cursor.fetchall()
                    logger.info(f"테이블 '{first_table}'의 구조:")
                    for column in columns[:5]:
                        logger.info(f"  - {column['Field']} ({column['Type']})")
            
            return True
        except pymysql.Error as e:
            logger.error(f"쿼리 실행 중 오류 발생: {str(e)}")
            return False
    
    def test_complex_query(self) -> bool:
        """
        복잡한 쿼리 테스트
        
        Returns:
            bool: 테스트 성공 여부
        """
        if not self.connection or not self.connection.open:
            logger.error("데이터베이스 연결이 없습니다")
            return False
        
        try:
            # JOIN을 사용한 복잡한 쿼리
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
            
            with self.connection.cursor() as cursor:
                cursor.execute(complex_query)
                results = cursor.fetchall()
                
                logger.info(f"복잡한 쿼리 결과: {len(results)}개의 행")
                for row in results:
                    logger.info(f"플레이어: ID={row['id']}, 이름={row.get('name', 'N/A')}, "
                              f"계정={row.get('account', 'N/A')}, "
                              f"연락처 수={row['contact_count']}")
            
            return True
        except pymysql.Error as e:
            logger.error(f"복잡한 쿼리 실행 중 오류 발생: {str(e)}")
            return False
    
    def test_transaction(self) -> bool:
        """
        트랜잭션 테스트
        
        Returns:
            bool: 테스트 성공 여부
        """
        if not self.connection or not self.connection.open:
            logger.error("데이터베이스 연결이 없습니다")
            return False
        
        try:
            # 자동 커밋 비활성화
            self.connection.autocommit(False)
            
            # 테스트용 임시 테이블 생성
            with self.connection.cursor() as cursor:
                # 기존 테이블이 있으면 삭제
                cursor.execute("DROP TABLE IF EXISTS pymysql_test")
                
                # 새 테이블 생성
                cursor.execute("""
                CREATE TABLE pymysql_test (
                    id INT AUTO_INCREMENT PRIMARY KEY,
                    name VARCHAR(100) NOT NULL,
                    value INT,
                    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
                )
                """)
                
                logger.info("테스트용 임시 테이블 생성 완료")
            
            # 트랜잭션 시작
            try:
                # 데이터 삽입
                with self.connection.cursor() as cursor:
                    cursor.execute(
                        "INSERT INTO pymysql_test (name, value) VALUES (%s, %s)",
                        ("테스트1", 100)
                    )
                    cursor.execute(
                        "INSERT INTO pymysql_test (name, value) VALUES (%s, %s)",
                        ("테스트2", 200)
                    )
                
                # 데이터 확인
                with self.connection.cursor() as cursor:
                    cursor.execute("SELECT * FROM pymysql_test")
                    results = cursor.fetchall()
                    logger.info(f"트랜잭션 내 데이터 확인: {len(results)}개의 행")
                
                # 변경 사항 커밋
                self.connection.commit()
                logger.info("트랜잭션 커밋 완료")
            except Exception as e:
                # 오류 발생 시 롤백
                self.connection.rollback()
                logger.error(f"트랜잭션 중 오류 발생, 롤백: {str(e)}")
                return False
            
            # 커밋 후 데이터 확인
            with self.connection.cursor() as cursor:
                cursor.execute("SELECT * FROM pymysql_test")
                results = cursor.fetchall()
                logger.info(f"커밋 후 데이터 확인: {len(results)}개의 행")
                for row in results:
                    logger.info(f"행: ID={row['id']}, 이름={row['name']}, 값={row['value']}")
            
            # 테스트 테이블 삭제
            with self.connection.cursor() as cursor:
                cursor.execute("DROP TABLE IF EXISTS pymysql_test")
                logger.info("테스트용 임시 테이블 삭제 완료")
            
            # 자동 커밋 다시 활성화
            self.connection.autocommit(True)
            
            return True
        except pymysql.Error as e:
            logger.error(f"트랜잭션 테스트 중 오류 발생: {str(e)}")
            # 연결 복구 시도
            try:
                self.connection.autocommit(True)
            except:
                pass
            return False
    
    def test_error_handling(self) -> bool:
        """
        오류 처리 테스트
        
        Returns:
            bool: 테스트 성공 여부
        """
        if not self.connection or not self.connection.open:
            logger.error("데이터베이스 연결이 없습니다")
            return False
        
        try:
            # 존재하지 않는 테이블에 대한 쿼리 실행
            logger.info("의도적으로 오류를 발생시키는 쿼리 실행...")
            with self.connection.cursor() as cursor:
                try:
                    cursor.execute("SELECT * FROM non_existent_table")
                    logger.error("오류가 발생하지 않았습니다 (예상치 못한 상황)")
                    return False
                except pymysql.Error as e:
                    logger.info(f"예상된 오류 발생: {str(e)}")
            
            # 구문 오류가 있는 쿼리 실행
            with self.connection.cursor() as cursor:
                try:
                    cursor.execute("SELECT * FROM players WHERE")
                    logger.error("오류가 발생하지 않았습니다 (예상치 못한 상황)")
                    return False
                except pymysql.Error as e:
                    logger.info(f"예상된 구문 오류 발생: {str(e)}")
            
            # 오류 후 연결이 여전히 유효한지 확인
            with self.connection.cursor() as cursor:
                cursor.execute("SELECT 1")
                result = cursor.fetchone()
                logger.info(f"오류 후 연결 확인: {result}")
            
            return True
        except pymysql.Error as e:
            logger.error(f"오류 처리 테스트 중 예상치 못한 오류 발생: {str(e)}")
            return False
    
    def test_retry_mechanism(self) -> bool:
        """
        재시도 메커니즘 테스트
        
        Returns:
            bool: 테스트 성공 여부
        """
        if not self.connection or not self.connection.open:
            logger.error("데이터베이스 연결이 없습니다")
            return False
        
        def execute_with_retry(query, params=None, max_attempts=3, base_delay=0.1):
            """재시도 메커니즘을 사용하여 쿼리 실행"""
            last_error = None
            
            for attempt in range(max_attempts):
                try:
                    with self.connection.cursor() as cursor:
                        if params:
                            cursor.execute(query, params)
                        else:
                            cursor.execute(query)
                        return cursor.fetchall()
                except (pymysql.OperationalError, pymysql.InternalError) as e:
                    last_error = e
                    logger.warning(f"시도 {attempt + 1} 실패: {str(e)}")
                    
                    # 마지막 시도였으면 예외 발생
                    if attempt >= max_attempts - 1:
                        break
                    
                    # 연결이 끊어졌는지 확인
                    if not self.connection.open:
                        logger.info("연결이 끊어졌습니다. 재연결 시도...")
                        self.connect()
                    
                    # 지수 백오프
                    delay = base_delay * (2 ** attempt)
                    logger.info(f"{delay:.2f}초 후 재시도...")
                    time.sleep(delay)
            
            raise last_error
        
        try:
            # 정상 쿼리 실행 (재시도 필요 없음)
            logger.info("정상 쿼리 실행 (재시도 필요 없음)...")
            result = execute_with_retry("SELECT COUNT(*) AS count FROM players")
            logger.info(f"쿼리 결과: {result[0]['count']} 명의 플레이어")
            
            # 연결 끊김 시뮬레이션
            logger.info("연결 끊김 시뮬레이션...")
            old_connection = self.connection
            self.connection.close()
            
            # 끊긴 연결로 쿼리 시도
            try:
                execute_with_retry("SELECT 1")
                logger.info("연결 재시도 성공")
            except pymysql.Error as e:
                logger.error(f"연결 재시도 실패: {str(e)}")
                return False
            
            # 새 연결 확인
            if self.connection == old_connection:
                logger.error("연결이 재생성되지 않았습니다")
                return False
            
            return True
        except pymysql.Error as e:
            logger.error(f"재시도 메커니즘 테스트 중 오류 발생: {str(e)}")
            return False

def main():
    """메인 함수"""
    logger.info("PyMySQL 테스트 시작")
    
    tester = PyMySQLTester(DB_CONFIG)
    
    # 테스트 실행
    try:
        # 연결 테스트
        if not tester.connect():
            logger.error("데이터베이스 연결 테스트 실패")
            return 1
        
        # 간단한 쿼리 테스트
        logger.info("\n--- 간단한 쿼리 테스트 ---")
        if not tester.test_simple_query():
            logger.error("간단한 쿼리 테스트 실패")
            return 1
        
        # 복잡한 쿼리 테스트
        logger.info("\n--- 복잡한 쿼리 테스트 ---")
        if not tester.test_complex_query():
            logger.error("복잡한 쿼리 테스트 실패")
            return 1
        
        # 트랜잭션 테스트
        logger.info("\n--- 트랜잭션 테스트 ---")
        if not tester.test_transaction():
            logger.error("트랜잭션 테스트 실패")
            return 1
        
        # 오류 처리 테스트
        logger.info("\n--- 오류 처리 테스트 ---")
        if not tester.test_error_handling():
            logger.error("오류 처리 테스트 실패")
            return 1
        
        # 재시도 메커니즘 테스트
        logger.info("\n--- 재시도 메커니즘 테스트 ---")
        if not tester.test_retry_mechanism():
            logger.error("재시도 메커니즘 테스트 실패")
            return 1
        
        logger.info("\n모든 테스트가 성공적으로 완료되었습니다!")
        return 0
    except Exception as e:
        logger.error(f"테스트 중 예상치 못한 오류 발생: {str(e)}")
        return 1
    finally:
        # 연결 종료
        tester.close()

if __name__ == "__main__":
    sys.exit(main())
