"""
Flask 인증 통합 모듈

이 모듈은 Flask 애플리케이션에 인증 시스템을 통합하는 기능을 제공합니다.
"""

import os
from functools import wraps
import logging
from typing import Dict, List, Optional, Any, Callable
from flask import Flask, request, session, redirect, url_for, flash, g, jsonify, abort
from flask_login import LoginManager, login_user, logout_user, login_required, current_user

from src.utils.auth import AuthenticationSystem, User, AuthError, PermissionError

# 로깅 설정
logger = logging.getLogger(__name__)

class FlaskAuthIntegration:
    """
    Flask 애플리케이션에 인증 시스템을 통합하는 클래스
    
    이 클래스는 AuthenticationSystem을 Flask 애플리케이션에 통합하여
    로그인, 로그아웃, 권한 확인 등의 기능을 제공합니다.
    """
    
    def __init__(self, app: Flask, auth_system: AuthenticationSystem, 
                login_view: str = 'login', use_jwt: bool = False):
        """
        FlaskAuthIntegration 초기화
        
        Args:
            app (Flask): Flask 애플리케이션
            auth_system (AuthenticationSystem): 인증 시스템
            login_view (str, optional): 로그인 페이지 뷰 이름. 기본값은 'login'.
            use_jwt (bool, optional): JWT 토큰 인증 사용 여부. 기본값은 False.
        """
        self.app = app
        self.auth_system = auth_system
        self.login_view = login_view
        self.use_jwt = use_jwt
        
        # Flask-Login 설정
        self.login_manager = LoginManager()
        self.login_manager.init_app(app)
        self.login_manager.login_view = login_view
        
        # 사용자 로더 등록
        @self.login_manager.user_loader
        def load_user(user_id):
            return self._load_user(user_id)
        
        # 기본 경로 등록
        self._register_auth_routes()
        
        # JWT 미들웨어 등록 (사용하는 경우)
        if use_jwt:
            self._register_jwt_middleware()
    
    def _load_user(self, user_id: str) -> Any:
        """
        Flask-Login 사용자 로더
        
        Args:
            user_id (str): 사용자 ID
            
        Returns:
            Any: Flask-Login 사용자 객체 또는 None
        """
        # AuthenticationSystem에서 사용자 조회
        user = self.auth_system.get_user(user_id)
        if not user:
            return None
        
        # Flask-Login 사용자 클래스
        from flask_login import UserMixin
        
        class FlaskUser(UserMixin):
            def __init__(self, user: User):
                self.id = user.user_id
                self.user = user
                self.username = user.username
                self.email = user.email
                self.role = user.role
                self.permissions = user.permissions
                self.is_active = user.is_active
            
            def has_permission(self, resource: str, action: str) -> bool:
                """
                권한 확인
                
                Args:
                    resource (str): 리소스 이름
                    action (str): 액션 이름
                    
                Returns:
                    bool: 권한 있음 여부
                """
                return self.user.role == 'admin' or f"{resource}:{action}" in self.permissions
        
        return FlaskUser(user)
    
    def _register_auth_routes(self):
        """기본 인증 경로 등록"""
        
        # 로그인 경로
        @self.app.route('/login', methods=['GET', 'POST'])
        def login():
            if request.method == 'POST':
                username = request.form.get('username')
                password = request.form.get('password')
                remember = bool(request.form.get('remember', False))
                
                try:
                    # 사용자 인증
                    success, user = self.auth_system.authenticate_user(username, password)
                    
                    if success and user:
                        # Flask-Login 인증
                        flask_user = self._load_user(user.user_id)
                        login_user(flask_user, remember=remember)
                        
                        # 세션에 사용자 ID 저장
                        session['user_id'] = user.user_id
                        
                        # JWT 토큰 생성 (사용하는 경우)
                        if self.use_jwt:
                            token = self.auth_system.create_jwt_token(user.user_id)
                            session['jwt_token'] = token
                        
                        # 로그인 후 리디렉션
                        next_page = request.args.get('next')
                        if not next_page or not next_page.startswith('/'):
                            next_page = url_for('index')
                        
                        return redirect(next_page)
                    else:
                        flash('Invalid username or password', 'error')
                
                except AuthError as e:
                    flash(str(e), 'error')
                    logger.error(f"Login error: {str(e)}")
            
            # GET 요청이거나 로그인 실패 시 로그인 페이지 반환
            return self.app.send_static_file('login.html')
        
        # 로그아웃 경로
        @self.app.route('/logout')
        @login_required
        def logout():
            # 세션에서 사용자 ID 가져오기
            user_id = session.get('user_id')
            
            if user_id:
                # 세션 무효화
                session_id = session.get('session_id')
                if session_id:
                    self.auth_system.invalidate_session(session_id)
                
                # 세션 초기화
                session.clear()
            
            # Flask-Login 로그아웃
            logout_user()
            
            # 로그아웃 후 리디렉션
            return redirect(url_for('login'))
        
        # 사용자 프로필 경로
        @self.app.route('/profile')
        @login_required
        def profile():
            # 현재 사용자 정보 반환
            return jsonify({
                'user_id': current_user.id,
                'username': current_user.username,
                'email': current_user.email,
                'role': current_user.role,
                'permissions': current_user.permissions
            })
    
    def _register_jwt_middleware(self):
        """JWT 미들웨어 등록"""
        
        @self.app.before_request
        def jwt_auth_middleware():
            # 인증이 필요 없는 경로는 건너뛰기
            if request.path == '/login' or request.path.startswith('/static/'):
                return
            
            # 요청에서 JWT 토큰 가져오기
            token = None
            auth_header = request.headers.get('Authorization')
            
            if auth_header and auth_header.startswith('Bearer '):
                token = auth_header.split(' ')[1]
            else:
                token = request.cookies.get('jwt_token') or session.get('jwt_token')
            
            if not token:
                # API 요청인 경우 401 반환
                if request.path.startswith('/api/'):
                    return jsonify({'error': 'Authentication required'}), 401
                
                # 웹 요청인 경우 로그인 페이지로 리디렉션
                if not current_user.is_authenticated:
                    return redirect(url_for(self.login_view, next=request.path))
                
                return
            
            # 토큰 ���증
            is_valid, claims = self.auth_system.validate_jwt_token(token)
            
            if not is_valid:
                # API 요청인 경우 401 반환
                if request.path.startswith('/api/'):
                    return jsonify({'error': 'Invalid or expired token'}), 401
                
                # 웹 요청인 경우 로그인 페이지로 리디렉션
                return redirect(url_for(self.login_view, next=request.path))
            
            # 사용자 조회
            user_id = claims['sub']
            user = self.auth_system.get_user(user_id)
            
            if not user:
                # 사용자가 없는 경우
                if request.path.startswith('/api/'):
                    return jsonify({'error': 'User not found'}), 401
                
                return redirect(url_for(self.login_view, next=request.path))
            
            # 현재 요청에 사용자 정보 설정
            g.user = user
            g.user_id = user_id
    
    def require_permission(self, resource: str, action: str):
        """
        특정 권한이 필요한 라우트를 위한 데코레이터
        
        Args:
            resource (str): 리소스 이름
            action (str): 액션 이름
            
        Returns:
            Callable: 데코레이터 함수
        """
        def decorator(f):
            @wraps(f)
            def decorated_function(*args, **kwargs):
                # 세션에서 사용자 ID 가져오기
                user_id = session.get('user_id')
                
                if not user_id:
                    # 사용자가 로그인하지 않은 경우
                    if request.path.startswith('/api/'):
                        return jsonify({'error': 'Authentication required'}), 401
                    
                    return redirect(url_for(self.login_view, next=request.path))
                
                try:
                    # 권한 확인
                    self.auth_system.check_permission(user_id, resource, action)
                    
                    # 현재 요청에 사용자 정보 설정
                    g.user = self.auth_system.get_user(user_id)
                    
                    return f(*args, **kwargs)
                
                except PermissionError:
                    # 권한이 없는 경우
                    if request.path.startswith('/api/'):
                        return jsonify({'error': 'Permission denied'}), 403
                    
                    return abort(403)
            
            return decorated_function
        
        return decorator

# Flask 애플리케이션 설정 예시
def create_app(auth_system: AuthenticationSystem = None, config: Dict[str, Any] = None):
    """
    Flask 애플리케이션 생성 및 설정
    
    Args:
        auth_system (AuthenticationSystem, optional): 인증 시스템. 기본값은 None.
        config (Dict[str, Any], optional): 애플리케이션 설정. 기본값은 None.
        
    Returns:
        Tuple[Flask, FlaskAuthIntegration]: Flask 애플리케이션과 인증 통합 객체
    """
    app = Flask(__name__, static_folder='static', template_folder='templates')
    
    # 기본 설정
    app.config['SECRET_KEY'] = os.environ.get('FLASK_SECRET_KEY', 'development-secret-key')
    app.config['SESSION_TYPE'] = 'filesystem'
    app.config['SESSION_PERMANENT'] = False
    app.config['PERMANENT_SESSION_LIFETIME'] = 3600  # 1시간
    
    # 추가 설정 적용
    if config:
        app.config.update(config)
    
    # 인증 시스템 생성 (필요한 경우)
    if not auth_system:
        auth_system = AuthenticationSystem(secret_key=app.config['SECRET_KEY'])
    
    # 인증 통합
    auth_integration = FlaskAuthIntegration(app, auth_system, use_jwt=config.get('USE_JWT', False))
    
    # 기본 경로
    @app.route('/')
    def index():
        return app.send_static_file('index.html')
    
    # 보호된 경로 예시
    @app.route('/dashboard')
    @login_required
    def dashboard():
        return app.send_static_file('dashboard.html')
    
    # 권한이 필요한 경로 예시
    @app.route('/reports')
    @auth_integration.require_permission('reports', 'view')
    def reports():
        return app.send_static_file('reports.html')
    
    # API 경로 예시
    @app.route('/api/user')
    @login_required
    def api_user():
        if hasattr(g, 'user') and g.user:
            return jsonify(g.user.to_dict())
        elif current_user.is_authenticated:
            return jsonify({
                'user_id': current_user.id,
                'username': current_user.username,
                'email': current_user.email,
                'role': current_user.role,
                'permissions': current_user.permissions
            })
        else:
            return jsonify({'error': 'User not authenticated'}), 401
    
    return app, auth_integration
