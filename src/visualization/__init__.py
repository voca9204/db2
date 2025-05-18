"""
데이터 시각화 및 대시보드 애플리케이션 초기화 모듈

이 모듈은 Flask 애플리케이션을 초기화하고 구성합니다.
Dash 대시보드와 RESTful API를 설정합니다.
"""

import os
from flask import Flask
from flask_cors import CORS
from datetime import datetime
import logging

# 로깅 설정
logging.basicConfig(
    level=logging.INFO,
    format='%(asctime)s - %(name)s - %(levelname)s - %(message)s'
)
logger = logging.getLogger(__name__)

def create_app(test_config=None):
    """
    Flask 애플리케이션 팩토리 함수
    
    Args:
        test_config (dict, optional): 테스트용 설정. 기본값은 None.
        
    Returns:
        Flask: 초기화된 Flask 애플리케이션
    """
    # Flask 애플리케이션 생성
    app = Flask(__name__,
                static_folder='../../static',
                template_folder='templates')
    
    # CORS 설정
    CORS(app)
    
    # 기본 설정
    app.config.from_mapping(
        SECRET_KEY=os.environ.get('SECRET_KEY', 'dev'),
        DATABASE_URI=os.environ.get('DATABASE_URI', 'sqlite:///db2.sqlite'),
        REDIS_URL=os.environ.get('REDIS_URL', 'redis://localhost:6379/0'),
        DEBUG=os.environ.get('FLASK_DEBUG', 'true').lower() == 'true'
    )
    
    # 테스트 설정 적용
    if test_config is not None:
        app.config.update(test_config)
    
    # 기본 라우트
    @app.route('/')
    def index():
        from flask import render_template
        return render_template('index.html', title='DB2 Dashboard')
    
    # 상태 확인 엔드포인트
    @app.route('/health')
    def health():
        return {
            'status': 'ok',
            'timestamp': datetime.now().isoformat(),
            'version': '0.1.0'
        }
    
    # API 블루프린트 등록
    from .api import bp as api_bp
    app.register_blueprint(api_bp, url_prefix='/api')
    
    # 대시보드 등록
    from .dashboards.main_dashboard import init_dashboard
    app = init_dashboard(app)
    
    logger.info("Flask application initialized")
    return app
