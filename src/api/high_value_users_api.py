"""
고가치 사용자 데이터 API

이 모듈은 고가치 사용자 데이터를 데이터베이스에서 가져와 JSON 형식으로 제공하는 API를 구현합니다.
Flask를 사용하여 간단한 웹 서버를 구축합니다.
"""

from flask import Flask, jsonify, request
from flask_cors import CORS
import sys
import os
from pathlib import Path
from datetime import datetime

# 프로젝트 루트 디렉토리 추가
project_root = Path(__file__).parent.parent.parent
sys.path.insert(0, str(project_root))

# .env 파일 로드
from dotenv import load_dotenv
load_dotenv()

from src.database.connection import DatabaseConnection

app = Flask(__name__)
CORS(app)  # CORS 활성화 (다른 도메인에서의 요청 허용)

def calculate_days_since(date_str):
    """마지막 플레이 날짜로부터 현재까지의 경과일 계산"""
    if not date_str:
        return 0
    
    try:
        last_play_date = datetime.strptime(date_str, '%Y-%m-%d')
        days_since = (datetime.now() - last_play_date).days
        return days_since
    except Exception:
        return 0

@app.route('/api/high-value-users', methods=['GET'])
def get_high_value_users():
    """
    고가치 사용자 목록을 페이지네이션하여 JSON 형식으로 반환
    
    쿼리 파라미터:
    - page: 페이지 번호 (1부터 시작, 기본값 1)
    - limit: 페이지당 항목 수 (기본값 10)
    - sort: 정렬 기준 (유효배팅, 플레이일수, 마지막플레이, 경과일수)
    - direction: 정렬 방향 (asc, desc)
    - filter: 상태 필터 (all, active, dormant)
    - search: 사용자명 검색
    """
    page = int(request.args.get('page', 1))
    limit = int(request.args.get('limit', 10))
    sort = request.args.get('sort', 'validBet')
    direction = request.args.get('direction', 'desc')
    status_filter = request.args.get('filter', 'all')
    search = request.args.get('search', '')
    
    offset = (page - 1) * limit
    
    # 정렬 기준 매핑
    sort_column_mapping = {
        'validBet': 'total_valid_bet',
        'playDays': 'play_days',
        'lastPlay': 'last_play_date',
        'daysSince': 'last_play_date'  # 경과일수는 마지막 플레이 날짜를 기준으로 정렬
    }
    
    # 정렬 방향 매핑
    direction_mapping = {
        'asc': 'ASC',
        'desc': 'DESC'
    }
    
    sort_column = sort_column_mapping.get(sort, 'total_valid_bet')
    sort_direction = direction_mapping.get(direction, 'DESC')
    
    # 상태 필터 조건 구성
    status_condition = ""
    if status_filter == 'active':
        status_condition = "AND DATEDIFF(NOW(), last_play_date) <= 30"
    elif status_filter == 'dormant':
        status_condition = "AND DATEDIFF(NOW(), last_play_date) > 30"
    
    # 검색 조건 구성
    search_condition = ""
    if search:
        search_condition = f"AND p.userId LIKE '%{search}%'"
    
    try:
        with DatabaseConnection() as db:
            # 총 레코드 수 조회
            count_query = f"""
            SELECT COUNT(*) as total_count
            FROM (
                SELECT 
                    p.id,
                    p.userId,
                    COUNT(DISTINCT gs.gameDate) AS play_days,
                    SUM(gs.netBet) AS total_valid_bet,
                    MAX(gs.gameDate) AS last_play_date
                FROM players p
                JOIN game_scores gs ON p.userId = gs.userId
                WHERE 1=1 {search_condition}
                GROUP BY p.id
                HAVING COUNT(DISTINCT gs.gameDate) >= 7
                AND SUM(gs.netBet) >= 50000
                {status_condition}
            ) as high_value_users
            """
            
            count_result = db.query_one(count_query)
            total_records = count_result['total_count'] if count_result else 0
            
            # 사용자 데이터 조회 쿼리
            user_query = f"""
            SELECT 
                p.id,
                p.userId AS username,
                COUNT(DISTINCT gs.gameDate) AS play_days,
                SUM(gs.netBet) AS total_valid_bet,
                MAX(gs.gameDate) AS last_play_date
            FROM 
                players p
            JOIN 
                game_scores gs ON p.userId = gs.userId
            WHERE 1=1 {search_condition}
            GROUP BY 
                p.id
            HAVING 
                COUNT(DISTINCT gs.gameDate) >= 7
                AND SUM(gs.netBet) >= 50000
                {status_condition}
            ORDER BY 
                {sort_column} {sort_direction}
            LIMIT {offset}, {limit}
            """
            
            users = db.query(user_query)
            
            # 결과 가공
            formatted_users = []
            for i, user in enumerate(users):
                # 마지막 플레이 날짜 포맷팅
                if 'last_play_date' in user and user['last_play_date']:
                    last_play = user['last_play_date'].strftime('%Y-%m-%d')
                else:
                    last_play = 'N/A'
                
                # 경과일수 계산
                days_since = calculate_days_since(last_play)
                
                # 상태 결정 (30일 기준)
                status = 'active' if days_since <= 30 else 'dormant'
                
                formatted_user = {
                    'index': offset + i + 1,
                    'username': user.get('username', 'Unknown'),
                    'play_days': user.get('play_days', 0),
                    'total_valid_bet': float(user.get('total_valid_bet', 0)),
                    'last_play': last_play,
                    'days_since': days_since,
                    'status': status
                }
                formatted_users.append(formatted_user)
            
            # 페이지네이션 정보
            total_pages = (total_records + limit - 1) // limit  # 올림 나눗셈
            
            response = {
                'users': formatted_users,
                'pagination': {
                    'total': total_records,
                    'page': page,
                    'limit': limit,
                    'total_pages': total_pages
                }
            }
            
            return jsonify(response)
    
    except Exception as e:
        return jsonify({'error': str(e)}), 500

if __name__ == '__main__':
    port = int(os.environ.get('PORT', 5000))
    app.run(host='0.0.0.0', port=port, debug=True)
