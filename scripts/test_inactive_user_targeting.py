#!/usr/bin/env python3
"""
비활성 사용자 타겟팅 파이프라인 테스트 스크립트

이 스크립트는 InactiveUserTargetingPipeline을 테스트하고 
결과를 확인합니다.
"""

import os
import sys
import logging
import pandas as pd
from pathlib import Path
from datetime import datetime

# 프로젝트 루트 디렉토리를 sys.path에 추가
project_root = Path(__file__).parent.parent
sys.path.append(str(project_root))

from src.database.mariadb_connection import MariaDBConnection
from src.analysis.user.inactive_user_targeting_pipeline import InactiveUserTargetingPipeline

def main():
    """
    메인 함수 - 파이프라인 테스트
    """
    # 로깅 설정
    logging.basicConfig(
        level=logging.INFO,
        format='%(asctime)s - %(name)s - %(levelname)s - %(message)s',
        handlers=[
            logging.FileHandler(f"pipeline_test_{datetime.now().strftime('%Y%m%d_%H%M%S')}.log"),
            logging.StreamHandler()
        ]
    )
    
    logger = logging.getLogger(__name__)
    logger.info("비활성 사용자 타겟팅 파이프라인 테스트 시작")
    
    try:
        # 데이터베이스 연결 파라미터
        db_params = {
            'host': '211.248.190.46',
            'user': 'hermes',
            'password': 'mcygicng!022',
            'database': 'hermes'
        }
        
        # 데이터베이스 연결 생성
        db_connection = MariaDBConnection()
        
        # 파이프라인 인스턴스 생성
        pipeline = InactiveUserTargetingPipeline(db_connection=db_connection)
        
        # 파이프라인 실행
        logger.info("파이프라인 실행 중...")
        processed_data = pipeline.run_pipeline(days_inactive=30, days_lookback=90)
        
        # 결과 요약
        if not processed_data.empty:
            logger.info(f"처리된 데이터: {processed_data.shape[0]} 행 x {processed_data.shape[1]} 열")
            
            # 상위 사용자 출력
            logger.info("타겟팅 점수 상위 10명:")
            top_users = processed_data.sort_values('targeting_score', ascending=False).head(10)
            for idx, row in top_users.iterrows():
                logger.info(f"  사용자 ID: {row['id']}, 이름: {row['name']}, 타겟팅 점수: {row['targeting_score']:.4f}")
            
            # 세그먼트 분포
            if 'targeting_segment' in processed_data.columns:
                logger.info("타겟팅 세그먼트 분포:")
                segment_counts = processed_data['targeting_segment'].value_counts()
                for segment, count in segment_counts.items():
                    logger.info(f"  {segment}: {count}명 ({count/len(processed_data)*100:.1f}%)")
            
            # 추가 통계
            logger.info("주요 특성 통계:")
            numeric_cols = [
                'days_inactive', 'login_frequency_percent', 'avg_session_minutes', 
                'total_reward', 'deposit_amount_after_event', 'targeting_score'
            ]
            for col in numeric_cols:
                if col in processed_data.columns:
                    logger.info(f"  {col}: 평균 = {processed_data[col].mean():.2f}, "
                              f"중앙값 = {processed_data[col].median():.2f}, "
                              f"최대값 = {processed_data[col].max():.2f}")
            
            # 결과 CSV로 저장
            output_dir = str(project_root / "data" / "test_results")
            os.makedirs(output_dir, exist_ok=True)
            
            output_file = os.path.join(output_dir, f"targeting_test_results_{datetime.now().strftime('%Y%m%d_%H%M%S')}.csv")
            processed_data.to_csv(output_file, index=False)
            logger.info(f"결과 저장 완료: {output_file}")
        else:
            logger.warning("처리된 데이터가 없습니다.")
    
    except Exception as e:
        logger.error(f"파이프라인 테스트 중 오류 발생: {str(e)}", exc_info=True)
    
    logger.info("비활성 사용자 타겟팅 파이프라인 테스트 완료")

if __name__ == "__main__":
    main()
