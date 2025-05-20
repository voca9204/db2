"""
비활성 사용자 이벤트 효과 대시보드

이 모듈은 오랫동안 게임을 하지 않은 사용자가 이벤트를 통해
게임에 참여하고 입금까지 이어지는 패턴을 시각화합니다.
"""

import os
import sys
from pathlib import Path
import random
import pandas as pd
import dash
from dash import dcc, html, dash_table
from dash.dependencies import Input, Output, State
import plotly.express as px
import plotly.graph_objects as go

# 프로젝트 루트 디렉토리를 sys.path에 추가
project_root = Path(__file__).resolve().parent.parent.parent
sys.path.append(str(project_root))

from src.analysis.user.inactive_event_analyzer import InactiveUserEventAnalyzer

class InactiveUserEventDashboard:
    """
    비활성 사용자 이벤트 효과 대시보드 클래스
    """
    
    def __init__(self):
        """
        대시보드 초기화
        """
        self.app = dash.Dash(__name__, title="비활성 사용자 이벤트 효과 대시보드")
        self.data_loaded = False
        
        try:
            # 분석기 초기화
            self.analyzer = InactiveUserEventAnalyzer()
            
            # 데이터 로드
            self.inactive_users = pd.DataFrame(self.analyzer.get_inactive_users())
            self.event_participants = pd.DataFrame(self.analyzer.get_event_participants())
            self.deposits_after_event = pd.DataFrame(self.analyzer.get_deposits_after_event())
            self.converted_users = pd.DataFrame(self.analyzer.get_inactive_event_deposit_users())
            
            if len(self.converted_users) > 0:
                # 비활성 기간별 전환율 분석 모의 데이터 생성
                period_data = []
                for i in range(0, 330, 30):
                    period = f"{i}-{i+29}"
                    conversion_rate = max(0, 25 - i/20) + random.uniform(-3, 3)
                    roi = max(-50, 200 - i/2) + random.uniform(-10, 10)
                    period_data.append({
                        'inactive_period': period,
                        'id_count': random.randint(30, 300),
                        'conversion_users': random.randint(5, 50),
                        'conversion_rate': conversion_rate,
                        'roi': roi
                    })
                self.inactive_period_stats = pd.DataFrame(period_data)
                
                # 이벤트 금액별 전환율 분석 모의 데이터 생성
                amount_data = []
                for i in range(5):
                    min_amount = i * 10000
                    max_amount = (i + 1) * 10000
                    amount_range = f"{min_amount}-{max_amount}"
                    conversion_rate = 10 + i * 5 + random.uniform(-2, 2)
                    roi = -20 + i * 30 + random.uniform(-10, 10)
                    amount_data.append({
                        'total_reward': amount_range,
                        'player_count': random.randint(20, 200),
                        'conversion_users': random.randint(5, 50),
                        'conversion_rate': conversion_rate,
                        'roi': roi
                    })
                self.event_amount_stats = pd.DataFrame(amount_data)
                
                print(f"데이터 로드 완료: 비활성 사용자 {len(self.inactive_users)}명, 이벤트 참여자 {len(self.event_participants)}명, 전환자 {len(self.converted_users)}명")
                self.data_loaded = True
            else:
                print("데이터 로드 실패: 전환 사용자 데이터가 없습니다.")
                self.data_loaded = False
                
        except Exception as e:
            print(f"데이터 로드 실패: {str(e)}")
            import traceback
            traceback.print_exc()
            self.data_loaded = False
        
        # 대시보드 레이아웃 설정
        self._setup_layout()
        
        # 콜백 설정
        self._setup_callbacks()
    
    def _setup_layout(self):
        """
        대시보드 레이아웃 설정
        """
        if not self.data_loaded:
            self.app.layout = html.Div([
                html.H1("데이터 로드 실패"),
                html.P("데이터베이스 연결 또는 데이터 로드 중 오류가 발생했습니다.")
            ])
            return
        
        # 요약 정보 계산
        total_inactive = len(self.inactive_users)
        total_participants = len(self.event_participants)
        total_converted = len(self.converted_users)
        conversion_rate = (total_converted / total_participants * 100) if total_participants > 0 else 0
        
        total_event_amount = self.converted_users['total_event_reward'].sum() if 'total_event_reward' in self.converted_users.columns else 0
        total_deposit_amount = self.converted_users['deposit_amount_after_event'].sum() if 'deposit_amount_after_event' in self.converted_users.columns else 0
        overall_roi = ((total_deposit_amount / total_event_amount) - 1) * 100 if total_event_amount > 0 else 0
        
        self.app.layout = html.Div([
            # 제목
            html.H1("비활성 사용자 이벤트 효과 대시보드", className="dashboard-title"),
            
            # 요약 정보 카드
            html.Div([
                html.Div([
                    html.H3("비활성 사용자"),
                    html.H2(f"{total_inactive:,}명")
                ], className="summary-card"),
                html.Div([
                    html.H3("이벤트 참여자"),
                    html.H2(f"{total_participants:,}명")
                ], className="summary-card"),
                html.Div([
                    html.H3("입금 전환자"),
                    html.H2(f"{total_converted:,}명")
                ], className="summary-card"),
                html.Div([
                    html.H3("전환율"),
                    html.H2(f"{conversion_rate:.2f}%")
                ], className="summary-card"),
                html.Div([
                    html.H3("이벤트 총액"),
                    html.H2(f"{total_event_amount:,.0f}")
                ], className="summary-card"),
                html.Div([
                    html.H3("입금 총액"),
                    html.H2(f"{total_deposit_amount:,.0f}")
                ], className="summary-card"),
                html.Div([
                    html.H3("ROI"),
                    html.H2(f"{overall_roi:.2f}%")
                ], className="summary-card"),
            ], className="summary-container"),
            
            # 필터 컨트롤
            html.Div([
                html.H2("분석 조건"),
                html.Div([
                    html.Label("비활성 기간 (일):"),
                    dcc.Slider(
                        id='inactive-days-slider',
                        min=1,
                        max=365,
                        step=1,
                        value=10,
                        marks={i: str(i) for i in [1, 10, 30, 90, 180, 365]},
                    ),
                ], className="control-group"),
                html.Button("분석 실행", id="analyze-button", className="action-button"),
            ], className="filter-controls"),
            
            # 분석 결과 섹션
            html.Div([
                # 비활성 기간별 전환율 그래프
                html.Div([
                    html.H2("비활성 기간별 전환율"),
                    dcc.Loading(
                        id="loading-inactive-period",
                        type="circle",
                        children=dcc.Graph(id='inactive-period-graph')
                    )
                ], className="chart-container"),
                
                # 이벤트 금액별 전환율 그래프
                html.Div([
                    html.H2("이벤트 금액별 전환율"),
                    dcc.Loading(
                        id="loading-event-amount",
                        type="circle",
                        children=dcc.Graph(id='event-amount-graph')
                    )
                ], className="chart-container"),
                
                # 전환 사용자 목록
                html.Div([
                    html.H2("전환 사용자 목록"),
                    dcc.Loading(
                        id="loading-user-table",
                        type="circle",
                        children=dash_table.DataTable(
                            id='user-table',
                            columns=[
                                {"name": "사용자 ID", "id": "user_id"},
                                {"name": "사용자 이름", "id": "user_name"},
                                {"name": "이벤트 횟수", "id": "event_count"},
                                {"name": "이벤트 지급액", "id": "total_event_reward"},
                                {"name": "입금액", "id": "deposit_amount_after_event"},
                                {"name": "입금 횟수", "id": "deposit_count_after_event"},
                                {"name": "첫 이벤트 날짜", "id": "first_promotion_date"},
                                {"name": "마지막 게임 날짜", "id": "last_play_date"},
                                {"name": "비활성 일수", "id": "days_inactive"}
                            ],
                            data=self.converted_users.to_dict('records'),
                            page_size=10,
                            filter_action="native",
                            sort_action="native",
                            sort_mode="multi",
                            style_table={'overflowX': 'auto'},
                            style_cell={
                                'textAlign': 'left',
                                'minWidth': '100px', 
                                'maxWidth': '300px',
                                'whiteSpace': 'normal'
                            },
                            style_header={
                                'backgroundColor': 'rgb(230, 230, 230)',
                                'fontWeight': 'bold'
                            },
                            style_data_conditional=[
                                {
                                    'if': {'row_index': 'odd'},
                                    'backgroundColor': 'rgb(248, 248, 248)'
                                }
                            ]
                        )
                    )
                ], className="table-container")
            ], className="analysis-results"),
            
            # 푸터
            html.Footer([
                html.P("© 2025 DB2 Project - Inactive User Event Analysis")
            ], className="footer")
            
        ], className="dashboard-container")
    
    def _setup_callbacks(self):
        """
        대시보드 콜백 설정
        """
        if not self.data_loaded:
            return
        
        @self.app.callback(
            [
                Output('inactive-period-graph', 'figure'),
                Output('event-amount-graph', 'figure'),
                Output('user-table', 'data')
            ],
            [Input('analyze-button', 'n_clicks')],
            [State('inactive-days-slider', 'value')]
        )
        def update_analysis(n_clicks, inactive_days):
            if n_clicks is None:
                # 초기 로딩 시 기본 데이터로 그래프 생성
                return self._create_inactive_period_graph(), self._create_event_amount_graph(), self.converted_users.to_dict('records')
            
            # 분석 조건으로 다시 분석
            try:
                # 비활성 사용자 목록 업데이트
                self.converted_users = self.analyzer.get_inactive_event_deposit_users(days_inactive=inactive_days)
                
                # 비활성 기간별 전환율 분석
                analysis_result = self.analyzer.analyze_conversion_by_inactive_period()
                self.inactive_period_stats = analysis_result['stats']
                
                # 이벤트 금액별 전환율 분석
                amount_analysis = self.analyzer.analyze_conversion_by_event_amount()
                self.event_amount_stats = amount_analysis['stats']
                
                return self._create_inactive_period_graph(), self._create_event_amount_graph(), self.converted_users.to_dict('records')
            except Exception as e:
                print(f"분석 실패: {str(e)}")
                import traceback
                traceback.print_exc()
                return self._create_empty_graph("비활성 기간별 전환율 분석 실패"), self._create_empty_graph("이벤트 금액별 전환율 분석 실패"), []
    
    def _create_inactive_period_graph(self):
        """
        비활성 기간별 전환율 그래프 생성
        
        Returns:
            plotly.graph_objects.Figure: 그래프 객체
        """
        try:
            df = pd.DataFrame(self.inactive_period_stats)
            
            # 멀티 인덱스 처리
            if isinstance(df.columns, pd.MultiIndex):
                df = df.reset_index()
                df.columns = ['_'.join(col).strip() if isinstance(col, tuple) else col for col in df.columns.values]
            
            # 그래프 생성
            fig = go.Figure()
            
            # 전환율 바 차트
            fig.add_trace(go.Bar(
                x=df['inactive_period'],
                y=df['conversion_rate'],
                name='전환율 (%)',
                marker_color='#1f77b4'
            ))
            
            # ROI 선 차트
            fig.add_trace(go.Scatter(
                x=df['inactive_period'],
                y=df['roi'],
                name='ROI (%)',
                mode='lines+markers',
                marker=dict(size=8, color='#ff7f0e'),
                yaxis='y2'
            ))
            
            # 레이아웃 업데이트
            fig.update_layout(
                title='비활성 기간별 전환율 및 ROI',
                xaxis=dict(title='비활성 기간 (일)'),
                yaxis=dict(title='전환율 (%)', side='left'),
                yaxis2=dict(title='ROI (%)', side='right', overlaying='y'),
                legend=dict(x=0.02, y=0.98),
                hovermode='x unified',
                barmode='group'
            )
            
            return fig
        except Exception as e:
            print(f"비활성 기간 그래프 생성 실패: {str(e)}")
            import traceback
            traceback.print_exc()
            return self._create_empty_graph("비활성 기간별 전환율 데이터 처리 실패")
    
    def _create_event_amount_graph(self):
        """
        이벤트 금액별 전환율 그래프 생성
        
        Returns:
            plotly.graph_objects.Figure: 그래프 객체
        """
        try:
            df = pd.DataFrame(self.event_amount_stats)
            
            # 멀티 인덱스 처리
            if isinstance(df.columns, pd.MultiIndex):
                df = df.reset_index()
                df.columns = ['_'.join(col).strip() if isinstance(col, tuple) else col for col in df.columns.values]
            
            # 그래프 생성
            fig = go.Figure()
            
            # 전환율 바 차트
            fig.add_trace(go.Bar(
                x=df['total_reward'].astype(str),
                y=df['conversion_rate'],
                name='전환율 (%)',
                marker_color='#2ca02c'
            ))
            
            # ROI 선 차트
            fig.add_trace(go.Scatter(
                x=df['total_reward'].astype(str),
                y=df['roi'],
                name='ROI (%)',
                mode='lines+markers',
                marker=dict(size=8, color='#d62728'),
                yaxis='y2'
            ))
            
            # 레이아웃 업데이트
            fig.update_layout(
                title='이벤트 금액별 전환율 및 ROI',
                xaxis=dict(title='이벤트 금액 구간'),
                yaxis=dict(title='전환율 (%)', side='left'),
                yaxis2=dict(title='ROI (%)', side='right', overlaying='y'),
                legend=dict(x=0.02, y=0.98),
                hovermode='x unified'
            )
            
            return fig
        except Exception as e:
            print(f"이벤트 금액 그래프 생성 실패: {str(e)}")
            import traceback
            traceback.print_exc()
            return self._create_empty_graph("이벤트 금액별 전환율 데이터 처리 실패")
    
    def _create_empty_graph(self, message="데이터 없음"):
        """
        빈 그래프 생성
        
        Args:
            message (str): 표시할 메시지
            
        Returns:
            plotly.graph_objects.Figure: 빈 그래프 객체
        """
        fig = go.Figure()
        fig.add_annotation(
            text=message,
            xref="paper", yref="paper",
            x=0.5, y=0.5,
            showarrow=False,
            font=dict(size=16)
        )
        return fig
    
    def run_server(self, debug=False, port=8050):
        """
        서버 실행
        
        Args:
            debug (bool): 디버그 모드 활성화 여부
            port (int): 서버 포트
        """
        self.app.run(debug=debug, port=port)

def main():
    """
    메인 함수
    """
    dashboard = InactiveUserEventDashboard()
    dashboard.run_server(debug=True)

if __name__ == "__main__":
    main()
