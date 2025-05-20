"""
비활성 사용자 타겟팅 파이프라인 모듈

이 모듈은 Task #18.1 "Data Integration and Preprocessing Pipeline"을 구현합니다.
User Behavior Analysis Module(Task 6)과 Event Effect Analysis Module(Task 7)에서
데이터를 통합하여 비활성 사용자 타겟팅 시스템을 위한 데이터를 준비합니다.
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

# 프로젝트 루트 디렉토리를 sys.path에 추가
project_root = Path(__file__).parent.parent.parent.parent
sys.path.append(str(project_root))

from src.database.mariadb_connection import MariaDBConnection
from src.analysis.user.inactive_event_analyzer import InactiveUserEventAnalyzer

# 로깅 설정
logger = logging.getLogger(__name__)

class InactiveUserTargetingPipeline:
    """
    비활성 사용자 타겟팅을 위한 데이터 통합 및 전처리 파이프라인 클래스
    """
    
    def __init__(self, db_connection=None, data_dir=None):
        """
        InactiveUserTargetingPipeline 초기화
        
        Args:
            db_connection (MariaDBConnection, optional): 데이터베이스 연결 객체
            data_dir (str, optional): 데이터 저장 디렉토리 경로
        """
        self.db = db_connection if db_connection is not None else MariaDBConnection()
        self.data_dir = data_dir if data_dir is not None else str(project_root / "data" / "user_targeting")
        self.inactive_analyzer = InactiveUserEventAnalyzer(db_connection=self.db)
        self.processed_data = {}  # 처리된 데이터 캐싱
        
        # 데이터 디렉토리 생성
        os.makedirs(self.data_dir, exist_ok=True)
        
        logger.info("InactiveUserTargetingPipeline initialized with data directory: %s", self.data_dir)
    
    def fetch_all_data_sources(self, days_inactive=30, days_lookback=90, force_reload=False) -> Dict[str, pd.DataFrame]:
        """
        모든 필요한 데이터 소스 가져오기
        
        Args:
            days_inactive (int): 비활성으로 간주할 최소 일수. 기본값은 30.
            days_lookback (int): 과거 데이터를 분석할 기간(일). 기본값은 90.
            force_reload (bool): 캐싱된 데이터가 있어도 새로 데이터를 가져올지 여부
            
        Returns:
            Dict[str, pd.DataFrame]: 데이터셋 이름과 데이터프레임 매핑
        """
        # 캐시 파일 경로
        cache_file = os.path.join(self.data_dir, f"data_cache_{days_inactive}_{days_lookback}.pkl")
        
        # 캐시 파일이 있고 force_reload가 False이면 캐시된 데이터 로드
        if os.path.exists(cache_file) and not force_reload:
            try:
                with open(cache_file, 'rb') as f:
                    data_sources = pickle.load(f)
                logger.info("Loaded cached data from %s", cache_file)
                return data_sources
            except Exception as e:
                logger.warning("Failed to load cached data: %s", str(e))
        
        logger.info("Fetching all data sources with days_inactive=%d, days_lookback=%d", 
                   days_inactive, days_lookback)
        
        # User Behavior Analysis Module에서 데이터 가져오기
        inactive_users = self.inactive_analyzer.get_inactive_users(days_inactive)
        login_frequency = self.inactive_analyzer.get_login_frequency(days_lookback)
        session_duration = self.inactive_analyzer.get_session_duration(days_lookback)
        
        # 활동 메트릭 분석 실행
        activity_metrics = self.inactive_analyzer.analyze_activity_metrics(days_lookback, days_inactive)
        activity_data = activity_metrics['raw_data'] if 'raw_data' in activity_metrics else pd.DataFrame()
        
        # 사용자 참여도 분석 실행
        engagement_analysis = self.inactive_analyzer.analyze_user_engagement(days_lookback)
        engagement_data = engagement_analysis['raw_data'] if 'raw_data' in engagement_analysis else pd.DataFrame()
        
        # Event Effect Analysis Module에서 데이터 가져오기
        event_participants = self.inactive_analyzer.get_event_participants()
        deposits_after_event = self.inactive_analyzer.get_deposits_after_event()
        
        # 전환 퍼널 분석 실행
        conversion_funnel = self.inactive_analyzer.analyze_conversion_funnel(days_lookback, days_inactive)
        
        # 비활성 기간별 전환율 분석 실행
        inactive_period_analysis = self.inactive_analyzer.analyze_conversion_by_inactive_period()
        inactive_period_data = inactive_period_analysis['raw_data'] if 'raw_data' in inactive_period_analysis else pd.DataFrame()
        
        # 이벤트 금액별 전환율 분석 실행
        event_amount_analysis = self.inactive_analyzer.analyze_conversion_by_event_amount()
        event_amount_data = event_amount_analysis['raw_data'] if 'raw_data' in event_amount_analysis else pd.DataFrame()
        
        # 이벤트 전후 유지율 분석 실행
        event_retention_analysis = self.inactive_analyzer.analyze_event_retention(30, 60)
        event_retention_data = event_retention_analysis['user_data'] if 'user_data' in event_retention_analysis else pd.DataFrame()
        
        # 데이터 소스 취합
        data_sources = {
            'inactive_users': inactive_users,
            'login_frequency': login_frequency,
            'session_duration': session_duration,
            'activity_data': activity_data,
            'engagement_data': engagement_data,
            'event_participants': event_participants,
            'deposits_after_event': deposits_after_event,
            'inactive_period_data': inactive_period_data,
            'event_amount_data': event_amount_data,
            'event_retention_data': event_retention_data
        }
        
        # 각 데이터셋의 크기 로깅
        for name, df in data_sources.items():
            if isinstance(df, pd.DataFrame):
                logger.info("Fetched %s with %d rows and %d columns",
                           name, df.shape[0], df.shape[1])
        
        # 데이터 캐시 저장
        try:
            with open(cache_file, 'wb') as f:
                pickle.dump(data_sources, f)
            logger.info("Cached data to %s", cache_file)
        except Exception as e:
            logger.warning("Failed to cache data: %s", str(e))
        
        return data_sources
    
    def preprocess_data(self, data_sources: Dict[str, pd.DataFrame]) -> pd.DataFrame:
        """
        데이터 전처리 및 통합
        
        Args:
            data_sources (Dict[str, pd.DataFrame]): 원본 데이터 소스
            
        Returns:
            pd.DataFrame: 전처리된 통합 데이터프레임
        """
        logger.info("Starting data preprocessing and integration")
        
        # 비활성 사용자 데이터를 기본으로 시작
        if 'inactive_users' not in data_sources or data_sources['inactive_users'].empty:
            logger.warning("No inactive users data available")
            return pd.DataFrame()
        
        inactive_users = data_sources['inactive_users'].copy()
        
        # 기본 추적 열 추가
        inactive_users['is_targeted'] = False
        inactive_users['targeting_date'] = None
        inactive_users['targeting_score'] = 0.0
        inactive_users['optimal_event_type'] = None
        inactive_users['recommended_reward'] = 0.0
        
        # 각 데이터 소스에서 필요한 특성 통합
        
        # 1. 로그인 빈도 데이터 병합
        if 'login_frequency' in data_sources and not data_sources['login_frequency'].empty:
            login_cols = ['player_id', 'login_count', 'login_frequency_percent', 'days_since_last_login']
            if set(login_cols).issubset(data_sources['login_frequency'].columns):
                # 열 이름 일관성 유지
                login_data = data_sources['login_frequency'][login_cols].copy()
                login_data.rename(columns={'player_id': 'id'}, inplace=True)
                
                # 데이터 병합
                inactive_users = pd.merge(
                    inactive_users,
                    login_data,
                    on='id',
                    how='left'
                )
                # NaN 채우기
                inactive_users['login_count'].fillna(0, inplace=True)
                inactive_users['login_frequency_percent'].fillna(0, inplace=True)
                inactive_users['days_since_last_login'].fillna(
                    (datetime.now().date() - inactive_users['lastPlayDate']).dt.days, 
                    inplace=True
                )
        
        # 2. 세션 기간 데이터 병합
        if 'session_duration' in data_sources and not data_sources['session_duration'].empty:
            session_cols = ['player_id', 'avg_session_minutes', 'total_play_minutes']
            if set(session_cols).issubset(data_sources['session_duration'].columns):
                session_data = data_sources['session_duration'][session_cols].copy()
                session_data.rename(columns={'player_id': 'id'}, inplace=True)
                
                inactive_users = pd.merge(
                    inactive_users,
                    session_data,
                    on='id',
                    how='left'
                )
                inactive_users['avg_session_minutes'].fillna(0, inplace=True)
                inactive_users['total_play_minutes'].fillna(0, inplace=True)
        
        # 3. 이벤트 참여 데이터 병합
        if 'event_participants' in data_sources and not data_sources['event_participants'].empty:
            # player 열이 이벤트 참여자의 ID인지 확인
            if 'player' in data_sources['event_participants'].columns:
                event_data = data_sources['event_participants'].copy()
                event_data.rename(columns={'player': 'id'}, inplace=True)
                
                # 이벤트 참여 여부 특성 추가
                inactive_users = pd.merge(
                    inactive_users,
                    event_data[['id', 'promotion_count', 'total_reward']],
                    on='id',
                    how='left'
                )
                inactive_users['has_participated_event'] = ~inactive_users['promotion_count'].isna()
                inactive_users['promotion_count'].fillna(0, inplace=True)
                inactive_users['total_reward'].fillna(0, inplace=True)
        
        # 4. 이벤트 후 입금 데이터 병합
        if 'deposits_after_event' in data_sources and not data_sources['deposits_after_event'].empty:
            if 'player' in data_sources['deposits_after_event'].columns:
                deposit_data = data_sources['deposits_after_event'].copy()
                deposit_data.rename(columns={'player': 'id'}, inplace=True)
                
                # 입금 특성 추가
                inactive_users = pd.merge(
                    inactive_users,
                    deposit_data[['id', 'deposit_amount_after_event', 'deposit_count_after_event']],
                    on='id',
                    how='left'
                )
                inactive_users['has_deposited_after_event'] = ~inactive_users['deposit_amount_after_event'].isna()
                inactive_users['deposit_amount_after_event'].fillna(0, inplace=True)
                inactive_users['deposit_count_after_event'].fillna(0, inplace=True)
        
        # 5. 추가 특성 계산
        
        # 5.1 비활성 기간 계산
        if 'lastPlayDate' in inactive_users.columns:
            # 날짜 형식 확인 및 변환
            if inactive_users['lastPlayDate'].dtype == 'object':
                try:
                    inactive_users['lastPlayDate'] = pd.to_datetime(inactive_users['lastPlayDate'])
                except Exception as e:
                    logger.warning("Failed to convert lastPlayDate to datetime: %s", str(e))
            
            # 비활성 일수 계산
            if pd.api.types.is_datetime64_any_dtype(inactive_users['lastPlayDate']):
                inactive_users['days_inactive'] = (datetime.now().date() - inactive_users['lastPlayDate'].dt.date).dt.days
            else:
                logger.warning("lastPlayDate is not in datetime format, skipping days_inactive calculation")
        
        # 5.2 과거 입금 행동에 기반한 가치 점수 계산
        if 'deposit_amount_after_event' in inactive_users.columns and 'total_reward' in inactive_users.columns:
            # 이벤트 보상 대비 입금 비율 (ROI)
            inactive_users['deposit_reward_ratio'] = np.where(
                inactive_users['total_reward'] > 0,
                inactive_users['deposit_amount_after_event'] / inactive_users['total_reward'],
                0
            )
        
        # 5.3 사용자 참여도 점수 계산
        if all(col in inactive_users.columns for col in ['login_frequency_percent', 'avg_session_minutes']):
            # 정규화된 참여도 점수
            inactive_users['engagement_score'] = (
                (inactive_users['login_frequency_percent'] / 100) * 0.4 +
                (np.log1p(inactive_users['avg_session_minutes']) / 5) * 0.3 +
                (np.log1p(inactive_users['total_play_minutes']) / 10) * 0.3
            ).clip(0, 1)
        
        # 5.4 전환 가능성 점수 계산
        value_features = []
        if 'deposit_reward_ratio' in inactive_users.columns:
            value_features.append(('deposit_reward_ratio', 0.5))
        if 'deposit_amount_after_event' in inactive_users.columns:
            value_features.append(('deposit_amount_after_event', 0.3))
        if 'deposit_count_after_event' in inactive_users.columns:
            value_features.append(('deposit_count_after_event', 0.2))
        
        if value_features:
            # 각 특성 정규화 및 가중 합계
            for feature, weight in value_features:
                # 0에서 1 사이로 정규화 (log 변환 후)
                col_name = f"{feature}_normalized"
                if feature in inactive_users.columns:
                    feature_max = inactive_users[feature].max()
                    if feature_max > 0:
                        inactive_users[col_name] = np.log1p(inactive_users[feature]) / np.log1p(feature_max)
                    else:
                        inactive_users[col_name] = 0
            
            # 가중 점수 계산
            inactive_users['conversion_potential_score'] = sum(
                inactive_users.get(f"{feature}_normalized", 0) * weight
                for feature, weight in value_features
            )
        else:
            inactive_users['conversion_potential_score'] = 0
        
        # 6. 최종 타겟팅 점수 계산
        feature_weights = [
            ('engagement_score', 0.3),
            ('conversion_potential_score', 0.7)
        ]
        
        inactive_users['targeting_score'] = sum(
            inactive_users.get(feature, 0) * weight
            for feature, weight in feature_weights
            if feature in inactive_users.columns
        )
        
        # 7. 최종 타겟팅 점수 기반 세그먼트 할당
        targeting_score_bins = [0, 0.2, 0.4, 0.6, 0.8, 1.0]
        targeting_score_labels = ["매우 낮음", "낮음", "중간", "높음", "매우 높음"]
        
        inactive_users['targeting_segment'] = pd.cut(
            inactive_users['targeting_score'],
            bins=targeting_score_bins,
            labels=targeting_score_labels,
            include_lowest=True
        )
        
        # 처리 결과 저장
        self.processed_data = inactive_users
        
        logger.info("Data preprocessing completed, final dataset has %d rows and %d columns",
                   inactive_users.shape[0], inactive_users.shape[1])
        
        return inactive_users
    
    def save_processed_data(self, data: Optional[pd.DataFrame] = None, 
                           filename: Optional[str] = None) -> str:
        """
        처리된 데이터 저장
        
        Args:
            data (pd.DataFrame, optional): 저장할 데이터. 기본값은 None (self.processed_data 사용).
            filename (str, optional): 저장할 파일 이름. 기본값은 None (타임스탬프 기반 이름 생성).
            
        Returns:
            str: 저장된 파일 경로
        """
        if data is None:
            data = self.processed_data
        
        if data is None or data.empty:
            logger.warning("No processed data to save")
            return ""
        
        if filename is None:
            timestamp = datetime.now().strftime("%Y%m%d_%H%M%S")
            filename = f"inactive_user_targeting_data_{timestamp}.csv"
        
        file_path = os.path.join(self.data_dir, filename)
        
        try:
            data.to_csv(file_path, index=False)
            logger.info("Saved processed data to %s", file_path)
            return file_path
        except Exception as e:
            logger.error("Failed to save processed data: %s", str(e))
            return ""
    
    def save_metadata(self, data: pd.DataFrame, metadata: Dict[str, Any], 
                     filename: Optional[str] = None) -> str:
        """
        데이터셋 메타데이터 저장
        
        Args:
            data (pd.DataFrame): 메타데이터를 추출할 데이터프레임
            metadata (Dict[str, Any]): 추가 메타데이터
            filename (str, optional): 저장할 파일 이름. 기본값은 None (타임스탬프 기반 이름 생성).
            
        Returns:
            str: 저장된 파일 경로
        """
        if data is None or data.empty:
            logger.warning("No data for metadata extraction")
            return ""
        
        if filename is None:
            timestamp = datetime.now().strftime("%Y%m%d_%H%M%S")
            filename = f"inactive_user_targeting_metadata_{timestamp}.json"
        
        file_path = os.path.join(self.data_dir, filename)
        
        # 기본 메타데이터 수집
        base_metadata = {
            "created_at": datetime.now().isoformat(),
            "row_count": len(data),
            "column_count": len(data.columns),
            "columns": list(data.columns),
            "data_types": {col: str(data[col].dtype) for col in data.columns},
            "missing_values": {col: int(data[col].isna().sum()) for col in data.columns},
            "unique_values": {col: int(data[col].nunique()) for col in data.columns 
                              if data[col].dtype != 'float64' and data[col].dtype != 'float32'},
            "numeric_stats": {
                col: {
                    "min": float(data[col].min()),
                    "max": float(data[col].max()),
                    "mean": float(data[col].mean()),
                    "median": float(data[col].median()),
                    "std": float(data[col].std())
                }
                for col in data.columns if pd.api.types.is_numeric_dtype(data[col])
            }
        }
        
        # 사용자 제공 메타데이터와 병합
        full_metadata = {**base_metadata, **metadata}
        
        try:
            with open(file_path, 'w', encoding='utf-8') as f:
                json.dump(full_metadata, f, ensure_ascii=False, indent=2)
            logger.info("Saved metadata to %s", file_path)
            return file_path
        except Exception as e:
            logger.error("Failed to save metadata: %s", str(e))
            return ""
    
    def run_pipeline(self, days_inactive=30, days_lookback=90, force_reload=False) -> pd.DataFrame:
        """
        전체 파이프라인 실행
        
        Args:
            days_inactive (int): 비활성으로 간주할 최소 일수. 기본값은 30.
            days_lookback (int): 과거 데이터를 분석할 기간(일). 기본값은 90.
            force_reload (bool): 캐싱된 데이터가 있어도 새로 데이터를 가져올지 여부
            
        Returns:
            pd.DataFrame: 처리된 데이터
        """
        logger.info("Starting inactive user targeting pipeline with days_inactive=%d, days_lookback=%d",
                   days_inactive, days_lookback)
        
        # 1. 모든 데이터 소스 가져오기
        data_sources = self.fetch_all_data_sources(days_inactive, days_lookback, force_reload)
        
        # 2. 데이터 전처리 및 통합
        processed_data = self.preprocess_data(data_sources)
        
        # 3. 처리된 데이터 저장
        timestamp = datetime.now().strftime("%Y%m%d_%H%M%S")
        self.save_processed_data(processed_data, f"inactive_user_targeting_data_{timestamp}.csv")
        
        # 4. 메타데이터 저장
        metadata = {
            "pipeline_parameters": {
                "days_inactive": days_inactive,
                "days_lookback": days_lookback,
                "force_reload": force_reload
            },
            "data_sources": {name: (df.shape if isinstance(df, pd.DataFrame) else None) 
                            for name, df in data_sources.items()},
            "processing_timestamp": timestamp
        }
        self.save_metadata(processed_data, metadata, f"inactive_user_targeting_metadata_{timestamp}.json")
        
        logger.info("Inactive user targeting pipeline completed successfully")
        return processed_data

def main():
    """
    메인 함수 - 파이프라인 테스트 실행
    """
    # 로깅 설정
    logging.basicConfig(
        level=logging.INFO,
        format='%(asctime)s - %(name)s - %(levelname)s - %(message)s'
    )
    
    try:
        # 데이터베이스 연결 생성
        db_connection = MariaDBConnection()
        
        # 파이프라인 인스턴스 생성
        pipeline = InactiveUserTargetingPipeline(db_connection=db_connection)
        
        # 파이프라인 실행
        processed_data = pipeline.run_pipeline(days_inactive=30, days_lookback=90)
        
        # 결과 요약 출력
        if not processed_data.empty:
            print(f"처리된 데이터: {processed_data.shape[0]} 행 x {processed_data.shape[1]} 열")
            print("\n상위 5개 행:")
            print(processed_data.head())
            
            print("\n타겟팅 세그먼트 분포:")
            if 'targeting_segment' in processed_data.columns:
                segment_counts = processed_data['targeting_segment'].value_counts()
                for segment, count in segment_counts.items():
                    print(f"  {segment}: {count}명 ({count/len(processed_data)*100:.1f}%)")
        else:
            print("처리된 데이터가 없습니다.")
    
    except Exception as e:
        logging.error(f"파이프라인 실행 중 오류 발생: {str(e)}", exc_info=True)

if __name__ == "__main__":
    main()
