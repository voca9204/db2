"""
데이터베이스 스키마 분석 모듈

이 모듈은 데이터베이스 스키마를 분석하고 문서화하는 기능을 제공합니다.
테이블 구조, 필드 타입, 관계 등을 분석하고 시각화할 수 있습니다.
"""

import os
import json
import logging
from typing import Any, Dict, List, Optional, Set, Tuple

from ..mariadb_connection import MariaDBConnection

# 로깅 설정
logger = logging.getLogger(__name__)

class TableStructure:
    """데이터베이스 테이블 구조 클래스"""
    
    def __init__(self, name: str):
        """
        TableStructure 클래스 초기화
        
        Args:
            name (str): 테이블 이름
        """
        self.name = name
        self.fields = []
        self.primary_key = None
        self.foreign_keys = []
        self.indexes = []
        self.constraints = []
    
    def add_field(self, field_info: Dict[str, Any]) -> None:
        """
        필드 정보 추가
        
        Args:
            field_info (Dict[str, Any]): 필드 정보 딕셔너리
        """
        self.fields.append(field_info)
        
        # 기본 키 식별
        if field_info.get('Key') == 'PRI':
            self.primary_key = field_info.get('Field')
    
    def add_foreign_key(self, fk_info: Dict[str, Any]) -> None:
        """
        외래 키 정보 추가
        
        Args:
            fk_info (Dict[str, Any]): 외래 키 정보 딕셔너리
        """
        self.foreign_keys.append(fk_info)
    
    def add_index(self, index_info: Dict[str, Any]) -> None:
        """
        인덱스 정보 추가
        
        Args:
            index_info (Dict[str, Any]): 인덱스 정보 딕셔너리
        """
        self.indexes.append(index_info)
    
    def add_constraint(self, constraint_info: Dict[str, Any]) -> None:
        """
        제약 조건 정보 추가
        
        Args:
            constraint_info (Dict[str, Any]): 제약 조건 정보 딕셔너리
        """
        self.constraints.append(constraint_info)
    
    def to_dict(self) -> Dict[str, Any]:
        """
        TableStructure 객체를 딕셔너리로 변환
        
        Returns:
            Dict[str, Any]: 테이블 구조 딕셔너리
        """
        return {
            'name': self.name,
            'fields': self.fields,
            'primary_key': self.primary_key,
            'foreign_keys': self.foreign_keys,
            'indexes': self.indexes,
            'constraints': self.constraints
        }
    
    def __str__(self) -> str:
        """
        TableStructure 객체를 문자열로 변환
        
        Returns:
            str: 테이블 구조 문자열 표현
        """
        result = f"Table: {self.name}\n"
        result += "Fields:\n"
        
        for field in self.fields:
            result += f"  - {field['Field']} ({field['Type']})"
            if field.get('Key') == 'PRI':
                result += " (PRIMARY KEY)"
            result += "\n"
        
        if self.foreign_keys:
            result += "Foreign Keys:\n"
            for fk in self.foreign_keys:
                result += f"  - {fk['source_column']} -> {fk['target_table']}.{fk['target_column']}\n"
        
        return result


class SchemaAnalyzer:
    """데이터베이스 스키마 분석 클래스"""
    
    def __init__(self, db_connection: MariaDBConnection):
        """
        SchemaAnalyzer 클래스 초기화
        
        Args:
            db_connection (MariaDBConnection): 데이터베이스 연결 객체
        """
        self.connection = db_connection
        self.tables = {}  # 테이블 이름 -> TableStructure 객체 맵핑
        self.relationships = []  # 테이블 간 관계 정보
    
    def analyze_schema(self) -> None:
        """
        전체 데이터베이스 스키마 분석
        """
        logger.info("Starting full schema analysis")
        
        # 테이블 목록 가져오기
        tables = self._get_tables()
        logger.info(f"Found {len(tables)} tables in database")
        
        # 각 테이블 구조 분석
        for table_name in tables:
            self.analyze_table(table_name)
        
        # 테이블 간 관계 분석
        self.identify_relationships()
        
        logger.info(f"Schema analysis completed: {len(self.tables)} tables, {len(self.relationships)} relationships")
    
    def _get_tables(self) -> List[str]:
        """
        데이터베이스의 모든 테이블 목록 가져오기
        
        Returns:
            List[str]: 테이블 이름 목록
        """
        query = """
        SELECT table_name
        FROM information_schema.tables
        WHERE table_schema = DATABASE()
        ORDER BY table_name
        """
        
        result = self.connection.query(query)
        return [row['table_name'] for row in result]
    
    def analyze_table(self, table_name: str) -> TableStructure:
        """
        특정 테이블 구조 분석
        
        Args:
            table_name (str): 분석할 테이블 이름
            
        Returns:
            TableStructure: 분석된 테이블 구조 객체
        """
        logger.info(f"Analyzing table structure: {table_name}")
        
        table = TableStructure(table_name)
        
        # 필드 정보 가져오기
        field_query = """
        SELECT 
            column_name AS 'Field',
            column_type AS 'Type',
            is_nullable AS 'Null',
            column_key AS 'Key',
            column_default AS 'Default',
            extra AS 'Extra'
        FROM information_schema.columns
        WHERE table_schema = DATABASE()
        AND table_name = ?
        ORDER BY ordinal_position
        """
        
        fields = self.connection.query(field_query, (table_name,))
        for field in fields:
            table.add_field(field)
        
        # 인덱스 정보 가져오기
        index_query = """
        SELECT 
            index_name,
            GROUP_CONCAT(column_name ORDER BY seq_in_index) AS columns,
            non_unique
        FROM information_schema.statistics
        WHERE table_schema = DATABASE() 
        AND table_name = ?
        GROUP BY index_name, non_unique
        """
        
        indexes = self.connection.query(index_query, (table_name,))
        for index in indexes:
            table.add_index(index)
        
        # CREATE TABLE 문 가져오기
        create_query = """
        SHOW CREATE TABLE `{0}`
        """.format(table_name)
        
        create_result = self.connection.query(create_query)
        if create_result and len(create_result) > 0 and 'Create Table' in create_result[0]:
            create_statement = create_result[0]['Create Table']
            table.create_statement = create_statement
        
        # 테이블 객체 저장
        self.tables[table_name] = table
        logger.info(f"Table structure analyzed: {table_name} ({len(fields)} fields, {len(indexes)} indexes)")
        
        return table
    
    def identify_relationships(self) -> None:
        """
        테이블 간의 관계 식별 및 문서화
        """
        logger.info("Identifying table relationships")
        
        relationship_query = """
        SELECT 
            tc.constraint_name,
            kcu.table_name AS 'source_table',
            kcu.column_name AS 'source_column',
            kcu.referenced_table_name AS 'target_table',
            kcu.referenced_column_name AS 'target_column'
        FROM information_schema.table_constraints tc
        JOIN information_schema.key_column_usage kcu
            ON tc.constraint_name = kcu.constraint_name
            AND tc.table_schema = kcu.table_schema
        WHERE tc.constraint_type = 'FOREIGN KEY'
        AND tc.table_schema = DATABASE()
        AND kcu.referenced_table_name IS NOT NULL
        ORDER BY tc.table_name, kcu.ordinal_position
        """
        
        relationships = self.connection.query(relationship_query)
        self.relationships = relationships
        
        # 각 테이블의 외래 키 정보 업데이트
        for rel in relationships:
            source_table = rel['source_table']
            if source_table in self.tables:
                self.tables[source_table].add_foreign_key(rel)
        
        logger.info(f"Identified {len(relationships)} relationships between tables")
    
    def generate_documentation(self, output_format: str = 'markdown', output_dir: str = None) -> str:
        """
        스키마 문서 생성
        
        Args:
            output_format (str, optional): 출력 형식 (markdown, html, json). 기본값은 'markdown'.
            output_dir (str, optional): 출력 디렉토리. 지정하면 파일로 저장됨.
            
        Returns:
            str: 생성된 문서 내용
        """
        logger.info(f"Generating schema documentation in {output_format} format")
        
        if not self.tables:
            logger.warning("No tables analyzed yet. Running analyze_schema()")
            self.analyze_schema()
        
        if output_format == 'json':
            return self._generate_json_documentation(output_dir)
        elif output_format == 'html':
            return self._generate_html_documentation(output_dir)
        else:  # markdown
            return self._generate_markdown_documentation(output_dir)
    
    def _generate_markdown_documentation(self, output_dir: Optional[str] = None) -> str:
        """
        마크다운 형식으로 스키마 문서 생성
        
        Args:
            output_dir (str, optional): 출력 디렉토리. 지정하면 파일로 저장됨.
            
        Returns:
            str: 생성된 마크다운 문서 내용
        """
        doc = "# 데이터베이스 스키마 문서\n\n"
        
        # 목차
        doc += "## 목차\n\n"
        doc += "1. [테이블 목록](#테이블-목록)\n"
        doc += "2. [테이블 상세 정보](#테이블-상세-정보)\n"
        doc += "3. [테이블 관계](#테이블-관계)\n\n"
        
        # 테이블 목록
        doc += "## 테이블 목록\n\n"
        doc += "| 테이블 이름 | 설명 | 필드 수 |\n"
        doc += "|------------|------|--------|\n"
        
        for table_name, table in sorted(self.tables.items()):
            doc += f"| {table_name} | | {len(table.fields)} |\n"
        
        # 테이블 상세 정보
        doc += "\n## 테이블 상세 정보\n\n"
        
        for table_name, table in sorted(self.tables.items()):
            doc += f"### {table_name}\n\n"
            
            # 필드 정보
            doc += "#### 필드\n\n"
            doc += "| 필드 이름 | 타입 | NULL 허용 | 키 | 기본값 | 추가 정보 |\n"
            doc += "|-----------|------|-----------|-----|--------|----------|\n"
            
            for field in table.fields:
                null = "YES" if field.get('Null') == "YES" else "NO"
                key = field.get('Key', "")
                default = field.get('Default', "")
                extra = field.get('Extra', "")
                
                doc += f"| {field['Field']} | {field['Type']} | {null} | {key} | {default} | {extra} |\n"
            
            # 외래 키 정보
            if table.foreign_keys:
                doc += "\n#### 외래 키\n\n"
                doc += "| 필드 | 참조 테이블 | 참조 필드 |\n"
                doc += "|------|------------|----------|\n"
                
                for fk in table.foreign_keys:
                    doc += f"| {fk['source_column']} | {fk['target_table']} | {fk['target_column']} |\n"
            
            # 인덱스 정보
            if table.indexes:
                doc += "\n#### 인덱스\n\n"
                doc += "| 인덱스 이름 | 필드 | 유니크 |\n"
                doc += "|------------|------|--------|\n"
                
                for idx in table.indexes:
                    unique = "No" if idx.get('non_unique') == 1 else "Yes"
                    doc += f"| {idx['index_name']} | {idx['columns']} | {unique} |\n"
            
            doc += "\n"
        
        # 테이블 관계
        doc += "## 테이블 관계\n\n"
        doc += "| 소스 테이블 | 소스 필드 | 타겟 테이블 | 타겟 필드 |\n"
        doc += "|------------|-----------|------------|----------|\n"
        
        for rel in self.relationships:
            doc += f"| {rel['source_table']} | {rel['source_column']} | {rel['target_table']} | {rel['target_column']} |\n"
        
        # 파일로 저장
        if output_dir:
            file_path = os.path.join(output_dir, "database_schema.md")
            with open(file_path, 'w') as f:
                f.write(doc)
            logger.info(f"Markdown documentation saved to {file_path}")
        
        return doc
    
    def _generate_html_documentation(self, output_dir: Optional[str] = None) -> str:
        """
        HTML 형식으로 스키마 문서 생성
        
        Args:
            output_dir (str, optional): 출력 디렉토리. 지정하면 파일로 저장됨.
            
        Returns:
            str: 생성된 HTML 문서 내용
        """
        html = """<!DOCTYPE html>
<html>
<head>
    <meta charset="UTF-8">
    <title>데이터베이스 스키마 문서</title>
    <style>
        body { font-family: Arial, sans-serif; margin: 20px; }
        h1 { color: #333; }
        h2 { color: #444; margin-top: 30px; }
        h3 { color: #555; }
        h4 { color: #666; }
        table { border-collapse: collapse; width: 100%; margin-bottom: 20px; }
        th, td { border: 1px solid #ddd; padding: 8px; text-align: left; }
        th { background-color: #f2f2f2; }
        tr:nth-child(even) { background-color: #f9f9f9; }
        .toc { background-color: #f8f8f8; padding: 15px; border-radius: 5px; }
        .table-container { margin-bottom: 30px; }
    </style>
</head>
<body>
    <h1>데이터베이스 스키마 문서</h1>
    
    <div class="toc">
        <h2>목차</h2>
        <ol>
            <li><a href="#table-list">테이블 목록</a></li>
            <li><a href="#table-details">테이블 상세 정보</a></li>
            <li><a href="#table-relationships">테이블 관계</a></li>
        </ol>
    </div>
    
    <h2 id="table-list">테이블 목록</h2>
    <table>
        <tr>
            <th>테이블 이름</th>
            <th>설명</th>
            <th>필드 수</th>
        </tr>
"""
        
        # 테이블 목록
        for table_name, table in sorted(self.tables.items()):
            html += f"""
        <tr>
            <td><a href="#{table_name}">{table_name}</a></td>
            <td></td>
            <td>{len(table.fields)}</td>
        </tr>"""
        
        html += """
    </table>
    
    <h2 id="table-details">테이블 상세 정보</h2>
"""
        
        # 테이블 상세 정보
        for table_name, table in sorted(self.tables.items()):
            html += f"""
    <div class="table-container">
        <h3 id="{table_name}">{table_name}</h3>
        
        <h4>필드</h4>
        <table>
            <tr>
                <th>필드 이름</th>
                <th>타입</th>
                <th>NULL 허용</th>
                <th>키</th>
                <th>기본값</th>
                <th>추가 정보</th>
            </tr>
"""
            
            # 필드 정보
            for field in table.fields:
                null = "YES" if field.get('Null') == "YES" else "NO"
                key = field.get('Key', "")
                default = field.get('Default', "") if field.get('Default') is not None else ""
                extra = field.get('Extra', "")
                
                html += f"""
            <tr>
                <td>{field['Field']}</td>
                <td>{field['Type']}</td>
                <td>{null}</td>
                <td>{key}</td>
                <td>{default}</td>
                <td>{extra}</td>
            </tr>"""
            
            html += """
        </table>
"""
            
            # 외래 키 정보
            if table.foreign_keys:
                html += """
        <h4>외래 키</h4>
        <table>
            <tr>
                <th>필드</th>
                <th>참조 테이블</th>
                <th>참조 필드</th>
            </tr>
"""
                
                for fk in table.foreign_keys:
                    html += f"""
            <tr>
                <td>{fk['source_column']}</td>
                <td>{fk['target_table']}</td>
                <td>{fk['target_column']}</td>
            </tr>"""
                
                html += """
        </table>
"""
            
            # 인덱스 정보
            if table.indexes:
                html += """
        <h4>인덱스</h4>
        <table>
            <tr>
                <th>인덱스 이름</th>
                <th>필드</th>
                <th>유니크</th>
            </tr>
"""
                
                for idx in table.indexes:
                    unique = "No" if idx.get('non_unique') == 1 else "Yes"
                    html += f"""
            <tr>
                <td>{idx['index_name']}</td>
                <td>{idx['columns']}</td>
                <td>{unique}</td>
            </tr>"""
                
                html += """
        </table>
"""
            
            html += """
    </div>
"""
        
        # 테이블 관계
        html += """
    <h2 id="table-relationships">테이블 관계</h2>
    <table>
        <tr>
            <th>소스 테이블</th>
            <th>소스 필드</th>
            <th>타겟 테이블</th>
            <th>타겟 필드</th>
        </tr>
"""
        
        for rel in self.relationships:
            html += f"""
        <tr>
            <td>{rel['source_table']}</td>
            <td>{rel['source_column']}</td>
            <td>{rel['target_table']}</td>
            <td>{rel['target_column']}</td>
        </tr>"""
        
        html += """
    </table>
</body>
</html>
"""
        
        # 파일로 저장
        if output_dir:
            file_path = os.path.join(output_dir, "database_schema.html")
            with open(file_path, 'w') as f:
                f.write(html)
            logger.info(f"HTML documentation saved to {file_path}")
        
        return html
    
    def _generate_json_documentation(self, output_dir: Optional[str] = None) -> str:
        """
        JSON 형식으로 스키마 문서 생성
        
        Args:
            output_dir (str, optional): 출력 디렉토리. 지정하면 파일로 저장됨.
            
        Returns:
            str: 생성된 JSON 문서 내용
        """
        schema_data = {
            'tables': {name: table.to_dict() for name, table in self.tables.items()},
            'relationships': self.relationships
        }
        
        json_str = json.dumps(schema_data, indent=2, ensure_ascii=False)
        
        # 파일로 저장
        if output_dir:
            file_path = os.path.join(output_dir, "database_schema.json")
            with open(file_path, 'w') as f:
                f.write(json_str)
            logger.info(f"JSON documentation saved to {file_path}")
        
        return json_str
    
    def generate_visualization(self, output_dir: str, output_format: str = 'png') -> str:
        """
        스키마 시각화 생성 (ERD 다이어그램)
        
        Args:
            output_dir (str): 출력 디렉토리
            output_format (str, optional): 출력 형식 (png, svg). 기본값은 'png'.
            
        Returns:
            str: 생성된 파일 경로
        """
        try:
            import graphviz
        except ImportError:
            logger.error("Graphviz Python package not installed. Run 'pip install graphviz'")
            return "Graphviz Python package not installed. Run 'pip install graphviz'"
        
        logger.info(f"Generating schema visualization in {output_format} format")
        
        if not self.tables:
            logger.warning("No tables analyzed yet. Running analyze_schema()")
            self.analyze_schema()
        
        # Graphviz 그래프 생성
        dot = graphviz.Digraph(
            name='database_schema',
            comment='Database Schema Visualization',
            format=output_format
        )
        
        dot.attr('graph', rankdir='LR', ratio='fill', size='11.7,8.3')
        dot.attr('node', shape='record', fontname='Arial', fontsize='10')
        dot.attr('edge', fontname='Arial', fontsize='9')
        
        # 테이블 노드 추가
        for table_name, table in self.tables.items():
            # 테이블 레이블 생성 (필드 목록 포함)
            label = f"{{<table>{table_name}|"
            
            for field in table.fields:
                pk_marker = " (PK)" if field.get('Key') == 'PRI' else ""
                label += f"{field['Field']}{pk_marker}: {field['Type']}\\l"
            
            label += "}}"
            
            dot.node(table_name, label=label)
        
        # 관계 엣지 추가
        for rel in self.relationships:
            source_table = rel['source_table']
            target_table = rel['target_table']
            source_column = rel['source_column']
            target_column = rel['target_column']
            
            dot.edge(
                source_table,
                target_table,
                label=f"{source_column} -> {target_column}",
                arrowhead='crow'
            )
        
        # 파일로 저장
        try:
            file_path = os.path.join(output_dir, "database_schema")
            dot.render(filename=file_path, cleanup=True)
            logger.info(f"Visualization saved to {file_path}.{output_format}")
            return f"{file_path}.{output_format}"
        except Exception as e:
            logger.error(f"Failed to generate visualization: {str(e)}")
            return f"Error: {str(e)}"
