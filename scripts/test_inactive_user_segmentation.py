#!/usr/bin/env python3
"""
비활성 사용자 세그먼테이션 알고리즘 테스트 스크립트

이 스크립트는 InactiveUserSegmentation 클래스를 테스트하고 
결과를 확인합니다.
"""

import os
import sys
import logging
import pandas as pd
from pathlib import Path
from datetime import datetime
import json

# 프로젝트 루트 디렉토리를 sys.path에 추가
project_root = Path(__file__).parent.parent
sys.path.append(str(project_root))

from src.database.mariadb_connection import MariaDBConnection
from src.analysis.user.inactive_user_targeting_pipeline import InactiveUserTargetingPipeline
from src.analysis.user.inactive_user_segmentation import InactiveUserSegmentation

def main():
    """
    메인 함수 - 세그먼테이션 알고리즘 테스트
    """
    # 로깅 설정
    logging.basicConfig(
        level=logging.INFO,
        format='%(asctime)s - %(name)s - %(levelname)s - %(message)s',
        handlers=[
            logging.FileHandler(f"segmentation_test_{datetime.now().strftime('%Y%m%d_%H%M%S')}.log"),
            logging.StreamHandler()
        ]
    )
    
    logger = logging.getLogger(__name__)
    logger.info("비활성 사용자 세그먼테이션 알고리즘 테스트 시작")
    
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
        
        # 데이터 파이프라인 인스턴스 생성
        pipeline = InactiveUserTargetingPipeline(db_connection=db_connection)
        
        # 세그먼테이션 객체 초기화
        segmentation = InactiveUserSegmentation()
        
        # 테스트 과정 1: 파이프라인에서 데이터 로드
        logger.info("1. 파이프라인에서 데이터 로드 중...")
        pipeline_data = pipeline.run_pipeline(days_inactive=30, days_lookback=90, force_reload=False)
        
        if pipeline_data is None or pipeline_data.empty:
            logger.error("파이프라인에서 데이터를 로드할 수 없습니다.")
            return
        
        logger.info(f"로드된 데이터: {pipeline_data.shape[0]}행 x {pipeline_data.shape[1]}열")
        
        # 테스트 과정 2: 클러스터링을 위한 데이터 전처리
        logger.info("2. 클러스터링을 위한 데이터 전처리 중...")
        preprocessed_data, selected_features = segmentation.preprocess_for_clustering(pipeline_data)
        
        if preprocessed_data.empty:
            logger.error("데이터 전처리에 실패했습니다.")
            return
        
        logger.info(f"전처리된 데이터: {preprocessed_data.shape[0]}행 x {preprocessed_data.shape[1]}열")
        logger.info(f"선택된 특성: {selected_features}")
        
        # 테스트 과정 3: 최적 클러스터 수 평가
        logger.info("3. 최적 클러스터 수 평가 중...")
        cluster_evaluation = segmentation.determine_optimal_clusters(preprocessed_data, max_clusters=10)
        
        if not cluster_evaluation:
            logger.error("클러스터 평가에 실패했습니다.")
            return
        
        recommended_clusters = cluster_evaluation['recommended_n_clusters']
        logger.info(f"추천된 클러스터 수: {recommended_clusters}")
        logger.info(f"Silhouette 점수: {cluster_evaluation['best_silhouette']['score']:.4f}")
        
        # 테스트 과정 4: KMeans 클러스터링 수행
        logger.info(f"4. KMeans 클러스터링 수행 중 (클러스터 수: {recommended_clusters})...")
        cluster_labels, model_info = segmentation.perform_clustering(preprocessed_data, recommended_clusters)
        
        if len(cluster_labels) == 0:
            logger.error("클러스터링에 실패했습니다.")
            return
        
        logger.info(f"클러스터링 완료: {len(set(cluster_labels))} 클러스터 생성됨")
        logger.info(f"Silhouette 점수: {model_info['evaluation']['silhouette_score']:.4f}")
        
        # 테스트 과정 5: 계층적 클러스터링 수행
        logger.info(f"5. 계층적 클러스터링 수행 중 (클러스터 수: {recommended_clusters})...")
        hc_labels, hc_model_info = segmentation.perform_hierarchical_clustering(preprocessed_data, recommended_clusters)
        
        if len(hc_labels) == 0:
            logger.error("계층적 클러스터링에 실패했습니다.")
        else:
            logger.info(f"계층적 클러스터링 완료: {len(set(hc_labels))} 클러스터 생성됨")
            logger.info(f"Silhouette 점수: {hc_model_info['evaluation']['silhouette_score']:.4f}")
        
        # 테스트 과정 6: 클러스터 분석
        logger.info("6. 클러스터 분석 중...")
        cluster_analysis = segmentation.analyze_clusters(pipeline_data, cluster_labels, selected_features)
        
        if not cluster_analysis:
            logger.error("클러스터 분석에 실패했습니다.")
            return
        
        logger.info(f"클러스터 프로파일 생성 완료: {len(cluster_analysis['cluster_profiles'])} 프로파일")
        
        # 테스트 과정 7: 클러스터 시각화
        logger.info("7. 클러스터 시각화 중...")
        visualizations = segmentation.visualize_clusters(preprocessed_data, cluster_labels, selected_features)
        
        if not visualizations:
            logger.error("클러스터 시각화에 실패했습니다.")
        else:
            logger.info(f"{len(visualizations)} 시각화 생성 완료")
            for vis_type, vis_path in visualizations.items():
                logger.info(f"  {vis_type}: {vis_path}")
        
        # 테스트 과정 8: 세그먼트 정의 생성
        logger.info("8. 세그먼트 정의 생성 중...")
        segment_definitions = segmentation.create_segment_definitions(cluster_analysis.get('cluster_profiles', {}))
        
        if not segment_definitions:
            logger.error("세그먼트 정의 생성에 실패했습니다.")
            return
        
        logger.info(f"{len(segment_definitions)} 세그먼트 정의 생성 완료")
        for segment_id, definition in segment_definitions.items():
            logger.info(f"  세그먼트 {segment_id}: {definition['name']} ({definition['percentage']:.1f}%)")
            logger.info(f"    특성: {definition['description']}")
            logger.info(f"    전략: {', '.join(definition['targeting_strategies'])}")
        
        # 테스트 과정 9: 결과 저장
        logger.info("9. 세그먼트 결과 저장 중...")
        output_file = segmentation.save_segment_results(pipeline_data, cluster_labels, segment_definitions)
        
        if not output_file:
            logger.error("결과 저장에 실패했습니다.")
        else:
            logger.info(f"결과 저장 완료: {output_file}")
        
        # 테스트 과정 10: 전체 세그먼테이션 과정 실행
        logger.info("10. 전체 세그먼테이션 과정 실행 중...")
        results = segmentation.run_segmentation(pipeline_data)
        
        if not results:
            logger.error("전체 세그먼테이션 과정에 실패했습니다.")
        else:
            logger.info("전체 세그먼테이션 과정 완료")
            logger.info(f"생성된 세그먼트 수: {results['n_clusters']}")
            
            # 세그먼트 정의 요약 저장
            summary_file = os.path.join(
                project_root, 
                "data", 
                "test_results", 
                f"segment_summary_{datetime.now().strftime('%Y%m%d_%H%M%S')}.json"
            )
            
            os.makedirs(os.path.dirname(summary_file), exist_ok=True)
            
            with open(summary_file, 'w', encoding='utf-8') as f:
                json.dump({
                    'n_clusters': results['n_clusters'],
                    'data_shape': f"{results['data_shape'][0]} rows x {results['data_shape'][1]} columns",
                    'selected_features': results['selected_features'],
                    'segment_definitions': results['segment_definitions'],
                    'visualizations': list(results['visualizations'].keys()),
                    'output_file': results['output_file']
                }, f, ensure_ascii=False, indent=2)
            
            logger.info(f"요약 저장 완료: {summary_file}")
        
        logger.info("비활성 사용자 세그먼테이션 알고리즘 테스트 완료")
    
    except Exception as e:
        logger.error(f"세그먼테이션 테스트 중 오류 발생: {str(e)}", exc_info=True)

if __name__ == "__main__":
    main()
