"""
고급 데이터 시각화 컴포넌트

이 모듈은 Plotly와 Dash를 사용하여 고급 데이터 시각화 컴포넌트를 제공합니다.
"""

import json
import logging
from typing import Dict, List, Any, Optional, Union, Callable, Tuple

import plotly.express as px
import plotly.graph_objects as go
from plotly.subplots import make_subplots
import pandas as pd
import numpy as np
from dash import html, dcc
import dash_bootstrap_components as dbc

from ...utils.config import AppConfig, mask_sensitive_data

logger = logging.getLogger(__name__)

class VisualizationComponent:
    """시각화 컴포넌트 기본 클래스"""
    
    def __init__(
        self,
        id: str,
        title: Optional[str] = None,
        description: Optional[str] = None,
        height: int = 500,
        width: Optional[int] = None,
    ):
        """
        VisualizationComponent 초기화
        
        Args:
            id (str): 컴포넌트 ID
            title (str, optional): 시각화 제목
            description (str, optional): 시각화 설명
            height (int): 시각화 높이 (픽셀)
            width (int, optional): 시각화 너비 (픽셀)
        """
        self.id = id
        self.title = title
        self.description = description
        self.height = height
        self.width = width
        self.figure = None
        
        logger.info(f"Visualization component {id} initialized")
    
    def set_data(self, data):
        """
        시각화 데이터 설정 (하위 클래스에서 구현)
        
        Args:
            data: 시각화 데이터
        """
        raise NotImplementedError("Subclasses must implement set_data method")
    
    def update_layout(self, **kwargs):
        """
        Plotly 레이아웃 업데이트
        
        Args:
            **kwargs: Plotly 레이아웃 옵션
            
        Returns:
            VisualizationComponent: 체이닝 지원을 위한 self
        """
        if self.figure:
            self.figure.update_layout(**kwargs)
        return self
    
    def render(self):
        """
        시각화 컴포넌트 렌더링 (하위 클래스에서 구현)
        """
        raise NotImplementedError("Subclasses must implement render method")

class Chart(VisualizationComponent):
    """차트 시각화 컴포넌트"""
    
    def __init__(
        self,
        id: str,
        title: Optional[str] = None,
        description: Optional[str] = None,
        height: int = 500,
        width: Optional[int] = None,
        chart_type: str = 'bar',
        theme: Optional[str] = None,
    ):
        """
        Chart 초기화
        
        Args:
            id (str): 컴포넌트 ID
            title (str, optional): 차트 제목
            description (str, optional): 차트 설명
            height (int): 차트 높이 (픽셀)
            width (int, optional): 차트 너비 (픽셀)
            chart_type (str): 차트 유형 ('bar', 'line', 'pie', 'scatter', 'area', 'heatmap')
            theme (str, optional): Plotly 테마
        """
        super().__init__(id, title, description, height, width)
        self.chart_type = chart_type
        self.theme = theme
        self.data = None
        self.x = None
        self.y = None
        self.color = None
        self.labels = {}
        
        logger.info(f"Chart component {id} initialized with type {chart_type}")
    
    def set_data(
        self,
        data: Union[pd.DataFrame, List[Dict[str, Any]]],
        x: Optional[str] = None,
        y: Optional[Union[str, List[str]]] = None,
        color: Optional[str] = None,
        labels: Optional[Dict[str, str]] = None,
    ):
        """
        차트 데이터 설정
        
        Args:
            data (Union[pd.DataFrame, List[Dict[str, Any]]]): 차트 데이터
            x (str, optional): x축 열 이름
            y (Union[str, List[str]], optional): y축 열 이름 또는 이름 목록
            color (str, optional): 색상 그룹화 열 이름
            labels (Dict[str, str], optional): 축 및 범례 레이블
            
        Returns:
            Chart: 체이닝 지원을 위한 self
        """
        # 데이터 마스킹 적용
        if isinstance(data, list):
            masked_data = mask_sensitive_data(data)
            self.data = pd.DataFrame(masked_data)
        else:
            # DataFrame인 경우 딕셔너리로 변환 후 마스킹 적용 후 다시 DataFrame으로 변환
            masked_data = mask_sensitive_data(data.to_dict('records'))
            self.data = pd.DataFrame(masked_data)
        
        self.x = x
        self.y = y
        self.color = color
        self.labels = labels or {}
        
        # 데이터 설정 후 차트 생성
        self._create_figure()
        
        return self
    
    def _create_figure(self):
        """
        데이터를 기반으로 Plotly 그림 생성
        """
        if self.data is None or self.x is None or self.y is None:
            logger.warning("Data, x, or y is not set for chart")
            return
        
        # 차트 유형에 따라 적절한 Plotly 함수 사용
        if self.chart_type == 'bar':
            self.figure = px.bar(
                self.data, x=self.x, y=self.y, color=self.color,
                labels=self.labels, template=self.theme,
                height=self.height, width=self.width
            )
        elif self.chart_type == 'line':
            self.figure = px.line(
                self.data, x=self.x, y=self.y, color=self.color,
                labels=self.labels, template=self.theme,
                height=self.height, width=self.width
            )
        elif self.chart_type == 'pie':
            self.figure = px.pie(
                self.data, names=self.x, values=self.y, color=self.color,
                labels=self.labels, template=self.theme,
                height=self.height, width=self.width
            )
        elif self.chart_type == 'scatter':
            self.figure = px.scatter(
                self.data, x=self.x, y=self.y, color=self.color,
                labels=self.labels, template=self.theme,
                height=self.height, width=self.width
            )
        elif self.chart_type == 'area':
            self.figure = px.area(
                self.data, x=self.x, y=self.y, color=self.color,
                labels=self.labels, template=self.theme,
                height=self.height, width=self.width
            )
        elif self.chart_type == 'heatmap':
            # 히트맵을 위해 피벗 테이블 생성
            if isinstance(self.y, str):
                pivot_data = self.data.pivot_table(
                    index=self.x, columns=self.color, values=self.y, aggfunc='mean'
                )
                self.figure = px.imshow(
                    pivot_data, template=self.theme,
                    height=self.height, width=self.width
                )
            else:
                logger.warning("Heatmap requires a single y value, not a list")
                return
        else:
            logger.warning(f"Unknown chart type: {self.chart_type}")
            return
        
        # 제목 및 설명 설정
        if self.title:
            self.figure.update_layout(title_text=self.title)
        
        # 레이아웃 개선
        self.figure.update_layout(
            margin=dict(l=50, r=50, t=80, b=50),
            plot_bgcolor='rgba(0,0,0,0)',
            paper_bgcolor='rgba(0,0,0,0)',
        )
    
    def update_traces(self, **kwargs):
        """
        Plotly 트레이스 업데이트
        
        Args:
            **kwargs: Plotly 트레이스 옵션
            
        Returns:
            Chart: 체이닝 지원을 위한 self
        """
        if self.figure:
            self.figure.update_traces(**kwargs)
        return self
    
    def render(self):
        """
        차트 컴포넌트 렌더링
        
        Returns:
            dbc.Card: 차트 컴포넌트를 포함한 카드
        """
        # 헤더 생성
        header = []
        if self.title:
            header.append(html.H4(self.title, className="card-title"))
        if self.description:
            header.append(html.P(self.description, className="text-muted"))
        
        # 그래프 또는 에러 메시지 생성
        if self.figure:
            graph = dcc.Graph(
                id=f"{self.id}-graph",
                figure=self.figure,
                config={
                    'displayModeBar': True,
                    'responsive': True,
                    'toImageButtonOptions': {
                        'format': 'png',
                        'filename': f"{self.id}_chart",
                        'height': self.height,
                        'width': self.width or 1200,
                        'scale': 2
                    }
                },
                style={'height': f"{self.height}px"},
            )
        else:
            graph = html.Div([
                html.P("차트 데이터가 설정되지 않았습니다.", className="text-danger"),
            ])
        
        # 전체 컴포넌트 조합
        return dbc.Card([
            dbc.CardBody([
                html.Div(header, className="mb-3"),
                graph,
            ]),
        ], className="mb-4 chart-component")

class Dashboard(VisualizationComponent):
    """대시보드 컴포넌트 (여러 시각화 요소 포함)"""
    
    def __init__(
        self,
        id: str,
        title: Optional[str] = None,
        description: Optional[str] = None,
        height: int = 800,
        width: Optional[int] = None,
    ):
        """
        Dashboard 초기화
        
        Args:
            id (str): 컴포넌트 ID
            title (str, optional): 대시보드 제목
            description (str, optional): 대시보드 설명
            height (int): 대시보드 높이 (픽셀)
            width (int, optional): 대시보드 너비 (픽셀)
        """
        super().__init__(id, title, description, height, width)
        self.components = []
        
        logger.info(f"Dashboard component {id} initialized")
    
    def add_component(self, component: VisualizationComponent, width: int = 12):
        """
        대시보드에 컴포넌트 추가
        
        Args:
            component (VisualizationComponent): 추가할 시각화 컴포넌트
            width (int): 컴포넌트 너비 (Bootstrap 그리드 시스템 기준, 1-12)
            
        Returns:
            Dashboard: 체이닝 지원을 위한 self
        """
        self.components.append((component, width))
        return self
    
    def set_data(self, data):
        """
        모든 컴포넌트에 데이터 전달
        
        Args:
            data: 시각화 데이터
            
        Returns:
            Dashboard: 체이닝 지원을 위한 self
        """
        for component, _ in self.components:
            if hasattr(component, 'set_data'):
                component.set_data(data)
        return self
    
    def render(self):
        """
        대시보드 컴포넌트 렌더링
        
        Returns:
            html.Div: 대시보드 컴포넌트
        """
        # 헤더 생성
        header = []
        if self.title:
            header.append(html.H3(self.title, className="dashboard-title"))
        if self.description:
            header.append(html.P(self.description, className="dashboard-description text-muted"))
        
        # 컴포넌트 행 생성
        rows = []
        current_row = []
        current_width = 0
        
        for component, width in self.components:
            # 현재 행에 추가하면 12를 초과하는 경우 새 행 시작
            if current_width + width > 12:
                rows.append(dbc.Row(current_row, className="mb-4"))
                current_row = []
                current_width = 0
            
            # 컴포넌트 추가
            current_row.append(dbc.Col(component.render(), width=width))
            current_width += width
        
        # 마지막 행 추가
        if current_row:
            rows.append(dbc.Row(current_row, className="mb-4"))
        
        # 전체 대시보드 구성
        return html.Div([
            html.Div(header, className="mb-4"),
            html.Div(rows, className="dashboard-content"),
        ], id=f"{self.id}-dashboard", className="dashboard-component")

class KPI(VisualizationComponent):
    """KPI(핵심 성과 지표) 컴포넌트"""
    
    def __init__(
        self,
        id: str,
        title: Optional[str] = None,
        description: Optional[str] = None,
        height: int = 180,
        width: Optional[int] = None,
        prefix: str = "",
        suffix: str = "",
        decimal_places: int = 0,
        comparison_value: Optional[float] = None,
        comparison_label: Optional[str] = None,
        trend_period: Optional[str] = None,
        icon: Optional[str] = None,
        color: Optional[str] = None,
    ):
        """
        KPI 초기화
        
        Args:
            id (str): 컴포넌트 ID
            title (str, optional): KPI 제목
            description (str, optional): KPI 설명
            height (int): KPI 높이 (픽셀)
            width (int, optional): KPI 너비 (픽셀)
            prefix (str): 값 앞에 표시할 접두사 (예: "$")
            suffix (str): 값 뒤에 표시할 접미사 (예: "%")
            decimal_places (int): 소수점 자릿수
            comparison_value (float, optional): 비교 값 (변화율 계산용)
            comparison_label (str, optional): 비교 레이블 (예: "전월 대비")
            trend_period (str, optional): 추세 기간 (예: "7일", "30일")
            icon (str, optional): Font Awesome 아이콘 이름
            color (str, optional): 색상 코드 또는 이름
        """
        super().__init__(id, title, description, height, width)
        self.value = None
        self.prefix = prefix
        self.suffix = suffix
        self.decimal_places = decimal_places
        self.comparison_value = comparison_value
        self.comparison_label = comparison_label
        self.trend_period = trend_period
        self.icon = icon
        self.color = color
        self.trend_data = None
        
        logger.info(f"KPI component {id} initialized")
    
    def set_data(
        self,
        value: float,
        comparison_value: Optional[float] = None,
        trend_data: Optional[List[float]] = None,
    ):
        """
        KPI 데이터 설정
        
        Args:
            value (float): KPI 값
            comparison_value (float, optional): 비교 값
            trend_data (List[float], optional): 추세 데이터 포인트
            
        Returns:
            KPI: 체이닝 지원을 위한 self
        """
        # KPI 값은 민감한 정보가 아닐 가능성이 높지만, 
        # 일관성을 위해 설정 확인
        config = AppConfig()
        if config.get('security', 'data_masking_enabled', True) and self.title and any(sensitive in self.title.lower() for sensitive in ['player', 'user', 'customer']):
            # 플레이어 관련 KPI는 설정에 따라 마스킹
            if config.get('display', 'hide_player_names', False) or config.get('display', 'hide_player_numbers', False):
                self.value = None
                logger.info(f"KPI value masked due to sensitivity: {self.title}")
                return self
        
        self.value = value
        
        if comparison_value is not None:
            self.comparison_value = comparison_value
        
        self.trend_data = trend_data
        
        # 추세 그래프 생성
        if self.trend_data:
            x = list(range(len(self.trend_data)))
            y = self.trend_data
            
            self.figure = go.Figure()
            self.figure.add_trace(go.Scatter(
                x=x, y=y,
                mode='lines',
                fill='tozeroy',
                line=dict(color=self.color or '#007bff', width=2),
                hoverinfo='skip'
            ))
            
            # 최소한의 시각화를 위한 레이아웃
            self.figure.update_layout(
                margin=dict(l=0, r=0, t=0, b=0, pad=0),
                plot_bgcolor='rgba(0,0,0,0)',
                paper_bgcolor='rgba(0,0,0,0)',
                xaxis=dict(
                    showgrid=False,
                    zeroline=False,
                    showticklabels=False,
                    fixedrange=True
                ),
                yaxis=dict(
                    showgrid=False,
                    zeroline=False,
                    showticklabels=False,
                    fixedrange=True
                ),
                showlegend=False,
                height=60,
            )
        
        return self
    
    def render(self):
        """
        KPI 컴포넌트 렌더링
        
        Returns:
            dbc.Card: KPI 컴포넌트를 포함한 카드
        """
        # 값이 없는 경우 처리
        if self.value is None:
            return dbc.Card([
                dbc.CardBody([
                    html.H5(self.title or "KPI", className="kpi-title"),
                    html.P("데이터 없음", className="kpi-value"),
                ]),
            ], className="mb-4 kpi-component")
        
        # 값 포맷팅
        formatted_value = f"{self.prefix}{self.value:,.{self.decimal_places}f}{self.suffix}"
        
        # 변화율 계산 및 포맷팅
        change_element = None
        if self.comparison_value is not None and self.comparison_value != 0:
            change_percent = (self.value - self.comparison_value) / abs(self.comparison_value) * 100
            change_text = f"{change_percent:+.1f}%"
            
            # 변화 방향에 따른 색상 설정
            change_color = 'success' if change_percent > 0 else 'danger'
            change_icon = 'fa-arrow-up' if change_percent > 0 else 'fa-arrow-down'
            
            change_element = html.Div([
                html.I(className=f"fas {change_icon} me-1"),
                html.Span(change_text),
                html.Span(f" {self.comparison_label}" if self.comparison_label else "", className="ms-1 text-muted small"),
            ], className=f"text-{change_color} kpi-change")
        
        # 추세 그래프
        trend_element = None
        if self.figure:
            trend_element = dcc.Graph(
                figure=self.figure,
                config={'displayModeBar': False},
                style={'height': '60px'},
                className="kpi-trend mt-2"
            )
        
        # 아이콘 처리
        icon_element = None
        if self.icon:
            icon_element = html.Div(html.I(className=f"fas {self.icon}"), className="kpi-icon")
        
        # 스타일 설정
        style = {}
        if self.color:
            style['borderTop'] = f"4px solid {self.color}"
        
        # 최종 컴포넌트 구성
        return dbc.Card([
            dbc.CardBody([
                html.Div([
                    html.Div([
                        html.H5(self.title or "KPI", className="kpi-title"),
                        html.P(self.description or "", className="text-muted small kpi-description"),
                    ], className="kpi-header"),
                    icon_element,
                ], className="d-flex justify-content-between align-items-start"),
                
                html.Div([
                    html.Div(formatted_value, className="kpi-value"),
                    change_element,
                ], className="kpi-value-container my-2"),
                
                trend_element,
                
                html.P(f"{self.trend_period} 추세" if self.trend_period else "", className="text-muted small mt-2"),
            ]),
        ], className="mb-4 kpi-component", style=style)

class Map(VisualizationComponent):
    """지도 시각화 컴포넌트"""
    
    def __init__(
        self,
        id: str,
        title: Optional[str] = None,
        description: Optional[str] = None,
        height: int = 600,
        width: Optional[int] = None,
        map_type: str = 'scatter',
        center: Optional[Dict[str, float]] = None,
        zoom: int = 3,
    ):
        """
        Map 초기화
        
        Args:
            id (str): 컴포넌트 ID
            title (str, optional): 지도 제목
            description (str, optional): 지도 설명
            height (int): 지도 높이 (픽셀)
            width (int, optional): 지도 너비 (픽셀)
            map_type (str): 지도 유형 ('scatter', 'heatmap', 'choropleth')
            center (Dict[str, float], optional): 중심 좌표 (예: {'lat': 37.5, 'lon': 127.0})
            zoom (int): 초기 줌 레벨
        """
        super().__init__(id, title, description, height, width)
        self.map_type = map_type
        self.center = center or {'lat': 36.5, 'lon': 127.5}  # 대한민국 중심 좌표
        self.zoom = zoom
        self.data = None
        self.lat = None
        self.lon = None
        self.color = None
        self.size = None
        self.hover_name = None
        self.hover_data = None
        self.geojson = None
        self.featureidkey = None
        self.locations = None
        
        logger.info(f"Map component {id} initialized with type {map_type}")
    
    def set_data(
        self,
        data: Union[pd.DataFrame, List[Dict[str, Any]]],
        lat: Optional[str] = None,
        lon: Optional[str] = None,
        color: Optional[str] = None,
        size: Optional[str] = None,
        hover_name: Optional[str] = None,
        hover_data: Optional[List[str]] = None,
        geojson: Optional[Dict[str, Any]] = None,
        featureidkey: Optional[str] = None,
        locations: Optional[str] = None,
    ):
        """
        지도 데이터 설정
        
        Args:
            data (Union[pd.DataFrame, List[Dict[str, Any]]]): 지도 데이터
            lat (str, optional): 위도 열 이름 (scatter/heatmap 맵 유형)
            lon (str, optional): 경도 열 이름 (scatter/heatmap 맵 유형)
            color (str, optional): 색상 매핑 열 이름
            size (str, optional): 크기 매핑 열 이름 (scatter 맵 유형)
            hover_name (str, optional): 호버 정보 제목 열 이름
            hover_data (List[str], optional): 호버 정보에 표시할 추가 열
            geojson (Dict[str, Any], optional): GeoJSON 데이터 (choropleth 맵 유형)
            featureidkey (str, optional): GeoJSON 특성 ID 키 (choropleth 맵 유형)
            locations (str, optional): 위치 ID 열 이름 (choropleth 맵 유형)
            
        Returns:
            Map: 체이닝 지원을 위한 self
        """
        # 데이터 마스킹 적용
        if isinstance(data, list):
            masked_data = mask_sensitive_data(data)
            self.data = pd.DataFrame(masked_data)
        else:
            # DataFrame인 경우 딕셔너리로 변환 후 마스킹 적용 후 다시 DataFrame으로 변환
            masked_data = mask_sensitive_data(data.to_dict('records'))
            self.data = pd.DataFrame(masked_data)
        
        self.lat = lat
        self.lon = lon
        self.color = color
        self.size = size
        self.hover_name = hover_name
        self.hover_data = hover_data
        self.geojson = geojson
        self.featureidkey = featureidkey
        self.locations = locations
        
        # 데이터 설정 후 지도 생성
        self._create_figure()
        
        return self
    
    def _create_figure(self):
        """
        데이터를 기반으로 Plotly 지도 생성
        """
        if self.data is None:
            logger.warning("Data is not set for map")
            return
        
        # 지도 유형에 따라 적절한 Plotly 함수 사용
        if self.map_type == 'scatter':
            if self.lat is None or self.lon is None:
                logger.warning("lat and lon must be specified for scatter map")
                return
            
            self.figure = px.scatter_mapbox(
                self.data, lat=self.lat, lon=self.lon,
                color=self.color, size=self.size,
                hover_name=self.hover_name, hover_data=self.hover_data,
                mapbox_style="carto-positron",
                height=self.height, width=self.width,
                zoom=self.zoom, center=self.center
            )
        
        elif self.map_type == 'heatmap':
            if self.lat is None or self.lon is None:
                logger.warning("lat and lon must be specified for heatmap")
                return
            
            self.figure = px.density_mapbox(
                self.data, lat=self.lat, lon=self.lon, z=self.color,
                hover_name=self.hover_name,
                mapbox_style="carto-positron",
                height=self.height, width=self.width,
                zoom=self.zoom, center=self.center,
                opacity=0.7
            )
        
        elif self.map_type == 'choropleth':
            if self.geojson is None or self.locations is None:
                logger.warning("geojson and locations must be specified for choropleth map")
                return
            
            self.figure = px.choropleth_mapbox(
                self.data, geojson=self.geojson,
                locations=self.locations, color=self.color,
                featureidkey=self.featureidkey,
                hover_name=self.hover_name, hover_data=self.hover_data,
                mapbox_style="carto-positron",
                height=self.height, width=self.width,
                zoom=self.zoom, center=self.center,
                opacity=0.7
            )
        
        else:
            logger.warning(f"Unknown map type: {self.map_type}")
            return
        
        # 제목 및 설명 설정
        if self.title:
            self.figure.update_layout(title_text=self.title)
        
        # 레이아웃 개선
        self.figure.update_layout(
            margin=dict(l=0, r=0, t=50, b=0),
            mapbox_center=self.center,
            mapbox_zoom=self.zoom,
        )
    
    def render(self):
        """
        지도 컴포넌트 렌더링
        
        Returns:
            dbc.Card: 지도 컴포넌트를 포함한 카드
        """
        # 헤더 생성
        header = []
        if self.title:
            header.append(html.H4(self.title, className="card-title"))
        if self.description:
            header.append(html.P(self.description, className="text-muted"))
        
        # 그래프 또는 에러 메시지 생성
        if self.figure:
            graph = dcc.Graph(
                id=f"{self.id}-map",
                figure=self.figure,
                config={
                    'displayModeBar': True,
                    'responsive': True,
                    'toImageButtonOptions': {
                        'format': 'png',
                        'filename': f"{self.id}_map",
                        'height': self.height,
                        'width': self.width or 1200,
                        'scale': 2
                    }
                },
                style={'height': f"{self.height}px"},
            )
        else:
            graph = html.Div([
                html.P("지도 데이터가 설정되지 않았습니다.", className="text-danger"),
            ])
        
        # 전체 컴포넌트 조합
        return dbc.Card([
            dbc.CardBody([
                html.Div(header, className="mb-3"),
                graph,
            ]),
        ], className="mb-4 map-component")
