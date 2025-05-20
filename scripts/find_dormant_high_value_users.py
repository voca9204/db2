"""
휴면 상태의 고가치 사용자 식별 스크립트

이 스크립트는 7일 이상 게임 기록이 있고 유효배팅이 50,000 이상이지만
최근 30일 동안 활동이 없는 휴면 상태의 고가치 사용자를 식별합니다.
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
    query_path = 'queries/user/dormant_high_value_users.sql'
    with open(query_path, 'r') as file:
        query = file.read()
    
    # 데이터베이스 연결
    print(f"[{datetime.now()}] 데이터베이스에 연결 중...")
    db = DatabaseConnection()
    
    try:
        # 쿼리 실행
        print(f"[{datetime.now()}] 휴면 상태의 고가치 사용자 쿼리 실행 중...")
        results = db.query(query)
        
        # 결과 확인
        print(f"[{datetime.now()}] 휴면 상태의 고가치 사용자: {len(results)}명")
        
        if results:
            # DataFrame으로 변환
            df = pd.DataFrame(results)
            
            # 결과 출력
            print("\n휴면 상태의 고가치 사용자 (상위 20명):")
            print("=" * 100)
            print(df.head(20).to_string(index=False))
            print("=" * 100)
            
            # 요약 통계
            print("\n요약 통계:")
            print(f"- 총 휴면 고가치 사용자 수: {len(df)}")
            print(f"- 평균 플레이 일수: {df['distinct_play_days'].mean():.2f}일")
            print(f"- 평균 유효배팅 금액: {df['total_valid_betting'].mean():.2f}")
            print(f"- 평균 휴면 기간: {df['days_since_last_play'].mean():.2f}일")
            print(f"- 최장 휴면 기간: {df['days_since_last_play'].max()}일")
            
            # 휴면 기간별 분포
            bins = [30, 60, 90, 180, 365, float('inf')]
            labels = ['31-60일', '61-90일', '91-180일', '181-365일', '365일 이상']
            df['dormant_period'] = pd.cut(df['days_since_last_play'], bins=bins, labels=labels)
            dormant_counts = df['dormant_period'].value_counts().sort_index()
            
            print("\n휴면 기간별 사용자 수:")
            for period, count in dormant_counts.items():
                print(f"- {period}: {count}명 ({count/len(df)*100:.1f}%)")
            
            # CSV 파일로 저장
            output_dir = 'reports/queries'
            os.makedirs(output_dir, exist_ok=True)
            output_path = os.path.join(output_dir, f'dormant_high_value_users_{datetime.now().strftime("%Y%m%d_%H%M%S")}.csv')
            df.to_csv(output_path, index=False)
            print(f"\n결과가 다음 파일에 저장되었습니다: {output_path}")
            
            return df
        else:
            print("휴면 상태의 고가치 사용자가 없습니다.")
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
