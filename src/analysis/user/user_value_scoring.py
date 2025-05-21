#!/usr/bin/env python
# -*- coding: utf-8 -*-

"""
사용자 가치 점수화 및 순위 지정 시스템

이 모듈은 Task #18.4 "User Value Scoring and Ranking System"을 구현합니다.
비활성 사용자를 여러 특성에 기반하여 점수화하고 가치에 따라 순위를 지정합니다.
"""

import os
import sys
import pandas as pd
import numpy as np
import json
import logging
import pickle
import matplotlib.pyplot as plt
import seaborn as sns
from pathlib import Path
from datetime import datetime, timedelta
from typing import Dict, List, Tuple, Optional, Any, Union

# 프로젝트 루트 디렉토리를 sys.path에 추가
project_root = Path(__file__).parent.parent.parent.parent
sys.path.append(str(project_root))

from src.database.mariadb_connection import MariaDBConnection
from src.analysis.predictive_models.inactive_user_model import InactiveUserPredictionModel

# 로깅 설정
logging.basicConfig(
    level=logging.INFO,
    format='%(asctime)s - %(name)s - %(levelname)s - %(message)s'
)
logger = logging.getLogger(__name__)

class UserValueScoring:
    """
    사용자 가치 점수화 및 순위 지정 시스템 클래스
    """
    
    def __init__(self, db_connection=None, data_dir=None):
        """
        UserValueScoring 초기화
        
        Args:
            db_connection (MariaDBConnection, optional): 데이터베이스 연결 객체
            data_dir (str, optional): 데이터 저장 디렉토리 경로
        """
        self.db = db_connection if db_connection is not None else MariaDBConnection()
        self.data_dir = data_dir if data_dir is not None else str(project_root / "data" / "user_value")
        self.visualizations_dir = str(project_root / "data" / "user_value" / "visualizations")
        self.prediction_model = InactiveUserPredictionModel()
        
        # 출력 디렉토리 생성
        os.makedirs(self.data_dir, exist_ok=True)
        os.makedirs(self.visualizations_dir, exist_ok=True)
        
        # 점수화 구성
        self.scoring_config = {
            'weights': {
                'historical_spending': 0.35,
                'reengagement_probability': 0.30,
                'social_influence': 0.15,
                'engagement_history': 0.20
            },
            'thresholds': {
                'very_high_value': 0.8,
                'high_value': 0.6,
                'medium_value': 0.4,
                'low_value': 0.2
            }
        }
        
        # 설정 파일 로드 (있는 경우)
        self._load_config()
        
        logger.info("UserValueScoring initialized with data directory: %s", self.data_dir)
    
    def _load_config(self):
        """
        설정 파일 로드 (있는 경우)
        """
        config_path = os.path.join(self.data_dir, 'scoring_config.json')
        if os.path.exists(config_path):
            try:
                with open(config_path, 'r', encoding='utf-8') as f:
                    config = json.load(f)
                    
                    # 유효한 설정인지 검증
                    if isinstance(config, dict) and 'weights' in config and 'thresholds' in config:
                        # 가중치 합이 1이 되는지 확인
                        weights_sum = sum(config['weights'].values())
                        if 0.99 <= weights_sum <= 1.01:  # 부동소수점 오차 허용
                            self.scoring_config = config
                            logger.info("Loaded scoring configuration from %s", config_path)
                        else:
                            logger.warning("Invalid weights in config file (sum = %.2f), using defaults", weights_sum)
                    else:
                        logger.warning("Invalid config file format, using defaults")
            except Exception as e:
                logger.error("Error loading config file: %s", str(e))
    
    def save_config(self):
        """
        현재 설정을 파일로 저장
        """
        config_path = os.path.join(self.data_dir, 'scoring_config.json')
        try:
            with open(config_path, 'w', encoding='utf-8') as f:
                json.dump(self.scoring_config, f, indent=2, ensure_ascii=False)
            logger.info("Saved scoring configuration to %s", config_path)
        except Exception as e:
            logger.error("Error saving config file: %s", str(e))
    
    def update_weights(self, new_weights: Dict[str, float]):
        """
        점수화 가중치 업데이트
        
        Args:
            new_weights (Dict[str, float]): 점수화 가중치
        
        Returns:
            bool: 업데이트 성공 여부
        """
        # 모든 필수 가중치가 있는지 확인
        required_weights = set(self.scoring_config['weights'].keys())
        if not required_weights.issubset(set(new_weights.keys())):
            logger.error("Missing required weights: %s", required_weights - set(new_weights.keys()))
            return False
        
        # 가중치 합이 1이 되는지 확인
        weights_sum = sum(new_weights[key] for key in required_weights)
        if not (0.99 <= weights_sum <= 1.01):  # 부동소수점 오차 허용
            logger.error("Invalid weights sum: %.2f, must be 1.0", weights_sum)
            return False
        
        # 가중치 업데이트
        for key in required_weights:
            self.scoring_config['weights'][key] = new_weights[key]
        
        # 설정 저장
        self.save_config()
        return True
    
    def update_thresholds(self, new_thresholds: Dict[str, float]):
        """
        점수화 임계값 업데이트
        
        Args:
            new_thresholds (Dict[str, float]): 점수화 임계값
        
        Returns:
            bool: 업데이트 성공 여부
        """
        # 모든 필수 임계값이 있는지 확인
        required_thresholds = set(self.scoring_config['thresholds'].keys())
        if not required_thresholds.issubset(set(new_thresholds.keys())):
            logger.error("Missing required thresholds: %s", required_thresholds - set(new_thresholds.keys()))
            return False
        
        # 임계값이 오름차순인지 확인
        thresholds = [new_thresholds['low_value'], new_thresholds['medium_value'], 
                      new_thresholds['high_value'], new_thresholds['very_high_value']]
        if not all(thresholds[i] < thresholds[i+1] for i in range(len(thresholds)-1)):
            logger.error("Thresholds must be in ascending order")
            return False
        
        # 임계값 업데이트
        for key in required_thresholds:
            self.scoring_config['thresholds'][key] = new_thresholds[key]
        
        # 설정 저장
        self.save_config()
        return True
    
    def fetch_user_data(self, days_inactive=30) -> pd.DataFrame:
        """
        데이터베이스에서 사용자 데이터 가져오기
        
        Args:
            days_inactive (int): 비활성으로 간주할 최소 일수. 기본값은 30.
            
        Returns:
            pd.DataFrame: 사용자 데이터
        """
        logger.info(f"Fetching inactive user data with days_inactive={days_inactive}")
        
        query = f"""
        SELECT 
            p.userId,  -- Using userId as the identifier instead of id or name
            p.id as player_id,
            DATEDIFF(NOW(), (SELECT MAX(gameDate) FROM game_scores 
                             WHERE userId = p.userId)) AS days_inactive,
            ROUND(IFNULL(
                (SELECT SUM(amount) FROM money_flows 
                 WHERE player = p.id AND type = 0 AND createdAt >= DATE_SUB(NOW(), INTERVAL 365 DAY)), 
                0
            )) AS total_deposits_1y,
            ROUND(IFNULL(
                (SELECT SUM(amount) FROM money_flows 
                 WHERE player = p.id AND type = 1 AND createdAt >= DATE_SUB(NOW(), INTERVAL 365 DAY)), 
                0
            )) AS total_withdrawals_1y,
            ROUND(IFNULL(
                (SELECT AVG(amount) FROM money_flows 
                 WHERE player = p.id AND type = 0 AND createdAt >= DATE_SUB(NOW(), INTERVAL 365 DAY)), 
                0
            )) AS avg_deposit_amount,
            (SELECT COUNT(*) FROM game_scores 
             WHERE userId = p.userId AND gameDate >= DATE_SUB(NOW(), INTERVAL 365 DAY)) AS game_count,
            (SELECT MAX(gameDate) FROM game_scores 
             WHERE userId = p.userId) AS last_played_date,
            (SELECT COUNT(*) FROM promotion_players pp 
             WHERE pp.player = p.id AND pp.appliedAt IS NOT NULL) AS events_received,
            CASE 
                WHEN (SELECT COUNT(*) FROM money_flows 
                      WHERE player = p.id AND type = 0 AND 
                      createdAt > (SELECT MIN(pp2.appliedAt) FROM promotion_players pp2 
                                   WHERE pp2.player = p.id AND pp2.appliedAt IS NOT NULL)) > 0 
                THEN 1 ELSE 0 
            END AS converted_after_event,
            ROUND(IFNULL(
                (SELECT SUM(amount) FROM money_flows 
                 WHERE player = p.id AND type = 0 AND 
                 createdAt > (SELECT MIN(pp2.appliedAt) FROM promotion_players pp2 
                             WHERE pp2.player = p.id AND pp2.appliedAt IS NOT NULL)), 
                0
            )) AS deposit_amount_after_event,
            p.status,
            IFNULL(
                (SELECT COUNT(*) FROM game_scores 
                 WHERE userId = p.userId), 
                0
            ) AS total_games_played,
            IFNULL(
                (SELECT COUNT(DISTINCT DATE(gameDate)) FROM game_scores 
                 WHERE userId = p.userId), 
                0
            ) AS total_days_played,
            IFNULL(
                (SELECT COUNT(*) FROM money_flows 
                 WHERE player = p.id AND type = 0), 
                0
            ) AS total_deposits_count,
            IFNULL(
                (SELECT AVG(ROUND(netBet)) FROM game_scores 
                 WHERE userId = p.userId AND gameDate >= DATE_SUB(NOW(), INTERVAL 365 DAY)), 
                0
            ) AS avg_net_bet,
            IFNULL(
                (SELECT SUM(ROUND(winLoss)) FROM game_scores 
                 WHERE userId = p.userId AND gameDate >= DATE_SUB(NOW(), INTERVAL 365 DAY)), 
                0
            ) AS total_win_loss_1y
        FROM 
            players p
        WHERE 
            p.status = 0  -- 활성 계정만 포함
            AND (
                -- days_inactive 일 이상 활동이 없지만 과거에는 플레이한 적 있음
                SELECT MAX(gameDate) FROM game_scores WHERE userId = p.userId
            ) < DATE_SUB(NOW(), INTERVAL {days_inactive} DAY)
            AND (
                -- 적어도 한 번은 플레이함
                SELECT COUNT(*) FROM game_scores WHERE userId = p.userId
            ) > 0
        LIMIT 5000  -- 데이터베이스 부하 방지를 위한 제한
        """
        
        try:
            with self.db.get_connection() as conn:
                user_df = pd.read_sql(query, conn)
                
                if user_df.empty:
                    logger.warning(f"No inactive users found with days_inactive={days_inactive}")
                    return pd.DataFrame()
                
                logger.info(f"Fetched {len(user_df)} inactive users")
                return user_df
                
        except Exception as e:
            logger.error(f"Error fetching user data: {str(e)}")
            return pd.DataFrame()
    
    def calculate_historical_spending_score(self, user_data: pd.DataFrame) -> pd.DataFrame:
        """
        사용자의 과거 지출 패턴에 기반한 점수 계산
        
        Args:
            user_data (pd.DataFrame): 사용자 데이터
            
        Returns:
            pd.DataFrame: 점수가 추가된 사용자 데이터
        """
        df = user_data.copy()
        
        # 필요한 열이 있는지 확인
        required_cols = ['total_deposits_1y', 'avg_deposit_amount', 'total_deposits_count']
        missing_cols = set(required_cols) - set(df.columns)
        
        if missing_cols:
            logger.warning(f"Missing columns for historical spending score: {missing_cols}")
            # 기본값으로 설정
            for col in missing_cols:
                df[col] = 0
        
        # 총 입금액 점수 (로그 스케일 적용)
        max_deposit = max(df['total_deposits_1y'].max(), 1)
        df['deposit_amount_score'] = np.log1p(df['total_deposits_1y']) / np.log1p(max_deposit)
        
        # 평균 입금액 점수 (로그 스케일 적용)
        max_avg_deposit = max(df['avg_deposit_amount'].max(), 1)
        df['avg_deposit_score'] = np.log1p(df['avg_deposit_amount']) / np.log1p(max_avg_deposit)
        
        # 입금 빈도 점수
        max_deposit_count = max(df['total_deposits_count'].max(), 1)
        df['deposit_frequency_score'] = df['total_deposits_count'] / max_deposit_count
        
        # 베팅 행동 점수 (가능한 경우)
        if 'avg_net_bet' in df.columns:
            max_net_bet = max(df['avg_net_bet'].max(), 1)
            df['betting_behavior_score'] = np.log1p(df['avg_net_bet']) / np.log1p(max_net_bet)
        else:
            df['betting_behavior_score'] = 0
        
        # 승패 점수 (가능한 경우)
        if 'total_win_loss_1y' in df.columns:
            # 승패 점수는 이긴 금액이 많을수록 높게 (손실이 많으면 점수 낮음)
            win_loss_values = df['total_win_loss_1y'].copy()
            min_value = win_loss_values.min()
            max_value = win_loss_values.max()
            
            if min_value < 0 and max_value > 0:
                # 양수와 음수가 모두 있는 경우
                range_value = max_value - min_value
                df['win_loss_score'] = (df['total_win_loss_1y'] - min_value) / range_value
            elif min_value >= 0:
                # 모두 양수인 경우
                df['win_loss_score'] = df['total_win_loss_1y'] / max(max_value, 1)
            else:
                # 모두 음수인 경우
                df['win_loss_score'] = 1 - abs(df['total_win_loss_1y']) / abs(min_value)
        else:
            df['win_loss_score'] = 0.5  # 정보가 없으면 중간값
        
        # 최종 과거 지출 점수 계산 (가중 합계)
        df['historical_spending_score'] = (
            df['deposit_amount_score'] * 0.4 +
            df['avg_deposit_score'] * 0.2 +
            df['deposit_frequency_score'] * 0.2 +
            df['betting_behavior_score'] * 0.1 +
            df['win_loss_score'] * 0.1
        )
        
        return df
    
    def calculate_social_influence_score(self, user_data: pd.DataFrame) -> pd.DataFrame:
        """
        사용자의 소셜 영향력에 기반한 점수 계산
        
        Args:
            user_data (pd.DataFrame): 사용자 데이터
            
        Returns:
            pd.DataFrame: 점수가 추가된 사용자 데이터
        """
        df = user_data.copy()
        
        # 사용자의 소셜 영향력을 측정할 수 있는 데이터가 없는 경우
        # 게임 활동 기록을 기반으로 프록시 점수 계산
        
        # 게임 빈도 기반 점수
        if 'total_games_played' in df.columns:
            max_games = max(df['total_games_played'].max(), 1)
            df['game_frequency_score'] = np.log1p(df['total_games_played']) / np.log1p(max_games)
        else:
            df['game_frequency_score'] = 0
        
        # 플레이 일수 기반 점수
        if 'total_days_played' in df.columns:
            max_days = max(df['total_days_played'].max(), 1)
            df['play_days_score'] = df['total_days_played'] / max_days
        else:
            df['play_days_score'] = 0
        
        # 추가: 플레이 규칙성 점수 (일수 대비 게임 수의 비율)
        if 'total_games_played' in df.columns and 'total_days_played' in df.columns:
            df['play_regularity_score'] = df.apply(
                lambda x: x['total_games_played'] / max(x['total_days_played'], 1),
                axis=1
            )
            # 정규화
            max_regularity = max(df['play_regularity_score'].max(), 1)
            df['play_regularity_score'] = df['play_regularity_score'] / max_regularity
        else:
            df['play_regularity_score'] = 0
        
        # 플레이 지속성 점수 (비활성 기간에 반비례)
        if 'days_inactive' in df.columns:
            max_inactive = max(df['days_inactive'].max(), 1)
            df['play_recency_score'] = 1 - (df['days_inactive'] / max_inactive)
        else:
            df['play_recency_score'] = 0
        
        # 최종 소셜 영향력 점수 계산
        df['social_influence_score'] = (
            df['game_frequency_score'] * 0.35 +
            df['play_days_score'] * 0.25 +
            df['play_regularity_score'] * 0.15 +
            df['play_recency_score'] * 0.25
        )
        
        return df
    
    def calculate_engagement_history_score(self, user_data: pd.DataFrame) -> pd.DataFrame:
        """
        사용자의 과거 참여 이력에 기반한 점수 계산
        
        Args:
            user_data (pd.DataFrame): 사용자 데이터
            
        Returns:
            pd.DataFrame: 점수가 추가된 사용자 데이터
        """
        df = user_data.copy()
        
        # 필요한 열이 있는지 확인
        engagement_cols = ['events_received', 'converted_after_event', 'deposit_amount_after_event']
        missing_cols = set(engagement_cols) - set(df.columns)
        
        if missing_cols:
            logger.warning(f"Missing columns for engagement history score: {missing_cols}")
            # 기본값으로 설정
            for col in missing_cols:
                df[col] = 0
        
        # 이벤트 참여 점수
        max_events = max(df['events_received'].max(), 1)
        df['event_participation_score'] = df['events_received'] / max_events
        
        # 전환 점수 (이벤트 후 입금 여부)
        df['conversion_score'] = df['converted_after_event']
        
        # 입금 규모 점수 (로그 스케일 적용)
        max_deposit = max(df['deposit_amount_after_event'].max(), 1)
        df['deposit_size_score'] = np.log1p(df['deposit_amount_after_event']) / np.log1p(max_deposit)
        
        # 이벤트 전환 효율성 점수 (이벤트 대비 전환율)
        df['conversion_efficiency_score'] = df.apply(
            lambda x: x['converted_after_event'] / max(x['events_received'], 1),
            axis=1
        )
        
        # 최종 참여 이력 점수 계산
        df['engagement_history_score'] = (
            df['event_participation_score'] * 0.25 +
            df['conversion_score'] * 0.35 +
            df['deposit_size_score'] * 0.25 +
            df['conversion_efficiency_score'] * 0.15
        )
        
        return df
    
    def calculate_reengagement_probability(self, user_data: pd.DataFrame) -> pd.DataFrame:
        """
        사용자의 재참여 확률 계산
        
        Args:
            user_data (pd.DataFrame): 사용자 데이터
            
        Returns:
            pd.DataFrame: 재참여 확률이 추가된 사용자 데이터
        """
        try:
            # 예측 모델 로드
            if not os.path.exists(self.prediction_model.model_path):
                logger.warning(f"Prediction model not found: {self.prediction_model.model_path}")
                # 모델이 없으면 기본값 사용
                user_data['reengagement_probability'] = 0.5
                return user_data
            
            # 예측 실행
            predictions = self.prediction_model.predict_reengagement(user_data)
            
            # 예측 결과가 있는지 확인
            if 'reengagement_probability' not in predictions.columns:
                logger.warning("Prediction did not return reengagement probability")
                user_data['reengagement_probability'] = 0.5
                return user_data
            
            return predictions
        
        except Exception as e:
            logger.error(f"Error calculating reengagement probability: {str(e)}")
            # 오류 발생 시 기본값 사용
            user_data['reengagement_probability'] = 0.5
            return user_data
    
    def calculate_user_value_score(self, user_data: pd.DataFrame) -> pd.DataFrame:
        """
        사용자의 총 가치 점수 계산
        
        Args:
            user_data (pd.DataFrame): 사용자 데이터
            
        Returns:
            pd.DataFrame: 가치 점수가 추가된 사용자 데이터
        """
        # 각 개별 점수 계산
        df = self.calculate_historical_spending_score(user_data)
        df = self.calculate_social_influence_score(df)
        df = self.calculate_engagement_history_score(df)
        
        # 재참여 확률 계산
        if 'reengagement_probability' not in df.columns:
            df = self.calculate_reengagement_probability(df)
        
        # 총 가치 점수 계산 (가중 합계)
        weights = self.scoring_config['weights']
        
        df['user_value_score'] = (
            df['historical_spending_score'] * weights['historical_spending'] +
            df['reengagement_probability'] * weights['reengagement_probability'] +
            df['social_influence_score'] * weights['social_influence'] +
            df['engagement_history_score'] * weights['engagement_history']
        )
        
        # 가치 등급 할당
        thresholds = self.scoring_config['thresholds']
        
        df['value_tier'] = pd.cut(
            df['user_value_score'],
            bins=[0, thresholds['low_value'], thresholds['medium_value'], 
                  thresholds['high_value'], thresholds['very_high_value'], 1],
            labels=['매우 낮음', '낮음', '중간', '높음', '매우 높음'],
            include_lowest=True
        )
        
        # 일일 가치 예상 수치 추가
        # 사용자의 총 가치를 일일 ARPU로 환산한 대략적인 지표
        if 'total_deposits_1y' in df.columns and 'total_days_played' in df.columns:
            df['estimated_daily_value'] = df.apply(
                lambda x: (x['total_deposits_1y'] / max(365, x['total_days_played'])) * x['user_value_score'],
                axis=1
            )
        else:
            df['estimated_daily_value'] = df['user_value_score'] * 100  # 기본값 
        
        # 예상 LTV(Lifetime Value) 추가
        # 사용자의 가치 점수와 과거 지출 정보를 기반으로 한 간단한 추정
        df['estimated_ltv'] = df.apply(
            lambda x: x['total_deposits_1y'] * (1 + x['user_value_score'] * 2) if 'total_deposits_1y' in df.columns else x['user_value_score'] * 10000,
            axis=1
        )
        
        return df
    
    def rank_users_by_value(self, user_data: pd.DataFrame, top_n: int = None) -> pd.DataFrame:
        """
        가치 점수에 따라 사용자 순위 지정
        
        Args:
            user_data (pd.DataFrame): 사용자 데이터
            top_n (int, optional): 반환할 상위 사용자 수. 기본값은 None (모두 반환).
            
        Returns:
            pd.DataFrame: 순위가 지정된 사용자 데이터
        """
        # 사용자 가치 점수 계산
        if 'user_value_score' not in user_data.columns:
            df = self.calculate_user_value_score(user_data)
        else:
            df = user_data.copy()
        
        # 가치 점수에 따라 정렬
        ranked_users = df.sort_values('user_value_score', ascending=False).reset_index(drop=True)
        
        # 순위 열 추가
        ranked_users['value_rank'] = ranked_users.index + 1
        
        # 백분위 추가 (상위 % 표시)
        total_users = len(ranked_users)
        ranked_users['value_percentile'] = ranked_users.apply(
            lambda x: 100 - (x['value_rank'] / total_users * 100),
            axis=1
        )
        
        # 상위 N명만 반환
        if top_n is not None and top_n > 0:
            return ranked_users.head(top_n)
        
        return ranked_users
    
    def visualize_user_value_distribution(self, user_data: pd.DataFrame) -> Dict[str, str]:
        """
        사용자 가치 분포 시각화
        
        Args:
            user_data (pd.DataFrame): 가치 점수가 계산된 사용자 데이터
            
        Returns:
            Dict[str, str]: 시각화 파일 경로 목록
        """
        if 'user_value_score' not in user_data.columns or 'value_tier' not in user_data.columns:
            logger.warning("User value score or tier not found in data")
            return {}
        
        # 타임스탬프 생성
        timestamp = datetime.now().strftime("%Y%m%d_%H%M%S")
        
        # 결과 저장 딕셔너리
        visualization_paths = {}
        
        # 1. 가치 점수 히스토그램
        plt.figure(figsize=(12, 8))
        
        sns.histplot(user_data['user_value_score'], bins=20, kde=True)
        plt.axvline(x=self.scoring_config['thresholds']['very_high_value'], color='red', linestyle='--', 
                   label=f"매우 높음 >= {self.scoring_config['thresholds']['very_high_value']}")
        plt.axvline(x=self.scoring_config['thresholds']['high_value'], color='orange', linestyle='--', 
                   label=f"높음 >= {self.scoring_config['thresholds']['high_value']}")
        plt.axvline(x=self.scoring_config['thresholds']['medium_value'], color='green', linestyle='--', 
                   label=f"중간 >= {self.scoring_config['thresholds']['medium_value']}")
        plt.axvline(x=self.scoring_config['thresholds']['low_value'], color='blue', linestyle='--', 
                   label=f"낮음 >= {self.scoring_config['thresholds']['low_value']}")
        
        plt.xlabel('사용자 가치 점수')
        plt.ylabel('사용자 수')
        plt.title('사용자 가치 점수 분포')
        plt.legend()
        plt.grid(True, alpha=0.3)
        
        # 파일 저장
        hist_path = os.path.join(self.visualizations_dir, f"user_value_histogram_{timestamp}.png")
        plt.savefig(hist_path)
        plt.close()
        visualization_paths['histogram'] = hist_path
        
        # 2. 가치 등급별 사용자 수 막대 그래프
        plt.figure(figsize=(10, 6))
        
        tier_counts = user_data['value_tier'].value_counts().sort_index()
        tier_counts.plot(kind='bar', color='skyblue')
        
        plt.xlabel('가치 등급')
        plt.ylabel('사용자 수')
        plt.title('가치 등급별 사용자 분포')
        plt.xticks(rotation=45)
        plt.grid(True, axis='y', alpha=0.3)
        
        # 막대 위에 값 표시
        for i, v in enumerate(tier_counts):
            plt.text(i, v + 0.1, str(v), ha='center')
        
        # 파일 저장
        tier_path = os.path.join(self.visualizations_dir, f"user_value_tiers_{timestamp}.png")
        plt.savefig(tier_path)
        plt.close()
        visualization_paths['tiers'] = tier_path
        
        # 3. 특성별 가치 점수 기여도 막대 그래프
        plt.figure(figsize=(12, 8))
        
        # 각 특성의 평균 기여도 계산
        weights = self.scoring_config['weights']
        feature_contributions = {
            '과거 지출': user_data['historical_spending_score'].mean() * weights['historical_spending'],
            '재참여 확률': user_data['reengagement_probability'].mean() * weights['reengagement_probability'],
            '소셜 영향력': user_data['social_influence_score'].mean() * weights['social_influence'],
            '참여 이력': user_data['engagement_history_score'].mean() * weights['engagement_history']
        }
        
        # 정렬된 기여도로 막대 그래프 생성
        features = list(feature_contributions.keys())
        contributions = list(feature_contributions.values())
        
        # 가로 막대 그래프
        bars = plt.barh(features, contributions, color=['#1f77b4', '#ff7f0e', '#2ca02c', '#d62728'])
        
        plt.xlabel('평균 기여도')
        plt.title('사용자 가치 점수에 대한 특성별 평균 기여도')
        plt.grid(True, axis='x', alpha=0.3)
        
        # 막대 끝에 값 표시
        for i, v in enumerate(contributions):
            plt.text(v + 0.005, i, f'{v:.3f}', va='center')
        
        # 파일 저장
        contrib_path = os.path.join(self.visualizations_dir, f"feature_contributions_{timestamp}.png")
        plt.savefig(contrib_path)
        plt.close()
        visualization_paths['contributions'] = contrib_path
        
        # 4. 가치 점수 vs 재참여 확률 산점도
        plt.figure(figsize=(10, 8))
        
        # 점 색상을 등급에 따라 설정
        scatter = plt.scatter(
            user_data['reengagement_probability'],
            user_data['user_value_score'],
            c=user_data['value_tier'].astype('category').cat.codes,
            cmap='viridis',
            alpha=0.6
        )
        
        # 범례 추가
        legend_items = [plt.Line2D([0], [0], marker='o', color='w', 
                                  markerfacecolor=scatter.cmap(scatter.norm(i)), 
                                  markersize=10, label=label)
                       for i, label in enumerate(user_data['value_tier'].cat.categories)]
        plt.legend(handles=legend_items, title='가치 등급')
        
        plt.xlabel('재참여 확률')
        plt.ylabel('사용자 가치 점수')
        plt.title('재참여 확률 vs 사용자 가치 점수')
        plt.grid(True, alpha=0.3)
        
        # 파일 저장
        scatter_path = os.path.join(self.visualizations_dir, f"reengagement_vs_value_{timestamp}.png")
        plt.savefig(scatter_path)
        plt.close()
        visualization_paths['scatter'] = scatter_path
        
        # 5. 가치 점수 상자 그림 (등급별)
        plt.figure(figsize=(12, 6))
        
        sns.boxplot(x='value_tier', y='user_value_score', data=user_data, palette='viridis')
        
        plt.xlabel('가치 등급')
        plt.ylabel('사용자 가치 점수')
        plt.title('등급별 사용자 가치 점수 분포 (상자 그림)')
        plt.grid(True, axis='y', alpha=0.3)
        
        # 파일 저장
        boxplot_path = os.path.join(self.visualizations_dir, f"value_score_boxplot_{timestamp}.png")
        plt.savefig(boxplot_path)
        plt.close()
        visualization_paths['boxplot'] = boxplot_path
        
        return visualization_paths
    
    def save_value_rankings(self, ranked_users: pd.DataFrame) -> str:
        """
        사용자 가치 순위 저장
        
        Args:
            ranked_users (pd.DataFrame): 순위가 지정된 사용자 데이터
            
        Returns:
            str: 저장된 파일 경로
        """
        if ranked_users.empty:
            logger.warning("No ranked users to save")
            return ""
        
        # 타임스탬프 생성
        timestamp = datetime.now().strftime("%Y%m%d_%H%M%S")
        
        # 저장할 열 선택
        columns_to_save = [
            'userId', 'value_rank', 'value_percentile', 'user_value_score', 'value_tier',
            'historical_spending_score', 'reengagement_probability',
            'social_influence_score', 'engagement_history_score',
            'days_inactive', 'events_received', 'converted_after_event',
            'total_deposits_1y', 'total_games_played', 'estimated_daily_value', 'estimated_ltv'
        ]
        
        # 존재하는 열만 선택
        save_cols = [col for col in columns_to_save if col in ranked_users.columns]
        
        # CSV 파일로 저장
        output_file = os.path.join(self.data_dir, f"user_value_rankings_{timestamp}.csv")
        
        try:
            ranked_users[save_cols].to_csv(output_file, index=False)
            logger.info(f"Saved user value rankings to {output_file}")
            return output_file
        except Exception as e:
            logger.error(f"Error saving user value rankings: {str(e)}")
            return ""
    
    def get_high_value_inactive_users(self, days_inactive=30, min_value_score=0.6, top_n=100) -> pd.DataFrame:
        """
        가치가 높은 비활성 사용자 추출
        
        Args:
            days_inactive (int): 비활성으로 간주할 최소 일수. 기본값은 30.
            min_value_score (float): 최소 가치 점수. 기본값은 0.6.
            top_n (int): 반환할 상위 사용자 수. 기본값은 100.
            
        Returns:
            pd.DataFrame: 고가치 비활성 사용자 데이터
        """
        # 비활성 사용자 데이터 가져오기
        user_data = self.fetch_user_data(days_inactive)
        
        if user_data.empty:
            return pd.DataFrame()
        
        # 가치 점수 계산 및 순위 지정
        scored_users = self.calculate_user_value_score(user_data)
        ranked_users = self.rank_users_by_value(scored_users)
        
        # 최소 가치 점수 이상인 사용자만 필터링
        high_value_users = ranked_users[ranked_users['user_value_score'] >= min_value_score]
        
        # 상위 N명만 반환
        if top_n > 0 and len(high_value_users) > top_n:
            return high_value_users.head(top_n)
        
        return high_value_users
    
    def run_value_scoring_pipeline(self, days_inactive=30, save_results=True) -> pd.DataFrame:
        """
        전체 사용자 가치 점수화 파이프라인 실행
        
        Args:
            days_inactive (int): 비활성으로 간주할 최소 일수. 기본값은 30.
            save_results (bool): 결과를 저장할지 여부. 기본값은 True.
            
        Returns:
            pd.DataFrame: 가치 점수와 순위가 계산된 사용자 데이터
        """
        logger.info(f"Starting user value scoring pipeline with days_inactive={days_inactive}")
        
        # 1. 사용자 데이터 가져오기
        user_data = self.fetch_user_data(days_inactive)
        
        if user_data.empty:
            logger.warning("No user data available for value scoring")
            return pd.DataFrame()
        
        # 2. 사용자 가치 점수 계산
        scored_users = self.calculate_user_value_score(user_data)
        
        # 3. 사용자 순위 지정
        ranked_users = self.rank_users_by_value(scored_users)
        
        # 4. 결과 시각화
        if save_results:
            viz_paths = self.visualize_user_value_distribution(ranked_users)
            logger.info(f"User value distribution visualizations saved: {', '.join(viz_paths.values())}")
        
        # 5. 결과 저장
        if save_results:
            output_file = self.save_value_rankings(ranked_users)
            logger.info(f"User value rankings saved to {output_file}")
        
        # 6. 가치 등급별 통계 계산
        tier_stats = {}
        for tier in ranked_users['value_tier'].unique():
            tier_data = ranked_users[ranked_users['value_tier'] == tier]
            tier_stats[tier] = {
                'count': len(tier_data),
                'percentage': len(tier_data) / len(ranked_users) * 100,
                'avg_value_score': tier_data['user_value_score'].mean(),
                'avg_spending': tier_data['total_deposits_1y'].mean() if 'total_deposits_1y' in tier_data.columns else 0,
                'avg_reengagement_prob': tier_data['reengagement_probability'].mean(),
                'avg_estimated_ltv': tier_data['estimated_ltv'].mean() if 'estimated_ltv' in tier_data.columns else 0
            }
        
        # 7. 결과 요약 로깅
        logger.info(f"User value scoring pipeline completed for {len(ranked_users)} users")
        logger.info(f"Value tier distribution:")
        for tier, stats in tier_stats.items():
            logger.info(f"  {tier}: {stats['count']} users ({stats['percentage']:.1f}%), "
                       f"avg score: {stats['avg_value_score']:.3f}")
        
        return ranked_users

def main():
    """
    메인 함수 - 사용자 가치 점수화 파이프라인 테스트 실행
    """
    # 로깅 설정
    logging.basicConfig(
        level=logging.INFO,
        format='%(asctime)s - %(name)s - %(levelname)s - %(message)s'
    )
    
    try:
        # 데이터베이스 연결 생성
        db_connection = MariaDBConnection()
        
        # 사용자 가치 점수화 인스턴스 생성
        value_scoring = UserValueScoring(db_connection=db_connection)
        
        # 파이프라인 실행
        ranked_users = value_scoring.run_value_scoring_pipeline(days_inactive=30)
        
        # 결과 요약 출력
        if not ranked_users.empty:
            print(f"사용자 가치 점수화 완료: {len(ranked_users)} 사용자")
            
            print("\n가치 등급별 사용자 수:")
            tier_counts = ranked_users['value_tier'].value_counts().sort_index()
            for tier, count in tier_counts.items():
                print(f"  {tier}: {count}명 ({count/len(ranked_users)*100:.1f}%)")
            
            print("\n상위 10명 사용자:")
            top_10 = ranked_users.head(10)[['userId', 'value_rank', 'user_value_score', 'value_tier']]
            print(top_10)
            
            print("\n고가치 사용자 추천 조치:")
            for tier in ['매우 높음', '높음']:
                tier_users = ranked_users[ranked_users['value_tier'] == tier]
                if not tier_users.empty:
                    print(f"\n{tier} 등급 ({len(tier_users)}명) 재활성화 우선순위:")
                    for _, user in tier_users.head(5).iterrows():
                        print(f"  사용자 {user['userId']}: 가치 점수 {user['user_value_score']:.3f}, "
                              f"재참여 확률 {user['reengagement_probability']:.3f}, "
                              f"추정 LTV {user['estimated_ltv']:,.0f}원")
        else:
            print("사용자 가치 점수화를 완료할 수 없습니다.")
    
    except Exception as e:
        logging.error(f"사용자 가치 점수화 실행 중 오류 발생: {str(e)}", exc_info=True)

if __name__ == "__main__":
    main()
