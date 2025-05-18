"""
인터랙티브 데이터 테이블 컴포넌트

이 모듈은 Dash와 dash-ag-grid를 사용하여 고급 인터랙티브 데이터 테이블을 제공합니다.
"""

import json
import logging
from typing import Dict, List, Any, Optional, Union, Callable

import dash
from dash import html, dcc, Input, Output, State, callback
import dash_bootstrap_components as dbc
import dash_ag_grid as dag
import pandas as pd

from ...utils.config import AppConfig, mask_sensitive_data

logger = logging.getLogger(__name__)

class InteractiveDataTable:
    """인터랙티브 데이터 테이블 클래스"""
    
    def __init__(
        self,
        id: str,
        title: Optional[str] = None,
        description: Optional[str] = None,
        height: str = '600px',
        page_size: int = 25,
        filterable: bool = True,
        sortable: bool = True,
        selectable: bool = True,
        exportable: bool = True,
        theme: str = 'alpine',
    ):
        """
        InteractiveDataTable 초기화
        
        Args:
            id (str): 컴포넌트 ID
            title (str, optional): 테이블 제목
            description (str, optional): 테이블 설명
            height (str): 테이블 높이 (CSS 값)
            page_size (int): 페이지당 행 수
            filterable (bool): 필터 기능 활성화 여부
            sortable (bool): 정렬 기능 활성화 여부
            selectable (bool): 행 선택 기능 활성화 여부
            exportable (bool): 내보내기 기능 활성화 여부
            theme (str): AG Grid 테마
        """
        self.id = id
        self.title = title
        self.description = description
        self.height = height
        self.page_size = page_size
        self.filterable = filterable
        self.sortable = sortable
        self.selectable = selectable
        self.exportable = exportable
        self.theme = theme
        
        # 기본 설정
        self.column_defs = []
        self.row_data = []
        
        logger.info(f"Interactive data table {id} initialized")
    
    def configure_columns(self, column_defs: List[Dict[str, Any]]) -> 'InteractiveDataTable':
        """
        테이블 열 구성
        
        Args:
            column_defs (List[Dict[str, Any]]): AG Grid 열 정의
            
        Returns:
            InteractiveDataTable: 체이닝 지원을 위한 self
        """
        self.column_defs = column_defs
        return self
    
    def set_data(self, data: Union[List[Dict[str, Any]], pd.DataFrame]) -> 'InteractiveDataTable':
        """
        테이블 데이터 설정
        
        Args:
            data (Union[List[Dict[str, Any]], pd.DataFrame]): 테이블 데이터
            
        Returns:
            InteractiveDataTable: 체이닝 지원을 위한 self
        """
        # 설정에서 데이터 마스킹 활성화 여부 확인
        config = AppConfig()
        
        if isinstance(data, pd.DataFrame):
            # DataFrame을 딕셔너리 리스트로 변환
            raw_data = data.to_dict('records')
        else:
            raw_data = data
        
        # 민감한 정보 마스킹
        self.row_data = mask_sensitive_data(raw_data)
        
        return self
    
    def _create_grid_options(self) -> Dict[str, Any]:
        """
        AG Grid 옵션 생성
        
        Returns:
            Dict[str, Any]: AG Grid 옵션
        """
        options = {
            "columnDefs": self.column_defs,
            "rowData": self.row_data,
            "pagination": True,
            "paginationPageSize": self.page_size,
            "rowSelection": "multiple" if self.selectable else "none",
            "animateRows": True,
            "enableCellTextSelection": True,
            "enableBrowserTooltips": True,
            "tooltipShowDelay": 500,
        }
        
        if self.filterable:
            options.update({
                "enableFilter": True,
                "enableAdvancedFilter": True,
                "enableFloatingFilter": True,
            })
        
        if self.sortable:
            options.update({
                "enableSorting": True,
                "enableMultiSort": True,
            })
        
        return options
    
    def render(self) -> html.Div:
        """
        Dash 컴포넌트로 테이블 렌더링
        
        Returns:
            html.Div: 테이블 컴포넌트
        """
        # 헤더 생성
        header = []
        if self.title:
            header.append(html.H4(self.title, className="mb-2"))
        if self.description:
            header.append(html.P(self.description, className="text-muted mb-3"))
        
        # 내보내기 버튼
        export_buttons = []
        if self.exportable:
            export_buttons = [
                dbc.Button("CSV 내보내기", id=f"{self.id}-csv-export", color="secondary", size="sm", className="me-2"),
                dbc.Button("Excel 내보내기", id=f"{self.id}-excel-export", color="secondary", size="sm"),
            ]
        
        # AG Grid 구성
        grid = dag.AgGrid(
            id=f"{self.id}-grid",
            columnDefs=self.column_defs,
            rowData=self.row_data,
            dashGridOptions=self._create_grid_options(),
            className="ag-theme-" + self.theme,
            style={"height": self.height, "width": "100%"},
        )
        
        # 전체 컴포넌트 구성
        component = html.Div([
            html.Div(header, className="mb-3"),
            html.Div(export_buttons, className="mb-3 d-flex justify-content-end"),
            grid,
            html.Div(id=f"{self.id}-selection-info", className="mt-3"),
            dcc.Download(id=f"{self.id}-csv-download"),
            dcc.Download(id=f"{self.id}-excel-download"),
        ], className="interactive-data-table mb-4")
        
        return component
    
    def register_callbacks(self, app: dash.Dash) -> None:
        """
        Dash 콜백 등록
        
        Args:
            app (dash.Dash): Dash 애플리케이션
        """
        if not self.exportable:
            return
        
        # CSV 내보내기 콜백
        @app.callback(
            Output(f"{self.id}-csv-download", "data"),
            Input(f"{self.id}-csv-export", "n_clicks"),
            prevent_initial_call=True,
        )
        def export_csv(n_clicks):
            if not n_clicks:
                return None
            
            df = pd.DataFrame(self.row_data)
            return dcc.send_data_frame(df.to_csv, f"{self.id}_export.csv", index=False)
        
        # Excel 내보내기 콜백
        @app.callback(
            Output(f"{self.id}-excel-download", "data"),
            Input(f"{self.id}-excel-export", "n_clicks"),
            prevent_initial_call=True,
        )
        def export_excel(n_clicks):
            if not n_clicks:
                return None
            
            df = pd.DataFrame(self.row_data)
            return dcc.send_data_frame(df.to_excel, f"{self.id}_export.xlsx", index=False)
        
        # 선택 정보 콜백
        if self.selectable:
            @app.callback(
                Output(f"{self.id}-selection-info", "children"),
                Input(f"{self.id}-grid", "selectedRows"),
            )
            def selection_info(selected_rows):
                if not selected_rows:
                    return ""
                
                return f"{len(selected_rows)}개의 행이 선택되었습니다."

# 테이블 컬럼 스타일 및 포맷팅을 위한 도우미 함수
def create_column_def(
    field: str,
    header_name: str,
    width: Optional[int] = None,
    sortable: bool = True,
    filterable: bool = True,
    checkboxSelection: bool = False,
    cellRenderer: Optional[str] = None,
    valueFormatter: Optional[str] = None,
    type: Optional[str] = None,
    editable: bool = False,
    pinned: Optional[str] = None,
) -> Dict[str, Any]:
    """
    AG Grid 열 정의 생성
    
    Args:
        field (str): 데이터 필드 이름
        header_name (str): 열 헤더 텍스트
        width (int, optional): 열 너비
        sortable (bool): 정렬 가능 여부
        filterable (bool): 필터 가능 여부
        checkboxSelection (bool): 체크박스 선택 활성화 여부
        cellRenderer (str, optional): 셀 렌더러 이름
        valueFormatter (str, optional): 값 포맷터 함수 이름
        type (str, optional): 열 데이터 타입
        editable (bool): 편집 가능 여부
        pinned (str, optional): 고정 위치 ('left' 또는 'right')
        
    Returns:
        Dict[str, Any]: AG Grid 열 정의
    """
    column_def = {
        "field": field,
        "headerName": header_name,
        "sortable": sortable,
        "filter": filterable,
        "checkboxSelection": checkboxSelection,
        "editable": editable,
    }
    
    if width:
        column_def["width"] = width
    
    if cellRenderer:
        column_def["cellRenderer"] = cellRenderer
    
    if valueFormatter:
        column_def["valueFormatter"] = valueFormatter
    
    if type:
        column_def["type"] = type
    
    if pinned:
        column_def["pinned"] = pinned
    
    return column_def

# 숫자 포맷팅을 위한 도우미 함수
def number_formatter(params):
    """숫자 포맷 함수"""
    if params.value is None:
        return ""
    return f"{params.value:,.2f}"

# 날짜 포맷팅을 위한 도우미 함수
def date_formatter(params):
    """날짜 포맷 함수"""
    if params.value is None:
        return ""
    return pd.to_datetime(params.value).strftime("%Y-%m-%d %H:%M")
