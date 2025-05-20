"""
CSV 내보내기 예제 스크립트

이 스크립트는 게임 사용자 데이터를 CSV 파일로 내보내는 예제를 제공합니다.
특히 한글 필드명과 값을 영어로 변환하여 인코딩 문제를 방지합니다.
"""

import sys
import os
from pathlib import Path
import pandas as pd
from datetime import datetime

# 프로젝트 루트 디렉토리 추가
project_root = Path(__file__).parent.parent
sys.path.insert(0, str(project_root))

# 환경 변수 로드
from dotenv import load_dotenv
load_dotenv()

from src.database.connection import DatabaseConnection
from src.utils.csv_exporter import CSVExporter

def export_active_high_value_users():
    """활성 고가치 사용자 데이터를 CSV 파일로 내보내기"""
    
    print("활성 고가치 사용자 데이터 내보내기 시작...")
    
    # 데이터베이스 연결
    with DatabaseConnection() as db:
        # 활성 고가치 사용자 조회 (최근 30일 이내 접속, 유효베팅 50,000 이상)
        query = """
        SELECT
            p.id AS '사용자ID',
            p.name AS '이름',
            p.account AS '계정',
            p.status AS '상태',
            p.createdAt AS '가입일',
            MAX(gl.createdAt) AS '마지막게임일',
            DATEDIFF(NOW(), MAX(gl.createdAt)) AS '미접속일수',
            COUNT(DISTINCT DATE(gl.createdAt)) AS '게임일수',
            SUM(gl.validBet) AS '유효베팅',
            SUM(CASE WHEN gl.result > 0 THEN gl.result ELSE 0 END) AS '총승리금액',
            SUM(CASE WHEN gl.result < 0 THEN gl.result ELSE 0 END) AS '총패배금액',
            SUM(gl.result) AS '손익',
            (SELECT COUNT(*) FROM deposits d WHERE d.player = p.id) AS '입금횟수',
            (SELECT SUM(amount) FROM deposits d WHERE d.player = p.id) AS '총입금액'
        FROM
            players p
        JOIN
            game_logs gl ON p.id = gl.player
        WHERE
            gl.createdAt >= DATE_SUB(NOW(), INTERVAL 30 DAY)
        GROUP BY
            p.id
        HAVING
            SUM(gl.validBet) >= 50000
        ORDER BY
            SUM(gl.validBet) DESC
        LIMIT 100
        """
        
        print("데이터베이스 쿼리 실행 중...")
        result = db.query(query)
        print(f"쿼리 결과: {len(result)}개의 행")
        
    if not result:
        print("내보낼 데이터가 없습니다.")
        return
    
    # CSV 내보내기 유틸리티 생성
    exporter = CSVExporter()
    
    # 사용자 정의 필드 매핑 추가
    exporter.add_field_mapping("사용자ID", "user_id")
    exporter.add_field_mapping("미접속일수", "inactive_days")
    exporter.add_field_mapping("총승리금액", "total_win_amount")
    exporter.add_field_mapping("총패배금액", "total_loss_amount")
    exporter.add_field_mapping("손익", "profit_loss")
    exporter.add_field_mapping("총입금액", "total_deposit_amount")
    
    # 내보내기 디렉토리 확인 및 생성
    exports_dir = project_root / "reports" / "exports"
    os.makedirs(exports_dir, exist_ok=True)
    
    # 현재 날짜를 파일명에 포함
    today = datetime.now().strftime("%Y%m%d")
    file_path = exports_dir / f"active_high_value_users_{today}.csv"
    
    # CSV 파일로 내보내기
    print(f"CSV 파일로 내보내는 중: {file_path}")
    exporter.export_query_result_to_csv(result, str(file_path))
    
    print("활성 고가치 사용자 데이터 내보내기 완료!")
    print(f"파일 저장 위치: {file_path}")

def export_dormant_user_reactivation_targets():
    """휴면 사용자 재활성화 대상 데이터를 CSV 파일로 내보내기"""
    
    print("휴면 사용자 재활성화 대상 데이터 내보내기 시작...")
    
    # 데이터베이스 연결
    with DatabaseConnection() as db:
        # 휴면 사용자 중 재활성화 가능성이 높은 사용자 조회
        # (90일 이상 미접속, 과거 유효베팅 100,000 이상, 입금 3회 이상)
        query = """
        SELECT
            p.id AS '사용자ID',
            p.name AS '이름',
            p.account AS '계정',
            p.status AS '상태',
            p.createdAt AS '가입일',
            MAX(gl.createdAt) AS '마지막게임일',
            DATEDIFF(NOW(), MAX(gl.createdAt)) AS '휴면일수',
            COUNT(DISTINCT DATE(gl.createdAt)) AS '게임일수',
            SUM(gl.validBet) AS '유효베팅',
            (SELECT COUNT(*) FROM deposits d WHERE d.player = p.id) AS '입금횟수',
            (SELECT SUM(amount) FROM deposits d WHERE d.player = p.id) AS '총입금액',
            (SELECT MAX(createdAt) FROM deposits d WHERE d.player = p.id) AS '마지막입금일',
            CASE 
                WHEN p.id IN (SELECT player FROM promotion_players WHERE appliedAt IS NOT NULL) 
                THEN '참여' ELSE '미참여' 
            END AS '이전이벤트참여'
        FROM
            players p
        JOIN
            game_logs gl ON p.id = gl.player
        WHERE
            NOT EXISTS (
                SELECT 1 FROM game_logs gl2 
                WHERE gl2.player = p.id AND gl2.createdAt >= DATE_SUB(NOW(), INTERVAL 90 DAY)
            )
        GROUP BY
            p.id
        HAVING
            SUM(gl.validBet) >= 100000 AND
            (SELECT COUNT(*) FROM deposits d WHERE d.player = p.id) >= 3
        ORDER BY
            (SELECT MAX(createdAt) FROM deposits d WHERE d.player = p.id) DESC
        LIMIT 100
        """
        
        print("데이터베이스 쿼리 실행 중...")
        result = db.query(query)
        print(f"쿼리 결과: {len(result)}개의 행")
        
    if not result:
        print("내보낼 데이터가 없습니다.")
        return
    
    # CSV 내보내기 유틸리티 생성
    exporter = CSVExporter()
    
    # 사용자 정의 필드 매핑 추가
    exporter.add_field_mapping("사용자ID", "user_id")
    exporter.add_field_mapping("휴면일수", "dormant_days")
    exporter.add_field_mapping("총입금액", "total_deposit_amount")
    exporter.add_field_mapping("마지막입금일", "last_deposit_date")
    exporter.add_field_mapping("이전이벤트참여", "previous_event_participation")
    
    # 내보내기 디렉토리 확인 및 생성
    exports_dir = project_root / "reports" / "exports"
    os.makedirs(exports_dir, exist_ok=True)
    
    # 현재 날짜를 파일명에 포함
    today = datetime.now().strftime("%Y%m%d")
    file_path = exports_dir / f"dormant_user_reactivation_targets_{today}.csv"
    
    # CSV 파일로 내보내기
    print(f"CSV 파일로 내보내는 중: {file_path}")
    exporter.export_query_result_to_csv(result, str(file_path))
    
    print("휴면 사용자 재활성화 대상 데이터 내보내기 완료!")
    print(f"파일 저장 위치: {file_path}")

def export_event_effectiveness_analysis():
    """이벤트 효과 분석 데이터를 CSV 파일로 내보내기"""
    
    print("이벤트 효과 분석 데이터 내보내기 시작...")
    
    # 데이터베이스 연결
    with DatabaseConnection() as db:
        # 이벤트 지급 후 게임 참여 및 입금 여부 분석
        query = """
        SELECT
            pp.player AS '사용자ID',
            p.name AS '이름',
            p.account AS '계정',
            pp.reward AS '이벤트보상금액',
            pp.appliedAt AS '이벤트지급일',
            CASE
                WHEN EXISTS (
                    SELECT 1 FROM game_logs gl 
                    WHERE gl.player = pp.player AND gl.createdAt > pp.appliedAt
                ) THEN '참여함' ELSE '참여안함'
            END AS '이벤트후게임참여',
            CASE
                WHEN EXISTS (
                    SELECT 1 FROM deposits d 
                    WHERE d.player = pp.player AND d.createdAt > pp.appliedAt
                ) THEN '입금함' ELSE '입금안함'
            END AS '이벤트후입금',
            (
                SELECT COUNT(*) FROM game_logs gl 
                WHERE gl.player = pp.player AND gl.createdAt > pp.appliedAt
            ) AS '이벤트후게임수',
            (
                SELECT COUNT(*) FROM deposits d 
                WHERE d.player = pp.player AND d.createdAt > pp.appliedAt
            ) AS '이벤트후입금횟수',
            (
                SELECT SUM(amount) FROM deposits d 
                WHERE d.player = pp.player AND d.createdAt > pp.appliedAt
            ) AS '이벤트후입금총액',
            DATEDIFF(
                IFNULL(
                    (SELECT MIN(createdAt) FROM game_logs gl WHERE gl.player = pp.player AND gl.createdAt > pp.appliedAt),
                    NOW()
                ),
                pp.appliedAt
            ) AS '이벤트후첫게임까지일수',
            DATEDIFF(
                IFNULL(
                    (SELECT MIN(createdAt) FROM deposits d WHERE d.player = pp.player AND d.createdAt > pp.appliedAt),
                    NOW()
                ),
                pp.appliedAt
            ) AS '이벤트후첫입금까지일수'
        FROM
            promotion_players pp
        JOIN
            players p ON pp.player = p.id
        WHERE
            pp.appliedAt IS NOT NULL
        ORDER BY
            pp.appliedAt DESC
        LIMIT 200
        """
        
        print("데이터베이스 쿼리 실행 중...")
        result = db.query(query)
        print(f"쿼리 결과: {len(result)}개의 행")
        
    if not result:
        print("내보낼 데이터가 없습니다.")
        return
    
    # CSV 내보내기 유틸리티 생성
    exporter = CSVExporter()
    
    # 사용자 정의 필드 매핑 추가
    exporter.add_field_mapping("사용자ID", "user_id")
    exporter.add_field_mapping("이벤트보상금액", "event_reward_amount")
    exporter.add_field_mapping("이벤트지급일", "event_date")
    exporter.add_field_mapping("이벤트후게임참여", "game_participation_after_event")
    exporter.add_field_mapping("이벤트후입금", "deposit_after_event")
    exporter.add_field_mapping("이벤트후게임수", "game_count_after_event")
    exporter.add_field_mapping("이벤트후입금횟수", "deposit_count_after_event")
    exporter.add_field_mapping("이벤트후입금총액", "total_deposit_after_event")
    exporter.add_field_mapping("이벤트후첫게임까지일수", "days_until_first_game")
    exporter.add_field_mapping("이벤트후첫입금까지일수", "days_until_first_deposit")
    
    # 내보내기 디렉토리 확인 및 생성
    exports_dir = project_root / "reports" / "exports"
    os.makedirs(exports_dir, exist_ok=True)
    
    # 현재 날짜를 파일명에 포함
    today = datetime.now().strftime("%Y%m%d")
    file_path = exports_dir / f"event_effectiveness_analysis_{today}.csv"
    
    # CSV 파일로 내보내기
    print(f"CSV 파일로 내보내는 중: {file_path}")
    exporter.export_query_result_to_csv(result, str(file_path))
    
    print("이벤트 효과 분석 데이터 내보내기 완료!")
    print(f"파일 저장 위치: {file_path}")

def main():
    """메인 함수"""
    
    print("=" * 80)
    print("CSV 내보내기 도구")
    print("=" * 80)
    
    print("\n내보내기 유형을 선택하세요:")
    print("1. 활성 고가치 사용자 데이터")
    print("2. 휴면 사용자 재활성화 대상 데이터")
    print("3. 이벤트 효과 분석 데이터")
    print("4. 모든 내보내기 실행")
    
    try:
        choice = input("\n선택 (1-4): ")
        
        if choice == '1':
            export_active_high_value_users()
        elif choice == '2':
            export_dormant_user_reactivation_targets()
        elif choice == '3':
            export_event_effectiveness_analysis()
        elif choice == '4':
            export_active_high_value_users()
            export_dormant_user_reactivation_targets()
            export_event_effectiveness_analysis()
        else:
            print("잘못된 선택입니다.")
    except Exception as e:
        print(f"오류 발생: {e}")
    
    print("\nCSV 내보내기 도구 실행 완료")
    print("=" * 80)

if __name__ == "__main__":
    main()
