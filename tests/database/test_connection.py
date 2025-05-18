"""
데이터베이스 연결 모듈 테스트
"""

import unittest
from unittest.mock import patch, MagicMock

from src.config.database import DatabaseConfig
from src.database.connection import DatabaseConnection

class TestDatabaseConfig(unittest.TestCase):
    """DatabaseConfig 클래스 테스트"""
    
    @patch('src.config.database.load_dotenv')
    @patch('src.config.database.os.getenv')
    def test_load_config(self, mock_getenv, mock_load_dotenv):
        """설정 로드 테스트"""
        # 환경 변수 모의 설정
        mock_getenv.side_effect = lambda key, default: {
            "DB_HOST": "test_host",
            "DB_PORT": "1234",
            "DB_NAME": "test_db",
            "DB_USER": "test_user",
            "DB_PASSWORD": "test_password",
        }.get(key, default)
        
        # 설정 로드
        config = DatabaseConfig("test_path")
        
        # load_dotenv 호출 확인
        mock_load_dotenv.assert_called_once_with("test_path")
        
        # 설정 값 확인
        self.assertEqual(config.config["host"], "test_host")
        self.assertEqual(config.config["port"], 1234)
        self.assertEqual(config.config["database"], "test_db")
        self.assertEqual(config.config["user"], "test_user")
        self.assertEqual(config.config["password"], "test_password")
    
    @patch('src.config.database.load_dotenv')
    def test_get_connection_params(self, mock_load_dotenv):
        """연결 파라미터 반환 테스트"""
        # 테스트 데이터
        test_config = {
            "host": "test_host",
            "port": 1234,
            "database": "test_db",
            "user": "test_user",
            "password": "test_password",
            "charset": "utf8",
            "connection_pool_size": 10,
            "connection_timeout": 60,
            "retry_max_attempts": 5,
            "retry_base_delay": 0.2,
            "retry_max_delay": 5.0,
        }
        
        # 설정 객체 생성 및 내부 설정 직접 설정
        config = DatabaseConfig()
        config.config = test_config
        
        # 연결 파라미터 가져오기
        params = config.get_connection_params()
        
        # 파라미터 확인
        self.assertEqual(params["host"], "test_host")
        self.assertEqual(params["port"], 1234)
        self.assertEqual(params["database"], "test_db")
        self.assertEqual(params["user"], "test_user")
        self.assertEqual(params["password"], "test_password")
        self.assertEqual(params["charset"], "utf8")
        
        # 연결 파라미터에 불필요한 값이 포함되어 있지 않은지 확인
        self.assertNotIn("connection_pool_size", params)
        self.assertNotIn("connection_timeout", params)
        self.assertNotIn("retry_max_attempts", params)

class TestDatabaseConnection(unittest.TestCase):
    """DatabaseConnection 클래스 테스트"""
    
    @patch('src.database.connection.DatabaseConfig')
    @patch('src.database.connection.pymysql.connect')
    def test_connect(self, mock_connect, mock_config_class):
        """데이터베이스 연결 테스트"""
        # 설정 모의 객체 생성
        mock_config = MagicMock()
        mock_config.get_connection_params.return_value = {
            "host": "test_host",
            "port": 1234,
            "database": "test_db",
            "user": "test_user",
            "password": "test_password",
            "charset": "utf8",
        }
        mock_config.config = {
            "database": "test_db",
            "host": "test_host",
        }
        mock_config_class.return_value = mock_config
        
        # 연결 모의 객체
        mock_connection = MagicMock()
        mock_connect.return_value = mock_connection
        
        # 데이터베이스 연결
        db = DatabaseConnection()
        db.connect()
        
        # 연결 생성 확인
        mock_connect.assert_called_once()
        self.assertEqual(db.connection, mock_connection)
    
    @patch('src.database.connection.DatabaseConfig')
    @patch('src.database.connection.pymysql.connect')
    def test_query(self, mock_connect, mock_config_class):
        """쿼리 실행 테스트"""
        # 설정 모의 객체
        mock_config = MagicMock()
        mock_config_class.return_value = mock_config
        
        # 커서 모의 객체
        mock_cursor = MagicMock()
        mock_cursor.fetchall.return_value = [{"id": 1, "name": "Test"}]
        
        # 연결 모의 객체
        mock_connection = MagicMock()
        mock_connection.cursor.return_value.__enter__.return_value = mock_cursor
        mock_connect.return_value = mock_connection
        
        # 데이터베이스 연결 및 쿼리 실행
        db = DatabaseConnection()
        db.connection = mock_connection  # 직접 연결 설정
        
        results = db.query("SELECT * FROM test")
        
        # 쿼리 실행 확인
        mock_cursor.execute.assert_called_once_with("SELECT * FROM test", None)
        self.assertEqual(results, [{"id": 1, "name": "Test"}])
    
    @patch('src.database.connection.DatabaseConfig')
    @patch('src.database.connection.pymysql.connect')
    def test_execute(self, mock_connect, mock_config_class):
        """실행 쿼리 테스트"""
        # 설정 모의 객체
        mock_config = MagicMock()
        mock_config_class.return_value = mock_config
        
        # 커서 모의 객체
        mock_cursor = MagicMock()
        mock_cursor.rowcount = 2
        
        # 연결 모의 객체
        mock_connection = MagicMock()
        mock_connection.cursor.return_value.__enter__.return_value = mock_cursor
        mock_connect.return_value = mock_connection
        
        # 데이터베이스 연결 및 쿼리 실행
        db = DatabaseConnection()
        db.connection = mock_connection  # 직접 연결 설정
        
        affected_rows = db.execute("UPDATE test SET value = %s", (123,))
        
        # 쿼리 실행 확인
        mock_cursor.execute.assert_called_once_with("UPDATE test SET value = %s", (123,))
        self.assertEqual(affected_rows, 2)
    
    @patch('src.database.connection.DatabaseConfig')
    @patch('src.database.connection.pymysql.connect')
    def test_context_manager(self, mock_connect, mock_config_class):
        """컨텍스트 매니저 테스트"""
        # 설정 모의 객체
        mock_config = MagicMock()
        mock_config_class.return_value = mock_config
        
        # 연결 모의 객체
        mock_connection = MagicMock()
        mock_connect.return_value = mock_connection
        
        # 컨텍스트 매니저 사용
        with DatabaseConnection() as db:
            self.assertIsInstance(db, DatabaseConnection)
        
        # 종료 시 연결 닫기 확인
        mock_connection.close.assert_called_once()

if __name__ == '__main__':
    unittest.main()
