"""
데이터베이스 스키마 분석 실행 스크립트

이 스크립트는 데이터베이스 스키마를 분석하고 문서화합니다.
"""

import os
import sys
import logging
import argparse
from datetime import datetime

# 상위 디렉토리 추가하여 모듈 import 가능하게 설정
sys.path.insert(0, os.path.abspath(os.path.join(os.path.dirname(__file__), '..')))

from src.database.mariadb_connection import MariaDBConnection
from src.database.schema.analyzer import SchemaAnalyzer

# 로깅 설정
logging.basicConfig(
    level=logging.INFO,
    format='%(asctime)s - %(name)s - %(levelname)s - %(message)s',
    handlers=[
        logging.StreamHandler(),
        logging.FileHandler('schema_analysis.log')
    ]
)

logger = logging.getLogger(__name__)

def main():
    """
    메인 함수
    """
    parser = argparse.ArgumentParser(description='Analyze database schema and generate documentation')
    parser.add_argument('--format', choices=['markdown', 'html', 'json'], default='markdown',
                       help='Output format for documentation (default: markdown)')
    parser.add_argument('--output-dir', default='docs/database',
                       help='Output directory for documentation (default: docs/database)')
    parser.add_argument('--visualize', action='store_true',
                       help='Generate schema visualization (requires graphviz)')
    parser.add_argument('--viz-format', choices=['png', 'svg'], default='png',
                       help='Format for visualization (default: png)')
    
    args = parser.parse_args()
    
    # 출력 디렉토리 생성
    os.makedirs(args.output_dir, exist_ok=True)
    
    try:
        timestamp = datetime.now().strftime('%Y%m%d_%H%M%S')
        
        # 데이터베이스 연결
        logger.info("Connecting to database")
        db = MariaDBConnection()
        
        # 스키마 분석
        logger.info("Starting schema analysis")
        analyzer = SchemaAnalyzer(db)
        analyzer.analyze_schema()
        
        # 문서 생성
        logger.info(f"Generating documentation in {args.format} format")
        doc_path = os.path.join(args.output_dir, f"schema_{timestamp}.{args.format}")
        
        if args.format == 'markdown':
            doc = analyzer.generate_documentation('markdown', args.output_dir)
        elif args.format == 'html':
            doc = analyzer.generate_documentation('html', args.output_dir)
        elif args.format == 'json':
            doc = analyzer.generate_documentation('json', args.output_dir)
        
        # 시각화
        if args.visualize:
            logger.info(f"Generating visualization in {args.viz_format} format")
            viz_path = analyzer.generate_visualization(args.output_dir, args.viz_format)
            logger.info(f"Visualization saved to {viz_path}")
        
        logger.info("Schema analysis completed successfully")
        
    except Exception as e:
        logger.error(f"Error during schema analysis: {str(e)}")
        sys.exit(1)

if __name__ == '__main__':
    main()
