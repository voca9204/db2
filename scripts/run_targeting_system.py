#!/usr/bin/env python
# -*- coding: utf-8 -*-

"""
휴면 사용자 타겟팅 시스템 실행 스크립트

Task #18 (휴면 사용자 타겟팅 시스템)의 전체 파이프라인과 대시보드를 실행합니다.
"""

import os
import sys
import logging
from pathlib import Path

# 프로젝트 루트 디렉토리를 sys.path에 추가
project_root = Path(__file__).parent.parent
sys.path.append(str(project_root))

from src.database.mariadb_connection import MariaDBConnection
from src.analysis.user.inactive_user_targeting_engine import InactiveUserTargetingEngine, InactiveUserTargetingDashboard

def main():
    """
    메인 함수 - 타겟팅 시스템 실행
    """
    # 로깅 설정
    logging.basicConfig(
        level=logging.INFO,
        format='%(asctime)s - %(name)s - %(levelname)s - %(message)s'
    )
    
    # 데이터베이스 연결 생성
    try:
        print("데이터베이스에 연결 중...")
        db_connection = MariaDBConnection()
        print("데이터베이스 연결 성공")
    except Exception as e:
        print(f"데이터베이스 연결 실패: {e}")
        sys.exit(1)
    
    # 모드 선택
    print("\n휴면 사용자 타겟팅 시스템")
    print("-" * 40)
    print("1. 타겟팅 파이프라인 실행")
    print("2. 타겟팅 대시보드 실행")
    print("3. 종료")
    
    while True:
        try:
            choice = int(input("\n실행할 모드 선택 (1-3): "))
            if choice in [1, 2, 3]:
                break
            print("유효하지 않은 선택입니다. 1, 2, 또는 3을 입력하세요.")
        except ValueError:
            print("유효하지 않은 입력입니다. 숫자를 입력하세요.")
    
    if choice == 3:
        print("프로그램을 종료합니다.")
        sys.exit(0)
    
    # 타겟팅 엔진 생성
    targeting_engine = InactiveUserTargetingEngine(db_connection=db_connection)
    
    if choice == 1:
        print("\n타겟팅 파이프라인 설정")
        print("-" * 40)
        
        # 파라미터 입력
        days_inactive = int(input("비활성으로 간주할 최소 일수 (기본값: 30): ") or "30")
        min_value_score = float(input("최소 사용자 가치 점수 임계값 (0-1, 기본값: 0.4): ") or "0.4")
        min_reengagement_prob = float(input("최소 재참여 확률 임계값 (0-1, 기본값: 0.3): ") or "0.3")
        max_targets_input = input("최대 타겟팅할 사용자 수 (입력하지 않으면 제한 없음): ")
        max_targets = int(max_targets_input) if max_targets_input else None
        
        # 타겟팅 파이프라인 실행
        print("\n타겟팅 파이프라인 실행 중...")
        targets = targeting_engine.run_targeting_pipeline(
            days_inactive=days_inactive,
            min_value_score=min_value_score,
            min_reengagement_prob=min_reengagement_prob,
            max_targets=max_targets
        )
        
        if targets is None or targets.empty:
            print("타겟팅 결과가 없습니다.")
            sys.exit(1)
        
        print(f"\n타겟팅 완료: {len(targets)}명의 사용자 선택됨")
        
        # 캠페인 생성 여부
        create_campaign = input("\n캠페인을 생성하시겠습니까? (y/n): ").lower() == 'y'
        
        if create_campaign:
            # 캠페인 정보 입력
            campaign_name = input("캠페인 이름: ")
            campaign_description = input("캠페인 설명: ")
            campaign_budget_input = input("캠페인 예산 (입력하지 않으면 제한 없음): ")
            campaign_budget = float(campaign_budget_input) if campaign_budget_input else None
            
            # 캠페인 생성
            campaign = targeting_engine.generate_targeting_campaign(
                name=campaign_name,
                description=campaign_description,
                budget=campaign_budget
            )
            
            if campaign:
                print(f"\n캠페인 '{campaign_name}' 생성 완료")
                print(f"대상 사용자: {campaign.get('target_count', 0)}명")
                print(f"총 보상 금액: {campaign.get('total_reward', 0):,.0f}원")
            else:
                print("캠페인 생성에 실패했습니다.")
        
        print("\n프로그램을 종료합니다.")
    
    elif choice == 2:
        print("\n타겟팅 대시보드를 실행합니다.")
        print("대시보드가 http://127.0.0.1:8050/ 에서 실행됩니다.")
        print("종료하려면 Ctrl+C를 누르세요.")
        
        # 대시보드 생성 및 실행
        dashboard = InactiveUserTargetingDashboard(targeting_engine=targeting_engine)
        dashboard.run_server(debug=True)

if __name__ == "__main__":
    main()
