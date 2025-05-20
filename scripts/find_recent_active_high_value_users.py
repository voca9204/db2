"""
최근 활성 상태의 고가치 사용자 식별 스크립트

이 스크립트는 7일 이상 게임 기록이 있고 유효배팅이 50,000 이상이며
최근 30일 이내에 활동이 있는 활성 상태의 고가치 사용자를 식별합니다.
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
    query_path = 'queries/user/recent_active_high_value_users.sql'
    with open(query_path, 'r') as file:
        query = file.read()
    
    # 데이터베이스 연결
    print(f"[{datetime.now()}] 데이터베이스에 연결 중...")
    db = DatabaseConnection()
    
    try:
        # 쿼리 실행
        print(f"[{datetime.now()}] 최근 활성 상태의 고가치 사용자 쿼리 실행 중...")
        results = db.query(query)
        
        # 결과 확인
        print(f"[{datetime.now()}] 최근 활성 상태의 고가치 사용자: {len(results)}명")
        
        if results:
            # DataFrame으로 변환
            df = pd.DataFrame(results)
            
            # 결과 출력
            print("\n최근 활성 상태의 고가치 사용자 (상위 20명):")
            print("=" * 100)
            print(df.head(20).to_string(index=False))
            print("=" * 100)
            
            # 요약 통계
            print("\n요약 통계:")
            print(f"- 총 최근 활성 고가치 사용자 수: {len(df)}")
            print(f"- 평균 플레이 일수: {df['distinct_play_days'].mean():.2f}일")
            print(f"- 평균 유효배팅 금액: {df['total_valid_betting'].mean():.2f}")
            print(f"- 평균 최근 활동 일수: {df['days_since_last_play'].mean():.2f}일")
            
            # 활동 기간별 분포
            bins = [-1, 7, 14, 21, 30]
            labels = ['최근 7일 이내', '8-14일', '15-21일', '22-30일']
            df['activity_period'] = pd.cut(df['days_since_last_play'], bins=bins, labels=labels)
            activity_counts = df['activity_period'].value_counts().sort_index()
            
            print("\n최근 활동 기간별 사용자 수:")
            for period, count in activity_counts.items():
                print(f"- {period}: {count}명 ({count/len(df)*100:.1f}%)")
            
            # 입금 내역 확인을 위한 추가 쿼리
            player_ids = ",".join([str(row["player_id"]) for row in results])
            deposit_query = f"""
            SELECT 
                player,
                COUNT(*) AS deposit_count,
                SUM(amount) AS total_deposit,
                MAX(createdAt) AS last_deposit_date
            FROM 
                money_flows
            WHERE 
                player IN ({player_ids})
                AND type = 0
                AND createdAt >= DATE_SUB(NOW(), INTERVAL 30 DAY)
            GROUP BY 
                player
            """
            
            print(f"\n[{datetime.now()}] 최근 활성 고가치 사용자의 입금 내역 조회 중...")
            deposit_results = db.query(deposit_query)
            
            if deposit_results:
                deposit_df = pd.DataFrame(deposit_results)
                deposit_count = len(deposit_df)
                deposit_ratio = deposit_count / len(df) * 100
                
                print(f"\n최근 30일 내 입금한 활성 고가치 사용자: {deposit_count}명 ({deposit_ratio:.1f}%)")
                print(f"평균 입금 횟수: {deposit_df['deposit_count'].mean():.2f}회")
                print(f"평균 입금 금액: {deposit_df['total_deposit'].mean():.2f}")
            else:
                print("\n최근 30일 내 입금한 활성 고가치 사용자가 없습니다.")
            
            # CSV 파일로 저장
            output_dir = 'reports/queries'
            os.makedirs(output_dir, exist_ok=True)
            output_path = os.path.join(output_dir, f'recent_active_high_value_users_{datetime.now().strftime("%Y%m%d_%H%M%S")}.csv')
            df.to_csv(output_path, index=False)
            print(f"\n결과가 다음 파일에 저장되었습니다: {output_path}")
            
            return df
        else:
            print("최근 활성 상태의 고가치 사용자가 없습니다.")
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
