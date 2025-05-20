#!/usr/bin/env python3
"""
보고서 네비게이션 추가 스크립트

이 스크립트는 reports 디렉토리 내의 모든 HTML 파일에 표준화된 네비게이션 링크를 추가합니다.
CSS와 JavaScript 파일을 연결하고 네비게이션 초기화 코드를 추가합니다.
"""

import os
import re
from pathlib import Path

def add_navigation_to_html_files(reports_dir):
    """
    reports 디렉토리 내의 모든 HTML 파일에 네비게이션 링크 추가
    
    Args:
        reports_dir (str): 보고서 디렉토리 경로
    """
    reports_path = Path(reports_dir)
    
    # CSS 파일 경로 확인
    css_path = reports_path / "css" / "report-nav.css"
    if not css_path.exists():
        print(f"오류: CSS 파일이 존재하지 않습니다: {css_path}")
        return

    # JavaScript 파일 경로 확인
    js_path = reports_path / "js" / "report-nav.js"
    if not js_path.exists():
        print(f"오류: JavaScript 파일이 존재하지 않습니다: {js_path}")
        return
    
    # 모든 HTML 파일 찾기
    html_files = list(reports_path.glob("**/*.html"))
    print(f"총 {len(html_files)}개의 HTML 파일을 발견했습니다.")
    
    modified_count = 0
    
    for html_file in html_files:
        try:
            with open(html_file, 'r', encoding='utf-8') as f:
                content = f.read()
            
            # 이미 네비게이션 스크립트가 포함되어 있는지 확인
            if 'report-nav.js' in content:
                print(f"이미 네비게이션이 포함되어 있습니다: {html_file}")
                continue
            
            # 상대 경로 계산
            rel_path = os.path.relpath(reports_path, html_file.parent)
            css_rel_path = os.path.join(rel_path, "css", "report-nav.css").replace("\\", "/")
            js_rel_path = os.path.join(rel_path, "js", "report-nav.js").replace("\\", "/")
            
            # CSS 링크 추가
            content = re.sub(
                r'(<head>[\s\S]*?<title>.*?</title>)', 
                r'\1\n    <link rel="stylesheet" href="' + css_rel_path + '">',
                content
            )
            
            # JavaScript 스크립트 추가
            content = re.sub(
                r'(</body>)', 
                r'    <script src="' + js_rel_path + '"></script>\n\1',
                content
            )
            
            # 기존 푸터 링크 수정
            content = re.sub(
                r'<a href="\.\.+/index\.html">메인 대시보드로 돌아가기</a>', 
                r'<a href="/index.html">메인 대시보드로 돌아가기</a>',
                content
            )
            
            # 수정된 내용 저장
            with open(html_file, 'w', encoding='utf-8') as f:
                f.write(content)
            
            print(f"네비게이션 추가 완료: {html_file}")
            modified_count += 1
            
        except Exception as e:
            print(f"오류 발생: {html_file} - {e}")
    
    print(f"총 {modified_count}개의 HTML 파일이 수정되었습니다.")

if __name__ == "__main__":
    # 프로젝트 루트 디렉토리 설정
    project_root = Path(__file__).parent.parent
    reports_dir = project_root / "reports"
    
    print("=" * 80)
    print("보고서 네비게이션 추가 스크립트")
    print("=" * 80)
    
    if not reports_dir.exists() or not reports_dir.is_dir():
        print(f"오류: 보고서 디렉토리를 찾을 수 없습니다: {reports_dir}")
        exit(1)
    
    add_navigation_to_html_files(reports_dir)
    
    print("\n보고서 네비게이션 추가 스크립트 실행 완료")
    print("=" * 80)
