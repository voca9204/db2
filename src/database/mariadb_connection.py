"""
MariaDB 전용 연결 모듈

이 모듈은 MariaDB에 최적화된 데이터베이스 연결 및 쿼리 실행을 관리합니다.
MariaDB 전용 기능, 연결 풀링, 고급 쿼리 기능을 제공합니다.
"""

import time
import random
import logging
from typing import Any, Dict, List, Optional, Tuple, Union, Generator
import mariadb
from contextlib import contextmanager

from ..config.database import DatabaseConfig

# 로깅 설정
logger = logging.getLogger(__name__)

class DatabaseError(Exception):
    """데이터베이스 관련 오류의 기본 클래스"""
    pass

class ConnectionError(DatabaseError):
    """데이터베이스 연결 오류"""
    pass

class QueryError(DatabaseError):
    """쿼리 실행 오류"""
    pass

class MariaDBConnection:
    """MariaDB 연결 관리 클래스"""
    
    def __init__(self, config_path: Optional[str] = None):
        """
        MariaDBConnection 클래스 초기화
        
        Args:
            config_path (str, optional): 설정 파일 경로. 기본값은 None.
        """
        self.config = DatabaseConfig(config_path)
        self.connection_pool = None
        self._create_pool()
        
        logger.info("MariaDB connection initialized with config: %s", str(self.config))
    
    def _create_pool(self) -> None:
        """
        MariaDB 연결 풀 생성
        
        Raises:
            ConnectionError: 연결 풀 생성 실패 시 발생
        """
        try:
            pool_config = self.config.get_pool_config()
            conn_params = self._get_connection_params()
            
            self.connection_pool = mariadb.ConnectionPool(
                pool_name="mariadb_pool",
                pool_size=pool_config["size"],
                pool_reset_connection=True,
                **conn_params
            )
            
            logger.info("Created MariaDB connection pool with size %d", pool_config["size"])
        except mariadb.Error as e:
            error_msg = f"Failed to create connection pool: {str(e)}"
            logger.error(error_msg)
            raise ConnectionError(error_msg) from e
    
    def _get_connection_params(self) -> Dict[str, Any]:
        """
        MariaDB 연결 파라미터 준비
        
        Returns:
            Dict[str, Any]: 연결 파라미터
        """
        conn_params = self.config.get_connection_params()
        
        # pymysql과 mariadb 패키지 간 파라미터 차이 조정
        if "charset" in conn_params:
            conn_params["charset"] = conn_params.pop("charset")
        
        return conn_params
    
    @contextmanager
    def get_connection(self) -> Generator[mariadb.Connection, None, None]:
        """
        연결 풀에서 연결 획득 (컨텍스트 매니저)
        
        Yields:
            mariadb.Connection: 데이터베이스 연결
            
        Raises:
            ConnectionError: 연결 획득 실패 시 발생
        """
        conn = None
        retry_config = self.config.get_retry_config()
        max_attempts = retry_config["max_attempts"]
        base_delay = retry_config["base_delay"]
        max_delay = retry_config["max_delay"]
        
        for attempt in range(max_attempts):
            try:
                conn = self.connection_pool.get_connection()
                break
            except mariadb.PoolError as e:
                if attempt >= max_attempts - 1:
                    error_msg = f"Failed to get connection from pool after {max_attempts} attempts: {str(e)}"
                    logger.error(error_msg)
                    raise ConnectionError(error_msg) from e
                
                delay = min(base_delay * (2 ** attempt) + random.uniform(0, 0.1), max_delay)
                logger.warning("Connection attempt %d failed: %s. Retrying in %.2f seconds...",
                              attempt + 1, str(e), delay)
                time.sleep(delay)
        
        if conn is None:
            error_msg = "Failed to get connection from pool: conn is None"
            logger.error(error_msg)
            raise ConnectionError(error_msg)
        
        try:
            yield conn
        except mariadb.Error as e:
            error_msg = f"Database error occurred: {str(e)}"
            logger.error(error_msg)
            raise QueryError(error_msg) from e
        finally:
            if conn:
                conn.close()
    
    def execute(self, query: str, params: Optional[Union[Tuple, Dict]] = None) -> int:
        """
        SQL 쿼리 실행 (INSERT, UPDATE, DELETE)
        
        Args:
            query (str): 실행할 SQL 쿼리
            params (Union[Tuple, Dict], optional): 쿼리 파라미터. 기본값은 None.
            
        Returns:
            int: 영향받은 행 수
            
        Raises:
            QueryError: 쿼리 실행 실패 시 발생
        """
        with self.get_connection() as conn:
            try:
                cursor = conn.cursor()
                start_time = time.time()
                
                if params:
                    cursor.execute(query, params)
                else:
                    cursor.execute(query)
                
                affected_rows = cursor.rowcount
                execution_time = time.time() - start_time
                
                logger.debug("Query executed in %.4f seconds. Affected rows: %d",
                            execution_time, affected_rows)
                
                conn.commit()
                return affected_rows
            except mariadb.Error as e:
                conn.rollback()
                error_msg = f"Failed to execute query: {str(e)}"
                logger.error(error_msg)
                raise QueryError(error_msg) from e
            finally:
                if 'cursor' in locals():
                    cursor.close()
    
    def query(self, query: str, params: Optional[Union[Tuple, Dict]] = None) -> List[Dict[str, Any]]:
        """
        SQL 쿼리 실행 및 결과 반환 (SELECT)
        
        Args:
            query (str): 실행할 SQL 쿼리
            params (Union[Tuple, Dict], optional): 쿼리 파라미터. 기본값은 None.
            
        Returns:
            List[Dict[str, Any]]: 쿼리 결과 (딕셔너리 리스트)
            
        Raises:
            QueryError: 쿼리 실행 실패 시 발생
        """
        with self.get_connection() as conn:
            try:
                cursor = conn.cursor(dictionary=True)
                start_time = time.time()
                
                if params:
                    cursor.execute(query, params)
                else:
                    cursor.execute(query)
                
                results = cursor.fetchall()
                execution_time = time.time() - start_time
                
                logger.debug("Query executed in %.4f seconds. Returned %d rows",
                            execution_time, len(results))
                
                return results
            except mariadb.Error as e:
                error_msg = f"Failed to execute query: {str(e)}"
                logger.error(error_msg)
                raise QueryError(error_msg) from e
            finally:
                if 'cursor' in locals():
                    cursor.close()
    
    def query_one(self, query: str, params: Optional[Union[Tuple, Dict]] = None) -> Optional[Dict[str, Any]]:
        """
        SQL 쿼리 실행 및 단일 결과 반환
        
        Args:
            query (str): 실행할 SQL 쿼리
            params (Union[Tuple, Dict], optional): 쿼리 파라미터. 기본값은 None.
            
        Returns:
            Optional[Dict[str, Any]]: 쿼리 결과 (단일 딕셔너리, 없으면 None)
            
        Raises:
            QueryError: 쿼리 실행 실패 시 발생
        """
        with self.get_connection() as conn:
            try:
                cursor = conn.cursor(dictionary=True)
                start_time = time.time()
                
                if params:
                    cursor.execute(query, params)
                else:
                    cursor.execute(query)
                
                result = cursor.fetchone()
                execution_time = time.time() - start_time
                
                if result:
                    logger.debug("Query executed in %.4f seconds. Returned 1 row", execution_time)
                else:
                    logger.debug("Query executed in %.4f seconds. Returned no rows", execution_time)
                
                return result
            except mariadb.Error as e:
                error_msg = f"Failed to execute query: {str(e)}"
                logger.error(error_msg)
                raise QueryError(error_msg) from e
            finally:
                if 'cursor' in locals():
                    cursor.close()
    
    def execute_batch(self, query: str, params_list: List[Union[Tuple, Dict]]) -> int:
        """
        배치 쿼리 실행 (INSERT, UPDATE, DELETE)
        
        Args:
            query (str): 실행할 SQL 쿼리
            params_list (List[Union[Tuple, Dict]]): 쿼리 파라미터 리스트
            
        Returns:
            int: 영향받은 행 수
            
        Raises:
            QueryError: 쿼리 실행 실패 시 발생
        """
        with self.get_connection() as conn:
            try:
                cursor = conn.cursor()
                start_time = time.time()
                affected_rows = 0
                
                conn.autocommit = False
                for params in params_list:
                    cursor.execute(query, params)
                    affected_rows += cursor.rowcount
                
                conn.commit()
                execution_time = time.time() - start_time
                
                logger.debug("Batch query executed in %.4f seconds. Affected rows: %d",
                            execution_time, affected_rows)
                
                return affected_rows
            except mariadb.Error as e:
                conn.rollback()
                error_msg = f"Failed to execute batch query: {str(e)}"
                logger.error(error_msg)
                raise QueryError(error_msg) from e
            finally:
                if 'cursor' in locals():
                    cursor.close()
                conn.autocommit = True
    
    def execute_script(self, script: str) -> None:
        """
        SQL 스크립트 실행 (여러 쿼리)
        
        Args:
            script (str): 실행할 SQL 스크립트
            
        Raises:
            QueryError: 스크립트 실행 실패 시 발생
        """
        with self.get_connection() as conn:
            try:
                cursor = conn.cursor()
                start_time = time.time()
                
                conn.autocommit = False
                
                # 스크립트를 개별 쿼리로 분할하고 실행
                queries = script.split(';')
                for query in queries:
                    query = query.strip()
                    if query:  # 비어있지 않은 쿼리만 실행
                        cursor.execute(query)
                
                conn.commit()
                execution_time = time.time() - start_time
                
                logger.debug("Script executed in %.4f seconds", execution_time)
            except mariadb.Error as e:
                conn.rollback()
                error_msg = f"Failed to execute script: {str(e)}"
                logger.error(error_msg)
                raise QueryError(error_msg) from e
            finally:
                if 'cursor' in locals():
                    cursor.close()
                conn.autocommit = True
    
    def close_pool(self) -> None:
        """
        연결 풀 종료
        """
        if self.connection_pool:
            self.connection_pool.close()
            logger.info("MariaDB connection pool closed")
    
    def __enter__(self) -> 'MariaDBConnection':
        """
        컨텍스트 매니저 진입
        
        Returns:
            MariaDBConnection: 현재 객체
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
        self.close_pool()
