"""
고가치 사용자의 유저명만 추출하는 스크립트

이 스크립트는 7일 이상 게임 기록이 있고 전체 유효배팅의 합이 50,000 이상인 
사용자의 유저명(userId)만 추출합니다.
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
    query_path = 'queries/user/high_value_usernames.sql'
    with open(query_path, 'r') as file:
        query = file.read()
    
    # 데이터베이스 연결
    print(f"[{datetime.now()}] 데이터베이스에 연결 중...")
    db = DatabaseConnection()
    
    try:
        # 쿼리 실행
        print(f"[{datetime.now()}] 고가치 사용자 유저명 쿼리 실행 중...")
        results = db.query(query)
        
        # 결과 확인
        print(f"[{datetime.now()}] 조건을 만족하는 사용자: {len(results)}명")
        
        if results:
            # DataFrame으로 변환
            df = pd.DataFrame(results)
            
            # 유저명만 추출하여 저장
            usernames = df['username'].tolist()
            
            # 결과 출력
            print("\n고가치 사용자 유저명 (상위 20개):")
            print("=" * 40)
            for i, username in enumerate(usernames[:20], 1):
                print(f"{i:3}. {username}")
            print("=" * 40)
            
            # 파일로 저장
            output_dir = 'reports/queries'
            os.makedirs(output_dir, exist_ok=True)
            output_path = os.path.join(output_dir, f'high_value_usernames_{datetime.now().strftime("%Y%m%d_%H%M%S")}.txt')
            
            with open(output_path, 'w') as f:
                for username in usernames:
                    f.write(f"{username}\n")
            
            print(f"\n유저명 목록이 다음 파일에 저장되었습니다: {output_path}")
            print(f"총 {len(usernames)}개의 유저명이 저장되었습니다.")
            
            # 세부 정보를 CSV로도 저장
            csv_path = os.path.join(output_dir, f'high_value_users_details_{datetime.now().strftime("%Y%m%d_%H%M%S")}.csv')
            df.to_csv(csv_path, index=False)
            print(f"상세 정보는 다음 파일에 저장되었습니다: {csv_path}")
            
            return usernames
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
