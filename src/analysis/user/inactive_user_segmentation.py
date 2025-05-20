"""
비활성 사용자 세그먼테이션 알고리즘 모듈

이 모듈은 Task #18.2 "Inactive User Segmentation Algorithm"을 구현합니다.
비활성 사용자를 다양한 특성에 기반하여 의미 있는 세그먼트로 분류합니다.
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
from sklearn.preprocessing import StandardScaler, MinMaxScaler
from sklearn.decomposition import PCA
from sklearn.cluster import KMeans, DBSCAN, AgglomerativeClustering
from sklearn.metrics import silhouette_score, calinski_harabasz_score, davies_bouldin_score
from scipy.cluster.hierarchy import dendrogram, linkage
from scipy.stats import mode

# 프로젝트 루트 디렉토리를 sys.path에 추가
project_root = Path(__file__).parent.parent.parent.parent
sys.path.append(str(project_root))

from src.database.mariadb_connection import MariaDBConnection
from src.analysis.user.inactive_user_targeting_pipeline import InactiveUserTargetingPipeline

# 로깅 설정
logger = logging.getLogger(__name__)

class InactiveUserSegmentation:
    """
    비활성 사용자 세그먼테이션 알고리즘 클래스
    """
    
    def __init__(self, data_dir=None):
        """
        InactiveUserSegmentation 초기화
        
        Args:
            data_dir (str, optional): 데이터 저장 디렉토리 경로
        """
        self.data_dir = data_dir if data_dir is not None else str(project_root / "data" / "user_targeting")
        self.output_dir = str(project_root / "data" / "user_segments")
        
        # 출력 디렉토리 생성
        os.makedirs(self.output_dir, exist_ok=True)
        
        # 데이터 및 모델 저장소
        self.processed_data = None
        self.cluster_models = {}
        self.segment_profiles = {}
        self.feature_importances = {}
        
        logger.info("InactiveUserSegmentation initialized with data directory: %s", self.data_dir)
    
    def load_data(self, file_path=None, pipeline=None) -> pd.DataFrame:
        """
        데이터 로드
        
        Args:
            file_path (str, optional): 로드할 데이터 파일 경로
            pipeline (InactiveUserTargetingPipeline, optional): 데이터 파이프라인 인스턴스
            
        Returns:
            pd.DataFrame: 로드된 데이터
        """
        # 파일에서 로드
        if file_path:
            try:
                extension = os.path.splitext(file_path)[1].lower()
                if extension == '.csv':
                    data = pd.read_csv(file_path)
                elif extension == '.pkl':
                    with open(file_path, 'rb') as f:
                        data = pickle.load(f)
                else:
                    logger.error("Unsupported file extension: %s", extension)
                    return pd.DataFrame()
                
                logger.info("Loaded data from %s with %d rows", file_path, len(data))
                self.processed_data = data
                return data
            except Exception as e:
                logger.error("Failed to load data from %s: %s", file_path, str(e))
                return pd.DataFrame()
        
        # 파이프라인에서 로드
        elif pipeline:
            try:
                data = pipeline.processed_data
                if data is None or data.empty:
                    logger.warning("No data in pipeline, running pipeline...")
                    data = pipeline.run_pipeline()
                
                logger.info("Loaded data from pipeline with %d rows", len(data))
                self.processed_data = data
                return data
            except Exception as e:
                logger.error("Failed to load data from pipeline: %s", str(e))
                return pd.DataFrame()
        
        # 최신 파일 자동 로드
        else:
            try:
                # 데이터 디렉토리의 CSV 파일 목록
                csv_files = [f for f in os.listdir(self.data_dir) 
                            if f.startswith('inactive_user_targeting_data_') and f.endswith('.csv')]
                
                if not csv_files:
                    logger.warning("No data files found in %s", self.data_dir)
                    return pd.DataFrame()
                
                # 가장 최신 파일 선택
                latest_file = max(csv_files)
                file_path = os.path.join(self.data_dir, latest_file)
                
                data = pd.read_csv(file_path)
                logger.info("Loaded latest data from %s with %d rows", file_path, len(data))
                self.processed_data = data
                return data
            except Exception as e:
                logger.error("Failed to auto-load data: %s", str(e))
                return pd.DataFrame()
    
    def preprocess_for_clustering(self, data: Optional[pd.DataFrame] = None) -> Tuple[pd.DataFrame, List[str]]:
        """
        클러스터링을 위한 데이터 전처리
        
        Args:
            data (pd.DataFrame, optional): 전처리할 데이터. 기본값은 None (self.processed_data 사용).
            
        Returns:
            Tuple[pd.DataFrame, List[str]]: 전처리된 데이터와 사용된 특성 목록
        """
        if data is None:
            data = self.processed_data
        
        if data is None or data.empty:
            logger.warning("No data for preprocessing")
            return pd.DataFrame(), []
        
        # 클러스터링에 사용할 특성 선택
        numerical_features = [
            'days_inactive',
            'login_frequency_percent',
            'avg_session_minutes',
            'total_play_minutes', 
            'promotion_count',
            'total_reward',
            'deposit_amount_after_event',
            'deposit_count_after_event'
        ]
        
        # 선택한 특성이 데이터에 있는지 확인
        available_features = [f for f in numerical_features if f in data.columns]
        
        if not available_features:
            logger.warning("No clustering features available in data")
            return pd.DataFrame(), []
        
        # 결측치 처리
        clustering_data = data[available_features].copy()
        clustering_data.fillna(0, inplace=True)
        
        # 이상치 처리 (상위/하위 1%를 제한)
        for feature in available_features:
            lower_bound = clustering_data[feature].quantile(0.01)
            upper_bound = clustering_data[feature].quantile(0.99)
            clustering_data[feature] = clustering_data[feature].clip(lower_bound, upper_bound)
        
        # 특성 표준화
        scaler = StandardScaler()
        scaled_data = scaler.fit_transform(clustering_data)
        
        # 결과 저장
        clustering_data_scaled = pd.DataFrame(
            scaled_data, 
            columns=available_features,
            index=clustering_data.index
        )
        
        logger.info("Preprocessed data for clustering with %d features", len(available_features))
        return clustering_data_scaled, available_features
    
    def determine_optimal_clusters(self, data: pd.DataFrame, max_clusters: int = 10) -> Dict[str, Any]:
        """
        최적의 클러스터 수 결정
        
        Args:
            data (pd.DataFrame): 클러스터링할 데이터
            max_clusters (int, optional): 평가할 최대 클러스터 수. 기본값은 10.
            
        Returns:
            Dict[str, Any]: 다양한 평가 지표 결과
        """
        if data.empty:
            logger.warning("No data for cluster evaluation")
            return {}
        
        # 평가 지표
        silhouette_scores = []
        ch_scores = []
        db_scores = []
        inertia_values = []
        
        # 클러스터 수 범위 (2부터 max_clusters까지)
        cluster_range = range(2, min(max_clusters + 1, len(data) // 10 + 1))
        
        for n_clusters in cluster_range:
            # KMeans 클러스터링
            kmeans = KMeans(
                n_clusters=n_clusters, 
                init='k-means++', 
                n_init=10, 
                random_state=42
            )
            cluster_labels = kmeans.fit_predict(data)
            
            # 평가 지표 계산
            if len(np.unique(cluster_labels)) > 1:  # 클러스터가 2개 이상일 때만 계산
                silhouette_scores.append(silhouette_score(data, cluster_labels))
                ch_scores.append(calinski_harabasz_score(data, cluster_labels))
                db_scores.append(davies_bouldin_score(data, cluster_labels))
            else:
                silhouette_scores.append(0)
                ch_scores.append(0)
                db_scores.append(float('inf'))
            
            inertia_values.append(kmeans.inertia_)
        
        # 최적의 클러스터 수 결정
        # Silhouette Score: 높을수록 좋음
        best_silhouette_idx = np.argmax(silhouette_scores)
        best_silhouette_n = cluster_range[best_silhouette_idx]
        
        # Calinski-Harabasz Score: 높을수록 좋음
        best_ch_idx = np.argmax(ch_scores)
        best_ch_n = cluster_range[best_ch_idx]
        
        # Davies-Bouldin Score: 낮을수록 좋음
        best_db_idx = np.argmin(db_scores)
        best_db_n = cluster_range[best_db_idx]
        
        # 종합적인 추천
        recommended_n = mode([best_silhouette_n, best_ch_n, best_db_n]).mode[0]
        
        # 시각화
        fig, axes = plt.subplots(2, 2, figsize=(16, 12))
        
        # Silhouette Score
        axes[0, 0].plot(list(cluster_range), silhouette_scores, 'o-')
        axes[0, 0].set_title('Silhouette Score')
        axes[0, 0].set_xlabel('Number of Clusters')
        axes[0, 0].set_ylabel('Score')
        axes[0, 0].grid(True)
        
        # Calinski-Harabasz Score
        axes[0, 1].plot(list(cluster_range), ch_scores, 'o-')
        axes[0, 1].set_title('Calinski-Harabasz Score')
        axes[0, 1].set_xlabel('Number of Clusters')
        axes[0, 1].set_ylabel('Score')
        axes[0, 1].grid(True)
        
        # Davies-Bouldin Score
        axes[1, 0].plot(list(cluster_range), db_scores, 'o-')
        axes[1, 0].set_title('Davies-Bouldin Score')
        axes[1, 0].set_xlabel('Number of Clusters')
        axes[1, 0].set_ylabel('Score')
        axes[1, 0].grid(True)
        
        # Elbow Method (Inertia)
        axes[1, 1].plot(list(cluster_range), inertia_values, 'o-')
        axes[1, 1].set_title('Elbow Method (KMeans Inertia)')
        axes[1, 1].set_xlabel('Number of Clusters')
        axes[1, 1].set_ylabel('Inertia')
        axes[1, 1].grid(True)
        
        plt.tight_layout()
        
        # 결과 저장
        timestamp = datetime.now().strftime("%Y%m%d_%H%M%S")
        plot_path = os.path.join(self.output_dir, f"cluster_evaluation_{timestamp}.png")
        plt.savefig(plot_path)
        plt.close()
        
        evaluation_results = {
            'cluster_range': list(cluster_range),
            'silhouette_scores': silhouette_scores,
            'calinski_harabasz_scores': ch_scores,
            'davies_bouldin_scores': db_scores,
            'inertia_values': inertia_values,
            'best_silhouette': {
                'n_clusters': best_silhouette_n,
                'score': silhouette_scores[best_silhouette_idx]
            },
            'best_calinski_harabasz': {
                'n_clusters': best_ch_n,
                'score': ch_scores[best_ch_idx]
            },
            'best_davies_bouldin': {
                'n_clusters': best_db_n,
                'score': db_scores[best_db_idx]
            },
            'recommended_n_clusters': recommended_n,
            'plot_path': plot_path
        }
        
        logger.info("Cluster evaluation completed. Recommended clusters: %d", recommended_n)
        return evaluation_results
    
    def perform_clustering(self, data: pd.DataFrame, n_clusters: int = 5) -> Tuple[np.ndarray, Dict[str, Any]]:
        """
        클러스터링 수행
        
        Args:
            data (pd.DataFrame): 클러스터링할 데이터
            n_clusters (int, optional): 클러스터 수. 기본값은 5.
            
        Returns:
            Tuple[np.ndarray, Dict[str, Any]]: 클러스터 레이블과 모델 정보
        """
        if data.empty:
            logger.warning("No data for clustering")
            return np.array([]), {}
        
        # KMeans 클러스터링
        kmeans = KMeans(
            n_clusters=n_clusters, 
            init='k-means++', 
            n_init=10, 
            random_state=42
        )
        cluster_labels = kmeans.fit_predict(data)
        
        # 클러스터 중심 저장
        cluster_centers = pd.DataFrame(
            kmeans.cluster_centers_,
            columns=data.columns
        )
        
        # 클러스터 평가
        if len(np.unique(cluster_labels)) > 1:
            silhouette_avg = silhouette_score(data, cluster_labels)
            ch_score = calinski_harabasz_score(data, cluster_labels)
            db_score = davies_bouldin_score(data, cluster_labels)
        else:
            silhouette_avg = 0
            ch_score = 0
            db_score = float('inf')
        
        # 클러스터 분포
        cluster_counts = pd.Series(cluster_labels).value_counts().sort_index()
        cluster_percentages = cluster_counts / len(cluster_labels) * 100
        
        # 모델 정보
        model_info = {
            'algorithm': 'KMeans',
            'n_clusters': n_clusters,
            'cluster_centers': cluster_centers,
            'evaluation': {
                'silhouette_score': silhouette_avg,
                'calinski_harabasz_score': ch_score,
                'davies_bouldin_score': db_score
            },
            'distribution': {
                'counts': cluster_counts.to_dict(),
                'percentages': cluster_percentages.to_dict()
            }
        }
        
        # 모델 저장
        self.cluster_models['kmeans'] = {
            'model': kmeans,
            'info': model_info
        }
        
        logger.info("KMeans clustering completed with %d clusters", n_clusters)
        return cluster_labels, model_info
    
    def perform_hierarchical_clustering(self, data: pd.DataFrame, n_clusters: int = 5) -> Tuple[np.ndarray, Dict[str, Any]]:
        """
        계층적 클러스터링 수행
        
        Args:
            data (pd.DataFrame): 클러스터링할 데이터
            n_clusters (int, optional): 클러스터 수. 기본값은 5.
            
        Returns:
            Tuple[np.ndarray, Dict[str, Any]]: 클러스터 레이블과 모델 정보
        """
        if data.empty:
            logger.warning("No data for hierarchical clustering")
            return np.array([]), {}
        
        # 계층적 클러스터링
        hc = AgglomerativeClustering(
            n_clusters=n_clusters,
            linkage='ward'
        )
        cluster_labels = hc.fit_predict(data)
        
        # 덴드로그램 생성 (시각화 목적)
        # 데이터가 너무 큰 경우 샘플링
        max_samples = 1000
        if len(data) > max_samples:
            sample_idx = np.random.choice(len(data), max_samples, replace=False)
            sample_data = data.iloc[sample_idx]
            Z = linkage(sample_data, 'ward')
        else:
            Z = linkage(data, 'ward')
        
        plt.figure(figsize=(16, 10))
        dendrogram(Z, truncate_mode='level', p=5)
        plt.title('Hierarchical Clustering Dendrogram')
        plt.xlabel('Data Points')
        plt.ylabel('Distance')
        
        # 결과 저장
        timestamp = datetime.now().strftime("%Y%m%d_%H%M%S")
        plot_path = os.path.join(self.output_dir, f"hierarchical_dendrogram_{timestamp}.png")
        plt.savefig(plot_path)
        plt.close()
        
        # 클러스터 평가
        if len(np.unique(cluster_labels)) > 1:
            silhouette_avg = silhouette_score(data, cluster_labels)
            ch_score = calinski_harabasz_score(data, cluster_labels)
            db_score = davies_bouldin_score(data, cluster_labels)
        else:
            silhouette_avg = 0
            ch_score = 0
            db_score = float('inf')
        
        # 클러스터 분포
        cluster_counts = pd.Series(cluster_labels).value_counts().sort_index()
        cluster_percentages = cluster_counts / len(cluster_labels) * 100
        
        # 모델 정보
        model_info = {
            'algorithm': 'AgglomerativeClustering',
            'n_clusters': n_clusters,
            'linkage': 'ward',
            'evaluation': {
                'silhouette_score': silhouette_avg,
                'calinski_harabasz_score': ch_score,
                'davies_bouldin_score': db_score
            },
            'distribution': {
                'counts': cluster_counts.to_dict(),
                'percentages': cluster_percentages.to_dict()
            },
            'dendrogram_path': plot_path
        }
        
        # 모델 저장
        self.cluster_models['hierarchical'] = {
            'model': hc,
            'info': model_info
        }
        
        logger.info("Hierarchical clustering completed with %d clusters", n_clusters)
        return cluster_labels, model_info
    
    def analyze_clusters(self, data: Optional[pd.DataFrame] = None, 
                        cluster_labels: Optional[np.ndarray] = None,
                        features: Optional[List[str]] = None) -> Dict[str, Any]:
        """
        클러스터 분석 수행
        
        Args:
            data (pd.DataFrame, optional): 원본 데이터
            cluster_labels (np.ndarray, optional): 클러스터 레이블
            features (List[str], optional): 분석할 특성 목록
            
        Returns:
            Dict[str, Any]: 클러스터 프로파일 정보
        """
        if data is None:
            data = self.processed_data
        
        if data is None or data.empty:
            logger.warning("No data for cluster analysis")
            return {}
        
        if cluster_labels is None:
            if 'kmeans' in self.cluster_models and 'model' in self.cluster_models['kmeans']:
                cluster_labels = self.cluster_models['kmeans']['model'].labels_
            else:
                logger.warning("No cluster labels available for analysis")
                return {}
        
        # 클러스터 레이블을 데이터에 추가
        data_with_clusters = data.copy()
        data_with_clusters['cluster'] = cluster_labels
        
        # 분석할 특성 선택
        if features is None:
            # 기본 분석 특성
            numerical_features = [
                'days_inactive',
                'login_frequency_percent',
                'avg_session_minutes',
                'total_play_minutes', 
                'promotion_count',
                'total_reward',
                'deposit_amount_after_event',
                'deposit_count_after_event'
            ]
            available_features = [f for f in numerical_features if f in data.columns]
        else:
            available_features = [f for f in features if f in data.columns]
        
        if not available_features:
            logger.warning("No features available for cluster analysis")
            return {}
        
        # 클러스터별 특성 통계
        cluster_profiles = {}
        
        for cluster_id in sorted(data_with_clusters['cluster'].unique()):
            cluster_data = data_with_clusters[data_with_clusters['cluster'] == cluster_id]
            
            # 기본 통계
            profile = {
                'size': len(cluster_data),
                'percentage': len(cluster_data) / len(data) * 100,
                'features': {}
            }
            
            # 특성별 통계
            for feature in available_features:
                if feature in cluster_data.columns:
                    profile['features'][feature] = {
                        'mean': cluster_data[feature].mean(),
                        'median': cluster_data[feature].median(),
                        'std': cluster_data[feature].std(),
                        'min': cluster_data[feature].min(),
                        'max': cluster_data[feature].max(),
                        'perc_25': cluster_data[feature].quantile(0.25),
                        'perc_75': cluster_data[feature].quantile(0.75)
                    }
            
            cluster_profiles[str(cluster_id)] = profile
        
        # 클러스터 간 특성 비교
        feature_comparison = {}
        for feature in available_features:
            if feature in data_with_clusters.columns:
                feature_means = data_with_clusters.groupby('cluster')[feature].mean()
                feature_comparison[feature] = feature_means.to_dict()
        
        # 결과 저장
        analysis_results = {
            'cluster_profiles': cluster_profiles,
            'feature_comparison': feature_comparison
        }
        
        # 세그먼트 프로파일 저장
        self.segment_profiles = cluster_profiles
        
        logger.info("Cluster analysis completed for %d clusters", len(cluster_profiles))
        return analysis_results
    
    def visualize_clusters(self, data: Optional[pd.DataFrame] = None, 
                          cluster_labels: Optional[np.ndarray] = None,
                          features: Optional[List[str]] = None) -> Dict[str, str]:
        """
        클러스터 시각화 수행
        
        Args:
            data (pd.DataFrame, optional): 클러스터링된 데이터
            cluster_labels (np.ndarray, optional): 클러스터 레이블
            features (List[str], optional): 시각화할 특성 목록
            
        Returns:
            Dict[str, str]: 생성된 시각화 파일 경로
        """
        if data is None:
            data = self.processed_data
        
        if data is None or data.empty:
            logger.warning("No data for cluster visualization")
            return {}
        
        if cluster_labels is None:
            if 'kmeans' in self.cluster_models and 'model' in self.cluster_models['kmeans']:
                cluster_labels = self.cluster_models['kmeans']['model'].labels_
            else:
                logger.warning("No cluster labels available for visualization")
                return {}
        
        # 시각화할 특성 선택
        if features is None:
            # 기본 시각화 특성
            numerical_features = [
                'days_inactive',
                'login_frequency_percent',
                'avg_session_minutes',
                'total_play_minutes', 
                'promotion_count',
                'total_reward',
                'deposit_amount_after_event',
                'deposit_count_after_event'
            ]
            available_features = [f for f in numerical_features if f in data.columns]
        else:
            available_features = [f for f in features if f in data.columns]
        
        if len(available_features) < 2:
            logger.warning("Not enough features for visualization (minimum 2 required)")
            return {}
        
        # 클러스터 레이블을 데이터에 추가
        data_with_clusters = data.copy()
        data_with_clusters['cluster'] = cluster_labels
        
        visualization_paths = {}
        timestamp = datetime.now().strftime("%Y%m%d_%H%M%S")
        
        # 1. 클러스터별 특성 분포 상자 그림
        plt.figure(figsize=(16, 10))
        for i, feature in enumerate(available_features[:min(8, len(available_features))]):
            plt.subplot(2, 4, i+1)
            sns.boxplot(x='cluster', y=feature, data=data_with_clusters)
            plt.title(f'{feature} by Cluster')
            plt.tight_layout()
        
        boxplot_path = os.path.join(self.output_dir, f"cluster_boxplots_{timestamp}.png")
        plt.savefig(boxplot_path)
        plt.close()
        visualization_paths['boxplots'] = boxplot_path
        
        # 2. 주요 특성 쌍에 대한 산점도
        if len(available_features) >= 2:
            # 상위 2개 특성 또는 지정된 특성 사용
            feature_x = available_features[0]
            feature_y = available_features[1]
            
            plt.figure(figsize=(12, 10))
            sns.scatterplot(
                x=feature_x,
                y=feature_y,
                hue='cluster',
                palette='tab10',
                data=data_with_clusters
            )
            plt.title(f'Cluster Scatterplot: {feature_x} vs {feature_y}')
            
            # KMeans 클러스터 중심 표시 (가능한 경우)
            if 'kmeans' in self.cluster_models and 'info' in self.cluster_models['kmeans']:
                centers = self.cluster_models['kmeans']['info']['cluster_centers']
                if isinstance(centers, pd.DataFrame) and feature_x in centers.columns and feature_y in centers.columns:
                    plt.scatter(
                        centers[feature_x],
                        centers[feature_y],
                        s=200,
                        marker='X',
                        c='red',
                        alpha=0.8,
                        label='Cluster Centers'
                    )
                    plt.legend()
            
            scatterplot_path = os.path.join(self.output_dir, f"cluster_scatterplot_{timestamp}.png")
            plt.savefig(scatterplot_path)
            plt.close()
            visualization_paths['scatterplot'] = scatterplot_path
        
        # 3. PCA를 사용한 차원 축소 및 시각화
        if len(available_features) >= 3:
            # 데이터 준비
            X = data_with_clusters[available_features].values
            
            # PCA 수행
            pca = PCA(n_components=2)
            X_pca = pca.fit_transform(X)
            
            # PCA 결과 데이터프레임 생성
            pca_df = pd.DataFrame({
                'PCA1': X_pca[:, 0],
                'PCA2': X_pca[:, 1],
                'cluster': data_with_clusters['cluster']
            })
            
            # PCA 산점도
            plt.figure(figsize=(12, 10))
            sns.scatterplot(
                x='PCA1',
                y='PCA2',
                hue='cluster',
                palette='tab10',
                data=pca_df
            )
            plt.title('PCA Cluster Visualization')
            
            # 설명된 분산 비율 표시
            explained_variance = pca.explained_variance_ratio_
            plt.xlabel(f'PCA1 ({explained_variance[0]:.2%} variance)')
            plt.ylabel(f'PCA2 ({explained_variance[1]:.2%} variance)')
            
            pca_path = os.path.join(self.output_dir, f"cluster_pca_{timestamp}.png")
            plt.savefig(pca_path)
            plt.close()
            visualization_paths['pca'] = pca_path
            
            # 주성분 특성 기여도
            plt.figure(figsize=(12, 8))
            components = pd.DataFrame(
                pca.components_.T,
                columns=['PC1', 'PC2'],
                index=available_features
            )
            sns.heatmap(components, annot=True, cmap='coolwarm', linewidths=0.5)
            plt.title('PCA Component Feature Contributions')
            
            pca_components_path = os.path.join(self.output_dir, f"pca_components_{timestamp}.png")
            plt.savefig(pca_components_path)
            plt.close()
            visualization_paths['pca_components'] = pca_components_path
        
        # 4. 클러스터별 특성 평균 방사형 차트
        if len(available_features) >= 3:
            # 클러스터별 특성 평균
            cluster_means = data_with_clusters.groupby('cluster')[available_features].mean()
            
            # 데이터 정규화 (0-1 스케일)
            scaler = MinMaxScaler()
            cluster_means_scaled = pd.DataFrame(
                scaler.fit_transform(cluster_means),
                columns=available_features,
                index=cluster_means.index
            )
            
            # 방사형 차트
            num_clusters = len(cluster_means)
            num_vars = len(available_features)
            
            # 각도 계산
            angles = np.linspace(0, 2*np.pi, num_vars, endpoint=False).tolist()
            angles += angles[:1]  # 시작점으로 돌아가기 위해
            
            # 데이터 준비
            fig, ax = plt.subplots(figsize=(12, 10), subplot_kw=dict(polar=True))
            
            for i, cluster in enumerate(cluster_means_scaled.index):
                values = cluster_means_scaled.loc[cluster].values.flatten().tolist()
                values += values[:1]  # 시작점으로 돌아가기 위해
                
                ax.plot(angles, values, linewidth=2, linestyle='solid', label=f'Cluster {cluster}')
                ax.fill(angles, values, alpha=0.1)
            
            # 차트 스타일 설정
            ax.set_yticklabels([])
            ax.set_xticks(angles[:-1])
            ax.set_xticklabels(available_features)
            
            plt.title('Cluster Profiles Radar Chart', size=15, pad=20)
            plt.legend(loc='upper right', bbox_to_anchor=(0.1, 0.1))
            
            radar_path = os.path.join(self.output_dir, f"cluster_radar_{timestamp}.png")
            plt.savefig(radar_path)
            plt.close()
            visualization_paths['radar'] = radar_path
        
        logger.info("Generated %d cluster visualizations", len(visualization_paths))
        return visualization_paths
    
    def create_segment_definitions(self, profiles: Optional[Dict[str, Any]] = None) -> Dict[str, Dict[str, Any]]:
        """
        세그먼트 정의 생성
        
        Args:
            profiles (Dict[str, Any], optional): 세그먼트 프로파일 정보
            
        Returns:
            Dict[str, Dict[str, Any]]: 세그먼트 정의
        """
        if profiles is None:
            profiles = self.segment_profiles
        
        if not profiles:
            logger.warning("No segment profiles available for definition")
            return {}
        
        # 세그먼트 정의
        segment_definitions = {}
        
        for cluster_id, profile in profiles.items():
            # 주요 특성 추출
            if 'features' not in profile:
                continue
            
            features = profile['features']
            
            # 세그먼트 특성 분석
            segment_characteristics = []
            
            # 비활성 기간
            if 'days_inactive' in features:
                days_inactive = features['days_inactive']['mean']
                if days_inactive < 30:
                    segment_characteristics.append("단기 비활성 사용자")
                elif days_inactive < 90:
                    segment_characteristics.append("중기 비활성 사용자")
                else:
                    segment_characteristics.append("장기 비활성 사용자")
            
            # 로그인 빈도
            if 'login_frequency_percent' in features:
                login_freq = features['login_frequency_percent']['mean']
                if login_freq > 30:
                    segment_characteristics.append("높은 로그인 빈도")
                elif login_freq > 10:
                    segment_characteristics.append("중간 로그인 빈도")
                else:
                    segment_characteristics.append("낮은 로그인 빈도")
            
            # 이벤트 참여
            if 'promotion_count' in features:
                promotion_count = features['promotion_count']['mean']
                if promotion_count > 3:
                    segment_characteristics.append("적극적인 이벤트 참여자")
                elif promotion_count > 0:
                    segment_characteristics.append("이벤트 참여 경험 있음")
                else:
                    segment_characteristics.append("이벤트 참여 경험 없음")
            
            # 입금 행동
            if 'deposit_amount_after_event' in features and 'total_reward' in features:
                deposit_amount = features['deposit_amount_after_event']['mean']
                total_reward = features['total_reward']['mean']
                
                if deposit_amount > 0:
                    if total_reward > 0 and deposit_amount / total_reward > 2:
                        segment_characteristics.append("높은 이벤트 ROI")
                    elif total_reward > 0 and deposit_amount / total_reward > 1:
                        segment_characteristics.append("긍정적인 이벤트 ROI")
                    elif total_reward > 0:
                        segment_characteristics.append("낮은 이벤트 ROI")
                    else:
                        segment_characteristics.append("이벤트 없이 입금")
                else:
                    segment_characteristics.append("입금 경험 없음")
            
            # 세션 지속 시간
            if 'avg_session_minutes' in features:
                session_minutes = features['avg_session_minutes']['mean']
                if session_minutes > 60:
                    segment_characteristics.append("장시간 게임 선호")
                elif session_minutes > 30:
                    segment_characteristics.append("중간 길이 세션 선호")
                else:
                    segment_characteristics.append("짧은 세션 선호")
            
            # 세그먼트 이름 및 설명 생성
            primary_characteristic = segment_characteristics[0] if segment_characteristics else "미분류 세그먼트"
            
            segment_name = f"세그먼트 {cluster_id}: {primary_characteristic}"
            segment_description = ", ".join(segment_characteristics)
            
            # 세그먼트 전략 추천
            targeting_strategies = []
            
            # 비활성 기간에 따른 전략
            if 'days_inactive' in features:
                days_inactive = features['days_inactive']['mean']
                if days_inactive < 30:
                    targeting_strategies.append("개인화된 단기 혜택으로 빠른 재참여 유도")
                elif days_inactive < 90:
                    targeting_strategies.append("중간 규모 이벤트와 콘텐츠 업데이트 알림")
                else:
                    targeting_strategies.append("대규모 복귀 이벤트 및 게임 개선사항 강조")
            
            # 과거 이벤트 참여에 따른 전략
            if 'promotion_count' in features and 'total_reward' in features:
                promotion_count = features['promotion_count']['mean']
                reward = features['total_reward']['mean']
                
                if promotion_count > 3:
                    targeting_strategies.append(f"이벤트 선호 패턴을 활용한 맞춤형 이벤트 (평균 보상: {reward:.1f})")
                elif promotion_count > 0:
                    targeting_strategies.append(f"과거 참여 이벤트 유형 기반 타겟팅 (평균 보상: {reward:.1f})")
                else:
                    targeting_strategies.append("첫 이벤트 참여를 위한 간단한 이벤트 소개")
            
            # 입금 행동에 따른 전략
            if 'deposit_amount_after_event' in features:
                deposit_amount = features['deposit_amount_after_event']['mean']
                if deposit_amount > 0:
                    targeting_strategies.append(f"입금 경험 있음, 평균 입금액: {deposit_amount:.1f}")
                    if 'deposit_count_after_event' in features:
                        deposit_count = features['deposit_count_after_event']['mean']
                        if deposit_count > 1:
                            targeting_strategies.append(f"반복 입금 경험 있음 (평균 {deposit_count:.1f}회)")
            
            # 세그먼트 정의 저장
            segment_definitions[cluster_id] = {
                'name': segment_name,
                'description': segment_description,
                'characteristics': segment_characteristics,
                'targeting_strategies': targeting_strategies,
                'size': profile['size'],
                'percentage': profile['percentage']
            }
        
        logger.info("Created definitions for %d segments", len(segment_definitions))
        return segment_definitions
    
    def save_segment_results(self, data: pd.DataFrame, cluster_labels: np.ndarray, 
                            segment_definitions: Dict[str, Dict[str, Any]]) -> str:
        """
        세그먼트 결과 저장
        
        Args:
            data (pd.DataFrame): 원본 데이터
            cluster_labels (np.ndarray): 클러스터 레이블
            segment_definitions (Dict[str, Dict[str, Any]]): 세그먼트 정의
            
        Returns:
            str: 저장된 파일 경로
        """
        if data is None or data.empty:
            logger.warning("No data for saving segment results")
            return ""
        
        # 세그먼트 레이블 추가
        segmented_data = data.copy()
        segmented_data['segment_id'] = cluster_labels
        
        # 세그먼트 이름 추가
        segment_names = {}
        for seg_id, definition in segment_definitions.items():
            segment_names[int(seg_id)] = definition['name']
        
        segmented_data['segment_name'] = segmented_data['segment_id'].map(lambda x: segment_names.get(x, f"세그먼트 {x}"))
        
        # 결과 저장
        timestamp = datetime.now().strftime("%Y%m%d_%H%M%S")
        output_file = os.path.join(self.output_dir, f"user_segments_{timestamp}.csv")
        
        try:
            segmented_data.to_csv(output_file, index=False)
            logger.info("Saved segmented data to %s", output_file)
            
            # 세그먼트 정의 저장
            definition_file = os.path.join(self.output_dir, f"segment_definitions_{timestamp}.json")
            with open(definition_file, 'w', encoding='utf-8') as f:
                json.dump(segment_definitions, f, ensure_ascii=False, indent=2)
            logger.info("Saved segment definitions to %s", definition_file)
            
            return output_file
        except Exception as e:
            logger.error("Failed to save segment results: %s", str(e))
            return ""
    
    def run_segmentation(self, data: Optional[pd.DataFrame] = None, n_clusters: Optional[int] = None) -> Dict[str, Any]:
        """
        전체 세그먼테이션 과정 실행
        
        Args:
            data (pd.DataFrame, optional): 세그먼테이션할 데이터
            n_clusters (int, optional): 클러스터 수
            
        Returns:
            Dict[str, Any]: 세그먼테이션 결과
        """
        logger.info("Starting user segmentation process")
        
        # 1. 데이터 로드
        if data is None:
            data = self.load_data()
        
        if data is None or data.empty:
            logger.error("No data available for segmentation")
            return {}
        
        # 2. 클러스터링을 위한 데이터 전처리
        preprocessed_data, selected_features = self.preprocess_for_clustering(data)
        
        if preprocessed_data.empty:
            logger.error("Failed to preprocess data for clustering")
            return {}
        
        # 3. 최적 클러스터 수 결정 (지정되지 않은 경우)
        if n_clusters is None:
            evaluation = self.determine_optimal_clusters(preprocessed_data)
            n_clusters = evaluation.get('recommended_n_clusters', 5)
        
        # 4. KMeans 클러스터링 수행
        cluster_labels, model_info = self.perform_clustering(preprocessed_data, n_clusters)
        
        # 5. 클러스터 분석
        cluster_analysis = self.analyze_clusters(data, cluster_labels, selected_features)
        
        # 6. 세그먼트 정의 생성
        segment_definitions = self.create_segment_definitions(cluster_analysis.get('cluster_profiles', {}))
        
        # 7. 클러스터 시각화
        visualizations = self.visualize_clusters(preprocessed_data, cluster_labels, selected_features)
        
        # 8. 결과 저장
        output_file = self.save_segment_results(data, cluster_labels, segment_definitions)
        
        # 9. 결과 종합
        results = {
            'n_clusters': n_clusters,
            'data_shape': data.shape,
            'selected_features': selected_features,
            'cluster_model': model_info,
            'segment_definitions': segment_definitions,
            'visualizations': visualizations,
            'output_file': output_file
        }
        
        logger.info("User segmentation completed successfully with %d segments", n_clusters)
        return results

def main():
    """
    메인 함수 - 세그먼테이션 알고리즘 테스트 실행
    """
    # 로깅 설정
    logging.basicConfig(
        level=logging.INFO,
        format='%(asctime)s - %(name)s - %(levelname)s - %(message)s'
    )
    
    try:
        # 데이터베이스 연결 생성
        db_connection = MariaDBConnection()
        
        # 데이터 파이프라인 인스턴스 생성
        pipeline = InactiveUserTargetingPipeline(db_connection=db_connection)
        
        # 데이터 준비 (파이프라인에서 데이터 가져오기)
        pipeline_data = pipeline.run_pipeline(days_inactive=30, days_lookback=90)
        
        # 세그먼테이션 인스턴스 생성
        segmentation = InactiveUserSegmentation()
        
        # 세그먼테이션 실행
        results = segmentation.run_segmentation(pipeline_data)
        
        # 결과 요약 출력
        if results:
            print(f"세그먼테이션 완료: {results['n_clusters']} 세그먼트 생성됨")
            print(f"데이터 형태: {results['data_shape']}")
            print(f"분석에 사용된 특성: {', '.join(results['selected_features'])}")
            
            print("\n세그먼트 정의:")
            for seg_id, definition in results['segment_definitions'].items():
                print(f"  {definition['name']} ({definition['percentage']:.1f}%)")
                print(f"    특성: {definition['description']}")
                print(f"    전략: {', '.join(definition['targeting_strategies'])}")
            
            print(f"\n결과 저장 위치: {results['output_file']}")
            print(f"시각화 파일:")
            for vis_type, vis_path in results['visualizations'].items():
                print(f"  {vis_type}: {vis_path}")
        else:
            print("세그먼테이션을 완료할 수 없습니다.")
    
    except Exception as e:
        logging.error(f"세그먼테이션 실행 중 오류 발생: {str(e)}", exc_info=True)

if __name__ == "__main__":
    main()
