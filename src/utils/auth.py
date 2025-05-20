"""
사용자 인증 및 접근 제어 모듈

이 모듈은 사용자 인증, 권한 부여 및 접근 제어 기능을 제공합니다.
사용자 인증, 세션 관리, 권한 확인, 활동 로깅 등을 지원합니다.
"""

import os
import time
import uuid
import hashlib
import logging
import json
import base64
import hmac
import secrets
from typing import Dict, List, Optional, Any, Tuple, Set
from datetime import datetime, timedelta
import jwt
from pathlib import Path

# 프로젝트 루트 디렉토리 설정
project_root = Path(__file__).parent.parent.parent

# 로깅 설정
logger = logging.getLogger(__name__)

class AuthError(Exception):
    """인증 관련 오류 클래스"""
    pass

class PermissionError(Exception):
    """권한 관련 오류 클래스"""
    pass

class User:
    """사용자 정보 클래스"""
    
    def __init__(self, user_id: str, username: str, email: str, role: str, 
                permissions: Optional[List[str]] = None, metadata: Optional[Dict[str, Any]] = None):
        """
        User 초기화
        
        Args:
            user_id (str): 사용자 ID
            username (str): 사용자 이름
            email (str): 사용자 이메일
            role (str): 사용자 역할
            permissions (List[str], optional): 사용자 권한 목록. 기본값은 None.
            metadata (Dict[str, Any], optional): 사용자 메타데이터. 기본값은 None.
        """
        self.user_id = user_id
        self.username = username
        self.email = email
        self.role = role
        self.permissions = permissions or []
        self.metadata = metadata or {}
        self.last_login = None
        self.is_active = True
    
    def to_dict(self) -> Dict[str, Any]:
        """
        사용자 정보를 딕셔너리로 변환
        
        Returns:
            Dict[str, Any]: 사용자 정보 딕셔너리
        """
        return {
            'user_id': self.user_id,
            'username': self.username,
            'email': self.email,
            'role': self.role,
            'permissions': self.permissions,
            'metadata': self.metadata,
            'last_login': self.last_login.isoformat() if self.last_login else None,
            'is_active': self.is_active
        }
    
    @classmethod
    def from_dict(cls, data: Dict[str, Any]) -> 'User':
        """
        딕셔너리에서 사용자 객체 생성
        
        Args:
            data (Dict[str, Any]): 사용자 정보 딕셔너리
            
        Returns:
            User: 사용자 객체
        """
        user = cls(
            user_id=data['user_id'],
            username=data['username'],
            email=data['email'],
            role=data['role'],
            permissions=data.get('permissions', []),
            metadata=data.get('metadata', {})
        )
        
        if data.get('last_login'):
            user.last_login = datetime.fromisoformat(data['last_login'])
        
        user.is_active = data.get('is_active', True)
        
        return user

class AuthenticationSystem:
    """
    사용자 인증 및 접근 제어 시스템
    
    이 클래스는 사용자 인증, 세션 관리, 권한 확인, 활동 로깅 등의 기능을 제공합니다.
    """
    
    def __init__(self, db_connection=None, user_table: str = 'users', 
                auth_log_table: str = 'auth_logs', secret_key: Optional[str] = None,
                session_timeout: int = 3600, token_timeout: int = 86400):
        """
        AuthenticationSystem 초기화
        
        Args:
            db_connection: 데이터베이스 연결 객체. 기본값은 None.
                None인 경우 파일 기반 인증을 사용합니다.
            user_table (str, optional): 사용자 테이블 이름. 기본값은 'users'.
            auth_log_table (str, optional): 인증 로그 테이블 이름. 기본값은 'auth_logs'.
            secret_key (str, optional): JWT 토큰 서명에 사용할 비밀 키. 기본값은 None.
                None인 경우 환경 변수 또는 랜덤 키를 사용합니다.
            session_timeout (int, optional): 세션 타임아웃(초). 기본값은 3600(1시간).
            token_timeout (int, optional): 토큰 타임아웃(초). 기본값은 86400(1일).
        """
        self.connection = db_connection
        self.user_table = user_table
        self.auth_log_table = auth_log_table
        self.active_sessions = {}
        self.session_timeout = session_timeout
        self.token_timeout = token_timeout
        
        # 비밀 키 설정
        if secret_key:
            self.secret_key = secret_key
        else:
            # 환경 변수에서 비밀 키 가져오기
            env_key = os.environ.get('AUTH_SECRET_KEY')
            if env_key:
                self.secret_key = env_key
            else:
                # 랜덤 비밀 키 생성
                self.secret_key = secrets.token_hex(32)
                logger.warning("환경 변수에 AUTH_SECRET_KEY가 설정되지 않았습니다. 랜덤 키를 생성했습니다.")
        
        # 파일 기반 인증을 위한 경로 설정
        if not self.connection:
            self.users_file = project_root / "data" / "users.json"
            self.logs_file = project_root / "data" / "auth_logs.json"
            
            # 사용자 파일이 없으면 생성
            if not self.users_file.parent.exists():
                self.users_file.parent.mkdir(parents=True, exist_ok=True)
            
            if not self.users_file.exists():
                with open(self.users_file, 'w', encoding='utf-8') as f:
                    json.dump([], f)
            
            # 로그 파일이 없으면 생성
            if not self.logs_file.exists():
                with open(self.logs_file, 'w', encoding='utf-8') as f:
                    json.dump([], f)
    
    def authenticate_user(self, username: str, password: str) -> Tuple[bool, Optional[User]]:
        """
        사용자 인증
        
        Args:
            username (str): 사용자 이름
            password (str): 비밀번호
            
        Returns:
            Tuple[bool, Optional[User]]: 인증 성공 여부와 사용자 객체
        """
        try:
            # 사용자 정보 조회
            user = self._get_user_by_username(username)
            
            if not user:
                self.log_activity(None, 'authentication', 'login_attempt', False, 
                                 details=f"User not found: {username}")
                return False, None
            
            # 비밀번호 검증
            if not self._verify_password(user.user_id, password):
                self.log_activity(user.user_id, 'authentication', 'login_attempt', False, 
                                 details=f"Invalid password for user: {username}")
                return False, None
            
            # 마지막 로그인 시간 업데이트
            user.last_login = datetime.now()
            self._update_user(user)
            
            # 성공 로그
            self.log_activity(user.user_id, 'authentication', 'login', True)
            
            return True, user
        
        except Exception as e:
            logger.error(f"사용자 인증 중 오류 발생: {str(e)}")
            self.log_activity(None, 'authentication', 'login_attempt', False, 
                             details=f"Error: {str(e)}")
            return False, None
    
    def create_session(self, user_id: str) -> str:
        """
        인증된 세션 생성
        
        Args:
            user_id (str): 사용자 ID
            
        Returns:
            str: 세션 ID
            
        Raises:
            AuthError: 사용자를 찾을 수 없는 경우 발생
        """
        # 사용자 존재 확인
        user = self._get_user_by_id(user_id)
        if not user:
            raise AuthError(f"세션 생성 실패: 사용자를 찾을 수 없습니다. ({user_id})")
        
        # 세션 ID 생성
        session_id = str(uuid.uuid4())
        
        # 세션 정보 저장
        self.active_sessions[session_id] = {
            'user_id': user_id,
            'created_at': datetime.now(),
            'expires_at': datetime.now() + timedelta(seconds=self.session_timeout),
            'ip_address': None,  # 요청 처리 시 설정
            'user_agent': None   # 요청 처리 시 설정
        }
        
        # 세션 생성 로그
        self.log_activity(user_id, 'session', 'create', True, 
                         details=f"Session created: {session_id}")
        
        return session_id
    
    def validate_session(self, session_id: str) -> Tuple[bool, Optional[str]]:
        """
        세션 유효성 검증
        
        Args:
            session_id (str): 세션 ID
            
        Returns:
            Tuple[bool, Optional[str]]: 세션 유효 여부와 사용자 ID
        """
        # 세션 존재 확인
        if session_id not in self.active_sessions:
            return False, None
        
        session = self.active_sessions[session_id]
        
        # 세션 만료 확인
        if datetime.now() > session['expires_at']:
            # 만료된 세션 삭제
            del self.active_sessions[session_id]
            self.log_activity(session['user_id'], 'session', 'expire', True, 
                             details=f"Session expired: {session_id}")
            return False, None
        
        # 세션 갱신
        session['expires_at'] = datetime.now() + timedelta(seconds=self.session_timeout)
        
        return True, session['user_id']
    
    def invalidate_session(self, session_id: str) -> bool:
        """
        세션 무효화 (로그아웃)
        
        Args:
            session_id (str): 세션 ID
            
        Returns:
            bool: 세션 무효화 성공 여부
        """
        # 세션 존재 확인
        if session_id not in self.active_sessions:
            return False
        
        user_id = self.active_sessions[session_id]['user_id']
        
        # 세션 삭제
        del self.active_sessions[session_id]
        
        # 로그아웃 로그
        self.log_activity(user_id, 'session', 'logout', True, 
                         details=f"Session invalidated: {session_id}")
        
        return True
    
    def create_jwt_token(self, user_id: str, additional_claims: Optional[Dict[str, Any]] = None) -> str:
        """
        JWT 토큰 생성
        
        Args:
            user_id (str): 사용자 ID
            additional_claims (Dict[str, Any], optional): 추가 클레임. 기본값은 None.
            
        Returns:
            str: JWT 토큰
            
        Raises:
            AuthError: 사용자를 찾을 수 없는 경우 발생
        """
        # 사용자 존재 확인
        user = self._get_user_by_id(user_id)
        if not user:
            raise AuthError(f"토큰 생성 실패: 사용자를 찾을 수 없습니다. ({user_id})")
        
        # 토큰 클레임 설정
        now = datetime.now()
        expires_at = now + timedelta(seconds=self.token_timeout)
        
        claims = {
            'sub': user_id,
            'username': user.username,
            'email': user.email,
            'role': user.role,
            'permissions': user.permissions,
            'iat': int(now.timestamp()),
            'exp': int(expires_at.timestamp())
        }
        
        # 추가 클레임 병합
        if additional_claims:
            claims.update(additional_claims)
        
        # JWT 토큰 생성
        token = jwt.encode(claims, self.secret_key, algorithm='HS256')
        
        # 토큰 생성 로그
        self.log_activity(user_id, 'token', 'create', True)
        
        return token
    
    def validate_jwt_token(self, token: str) -> Tuple[bool, Optional[Dict[str, Any]]]:
        """
        JWT 토큰 유효성 검증
        
        Args:
            token (str): JWT 토큰
            
        Returns:
            Tuple[bool, Optional[Dict[str, Any]]]: 토큰 유효 여부와 클레임 정보
        """
        try:
            # JWT 토큰 디코딩 및 검증
            claims = jwt.decode(token, self.secret_key, algorithms=['HS256'])
            
            # 사용자 존재 확인
            user_id = claims['sub']
            user = self._get_user_by_id(user_id)
            
            if not user:
                logger.warning(f"토큰 검증 실패: 사용자를 찾을 수 없습니다. ({user_id})")
                return False, None
            
            return True, claims
        
        except jwt.ExpiredSignatureError:
            logger.warning("토큰 검증 실패: 만료된 토큰")
            return False, None
        
        except jwt.InvalidTokenError as e:
            logger.warning(f"토큰 검증 실패: 유효하지 않은 토큰 ({str(e)})")
            return False, None
        
        except Exception as e:
            logger.error(f"토큰 검증 중 오류 발생: {str(e)}")
            return False, None
    
    def has_permission(self, user_id: str, resource: str, action: str) -> bool:
        """
        사용자 권한 확인
        
        Args:
            user_id (str): 사용자 ID
            resource (str): 리소스 이름
            action (str): 액션 이름
            
        Returns:
            bool: 권한 있음 여부
        """
        # 사용자 조회
        user = self._get_user_by_id(user_id)
        if not user:
            return False
        
        # 권한 형식: resource:action
        permission = f"{resource}:{action}"
        
        # 관리자 역할은 모든 권한 허용
        if user.role == 'admin':
            return True
        
        # 특정 권한 확인
        if permission in user.permissions:
            return True
        
        # 와일드카드 권한 확인 (resource:*)
        wildcard_permission = f"{resource}:*"
        if wildcard_permission in user.permissions:
            return True
        
        # 슈퍼 와일드카드 권한 확인 (*:*)
        if "*:*" in user.permissions:
            return True
        
        return False
    
    def check_permission(self, user_id: str, resource: str, action: str) -> None:
        """
        사용자 권한 확인 (예외 발생)
        
        Args:
            user_id (str): 사용자 ID
            resource (str): 리소스 이름
            action (str): 액션 이름
            
        Raises:
            PermissionError: 권한이 없는 경우 발생
        """
        if not self.has_permission(user_id, resource, action):
            self.log_activity(user_id, resource, action, False, 
                             details=f"Permission denied: {resource}:{action}")
            raise PermissionError(f"권한이 없습니다: {resource}:{action}")
        
        # 권한 확인 성공 로그
        self.log_activity(user_id, resource, action, True)
    
    def log_activity(self, user_id: Optional[str], resource: str, action: str, success: bool,
                    details: Optional[str] = None) -> None:
        """
        사용자 활동 로깅
        
        Args:
            user_id (Optional[str]): 사용자 ID
            resource (str): 리소스 이름
            action (str): 액션 이름
            success (bool): 성공 여부
            details (Optional[str], optional): 추가 세부 정보. 기본값은 None.
        """
        # 로그 데이터 생성
        log_data = {
            'timestamp': datetime.now().isoformat(),
            'user_id': user_id,
            'resource': resource,
            'action': action,
            'success': success,
            'details': details
        }
        
        # 데이터베이스 연결이 있는 경우
        if self.connection:
            try:
                query = f"""
                INSERT INTO {self.auth_log_table} 
                (timestamp, user_id, resource, action, success, details)
                VALUES (%s, %s, %s, %s, %s, %s)
                """
                params = (
                    log_data['timestamp'],
                    log_data['user_id'],
                    log_data['resource'], 
                    log_data['action'],
                    log_data['success'],
                    log_data['details']
                )
                
                self.connection.execute(query, params)
            
            except Exception as e:
                logger.error(f"활동 로깅 중 오류 발생: {str(e)}")
        
        # 파일 기반 인증을 사용하는 경우
        else:
            try:
                # 기존 로그 로드
                logs = []
                if self.logs_file.exists():
                    with open(self.logs_file, 'r', encoding='utf-8') as f:
                        logs = json.load(f)
                
                # 새 로그 추가
                logs.append(log_data)
                
                # 로그 저장
                with open(self.logs_file, 'w', encoding='utf-8') as f:
                    json.dump(logs, f, indent=2, ensure_ascii=False)
            
            except Exception as e:
                logger.error(f"파일 기반 활동 로깅 중 오류 발생: {str(e)}")
        
        # 로그 메시지 생성
        user_info = f"User: {user_id}" if user_id else "Anonymous"
        result = "Success" if success else "Failure"
        detail_info = f" - {details}" if details else ""
        
        log_message = f"{result} - {user_info} - {resource}:{action}{detail_info}"
        
        # 로그 레벨 결정
        if success:
            logger.info(log_message)
        else:
            logger.warning(log_message)
    
    def create_user(self, username: str, password: str, email: str, role: str = 'user',
                   permissions: Optional[List[str]] = None) -> User:
        """
        새 사용자 생성
        
        Args:
            username (str): 사용자 이름
            password (str): 비밀번호
            email (str): 이메일
            role (str, optional): 역할. 기본값은 'user'.
            permissions (List[str], optional): 권한 목록. 기본값은 None.
            
        Returns:
            User: 생성된 사용자 객체
            
        Raises:
            AuthError: 사용자 이름이 이미 존재하는 경우 발생
        """
        # 사용자 이름 중복 확인
        existing_user = self._get_user_by_username(username)
        if existing_user:
            raise AuthError(f"사용자 생성 실패: 이미 존재하는 사용자 이름입니다. ({username})")
        
        # 사용자 ID 생성
        user_id = str(uuid.uuid4())
        
        # 비밀번호 해싱
        salt, hashed_password = self._hash_password(password)
        
        # 사용자 객체 생성
        user = User(
            user_id=user_id,
            username=username,
            email=email,
            role=role,
            permissions=permissions or []
        )
        
        # 데이터베이스 연결이 있는 경우
        if self.connection:
            try:
                # 사용자 테이블에 추가
                query = f"""
                INSERT INTO {self.user_table} 
                (user_id, username, email, role, hashed_password, salt, permissions, created_at)
                VALUES (%s, %s, %s, %s, %s, %s, %s, %s)
                """
                params = (
                    user_id,
                    username,
                    email,
                    role,
                    hashed_password,
                    salt,
                    json.dumps(permissions or []),
                    datetime.now().isoformat()
                )
                
                self.connection.execute(query, params)
            
            except Exception as e:
                raise AuthError(f"사용자 생성 실패: {str(e)}") from e
        
        # 파일 기반 인증을 사용하는 경우
        else:
            try:
                # 기존 사용자 로드
                users = []
                if self.users_file.exists():
                    with open(self.users_file, 'r', encoding='utf-8') as f:
                        users = json.load(f)
                
                # 새 사용자 추가
                user_data = user.to_dict()
                user_data['hashed_password'] = hashed_password
                user_data['salt'] = salt
                user_data['created_at'] = datetime.now().isoformat()
                
                users.append(user_data)
                
                # 사용자 저장
                with open(self.users_file, 'w', encoding='utf-8') as f:
                    json.dump(users, f, indent=2, ensure_ascii=False)
            
            except Exception as e:
                raise AuthError(f"파일 기반 사용자 생성 실패: {str(e)}") from e
        
        # 사용자 생성 로그
        self.log_activity(user_id, 'user', 'create', True, 
                         details=f"User created: {username}")
        
        return user
    
    def update_user(self, user_id: str, username: Optional[str] = None, email: Optional[str] = None,
                  role: Optional[str] = None, permissions: Optional[List[str]] = None,
                  is_active: Optional[bool] = None) -> User:
        """
        사용자 정보 업데이트
        
        Args:
            user_id (str): 사용자 ID
            username (Optional[str], optional): 새 사용자 이름. 기본값은 None.
            email (Optional[str], optional): 새 이메일. 기본값은 None.
            role (Optional[str], optional): 새 역할. 기본값은 None.
            permissions (Optional[List[str]], optional): 새 권한 목록. 기본값은 None.
            is_active (Optional[bool], optional): 새 활성화 상태. 기본값은 None.
            
        Returns:
            User: 업데이트된 사용자 객체
            
        Raises:
            AuthError: 사용자를 찾을 수 없거나 업데이트 실패 시 발생
        """
        # 사용자 조회
        user = self._get_user_by_id(user_id)
        if not user:
            raise AuthError(f"사용자 업데이트 실패: 사용자를 찾을 수 없습니다. ({user_id})")
        
        # 사용자 정보 업데이트
        if username is not None:
            user.username = username
        
        if email is not None:
            user.email = email
        
        if role is not None:
            user.role = role
        
        if permissions is not None:
            user.permissions = permissions
        
        if is_active is not None:
            user.is_active = is_active
        
        # 사용자 정보 저장
        self._update_user(user)
        
        # 사용자 업데이트 로그
        self.log_activity(user_id, 'user', 'update', True, 
                         details=f"User updated: {user.username}")
        
        return user
    
    def change_password(self, user_id: str, current_password: str, new_password: str) -> bool:
        """
        비밀번호 변경
        
        Args:
            user_id (str): 사용자 ID
            current_password (str): 현재 비밀번호
            new_password (str): 새 비밀번호
            
        Returns:
            bool: 비밀번호 변경 성공 여부
            
        Raises:
            AuthError: 사용자를 찾을 수 없거나 현재 비밀번호가 일치하지 않는 경우 발생
        """
        # 사용자 조회
        user = self._get_user_by_id(user_id)
        if not user:
            raise AuthError(f"비밀번호 변경 실패: 사용자를 찾을 수 없습니다. ({user_id})")
        
        # 현재 비밀번호 검증
        if not self._verify_password(user_id, current_password):
            self.log_activity(user_id, 'user', 'password_change', False, 
                             details="Invalid current password")
            raise AuthError("비밀번호 변경 실패: 현재 비밀번호가 일치하지 않습니다.")
        
        # 새 비밀번호 해싱
        salt, hashed_password = self._hash_password(new_password)
        
        # 데이터베이스 연결이 있는 경우
        if self.connection:
            try:
                query = f"""
                UPDATE {self.user_table}
                SET hashed_password = %s, salt = %s, updated_at = %s
                WHERE user_id = %s
                """
                params = (
                    hashed_password,
                    salt,
                    datetime.now().isoformat(),
                    user_id
                )
                
                self.connection.execute(query, params)
            
            except Exception as e:
                self.log_activity(user_id, 'user', 'password_change', False, 
                                 details=f"Error: {str(e)}")
                raise AuthError(f"비밀번호 변경 실패: {str(e)}") from e
        
        # 파일 기반 인증을 사용하는 경우
        else:
            try:
                # 기존 사용자 로드
                users = []
                if self.users_file.exists():
                    with open(self.users_file, 'r', encoding='utf-8') as f:
                        users = json.load(f)
                
                # 사용자 찾기 및 비밀번호 업데이트
                for u in users:
                    if u['user_id'] == user_id:
                        u['hashed_password'] = hashed_password
                        u['salt'] = salt
                        u['updated_at'] = datetime.now().isoformat()
                        break
                
                # 사용자 저장
                with open(self.users_file, 'w', encoding='utf-8') as f:
                    json.dump(users, f, indent=2, ensure_ascii=False)
            
            except Exception as e:
                self.log_activity(user_id, 'user', 'password_change', False, 
                                 details=f"Error: {str(e)}")
                raise AuthError(f"파일 기반 비밀번호 변경 실패: {str(e)}") from e
        
        # 비밀번호 변경 로그
        self.log_activity(user_id, 'user', 'password_change', True)
        
        return True
    
    def delete_user(self, user_id: str) -> bool:
        """
        사용자 삭제
        
        Args:
            user_id (str): 사용자 ID
            
        Returns:
            bool: 사용자 삭제 성공 여부
            
        Raises:
            AuthError: 사용자를 찾을 수 없거나 삭제 실패 시 발생
        """
        # 사용자 조회
        user = self._get_user_by_id(user_id)
        if not user:
            raise AuthError(f"사용자 삭제 실패: 사용자를 찾을 수 없습니다. ({user_id})")
        
        # 데이터베이스 연결이 있는 경우
        if self.connection:
            try:
                query = f"""
                DELETE FROM {self.user_table}
                WHERE user_id = %s
                """
                params = (user_id,)
                
                self.connection.execute(query, params)
            
            except Exception as e:
                self.log_activity(user_id, 'user', 'delete', False, 
                                 details=f"Error: {str(e)}")
                raise AuthError(f"사용자 삭제 실패: {str(e)}") from e
        
        # 파일 기반 인증을 사용하는 경우
        else:
            try:
                # 기존 사용자 로드
                users = []
                if self.users_file.exists():
                    with open(self.users_file, 'r', encoding='utf-8') as f:
                        users = json.load(f)
                
                # 사용자 필터링
                users = [u for u in users if u['user_id'] != user_id]
                
                # 사용자 저장
                with open(self.users_file, 'w', encoding='utf-8') as f:
                    json.dump(users, f, indent=2, ensure_ascii=False)
            
            except Exception as e:
                self.log_activity(user_id, 'user', 'delete', False, 
                                 details=f"Error: {str(e)}")
                raise AuthError(f"파일 기반 사용자 삭제 실패: {str(e)}") from e
        
        # 사용자와 관련된 모든 세션 무효화
        for session_id in list(self.active_sessions.keys()):
            if self.active_sessions[session_id]['user_id'] == user_id:
                del self.active_sessions[session_id]
        
        # 사용자 삭제 로그
        self.log_activity(user_id, 'user', 'delete', True, 
                         details=f"User deleted: {user.username}")
        
        return True
    
    def get_users(self) -> List[User]:
        """
        모든 사용자 조회
        
        Returns:
            List[User]: 사용자 객체 리스트
        """
        users = []
        
        # 데이터베이스 연결이 있는 경우
        if self.connection:
            try:
                query = f"""
                SELECT user_id, username, email, role, permissions, 
                       last_login, is_active, metadata
                FROM {self.user_table}
                """
                
                results = self.connection.query(query)
                
                for row in results:
                    # permissions 및 metadata JSON 파싱
                    permissions = json.loads(row['permissions']) if row['permissions'] else []
                    metadata = json.loads(row['metadata']) if row['metadata'] else {}
                    
                    user = User(
                        user_id=row['user_id'],
                        username=row['username'],
                        email=row['email'],
                        role=row['role'],
                        permissions=permissions,
                        metadata=metadata
                    )
                    
                    # 추가 필드 설정
                    if row['last_login']:
                        user.last_login = datetime.fromisoformat(row['last_login'])
                    
                    user.is_active = row['is_active']
                    
                    users.append(user)
            
            except Exception as e:
                logger.error(f"사용자 조회 중 오류 발생: {str(e)}")
        
        # 파일 기반 인증을 사용하는 경우
        else:
            try:
                if self.users_file.exists():
                    with open(self.users_file, 'r', encoding='utf-8') as f:
                        user_data_list = json.load(f)
                    
                    for user_data in user_data_list:
                        # 비밀번호 관련 필드 제외
                        if 'hashed_password' in user_data:
                            del user_data['hashed_password']
                        
                        if 'salt' in user_data:
                            del user_data['salt']
                        
                        # 사용자 객체 생성
                        user = User.from_dict(user_data)
                        users.append(user)
            
            except Exception as e:
                logger.error(f"파일 기반 사용자 조회 중 오류 발생: {str(e)}")
        
        return users
    
    def get_user(self, user_id: str) -> Optional[User]:
        """
        특정 사용자 조회
        
        Args:
            user_id (str): 사용자 ID
            
        Returns:
            Optional[User]: 사용자 객체 또는 None
        """
        return self._get_user_by_id(user_id)
    
    def get_user_by_username(self, username: str) -> Optional[User]:
        """
        사용자 이름으로 사용자 조회
        
        Args:
            username (str): 사용자 이름
            
        Returns:
            Optional[User]: 사용자 객체 또는 None
        """
        return self._get_user_by_username(username)
    
    def get_activity_logs(self, user_id: Optional[str] = None, 
                        resource: Optional[str] = None, 
                        action: Optional[str] = None,
                        success: Optional[bool] = None,
                        start_date: Optional[datetime] = None,
                        end_date: Optional[datetime] = None,
                        limit: int = 100) -> List[Dict[str, Any]]:
        """
        활동 로그 조회
        
        Args:
            user_id (Optional[str], optional): 사용자 ID 필터. 기본값은 None.
            resource (Optional[str], optional): 리소스 필터. 기본값은 None.
            action (Optional[str], optional): 액션 필터. 기본값은 None.
            success (Optional[bool], optional): 성공 여부 필터. 기본값은 None.
            start_date (Optional[datetime], optional): 시작 날짜 필터. 기본값은 None.
            end_date (Optional[datetime], optional): 종료 날짜 필터. 기본값은 None.
            limit (int, optional): 결과 제한. 기본값은 100.
            
        Returns:
            List[Dict[str, Any]]: 활동 로그 리스트
        """
        logs = []
        
        # 데이터베이스 연결이 있는 경우
        if self.connection:
            try:
                query_parts = [f"SELECT * FROM {self.auth_log_table}"]
                params = []
                where_clauses = []
                
                # 필터 적용
                if user_id:
                    where_clauses.append("user_id = %s")
                    params.append(user_id)
                
                if resource:
                    where_clauses.append("resource = %s")
                    params.append(resource)
                
                if action:
                    where_clauses.append("action = %s")
                    params.append(action)
                
                if success is not None:
                    where_clauses.append("success = %s")
                    params.append(success)
                
                if start_date:
                    where_clauses.append("timestamp >= %s")
                    params.append(start_date.isoformat())
                
                if end_date:
                    where_clauses.append("timestamp <= %s")
                    params.append(end_date.isoformat())
                
                # WHERE 절 구성
                if where_clauses:
                    query_parts.append("WHERE " + " AND ".join(where_clauses))
                
                # 정렬 및 제한
                query_parts.append("ORDER BY timestamp DESC")
                query_parts.append("LIMIT %s")
                params.append(limit)
                
                # 최종 쿼리 실행
                query = " ".join(query_parts)
                
                logs = self.connection.query(query, tuple(params))
            
            except Exception as e:
                logger.error(f"활동 로그 조회 중 오류 발생: {str(e)}")
        
        # 파일 기반 인증을 사용하는 경우
        else:
            try:
                if self.logs_file.exists():
                    with open(self.logs_file, 'r', encoding='utf-8') as f:
                        all_logs = json.load(f)
                    
                    # 필터 적용
                    filtered_logs = all_logs
                    
                    if user_id:
                        filtered_logs = [log for log in filtered_logs if log.get('user_id') == user_id]
                    
                    if resource:
                        filtered_logs = [log for log in filtered_logs if log.get('resource') == resource]
                    
                    if action:
                        filtered_logs = [log for log in filtered_logs if log.get('action') == action]
                    
                    if success is not None:
                        filtered_logs = [log for log in filtered_logs if log.get('success') == success]
                    
                    if start_date:
                        start_str = start_date.isoformat()
                        filtered_logs = [log for log in filtered_logs if log.get('timestamp', '') >= start_str]
                    
                    if end_date:
                        end_str = end_date.isoformat()
                        filtered_logs = [log for log in filtered_logs if log.get('timestamp', '') <= end_str]
                    
                    # 정렬 및 제한
                    filtered_logs.sort(key=lambda x: x.get('timestamp', ''), reverse=True)
                    logs = filtered_logs[:limit]
            
            except Exception as e:
                logger.error(f"파일 기반 활동 로그 조회 중 오류 발생: {str(e)}")
        
        return logs
    
    def get_role_permissions(self) -> Dict[str, List[str]]:
        """
        역할별 권한 목록 조회
        
        Returns:
            Dict[str, List[str]]: 역할별 권한 목록
        """
        role_permissions = {}
        
        # 모든 사용자 조회
        users = self.get_users()
        
        # 역할별 사용자 그룹화
        for user in users:
            if user.role not in role_permissions:
                role_permissions[user.role] = []
            
            # 권한 추가 (중복 제거)
            for permission in user.permissions:
                if permission not in role_permissions[user.role]:
                    role_permissions[user.role].append(permission)
        
        return role_permissions
    
    def _get_user_by_id(self, user_id: str) -> Optional[User]:
        """
        ID로 사용자 조회
        
        Args:
            user_id (str): 사용자 ID
            
        Returns:
            Optional[User]: 사용자 객체 또는 None
        """
        # 데이터베이스 연결이 있는 경우
        if self.connection:
            try:
                query = f"""
                SELECT user_id, username, email, role, permissions, 
                       last_login, is_active, metadata
                FROM {self.user_table}
                WHERE user_id = %s
                """
                params = (user_id,)
                
                result = self.connection.query_one(query, params)
                
                if not result:
                    return None
                
                # permissions 및 metadata JSON 파싱
                permissions = json.loads(result['permissions']) if result['permissions'] else []
                metadata = json.loads(result['metadata']) if result['metadata'] else {}
                
                user = User(
                    user_id=result['user_id'],
                    username=result['username'],
                    email=result['email'],
                    role=result['role'],
                    permissions=permissions,
                    metadata=metadata
                )
                
                # 추가 필드 설정
                if result['last_login']:
                    user.last_login = datetime.fromisoformat(result['last_login'])
                
                user.is_active = result['is_active']
                
                return user
            
            except Exception as e:
                logger.error(f"사용자 조회 중 오류 발생: {str(e)}")
                return None
        
        # 파일 기반 인증을 사용하는 경우
        else:
            try:
                if self.users_file.exists():
                    with open(self.users_file, 'r', encoding='utf-8') as f:
                        users = json.load(f)
                    
                    for user_data in users:
                        if user_data['user_id'] == user_id:
                            # 비밀번호 관련 필드 제외
                            if 'hashed_password' in user_data:
                                del user_data['hashed_password']
                            
                            if 'salt' in user_data:
                                del user_data['salt']
                            
                            # 사용자 객체 생성
                            return User.from_dict(user_data)
            
            except Exception as e:
                logger.error(f"파일 기반 사용자 조회 중 오류 발생: {str(e)}")
        
        return None
    
    def _get_user_by_username(self, username: str) -> Optional[User]:
        """
        사용자 이름으로 사용자 조회
        
        Args:
            username (str): 사용자 이름
            
        Returns:
            Optional[User]: 사용자 객체 또는 None
        """
        # 데이터베이스 연결이 있는 경우
        if self.connection:
            try:
                query = f"""
                SELECT user_id, username, email, role, permissions, 
                       last_login, is_active, metadata
                FROM {self.user_table}
                WHERE username = %s
                """
                params = (username,)
                
                result = self.connection.query_one(query, params)
                
                if not result:
                    return None
                
                # permissions 및 metadata JSON 파싱
                permissions = json.loads(result['permissions']) if result['permissions'] else []
                metadata = json.loads(result['metadata']) if result['metadata'] else {}
                
                user = User(
                    user_id=result['user_id'],
                    username=result['username'],
                    email=result['email'],
                    role=result['role'],
                    permissions=permissions,
                    metadata=metadata
                )
                
                # 추가 필드 설정
                if result['last_login']:
                    user.last_login = datetime.fromisoformat(result['last_login'])
                
                user.is_active = result['is_active']
                
                return user
            
            except Exception as e:
                logger.error(f"사용자 이름으로 사용자 조회 중 오류 발생: {str(e)}")
                return None
        
        # 파일 기반 인증을 사용하는 경우
        else:
            try:
                if self.users_file.exists():
                    with open(self.users_file, 'r', encoding='utf-8') as f:
                        users = json.load(f)
                    
                    for user_data in users:
                        if user_data['username'] == username:
                            # 비밀번호 관련 필드 제외
                            if 'hashed_password' in user_data:
                                del user_data['hashed_password']
                            
                            if 'salt' in user_data:
                                del user_data['salt']
                            
                            # 사용자 객체 생성
                            return User.from_dict(user_data)
            
            except Exception as e:
                logger.error(f"파일 기반 사용자 이름으로 사용자 조회 중 오류 발생: {str(e)}")
        
        return None
    
    def _get_user_credentials(self, user_id: str) -> Optional[Dict[str, str]]:
        """
        사용자 인증 정보 조회
        
        Args:
            user_id (str): 사용자 ID
            
        Returns:
            Optional[Dict[str, str]]: 인증 정보 (hashed_password, salt) 또는 None
        """
        # 데이터베이스 연결이 있는 경우
        if self.connection:
            try:
                query = f"""
                SELECT hashed_password, salt
                FROM {self.user_table}
                WHERE user_id = %s
                """
                params = (user_id,)
                
                result = self.connection.query_one(query, params)
                
                if not result:
                    return None
                
                return {
                    'hashed_password': result['hashed_password'],
                    'salt': result['salt']
                }
            
            except Exception as e:
                logger.error(f"사용자 인증 정보 조회 중 오류 발생: {str(e)}")
                return None
        
        # 파일 기반 인증을 사용하는 경우
        else:
            try:
                if self.users_file.exists():
                    with open(self.users_file, 'r', encoding='utf-8') as f:
                        users = json.load(f)
                    
                    for user in users:
                        if user['user_id'] == user_id:
                            return {
                                'hashed_password': user['hashed_password'],
                                'salt': user['salt']
                            }
            
            except Exception as e:
                logger.error(f"파일 기반 사용자 인증 정보 조회 중 오류 발생: {str(e)}")
        
        return None
    
    def _hash_password(self, password: str) -> Tuple[str, str]:
        """
        비밀번호 해싱
        
        Args:
            password (str): 원본 비밀번호
            
        Returns:
            Tuple[str, str]: salt와 해시된 비밀번호
        """
        # 솔트 생성
        salt = secrets.token_hex(16)
        
        # 비밀번호 해싱
        hash_obj = hashlib.pbkdf2_hmac(
            'sha256', 
            password.encode('utf-8'),
            salt.encode('utf-8'),
            100000  # 반복 횟수
        )
        
        # 해시를 16진수 문자열로 변환
        hashed_password = hash_obj.hex()
        
        return salt, hashed_password
    
    def _verify_password(self, user_id: str, password: str) -> bool:
        """
        비밀번호 검증
        
        Args:
            user_id (str): 사용자 ID
            password (str): 검증할 비밀번호
            
        Returns:
            bool: 비밀번호 일치 여부
        """
        # 사용자 인증 정보 조회
        credentials = self._get_user_credentials(user_id)
        if not credentials:
            return False
        
        # 저장된 솔트와 해시된 비밀번호
        stored_salt = credentials['salt']
        stored_hash = credentials['hashed_password']
        
        # 입력 비밀번호 해싱
        hash_obj = hashlib.pbkdf2_hmac(
            'sha256', 
            password.encode('utf-8'),
            stored_salt.encode('utf-8'),
            100000  # 반복 횟수 (저장 시와 동일해야 함)
        )
        
        # 해시를 16진수 문자열로 변환
        computed_hash = hash_obj.hex()
        
        # 해시 비교
        return hmac.compare_digest(stored_hash, computed_hash)
    
    def _update_user(self, user: User) -> None:
        """
        사용자 정보 업데이트
        
        Args:
            user (User): 업데이트할 사용자 객체
            
        Raises:
            AuthError: 업데이트 실패 시 발생
        """
        # 데이터베이스 연결이 있는 경우
        if self.connection:
            try:
                query = f"""
                UPDATE {self.user_table}
                SET username = %s, email = %s, role = %s, permissions = %s,
                    last_login = %s, is_active = %s, metadata = %s, updated_at = %s
                WHERE user_id = %s
                """
                
                params = (
                    user.username,
                    user.email,
                    user.role,
                    json.dumps(user.permissions),
                    user.last_login.isoformat() if user.last_login else None,
                    user.is_active,
                    json.dumps(user.metadata),
                    datetime.now().isoformat(),
                    user.user_id
                )
                
                self.connection.execute(query, params)
            
            except Exception as e:
                raise AuthError(f"사용자 업데이트 실패: {str(e)}") from e
        
        # 파일 기반 인증을 사용하는 경우
        else:
            try:
                # 기존 사용자 로드
                users = []
                if self.users_file.exists():
                    with open(self.users_file, 'r', encoding='utf-8') as f:
                        users = json.load(f)
                
                # 사용자 업데이트
                for i, u in enumerate(users):
                    if u['user_id'] == user.user_id:
                        # 비밀번호 관련 필드 보존
                        hashed_password = u.get('hashed_password')
                        salt = u.get('salt')
                        
                        # 사용자 정보 업데이트
                        users[i] = user.to_dict()
                        users[i]['updated_at'] = datetime.now().isoformat()
                        
                        # 비밀번호 관련 필드 복원
                        if hashed_password:
                            users[i]['hashed_password'] = hashed_password
                        
                        if salt:
                            users[i]['salt'] = salt
                        
                        break
                
                # 사용자 저장
                with open(self.users_file, 'w', encoding='utf-8') as f:
                    json.dump(users, f, indent=2, ensure_ascii=False)
            
            except Exception as e:
                raise AuthError(f"파일 기반 사용자 업데이트 실패: {str(e)}") from e

# Flask 인증 통합을 위한 유틸리티 함수
def setup_flask_login(app, auth_system: AuthenticationSystem):
    """
    Flask-Login 설정
    
    Args:
        app: Flask 애플리케이션
        auth_system (AuthenticationSystem): 인증 시스템
    """
    try:
        from flask_login import LoginManager, UserMixin
        
        login_manager = LoginManager()
        login_manager.init_app(app)
        login_manager.login_view = 'login'
        
        # 사용자 로더
        @login_manager.user_loader
        def load_user(user_id):
            user = auth_system.get_user(user_id)
            if not user:
                return None
            
            # Flask-Login 사용자 클래스
            class FlaskUser(UserMixin):
                def __init__(self, user):
                    self.id = user.user_id
                    self.username = user.username
                    self.email = user.email
                    self.role = user.role
                    self.permissions = user.permissions
                    self.is_active = user.is_active
            
            return FlaskUser(user)
        
        return login_manager
    
    except ImportError:
        logger.warning("Flask-Login을 가져올 수 없습니다. Flask 인증 통합이 비활성화됩니다.")
        return None

# 데코레이터를 사용한 권한 확인
def require_permission(auth_system: AuthenticationSystem, resource: str, action: str):
    """
    특정 권한이 필요한 라우트를 위한 데코레이터
    
    Args:
        auth_system (AuthenticationSystem): 인증 시스템
        resource (str): 리소스 이름
        action (str): 액션 이름
        
    Returns:
        Callable: 데코레이터 함수
    """
    def decorator(f):
        from functools import wraps
        from flask import session, abort, current_app, g
        
        @wraps(f)
        def decorated_function(*args, **kwargs):
            # 세션에서 사용자 ID 가져오기
            user_id = session.get('user_id')
            
            if not user_id:
                # 사용자가 로그인하지 않은 경우
                return abort(401)
            
            try:
                # 권한 확인
                auth_system.check_permission(user_id, resource, action)
                
                # 현재 요청에 사용자 정보 설정
                g.user = auth_system.get_user(user_id)
                
                return f(*args, **kwargs)
            
            except PermissionError:
                # 권한이 없는 경우
                return abort(403)
        
        return decorated_function
    
    return decorator
