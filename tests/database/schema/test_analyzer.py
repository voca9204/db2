"""
데이터베이스 스키마 분석 모듈 테스트
"""

import os
import sys
import unittest
from unittest.mock import MagicMock, patch

# 상위 디렉토리 추가하여 모듈 import 가능하게 설정
sys.path.insert(0, os.path.abspath(os.path.join(os.path.dirname(__file__), '../../..')))

from src.database.schema.analyzer import SchemaAnalyzer, TableStructure

class TestTableStructure(unittest.TestCase):
    """TableStructure 클래스 테스트"""
    
    def test_init(self):
        """초기화 테스트"""
        table = TableStructure("test_table")
        self.assertEqual(table.name, "test_table")
        self.assertEqual(table.fields, [])
        self.assertIsNone(table.primary_key)
        self.assertEqual(table.foreign_keys, [])
        self.assertEqual(table.indexes, [])
        self.assertEqual(table.constraints, [])
    
    def test_add_field(self):
        """필드 추가 테스트"""
        table = TableStructure("test_table")
        field = {"Field": "id", "Type": "int(11)", "Null": "NO", "Key": "PRI", "Default": None, "Extra": "auto_increment"}
        table.add_field(field)
        
        self.assertEqual(len(table.fields), 1)
        self.assertEqual(table.fields[0], field)
        self.assertEqual(table.primary_key, "id")
    
    def test_add_foreign_key(self):
        """외래 키 추가 테스트"""
        table = TableStructure("test_table")
        fk = {"constraint_name": "fk_test", "source_table": "test_table", "source_column": "parent_id", "target_table": "parent", "target_column": "id"}
        table.add_foreign_key(fk)
        
        self.assertEqual(len(table.foreign_keys), 1)
        self.assertEqual(table.foreign_keys[0], fk)
    
    def test_to_dict(self):
        """딕셔너리 변환 테스트"""
        table = TableStructure("test_table")
        table.add_field({"Field": "id", "Type": "int(11)", "Null": "NO", "Key": "PRI", "Default": None, "Extra": "auto_increment"})
        table.add_foreign_key({"constraint_name": "fk_test", "source_table": "test_table", "source_column": "parent_id", "target_table": "parent", "target_column": "id"})
        
        result = table.to_dict()
        self.assertEqual(result["name"], "test_table")
        self.assertEqual(len(result["fields"]), 1)
        self.assertEqual(result["primary_key"], "id")
        self.assertEqual(len(result["foreign_keys"]), 1)

class TestSchemaAnalyzer(unittest.TestCase):
    """SchemaAnalyzer 클래스 테스트"""
    
    def setUp(self):
        """테스트 설정"""
        self.db_mock = MagicMock()
        self.analyzer = SchemaAnalyzer(self.db_mock)
    
    def test_init(self):
        """초기화 테스트"""
        self.assertEqual(self.analyzer.connection, self.db_mock)
        self.assertEqual(self.analyzer.tables, {})
        self.assertEqual(self.analyzer.relationships, [])
    
    @patch('src.database.schema.analyzer.SchemaAnalyzer._get_tables')
    @patch('src.database.schema.analyzer.SchemaAnalyzer.analyze_table')
    @patch('src.database.schema.analyzer.SchemaAnalyzer.identify_relationships')
    def test_analyze_schema(self, mock_identify_relationships, mock_analyze_table, mock_get_tables):
        """스키마 분석 테스트"""
        mock_get_tables.return_value = ["table1", "table2"]
        
        self.analyzer.analyze_schema()
        
        mock_get_tables.assert_called_once()
        self.assertEqual(mock_analyze_table.call_count, 2)
        mock_identify_relationships.assert_called_once()
    
    def test_get_tables(self):
        """테이블 목록 가져오기 테스트"""
        self.db_mock.query.return_value = [
            {"table_name": "table1"},
            {"table_name": "table2"}
        ]
        
        result = self.analyzer._get_tables()
        
        self.db_mock.query.assert_called_once()
        self.assertEqual(result, ["table1", "table2"])
    
    def test_analyze_table(self):
        """테이블 분석 테스트"""
        # 필드 정보 모킹
        self.db_mock.query.side_effect = [
            [  # 필드 정보
                {"Field": "id", "Type": "int(11)", "Null": "NO", "Key": "PRI", "Default": None, "Extra": "auto_increment"},
                {"Field": "name", "Type": "varchar(255)", "Null": "YES", "Key": "", "Default": None, "Extra": ""}
            ],
            [  # 인덱스 정보
                {"index_name": "PRIMARY", "columns": "id", "non_unique": 0}
            ],
            [  # CREATE TABLE 문
                {"Create Table": "CREATE TABLE `table1` (...)"}
            ]
        ]
        
        result = self.analyzer.analyze_table("table1")
        
        self.assertEqual(self.db_mock.query.call_count, 3)
        self.assertEqual(result.name, "table1")
        self.assertEqual(len(result.fields), 2)
        self.assertEqual(result.primary_key, "id")
        self.assertEqual(len(result.indexes), 1)
        self.assertEqual(self.analyzer.tables["table1"], result)
    
    def test_identify_relationships(self):
        """관계 식별 테스트"""
        self.db_mock.query.return_value = [
            {"constraint_name": "fk1", "source_table": "table1", "source_column": "parent_id", "target_table": "parent", "target_column": "id"}
        ]
        
        self.analyzer.tables = {
            "table1": TableStructure("table1")
        }
        
        self.analyzer.identify_relationships()
        
        self.db_mock.query.assert_called_once()
        self.assertEqual(len(self.analyzer.relationships), 1)
        self.assertEqual(len(self.analyzer.tables["table1"].foreign_keys), 1)

if __name__ == '__main__':
    unittest.main()
