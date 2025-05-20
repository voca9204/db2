"""
인증 시스템 테스트 모듈

이 모듈은 인증 시스템 기능을 테스트합니다.
"""

import os
import sys
import unittest
from unittest.mock import MagicMock, patch
import tempfile
import shutil
import json
import uuid
from pathlib import Path
from datetime import datetime, timedelta
import jwt

# 프로젝트 루트 디렉토리를 sys.path에 추가
project_root = Path(__file__).parent.parent.parent
sys.path.append(str(project_root))

from src.utils.auth import AuthenticationSystem, User, AuthError, PermissionError

class TestAuthenticationSystem(unittest.TestCase):
    """AuthenticationSystem 클래스 테스트"""
    
    def setUp(self):
        """테스트 설정"""
        # 임시 데이터 디렉토리 생성
        self.temp_dir = tempfile.mkdtemp()
        
        # 사용자 및 로그 파일 경로 설정
        self.users_file = Path(self.temp_dir) / "users.json"
        self.logs_file = Path(self.temp_dir) / "auth_logs.json"
        
        # 모의 데이터베이스 연결 객체 생성
        self.mock_db = MagicMock()
        self.mock_db.query = MagicMock(return_value=[])
        self.mock_db.query_one = MagicMock(return_value=None)
        self.mock_db.execute = MagicMock(return_value=1)
        
        # 테스트 비밀 키
        self.test_secret_key = "test_secret_key"
        
        # 파일 기반 인증 시스템 생성 (데이터베이스 연결 없음)
        with patch('src.utils.auth.project_root', Path(self.temp_dir)):
            # AuthenticationSystem 클래스가 프로젝트 루트를 참조하므로 패치
            self.auth_system = AuthenticationSystem(secret_key=self.test_secret_key)
        
        # 테스트 사용자 초기화
        self.test_users = self._create_test_users()
    
    def tearDown(self):
        """테스트 정리"""
        # 임시 디렉토리 삭제
        shutil.rmtree(self.temp_dir)
    
    def _create_test_users(self):
        """테스트 사용자 생성"""
        # 관리자 사용자 생성
        admin_user = self.auth_system.create_user(
            username="admin",
            password="admin123",
            email="admin@example.com",
            role="admin",
            permissions=["*:*"]
        )
        
        # 일반 사용자 생성
        regular_user = self.auth_system.create_user(
            username="user",
            password="user123",
            email="user@example.com",
            role="user",
            permissions=["reports:view", "dashboard:view"]
        )
        
        # 보고서 작성자 사용자 생성
        report_user = self.auth_system.create_user(
            username="reporter",
            password="reporter123",
            email="reporter@example.com",
            role="reporter",
            permissions=["reports:view", "reports:create", "reports:edit", "dashboard:view"]
        )
        
        return {
            "admin": admin_user,
            "user": regular_user,
            "reporter": report_user
        }
    
    def test_user_creation(self):
        """사용자 생성 테스트"""
        # 사용자 생성
        user = self.auth_system.create_user(
            username="testuser",
            password="pass123",
            email="test@example.com",
            role="user",
            permissions=["test:permission"]
        )
        
        # 사용자 생성 확인
        self.assertIsNotNone(user)
        self.assertEqual(user.username, "testuser")
        self.assertEqual(user.email, "test@example.com")
        self.assertEqual(user.role, "user")
        self.assertEqual(user.permissions, ["test:permission"])
        
        # 사용자 파일에 저장되었는지 확인
        with open(self.users_file, 'r', encoding='utf-8') as f:
            users = json.load(f)
        
        # 테스트 사용자 + 초기에 생성한 3명
        self.assertEqual(len(users), 4)
        
        # 사용자 이름 중복 확인 (예외 발생)
        with self.assertRaises(AuthError):
            self.auth_system.create_user(
                username="testuser",
                password="pass456",
                email="another@example.com",
                role="user"
            )
    
    def test_authentication(self):
        """사용자 인증 테스트"""
        # 유효한 자격 증명으로 인증
        success, user = self.auth_system.authenticate_user("admin", "admin123")
        self.assertTrue(success)
        self.assertIsNotNone(user)
        self.assertEqual(user.username, "admin")
        
        # 잘못된 비밀번호로 인증
        success, user = self.auth_system.authenticate_user("admin", "wrongpassword")
        self.assertFalse(success)
        self.assertIsNone(user)
        
        # 존재하지 않는 사용자로 인증
        success, user = self.auth_system.authenticate_user("nonexistent", "anypassword")
        self.assertFalse(success)
        self.assertIsNone(user)
    
    def test_session_management(self):
        """세션 관리 테스트"""
        # 세션 생성
        admin_id = self.test_users["admin"].user_id
        session_id = self.auth_system.create_session(admin_id)
        
        # 세션 ID 형식 확인
        self.assertIsNotNone(session_id)
        self.assertIsInstance(session_id, str)
        
        # 유효한 세션 검증
        is_valid, user_id = self.auth_system.validate_session(session_id)
        self.assertTrue(is_valid)
        self.assertEqual(user_id, admin_id)
        
        # 존재하지 않는 세션 검증
        is_valid, user_id = self.auth_system.validate_session("nonexistent-session")
        self.assertFalse(is_valid)
        self.assertIsNone(user_id)
        
        # 세션 무효화
        result = self.auth_system.invalidate_session(session_id)
        self.assertTrue(result)
        
        # 무효화된 세션 검증
        is_valid, user_id = self.auth_system.validate_session(session_id)
        self.assertFalse(is_valid)
        self.assertIsNone(user_id)
        
        # 만료된 세션 테스트
        with patch.object(self.auth_system, 'session_timeout', 0):
            # 세션 타임아웃을 0으로 설정하여 즉시 만료되도록 함
            expired_session_id = self.auth_system.create_session(admin_id)
            is_valid, user_id = self.auth_system.validate_session(expired_session_id)
            self.assertFalse(is_valid)
            self.assertIsNone(user_id)
    
    def test_jwt_tokens(self):
        """JWT 토큰 테스트"""
        # 토큰 생성
        admin_id = self.test_users["admin"].user_id
        token = self.auth_system.create_jwt_token(admin_id)
        
        # 토큰 형식 확인
        self.assertIsNotNone(token)
        self.assertIsInstance(token, str)
        
        # 유효한 토큰 검증
        is_valid, claims = self.auth_system.validate_jwt_token(token)
        self.assertTrue(is_valid)
        self.assertEqual(claims["sub"], admin_id)
        self.assertEqual(claims["username"], "admin")
        self.assertEqual(claims["role"], "admin")
        
        # 추가 클레임으로 토큰 생성
        additional_claims = {"custom_claim": "test_value"}
        token_with_claims = self.auth_system.create_jwt_token(admin_id, additional_claims)
        
        # 추가 클레임 확인
        is_valid, claims = self.auth_system.validate_jwt_token(token_with_claims)
        self.assertTrue(is_valid)
        self.assertEqual(claims["custom_claim"], "test_value")
        
        # 만료된 토큰 테스트
        with patch.object(self.auth_system, 'token_timeout', 0):
            # 토큰 타임아웃을 0으로 설정하여 즉시 만료되도록 함
            expired_token = self.auth_system.create_jwt_token(admin_id)
            
            # jwt.decode를 패치하여 ExpiredSignatureError 발생시키기
            with patch('jwt.decode', side_effect=jwt.ExpiredSignatureError):
                is_valid, claims = self.auth_system.validate_jwt_token(expired_token)
                self.assertFalse(is_valid)
                self.assertIsNone(claims)
        
        # 유효하지 않은 토큰 테스트
        invalid_token = "invalid.token.format"
        is_valid, claims = self.auth_system.validate_jwt_token(invalid_token)
        self.assertFalse(is_valid)
        self.assertIsNone(claims)
    
    def test_permission_checking(self):
        """권한 확인 테스트"""
        admin_id = self.test_users["admin"].user_id
        user_id = self.test_users["user"].user_id
        reporter_id = self.test_users["reporter"].user_id
        
        # 관리자 권한 확인 (모든 권한 허용)
        self.assertTrue(self.auth_system.has_permission(admin_id, "any", "permission"))
        
        # 일반 사용자 권한 확인
        self.assertTrue(self.auth_system.has_permission(user_id, "reports", "view"))
        self.assertFalse(self.auth_system.has_permission(user_id, "reports", "create"))
        
        # 보고서 작성자 권한 확인
        self.assertTrue(self.auth_system.has_permission(reporter_id, "reports", "view"))
        self.assertTrue(self.auth_system.has_permission(reporter_id, "reports", "create"))
        self.assertTrue(self.auth_system.has_permission(reporter_id, "reports", "edit"))
        self.assertFalse(self.auth_system.has_permission(reporter_id, "reports", "delete"))
        
        # check_permission 메서드 테스트 (예외 발생)
        # 권한이 있는 경우 - 예외 없음
        try:
            self.auth_system.check_permission(reporter_id, "reports", "create")
        except PermissionError:
            self.fail("check_permission raised PermissionError unexpectedly")
        
        # 권한이 없는 경우 - PermissionError 발생
        with self.assertRaises(PermissionError):
            self.auth_system.check_permission(user_id, "reports", "create")
    
    def test_user_management(self):
        """사용자 관리 테스트"""
        # 사용자 조회
        admin = self.auth_system.get_user(self.test_users["admin"].user_id)
        self.assertIsNotNone(admin)
        self.assertEqual(admin.username, "admin")
        
        # 사용자 이름으로 조회
        user = self.auth_system.get_user_by_username("user")
        self.assertIsNotNone(user)
        self.assertEqual(user.email, "user@example.com")
        
        # 모든 사용자 조회
        all_users = self.auth_system.get_users()
        self.assertEqual(len(all_users), 3)
        
        # 사용자 정보 업데이트
        updated_user = self.auth_system.update_user(
            user_id=user.user_id,
            email="updated@example.com",
            permissions=["reports:view", "dashboard:view", "dashboard:edit"]
        )
        
        # 업데이트 확인
        self.assertEqual(updated_user.email, "updated@example.com")
        self.assertEqual(len(updated_user.permissions), 3)
        self.assertIn("dashboard:edit", updated_user.permissions)
        
        # 사용자 재조회하여 영구적으로 업데이트되었는지 확인
        user_after_update = self.auth_system.get_user(user.user_id)
        self.assertEqual(user_after_update.email, "updated@example.com")
        
        # 비밀번호 변경
        with self.assertRaises(AuthError):
            # 잘못된 현재 비밀번호로 변경 시도
            self.auth_system.change_password(user.user_id, "wrongpassword", "newpassword")
        
        # 올바른 비밀번호로 변경
        result = self.auth_system.change_password(user.user_id, "user123", "newpassword")
        self.assertTrue(result)
        
        # 변경된 비밀번호로 인증
        success, _ = self.auth_system.authenticate_user("user", "newpassword")
        self.assertTrue(success)
        
        # 사용자 삭제
        result = self.auth_system.delete_user(user.user_id)
        self.assertTrue(result)
        
        # 삭제된 사용자 조회
        deleted_user = self.auth_system.get_user(user.user_id)
        self.assertIsNone(deleted_user)
        
        # 남은 사용자 수 확인
        all_users_after_delete = self.auth_system.get_users()
        self.assertEqual(len(all_users_after_delete), 2)
    
    def test_activity_logging(self):
        """활동 로깅 테스트"""
        admin_id = self.test_users["admin"].user_id
        
        # 활동 로그 직접 생성
        self.auth_system.log_activity(admin_id, "test", "action", True, "Test details")
        
        # 다양한 활동 로그 생성
        self.auth_system.log_activity(admin_id, "reports", "view", True)
        self.auth_system.log_activity(admin_id, "dashboard", "edit", False, "Access denied")
        self.auth_system.log_activity(None, "authentication", "attempt", False, "Anonymous attempt")
        
        # 모든 로그 조회
        all_logs = self.auth_system.get_activity_logs()
        self.assertEqual(len(all_logs), 4)
        
        # 특정 사용자 로그 조회
        admin_logs = self.auth_system.get_activity_logs(user_id=admin_id)
        self.assertEqual(len(admin_logs), 3)
        
        # 특정 리소스 로그 조회
        reports_logs = self.auth_system.get_activity_logs(resource="reports")
        self.assertEqual(len(reports_logs), 1)
        
        # 특정 액션 로그 조회
        view_logs = self.auth_system.get_activity_logs(action="view")
        self.assertEqual(len(view_logs), 1)
        
        # 성공 여부 기준 로그 조회
        success_logs = self.auth_system.get_activity_logs(success=True)
        self.assertEqual(len(success_logs), 2)
        
        # 복합 필터링
        combined_logs = self.auth_system.get_activity_logs(
            user_id=admin_id,
            success=True
        )
        self.assertEqual(len(combined_logs), 2)
    
    def test_role_permissions(self):
        """역할별 권한 테스트"""
        # 역할별 권한 조회
        role_permissions = self.auth_system.get_role_permissions()
        
        # 관리자 역할 확인
        self.assertIn("admin", role_permissions)
        self.assertIn("*:*", role_permissions["admin"])
        
        # 일반 사용자 역할 확인
        self.assertIn("user", role_permissions)
        self.assertIn("reports:view", role_permissions["user"])
        self.assertIn("dashboard:view", role_permissions["user"])
        
        # 보고서 작성자 역할 확인
        self.assertIn("reporter", role_permissions)
        self.assertIn("reports:create", role_permissions["reporter"])

class TestUser(unittest.TestCase):
    """User 클래스 테스트"""
    
    def test_user_creation(self):
        """사용자 객체 생성 테스트"""
        user = User(
            user_id="test-id",
            username="testuser",
            email="test@example.com",
            role="user",
            permissions=["test:permission"],
            metadata={"key": "value"}
        )
        
        self.assertEqual(user.user_id, "test-id")
        self.assertEqual(user.username, "testuser")
        self.assertEqual(user.email, "test@example.com")
        self.assertEqual(user.role, "user")
        self.assertEqual(user.permissions, ["test:permission"])
        self.assertEqual(user.metadata, {"key": "value"})
        self.assertIsNone(user.last_login)
        self.assertTrue(user.is_active)
    
    def test_to_dict(self):
        """사용자 객체 딕��너리 변환 테스트"""
        user = User(
            user_id="test-id",
            username="testuser",
            email="test@example.com",
            role="user"
        )
        
        user_dict = user.to_dict()
        
        self.assertEqual(user_dict["user_id"], "test-id")
        self.assertEqual(user_dict["username"], "testuser")
        self.assertEqual(user_dict["email"], "test@example.com")
        self.assertEqual(user_dict["role"], "user")
        self.assertEqual(user_dict["permissions"], [])
        self.assertEqual(user_dict["metadata"], {})
        self.assertIsNone(user_dict["last_login"])
        self.assertTrue(user_dict["is_active"])
    
    def test_from_dict(self):
        """딕셔너리에서 사용자 객체 생성 테스트"""
        user_dict = {
            "user_id": "test-id",
            "username": "testuser",
            "email": "test@example.com",
            "role": "user",
            "permissions": ["test:permission"],
            "metadata": {"key": "value"},
            "last_login": datetime.now().isoformat(),
            "is_active": True
        }
        
        user = User.from_dict(user_dict)
        
        self.assertEqual(user.user_id, "test-id")
        self.assertEqual(user.username, "testuser")
        self.assertEqual(user.email, "test@example.com")
        self.assertEqual(user.role, "user")
        self.assertEqual(user.permissions, ["test:permission"])
        self.assertEqual(user.metadata, {"key": "value"})
        self.assertIsNotNone(user.last_login)
        self.assertTrue(user.is_active)

if __name__ == '__main__':
    unittest.main()
