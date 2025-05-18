#!/usr/bin/env python
"""
인터랙티브 데이터 테이블 테스트 스크립트

이 스크립트는 인터랙티브 데이터 테이블 컴포넌트를 테스트합니다.
"""

import os
import sys
from pathlib import Path
import pandas as pd
import logging

# 로깅 설정
logging.basicConfig(
    level=logging.INFO,
    format='%(asctime)s - %(name)s - %(levelname)s - %(message)s'
)
logger = logging.getLogger(__name__)

# 프로젝트 루트 디렉토리를 시스템 경로에 추가
project_root = Path(__file__).parent.parent
sys.path.append(str(project_root))

# .env 파일 로드
from dotenv import load_dotenv
load_dotenv(project_root / ".env")

import dash
from dash import html, dcc
import dash_bootstrap_components as dbc

from src.visualization.components.interactive_table import InteractiveDataTable, create_column_def
from src.database.mariadb_connection import MariaDBConnection
from src.utils.config import AppConfig

def generate_sample_data():
    """샘플 플레이어 데이터 생성"""
    return [
        {
            "id": 1,
            "name": "홍길동",
            "account": "hong123",
            "status": "active",
            "created_at": "2023-01-15T09:30:00",
            "updated_at": "2023-01-15T09:30:00"
        },
        {
            "id": 2,
            "name": "김철수",
            "account": "kim456",
            "status": "inactive",
            "created_at": "2023-02-20T14:15:00",
            "updated_at": "2023-03-10T11:45:00"
        },
        {
            "id": 3,
            "name": "이영희",
            "account": "lee789",
            "status": "active",
            "created_at": "2023-03-05T10:00:00",
            "updated_at": "2023-03-05T10:00:00"
        },
        {
            "id": 4,
            "name": "박지성",
            "account": "park_js",
            "status": "blocked",
            "created_at": "2023-01-10T08:20:00",
            "updated_at": "2023-04-01T16:30:00"
        },
        {
            "id": 5,
            "name": "최민수",
            "account": "choi_ms",
            "status": "active",
            "created_at": "2023-04-12T11:20:00",
            "updated_at": "2023-04-12T11:20:00"
        }
    ]

def get_real_data():
    """실제 데이터베이스에서 데이터 가져오기"""
    try:
        # MariaDB 연결
        conn = MariaDBConnection()
        
        # 플레이어 데이터 조회
        players = conn.query("SELECT * FROM players LIMIT 100")
        
        # 연결 종료
        conn.close_pool()
        
        return players
    except Exception as e:
        logger.error(f"Error fetching real data: {str(e)}")
        return []

def main():
    """테스트 대시보드 실행"""
    # Dash 앱 생성
    app = dash.Dash(
        __name__,
        external_stylesheets=[dbc.themes.BOOTSTRAP],
        assets_folder=str(project_root / "static"),
    )
    
    # 설정 확인
    config = AppConfig()
    logger.info(f"Using configuration: {config}")
    
    # 샘플 데이터 또는 실제 데이터 사용
    use_real_data = os.environ.get('USE_REAL_DATA', 'false').lower() == 'true'
    data = get_real_data() if use_real_data else generate_sample_data()
    
    # 플레이어 테이블 열 정의
    player_columns = [
        create_column_def(field="id", header_name="ID", width=100, pinned="left", checkboxSelection=True),
        create_column_def(field="name", header_name="이름", width=150),
        create_column_def(field="account", header_name="계정", width=180),
        create_column_def(field="status", header_name="상태", width=120),
        create_column_def(field="created_at", header_name="생성일", width=180),
        create_column_def(field="updated_at", header_name="수정일", width=180),
    ]
    
    # 인터랙티브 테이블 생성
    player_table = InteractiveDataTable(
        id="test-players-table",
        title="플레이어 목록",
        description="인터랙티브 데이터 테이블 컴포넌트 테스트입니다.",
        height="600px",
        page_size=25,
        exportable=True,
    ).configure_columns(player_columns).set_data(data)
    
    # 레이아웃 생성
    app.layout = dbc.Container([
        html.H1("인터랙티브 데이터 테이블 테스트", className="my-4"),
        
        dbc.Row([
            dbc.Col([
                dbc.Card([
                    dbc.CardBody([
                        html.H4("테스트 옵션", className="card-title"),
                        dbc.Form([
                            dbc.Row([
                                dbc.Col([
                                    dbc.Label("상태 필터"),
                                    dcc.Dropdown(
                                        id="status-filter",
                                        options=[
                                            {"label": "모두", "value": "all"},
                                            {"label": "활성", "value": "active"},
                                            {"label": "비활성", "value": "inactive"},
                                            {"label": "차단됨", "value": "blocked"},
                                        ],
                                        value="all",
                                        clearable=False,
                                    ),
                                ], width=4),
                                dbc.Col([
                                    dbc.Label("데이터 소스"),
                                    dbc.RadioItems(
                                        id="data-source",
                                        options=[
                                            {"label": "샘플 데이터", "value": "sample"},
                                            {"label": "실제 데이터", "value": "real"},
                                        ],
                                        value="sample" if not use_real_data else "real",
                                        inline=True,
                                    ),
                                ], width=4),
                                dbc.Col([
                                    dbc.Label("민감한 정보 마스킹"),
                                    dbc.Checklist(
                                        id="masking-toggle",
                                        options=[
                                            {"label": "이름 숨기기", "value": "hide_names"},
                                            {"label": "ID 숨기기", "value": "hide_ids"},
                                            {"label": "전화번호 숨기기", "value": "hide_phones"},
                                        ],
                                        value=["hide_names", "hide_ids", "hide_phones"] if (
                                            config.get('display', 'hide_player_names', True) and 
                                            config.get('display', 'hide_player_numbers', True) and
                                            config.get('display', 'hide_phone_numbers', True)
                                        ) else [],
                                        inline=True,
                                    ),
                                ], width=4),
                            ]),
                            dbc.Button("필터 적용", id="apply-filter", color="primary", className="mt-3"),
                        ]),
                    ]),
                ], className="mb-4"),
            ]),
        ]),
        
        dbc.Row([
            dbc.Col([
                # 인터랙티브 테이블 렌더링
                player_table.render(),
            ]),
        ]),
        
        dbc.Row([
            dbc.Col([
                html.Div(id="selection-output", className="mt-4"),
            ]),
        ]),
        
    ], fluid=True)
    
    # 콜백 등록
    player_table.register_callbacks(app)
    
    @app.callback(
        dash.Output("test-players-table-grid", "rowData"),
        dash.Input("apply-filter", "n_clicks"),
        [dash.State("status-filter", "value"),
         dash.State("data-source", "value"),
         dash.State("masking-toggle", "value")],
        prevent_initial_call=False
    )
    def update_table_data(n_clicks, status, data_source, masking_options):
        # 설정 업데이트
        config = AppConfig()
        config.set('display', 'hide_player_names', 'hide_names' in masking_options)
        config.set('display', 'hide_player_numbers', 'hide_ids' in masking_options)
        config.set('display', 'hide_phone_numbers', 'hide_phones' in masking_options)
        
        # 데이터 소스 선택
        if data_source == "real":
            data = get_real_data()
        else:
            data = generate_sample_data()
        
        # 필터 적용
        if status != "all":
            data = [item for item in data if item.get("status") == status]
        
        # 데이터 마스킹 적용
        masked_data = mask_sensitive_data(data)
        
        return masked_data
    
    @app.callback(
        dash.Output("selection-output", "children"),
        dash.Input("test-players-table-grid", "selectedRows"),
    )
    def display_selected_rows(selected_rows):
        if not selected_rows:
            return "선택된 행이 없습니다."
        
        return [
            html.H4("선택된 행 정보", className="mb-3"),
            html.Pre(
                json.dumps(selected_rows, indent=2, ensure_ascii=False),
                style={"background-color": "#f8f9fa", "padding": "15px", "border-radius": "5px"}
            ),
        ]
    
    # 앱 실행
    app.run_server(debug=True, port=8050)

if __name__ == "__main__":
    import json
    main()
