#!/usr/bin/env python
# -*- coding: utf-8 -*-

"""
휴면 사용자 타겟팅 엔진 및 대시보드

이 모듈은 Task #18.5 "Targeting Engine and Dashboard Implementation"을 구현합니다.
세그먼테이션, 예측 모델, 가치 평가 시스템을 통합하여 최적의 타겟팅을 제공하고
관련 대시보드를 구현합니다.
"""

import os
import sys
import pandas as pd
import numpy as np
import json
import logging
import pickle
from pathlib import Path
from datetime import datetime, timedelta
from typing import Dict, List, Tuple, Optional, Any, Union
import dash
from dash import dcc, html, callback, Output, Input, State, dash_table
import dash_bootstrap_components as dbc
import plotly.express as px
import plotly.graph_objects as go
from flask import Flask, Response, request, jsonify
from flask_cors import CORS

# 프로젝트 루트 디렉토리를 sys.path에 추가
project_root = Path(__file__).parent.parent.parent.parent
sys.path.append(str(project_root))

from src.database.mariadb_connection import MariaDBConnection
from src.analysis.user.inactive_user_segmentation import InactiveUserSegmentation
from src.analysis.predictive_models.inactive_user_model import InactiveUserPredictionModel
from src.analysis.user.user_value_scoring import UserValueScoring

# 로깅 설정
logging.basicConfig(
    level=logging.INFO,
    format='%(asctime)s - %(name)s - %(levelname)s - %(message)s'
)
logger = logging.getLogger(__name__)

class InactiveUserTargetingEngine:
    """
    휴면 사용자 타겟팅 엔진 클래스
    """
    
    def __init__(self, db_connection=None, data_dir=None):
        """
        InactiveUserTargetingEngine 초기화
        
        Args:
            db_connection (MariaDBConnection, optional): 데이터베이스 연결 객체
            data_dir (str, optional): 데이터 저장 디렉토리 경로
        """
        self.db = db_connection if db_connection is not None else MariaDBConnection()
        self.data_dir = data_dir if data_dir is not None else str(project_root / "data" / "user_targeting")
        self.output_dir = str(project_root / "data" / "targeting_results")
        self.campaign_dir = str(project_root / "data" / "campaigns")
        
        # 출력 디렉토리 생성
        os.makedirs(self.output_dir, exist_ok=True)
        os.makedirs(self.campaign_dir, exist_ok=True)
        
        # 구성 요소 초기화
        self.segmentation = InactiveUserSegmentation()
        self.prediction_model = InactiveUserPredictionModel()
        self.value_scoring = UserValueScoring(db_connection=self.db)
        
        # 결과 저장소
        self.targeting_results = None
        self.campaign_history = []
        
        # 타겟팅 설정
        self.targeting_config = {
            'min_value_score': 0.4,
            'min_reengagement_probability': 0.3,
            'days_inactive_threshold': 30,
            'event_types_priority': ['high_roi', 'high_conversion', 'low_cost'],
            'segment_weights': {
                'former_whale': 3.0,
                'social_player': 1.5,
                'weekend_warrior': 1.2,
                'casual_player': 1.0
            },
            'default_targeting_batch_size': 500,
            'min_reward_amount': 100,
            'max_reward_amount': 10000,
            'max_campaign_budget': 5000000
        }
        
        # 설정 로드
        self._load_config()
        
        logger.info("InactiveUserTargetingEngine initialized with data directory: %s", self.data_dir)
    
    def _load_config(self):
        """
        설정 파일 로드
        """
        config_path = os.path.join(self.data_dir, 'targeting_config.json')
        if os.path.exists(config_path):
            try:
                with open(config_path, 'r', encoding='utf-8') as f:
                    config = json.load(f)
                    if isinstance(config, dict):
                        # 유효한 설정인지 검증
                        self.targeting_config.update(config)
                        logger.info("Loaded targeting configuration from %s", config_path)
            except Exception as e:
                logger.error("Error loading targeting config: %s", str(e))
    
    def save_config(self):
        """
        현재 설정을 파일로 저장
        """
        config_path = os.path.join(self.data_dir, 'targeting_config.json')
        try:
            with open(config_path, 'w', encoding='utf-8') as f:
                json.dump(self.targeting_config, f, indent=2, ensure_ascii=False)
            logger.info("Saved targeting configuration to %s", config_path)
        except Exception as e:
            logger.error("Error saving targeting config: %s", str(e))
    
    def update_config(self, new_config: Dict[str, Any]) -> bool:
        """
        타겟팅 설정 업데이트
        
        Args:
            new_config (Dict[str, Any]): 새 설정
            
        Returns:
            bool: 업데이트 성공 여부
        """
        if not isinstance(new_config, dict):
            logger.error("Invalid config format")
            return False
        
        # 설정 업데이트
        self.targeting_config.update(new_config)
        
        # 설정 저장
        self.save_config()
        return True
    
    def _get_segment_weight(self, segment_name: str) -> float:
        """
        세그먼트 가중치 가져오기
        
        Args:
            segment_name (str): 세그먼트 이름
            
        Returns:
            float: 가중치
        """
        # 세그먼트 이름에서 키워드 추출
        for key, weight in self.targeting_config['segment_weights'].items():
            if key.lower() in segment_name.lower():
                return weight
        
        # 기본 가중치
        return 1.0
    
    def run_targeting_pipeline(self, days_inactive=None, min_value_score=None, 
                              max_targets=None, min_reengagement_prob=None) -> pd.DataFrame:
        """
        전체 타겟팅 파이프라인 실행
        
        Args:
            days_inactive (int): 비활성으로 간주할 최소 일수
            min_value_score (float): 최소 사용자 가치 점수 임계값
            max_targets (int, optional): 최대 타겟팅할 사용자 수
            min_reengagement_prob (float): 최소 재참여 확률 임계값
            
        Returns:
            pd.DataFrame: 타겟팅 결과
        """
        # 기본값 설정
        days_inactive = days_inactive or self.targeting_config['days_inactive_threshold']
        min_value_score = min_value_score or self.targeting_config['min_value_score']
        min_reengagement_prob = min_reengagement_prob or self.targeting_config['min_reengagement_probability']
        max_targets = max_targets or self.targeting_config['default_targeting_batch_size']
        
        logger.info("Starting targeting pipeline with days_inactive=%d, min_value_score=%.2f, min_reengagement_prob=%.2f",
                   days_inactive, min_value_score, min_reengagement_prob)
        
        # 1. 사용자 데이터 가져오기
        user_data = self.value_scoring.fetch_user_data(days_inactive)
        
        if user_data.empty:
            logger.warning("No user data available for targeting")
            return pd.DataFrame()
        
        # 2. 사용자 가치 점수 계산
        scored_users = self.value_scoring.calculate_user_value_score(user_data)
        
        # 3. 재참여 확률 예측
        if 'reengagement_probability' not in scored_users.columns:
            # 예측 모델로 재참여 확률 계산
            try:
                predictions = self.prediction_model.predict_reengagement(scored_users)
                # 예측 결과 병합
                for col in predictions.columns:
                    if col not in scored_users.columns and col != 'index':
                        scored_users[col] = predictions[col]
            except Exception as e:
                logger.error(f"Error predicting reengagement: {str(e)}")
                # 기본값 설정
                scored_users['reengagement_probability'] = 0.5
                scored_users['recommended_for_event'] = False
                scored_users['optimal_event_type'] = None
                scored_users['recommended_reward'] = 0
        
        # 4. 사용자 세그먼테이션 수행
        try:
            # 세그먼테이션 실행
            preprocessed_data, features = self.segmentation.preprocess_for_clustering(scored_users)
            
            if not preprocessed_data.empty and len(features) > 0:
                # 최적 클러스터 수 결정
                cluster_eval = self.segmentation.determine_optimal_clusters(preprocessed_data)
                n_clusters = cluster_eval.get('recommended_n_clusters', 5)
                
                # 클러스터링 수행
                cluster_labels, _ = self.segmentation.perform_clustering(preprocessed_data, n_clusters)
                
                # 클러스터 분석
                self.segmentation.analyze_clusters(scored_users, cluster_labels, features)
                
                # 세그먼트 정의 생성
                segment_definitions = self.segmentation.create_segment_definitions()
                
                # 결과에 세그먼트 정보 추가
                scored_users['segment_id'] = cluster_labels
                
                # 세그먼트 이름 매핑
                segment_names = {}
                for seg_id, definition in segment_definitions.items():
                    segment_names[int(seg_id)] = definition['name']
                
                scored_users['segment_name'] = scored_users['segment_id'].map(
                    lambda x: segment_names.get(x, f"세그먼트 {x}")
                )
                
                # 세그먼트 가중치 적용
                scored_users['segment_weight'] = scored_users['segment_name'].apply(
                    lambda x: self._get_segment_weight(x)
                )
                
                # 이벤트 유형 가져오기
                self.prediction_model.fetch_event_types()
                
                # 세그먼트와 이벤트 매핑
                if hasattr(self.prediction_model, 'event_types') and self.prediction_model.event_types:
                    # 이미 사용자별 이벤트 매핑이 없으면 세그먼트 기반 매핑 추가
                    if 'optimal_event_type' not in scored_users.columns or scored_users['optimal_event_type'].isna().all():
                        # 세그먼트와 이벤트 매핑 수행
                        segment_event_mapping = {}
                        
                        for segment_id, segment_info in segment_definitions.items():
                            segment_id = int(segment_id)
                            segment_characteristics = segment_info.get('characteristics', [])
                            
                            # 세그먼트 특성에 기반한 이벤트 매칭
                            optimal_event = self._match_segment_to_event(
                                segment_id, 
                                segment_characteristics,
                                self.prediction_model.event_types
                            )
                            
                            segment_event_mapping[segment_id] = optimal_event
                        
                        # 매핑 결과 적용
                        scored_users['optimal_event_type'] = scored_users['segment_id'].map(
                            lambda x: segment_event_mapping.get(x, {}).get('event_id')
                        )
                        scored_users['recommended_reward'] = scored_users['segment_id'].map(
                            lambda x: segment_event_mapping.get(x, {}).get('reward', 0)
                        )
            else:
                logger.warning("Not enough data or features for segmentation")
        
        except Exception as e:
            logger.error(f"Error in segmentation: {str(e)}")
        
        # 5. 타겟팅 점수 계산 (가치 점수, 재참여 확률, 세그먼트 가중치 조합)
        scored_users['targeting_score'] = (
            scored_users['user_value_score'] * 0.4 +
            scored_users['reengagement_probability'] * 0.4 +
            scored_users.get('segment_weight', 1.0) * 0.2
        )
        
        # 6. 타겟팅 필터링
        targets = scored_users[
            (scored_users['user_value_score'] >= min_value_score) &
            (scored_users['reengagement_probability'] >= min_reengagement_prob)
        ]
        
        # 타겟팅 점수에 따라 정렬
        targets = targets.sort_values('targeting_score', ascending=False)
        
        # 필요한 경우 최대 타겟 수 제한
        if max_targets is not None and max_targets > 0:
            targets = targets.head(max_targets)
        
        # 7. 타겟팅 상태 추가
        targets['targeting_date'] = datetime.now()
        targets['targeting_status'] = 'selected'
        
        # 예상 ROI 계산
        if 'recommended_reward' in targets.columns:
            # 예상 입금액
            targets['expected_deposit'] = targets['reengagement_probability'] * targets['avg_deposit_amount']
            
            # 예상 ROI (투자수익률)
            targets['expected_roi'] = targets.apply(
                lambda x: (x['expected_deposit'] / x['recommended_reward']) - 1 
                if x['recommended_reward'] > 0 else 0,
                axis=1
            )
        
        # 8. 결과 저장
        self.targeting_results = targets
        
        # 타임스탬프 생성
        timestamp = datetime.now().strftime("%Y%m%d_%H%M%S")
        output_file = os.path.join(self.output_dir, f"targeting_results_{timestamp}.csv")
        
        try:
            # 저장할 열 선택
            columns_to_save = [
                'userId', 'player_id', 'targeting_score', 'user_value_score', 'value_tier',
                'reengagement_probability', 'segment_id', 'segment_name', 'segment_weight',
                'optimal_event_type', 'recommended_reward', 'targeting_status',
                'targeting_date', 'days_inactive', 'expected_deposit', 'expected_roi'
            ]
            
            # 존재하는 열만 선택
            save_cols = [col for col in columns_to_save if col in targets.columns]
            
            targets[save_cols].to_csv(output_file, index=False)
            logger.info(f"Saved targeting results to {output_file}")
        except Exception as e:
            logger.error(f"Error saving targeting results: {str(e)}")
        
        logger.info(f"Targeting pipeline completed with {len(targets)} selected targets")
        return targets
    
    def _match_segment_to_event(self, segment_id: int, segment_characteristics: List[str], 
                              event_types: Dict[str, Dict]) -> Dict[str, Any]:
        """
        세그먼트와 이벤트 매칭
        
        Args:
            segment_id (int): 세그먼트 ID
            segment_characteristics (List[str]): 세그먼트 특성 목록
            event_types (Dict[str, Dict]): 이벤트 타입 정보
            
        Returns:
            Dict[str, Any]: 최적의 이벤트 정보
        """
        if not event_types:
            return {'event_id': None, 'reward': 0}
        
        # 세그먼트 특성에 따른 점수 산출
        event_scores = {}
        
        for event_id, event_info in event_types.items():
            score = 0
            
            # 1. 장기 비활성 사용자에게는 전환율이 높은 이벤트 우선
            if any("장기 비활성" in char for char in segment_characteristics):
                score += event_info.get('conversion_rate', 0) * 3
            
            # 2. 이전에 입금했던 사용자에게는 ROI가 높은 이벤트 우선
            if any("입금 경험" in char for char in segment_characteristics):
                score += event_info.get('roi', 0) * 2
            
            # 3. 소셜 플레이어에게는 참여율이 높은 이벤트 우선
            if any("소셜" in char for char in segment_characteristics):
                score += event_info.get('fulfillment_rate', 0) * 1.5
            
            # 4. 낮은 가치 사용자에게는 비용이 낮은 이벤트 우선
            if any("낮음" in char or "없음" in char for char in segment_characteristics):
                avg_reward = event_info.get('avg_reward', float('inf'))
                if avg_reward > 0:
                    score += (1 / avg_reward) * 2
            
            # 5. 높은 가치 사용자에게는 고가치 이벤트 우선
            if any("높음" in char or "매우 높음" in char for char in segment_characteristics):
                score += event_info.get('avg_deposit_amount', 0) / 1000  # 금액 기반 점수
            
            # 6. 전환율이 높은 사용자에게는 높은 ROI 이벤트 우선
            if any("전환" in char or "긍정적" in char for char in segment_characteristics):
                score += event_info.get('roi', 0) * 1.5
            
            # 기본 점수: 모든 이벤트에 적용
            score += event_info.get('conversion_rate', 0) * 1
            
            event_scores[event_id] = score
        
        # 가장 높은 점수의 이벤트 선택
        if event_scores:
            best_event_id = max(event_scores.items(), key=lambda x: x[1])[0]
            best_event_info = event_types[best_event_id]
            
            # 보상 금액 조정 (세그먼트 특성에 따라)
            reward_adjustment = 1.0
            
            # 높은 가치 세그먼트에는 더 높은 보상
            if any("높음" in char for char in segment_characteristics):
                reward_adjustment = 1.2
            elif any("매우 높음" in char for char in segment_characteristics):
                reward_adjustment = 1.5
            # 낮은 가치 세그먼트에는 더 낮은 보상
            elif any("낮음" in char for char in segment_characteristics):
                reward_adjustment = 0.8
            
            # 보상 금액 계산
            reward = best_event_info.get('avg_reward', 0) * reward_adjustment
            
            # 보상 금액 제한
            reward = max(min(reward, self.targeting_config['max_reward_amount']), 
                         self.targeting_config['min_reward_amount'])
            
            return {
                'event_id': best_event_id,
                'reward': reward,
                'score': event_scores[best_event_id]
            }
        else:
            return {'event_id': None, 'reward': 0, 'score': 0}
    
    def generate_targeting_campaign(self, name: str, description: str, budget: float = None) -> Dict[str, Any]:
        """
        타겟팅 캠페인 생성
        
        Args:
            name (str): 캠페인 이름
            description (str): 캠페인 설명
            budget (float, optional): 캠페인 예산. 기본값은 None (제한 없음).
            
        Returns:
            Dict[str, Any]: 캠페인 정보
        """
        if self.targeting_results is None or self.targeting_results.empty:
            logger.warning("No targeting results available for campaign")
            return {}
        
        # 캠페인 ID 생성
        campaign_id = f"campaign_{datetime.now().strftime('%Y%m%d_%H%M%S')}"
        
        # 총 예상 보상 금액 계산
        total_reward = self.targeting_results['recommended_reward'].sum()
        
        # 예산 제한이 있는 경우
        if budget is not None and budget > 0 and total_reward > budget:
            # 예산 내에서 최대한 많은 사용자 선택
            sorted_targets = self.targeting_results.sort_values('targeting_score', ascending=False).copy()
            sorted_targets['cumulative_reward'] = sorted_targets['recommended_reward'].cumsum()
            
            # 예산 내의 사용자만 선택
            budget_targets = sorted_targets[sorted_targets['cumulative_reward'] <= budget]
            
            if budget_targets.empty:
                # 예산이 너무 작아 첫 번째 사용자도 포함할 수 없는 경우
                budget_targets = sorted_targets.head(1)
            
            # 타겟팅 결과 업데이트
            self.targeting_results = budget_targets
            
            # 총 보상 금액 업데이트
            total_reward = self.targeting_results['recommended_reward'].sum()
        
        # 세그먼트 분포 계산
        segment_distribution = {}
        if 'segment_name' in self.targeting_results.columns:
            segment_counts = self.targeting_results['segment_name'].value_counts()
            for segment, count in segment_counts.items():
                segment_distribution[segment] = {
                    'count': int(count),
                    'percentage': float(count / len(self.targeting_results) * 100)
                }
        
        # 이벤트 분포 계산
        event_distribution = {}
        if 'optimal_event_type' in self.targeting_results.columns:
            event_counts = self.targeting_results['optimal_event_type'].value_counts()
            for event, count in event_counts.items():
                event_distribution[event] = {
                    'count': int(count),
                    'percentage': float(count / len(self.targeting_results) * 100)
                }
        
        # 예상 ROI 및 전환율 계산
        expected_conversion_rate = 0
        expected_roi = 0
        if 'reengagement_probability' in self.targeting_results.columns:
            expected_conversion_rate = self.targeting_results['reengagement_probability'].mean()
        
        if 'expected_roi' in self.targeting_results.columns:
            expected_roi = self.targeting_results['expected_roi'].mean()
        
        # 예상 수익 계산
        expected_revenue = 0
        if 'expected_deposit' in self.targeting_results.columns:
            expected_revenue = self.targeting_results['expected_deposit'].sum()
        
        # 캠페인 정보 생성
        campaign = {
            'id': campaign_id,
            'name': name,
            'description': description,
            'created_at': datetime.now().isoformat(),
            'status': 'created',
            'budget': budget,
            'target_count': len(self.targeting_results),
            'total_reward': float(total_reward),
            'expected_conversion_rate': expected_conversion_rate,
            'expected_roi': expected_roi,
            'expected_revenue': expected_revenue,
            'segment_distribution': segment_distribution,
            'event_distribution': event_distribution
        }
        
        # 캠페인 이력에 추가
        self.campaign_history.append(campaign)
        
        # 캠페인 파일 저장
        campaign_file = os.path.join(self.campaign_dir, f"{campaign_id}.json")
        
        try:
            with open(campaign_file, 'w', encoding='utf-8') as f:
                json.dump(campaign, f, ensure_ascii=False, indent=2)
            
            # 타겟팅 결과 파일 저장
            targets_file = os.path.join(self.campaign_dir, f"{campaign_id}_targets.csv")
            self.targeting_results.to_csv(targets_file, index=False)
            
            logger.info(f"Campaign '{name}' created with {len(self.targeting_results)} targets")
            logger.info(f"Campaign files saved to {campaign_file} and {targets_file}")
        except Exception as e:
            logger.error(f"Error saving campaign: {str(e)}")
        
        return campaign
    
    def load_campaign(self, campaign_id: str) -> Dict[str, Any]:
        """
        캠페인 로드
        
        Args:
            campaign_id (str): 캠페인 ID
            
        Returns:
            Dict[str, Any]: 캠페인 정보
        """
        campaign_file = os.path.join(self.campaign_dir, f"{campaign_id}.json")
        targets_file = os.path.join(self.campaign_dir, f"{campaign_id}_targets.csv")
        
        if not os.path.exists(campaign_file) or not os.path.exists(targets_file):
            logger.warning(f"Campaign files not found for ID: {campaign_id}")
            return {}
        
        try:
            # 캠페인 정보 로드
            with open(campaign_file, 'r', encoding='utf-8') as f:
                campaign = json.load(f)
            
            # 타겟팅 결과 로드
            self.targeting_results = pd.read_csv(targets_file)
            
            logger.info(f"Loaded campaign: {campaign.get('name', campaign_id)}")
            return campaign
        except Exception as e:
            logger.error(f"Error loading campaign: {str(e)}")
            return {}
    
    def list_campaigns(self) -> List[Dict[str, Any]]:
        """
        모든 캠페인 목록 조회
        
        Returns:
            List[Dict[str, Any]]: 캠페인 목록
        """
        campaigns = []
        
        # 캠페인 파일 검색
        for filename in os.listdir(self.campaign_dir):
            if filename.startswith('campaign_') and filename.endswith('.json'):
                campaign_id = filename[:-5]  # .json 확장자 제거
                
                try:
                    # 캠페인 정보 로드
                    with open(os.path.join(self.campaign_dir, filename), 'r', encoding='utf-8') as f:
                        campaign = json.load(f)
                    
                    # 기본 정보만 포함
                    campaign_summary = {
                        'id': campaign.get('id', campaign_id),
                        'name': campaign.get('name', ''),
                        'created_at': campaign.get('created_at', ''),
                        'status': campaign.get('status', ''),
                        'target_count': campaign.get('target_count', 0),
                        'total_reward': campaign.get('total_reward', 0),
                        'expected_conversion_rate': campaign.get('expected_conversion_rate', 0),
                        'expected_roi': campaign.get('expected_roi', 0),
                    }
                    
                    campaigns.append(campaign_summary)
                except Exception as e:
                    logger.error(f"Error loading campaign {campaign_id}: {str(e)}")
        
        # 생성일 기준 정렬
        campaigns.sort(key=lambda x: x.get('created_at', ''), reverse=True)
        
        return campaigns
    
    def update_campaign_status(self, campaign_id: str, status: str) -> bool:
        """
        캠페인 상태 업데이트
        
        Args:
            campaign_id (str): 캠페인 ID
            status (str): 새 상태 (created, running, completed, cancelled)
            
        Returns:
            bool: 업데이트 성공 여부
        """
        campaign_file = os.path.join(self.campaign_dir, f"{campaign_id}.json")
        
        if not os.path.exists(campaign_file):
            logger.warning(f"Campaign file not found: {campaign_id}")
            return False
        
        try:
            # 캠페인 정보 로드
            with open(campaign_file, 'r', encoding='utf-8') as f:
                campaign = json.load(f)
            
            # 상태 업데이트
            campaign['status'] = status
            
            # 실행 시간 업데이트
            if status == 'running':
                campaign['started_at'] = datetime.now().isoformat()
            elif status in ['completed', 'cancelled']:
                campaign['ended_at'] = datetime.now().isoformat()
            
            # 변경 저장
            with open(campaign_file, 'w', encoding='utf-8') as f:
                json.dump(campaign, f, ensure_ascii=False, indent=2)
            
            logger.info(f"Updated campaign {campaign_id} status to {status}")
            return True
        
        except Exception as e:
            logger.error(f"Error updating campaign status: {str(e)}")
            return False
    
    def get_campaign_performance(self, campaign_id: str) -> Dict[str, Any]:
        """
        캠페인 성과 조회
        
        Args:
            campaign_id (str): 캠페인 ID
            
        Returns:
            Dict[str, Any]: 캠페인 성과 정보
        """
        campaign = self.load_campaign(campaign_id)
        
        if not campaign:
            return {}
        
        # 타겟팅 대상 사용자 ID 목록
        if self.targeting_results is None or self.targeting_results.empty:
            logger.warning(f"No targeting results for campaign {campaign_id}")
            return campaign
        
        try:
            # 사용자 ID 목록 및 플레이어 ID 목록
            user_ids = self.targeting_results['userId'].tolist()
            player_ids = self.targeting_results['player_id'].tolist() if 'player_id' in self.targeting_results.columns else []
            
            # 캠페인 이후 활동 쿼리
            if player_ids:
                # 플레이어 ID 조건 생성
                player_id_list = ', '.join([str(pid) for pid in player_ids])
                
                # 캠페인 생성 이후 기간
                created_at = datetime.fromisoformat(campaign['created_at'])
                created_at_str = created_at.strftime('%Y-%m-%d %H:%M:%S')
                
                # 1. 게임 참여 쿼리
                game_query = f"""
                SELECT
                    g.userId,
                    COUNT(*) AS game_count,
                    MIN(g.gameDate) AS first_game_date,
                    MAX(g.gameDate) AS last_game_date,
                    SUM(g.netBet) AS total_net_bet,
                    SUM(g.winLoss) AS total_win_loss
                FROM
                    game_scores g
                WHERE
                    g.userId IN ({', '.join([f"'{uid}'" for uid in user_ids])})
                    AND g.gameDate > '{created_at_str}'
                GROUP BY
                    g.userId
                """
                
                # 2. 입금 쿼리
                deposit_query = f"""
                SELECT
                    p.userId,
                    COUNT(*) AS deposit_count,
                    SUM(m.amount) AS total_deposit,
                    MIN(m.createdAt) AS first_deposit_date,
                    MAX(m.createdAt) AS last_deposit_date
                FROM
                    money_flows m
                JOIN
                    players p ON m.player = p.id
                WHERE
                    m.player IN ({player_id_list})
                    AND m.type = 0  -- 입금
                    AND m.createdAt > '{created_at_str}'
                GROUP BY
                    p.userId
                """
                
                # 쿼리 실행
                with self.db.get_connection() as conn:
                    # 게임 참여 결과
                    game_results = pd.read_sql(game_query, conn)
                    
                    # 입금 결과
                    deposit_results = pd.read_sql(deposit_query, conn)
                
                # 성과 지표 계산
                performance = {
                    'reengaged_users': len(game_results),
                    'reengagement_rate': len(game_results) / len(user_ids) * 100,
                    'deposited_users': len(deposit_results),
                    'conversion_rate': len(deposit_results) / len(user_ids) * 100,
                    'total_deposits': deposit_results['total_deposit'].sum() if 'total_deposit' in deposit_results.columns else 0,
                    'average_deposit': deposit_results['total_deposit'].mean() if 'total_deposit' in deposit_results.columns and len(deposit_results) > 0 else 0,
                    'total_net_bet': game_results['total_net_bet'].sum() if 'total_net_bet' in game_results.columns else 0,
                    'total_win_loss': game_results['total_win_loss'].sum() if 'total_win_loss' in game_results.columns else 0,
                    'total_games_played': game_results['game_count'].sum() if 'game_count' in game_results.columns else 0
                }
                
                # ROI 계산
                if 'total_reward' in campaign and campaign['total_reward'] > 0:
                    performance['roi'] = (performance['total_deposits'] / campaign['total_reward']) - 1
                else:
                    performance['roi'] = 0
                
                # 결과 추가
                campaign['performance'] = performance
                
                # 활동한 사용자 세부 정보
                active_users = []
                
                for _, row in game_results.iterrows():
                    user_id = row['userId']
                    user_info = self.targeting_results[self.targeting_results['userId'] == user_id].iloc[0].to_dict() if user_id in self.targeting_results['userId'].values else {}
                    
                    # 입금 정보
                    deposit_info = deposit_results[deposit_results['userId'] == user_id].iloc[0].to_dict() if user_id in deposit_results['userId'].values else {
                        'deposit_count': 0,
                        'total_deposit': 0
                    }
                    
                    # 사용자 정보 결합
                    user_detail = {
                        'userId': user_id,
                        'games_played': row['game_count'],
                        'first_game_date': row['first_game_date'],
                        'last_game_date': row['last_game_date'],
                        'total_net_bet': row['total_net_bet'],
                        'total_win_loss': row['total_win_loss'],
                        'deposit_count': deposit_info.get('deposit_count', 0),
                        'total_deposit': deposit_info.get('total_deposit', 0),
                        'user_value_score': user_info.get('user_value_score', 0),
                        'reengagement_probability': user_info.get('reengagement_probability', 0),
                        'recommended_reward': user_info.get('recommended_reward', 0),
                        'optimal_event_type': user_info.get('optimal_event_type', None)
                    }
                    
                    active_users.append(user_detail)
                
                # 활동 사용자 정보 추가
                campaign['active_users'] = active_users
            
            return campaign
        
        except Exception as e:
            logger.error(f"Error getting campaign performance: {str(e)}")
            return campaign
    
    def export_campaign_report(self, campaign_id: str, format: str = 'csv') -> str:
        """
        캠페인 보고서 내보내기
        
        Args:
            campaign_id (str): 캠페인 ID
            format (str, optional): 내보내기 형식 ('csv', 'excel', 'json'). 기본값은 'csv'.
            
        Returns:
            str: 내보내기 파일 경로
        """
        # 캠페인 성과 조회
        campaign = self.get_campaign_performance(campaign_id)
        
        if not campaign:
            logger.warning(f"Campaign not found: {campaign_id}")
            return ""
        
        # 타임스탬프 생성
        timestamp = datetime.now().strftime("%Y%m%d_%H%M%S")
        
        # 보고서 디렉토리 생성
        reports_dir = os.path.join(self.output_dir, "reports")
        os.makedirs(reports_dir, exist_ok=True)
        
        try:
            if format == 'json':
                # JSON 형식 보고서
                report_file = os.path.join(reports_dir, f"{campaign_id}_report_{timestamp}.json")
                with open(report_file, 'w', encoding='utf-8') as f:
                    json.dump(campaign, f, ensure_ascii=False, indent=2)
            
            elif format == 'excel':
                # Excel 형식 보고서
                report_file = os.path.join(reports_dir, f"{campaign_id}_report_{timestamp}.xlsx")
                
                # 여러 시트로 나누기
                writer = pd.ExcelWriter(report_file, engine='openpyxl')
                
                # 캠페인 요약
                summary = pd.DataFrame([{
                    'Campaign ID': campaign.get('id', ''),
                    'Name': campaign.get('name', ''),
                    'Created At': campaign.get('created_at', ''),
                    'Status': campaign.get('status', ''),
                    'Target Count': campaign.get('target_count', 0),
                    'Total Reward': campaign.get('total_reward', 0),
                    'Reengaged Users': campaign.get('performance', {}).get('reengaged_users', 0),
                    'Reengagement Rate (%)': campaign.get('performance', {}).get('reengagement_rate', 0),
                    'Deposited Users': campaign.get('performance', {}).get('deposited_users', 0),
                    'Conversion Rate (%)': campaign.get('performance', {}).get('conversion_rate', 0),
                    'Total Deposits': campaign.get('performance', {}).get('total_deposits', 0),
                    'ROI (%)': campaign.get('performance', {}).get('roi', 0) * 100,
                    'Total Games Played': campaign.get('performance', {}).get('total_games_played', 0)
                }])
                
                summary.to_excel(writer, sheet_name='Summary', index=False)
                
                # 타겟팅 결과
                if self.targeting_results is not None and not self.targeting_results.empty:
                    self.targeting_results.to_excel(writer, sheet_name='Targets', index=False)
                
                # 활동 사용자
                if 'active_users' in campaign and campaign['active_users']:
                    active_df = pd.DataFrame(campaign['active_users'])
                    active_df.to_excel(writer, sheet_name='Active Users', index=False)
                
                writer.save()
            
            else:  # CSV 기본값
                # CSV 형식 보고서
                report_file = os.path.join(reports_dir, f"{campaign_id}_report_{timestamp}.csv")
                
                # 캠페인 정보와 성과를 평면화
                report_data = {
                    'campaign_id': campaign.get('id', ''),
                    'name': campaign.get('name', ''),
                    'created_at': campaign.get('created_at', ''),
                    'status': campaign.get('status', ''),
                    'target_count': campaign.get('target_count', 0),
                    'total_reward': campaign.get('total_reward', 0)
                }
                
                # 성과 정보 추가
                if 'performance' in campaign:
                    for key, value in campaign['performance'].items():
                        report_data[key] = value
                
                # 데이터프레임으로 변환
                report_df = pd.DataFrame([report_data])
                report_df.to_csv(report_file, index=False)
                
                # 활동 사용자 파일 추가 저장
                if 'active_users' in campaign and campaign['active_users']:
                    active_file = os.path.join(reports_dir, f"{campaign_id}_active_users_{timestamp}.csv")
                    active_df = pd.DataFrame(campaign['active_users'])
                    active_df.to_csv(active_file, index=False)
            
            logger.info(f"Campaign report exported to {report_file}")
            return report_file
        
        except Exception as e:
            logger.error(f"Error exporting campaign report: {str(e)}")
            return ""
            