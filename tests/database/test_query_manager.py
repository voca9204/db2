"""
Query Manager 테스트 모듈

이 모듈은 Query Manager의 기능을 테스트합니다.
"""

import os
import sys
import unittest
from unittest.mock import MagicMock, patch
import pandas as pd
from pathlib import Path
import tempfile
import shutil
import json
import time

# 프로젝트 루트 디렉토리를 sys.path에 추가
project_root = Path(__file__).parent.parent.parent
sys.path.append(str(project_root))

from src.database.query_manager import QueryManager, QueryError

class TestQueryManager(unittest.TestCase):
    """QueryManager 클래스 테스트"""
    
    def setUp(self):
        """테스트 설정"""
        # 임시 캐시 디렉토리 생성
        self.temp_dir = tempfile.mkdtemp()
        
        # 모의 데이터베이스 연결 객체 생성
        self.mock_db = MagicMock()
        
        # 샘플 쿼리 결과 설정
        self.sample_query_result = [
            {'id': 1, 'name': 'User 1', 'value': 100},
            {'id': 2, 'name': 'User 2', 'value': 200},
            {'id': 3, 'name': 'User 3', 'value': 300}
        ]
        
        # query 메서드 모의 설정
        self.mock_db.query = MagicMock(return_value=self.sample_query_result)
        
        # execute 메서드 모의 설정
        self.mock_db.execute = MagicMock(return_value=3)
        
        # execute_batch 메서드 모의 설정
        self.mock_db.execute_batch = MagicMock(return_value=3)
        
        # 쿼리 매니저 생성
        self.query_manager = QueryManager(self.mock_db, cache_dir=self.temp_dir)
        
        # 임시 쿼리 파일 생성
        self.temp_query_file = os.path.join(self.temp_dir, 'test_query.sql')
        with open(self.temp_query_file, 'w', encoding='utf-8') as f:
            f.write("SELECT * FROM test_table WHERE id = :id")
    
    def tearDown(self):
        """테스트 정리"""
        # 임시 디렉토리 삭제
        shutil.rmtree(self.temp_dir)
    
    def test_execute_query_basic(self):
        """기본 쿼리 실행 테스트"""
        # 쿼리 실행
        query = "SELECT * FROM test_table"
        result = self.query_manager.execute_query(query)
        
        # 모의 객체가 올바른 쿼리로 호출되었는지 확인
        self.mock_db.query.assert_called_once_with(query)
        
        # 결과가 데이터프레임으로 변환되었는지 확인
        self.assertIsInstance(result, pd.DataFrame)
        self.assertEqual(len(result), 3)
        self.assertEqual(list(result.columns), ['id', 'name', 'value'])
    
    def test_execute_query_with_params(self):
        """파라미터가 있는 쿼리 실행 테스트"""
        # 쿼리 및 파라미터 설정
        query = "SELECT * FROM test_table WHERE id = :id"
        params = {'id': 1}
        
        # 쿼리 실행
        result = self.query_manager.execute_query(query, params)
        
        # 모의 객체가 올바른 쿼리와 파라미터로 호출되었는지 확인
        self.mock_db.query.assert_called_once_with(query, params)
        
        # 결과가 데이터프레임으로 변환되었는지 확인
        self.assertIsInstance(result, pd.DataFrame)
    
    def test_execute_query_without_dataframe(self):
        """데이터프레임 변환 없이 쿼리 실행 테스트"""
        # 쿼리 실행
        query = "SELECT * FROM test_table"
        result = self.query_manager.execute_query(query, as_dataframe=False)
        
        # 모의 객체가 올바른 쿼리로 호출되었는지 확인
        self.mock_db.query.assert_called_once_with(query)
        
        # 결과가 원본 리스트인지 확인
        self.assertIsInstance(result, list)
        self.assertEqual(len(result), 3)
        self.assertEqual(result, self.sample_query_result)
    
    def test_execute_query_with_cache(self):
        """캐시를 사용한 쿼리 실행 테스트"""
        # 쿼리 실행 (첫 번째 호출)
        query = "SELECT * FROM test_table WHERE cache_test = 1"
        result1 = self.query_manager.execute_query(query, use_cache=True)
        
        # 모의 객체가 호출되었는지 확인
        self.mock_db.query.assert_called_once_with(query)
        self.mock_db.query.reset_mock()
        
        # 동일한 쿼리 실행 (두 번째 호출)
        result2 = self.query_manager.execute_query(query, use_cache=True)
        
        # 모의 객체가 호출되지 않았는지 확인 (캐시에서 조회)
        self.mock_db.query.assert_not_called()
        
        # 두 결과가 동일한지 확인
        pd.testing.assert_frame_equal(result1, result2)
    
    def test_execute_from_file(self):
        """파일에서 쿼리 실행 테스트"""
        # 파일에서 쿼리 실행
        params = {'id': 1}
        result = self.query_manager.execute_from_file(self.temp_query_file, params)
        
        # 모의 객체가 올바른 쿼리와 파라미터로 호출되었는지 확인
        expected_query = "SELECT * FROM test_table WHERE id = :id"
        self.mock_db.query.assert_called_once_with(expected_query, params)
        
        # 결과가 데이터프레임으로 변환되었는지 확인
        self.assertIsInstance(result, pd.DataFrame)
    
    def test_execute_update(self):
        """데이터 변경 쿼리 실행 테스트"""
        # 업데이트 쿼리 실행
        query = "UPDATE test_table SET value = :value WHERE id = :id"
        params = {'id': 1, 'value': 999}
        result = self.query_manager.execute_update(query, params)
        
        # 모의 객체가 올바른 쿼리와 파라미터로 호출되었는지 확인
        self.mock_db.execute.assert_called_once_with(query, params)
        
        # 결과가 영향받은 행 수인지 확인
        self.assertEqual(result, 3)
    
    def test_execute_batch(self):
        """배치 쿼리 실행 테스트"""
        # 배치 쿼리 실행
        query = "INSERT INTO test_table (name, value) VALUES (:name, :value)"
        params_list = [
            {'name': 'User 4', 'value': 400},
            {'name': 'User 5', 'value': 500},
            {'name': 'User 6', 'value': 600}
        ]
        result = self.query_manager.execute_batch(query, params_list)
        
        # 모의 객체가 올바른 쿼리와 파라미터로 호출되었는지 확인
        self.mock_db.execute_batch.assert_called_once_with(query, params_list)
        
        # 결과가 영향받은 행 수인지 확인
        self.assertEqual(result, 3)
    
    def test_clear_cache(self):
        """캐시 삭제 테스트"""
        # 쿼리 실행 및 캐싱
        query1 = "SELECT * FROM test_table WHERE id = 1"
        query2 = "SELECT * FROM test_table WHERE id = 2"
        self.query_manager.execute_query(query1, use_cache=True)
        self.query_manager.execute_query(query2, use_cache=True)
        
        # 캐시 파일 존재 확인
        cache_files = list(Path(self.temp_dir).glob('*.cache'))
        self.assertEqual(len(cache_files), 2)
        
        # 캐시 삭제
        deleted_count = self.query_manager.clear_cache()
        
        # 삭제된 파일 수 확인
        self.assertEqual(deleted_count, 2)
        
        # 캐시 파일이 없는지 확인
        cache_files = list(Path(self.temp_dir).glob('*.cache'))
        self.assertEqual(len(cache_files), 0)
    
    def test_get_performance_stats(self):
        """성능 통계 조회 테스트"""
        # 쿼리 실행하여 성능 로그 생성
        self.query_manager.execute_query("SELECT * FROM users")
        self.query_manager.execute_query("SELECT * FROM items")
        self.query_manager.execute_query("SELECT * FROM users")
        
        # 성능 통계 조회
        stats = self.query_manager.get_performance_stats()
        
        # 통계 결과 확인
        self.assertIsInstance(stats, pd.DataFrame)
        self.assertGreaterEqual(len(stats), 2)  # 최소 2개 쿼리에 대한 통계
        self.assertIn('query', stats.columns)
        self.assertIn('avg_time', stats.columns)
        
        # 특정 쿼리 패턴으로 필터링
        filtered_stats = self.query_manager.get_performance_stats("users")
        self.assertEqual(len(filtered_stats), 1)
        self.assertEqual(filtered_stats.iloc[0]['query'], "SELECT * FROM users")
    
    def test_process_large_results(self):
        """대용량 결과 처리 테스트"""
        # 모의 데이터 설정
        batch1 = [{'id': i, 'value': i * 10} for i in range(1, 11)]  # 10개
        batch2 = [{'id': i, 'value': i * 10} for i in range(11, 16)]  # 5개
        
        # 모의 응답 설정
        self.mock_db.query.side_effect = [batch1, batch2, []]
        
        # 처리 콜백 함수
        processed_batches = []
        def processor(df):
            processed_batches.append(df.copy())
        
        # 대용량 결과 처리
        query = "SELECT * FROM large_table"
        total = self.query_manager.process_large_results(query, batch_size=10, processor=processor)
        
        # 총 처리된 레코드 수 확인
        self.assertEqual(total, 15)
        
        # 처리된 배치 수 확인
        self.assertEqual(len(processed_batches), 2)
        
        # 각 배치의 레코드 수 확인
        self.assertEqual(len(processed_batches[0]), 10)
        self.assertEqual(len(processed_batches[1]), 5)
    
    def test_query_error_handling(self):
        """쿼리 오류 처리 테스트"""
        # 모의 객체가 예외를 발생시키도록 설정
        self.mock_db.query.side_effect = Exception("테스트 오류")
        
        # 쿼리 실행이 예외를 발생시키는지 확인
        with self.assertRaises(QueryError):
            self.query_manager.execute_query("SELECT * FROM test_table")
        
        # 성능 로그에 오류가 기록되었는지 확인
        performance_stats = self.query_manager.get_performance_stats()
        self.assertGreaterEqual(len(performance_stats), 1)
        
        # 로그에 오류 정보가 있는지 확인
        error_logs = [log for log in self.query_manager.performance_log if log['error']]
        self.assertGreaterEqual(len(error_logs), 1)
        self.assertIn('테스트 오류', error_logs[0]['error'])

if __name__ == '__main__':
    unittest.main()
