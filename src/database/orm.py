"""
SQLAlchemy 기반 ORM 모듈

이 모듈은 SQLAlchemy를 사용하여 MariaDB 데이터베이스를 위한 ORM 레이어를 제공합니다.
모델 정의, 세션 관리, 쿼리 빌더 등의 기능을 포함합니다.
"""

import logging
from typing import Any, Dict, List, Optional, Type, TypeVar, Generic, Union, Callable
from contextlib import contextmanager

from sqlalchemy import create_engine, MetaData, Column, Table, inspect, select, update, delete, func, text
from sqlalchemy.orm import sessionmaker, declarative_base, Session
from sqlalchemy.ext.declarative import declared_attr
from sqlalchemy.exc import SQLAlchemyError

from ..config.database import DatabaseConfig

# 로깅 설정
logger = logging.getLogger(__name__)

# 기본 모델 클래스 생성
Base = declarative_base()

# 제네릭 타입 변수 (모델 클래스 타입을 위한)
T = TypeVar('T', bound=Base)

class OrmError(Exception):
    """ORM 관련 오류의 기본 클래스"""
    pass

class ModelError(OrmError):
    """모델 관련 오류"""
    pass

class QueryError(OrmError):
    """쿼리 실행 오류"""
    pass

class DatabaseSession:
    """SQLAlchemy 세션 관리 클래스"""
    
    def __init__(self, config_path: Optional[str] = None, echo: bool = False):
        """
        DatabaseSession 클래스 초기화
        
        Args:
            config_path (str, optional): 설정 파일 경로. 기본값은 None.
            echo (bool, optional): SQL 쿼리 로깅 활성화 여부. 기본값은 False.
        """
        self.config = DatabaseConfig(config_path)
        self.engine = self._create_engine(echo)
        self.Session = sessionmaker(bind=self.engine)
        self.metadata = MetaData()
        
        logger.info("SQLAlchemy ORM initialized")
    
    def _create_engine(self, echo: bool) -> Any:
        """
        SQLAlchemy 엔진 생성
        
        Args:
            echo (bool): SQL 쿼리 로깅 활성화 여부
            
        Returns:
            sqlalchemy.engine.Engine: SQLAlchemy 엔진
        """
        conn_params = self.config.get_connection_params()
        
        # MariaDB 연결 문자열 생성
        conn_str = (
            f"mariadb+mariadbconnector://{conn_params['user']}:{conn_params['password']}"
            f"@{conn_params['host']}:{conn_params['port']}/{conn_params['database']}"
        )
        
        # 풀 설정
        pool_config = self.config.get_pool_config()
        
        engine = create_engine(
            conn_str,
            echo=echo,
            pool_size=pool_config["size"],
            pool_timeout=pool_config["timeout"],
            pool_pre_ping=True,
            pool_recycle=3600  # 1시간마다 연결 재활용
        )
        
        return engine
    
    @contextmanager
    def session_scope(self) -> Session:
        """
        세션 컨텍스트 매니저
        
        Yields:
            sqlalchemy.orm.Session: 데이터베이스 세션
            
        Raises:
            QueryError: 세션 작업 중 오류 발생 시
        """
        session = self.Session()
        try:
            yield session
            session.commit()
        except SQLAlchemyError as e:
            session.rollback()
            error_msg = f"Session error: {str(e)}"
            logger.error(error_msg)
            raise QueryError(error_msg) from e
        finally:
            session.close()
    
    def create_tables(self) -> None:
        """
        모든 정의된 테이블 생성
        
        Raises:
            ModelError: 테이블 생성 실패 시 발생
        """
        try:
            Base.metadata.create_all(self.engine)
            logger.info("All tables created successfully")
        except SQLAlchemyError as e:
            error_msg = f"Failed to create tables: {str(e)}"
            logger.error(error_msg)
            raise ModelError(error_msg) from e
    
    def get_tables(self) -> List[str]:
        """
        데이터베이스의 모든 테이블 이름 조회
        
        Returns:
            List[str]: 테이블 이름 목록
            
        Raises:
            ModelError: 테이블 조회 실패 시 발생
        """
        try:
            inspector = inspect(self.engine)
            tables = inspector.get_table_names()
            logger.debug("Retrieved %d tables from database", len(tables))
            return tables
        except SQLAlchemyError as e:
            error_msg = f"Failed to get tables: {str(e)}"
            logger.error(error_msg)
            raise ModelError(error_msg) from e

class Repository(Generic[T]):
    """
    제네릭 Repository 클래스
    
    모델 클래스에 대한 CRUD 작업을 제공합니다.
    """
    
    def __init__(self, db_session: DatabaseSession, model_class: Type[T]):
        """
        Repository 클래스 초기화
        
        Args:
            db_session (DatabaseSession): 데이터베이스 세션 관리자
            model_class (Type[T]): 이 Repository가 다룰 모델 클래스
        """
        self.db_session = db_session
        self.model_class = model_class
        logger.info("Repository initialized for model %s", model_class.__name__)
    
    def create(self, **kwargs) -> T:
        """
        새 모델 인스턴스 생성 및 저장
        
        Args:
            **kwargs: 모델 필드와 값
            
        Returns:
            T: 생성된 모델 인스턴스
            
        Raises:
            QueryError: 생성 실패 시 발생
        """
        try:
            with self.db_session.session_scope() as session:
                instance = self.model_class(**kwargs)
                session.add(instance)
                session.flush()  # ID 등의 자동 생성 필드 값을 얻기 위해
                session.refresh(instance)
                logger.debug("Created new %s instance", self.model_class.__name__)
                return instance
        except SQLAlchemyError as e:
            error_msg = f"Failed to create {self.model_class.__name__}: {str(e)}"
            logger.error(error_msg)
            raise QueryError(error_msg) from e
    
    def get_by_id(self, id_value: Any) -> Optional[T]:
        """
        ID로 모델 인스턴스 조회
        
        Args:
            id_value (Any): 찾을 ID 값
            
        Returns:
            Optional[T]: 찾은 인스턴스 또는 None
            
        Raises:
            QueryError: 조회 실패 시 발생
        """
        try:
            with self.db_session.session_scope() as session:
                instance = session.get(self.model_class, id_value)
                if instance:
                    logger.debug("Found %s instance with ID %s", 
                                self.model_class.__name__, str(id_value))
                else:
                    logger.debug("No %s instance found with ID %s", 
                                self.model_class.__name__, str(id_value))
                return instance
        except SQLAlchemyError as e:
            error_msg = f"Failed to get {self.model_class.__name__} by ID: {str(e)}"
            logger.error(error_msg)
            raise QueryError(error_msg) from e
    
    def get_all(self) -> List[T]:
        """
        모든 모델 인스턴스 조회
        
        Returns:
            List[T]: 모델 인스턴스 목록
            
        Raises:
            QueryError: 조회 실패 시 발생
        """
        try:
            with self.db_session.session_scope() as session:
                instances = session.query(self.model_class).all()
                logger.debug("Retrieved %d %s instances", 
                            len(instances), self.model_class.__name__)
                return instances
        except SQLAlchemyError as e:
            error_msg = f"Failed to get all {self.model_class.__name__}: {str(e)}"
            logger.error(error_msg)
            raise QueryError(error_msg) from e
    
    def find_by(self, **kwargs) -> List[T]:
        """
        조건에 맞는 모델 인스턴스 조회
        
        Args:
            **kwargs: 검색 조건 (필드=값)
            
        Returns:
            List[T]: 조건에 맞는 모델 인스턴스 목록
            
        Raises:
            QueryError: 조회 실패 시 발생
        """
        try:
            with self.db_session.session_scope() as session:
                query = session.query(self.model_class)
                for key, value in kwargs.items():
                    query = query.filter(getattr(self.model_class, key) == value)
                
                instances = query.all()
                logger.debug("Found %d %s instances matching criteria", 
                            len(instances), self.model_class.__name__)
                return instances
        except SQLAlchemyError as e:
            error_msg = f"Failed to find {self.model_class.__name__} by criteria: {str(e)}"
            logger.error(error_msg)
            raise QueryError(error_msg) from e
    
    def find_one_by(self, **kwargs) -> Optional[T]:
        """
        조건에 맞는 첫 번째 모델 인스턴스 조회
        
        Args:
            **kwargs: 검색 조건 (필드=값)
            
        Returns:
            Optional[T]: 조건에 맞는 모델 인스턴스 또는 None
            
        Raises:
            QueryError: 조회 실패 시 발생
        """
        try:
            with self.db_session.session_scope() as session:
                query = session.query(self.model_class)
                for key, value in kwargs.items():
                    query = query.filter(getattr(self.model_class, key) == value)
                
                instance = query.first()
                if instance:
                    logger.debug("Found %s instance matching criteria", 
                                self.model_class.__name__)
                else:
                    logger.debug("No %s instance found matching criteria", 
                                self.model_class.__name__)
                return instance
        except SQLAlchemyError as e:
            error_msg = f"Failed to find one {self.model_class.__name__} by criteria: {str(e)}"
            logger.error(error_msg)
            raise QueryError(error_msg) from e
    
    def update(self, id_value: Any, **kwargs) -> Optional[T]:
        """
        ID로 모델 인스턴스 업데이트
        
        Args:
            id_value (Any): 업데이트할 인스턴스의 ID
            **kwargs: 업데이트할 필드와 값
            
        Returns:
            Optional[T]: 업데이트된 인스턴스 또는 None
            
        Raises:
            QueryError: 업데이트 실패 시 발생
        """
        try:
            with self.db_session.session_scope() as session:
                instance = session.get(self.model_class, id_value)
                if not instance:
                    logger.debug("No %s instance found with ID %s for update", 
                                self.model_class.__name__, str(id_value))
                    return None
                
                for key, value in kwargs.items():
                    setattr(instance, key, value)
                
                session.flush()
                logger.debug("Updated %s instance with ID %s", 
                            self.model_class.__name__, str(id_value))
                return instance
        except SQLAlchemyError as e:
            error_msg = f"Failed to update {self.model_class.__name__}: {str(e)}"
            logger.error(error_msg)
            raise QueryError(error_msg) from e
    
    def delete(self, id_value: Any) -> bool:
        """
        ID로 모델 인스턴스 삭제
        
        Args:
            id_value (Any): 삭제할 인스턴스의 ID
            
        Returns:
            bool: 삭제 성공 여부
            
        Raises:
            QueryError: 삭제 실패 시 발생
        """
        try:
            with self.db_session.session_scope() as session:
                instance = session.get(self.model_class, id_value)
                if not instance:
                    logger.debug("No %s instance found with ID %s for deletion", 
                                self.model_class.__name__, str(id_value))
                    return False
                
                session.delete(instance)
                logger.debug("Deleted %s instance with ID %s", 
                            self.model_class.__name__, str(id_value))
                return True
        except SQLAlchemyError as e:
            error_msg = f"Failed to delete {self.model_class.__name__}: {str(e)}"
            logger.error(error_msg)
            raise QueryError(error_msg) from e
    
    def count(self) -> int:
        """
        모델 인스턴스 총 개수 조회
        
        Returns:
            int: 총 개수
            
        Raises:
            QueryError: 조회 실패 시 발생
        """
        try:
            with self.db_session.session_scope() as session:
                count = session.query(func.count(self.model_class.id)).scalar()
                logger.debug("Counted %d %s instances", 
                            count, self.model_class.__name__)
                return count
        except SQLAlchemyError as e:
            error_msg = f"Failed to count {self.model_class.__name__}: {str(e)}"
            logger.error(error_msg)
            raise QueryError(error_msg) from e
    
    def execute_custom_query(self, query_func: Callable[[Session], List[T]]) -> List[T]:
        """
        사용자 정의 쿼리 실행
        
        Args:
            query_func (Callable[[Session], List[T]]): 세션을 매개변수로 받아 쿼리를 실행하는 함수
            
        Returns:
            List[T]: 쿼리 결과
            
        Raises:
            QueryError: 쿼리 실행 실패 시 발생
        """
        try:
            with self.db_session.session_scope() as session:
                result = query_func(session)
                logger.debug("Executed custom query for %s", 
                            self.model_class.__name__)
                return result
        except SQLAlchemyError as e:
            error_msg = f"Failed to execute custom query for {self.model_class.__name__}: {str(e)}"
            logger.error(error_msg)
            raise QueryError(error_msg) from e
