"""
고가치 사용자 분석 최종 스크립트

이 스크립트는 7일 이상 게임 기록이 있고 전체 유효배팅의 합이 50,000 이상인 
사용자를 분석합니다. ID와 실제 이름은 결과에 표시하지 않습니다.
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
    query_path = 'queries/user/high_value_users_final.sql'
    with open(query_path, 'r') as file:
        query = file.read()
    
    # 데이터베이스 연결
    print(f"[{datetime.now()}] 데이터베이스에 연결 중...")
    db = DatabaseConnection()
    
    try:
        # 쿼리 실행
        print(f"[{datetime.now()}] 고가치 사용자 쿼리 실행 중...")
        results = db.query(query)
        
        # 결과 확인
        print(f"[{datetime.now()}] 조건을 만족하는 사용자: {len(results)}명")
        
        if results:
            # DataFrame으로 변환
            df = pd.DataFrame(results)
            
            # 활성/휴면 사용자 구분
            df['status'] = df['days_since_last_play'].apply(
                lambda x: '활성' if x <= 30 else '휴면')
            
            # 결과 출력
            print("\n고가치 사용자 정보 (상위 20명):")
            print("=" * 100)
            print(f"{'유저명':15} {'플레이 일수':10} {'총 유효배팅':15} {'마지막 플레이':12} {'경과일수':8} {'상태':5}")
            print("-" * 100)
            
            for i, row in enumerate(results[:20]):
                print(f"{row['username']:15} {row['distinct_play_days']:10} "
                      f"{int(row['total_valid_betting']):15,d} {row['last_play_date'].strftime('%Y-%m-%d'):12} "
                      f"{row['days_since_last_play']:8} "
                      f"{'활성' if row['days_since_last_play'] <= 30 else '휴면':5}")
            
            print("=" * 100)
            
            # 활성/휴면 사용자 통계
            status_counts = df['status'].value_counts()
            print("\n활성/휴면 사용자 분포:")
            for status, count in status_counts.items():
                print(f"- {status} 사용자: {count}명 ({count/len(df)*100:.1f}%)")
            
            # 활성 사용자와 휴면 사용자의 평균 통계 비교
            active_df = df[df['status'] == '활성']
            dormant_df = df[df['status'] == '휴면']
            
            print("\n활성 사용자 vs. 휴면 사용자 평균 통계:")
            print(f"- 활성 사용자 평균 플레이 일수: {active_df['distinct_play_days'].mean():.0f}일")
            print(f"- 휴면 사용자 평균 플레이 일수: {dormant_df['distinct_play_days'].mean():.0f}일")
            print(f"- 활성 사용자 평균 유효배팅: {int(active_df['total_valid_betting'].mean()):,d}")
            print(f"- 휴면 사용자 평균 유효배팅: {int(dormant_df['total_valid_betting'].mean()):,d}")
            
            # 파일로 저장
            output_dir = 'reports/queries'
            os.makedirs(output_dir, exist_ok=True)
            output_path = os.path.join(output_dir, f'high_value_users_final_{datetime.now().strftime("%Y%m%d_%H%M%S")}.csv')
            df.to_csv(output_path, index=False)
            
            print(f"\n사용자 정보가 다음 파일에 저장되었습니다: {output_path}")
            print(f"총 {len(results)}명의 사용자 정보가 저장되었습니다.")
            
            # 유저명만 저장
            usernames_path = os.path.join(output_dir, f'high_value_usernames_final_{datetime.now().strftime("%Y%m%d_%H%M%S")}.txt')
            with open(usernames_path, 'w') as f:
                for row in results:
                    f.write(f"{row['username']}\n")
            
            print(f"유저명 목록이 다음 파일에 저장되었습니다: {usernames_path}")
            
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
