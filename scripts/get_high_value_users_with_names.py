"""
고가치 사용자의 유저명과 실제 이름을 함께 조회하는 스크립트

이 스크립트는 7일 이상 게임 기록이 있고 전체 유효배팅의 합이 50,000 이상인 
사용자의 유저명(userId)과 실제 이름(name)을 함께 조회합니다.
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
    
    # 데이터베이스 연결
    print(f"[{datetime.now()}] 데이터베이스에 연결 중...")
    db = DatabaseConnection()
    
    try:
        # 쿼리 실행
        print(f"[{datetime.now()}] 고가치 사용자 유저명과 실제 이름 조회 중...")
        
        query = """
        WITH high_value_users AS (
            SELECT 
                pl.userId AS username,
                COUNT(DISTINCT gs.gameDate) AS distinct_play_days,
                SUM(gs.netBet) AS total_valid_betting
            FROM 
                players pl
            JOIN 
                game_scores gs ON pl.userId = gs.userId
            WHERE 
                gs.netBet > 0
            GROUP BY 
                pl.userId
            HAVING 
                COUNT(DISTINCT gs.gameDate) >= 7
                AND SUM(gs.netBet) >= 50000
        )
        SELECT 
            h.username AS userId,
            p.name,
            h.distinct_play_days,
            h.total_valid_betting
        FROM 
            high_value_users h
        JOIN 
            players p ON h.username = p.userId
        ORDER BY 
            h.total_valid_betting DESC;
        """
        
        results = db.query(query)
        
        # 결과 확인
        print(f"[{datetime.now()}] 조회된 사용자: {len(results)}명")
        
        if results:
            # DataFrame으로 변환
            df = pd.DataFrame(results)
            
            # 결과 출력
            print("\n고가치 사용자 정보 (상위 20명):")
            print("=" * 120)
            print(f"{'유저명(userId)':15} {'이름(name)':25} {'플레이 일수':10} {'총 유효배팅':20}")
            print("-" * 120)
            
            for i, row in enumerate(results[:20]):
                print(f"{row['userId']:15} {row['name']:25} {row['distinct_play_days']:10} {row['total_valid_betting']:,.2f}")
            
            print("=" * 120)
            
            # 파일로 저장
            output_dir = 'reports/queries'
            os.makedirs(output_dir, exist_ok=True)
            output_path = os.path.join(output_dir, f'high_value_users_with_names_{datetime.now().strftime("%Y%m%d_%H%M%S")}.csv')
            df.to_csv(output_path, index=False)
            
            print(f"\n사용자 정보가 다음 파일에 저장되었습니다: {output_path}")
            print(f"총 {len(results)}명의 사용자 정보가 저장되었습니다.")
            
            return results
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
