"""
보고서 출력 유틸리티

이 모듈은 보고서 내용을 다양한 형식으로 출력하는 기능을 제공합니다.
마크다운, HTML, PDF 등 다양한 출력 형식을 지원합니다.
"""

import os
import logging
from typing import Dict, Any, Optional, List, Union
import markdown
import json
from datetime import datetime

# 로깅 설정
logger = logging.getLogger(__name__)


class ReportFormatter:
    """보고서 형식 변환 클래스"""
    
    @staticmethod
    def to_markdown(report: Dict[str, Any], include_metadata: bool = True) -> str:
        """
        보고서를 마크다운 형식으로 변환
        
        Args:
            report (Dict[str, Any]): 보고서 데이터
            include_metadata (bool, optional): 메타데이터 포함 여부. 기본값은 True
            
        Returns:
            str: 마크다운 형식의 보고서
        """
        result = []
        
        if include_metadata:
            result.append("---")
            result.append(f"name: {report.get('name', '')}")
            result.append(f"description: {report.get('description', '')}")
            result.append(f"created_at: {report.get('created_at', '')}")
            result.append(f"updated_at: {report.get('updated_at', '')}")
            result.append(f"tags: {', '.join(report.get('tags', []))}")
            result.append("---\n")
        
        result.append(f"# {report.get('name', '무제')}")
        
        if report.get('description'):
            result.append(f"\n_{report['description']}_\n")
        
        result.append(report.get('content', ''))
        
        return "\n".join(result)
    
    @staticmethod
    def to_html(report: Dict[str, Any], include_metadata: bool = True, 
                custom_css: Optional[str] = None) -> str:
        """
        보고서를 HTML 형식으로 변환
        
        Args:
            report (Dict[str, Any]): 보고서 데이터
            include_metadata (bool, optional): 메타데이터 포함 여부. 기본값은 True
            custom_css (Optional[str], optional): 사용자 정의 CSS. 기본값은 None
            
        Returns:
            str: HTML 형식의 보고서
        """
        # 기본 CSS
        default_css = """
        body {
            font-family: Arial, sans-serif;
            line-height: 1.6;
            max-width: 800px;
            margin: 0 auto;
            padding: 20px;
        }
        .metadata {
            background-color: #f5f5f5;
            padding: 10px;
            border-radius: 5px;
            margin-bottom: 20px;
            font-size: 0.9em;
        }
        .metadata-item {
            margin: 5px 0;
        }
        .tags {
            margin-top: 5px;
        }
        .tag {
            display: inline-block;
            background-color: #e0e0e0;
            padding: 2px 8px;
            border-radius: 3px;
            margin-right: 5px;
            font-size: 0.8em;
        }
        h1 {
            border-bottom: 1px solid #ddd;
            padding-bottom: 10px;
        }
        """
        
        css = custom_css if custom_css else default_css
        
        # 마크다운을 HTML로 변환
        md_content = report.get('content', '')
        html_content = markdown.markdown(md_content, extensions=['tables', 'fenced_code'])
        
        html = [
            "<!DOCTYPE html>",
            "<html>",
            "<head>",
            f"<title>{report.get('name', '무제')}</title>",
            "<meta charset='utf-8'>",
            f"<style>{css}</style>",
            "</head>",
            "<body>"
        ]
        
        # 메타데이터 추가
        if include_metadata:
            html.append("<div class='metadata'>")
            if report.get('created_at'):
                created_date = datetime.fromisoformat(report['created_at']).strftime('%Y-%m-%d %H:%M')
                html.append(f"<div class='metadata-item'>작성일: {created_date}</div>")
            
            if report.get('updated_at'):
                updated_date = datetime.fromisoformat(report['updated_at']).strftime('%Y-%m-%d %H:%M')
                html.append(f"<div class='metadata-item'>수정일: {updated_date}</div>")
            
            if report.get('tags'):
                html.append("<div class='metadata-item'>태그: ")
                html.append("<span class='tags'>")
                for tag in report.get('tags', []):
                    html.append(f"<span class='tag'>{tag}</span>")
                html.append("</span>")
                html.append("</div>")
            
            html.append("</div>")
        
        # 제목과 설명
        html.append(f"<h1>{report.get('name', '무제')}</h1>")
        
        if report.get('description'):
            html.append(f"<p><em>{report['description']}</em></p>")
        
        # 내용
        html.append(html_content)
        
        html.append("</body>")
        html.append("</html>")
        
        return "\n".join(html)
    
    @staticmethod
    def to_json(report: Dict[str, Any]) -> str:
        """
        보고서를 JSON 형식으로 변환
        
        Args:
            report (Dict[str, Any]): 보고서 데이터
            
        Returns:
            str: JSON 형식의 보고서
        """
        return json.dumps(report, ensure_ascii=False, indent=2)


class ReportExporter:
    """보고서 내보내기 클래스"""
    
    @staticmethod
    def export_to_file(report: Dict[str, Any], filepath: str, 
                      format: str = 'md', include_metadata: bool = True) -> bool:
        """
        보고서를 파일로 내보내기
        
        Args:
            report (Dict[str, Any]): 보고서 데이터
            filepath (str): 파일 경로
            format (str, optional): 출력 형식 ('md', 'html', 'json'). 기본값은 'md'
            include_metadata (bool, optional): 메타데이터 포함 여부. 기본값은 True
            
        Returns:
            bool: 성공 여부
        """
        try:
            # 디렉토리 확인
            os.makedirs(os.path.dirname(os.path.abspath(filepath)), exist_ok=True)
            
            # 형식에 따라 변환
            if format.lower() == 'md':
                content = ReportFormatter.to_markdown(report, include_metadata)
            elif format.lower() == 'html':
                content = ReportFormatter.to_html(report, include_metadata)
            elif format.lower() == 'json':
                content = ReportFormatter.to_json(report)
            else:
                logger.error("Unsupported format: %s", format)
                return False
            
            # 파일 저장
            with open(filepath, 'w', encoding='utf-8') as f:
                f.write(content)
            
            logger.info("Report exported to %s", filepath)
            return True
            
        except Exception as e:
            logger.error("Failed to export report: %s", str(e))
            return False
