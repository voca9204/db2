"""
데이터베이스 연결 모듈

이 모듈은 데이터베이스 연결 및 쿼리 실행을 관리합니다.
연결 풀, 재시도 메커니즘, 오류 처리 등의 기능을 제공합니다.
"""

import time
import random
import logging
from typing import Any, Dict, List, Optional, Tuple, Union
import pymysql
from pymysql.cursors import DictCursor

from ..config.database import DatabaseConfig

# 로깅 설정
logger = logging.getLogger(__name__)

class DatabaseConnection:
    """데이터베이스 연결 관리 클래스"""
    
    def __init__(self, config_path: Optional[str] = None):
        """
        DatabaseConnection 클래스 초기화
        
        Args:
            config_path (str, optional): 설정 파일 경로. 기본값은 None.
        """
        self.config = DatabaseConfig(config_path)
        self.connection = None
        self.pool = None
        
        logger.info("Database connection initialized with config: %s", str(self.config))
    
    def connect(self) -> None:
        """
        데이터베이스에 연결
        
        Raises:
            pymysql.Error: 연결 실패 시 발생
        """
        try:
            # 기존 연결이 있으면 닫기
            if self.connection and self.connection.open:
                self.connection.close()
            
            # 새 연결 생성
            self.connection = pymysql.connect(
                **self.config.get_connection_params(),
                cursorclass=DictCursor,
                autocommit=True,
            )
            
            logger.info("Successfully connected to database %s at %s",
                       self.config.config["database"],
                       self.config.config["host"])
        except pymysql.Error as e:
            logger.error("Failed to connect to database: %s", str(e))
            raise
    
    def _get_connection(self) -> pymysql.connections.Connection:
        """
        현재 연결 반환. 연결이 없으면 새로 생성.
        
        Returns:
            pymysql.connections.Connection: 데이터베이스 연결 객체
        """
        if not self.connection or not self.connection.open:
            self.connect()
        
        return self.connection
    
    def _execute_with_retry(self, cursor, query: str, params: Optional[Tuple] = None) -> Any:
        """
        재시도 메커니즘을 사용하여 쿼리 실행
        
        Args:
            cursor: 데이터베이스 커서
            query (str): 실행할 SQL 쿼리
            params (Tuple, optional): 쿼리 파라미터. 기본값은 None.
            
        Returns:
            Any: 쿼리 실행 결과
            
        Raises:
            pymysql.Error: 모든 재시도 실패 시 발생
        """
        retry_config = self.config.get_retry_config()
        max_attempts = retry_config["max_attempts"]
        base_delay = retry_config["base_delay"]
        max_delay = retry_config["max_delay"]
        
        last_error = None
        
        for attempt in range(max_attempts):
            try:
                if params:
                    cursor.execute(query, params)
                else:
                    cursor.execute(query)
                return cursor
            except (pymysql.OperationalError, pymysql.InternalError) as e:
                last_error = e
                
                # 마지막 시도에서 실패하면 예외 발생
                if attempt >= max_attempts - 1:
                    logger.error("Query failed after %d attempts: %s", max_attempts, str(e))
                    raise
                
                # 지수 백오프 계산 (랜덤 지터 포함)
                delay = min(base_delay * (2 ** attempt) + random.uniform(0, 0.1), max_delay)
                
                logger.warning("Query attempt %d failed: %s. Retrying in %.2f seconds...",
                              attempt + 1, str(e), delay)
                
                time.sleep(delay)
                
                # 연결 재설정
                if not self.connection.open:
                    self.connect()
                    cursor = self.connection.cursor()
        
        # 여기까지 오면 모든 재시도가 실패한 것
        raise last_error
    
    def execute(self, query: str, params: Optional[Tuple] = None) -> int:
        """
        SQL 쿼리 실행 (INSERT, UPDATE, DELETE)
        
        Args:
            query (str): 실행할 SQL 쿼리
            params (Tuple, optional): 쿼리 파라미터. 기본값은 None.
            
        Returns:
            int: 영향받은 행 수
            
        Raises:
            pymysql.Error: 쿼리 실행 실패 시 발생
        """
        connection = self._get_connection()
        
        with connection.cursor() as cursor:
            try:
                cursor = self._execute_with_retry(cursor, query, params)
                affected_rows = cursor.rowcount
                
                logger.debug("Query executed successfully. Affected rows: %d", affected_rows)
                return affected_rows
            except pymysql.Error as e:
                logger.error("Failed to execute query: %s", str(e))
                raise
    
    def query(self, query: str, params: Optional[Tuple] = None) -> List[Dict[str, Any]]:
        """
        SQL 쿼리 실행 및 결과 반환 (SELECT)
        
        Args:
            query (str): 실행할 SQL 쿼리
            params (Tuple, optional): 쿼리 파라미터. 기본값은 None.
            
        Returns:
            List[Dict[str, Any]]: 쿼리 결과 (딕셔너리 리스트)
            
        Raises:
            pymysql.Error: 쿼리 실행 실패 시 발생
        """
        connection = self._get_connection()
        
        with connection.cursor() as cursor:
            try:
                cursor = self._execute_with_retry(cursor, query, params)
                results = cursor.fetchall()
                
                logger.debug("Query returned %d rows", len(results))
                return results
            except pymysql.Error as e:
                logger.error("Failed to execute query: %s", str(e))
                raise
    
    def query_one(self, query: str, params: Optional[Tuple] = None) -> Optional[Dict[str, Any]]:
        """
        SQL 쿼리 실행 및 단일 결과 반환
        
        Args:
            query (str): 실행할 SQL 쿼리
            params (Tuple, optional): 쿼리 파라미터. 기본값은 None.
            
        Returns:
            Optional[Dict[str, Any]]: 쿼리 결과 (단일 딕셔너리, 없으면 None)
            
        Raises:
            pymysql.Error: 쿼리 실행 실패 시 발생
        """
        connection = self._get_connection()
        
        with connection.cursor() as cursor:
            try:
                cursor = self._execute_with_retry(cursor, query, params)
                result = cursor.fetchone()
                
                if result:
                    logger.debug("Query returned 1 row")
                else:
                    logger.debug("Query returned no rows")
                
                return result
            except pymysql.Error as e:
                logger.error("Failed to execute query: %s", str(e))
                raise
    
    def close(self) -> None:
        """
        데이터베이스 연결 종료
        """
        if self.connection and self.connection.open:
            self.connection.close()
            logger.info("Database connection closed")
    
    def __enter__(self) -> 'DatabaseConnection':
        """
        컨텍스트 매니저 진입
        
        Returns:
            DatabaseConnection: 현재 객체
        """
        return self
    
    def __exit__(self, exc_type, exc_val, exc_tb) -> None:
        """
        컨텍스트 매니저 종료
        
        Args:
            exc_type: 예외 타입
            exc_val: 예외 값
            exc_tb: 예외 트레이스백
        """
        self.close()
