"""
보고서 태그 시스템

이 모듈은 보고서에 태그를 할당하고 관리하는 기능을 제공합니다.
태그는 보고서의 분류와 검색을 용이하게 합니다.
"""

from enum import Enum, auto
from typing import Dict, List, Set, Optional


class ReportType(Enum):
    """보고서 유형 열거형"""
    COMPREHENSIVE = "comprehensive"  # 종합분석보고서
    QUERY = "query"  # 질의 보고서


class QueryReportTag(Enum):
    """질의 보고서 태그 열거형"""
    EVENT = "event"  # 이벤트 관련 보고서
    USER = "user"  # 사용자 관련 보고서
    PAYMENT = "payment"  # 결제/입금 관련 보고서
    RETENTION = "retention"  # 유지율 관련 보고서
    ACQUISITION = "acquisition"  # 유저 획득 관련 보고서
    DORMANT = "dormant"  # 휴면 사용자 관련 보고서
    ENGAGEMENT = "engagement"  # 참여도 관련 보고서
    REVENUE = "revenue"  # 매출 관련 보고서
    PERFORMANCE = "performance"  # 성능 관련 보고서
    CUSTOM = "custom"  # 사용자 정의 보고서


class ReportTagManager:
    """보고서 태그 관리 클래스"""
    
    def __init__(self):
        """
        ReportTagManager 초기화
        """
        self.report_tags: Dict[str, Set[str]] = {}  # 보고서 ID: 태그 집합
        self.tagged_reports: Dict[str, Set[str]] = {}  # 태그: 보고서 ID 집합
    
    def add_tags(self, report_id: str, tags: List[str]) -> None:
        """
        보고서에 태그 추가
        
        Args:
            report_id (str): 보고서 ID
            tags (List[str]): 추가할 태그 목록
        """
        # 보고서 ID가 없으면 초기화
        if report_id not in self.report_tags:
            self.report_tags[report_id] = set()
        
        # 태그 추가
        for tag in tags:
            self.report_tags[report_id].add(tag)
            
            # 태그별 보고서 목록에도 추가
            if tag not in self.tagged_reports:
                self.tagged_reports[tag] = set()
            self.tagged_reports[tag].add(report_id)
    
    def remove_tags(self, report_id: str, tags: List[str]) -> None:
        """
        보고서에서 태그 제거
        
        Args:
            report_id (str): 보고서 ID
            tags (List[str]): 제거할 태그 목록
        """
        if report_id not in self.report_tags:
            return
        
        for tag in tags:
            # 보고서에서 태그 제거
            if tag in self.report_tags[report_id]:
                self.report_tags[report_id].remove(tag)
            
            # 태그별 보고서 목록에서도 제거
            if tag in self.tagged_reports and report_id in self.tagged_reports[tag]:
                self.tagged_reports[tag].remove(report_id)
                
                # 태그가 비어있으면 딕셔너리에서 제거
                if not self.tagged_reports[tag]:
                    del self.tagged_reports[tag]
    
    def get_report_tags(self, report_id: str) -> List[str]:
        """
        보고서의 모든 태그 가져오기
        
        Args:
            report_id (str): 보고서 ID
            
        Returns:
            List[str]: 태그 목록
        """
        return list(self.report_tags.get(report_id, set()))
    
    def get_reports_by_tag(self, tag: str) -> List[str]:
        """
        특정 태그가 있는 모든 보고서 가져오기
        
        Args:
            tag (str): 태그
            
        Returns:
            List[str]: 보고서 ID 목록
        """
        return list(self.tagged_reports.get(tag, set()))
    
    def get_reports_by_tags(self, tags: List[str], match_all: bool = False) -> List[str]:
        """
        여러 태그에 해당하는 보고서 가져오기
        
        Args:
            tags (List[str]): 태그 목록
            match_all (bool): True면 모든 태그를 포함하는 보고서만 반환, 
                             False면 하나 이상의 태그를 포함하는 보고서 반환
        
        Returns:
            List[str]: 보고서 ID 목록
        """
        if not tags:
            return []
        
        if match_all:
            # 첫 태그로 시작해서 교집합 계산
            result = set(self.tagged_reports.get(tags[0], set()))
            for tag in tags[1:]:
                result &= set(self.tagged_reports.get(tag, set()))
        else:
            # 합집합 계산
            result = set()
            for tag in tags:
                result |= set(self.tagged_reports.get(tag, set()))
        
        return list(result)
    
    def clear_report_tags(self, report_id: str) -> None:
        """
        보고서의 모든 태그 제거
        
        Args:
            report_id (str): 보고서 ID
        """
        if report_id not in self.report_tags:
            return
        
        # 보고서에 있던 모든 태그를 제거
        tags_to_remove = list(self.report_tags[report_id])
        self.remove_tags(report_id, tags_to_remove)
        
        # 보고서 태그 집합 제거
        if report_id in self.report_tags:
            del self.report_tags[report_id]
    
    def get_all_tags(self) -> List[str]:
        """
        모든 태그 목록 가져오기
        
        Returns:
            List[str]: 모든 태그 목록
        """
        return list(self.tagged_reports.keys())


# 싱글톤 인스턴스 생성
tag_manager = ReportTagManager()
