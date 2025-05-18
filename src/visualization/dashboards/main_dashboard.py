"""
메인 대시보드 모듈

이 모듈은 Dash를 사용하여 메인 대시보드를 구현합니다.
"""

import logging
from pathlib import Path
import json
from datetime import datetime, timedelta

import dash
from dash import html, dcc, Input, Output, State, callback
import dash_bootstrap_components as dbc
import plotly.express as px
import plotly.graph_objects as go
import pandas as pd

from ..components.interactive_table import InteractiveDataTable, create_column_def

logger = logging.getLogger(__name__)

def init_dashboard(server):
    """
    Dash 대시보드 초기화
    
    Args:
        server: Flask 서버
        
    Returns:
        app: 초기화된 Dash 애플리케이션
    """
    # Dash 애플리케이션 생성
    app = dash.Dash(
        __name__,
        server=server,
        url_base_pathname='/dashboard/',
        external_stylesheets=[dbc.themes.BOOTSTRAP],
        suppress_callback_exceptions=True
    )
    
    # 레이아웃 설정
    app.layout = html.Div([
        dcc.Location(id='url', refresh=False),
        
        # 네비게이션 바
        dbc.NavbarSimple(
            brand="DB2 대시보드",
            brand_href="/dashboard/",
            color="primary",
            dark=True,
            children=[
                dbc.NavItem(dbc.NavLink("플레이어", href="/dashboard/players")),
                dbc.NavItem(dbc.NavLink("지갑", href="/dashboard/wallets")),
                dbc.NavItem(dbc.NavLink("분석", href="/dashboard/analytics")),
            ],
        ),
        
        # 콘텐츠 영역
        dbc.Container(id='page-content', className="mt-4", fluid=True),
        
        # 푸터
        html.Footer(
            dbc.Container([
                html.Hr(),
                html.P("DB2 프로젝트 © 2025", className="text-center text-muted"),
            ], fluid=True),
            className="mt-5"
        ),
    ])
    
    @app.callback(
        Output('page-content', 'children'),
        Input('url', 'pathname')
    )
    def display_page(pathname):
        if pathname == '/dashboard/players':
            return create_players_layout()
        elif pathname == '/dashboard/wallets':
            return create_wallets_layout()
        elif pathname == '/dashboard/analytics':
            return create_analytics_layout()
        else:
            return create_home_layout()
    
    # 플레이어 테이블 콜백 등록
    register_player_callbacks(app)
    
    logger.info("Dash application initialized")
    return server

def create_home_layout():
    """
    홈 페이지 레이아웃 생성
    
    Returns:
        html.Div: 홈 페이지 레이아웃
    """
    return html.Div([
        dbc.Row([
            dbc.Col([
                html.H1("DB2 프로젝트 대시보드", className="mb-4"),
                html.P("이 대시보드는 Hermes 데이터베이스의 데이터를 인터랙티브하게 탐색하고 분석할 수 있는 도구를 제공합니다."),
                
                html.Div([
                    html.H4("주요 기능", className="mt-4 mb-3"),
                    dbc.Row([
                        dbc.Col([
                            dbc.Card([
                                html.Img(src="/static/imgs/players_icon.png", className="card-img-top p-3"),
                                dbc.CardBody([
                                    html.H5("플레이어 관리", className="card-title"),
                                    html.P("플레이어 데이터를 조회하고 관리합니다.", className="card-text"),
                                    dbc.Button("플레이어 보기", color="primary", href="/dashboard/players"),
                                ]),
                            ]),
                        ], width=4),
                        dbc.Col([
                            dbc.Card([
                                html.Img(src="/static/imgs/wallets_icon.png", className="card-img-top p-3"),
                                dbc.CardBody([
                                    html.H5("지갑 관리", className="card-title"),
                                    html.P("플레이어 지갑 데이터를 조회하고 관리합니다.", className="card-text"),
                                    dbc.Button("지갑 보기", color="primary", href="/dashboard/wallets"),
                                ]),
                            ]),
                        ], width=4),
                        dbc.Col([
                            dbc.Card([
                                html.Img(src="/static/imgs/analytics_icon.png", className="card-img-top p-3"),
                                dbc.CardBody([
                                    html.H5("데이터 분석", className="card-title"),
                                    html.P("데이터 패턴과 트렌드를 분석합니다.", className="card-text"),
                                    dbc.Button("분석 보기", color="primary", href="/dashboard/analytics"),
                                ]),
                            ]),
                        ], width=4),
                    ]),
                ]),
            ]),
        ]),
    ])

def create_players_layout():
    """
    플레이어 페이지 레이아웃 생성
    
    Returns:
        html.Div: 플레이어 페이지 레이아웃
    """
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
        id="players-table",
        title="플레이어 목록",
        description="시스템에 등록된 모든 플레이어의 목록입니다.",
        height="600px",
        page_size=25,
        exportable=True,
    ).configure_columns(player_columns)
    
    # 레이아웃 생성
    return html.Div([
        dbc.Row([
            dbc.Col([
                html.H2("플레이어 관리", className="mb-4"),
                
                # 필터링 및 검색 컨트롤
                dbc.Card([
                    dbc.CardBody([
                        dbc.Row([
                            dbc.Col([
                                html.Label("상태"),
                                dcc.Dropdown(
                                    id="player-status-filter",
                                    options=[
                                        {"label": "모두", "value": "all"},
                                        {"label": "활성", "value": "active"},
                                        {"label": "비활성", "value": "inactive"},
                                        {"label": "차단됨", "value": "blocked"},
                                    ],
                                    value="all",
                                    clearable=False,
                                ),
                            ], width=3),
                            dbc.Col([
                                html.Label("검색"),
                                dbc.Input(id="player-search", type="text", placeholder="이름 또는 계정으로 검색"),
                            ], width=6),
                            dbc.Col([
                                html.Label("\u00A0"),  # 빈 라벨로 정렬 유지
                                dbc.Button("검색", id="player-search-button", color="primary", className="w-100"),
                            ], width=3),
                        ]),
                    ]),
                ], className="mb-4"),
                
                # 플레이어 데이터 테이블
                dbc.Row([
                    dbc.Col([
                        player_table.render(),
                    ]),
                ]),
                
                # 선택된 플레이어 상세 정보
                html.Div(id="player-detail-section", className="mt-4"),
            ]),
        ]),
    ])

def create_wallets_layout():
    """
    지갑 페이지 레이아웃 생성
    
    Returns:
        html.Div: 지갑 페이지 레이아웃
    """
    # 지갑 테이블 열 정의
    wallet_columns = [
        create_column_def(field="id", header_name="ID", width=100, pinned="left", checkboxSelection=True),
        create_column_def(field="player_id", header_name="플레이어 ID", width=120),
        create_column_def(field="player_name", header_name="플레이어 이름", width=150),
        create_column_def(field="currency", header_name="통화", width=100),
        create_column_def(field="balance", header_name="잔액", width=150, type="numericColumn"),
        create_column_def(field="created_at", header_name="생성일", width=180),
        create_column_def(field="updated_at", header_name="수정일", width=180),
    ]
    
    # 인터랙티브 테이블 생성
    wallet_table = InteractiveDataTable(
        id="wallets-table",
        title="지갑 목록",
        description="플레이어 지갑 목록입니다.",
        height="600px",
        page_size=25,
        exportable=True,
    ).configure_columns(wallet_columns)
    
    # 레이아웃 생성
    return html.Div([
        dbc.Row([
            dbc.Col([
                html.H2("지갑 관리", className="mb-4"),
                
                # 필터링 및 검색 컨트롤
                dbc.Card([
                    dbc.CardBody([
                        dbc.Row([
                            dbc.Col([
                                html.Label("통화"),
                                dcc.Dropdown(
                                    id="wallet-currency-filter",
                                    options=[
                                        {"label": "모두", "value": "all"},
                                        {"label": "USD", "value": "USD"},
                                        {"label": "EUR", "value": "EUR"},
                                        {"label": "KRW", "value": "KRW"},
                                    ],
                                    value="all",
                                    clearable=False,
                                ),
                            ], width=3),
                            dbc.Col([
                                html.Label("최소 잔액"),
                                dbc.Input(id="min-balance-filter", type="number", value=0),
                            ], width=3),
                            dbc.Col([
                                html.Label("플레이어 검색"),
                                dbc.Input(id="wallet-player-search", type="text", placeholder="플레이어 이름 또는 ID로 검색"),
                            ], width=4),
                            dbc.Col([
                                html.Label("\u00A0"),  # 빈 라벨로 정렬 유지
                                dbc.Button("검색", id="wallet-search-button", color="primary", className="w-100"),
                            ], width=2),
                        ]),
                    ]),
                ], className="mb-4"),
                
                # 지갑 데이터 테이블
                dbc.Row([
                    dbc.Col([
                        wallet_table.render(),
                    ]),
                ]),
                
                # 지갑 통계 섹션
                html.Div(id="wallet-stats-section", className="mt-4"),
            ]),
        ]),
    ])

def create_analytics_layout():
    """
    분석 페이지 레이아웃 생성
    
    Returns:
        html.Div: 분석 페이지 레이아웃
    """
    return html.Div([
        dbc.Row([
            dbc.Col([
                html.H2("데이터 분석", className="mb-4"),
                
                # 날짜 범위 선택
                dbc.Card([
                    dbc.CardBody([
                        dbc.Row([
                            dbc.Col([
                                html.Label("날짜 범위"),
                                dcc.DatePickerRange(
                                    id="date-range-picker",
                                    start_date=(datetime.now() - timedelta(days=30)).date(),
                                    end_date=datetime.now().date(),
                                    display_format="YYYY-MM-DD",
                                ),
                            ], width=6),
                            dbc.Col([
                                html.Label("분석 유형"),
                                dcc.Dropdown(
                                    id="analytics-type",
                                    options=[
                                        {"label": "플레이어 상태 분포", "value": "player-status"},
                                        {"label": "지갑 잔액 분포", "value": "wallet-balance"},
                                        {"label": "시간별 플레이어 활동", "value": "player-activity"},
                                    ],
                                    value="player-status",
                                    clearable=False,
                                ),
                            ], width=4),
                            dbc.Col([
                                html.Label("\u00A0"),  # 빈 라벨로 정렬 유지
                                dbc.Button("분석", id="run-analytics-button", color="primary", className="w-100"),
                            ], width=2),
                        ]),
                    ]),
                ], className="mb-4"),
                
                # 그래프 및 분석 결과
                dbc.Card([
                    dbc.CardBody([
                        dcc.Loading(
                            id="analytics-loading",
                            type="default",
                            children=html.Div(id="analytics-content"),
                        ),
                    ]),
                ]),
            ]),
        ]),
    ])

def register_player_callbacks(app):
    """
    플레이어 페이지 콜백 등록
    
    Args:
        app: Dash 애플리케이션
    """
    # 플레이어 데이터 로드 콜백
    @app.callback(
        Output("players-table-grid", "rowData"),
        [Input("player-search-button", "n_clicks")],
        [State("player-status-filter", "value"),
         State("player-search", "value")],
        prevent_initial_call=False
    )
    def load_player_data(n_clicks, status, search_text):
        # API 호출을 통해 실제 데이터를 가져오는 대신 샘플 데이터 사용
        # 실제 구현에서는 requests를 사용하여 API 호출
        sample_data = [
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
        
        # 필터링 적용
        filtered_data = sample_data
        
        if status and status != "all":
            filtered_data = [player for player in filtered_data if player["status"] == status]
        
        if search_text:
            search_text = search_text.lower()
            filtered_data = [
                player for player in filtered_data 
                if search_text in player["name"].lower() or search_text in player["account"].lower()
            ]
        
        return filtered_data
