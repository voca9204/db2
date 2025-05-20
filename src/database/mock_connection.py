"""
임시 모의 데이터베이스 연결

이 모듈은 실제 데이터베이스 연결 없이 테스트 및 개발 목적으로 사용됩니다.
"""

import os
import json
import random
import pandas as pd
import numpy as np
from pathlib import Path
from datetime import datetime, timedelta

class MockDBConnection:
    """
    모의 데이터베이스 연결 클래스
    """
    
    def __init__(self, config_path=None):
        """
        모의 DB 연결 초기화
        """
        self.project_root = Path(__file__).parent.parent.parent
        self.mock_data_dir = self.project_root / "data" / "mock"
        os.makedirs(self.mock_data_dir, exist_ok=True)
        
        print(f"모의 데이터베이스 연결 초기화 완료 (실제 DB에 연결되지 않음)")
        
    def query(self, query, params=None):
        """
        SQL 쿼리 실행 (모의 데이터 반환)
        """
        # 비활성 사용자 목록 쿼리
        if "lastPlayDate" in query and "DATE_SUB" in query:
            return self._get_mock_inactive_users()
        
        # 이벤트 참여자 쿼리
        elif "promotion_players" in query and "appliedAt" in query:
            return self._get_mock_event_participants()
        
        # 이벤트 후 입금 쿼리
        elif "money_flows" in query and "first_promotion_date" in query:
            return self._get_mock_deposits_after_event()
            
        # 비활성 사용자 중 이벤트 후 입금 조합 쿼리
        elif "InactiveUsers" in query and "EventUsers" in query:
            return self._get_mock_inactive_event_deposit_users()
        
        # 기타 쿼리: 빈 배열 반환
        return []
    
    def query_one(self, query, params=None):
        """
        단일 결과 쿼리 실행 (모의 데이터 반환)
        """
        results = self.query(query, params)
        return results[0] if results else None
    
    def _get_mock_inactive_users(self):
        """
        모의 비활성 사용자 데이터 생성
        """
        users = []
        for i in range(1, 101):
            days_inactive = random.randint(5, 180)
            last_play_date = (datetime.now() - timedelta(days=days_inactive)).strftime("%Y-%m-%d")
            
            users.append({
                "id": i,
                "userId": f"user{i}",
                "name": f"User {i}",
                "lastPlayDate": last_play_date,
                "days_inactive": days_inactive
            })
        
        return users
    
    def _get_mock_event_participants(self):
        """
        모의 이벤트 참여자 데이터 생성
        """
        participants = []
        for i in range(1, 81):  # 비활성 사용자 중 80%가 이벤트 참여
            promo_count = random.randint(1, 5)
            total_reward = random.randint(1000, 50000)
            first_date = (datetime.now() - timedelta(days=random.randint(1, 60))).strftime("%Y-%m-%d %H:%M:%S")
            
            participants.append({
                "player": i,
                "userId": f"user{i}",
                "name": f"User {i}",
                "first_promotion_date": first_date,
                "promotion_count": promo_count,
                "total_reward": total_reward
            })
        
        return participants
    
    def _get_mock_deposits_after_event(self):
        """
        모의 이벤트 후 입금 데이터 생성
        """
        deposits = []
        for i in range(1, 51):  # 이벤트 참여자 중 약 60%가 입금
            deposit_amount = random.randint(5000, 100000)
            deposit_count = random.randint(1, 3)
            first_promo_date = (datetime.now() - timedelta(days=random.randint(1, 60))).strftime("%Y-%m-%d %H:%M:%S")
            
            deposits.append({
                "player": i,
                "userId": f"user{i}",
                "name": f"User {i}",
                "first_promotion_date": first_promo_date,
                "deposit_amount_after_event": deposit_amount,
                "deposit_count_after_event": deposit_count
            })
        
        return deposits
        
    def _get_mock_inactive_event_deposit_users(self):
        """
        모의 비활성 사용자 중 이벤트 후 입금 사용자 데이터 생성
        """
        users = []
        for i in range(1, 41):  # 약 40명의 사용자
            days_inactive = random.randint(10, 180)
            last_play_date = (datetime.now() - timedelta(days=days_inactive)).strftime("%Y-%m-%d")
            event_count = random.randint(1, 5)
            total_event_reward = random.randint(1000, 50000)
            deposit_amount = random.randint(5000, 100000)
            deposit_count = random.randint(1, 3)
            first_promo_date = (datetime.now() - timedelta(days=random.randint(1, 30))).strftime("%Y-%m-%d %H:%M:%S")
            
            users.append({
                "user_id": f"user{i}",
                "user_name": f"User {i}",
                "event_count": event_count,
                "total_event_reward": total_event_reward,
                "deposit_amount_after_event": deposit_amount,
                "deposit_count_after_event": deposit_count,
                "first_promotion_date": first_promo_date,
                "last_play_date": last_play_date,
                "days_inactive": days_inactive
            })
        
        return users

    def execute(self, query, params=None):
        """
        SQL 쿼리 실행 (INSERT, UPDATE, DELETE)
        
        Args:
            query (str): 실행할 SQL 쿼리
            params (Union[Tuple, Dict], optional): 쿼리 파라미터. 기본값은 None.
            
        Returns:
            int: 영향받은 행 수
        """
        return 0
        
    def execute_batch(self, query, params_list):
        """
        배치 쿼리 실행 (INSERT, UPDATE, DELETE)
        
        Args:
            query (str): 실행할 SQL 쿼리
            params_list (List[Union[Tuple, Dict]]): 쿼리 파라미터 리스트
            
        Returns:
            int: 영향받은 행 수
        """
        return 0
        
    def execute_script(self, script):
        """
        SQL 스크립트 실행 (여러 쿼리)
        
        Args:
            script (str): 실행할 SQL 스크립트
        """
        pass
        
    def close_pool(self):
        """
        연결 풀 종료
        """
        pass

# MariaDBConnection 클래스 이름으로 모의 클래스 제공 (호환성 유지)
MariaDBConnection = MockDBConnection
