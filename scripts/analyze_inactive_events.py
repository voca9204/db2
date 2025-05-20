#!/usr/bin/env python
"""
이벤트 효과 분석 스크립트

이 스크립트는 오랫동안 게임을 하지 않은 사용자가 이벤트를 통해
게임에 참여하고 입금까지 이어지는 패턴을 분석합니다.
"""

import os
import sys
import argparse
from pathlib import Path
import json

# 프로젝트 루트 디렉토리를 sys.path에 추가
project_root = Path(__file__).resolve().parent.parent
sys.path.append(str(project_root))

from src.analysis.user.inactive_event_analyzer import InactiveUserEventAnalyzer

def parse_args():
    """명령행 인수 파싱"""
    parser = argparse.ArgumentParser(description='비활성 사용자 이벤트 효과 분석')
    parser.add_argument(
        '--days', 
        type=int, 
        default=10, 
        help='비활성으로 간주할 최소 일수 (기본값: 10)'
    )
    parser.add_argument(
        '--output', 
        type=str, 
        default=None, 
        help='결과 저장 디렉토리 (기본값: ./reports/user)'
    )
    parser.add_argument(
        '--json', 
        action='store_true', 
        help='결과를 JSON 형식으로 출력'
    )
    
    return parser.parse_args()

def main():
    """메인 함수"""
    # 명령행 인수 파싱
    args = parse_args()
    
    # 출력 디렉토리 설정
    if args.output:
        output_dir = Path(args.output)
    else:
        output_dir = project_root / "reports" / "user"
    
    # 디렉토리 생성
    os.makedirs(output_dir, exist_ok=True)
    
    # 분석기 초기화
    analyzer = InactiveUserEventAnalyzer()
    
    try:
        # 비활성 사용자 중 이벤트 후 입금한 사용자 목록 조회
        results = analyzer.get_inactive_event_deposit_users(days_inactive=args.days)
        print(f"총 {len(results)}명의 사용자가 조건을 만족합니다.")
        
        # 분석 보고서 생성
        report = analyzer.generate_analysis_report(output_dir=output_dir)
        print(f"분석 보고서 생성 완료! 결과는 {output_dir} 디렉토리에 저장되었습니다.")
        
        # 요약 정보 출력
        print("\n===== 요약 정보 =====")
        for key, value in report['summary'].items():
            if isinstance(value, float):
                print(f"{key}: {value:.2f}")
            else:
                print(f"{key}: {value}")
        
        # JSON 출력
        if args.json:
            json_path = output_dir / "report_summary.json"
            with open(json_path, 'w', encoding='utf-8') as f:
                json.dump(report['summary'], f, indent=2, ensure_ascii=False)
            print(f"\nJSON 요약 정보가 {json_path}에 저장되었습니다.")
    
    except Exception as e:
        print(f"오류 발생: {str(e)}")
        import traceback
        traceback.print_exc()
        sys.exit(1)
    
    finally:
        print("\n분석 완료!")

if __name__ == "__main__":
    main()
