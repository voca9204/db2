"""
비활성 사용자 이벤트 효과 분석 모듈

이 모듈은 오랫동안 게임을 하지 않은 사용자가 이벤트를 통해
게임에 참여하고 입금까지 이어지는 패턴을 분석합니다.
"""

import os
import sys
import pandas as pd
import numpy as np
import matplotlib.pyplot as plt
from pathlib import Path
from datetime import datetime, timedelta

# 프로젝트 루트 디렉토리를 sys.path에 추가
project_root = Path(__file__).parent.parent.parent.parent
sys.path.append(str(project_root))

from src.database.mock_connection import MariaDBConnection

class InactiveUserEventAnalyzer:
    """
    비활성 사용자의 이벤트 참여 및 입금 전환 분석 클래스
    """
    
    def __init__(self, db_connection=None):
        """
        InactiveUserEventAnalyzer 초기화
        
        Args:
            db_connection (MariaDBConnection, optional): 데이터베이스 연결 객체. 기본값은 None.
                None인 경우 새로운 연결을 생성합니다.
        """
        self.db = db_connection if db_connection is not None else MariaDBConnection()
        self.query_dir = project_root / "queries"
        self.cached_data = {}
        
    def get_inactive_users(self, days_inactive=10):
        """
        지정된 일수 이상 게임을 하지 않은 사용자 목록 조회
        
        Args:
            days_inactive (int): 비활성으로 간주할 최소 일수. 기본값은 10.
            
        Returns:
            pd.DataFrame: 비활성 사용자 데이터프레임
        """
        query = f"""
        SELECT 
            id,
            userId,
            name,
            lastPlayDate,
            DATEDIFF(CURRENT_DATE(), lastPlayDate) AS days_inactive
        FROM players
        WHERE lastPlayDate IS NOT NULL 
        AND lastPlayDate < DATE_SUB(CURRENT_DATE(), INTERVAL {days_inactive} DAY)
        ORDER BY lastPlayDate DESC
        """
        
        result = self.db.query(query)
        return pd.DataFrame(result)
    
    def get_event_participants(self):
        """
        이벤트에 참여한 사용자 목록 조회
        
        Returns:
            pd.DataFrame: 이벤트 참여자 데이터프레임
        """
        query = """
        SELECT 
            p.player, 
            pl.userId, 
            pl.name,
            MIN(p.appliedAt) AS first_promotion_date,
            COUNT(p.promotion) AS promotion_count,
            SUM(p.reward) AS total_reward
        FROM promotion_players p
        JOIN players pl ON p.player = pl.id
        WHERE p.appliedAt IS NOT NULL
        GROUP BY p.player, pl.userId, pl.name
        """
        
        result = self.db.query(query)
        return pd.DataFrame(result)
    
    def get_deposits_after_event(self):
        """
        이벤트 이후 입금 기록이 있는 사용자 조회
        
        Returns:
            pd.DataFrame: 이벤트 이후 입금 사용자 데이터프레임
        """
        # 캐싱된 데이터가 있으면 반환
        if 'deposits_after_event' in self.cached_data:
            return self.cached_data['deposits_after_event']
            
        query = """
        WITH FirstPromotion AS (
            SELECT 
                player,
                MIN(appliedAt) as first_promotion_date
            FROM 
                promotion_players
            WHERE 
                appliedAt IS NOT NULL
            GROUP BY 
                player
        )
        SELECT
            mf.player,
            pl.userId,
            pl.name,
            fp.first_promotion_date,
            SUM(mf.amount) AS deposit_amount_after_event,
            COUNT(*) AS deposit_count_after_event
        FROM 
            money_flows mf
        JOIN 
            FirstPromotion fp ON mf.player = fp.player
        JOIN
            players pl ON mf.player = pl.id
        WHERE 
            mf.type = 0 -- 입금
            AND mf.createdAt > fp.first_promotion_date
        GROUP BY 
            mf.player, pl.userId, pl.name, fp.first_promotion_date
        """
        
        result = self.db.query(query)
        df = pd.DataFrame(result)
        
        # 결과 캐싱
        self.cached_data['deposits_after_event'] = df
        
        return df
        
    def get_login_frequency(self, days_lookback=90):
        """
        사용자별 로그인 빈도 분석
        
        Args:
            days_lookback (int): 분석할 과거 기간(일). 기본값은 90.
            
        Returns:
            pd.DataFrame: 사용자별 로그인 빈도 데이터프레임
        """
        query = f"""
        SELECT
            p.id AS player_id,
            p.userId,
            p.name,
            COUNT(l.id) AS login_count,
            COUNT(l.id) / {days_lookback} * 100 AS login_frequency_percent,
            MIN(l.loginTime) AS first_login,
            MAX(l.loginTime) AS last_login,
            DATEDIFF(CURRENT_DATE(), MAX(l.loginTime)) AS days_since_last_login
        FROM
            players p
        LEFT JOIN
            login_history l ON p.id = l.player
            AND l.loginTime >= DATE_SUB(CURRENT_DATE(), INTERVAL {days_lookback} DAY)
        GROUP BY
            p.id, p.userId, p.name
        ORDER BY
            login_count DESC
        """
        
        result = self.db.query(query)
        return pd.DataFrame(result)
        
    def get_session_duration(self, days_lookback=90):
        """
        사용자별 세션 기간 분석
        
        Args:
            days_lookback (int): 분석할 과거 기간(일). 기본값은 90.
            
        Returns:
            pd.DataFrame: 사용자별 세션 기간 데이터프레임
        """
        query = f"""
        WITH UserSessions AS (
            SELECT
                player,
                loginTime AS session_start,
                CASE
                    WHEN logoutTime IS NULL THEN COALESCE(
                        LEAD(loginTime, 1) OVER (PARTITION BY player ORDER BY loginTime),
                        ADDTIME(loginTime, '1:00:00')  -- Default 1 hour if no logout
                    )
                    ELSE logoutTime
                END AS session_end
            FROM
                login_history
            WHERE
                loginTime >= DATE_SUB(CURRENT_DATE(), INTERVAL {days_lookback} DAY)
        )
        SELECT
            p.id AS player_id,
            p.userId,
            p.name,
            COUNT(us.player) AS total_sessions,
            AVG(TIMESTAMPDIFF(MINUTE, us.session_start, us.session_end)) AS avg_session_minutes,
            MAX(TIMESTAMPDIFF(MINUTE, us.session_start, us.session_end)) AS max_session_minutes,
            SUM(TIMESTAMPDIFF(MINUTE, us.session_start, us.session_end)) AS total_play_minutes,
            SUM(TIMESTAMPDIFF(MINUTE, us.session_start, us.session_end)) / {days_lookback} AS avg_daily_play_minutes
        FROM
            players p
        LEFT JOIN
            UserSessions us ON p.id = us.player
        GROUP BY
            p.id, p.userId, p.name
        ORDER BY
            avg_daily_play_minutes DESC
        """
        
        result = self.db.query(query)
        return pd.DataFrame(result)
    
    def analyze_activity_metrics(self, days_lookback=90, inactive_threshold=10):
        """
        통합 사용자 활동 메트릭 분석
        
        Args:
            days_lookback (int): 분석할 과거 기간(일). 기본값은 90.
            inactive_threshold (int): 비활성으로 간주할 최소 일수. 기본값은 10.
            
        Returns:
            dict: 분석 결과가 포함된 딕셔너리
        """
        # 로그인 빈도 데이터 가져오기
        login_frequency = self.get_login_frequency(days_lookback)
        
        # 세션 기간 데이터 가져오기
        session_duration = self.get_session_duration(days_lookback)
        
        # 비활성 사용자 데이터 가져오기
        inactive_users = self.get_inactive_users(inactive_threshold)
        
        # 데이터 통합
        # 로그인 빈도와 세션 기간 병합
        merged_data = pd.merge(
            login_frequency,
            session_duration,
            on=['player_id', 'userId', 'name'],
            how='outer'
        )
        
        # 비활성 사용자 상태 추가
        merged_data['is_inactive'] = merged_data['player_id'].isin(inactive_users['id']).astype(int)
        
        # 비활성 사용자에 대한 추가 정보 병합
        if not inactive_users.empty and not merged_data.empty:
            merged_data = pd.merge(
                merged_data,
                inactive_users[['id', 'lastPlayDate', 'days_inactive']],
                left_on='player_id',
                right_on='id',
                how='left'
            )
        
        # 활동 등급 계산
        conditions = [
            (merged_data['login_frequency_percent'] >= 50),                       # 매우 활발
            (merged_data['login_frequency_percent'] >= 25) & (merged_data['login_frequency_percent'] < 50),  # 활발
            (merged_data['login_frequency_percent'] >= 10) & (merged_data['login_frequency_percent'] < 25),  # 보통
            (merged_data['login_frequency_percent'] > 0) & (merged_data['login_frequency_percent'] < 10),    # 낮음
            (merged_data['login_frequency_percent'] == 0)                         # 비활성
        ]
        
        values = ['매우 활발', '활발', '보통', '낮음', '비활성']
        merged_data['activity_level'] = np.select(conditions, values, default='비활성')
        
        # 분석 결과 통계
        result_stats = {
            'activity_summary': merged_data['activity_level'].value_counts().to_dict(),
            'avg_login_frequency': merged_data['login_frequency_percent'].mean(),
            'avg_session_minutes': merged_data['avg_session_minutes'].mean(),
            'avg_daily_play_minutes': merged_data['avg_daily_play_minutes'].mean(),
            'inactive_user_count': merged_data['is_inactive'].sum(),
            'inactive_user_percent': merged_data['is_inactive'].mean() * 100
        }
        
        # 사용자 세그먼트 분석
        activity_segments = merged_data.groupby('activity_level').agg({
            'player_id': 'count',
            'login_count': 'mean',
            'avg_session_minutes': 'mean',
            'total_play_minutes': 'mean',
            'avg_daily_play_minutes': 'mean'
        }).reset_index()
        
        return {
            'stats': result_stats,
            'activity_segments': activity_segments,
            'raw_data': merged_data
        }
        
    def get_inactive_event_deposit_users(self, days_inactive=10):
        """
        비활성 상태에서 이벤트 후 입금한 사용자 조회
        
        Args:
            days_inactive (int): 비활성으로 간주할 최소 일수. 기본값은 10.
            
        Returns:
            pd.DataFrame: 분석 결과 데이터프레임
        """
        query_file = self.query_dir / "user" / "inactive_event_deposit.sql"
        
        if query_file.exists():
            with open(query_file, 'r', encoding='utf-8') as file:
                sql_content = file.read()
                
            # 쿼리 내용에서 최종 쿼리 부분만 추출
            sql_parts = sql_content.split('-- 4. 최종 쿼리: 모든 조건을 만족하는 사용자 찾기')
            if len(sql_parts) > 1:
                query = sql_parts[1].strip()
                
                # days_inactive 값 업데이트
                query = query.replace(
                    "lastPlayDate < DATE_SUB(CURRENT_DATE(), INTERVAL 10 DAY)",
                    f"lastPlayDate < DATE_SUB(CURRENT_DATE(), INTERVAL {days_inactive} DAY)"
                )
                
                result = self.db.query(query)
                return pd.DataFrame(result)
        
        # 쿼리 파일이 없거나 파싱 실패 시 대체 쿼리 실행
        query = f"""
        WITH FirstPromotion AS (
            SELECT 
                player,
                MIN(appliedAt) as first_promotion_date
            FROM 
                promotion_players
            WHERE 
                appliedAt IS NOT NULL
            GROUP BY 
                player
        ),
        InactiveUsers AS (
            SELECT 
                id,
                userId,
                name,
                lastPlayDate
            FROM 
                players
            WHERE 
                lastPlayDate IS NOT NULL 
                AND lastPlayDate < DATE_SUB(CURRENT_DATE(), INTERVAL {days_inactive} DAY)
        ),
        EventUsers AS (
            SELECT 
                p.player, 
                COUNT(p.promotion) AS promotion_count,
                SUM(p.reward) AS total_reward,
                GROUP_CONCAT(p.reward ORDER BY p.appliedAt SEPARATOR ',') AS reward_list
            FROM 
                promotion_players p
            WHERE 
                p.appliedAt IS NOT NULL
            GROUP BY 
                p.player
        ),
        DepositsAfterEvent AS (
            SELECT
                mf.player,
                SUM(mf.amount) AS deposit_amount_after_event,
                COUNT(*) AS deposit_count_after_event
            FROM 
                money_flows mf
            JOIN 
                FirstPromotion fp ON mf.player = fp.player
            WHERE 
                mf.type = 0 -- 입금
                AND mf.createdAt > fp.first_promotion_date
            GROUP BY 
                mf.player
        )
        SELECT
            iu.userId AS user_id,
            p.name AS user_name,
            eu.promotion_count AS event_count,
            eu.total_reward AS total_event_reward,
            eu.reward_list AS event_reward_list,
            dae.deposit_amount_after_event,
            dae.deposit_count_after_event,
            fp.first_promotion_date,
            iu.lastPlayDate AS last_play_date,
            DATEDIFF(CURRENT_DATE(), iu.lastPlayDate) AS days_inactive
        FROM 
            InactiveUsers iu
        JOIN 
            players p ON iu.id = p.id
        JOIN 
            EventUsers eu ON iu.id = eu.player
        JOIN 
            FirstPromotion fp ON iu.id = fp.player
        JOIN 
            DepositsAfterEvent dae ON iu.id = dae.player
        ORDER BY 
            iu.lastPlayDate DESC
        """
        
        result = self.db.query(query)
        return pd.DataFrame(result)
    
    def analyze_conversion_by_inactive_period(self, max_days=365):
        """
        비활성 기간별 전환율 분석
        
        Args:
            max_days (int): 분석할 최대 비활성 일수. 기본값은 365.
            
        Returns:
            dict: 분석 결과가 포함된 딕셔너리
        """
        # 1. 모든 비활성 사용자 가져오기
        all_inactive_users = self.get_inactive_users(days_inactive=0)
        
        # 2. 이벤트 참여자 가져오기
        event_participants = self.get_event_participants()
        
        # 3. 이벤트 후 입금자 가져오기
        deposit_after_event = self.get_deposits_after_event()
        
        # 4. 데이터 통합 및 분석
        merged_data = pd.merge(
            all_inactive_users, 
            event_participants, 
            left_on='id', 
            right_on='player', 
            how='inner'
        )
        
        merged_data = pd.merge(
            merged_data,
            deposit_after_event,
            left_on='id',
            right_on='player',
            how='left'
        )
        
        # NaN 값을 0으로 대체 (입금하지 않은 사용자)
        merged_data['deposit_amount_after_event'] = merged_data['deposit_amount_after_event'].fillna(0)
        merged_data['deposit_count_after_event'] = merged_data['deposit_count_after_event'].fillna(0)
        
        # 5. 비활성 기간별 분석
        period_bins = list(range(0, max_days + 30, 30))
        period_labels = [f"{i}-{j-1}" for i, j in zip(period_bins[:-1], period_bins[1:])]
        
        merged_data['inactive_period'] = pd.cut(
            merged_data['days_inactive'], 
            bins=period_bins, 
            labels=period_labels, 
            right=False
        )
        
        # 비활성 기간별 통계
        period_stats = merged_data.groupby('inactive_period').agg({
            'id': 'count',
            'deposit_amount_after_event': ['sum', 'mean'],
            'total_reward': ['sum', 'mean'],
            'promotion_count': ['sum', 'mean']
        }).reset_index()
        
        # 비활성 기간별 전환율
        period_stats['conversion_users'] = merged_data[merged_data['deposit_amount_after_event'] > 0].groupby('inactive_period').size().reindex(period_stats['inactive_period']).fillna(0).astype(int)
        period_stats['conversion_rate'] = period_stats['conversion_users'] / period_stats[('id', 'count')] * 100
        
        # 투자수익률 (ROI)
        period_stats['roi'] = (period_stats[('deposit_amount_after_event', 'sum')] / period_stats[('total_reward', 'sum')] - 1) * 100
        
        return {
            'stats': period_stats,
            'raw_data': merged_data
        }
    
    def get_feature_usage(self, days_lookback=90):
        """
        사용자별 기능 사용 분석
        
        Args:
            days_lookback (int): 분석할 과거 기간(일). 기본값은 90.
            
        Returns:
            pd.DataFrame: 사용자별 기능 사용 데이터프레임
        """
        query = f"""
        SELECT
            p.id AS player_id,
            p.userId,
            p.name,
            f.feature_type,
            COUNT(f.id) AS usage_count,
            MIN(f.accessTime) AS first_usage,
            MAX(f.accessTime) AS last_usage
        FROM
            players p
        JOIN
            feature_access f ON p.id = f.player
        WHERE
            f.accessTime >= DATE_SUB(CURRENT_DATE(), INTERVAL {days_lookback} DAY)
        GROUP BY
            p.id, p.userId, p.name, f.feature_type
        ORDER BY
            p.id, usage_count DESC
        """
        
        try:
            result = self.db.query(query)
            return pd.DataFrame(result)
        except Exception as e:
            # feature_access 테이블이 없을 경우를 대비한 대체 구현
            print(f"기능 사용 분석 쿼리 실행 실패: {str(e)}")
            
            # 게임 기능을 추정할 수 있는 대체 쿼리
            alt_query = f"""
            SELECT
                p.id AS player_id,
                p.userId,
                p.name,
                CASE
                    WHEN g.type = 1 THEN '슬롯게임'
                    WHEN g.type = 2 THEN '테이블게임'
                    WHEN g.type = 3 THEN '라이브카지노'
                    WHEN g.type = 4 THEN '미니게임'
                    ELSE CONCAT('기타게임_', g.type)
                END AS feature_type,
                COUNT(gp.id) AS usage_count,
                MIN(gp.playTime) AS first_usage,
                MAX(gp.playTime) AS last_usage
            FROM
                players p
            JOIN
                game_plays gp ON p.id = gp.player
            JOIN
                games g ON gp.game = g.id
            WHERE
                gp.playTime >= DATE_SUB(CURRENT_DATE(), INTERVAL {days_lookback} DAY)
            GROUP BY
                p.id, p.userId, p.name, g.type
            ORDER BY
                p.id, usage_count DESC
            """
            
            try:
                alt_result = self.db.query(alt_query)
                return pd.DataFrame(alt_result)
            except Exception as alt_e:
                print(f"대체 기능 사용 분석 쿼리 실행 실패: {str(alt_e)}")
                # 빈 데이터프레임 반환
                return pd.DataFrame(columns=['player_id', 'userId', 'name', 'feature_type', 'usage_count', 'first_usage', 'last_usage'])
    
    def get_content_interaction(self, days_lookback=90):
        """
        사용자별 콘텐츠 상호작용 분석
        
        Args:
            days_lookback (int): 분석할 과거 기간(일). 기본값은 90.
            
        Returns:
            pd.DataFrame: 사용자별 콘텐츠 상호작용 데이터프레임
        """
        # 게임 플레이 데이터
        game_query = f"""
        SELECT
            p.id AS player_id,
            p.userId,
            p.name,
            g.name AS content_name,
            g.category AS content_category,
            COUNT(gp.id) AS interaction_count,
            SUM(gp.duration) AS total_duration,
            AVG(gp.duration) AS avg_duration,
            SUM(gp.bet) AS total_bet,
            SUM(gp.win) AS total_win,
            SUM(gp.win - gp.bet) AS net_profit
        FROM
            players p
        JOIN
            game_plays gp ON p.id = gp.player
        JOIN
            games g ON gp.game = g.id
        WHERE
            gp.playTime >= DATE_SUB(CURRENT_DATE(), INTERVAL {days_lookback} DAY)
        GROUP BY
            p.id, p.userId, p.name, g.name, g.category
        ORDER BY
            p.id, interaction_count DESC
        """
        
        try:
            game_result = self.db.query(game_query)
            game_df = pd.DataFrame(game_result)
            game_df['content_type'] = 'game'
            
            return game_df
        except Exception as e:
            print(f"콘텐츠 상호작용 분석 쿼리 실행 실패: {str(e)}")
            
            # 테이블 구조가 다를 경우를 대비한 대체 쿼리
            alt_query = f"""
            SELECT
                p.id AS player_id,
                p.userId,
                p.name,
                CONCAT('게임_', g.id) AS content_name,
                CONCAT('카테고리_', g.type) AS content_category,
                COUNT(gp.id) AS interaction_count,
                0 AS total_duration,
                0 AS avg_duration,
                SUM(gp.amount) AS total_bet,
                0 AS total_win,
                0 AS net_profit
            FROM
                players p
            JOIN
                game_plays gp ON p.id = gp.player
            JOIN
                games g ON gp.game = g.id
            WHERE
                gp.playTime >= DATE_SUB(CURRENT_DATE(), INTERVAL {days_lookback} DAY)
            GROUP BY
                p.id, p.userId, p.name, g.id, g.type
            ORDER BY
                p.id, interaction_count DESC
            """
            
            try:
                alt_result = self.db.query(alt_query)
                alt_df = pd.DataFrame(alt_result)
                alt_df['content_type'] = 'game'
                
                return alt_df
            except Exception as alt_e:
                print(f"대체 콘텐츠 상호작용 분석 쿼리 실행 실패: {str(alt_e)}")
                # 빈 데이터프레임 반환
                return pd.DataFrame(columns=['player_id', 'userId', 'name', 'content_name', 'content_category', 
                                            'interaction_count', 'total_duration', 'avg_duration', 
                                            'total_bet', 'total_win', 'net_profit', 'content_type'])
    
    def analyze_user_engagement(self, days_lookback=90):
        """
        사용자 참여도 종합 분석
        
        Args:
            days_lookback (int): 분석할 과거 기간(일). 기본값은 90.
            
        Returns:
            dict: 분석 결과가 포함된 딕셔너리
        """
        import numpy as np
        
        # 1. 기능 사용 데이터 가져오기
        feature_usage = self.get_feature_usage(days_lookback)
        
        # 2. 콘텐츠 상호작용 데이터 가져오기
        content_interaction = self.get_content_interaction(days_lookback)
        
        # 3. 로그인 빈도 데이터 가져오기
        login_frequency = self.get_login_frequency(days_lookback)
        
        # 빈 데이터프레임이 아닌 경우에만 처리
        player_engagement = None
        
        if not login_frequency.empty:
            # 사용자별 기능 사용 통계
            if not feature_usage.empty:
                feature_stats = feature_usage.groupby('player_id').agg({
                    'usage_count': 'sum',
                    'feature_type': 'nunique'
                }).rename(columns={
                    'usage_count': 'total_feature_usage',
                    'feature_type': 'unique_features_used'
                }).reset_index()
            else:
                feature_stats = pd.DataFrame(columns=['player_id', 'total_feature_usage', 'unique_features_used'])
            
            # 사용자별 콘텐츠 상호작용 통계
            if not content_interaction.empty:
                content_stats = content_interaction.groupby('player_id').agg({
                    'interaction_count': 'sum',
                    'content_name': 'nunique',
                    'total_duration': 'sum',
                    'total_bet': 'sum',
                    'total_win': 'sum',
                    'net_profit': 'sum'
                }).rename(columns={
                    'interaction_count': 'total_content_interactions',
                    'content_name': 'unique_contents_used'
                }).reset_index()
            else:
                content_stats = pd.DataFrame(columns=['player_id', 'total_content_interactions', 'unique_contents_used',
                                                    'total_duration', 'total_bet', 'total_win', 'net_profit'])
            
            # 데이터 통합
            player_engagement = login_frequency[['player_id', 'userId', 'name', 'login_count', 'login_frequency_percent',
                                                'days_since_last_login']]
            
            # 기능 사용 통계 병합
            if not feature_stats.empty and 'player_id' in feature_stats.columns:
                player_engagement = pd.merge(
                    player_engagement,
                    feature_stats,
                    on='player_id',
                    how='left'
                )
            else:
                player_engagement['total_feature_usage'] = 0
                player_engagement['unique_features_used'] = 0
            
            # 콘텐츠 상호작용 통계 병합
            if not content_stats.empty and 'player_id' in content_stats.columns:
                player_engagement = pd.merge(
                    player_engagement,
                    content_stats,
                    on='player_id',
                    how='left'
                )
            else:
                player_engagement['total_content_interactions'] = 0
                player_engagement['unique_contents_used'] = 0
                player_engagement['total_duration'] = 0
                player_engagement['total_bet'] = 0
                player_engagement['total_win'] = 0
                player_engagement['net_profit'] = 0
            
            # NaN 값을 0으로 대체
            player_engagement = player_engagement.fillna(0)
            
            # 참여도 점수 계산 (로그인 빈도, 기능 사용, 콘텐츠 상호작용 기반)
            player_engagement['engagement_score'] = (
                (player_engagement['login_frequency_percent'] / 10) +  # 10% 로그인 = 1점
                (player_engagement['total_feature_usage'] / 10) +      # 10회 기능 사용 = 1점
                (player_engagement['total_content_interactions'] / 20)  # 20회 콘텐츠 상호작용 = 1점
            )
            
            # 참여도 등급 계산
            conditions = [
                (player_engagement['engagement_score'] >= 20),                       # 매우 높음
                (player_engagement['engagement_score'] >= 10) & (player_engagement['engagement_score'] < 20),  # 높음
                (player_engagement['engagement_score'] >= 5) & (player_engagement['engagement_score'] < 10),   # 중간
                (player_engagement['engagement_score'] > 0) & (player_engagement['engagement_score'] < 5),     # 낮음
                (player_engagement['engagement_score'] == 0)                         # 참여 없음
            ]
            
            values = ['매우 높음', '높음', '중간', '낮음', '참여 없음']
            player_engagement['engagement_level'] = np.select(conditions, values, default='참여 없음')
        
        # 빈 데이터프레임이면 기본 템플릿 생성
        if player_engagement is None or player_engagement.empty:
            player_engagement = pd.DataFrame(columns=[
                'player_id', 'userId', 'name', 'login_count', 'login_frequency_percent',
                'days_since_last_login', 'total_feature_usage', 'unique_features_used',
                'total_content_interactions', 'unique_contents_used', 'total_duration',
                'total_bet', 'total_win', 'net_profit', 'engagement_score', 'engagement_level'
            ])
        
        # 참여도 등급별 통계
        engagement_segments = None
        if not player_engagement.empty and 'engagement_level' in player_engagement.columns:
            engagement_segments = player_engagement.groupby('engagement_level').agg({
                'player_id': 'count',
                'login_count': 'mean',
                'total_feature_usage': 'mean',
                'unique_features_used': 'mean',
                'total_content_interactions': 'mean',
                'unique_contents_used': 'mean',
                'total_duration': 'mean',
                'total_bet': 'mean',
                'total_win': 'mean',
                'net_profit': 'mean'
            }).reset_index()
        
        # 결과 반환
        return {
            'raw_data': player_engagement,
            'engagement_segments': engagement_segments
        }
    
    def analyze_conversion_funnel(self, days_lookback=90, inactive_threshold=10):
        """
        사용자 여정 전환 퍼널 분석
        
        Args:
            days_lookback (int): 분석할 과거 기간(일). 기본값은 90.
            inactive_threshold (int): 비활성으로 간주할 최소 일수. 기본값은 10.
            
        Returns:
            dict: 분석 결과가 포함된 딕셔너리
        """
        # 1. 전체 사용자 조회
        total_users_query = """
        SELECT COUNT(DISTINCT id) AS total_users
        FROM players
        WHERE createdAt >= DATE_SUB(CURRENT_DATE(), INTERVAL 180 DAY)
        """
        total_users_result = self.db.query_one(total_users_query)
        total_users = total_users_result['total_users'] if total_users_result else 0
        
        # 2. 퍼널 단계별 사용자 수 조회
        funnel_query = f"""
        WITH AllUsers AS (
            SELECT 
                id, 
                userId, 
                name,
                createdAt,
                lastPlayDate
            FROM 
                players
            WHERE 
                createdAt >= DATE_SUB(CURRENT_DATE(), INTERVAL 180 DAY)
        ),
        LoginUsers AS (
            SELECT 
                DISTINCT player
            FROM 
                login_history
            WHERE 
                loginTime >= DATE_SUB(CURRENT_DATE(), INTERVAL {days_lookback} DAY)
        ),
        GamePlayUsers AS (
            SELECT 
                DISTINCT player
            FROM 
                game_plays
            WHERE 
                playTime >= DATE_SUB(CURRENT_DATE(), INTERVAL {days_lookback} DAY)
        ),
        EventUsers AS (
            SELECT 
                DISTINCT player
            FROM 
                promotion_players
            WHERE 
                appliedAt >= DATE_SUB(CURRENT_DATE(), INTERVAL {days_lookback} DAY)
        ),
        DepositUsers AS (
            SELECT 
                DISTINCT player
            FROM 
                money_flows
            WHERE 
                type = 0 -- 입금
                AND createdAt >= DATE_SUB(CURRENT_DATE(), INTERVAL {days_lookback} DAY)
        ),
        RepeatedDepositUsers AS (
            SELECT 
                player
            FROM 
                money_flows
            WHERE 
                type = 0 -- 입금
                AND createdAt >= DATE_SUB(CURRENT_DATE(), INTERVAL {days_lookback} DAY)
            GROUP BY 
                player
            HAVING 
                COUNT(*) > 1
        )
        SELECT 
            (SELECT COUNT(*) FROM AllUsers) AS registered_users,
            (SELECT COUNT(DISTINCT lu.player) FROM LoginUsers lu JOIN AllUsers au ON lu.player = au.id) AS login_users,
            (SELECT COUNT(DISTINCT gp.player) FROM GamePlayUsers gp JOIN AllUsers au ON gp.player = au.id) AS game_play_users,
            (SELECT COUNT(DISTINCT eu.player) FROM EventUsers eu JOIN AllUsers au ON eu.player = au.id) AS event_users,
            (SELECT COUNT(DISTINCT du.player) FROM DepositUsers du JOIN AllUsers au ON du.player = au.id) AS deposit_users,
            (SELECT COUNT(DISTINCT rdu.player) FROM RepeatedDepositUsers rdu JOIN AllUsers au ON rdu.player = au.id) AS repeated_deposit_users
        """
        
        funnel_result = self.db.query_one(funnel_query)
        
        # 3. 비활성 사용자에 대한 전환 퍼널
        inactive_funnel_query = f"""
        WITH InactiveUsers AS (
            SELECT 
                id, 
                userId, 
                name,
                lastPlayDate
            FROM 
                players
            WHERE 
                lastPlayDate IS NOT NULL 
                AND lastPlayDate < DATE_SUB(CURRENT_DATE(), INTERVAL {inactive_threshold} DAY)
                AND lastPlayDate >= DATE_SUB(CURRENT_DATE(), INTERVAL 180 DAY)
        ),
        ReactivatedUsers AS (
            SELECT 
                DISTINCT player
            FROM 
                login_history
            WHERE 
                loginTime >= DATE_SUB(CURRENT_DATE(), INTERVAL {days_lookback} DAY)
                AND player IN (SELECT id FROM InactiveUsers)
        ),
        EventUsers AS (
            SELECT 
                DISTINCT player
            FROM 
                promotion_players
            WHERE 
                appliedAt >= DATE_SUB(CURRENT_DATE(), INTERVAL {days_lookback} DAY)
                AND player IN (SELECT id FROM InactiveUsers)
        ),
        EventAndReactivatedUsers AS (
            SELECT 
                ru.player
            FROM 
                ReactivatedUsers ru
            JOIN 
                EventUsers eu ON ru.player = eu.player
        ),
        DepositUsers AS (
            SELECT 
                DISTINCT player
            FROM 
                money_flows
            WHERE 
                type = 0 -- 입금
                AND createdAt >= DATE_SUB(CURRENT_DATE(), INTERVAL {days_lookback} DAY)
                AND player IN (SELECT id FROM InactiveUsers)
        ),
        EventAndDepositUsers AS (
            SELECT 
                eu.player
            FROM 
                EventUsers eu
            JOIN 
                DepositUsers du ON eu.player = du.player
        ),
        RepeatedDepositUsers AS (
            SELECT 
                player
            FROM 
                money_flows
            WHERE 
                type = 0 -- 입금
                AND createdAt >= DATE_SUB(CURRENT_DATE(), INTERVAL {days_lookback} DAY)
                AND player IN (SELECT id FROM InactiveUsers)
            GROUP BY 
                player
            HAVING 
                COUNT(*) > 1
        )
        SELECT 
            (SELECT COUNT(*) FROM InactiveUsers) AS inactive_users,
            (SELECT COUNT(*) FROM ReactivatedUsers) AS reactivated_users,
            (SELECT COUNT(*) FROM EventUsers) AS event_users,
            (SELECT COUNT(*) FROM EventAndReactivatedUsers) AS event_and_reactivated_users,
            (SELECT COUNT(*) FROM DepositUsers) AS deposit_users,
            (SELECT COUNT(*) FROM EventAndDepositUsers) AS event_and_deposit_users,
            (SELECT COUNT(*) FROM RepeatedDepositUsers) AS repeated_deposit_users
        """
        
        inactive_funnel_result = self.db.query_one(inactive_funnel_query)
        
        # 4. 단계별 전환율 계산
        funnel_stages = []
        conversion_rates = []
        
        if funnel_result:
            registered_users = funnel_result.get('registered_users', 0)
            login_users = funnel_result.get('login_users', 0)
            game_play_users = funnel_result.get('game_play_users', 0)
            event_users = funnel_result.get('event_users', 0)
            deposit_users = funnel_result.get('deposit_users', 0)
            repeated_deposit_users = funnel_result.get('repeated_deposit_users', 0)
            
            funnel_stages = [
                {"name": "등록", "users": registered_users},
                {"name": "로그인", "users": login_users},
                {"name": "게임 플레이", "users": game_play_users},
                {"name": "이벤트 참여", "users": event_users},
                {"name": "입금", "users": deposit_users},
                {"name": "반복 입금", "users": repeated_deposit_users}
            ]
            
            # 전환율 계산
            for i in range(1, len(funnel_stages)):
                prev_stage = funnel_stages[i-1]
                current_stage = funnel_stages[i]
                
                if prev_stage["users"] > 0:
                    conversion_rate = (current_stage["users"] / prev_stage["users"]) * 100
                else:
                    conversion_rate = 0
                    
                conversion_rates.append({
                    "from_stage": prev_stage["name"],
                    "to_stage": current_stage["name"],
                    "rate": conversion_rate
                })
        
        # 5. 비활성 사용자 전환율 계산
        inactive_funnel_stages = []
        inactive_conversion_rates = []
        
        if inactive_funnel_result:
            inactive_users = inactive_funnel_result.get('inactive_users', 0)
            reactivated_users = inactive_funnel_result.get('reactivated_users', 0)
            inactive_event_users = inactive_funnel_result.get('event_users', 0)
            event_and_reactivated_users = inactive_funnel_result.get('event_and_reactivated_users', 0)
            inactive_deposit_users = inactive_funnel_result.get('deposit_users', 0)
            event_and_deposit_users = inactive_funnel_result.get('event_and_deposit_users', 0)
            inactive_repeated_deposit_users = inactive_funnel_result.get('repeated_deposit_users', 0)
            
            inactive_funnel_stages = [
                {"name": "비활성 사용자", "users": inactive_users},
                {"name": "재방문", "users": reactivated_users},
                {"name": "이벤트 참여", "users": inactive_event_users},
                {"name": "이벤트 후 게임 플레이", "users": event_and_reactivated_users},
                {"name": "입금", "users": inactive_deposit_users},
                {"name": "이벤트 후 입금", "users": event_and_deposit_users},
                {"name": "반복 입금", "users": inactive_repeated_deposit_users}
            ]
            
            # 전환율 계산
            for i in range(1, len(inactive_funnel_stages)):
                prev_stage = inactive_funnel_stages[i-1]
                current_stage = inactive_funnel_stages[i]
                
                if prev_stage["users"] > 0:
                    conversion_rate = (current_stage["users"] / prev_stage["users"]) * 100
                else:
                    conversion_rate = 0
                    
                inactive_conversion_rates.append({
                    "from_stage": prev_stage["name"],
                    "to_stage": current_stage["name"],
                    "rate": conversion_rate
                })
            
            # 이벤트 참여에서 입금으로의 직접 전환율
            if inactive_event_users > 0:
                event_to_deposit_rate = (event_and_deposit_users / inactive_event_users) * 100
            else:
                event_to_deposit_rate = 0
                
            inactive_conversion_rates.append({
                "from_stage": "이벤트 참여",
                "to_stage": "이벤트 후 입금",
                "rate": event_to_deposit_rate
            })
        
        # 6. 결과 반환
        return {
            "funnel_stages": funnel_stages,
            "conversion_rates": conversion_rates,
            "inactive_funnel_stages": inactive_funnel_stages,
            "inactive_conversion_rates": inactive_conversion_rates,
            "raw_data": {
                "funnel_result": funnel_result,
                "inactive_funnel_result": inactive_funnel_result
            }
        }
        
    def analyze_conversion_by_event_amount(self, bin_count=10):
        """
        이벤트 지급 금액별 전환율 분석
        
        Args:
            bin_count (int): 금액 구간 수. 기본값은 10.
            
        Returns:
            dict: 분석 결과가 포함된 딕셔너리
        """
        # 1. 이벤트 참여자 가져오기
        event_participants = self.get_event_participants()
        
        # 2. 이벤트 후 입금자 가져오기
        deposit_after_event = self.get_deposits_after_event()
        
        # 3. 데이터 통합
        merged_data = pd.merge(
            event_participants,
            deposit_after_event,
            left_on='player',
            right_on='player',
            how='left'
        )
        
        # NaN 값을 0으로 대체 (입금하지 않은 사용자)
        merged_data['deposit_amount_after_event'] = merged_data['deposit_amount_after_event'].fillna(0)
        merged_data['deposit_count_after_event'] = merged_data['deposit_count_after_event'].fillna(0)
        
        # 4. 이벤트 금액별 분석
        amount_min = merged_data['total_reward'].min()
        amount_max = merged_data['total_reward'].max()
        amount_bins = pd.cut(merged_data['total_reward'], bins=bin_count)
        
        # 이벤트 금액별 통계
        amount_stats = merged_data.groupby(amount_bins).agg({
            'player': 'count',
            'deposit_amount_after_event': ['sum', 'mean'],
            'total_reward': ['sum', 'mean'],
        }).reset_index()
        
        # 이벤트 금액별 전환율
        amount_stats['conversion_users'] = merged_data[merged_data['deposit_amount_after_event'] > 0].groupby(amount_bins).size().reindex(amount_stats['total_reward']).fillna(0).astype(int)
        amount_stats['conversion_rate'] = amount_stats['conversion_users'] / amount_stats[('player', 'count')] * 100
        
        # 투자수익률 (ROI)
        amount_stats['roi'] = (amount_stats[('deposit_amount_after_event', 'sum')] / amount_stats[('total_reward', 'sum')] - 1) * 100
        
        return {
            'stats': amount_stats,
            'raw_data': merged_data
        }
    
    def generate_analysis_report(self, output_dir=None):
        """
        분석 보고서 생성
        
        Args:
            output_dir (str, optional): 결과 저장 디렉토리. 기본값은 None.
                None인 경우 프로젝트 루트의 reports 디렉토리를 사용합니다.
                
        Returns:
            dict: 분석 결과가 포함된 딕셔너리
        """
        if output_dir is None:
            output_dir = project_root / "reports" / "user"
            os.makedirs(output_dir, exist_ok=True)
        
        # 타임스탬프
        timestamp = datetime.now().strftime("%Y%m%d_%H%M%S")
        
        # 1. 비활성 기간별 전환율 분석
        inactive_analysis = self.analyze_conversion_by_inactive_period()
        inactive_stats = inactive_analysis['stats']
        
        # 2. 이벤트 금액별 전환율 분석
        amount_analysis = self.analyze_conversion_by_event_amount()
        amount_stats = amount_analysis['stats']
        
        # 3. 최종 분석 데이터
        results = self.get_inactive_event_deposit_users()
        
        # 4. 보고서 생성
        report = {
            'summary': {
                'total_inactive_users': len(self.get_inactive_users()),
                'total_event_participants': len(self.get_event_participants()),
                'total_converted_users': len(results),
                'overall_conversion_rate': len(results) / len(self.get_event_participants()) * 100 if len(self.get_event_participants()) > 0 else 0,
                'total_event_amount': results['total_event_reward'].sum() if 'total_event_reward' in results.columns else 0,
                'total_deposit_amount': results['deposit_amount_after_event'].sum() if 'deposit_amount_after_event' in results.columns else 0,
                'overall_roi': (results['deposit_amount_after_event'].sum() / results['total_event_reward'].sum() - 1) * 100
                if 'deposit_amount_after_event' in results.columns and 'total_event_reward' in results.columns and results['total_event_reward'].sum() > 0
                else 0
            },
            'inactive_period_analysis': inactive_stats.to_dict(),
            'event_amount_analysis': amount_stats.to_dict(),
            'converted_users': results.to_dict()
        }
        
        # 5. 결과 저장
        # DataFrame 저장
        results.to_csv(f"{output_dir}/inactive_event_deposit_users_{timestamp}.csv", index=False)
        inactive_stats.to_csv(f"{output_dir}/inactive_period_analysis_{timestamp}.csv", index=False)
        amount_stats.to_csv(f"{output_dir}/event_amount_analysis_{timestamp}.csv", index=False)
        
        # 6. 시각화
        # 비활성 기간별 전환율 그래프
        plt.figure(figsize=(12, 6))
        plt.bar(inactive_stats['inactive_period'].astype(str), inactive_stats['conversion_rate'])
        plt.title('Conversion Rate by Inactive Period')
        plt.xlabel('Inactive Period (Days)')
        plt.ylabel('Conversion Rate (%)')
        plt.xticks(rotation=45)
        plt.tight_layout()
        plt.savefig(f"{output_dir}/conversion_by_inactive_period_{timestamp}.png")
        plt.close()
        
        # 이벤트 금액별 전환율 그래프
        plt.figure(figsize=(12, 6))
        try:
            amount_stat_df = pd.DataFrame(amount_stats)
            amount_labels = [str(interval) for interval in amount_stat_df['total_reward']]
            plt.bar(amount_labels, amount_stat_df['conversion_rate'])
            plt.title('Conversion Rate by Event Amount')
            plt.xlabel('Event Amount')
            plt.ylabel('Conversion Rate (%)')
            plt.xticks(rotation=45)
            plt.tight_layout()
            plt.savefig(f"{output_dir}/conversion_by_event_amount_{timestamp}.png")
        except Exception as e:
            print(f"이벤트 금액별 그래프 생성 실패: {str(e)}")
        finally:
            plt.close()
        
        return report
        
    def analyze_retention(self, cohort_period='month', lookback_periods=6):
        """
        사용자 유지율 및 이탈률 분석
        
        Args:
            cohort_period (str): 코호트 그룹화 기준 ('day', 'week', 'month'). 기본값은 'month'.
            lookback_periods (int): 분석할 과거 기간 수. 기본값은 6.
            
        Returns:
            dict: 분석 결과가 포함된 딕셔너리
        """
        # 코호트 기간에 따른 기간 계산
        if cohort_period == 'day':
            date_format = '%Y-%m-%d'
            interval = 'DAY'
        elif cohort_period == 'week':
            date_format = '%Y-%U' # 연도-주차
            interval = 'WEEK'
        else: # default: month
            date_format = '%Y-%m'
            interval = 'MONTH'
        
        # 1. 사용자 가입 코호트 쿼리
        cohort_query = f"""
        SELECT
            id AS player_id,
            userId,
            name,
            DATE_FORMAT(createdAt, '{date_format}') AS cohort_period,
            createdAt AS join_date
        FROM
            players
        WHERE
            createdAt >= DATE_SUB(CURRENT_DATE(), INTERVAL {lookback_periods} {interval})
        """
        
        cohort_data = pd.DataFrame(self.db.query(cohort_query))
        
        if cohort_data.empty:
            return {
                'retention_matrix': pd.DataFrame(),
                'churn_matrix': pd.DataFrame(),
                'cohort_sizes': pd.DataFrame(),
                'avg_retention': {}
            }
        
        # 2. 활동 데이터 쿼리 (로그인 기준)
        activity_query = f"""
        SELECT
            p.id AS player_id,
            p.userId,
            p.name,
            p.createdAt AS join_date,
            DATE_FORMAT(p.createdAt, '{date_format}') AS cohort_period,
            DATE_FORMAT(l.loginTime, '{date_format}') AS activity_period
        FROM
            players p
        LEFT JOIN
            login_history l ON p.id = l.player
        WHERE
            p.createdAt >= DATE_SUB(CURRENT_DATE(), INTERVAL {lookback_periods} {interval})
            AND (l.loginTime IS NULL OR l.loginTime >= p.createdAt)
        """
        
        # 활동 데이터가 없을 경우 게임플레이 데이터로 대체 시도
        try:
            activity_data = pd.DataFrame(self.db.query(activity_query))
        except Exception as e:
            activity_query = f"""
            SELECT
                p.id AS player_id,
                p.userId,
                p.name,
                p.createdAt AS join_date,
                DATE_FORMAT(p.createdAt, '{date_format}') AS cohort_period,
                DATE_FORMAT(gp.playTime, '{date_format}') AS activity_period
            FROM
                players p
            LEFT JOIN
                game_plays gp ON p.id = gp.player
            WHERE
                p.createdAt >= DATE_SUB(CURRENT_DATE(), INTERVAL {lookback_periods} {interval})
                AND (gp.playTime IS NULL OR gp.playTime >= p.createdAt)
            """
            
            try:
                activity_data = pd.DataFrame(self.db.query(activity_query))
            except Exception as e2:
                return {
                    'error': f"활동 데이터 쿼리 실패: {str(e2)}",
                    'retention_matrix': pd.DataFrame(),
                    'churn_matrix': pd.DataFrame(),
                    'cohort_sizes': pd.DataFrame(),
                    'avg_retention': {}
                }
        
        # 3. 코호트별 크기 계산
        cohort_sizes = cohort_data.groupby('cohort_period').size().reset_index(name='users')
        
        # 4. 코호트별 활동 데이터 처리
        if not activity_data.empty and 'cohort_period' in activity_data.columns and 'activity_period' in activity_data.columns:
            # 유효한 활동 데이터만 필터링
            activity_data_valid = activity_data.dropna(subset=['activity_period'])
            
            # 각 사용자별로 코호트 기간과 활동 기간 간의 차이 계산
            activity_data_valid['period_number'] = activity_data_valid.apply(lambda x: self._calculate_period_diff(x['cohort_period'], x['activity_period'], cohort_period), axis=1)
            
            # 각 코호트의 각 기간별 활성 사용자 수 계산
            retention_table = activity_data_valid.drop_duplicates(subset=['cohort_period', 'player_id', 'period_number'])
            retention_counts = retention_table.groupby(['cohort_period', 'period_number']).size().reset_index(name='active_users')
            
            # 코호트별 유지율 계산
            retention_matrix = pd.DataFrame()
            
            for cohort in cohort_sizes['cohort_period'].unique():
                cohort_retention = retention_counts[retention_counts['cohort_period'] == cohort]
                total_users = cohort_sizes[cohort_sizes['cohort_period'] == cohort]['users'].values[0]
                
                retention_row = {'cohort_period': cohort, 'cohort_size': total_users}
                
                for period in range(lookback_periods + 1):
                    period_users = cohort_retention[cohort_retention['period_number'] == period]['active_users'].values[0] if period in cohort_retention['period_number'].values else 0
                    retention_rate = (period_users / total_users) * 100 if total_users > 0 else 0
                    retention_row[f'period_{period}'] = retention_rate
                
                retention_matrix = pd.concat([retention_matrix, pd.DataFrame([retention_row])], ignore_index=True)
            
            # 이탈률 계산 (1 - 유지율)
            churn_matrix = retention_matrix.copy()
            for column in churn_matrix.columns:
                if column.startswith('period_'):
                    churn_matrix[column] = 100 - churn_matrix[column]
            
            # 평균 유지율 계산
            avg_retention = {}
            for period in range(1, lookback_periods + 1):
                period_col = f'period_{period}'
                if period_col in retention_matrix.columns:
                    avg_retention[period] = retention_matrix[period_col].mean()
        else:
            # 활동 데이터가 없는 경우
            periods = list(range(lookback_periods + 1))
            retention_matrix = pd.DataFrame({
                'cohort_period': cohort_sizes['cohort_period'],
                'cohort_size': cohort_sizes['users']
            })
            for period in periods:
                retention_matrix[f'period_{period}'] = 0 if period > 0 else 100
            
            churn_matrix = retention_matrix.copy()
            for column in churn_matrix.columns:
                if column.startswith('period_'):
                    churn_matrix[column] = 100 - churn_matrix[column]
            
            avg_retention = {period: 0 for period in range(1, lookback_periods + 1)}
        
        # 기간 0(가입 당시)은 항상 100%
        if 'period_0' in retention_matrix.columns:
            retention_matrix['period_0'] = 100
            churn_matrix['period_0'] = 0
        
        return {
            'retention_matrix': retention_matrix,
            'churn_matrix': churn_matrix,
            'cohort_sizes': cohort_sizes,
            'avg_retention': avg_retention
        }
    
    def _calculate_period_diff(self, cohort_period, activity_period, period_type):
        """
        코호트 기간과 활동 기간 간의 차이 계산
        
        Args:
            cohort_period (str): 코호트 기간
            activity_period (str): 활동 기간
            period_type (str): 기간 타입 ('day', 'week', 'month')
            
        Returns:
            int: 기간 차이
        """
        if period_type == 'day':
            cohort_date = datetime.strptime(cohort_period, '%Y-%m-%d')
            activity_date = datetime.strptime(activity_period, '%Y-%m-%d')
            return (activity_date - cohort_date).days
        elif period_type == 'week':
            cohort_year, cohort_week = map(int, cohort_period.split('-'))
            activity_year, activity_week = map(int, activity_period.split('-'))
            
            cohort_date = datetime.strptime(f'{cohort_year}-{cohort_week}-1', '%Y-%U-%w')
            activity_date = datetime.strptime(f'{activity_year}-{activity_week}-1', '%Y-%U-%w')
            
            return ((activity_date - cohort_date).days // 7)
        else: # month
            cohort_year, cohort_month = map(int, cohort_period.split('-'))
            activity_year, activity_month = map(int, activity_period.split('-'))
            
            return (activity_year - cohort_year) * 12 + (activity_month - cohort_month)
            
    def analyze_event_retention(self, pre_event_days=30, post_event_days=90):
        """
        이벤트 전후 유지율 분석
        
        Args:
            pre_event_days (int): 이벤트 전 분석 기간(일). 기본값은 30.
            post_event_days (int): 이벤트 후 분석 기간(일). 기본값은 90.
            
        Returns:
            dict: 분석 결과가 포함된 딕셔너리
        """
        import numpy as np
        
        # 1. 이벤트 참여 데이터 가져오기
        event_query = """
        SELECT
            pp.player,
            p.userId,
            p.name,
            MIN(pp.appliedAt) AS first_event_date,
            COUNT(pp.id) AS event_count,
            SUM(pp.reward) AS total_reward
        FROM
            promotion_players pp
        JOIN
            players p ON pp.player = p.id
        WHERE
            pp.appliedAt IS NOT NULL
        GROUP BY
            pp.player, p.userId, p.name
        """
        
        event_data = pd.DataFrame(self.db.query(event_query))
        
        if event_data.empty:
            return {
                'pre_event_activity': pd.DataFrame(),
                'post_event_activity': pd.DataFrame(),
                'retention_impact': pd.DataFrame()
            }
        
        # 2. 이벤트 참여 사용자의 이벤트 전 활동 데이터
        pre_event_query = """
        WITH EventUsers AS (
            SELECT
                player,
                MIN(appliedAt) AS first_event_date
            FROM
                promotion_players
            WHERE
                appliedAt IS NOT NULL
            GROUP BY
                player
        )
        SELECT
            eu.player,
            p.userId,
            p.name,
            eu.first_event_date,
            COUNT(DISTINCT CASE WHEN l.loginTime BETWEEN DATE_SUB(eu.first_event_date, INTERVAL %s DAY) AND eu.first_event_date THEN DATE(l.loginTime) END) AS pre_event_login_days,
            COUNT(DISTINCT CASE WHEN gp.playTime BETWEEN DATE_SUB(eu.first_event_date, INTERVAL %s DAY) AND eu.first_event_date THEN DATE(gp.playTime) END) AS pre_event_play_days,
            COUNT(DISTINCT CASE WHEN mf.createdAt BETWEEN DATE_SUB(eu.first_event_date, INTERVAL %s DAY) AND eu.first_event_date AND mf.type = 0 THEN DATE(mf.createdAt) END) AS pre_event_deposit_days,
            SUM(CASE WHEN mf.createdAt BETWEEN DATE_SUB(eu.first_event_date, INTERVAL %s DAY) AND eu.first_event_date AND mf.type = 0 THEN mf.amount ELSE 0 END) AS pre_event_deposit_amount
        FROM
            EventUsers eu
        JOIN
            players p ON eu.player = p.id
        LEFT JOIN
            login_history l ON eu.player = l.player
        LEFT JOIN
            game_plays gp ON eu.player = gp.player
        LEFT JOIN
            money_flows mf ON eu.player = mf.player
        GROUP BY
            eu.player, p.userId, p.name, eu.first_event_date
        """
        
        pre_event_params = (pre_event_days, pre_event_days, pre_event_days, pre_event_days)
        pre_event_data = pd.DataFrame(self.db.query(pre_event_query, pre_event_params))
        
        # 3. 이벤트 참여 사용자의 이벤트 후 활동 데이터
        post_event_query = """
        WITH EventUsers AS (
            SELECT
                player,
                MIN(appliedAt) AS first_event_date
            FROM
                promotion_players
            WHERE
                appliedAt IS NOT NULL
            GROUP BY
                player
        )
        SELECT
            eu.player,
            p.userId,
            p.name,
            eu.first_event_date,
            COUNT(DISTINCT CASE WHEN l.loginTime BETWEEN eu.first_event_date AND DATE_ADD(eu.first_event_date, INTERVAL %s DAY) THEN DATE(l.loginTime) END) AS post_event_login_days,
            COUNT(DISTINCT CASE WHEN gp.playTime BETWEEN eu.first_event_date AND DATE_ADD(eu.first_event_date, INTERVAL %s DAY) THEN DATE(gp.playTime) END) AS post_event_play_days,
            COUNT(DISTINCT CASE WHEN mf.createdAt BETWEEN eu.first_event_date AND DATE_ADD(eu.first_event_date, INTERVAL %s DAY) AND mf.type = 0 THEN DATE(mf.createdAt) END) AS post_event_deposit_days,
            SUM(CASE WHEN mf.createdAt BETWEEN eu.first_event_date AND DATE_ADD(eu.first_event_date, INTERVAL %s DAY) AND mf.type = 0 THEN mf.amount ELSE 0 END) AS post_event_deposit_amount
        FROM
            EventUsers eu
        JOIN
            players p ON eu.player = p.id
        LEFT JOIN
            login_history l ON eu.player = l.player
        LEFT JOIN
            game_plays gp ON eu.player = gp.player
        LEFT JOIN
            money_flows mf ON eu.player = mf.player
        GROUP BY
            eu.player, p.userId, p.name, eu.first_event_date
        """
        
        post_event_params = (post_event_days, post_event_days, post_event_days, post_event_days)
        post_event_data = pd.DataFrame(self.db.query(post_event_query, post_event_params))
        
        # 4. 데이터 통합 및 이벤트 효과 분석
        # 이벤트 데이터와 전/후 활동 데이터 통합
        if not pre_event_data.empty and 'player' in pre_event_data.columns:
            combined_data = pd.merge(event_data, pre_event_data, left_on='player', right_on='player', how='left')
        else:
            combined_data = event_data.copy()
            for col in ['pre_event_login_days', 'pre_event_play_days', 'pre_event_deposit_days', 'pre_event_deposit_amount']:
                combined_data[col] = 0
        
        if not post_event_data.empty and 'player' in post_event_data.columns:
            combined_data = pd.merge(combined_data, post_event_data, left_on='player', right_on='player', how='left', suffixes=('', '_post'))
        else:
            for col in ['post_event_login_days', 'post_event_play_days', 'post_event_deposit_days', 'post_event_deposit_amount']:
                combined_data[col] = 0
        
        # NaN 값을 0으로 대체
        combined_data = combined_data.fillna(0)
        
        # 활동 변화 계산
        combined_data['login_days_change'] = combined_data['post_event_login_days'] - combined_data['pre_event_login_days']
        combined_data['play_days_change'] = combined_data['post_event_play_days'] - combined_data['pre_event_play_days']
        combined_data['deposit_days_change'] = combined_data['post_event_deposit_days'] - combined_data['pre_event_deposit_days']
        combined_data['deposit_amount_change'] = combined_data['post_event_deposit_amount'] - combined_data['pre_event_deposit_amount']
        
        # 변화율 계산 (0으로 나누는 것 방지)
        combined_data['login_days_change_rate'] = combined_data.apply(
            lambda x: ((x['post_event_login_days'] / x['pre_event_login_days']) - 1) * 100 if x['pre_event_login_days'] > 0 else (float('inf') if x['post_event_login_days'] > 0 else 0),
            axis=1
        )
        
        combined_data['play_days_change_rate'] = combined_data.apply(
            lambda x: ((x['post_event_play_days'] / x['pre_event_play_days']) - 1) * 100 if x['pre_event_play_days'] > 0 else (float('inf') if x['post_event_play_days'] > 0 else 0),
            axis=1
        )
        
        combined_data['deposit_days_change_rate'] = combined_data.apply(
            lambda x: ((x['post_event_deposit_days'] / x['pre_event_deposit_days']) - 1) * 100 if x['pre_event_deposit_days'] > 0 else (float('inf') if x['post_event_deposit_days'] > 0 else 0),
            axis=1
        )
        
        combined_data['deposit_amount_change_rate'] = combined_data.apply(
            lambda x: ((x['post_event_deposit_amount'] / x['pre_event_deposit_amount']) - 1) * 100 if x['pre_event_deposit_amount'] > 0 else (float('inf') if x['post_event_deposit_amount'] > 0 else 0),
            axis=1
        )
        
        # 사용자 그룹화 (이벤트 효과에 따라)
        conditions = [
            (combined_data['login_days_change'] > 0),                           # 로그인 증가
            (combined_data['login_days_change'] == 0) & (combined_data['pre_event_login_days'] > 0),  # 로그인 유지
            (combined_data['login_days_change'] < 0),                           # 로그인 감소
            (combined_data['pre_event_login_days'] == 0) & (combined_data['post_event_login_days'] > 0)  # 새로 활성화
        ]
        
        values = ['활동 증가', '활동 유지', '활동 감소', '재활성화']
        combined_data['retention_effect'] = np.select(conditions, values, default='영향 없음')
        
        # 이벤트 리워드별 유지율 영향 분석
        reward_bins = pd.qcut(combined_data['total_reward'], q=5, duplicates='drop')
        reward_impact = combined_data.groupby(reward_bins).agg({
            'player': 'count',
            'login_days_change': 'mean',
            'play_days_change': 'mean',
            'deposit_days_change': 'mean',
            'deposit_amount_change': 'mean'
        }).reset_index().rename(columns={'player': 'user_count'})
        
        # 유지 효과별 통계
        effect_stats = combined_data.groupby('retention_effect').agg({
            'player': 'count',
            'event_count': 'mean',
            'total_reward': 'mean',
            'login_days_change': 'mean',
            'play_days_change': 'mean',
            'deposit_days_change': 'mean',
            'deposit_amount_change': 'mean'
        }).reset_index().rename(columns={'player': 'user_count'})
        
        return {
            'user_data': combined_data,
            'reward_impact': reward_impact,
            'effect_stats': effect_stats
        }
        
    def expand_user_segmentation(self, days_lookback=90):
        """
        확장된 사용자 세그먼테이션 수행
        
        Args:
            days_lookback (int): 분석할 과거 기간(일). 기본값은 90.
            
        Returns:
            dict: 분석 결과가 포함된 딕셔너리
        """
        # 이 함수의 구현은 생략되었습니다
        pass

def main():
    """
    메인 함수
    """
    # 분석기 초기화
    analyzer = InactiveUserEventAnalyzer()
    
    try:
        # 비활성 사용자 중 이벤트 후 입금한 사용자 목록 조회
        results = analyzer.get_inactive_event_deposit_users()
        print(f"총 {len(results)}명의 사용자가 조건을 만족합니다.")
        
        # 분석 보고서 생성
        report = analyzer.generate_analysis_report()
        print("분석 보고서 생성 완료!")
        
        # 요약 정보 출력
        print("\n===== 요약 정보 =====")
        for key, value in report['summary'].items():
            print(f"{key}: {value}")
    except Exception as e:
        print(f"오류 발생: {str(e)}")
    finally:
        print("\n분석 완료!")

if __name__ == "__main__":
    main()
