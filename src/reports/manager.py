"""
보고서 관리 시스템

이 모듈은 종합분석보고서와 질의 보고서를 관리하는 기능을 제공합니다.
보고서의 생성, 업데이트, 조회, 태그 관리 등의 기능을 포함합니다.
"""

import os
import json
import time
import logging
from datetime import datetime
from typing import Dict, List, Optional, Any, Union
from pathlib import Path

from .tags import ReportType, QueryReportTag, tag_manager

# 로깅 설정
logger = logging.getLogger(__name__)


class ReportManager:
    """보고서 관리 클래스"""
    
    def __init__(self, base_path: str):
        """
        ReportManager 초기화
        
        Args:
            base_path (str): 보고서 기본 디렉토리 경로
        """
        self.base_path = base_path
        self.comprehensive_path = os.path.join(base_path, "comprehensive")
        self.queries_path = os.path.join(base_path, "queries")
        
        # 디렉토리 생성
        self._ensure_directories()
        
        # 보고서 인덱스 로드
        self.report_index = self._load_index()
        
        logger.info("Report Manager initialized with base path: %s", base_path)
    
    def _ensure_directories(self) -> None:
        """
        필요한 디렉토리 생성
        """
        os.makedirs(self.comprehensive_path, exist_ok=True)
        os.makedirs(self.queries_path, exist_ok=True)
        logger.debug("Report directories ensured")
    
    def _get_index_path(self) -> str:
        """
        인덱스 파일 경로 반환
        
        Returns:
            str: 인덱스 파일 경로
        """
        return os.path.join(self.base_path, "report_index.json")
    
    def _load_index(self) -> Dict[str, Dict[str, Any]]:
        """
        보고서 인덱스 파일 로드
        
        Returns:
            Dict[str, Dict[str, Any]]: 보고서 인덱스
        """
        index_path = self._get_index_path()
        
        if os.path.exists(index_path):
            try:
                with open(index_path, 'r', encoding='utf-8') as f:
                    index = json.load(f)
                logger.debug("Report index loaded from %s", index_path)
                return index
            except Exception as e:
                logger.error("Failed to load report index: %s", str(e))
                return {"comprehensive": {}, "queries": {}}
        else:
            logger.debug("Report index not found, creating new one")
            return {"comprehensive": {}, "queries": {}}
    
    def _save_index(self) -> None:
        """
        보고서 인덱스 파일 저장
        """
        index_path = self._get_index_path()
        
        try:
            with open(index_path, 'w', encoding='utf-8') as f:
                json.dump(self.report_index, f, ensure_ascii=False, indent=2)
            logger.debug("Report index saved to %s", index_path)
        except Exception as e:
            logger.error("Failed to save report index: %s", str(e))
    
    def _generate_report_id(self, report_type: ReportType, name: str) -> str:
        """
        보고서 ID 생성
        
        Args:
            report_type (ReportType): 보고서 유형
            name (str): 보고서 이름
            
        Returns:
            str: 보고서 ID
        """
        # 타임스탬프와 이름에서 생성
        timestamp = int(time.time())
        # 이름에서 공백과 특수문자 제거
        safe_name = ''.join(c if c.isalnum() else '_' for c in name)
        
        return f"{report_type.value}_{timestamp}_{safe_name}"
    
    def _get_report_path(self, report_id: str) -> str:
        """
        보고서 파일 경로 가져오기
        
        Args:
            report_id (str): 보고서 ID
            
        Returns:
            str: 보고서 파일 경로
        """
        if report_id.startswith(ReportType.COMPREHENSIVE.value):
            return os.path.join(self.comprehensive_path, f"{report_id}.md")
        else:  # 질의 보고서
            return os.path.join(self.queries_path, f"{report_id}.md")
    
    def create_report(self, 
                     report_type: ReportType, 
                     name: str, 
                     content: str, 
                     description: str = "", 
                     tags: List[str] = None) -> str:
        """
        새 보고서 생성
        
        Args:
            report_type (ReportType): 보고서 유형
            name (str): 보고서 이름
            content (str): 보고서 내용
            description (str, optional): 보고서 설명. 기본값은 ""
            tags (List[str], optional): 보고서 태그 목록. 기본값은 None
            
        Returns:
            str: 생성된 보고서 ID
        """
        tags = tags or []
        report_id = self._generate_report_id(report_type, name)
        
        # 메타데이터 준비
        created_at = datetime.now().isoformat()
        metadata = {
            "name": name,
            "description": description,
            "created_at": created_at,
            "updated_at": created_at,
            "tags": tags
        }
        
        # 보고서 내용 저장
        report_path = self._get_report_path(report_id)
        try:
            with open(report_path, 'w', encoding='utf-8') as f:
                # 메타데이터를 YAML 형식으로 파일 상단에 추가
                f.write("---\n")
                f.write(f"name: {name}\n")
                f.write(f"description: {description}\n")
                f.write(f"created_at: {created_at}\n")
                f.write(f"updated_at: {created_at}\n")
                f.write(f"tags: {', '.join(tags)}\n")
                f.write("---\n\n")
                f.write(content)
            
            # 인덱스에 추가
            category = "comprehensive" if report_type == ReportType.COMPREHENSIVE else "queries"
            self.report_index[category][report_id] = metadata
            self._save_index()
            
            # 태그 추가
            if tags:
                tag_manager.add_tags(report_id, tags)
            
            logger.info("Created report %s: %s", report_id, name)
            return report_id
            
        except Exception as e:
            logger.error("Failed to create report %s: %s", report_id, str(e))
            raise
    
    def update_report(self, 
                     report_id: str, 
                     content: Optional[str] = None, 
                     name: Optional[str] = None, 
                     description: Optional[str] = None, 
                     tags: Optional[List[str]] = None) -> bool:
        """
        기존 보고서 업데이트
        
        Args:
            report_id (str): 보고서 ID
            content (Optional[str], optional): 새 보고서 내용. 기본값은 None
            name (Optional[str], optional): 새 보고서 이름. 기본값은 None
            description (Optional[str], optional): 새 보고서 설명. 기본값은 None
            tags (Optional[List[str]], optional): 새 보고서 태그 목록. 기본값은 None
            
        Returns:
            bool: 성공 여부
        """
        # 보고서 유형 확인
        category = "comprehensive" if report_id.startswith(ReportType.COMPREHENSIVE.value) else "queries"
        
        # 보고서 존재 여부 확인
        if report_id not in self.report_index[category]:
            logger.error("Report %s not found", report_id)
            return False
        
        # 기존 메타데이터와 내용 로드
        metadata = self.report_index[category][report_id].copy()
        report_path = self._get_report_path(report_id)
        
        try:
            # 기존 내용 로드 (메타데이터 제외)
            existing_content = ""
            with open(report_path, 'r', encoding='utf-8') as f:
                lines = f.readlines()
                if "---" in lines:
                    # 두 번째 --- 이후의 내용을 가져옴
                    yaml_end = -1
                    yaml_count = 0
                    for i, line in enumerate(lines):
                        if line.strip() == "---":
                            yaml_count += 1
                            if yaml_count == 2:
                                yaml_end = i
                                break
                    
                    if yaml_end >= 0:
                        existing_content = ''.join(lines[yaml_end+1:])
            
            # 메타데이터 업데이트
            updated_at = datetime.now().isoformat()
            metadata["updated_at"] = updated_at
            
            if name is not None:
                metadata["name"] = name
            
            if description is not None:
                metadata["description"] = description
            
            if tags is not None:
                old_tags = metadata.get("tags", [])
                metadata["tags"] = tags
                
                # 태그 관리자 업데이트
                tag_manager.clear_report_tags(report_id)
                tag_manager.add_tags(report_id, tags)
            
            # 보고서 내용 저장
            with open(report_path, 'w', encoding='utf-8') as f:
                # 메타데이터를 YAML 형식으로 파일 상단에 추가
                f.write("---\n")
                f.write(f"name: {metadata['name']}\n")
                f.write(f"description: {metadata['description']}\n")
                f.write(f"created_at: {metadata['created_at']}\n")
                f.write(f"updated_at: {metadata['updated_at']}\n")
                f.write(f"tags: {', '.join(metadata['tags'])}\n")
                f.write("---\n\n")
                
                # 내용 업데이트
                if content is not None:
                    f.write(content)
                else:
                    f.write(existing_content)
            
            # 인덱스 업데이트
            self.report_index[category][report_id] = metadata
            self._save_index()
            
            logger.info("Updated report %s", report_id)
            return True
            
        except Exception as e:
            logger.error("Failed to update report %s: %s", report_id, str(e))
            return False
    
    def delete_report(self, report_id: str) -> bool:
        """
        보고서 삭제
        
        Args:
            report_id (str): 보고서 ID
            
        Returns:
            bool: 성공 여부
        """
        # 보고서 유형 확인
        category = "comprehensive" if report_id.startswith(ReportType.COMPREHENSIVE.value) else "queries"
        
        # 보고서 존재 여부 확인
        if report_id not in self.report_index[category]:
            logger.error("Report %s not found", report_id)
            return False
        
        report_path = self._get_report_path(report_id)
        
        try:
            # 파일 삭제
            if os.path.exists(report_path):
                os.remove(report_path)
            
            # 인덱스에서 제거
            del self.report_index[category][report_id]
            self._save_index()
            
            # 태그 제거
            tag_manager.clear_report_tags(report_id)
            
            logger.info("Deleted report %s", report_id)
            return True
            
        except Exception as e:
            logger.error("Failed to delete report %s: %s", report_id, str(e))
            return False
    
    def get_report(self, report_id: str) -> Optional[Dict[str, Any]]:
        """
        보고서 정보와 내용 가져오기
        
        Args:
            report_id (str): 보고서 ID
            
        Returns:
            Optional[Dict[str, Any]]: 보고서 정보와 내용, 없으면 None
        """
        # 보고서 유형 확인
        category = "comprehensive" if report_id.startswith(ReportType.COMPREHENSIVE.value) else "queries"
        
        # 보고서 존재 여부 확인
        if report_id not in self.report_index[category]:
            logger.error("Report %s not found", report_id)
            return None
        
        metadata = self.report_index[category][report_id].copy()
        report_path = self._get_report_path(report_id)
        
        try:
            # 파일 내용 읽기
            with open(report_path, 'r', encoding='utf-8') as f:
                content = f.read()
            
            # YAML 메타데이터 제거
            if "---" in content:
                parts = content.split("---", 2)
                if len(parts) >= 3:
                    content = parts[2].strip()
            
            result = metadata.copy()
            result["content"] = content
            result["id"] = report_id
            
            return result
            
        except Exception as e:
            logger.error("Failed to get report %s: %s", report_id, str(e))
            return None
    
    def list_reports(self, 
                    report_type: Optional[ReportType] = None, 
                    tags: Optional[List[str]] = None, 
                    match_all_tags: bool = False) -> List[Dict[str, Any]]:
        """
        보고서 목록 가져오기
        
        Args:
            report_type (Optional[ReportType], optional): 보고서 유형 필터. 기본값은 None
            tags (Optional[List[str]], optional): 태그 필터. 기본값은 None
            match_all_tags (bool, optional): True면 모든 태그 일치, False면 하나 이상 일치. 기본값은 False
            
        Returns:
            List[Dict[str, Any]]: 보고서 목록
        """
        results = []
        
        # 보고서 유형에 따라 카테고리 선택
        categories = []
        if report_type == ReportType.COMPREHENSIVE:
            categories = ["comprehensive"]
        elif report_type == ReportType.QUERY:
            categories = ["queries"]
        else:
            categories = ["comprehensive", "queries"]
        
        # 태그 필터링
        filtered_ids = None
        if tags:
            filtered_ids = set(tag_manager.get_reports_by_tags(tags, match_all_tags))
        
        # 각 카테고리별 보고서 수집
        for category in categories:
            for report_id, metadata in self.report_index[category].items():
                # 태그 필터링 적용
                if filtered_ids is not None and report_id not in filtered_ids:
                    continue
                
                report_info = metadata.copy()
                report_info["id"] = report_id
                report_info["type"] = "comprehensive" if category == "comprehensive" else "query"
                results.append(report_info)
        
        # 생성일 기준 내림차순 정렬
        results.sort(key=lambda x: x.get("created_at", ""), reverse=True)
        
        return results
    
    def get_tags_summary(self) -> Dict[str, int]:
        """
        태그별 보고서 수 요약 가져오기
        
        Returns:
            Dict[str, int]: 태그별 보고서 수
        """
        return {tag: len(reports) for tag, reports in tag_manager.tagged_reports.items()}


# 전역 인스턴스 생성
report_manager = None

def init_report_manager(base_path: str) -> ReportManager:
    """
    보고서 관리자 초기화
    
    Args:
        base_path (str): 보고서 기본 디렉토리 경로
        
    Returns:
        ReportManager: 보고서 관리자 인스턴스
    """
    global report_manager
    report_manager = ReportManager(base_path)
    return report_manager

def get_report_manager() -> ReportManager:
    """
    보고서 관리자 인스턴스 가져오기
    
    Returns:
        ReportManager: 보고서 관리자 인스턴스
    """
    global report_manager
    if report_manager is None:
        raise RuntimeError("Report manager not initialized. Call init_report_manager first.")
    return report_manager
