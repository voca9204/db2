"""
보고서 모듈

이 패키지는 보고서 관리 및 출력 기능을 제공합니다.
종합분석보고서와 질의 보고서 두 가지 유형을 지원하며, 태그 기반 분류 시스템을 포함합니다.
"""

from .tags import ReportType, QueryReportTag, tag_manager
from .manager import ReportManager, init_report_manager, get_report_manager
from .output import ReportFormatter, ReportExporter

__all__ = [
    'ReportType',
    'QueryReportTag',
    'tag_manager',
    'ReportManager',
    'init_report_manager',
    'get_report_manager',
    'ReportFormatter',
    'ReportExporter'
]
