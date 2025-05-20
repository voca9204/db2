"""
활성 고가치 사용자 분석 스크립트

이 스크립트는 7일 이상 게임 기록이 있고 
전체 유효배팅 합이 50,000 이상인 사용자를 식별합니다.
"""

import os
import sys
import pandas as pd
from datetime import datetime

# 상위 디렉토리 추가하여 모듈 import 가능하게 설정
sys.path.insert(0, os.path.abspath(os.path.join(os.path.dirname(__file__), '..')))

from src.database.connection import DatabaseConnection

def main():
    """메인 함수"""
    
    # 쿼리 파일 읽기
    query_path = 'queries/user/active_high_value_users.sql'
    with open(query_path, 'r') as file:
        query = file.read()
    
    # 데이터베이스 연결
    print(f"[{datetime.now()}] 데이터베이스에 연결 중...")
    db = DatabaseConnection()
    
    try:
        # 쿼리 실행
        print(f"[{datetime.now()}] 활성 고가치 사용자 쿼리 실행 중...")
        results = db.query(query)
        
        # 결과 확인
        print(f"[{datetime.now()}] 조건을 만족하는 사용자: {len(results)}명")
        
        if results:
            # DataFrame으로 변환
            df = pd.DataFrame(results)
            
            # 결과 출력
            print("\n활성 고가치 사용자 (상위 20명):")
            print("=" * 80)
            print(df.head(20).to_string(index=False))
            print("=" * 80)
            
            # 요약 통계
            print("\n요약 통계:")
            print(f"- 총 고가치 사용자 수: {len(df)}")
            print(f"- 평균 플레이 일수: {df['distinct_play_days'].mean():.2f}일")
            print(f"- 평균 유효배팅 금액: {df['total_valid_betting'].mean():.2f}")
            print(f"- 최대 유효배팅 금액: {df['total_valid_betting'].max():.2f}")
            print(f"- 최소 유효배팅 금액: {df['total_valid_betting'].min():.2f}")
            
            # CSV 파일로 저장
            output_dir = 'reports/queries'
            os.makedirs(output_dir, exist_ok=True)
            output_path = os.path.join(output_dir, f'active_high_value_users_{datetime.now().strftime("%Y%m%d_%H%M%S")}.csv')
            df.to_csv(output_path, index=False)
            print(f"\n결과가 다음 파일에 저장되었습니다: {output_path}")
            
            return df
        else:
            print("조건을 만족하는 사용자가 없습니다.")
            return None
    
    except Exception as e:
        print(f"오류 발생: {str(e)}")
        return None
    finally:
        # 연결 종료
        if 'db' in locals():
            db.close()

if __name__ == '__main__':
    main()
