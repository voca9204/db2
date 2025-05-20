#!/usr/bin/env python
# -*- coding: utf-8 -*-

"""
비활성 사용자 이벤트 유지율 분석 테스트 스크립트
"""

import os
import sys
from pathlib import Path

# 프로젝트 루트 디렉토리를 sys.path에 추가
project_root = Path(__file__).parent.parent.parent
sys.path.append(str(project_root))

from src.analysis.user.inactive_event_analyzer import InactiveUserEventAnalyzer

def test_retention_analysis():
    """
    유지율 분석 기능 테스트
    """
    # 분석기 초기화
    analyzer = InactiveUserEventAnalyzer()
    
    # 코호트 기반 유지율 분석
    print("\n===== 코호트 기반 유지율 분석 =====")
    retention_results = analyzer.analyze_retention(cohort_period='month', lookback_periods=6)
    
    if 'error' in retention_results:
        print(f"오류 발생: {retention_results['error']}")
    else:
        # 결과 출력
        print("\n[ 코호트 크기 ]")
        print(retention_results['cohort_sizes'])
        
        print("\n[ 유지율 매트릭스 ]")
        print(retention_results['retention_matrix'])
        
        print("\n[ 평균 유지율 ]")
        for period, rate in retention_results['avg_retention'].items():
            print(f"기간 {period}: {rate:.2f}%")
    
    # 이벤트 전후 유지율 분석
    print("\n===== 이벤트 전후 유지율 분석 =====")
    event_retention_results = analyzer.analyze_event_retention(pre_event_days=30, post_event_days=90)
    
    if 'user_data' in event_retention_results and not event_retention_results['user_data'].empty:
        user_data = event_retention_results['user_data']
        effect_stats = event_retention_results['effect_stats']
        
        print("\n[ 이벤트 효과 통계 ]")
        print(effect_stats)
        
        print("\n[ 사용자 수 ]")
        print(f"총 사용자 수: {len(user_data)}")
        print(f"활동 증가 사용자 수: {len(user_data[user_data['retention_effect'] == '활동 증가'])}")
        print(f"활동 유지 사용자 수: {len(user_data[user_data['retention_effect'] == '활동 유지'])}")
        print(f"활동 감소 사용자 수: {len(user_data[user_data['retention_effect'] == '활동 감소'])}")
        print(f"재활성화 사용자 수: {len(user_data[user_data['retention_effect'] == '재활성화'])}")
        
        print("\n[ 활동 변화 평균 ]")
        print(f"로그인 일수 변화: {user_data['login_days_change'].mean():.2f}")
        print(f"게임 플레이 일수 변화: {user_data['play_days_change'].mean():.2f}")
        print(f"입금 일수 변화: {user_data['deposit_days_change'].mean():.2f}")
        print(f"입금 금액 변화: {user_data['deposit_amount_change'].mean():.2f}")
    else:
        print("이벤트 유지율 분석 결과가 없거나 비어 있습니다.")
    
    # 통합 기능 테스트
    print("\n===== 통합 기능 테스트 =====")
    
    # 로그인 빈도 및 세션 기간 분석
    login_frequency = analyzer.get_login_frequency()
    session_duration = analyzer.get_session_duration()
    
    print(f"\n로그인 빈도 데이터: {len(login_frequency)} 행")
    print(f"세션 기간 데이터: {len(session_duration)} 행")
    
    # 기능 사용 및 콘텐츠 상호작용 분석
    try:
        feature_usage = analyzer.get_feature_usage()
        print(f"\n기능 사용 데이터: {len(feature_usage)} 행")
    except Exception as e:
        print(f"\n기능 사용 데이터 오류: {str(e)}")
    
    try:
        content_interaction = analyzer.get_content_interaction()
        print(f"콘텐츠 상호작용 데이터: {len(content_interaction)} 행")
    except Exception as e:
        print(f"콘텐츠 상호작용 데이터 오류: {str(e)}")
    
    # 사용자 참여도 분석
    engagement_results = analyzer.analyze_user_engagement()
    if 'raw_data' in engagement_results and not engagement_results['raw_data'].empty:
        print(f"\n사용자 참여도 데이터: {len(engagement_results['raw_data'])} 행")
        
        if 'engagement_segments' in engagement_results and not engagement_results['engagement_segments'] is None:
            print("\n참여도 세그먼트 통계:")
            print(engagement_results['engagement_segments'])
    else:
        print("\n사용자 참여도 분석 결과가 없거나 비어 있습니다.")
    
    # 전환 퍼널 분석
    funnel_results = analyzer.analyze_conversion_funnel()
    print("\n전환 퍼널 단계:")
    for stage in funnel_results['funnel_stages']:
        print(f"{stage['name']}: {stage['users']} 사용자")
    
    print("\n전환율:")
    for conversion in funnel_results['conversion_rates']:
        print(f"{conversion['from_stage']} → {conversion['to_stage']}: {conversion['rate']:.2f}%")
    
    # 비활성 사용자 세분화
    segmentation_results = analyzer.expand_user_segmentation()
    if 'segmented_users' in segmentation_results and not segmentation_results['segmented_users'].empty:
        segmented_users = segmentation_results['segmented_users']
        
        print(f"\n사용자 세분화 데이터: {len(segmented_users)} 행")
        print("\nRFM 세그먼트 분포:")
        print(segmented_users['rfm_segment'].value_counts())
        
        print("\n비즈니스 세그먼트 분포:")
        print(segmented_users['custom_segment'].value_counts())
    else:
        print("\n사용자 세분화 결과가 없거나 비어 있습니다.")
    
    print("\n테스트 완료!")

if __name__ == "__main__":
    test_retention_analysis()
