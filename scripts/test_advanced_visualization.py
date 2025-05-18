#!/usr/bin/env python
"""
고급 데이터 시각화 컴포넌트 테스트 스크립트

이 스크립트는 고급 데이터 시각화 컴포넌트를 테스트합니다.
"""

import os
import sys
from pathlib import Path
import pandas as pd
import numpy as np
import logging
import json
from datetime import datetime, timedelta

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
from dash import html, dcc, Input, Output, State, callback
import dash_bootstrap_components as dbc
import plotly.express as px

from src.visualization.components.advanced_visualization import Chart, KPI, Dashboard, Map
from src.database.mariadb_connection import MariaDBConnection
from src.utils.config import AppConfig

def generate_sample_data_player_status():
    """플레이어 상태 샘플 데이터 생성"""
    return [
        {"status": "active", "count": 120},
        {"status": "inactive", "count": 45},
        {"status": "blocked", "count": 15},
        {"status": "pending", "count": 30},
    ]

def generate_sample_data_player_activity():
    """플레이어 활동 샘플 데이터 생성"""
    dates = pd.date_range(end=datetime.now(), periods=30, freq='D')
    data = []
    
    for date in dates:
        data.append({
            "date": date.strftime("%Y-%m-%d"),
            "logins": np.random.randint(50, 200),
            "transactions": np.random.randint(20, 100),
            "games_played": np.random.randint(30, 150),
        })
    
    return data

def generate_sample_data_wallet_balances():
    """지갑 잔액 샘플 데이터 생성"""
    currencies = ["USD", "EUR", "KRW"]
    data = []
    
    for currency in currencies:
        for i in range(20):
            balance = np.random.lognormal(mean=np.random.uniform(3, 8), sigma=1.2)
            data.append({
                "currency": currency,
                "balance": round(balance, 2),
                "player_id": i + 1,
                "transaction_count": np.random.randint(1, 50),
            })
    
    return data

def generate_sample_geo_data():
    """지리 데이터 샘플 생성"""
    # 한국의 주요 도시
    cities = [
        {"city": "서울", "lat": 37.5665, "lon": 126.9780, "users": 450, "active_ratio": 0.78},
        {"city": "부산", "lat": 35.1796, "lon": 129.0756, "users": 280, "active_ratio": 0.72},
        {"city": "인천", "lat": 37.4563, "lon": 126.7052, "users": 210, "active_ratio": 0.69},
        {"city": "대구", "lat": 35.8714, "lon": 128.6014, "users": 180, "active_ratio": 0.75},
        {"city": "대전", "lat": 36.3504, "lon": 127.3845, "users": 150, "active_ratio": 0.81},
        {"city": "광주", "lat": 35.1595, "lon": 126.8526, "users": 140, "active_ratio": 0.73},
        {"city": "울산", "lat": 35.5384, "lon": 129.3114, "users": 120, "active_ratio": 0.68},
        {"city": "수원", "lat": 37.2636, "lon": 127.0286, "users": 100, "active_ratio": 0.71},
        {"city": "창원", "lat": 35.2322, "lon": 128.6811, "users": 90, "active_ratio": 0.67},
        {"city": "고양", "lat": 37.6583, "lon": 126.8320, "users": 85, "active_ratio": 0.72},
        {"city": "용인", "lat": 37.2410, "lon": 127.1775, "users": 80, "active_ratio": 0.69},
        {"city": "성남", "lat": 37.4386, "lon": 127.1378, "users": 75, "active_ratio": 0.74},
    ]
    
    return cities

def get_real_data_player_status():
    """실제 데이터베이스에서 플레이어 상태 데이터 가져오기"""
    try:
        # MariaDB 연결
        conn = MariaDBConnection()
        
        # 플레이어 상태별 수 조회
        data = conn.query("""
            SELECT status, COUNT(*) as count
            FROM players
            GROUP BY status
        """)
        
        # 연결 종료
        conn.close_pool()
        
        return data
    except Exception as e:
        logger.error(f"Error fetching player status data: {str(e)}")
        return []

def get_real_data_player_activity():
    """실제 데이터베이스에서 플레이어 활동 데이터 가져오기"""
    try:
        # MariaDB 연결
        conn = MariaDBConnection()
        
        # 최근 30일간 일별 활동 조회
        data = conn.query("""
            SELECT 
                DATE(created_at) as date,
                COUNT(*) as activity_count,
                'login' as activity_type
            FROM player_comments
            WHERE created_at >= DATE_SUB(CURDATE(), INTERVAL 30 DAY)
            GROUP BY DATE(created_at)
            ORDER BY date
        """)
        
        # 연결 종료
        conn.close_pool()
        
        return data
    except Exception as e:
        logger.error(f"Error fetching player activity data: {str(e)}")
        return []

def main():
    """테스트 대시보드 실행"""
    # Dash 앱 생성
    app = dash.Dash(
        __name__,
        external_stylesheets=[dbc.themes.BOOTSTRAP, "https://use.fontawesome.com/releases/v5.15.4/css/all.css"],
        assets_folder=str(project_root / "static"),
    )
    
    # 샘플 데이터 또는 실제 데이터 사용
    use_real_data = os.environ.get('USE_REAL_DATA', 'false').lower() == 'true'
    
    # 플레이어 상태 데이터
    player_status_data = get_real_data_player_status() if use_real_data else generate_sample_data_player_status()
    
    # 플레이어 활동 데이터
    player_activity_data = get_real_data_player_activity() if use_real_data else generate_sample_data_player_activity()
    
    # 지갑 잔액 데이터
    wallet_balances_data = generate_sample_data_wallet_balances()
    
    # 지리 데이터
    geo_data = generate_sample_geo_data()
    
    # 차트 컴포넌트 생성
    player_status_chart = Chart(
        id="player-status-chart",
        title="플레이어 상태 분포",
        description="상태별 플레이어 수",
        height=400,
        chart_type='pie',
    ).set_data(
        data=player_status_data,
        x="status",
        y="count",
        labels={"status": "상태", "count": "플레이어 수"}
    )
    
    player_activity_chart = Chart(
        id="player-activity-chart",
        title="플레이어 활동 추이",
        description="최근 30일간 일별 활동 지표",
        height=400,
        chart_type='line',
    ).set_data(
        data=player_activity_data,
        x="date",
        y=["logins", "transactions", "games_played"],
        labels={"date": "날짜", "logins": "로그인 수", "transactions": "거래 수", "games_played": "게임 플레이 수"}
    )
    
    wallet_balance_chart = Chart(
        id="wallet-balance-chart",
        title="통화별 지갑 잔액 분포",
        description="통화별 평균 지갑 잔액",
        height=400,
        chart_type='bar',
    ).set_data(
        data=pd.DataFrame(wallet_balances_data).groupby('currency').agg({'balance': 'mean'}).reset_index(),
        x="currency",
        y="balance",
        labels={"currency": "통화", "balance": "평균 잔액"}
    )
    
    # KPI 컴포넌트 생성
    total_players_kpi = KPI(
        id="total-players-kpi",
        title="총 플레이어 수",
        icon="fa-users",
        color="#007bff",
    ).set_data(
        value=sum(item["count"] for item in player_status_data),
        comparison_value=180,  # 이전 값 (예시)
        comparison_label="전월 대비",
        trend_data=[150, 155, 162, 168, 175, 185, 195, 205, 210],  # 추세 데이터 (예시)
    )
    
    active_players_kpi = KPI(
        id="active-players-kpi",
        title="활성 플레이어",
        icon="fa-user-check",
        color="#28a745",
    ).set_data(
        value=next((item["count"] for item in player_status_data if item["status"] == "active"), 0),
        comparison_value=100,  # 이전 값 (예시)
        comparison_label="전월 대비",
        trend_data=[80, 85, 87, 90, 95, 100, 110, 115, 120],  # 추세 데이터 (예시)
    )
    
    avg_balance_kpi = KPI(
        id="avg-balance-kpi",
        title="평균 지갑 잔액",
        prefix="$",
        decimal_places=2,
        icon="fa-dollar-sign",
        color="#ffc107",
    ).set_data(
        value=pd.DataFrame(wallet_balances_data)["balance"].mean(),
        comparison_value=450,  # 이전 값 (예시)
        comparison_label="전월 대비",
        trend_data=[400, 415, 425, 430, 440, 455, 470, 485, 500],  # 추세 데이터 (예시)
    )
    
    # 지도 컴포넌트 생성
    user_map = Map(
        id="user-map",
        title="사용자 지리적 분포",
        description="지역별 사용자 분포",
        height=500,
        map_type='scatter',
        center={'lat': 36.5, 'lon': 127.5},  # 한국 중심
        zoom=6,
    ).set_data(
        data=geo_data,
        lat="lat",
        lon="lon",
        size="users",
        color="active_ratio",
        hover_name="city",
        hover_data=["users", "active_ratio"]
    )
    
    # 대시보드 구성
    dashboard = Dashboard(
        id="test-dashboard",
        title="DB2 데이터 분석 대시보드",
        description="데이터베이스 분석 및 시각화 테스트",
    )
    
    # KPI 추가
    dashboard.add_component(total_players_kpi, width=4)
    dashboard.add_component(active_players_kpi, width=4)
    dashboard.add_component(avg_balance_kpi, width=4)
    
    # 차트 추가
    dashboard.add_component(player_status_chart, width=6)
    dashboard.add_component(wallet_balance_chart, width=6)
    dashboard.add_component(player_activity_chart, width=12)
    
    # 지도 추가
    dashboard.add_component(user_map, width=12)
    
    # 레이아웃 생성
    app.layout = dbc.Container([
        html.H1("고급 데이터 시각화 컴포넌트 테스트", className="my-4"),
        
        dbc.Row([
            dbc.Col([
                dbc.Card([
                    dbc.CardBody([
                        html.H4("테스트 옵션", className="card-title"),
                        dbc.Form([
                            dbc.Row([
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
                                ], width=6),
                                dbc.Col([
                                    dbc.Label("테마"),
                                    dbc.Select(
                                        id="chart-theme",
                                        options=[
                                            {"label": "기본", "value": "plotly"},
                                            {"label": "밝은 테마", "value": "plotly_white"},
                                            {"label": "어두운 테마", "value": "plotly_dark"},
                                        ],
                                        value="plotly",
                                    ),
                                ], width=6),
                            ]),
                            dbc.Button("적용", id="apply-settings", color="primary", className="mt-3"),
                        ]),
                    ]),
                ], className="mb-4"),
            ]),
        ]),
        
        # 대시보드 렌더링
        dashboard.render(),
        
    ], fluid=True)
    
    # 앱 실행
    app.run_server(debug=True, port=8050)

if __name__ == "__main__":
    main()
