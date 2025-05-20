"""
이벤트 효과 분석 API

이 모듈은 이벤트가 휴면 사용자의 활성화 및 입금에 미치는 영향을 분석하여 
JSON 형식으로 제공하는 API를 구현합니다.
"""

from flask import Flask, jsonify, request
from flask_cors import CORS
import sys
import os
from pathlib import Path
from datetime import datetime, timedelta
import logging

# 프로젝트 루트 디렉토리 추가
project_root = Path(__file__).parent.parent.parent
sys.path.insert(0, str(project_root))

# .env 파일 로드
from dotenv import load_dotenv
load_dotenv()

from src.database.mariadb_connection import MariaDBConnection

# 로깅 설정
logging.basicConfig(
    level=logging.INFO,
    format='%(asctime)s - %(name)s - %(levelname)s - %(message)s'
)
logger = logging.getLogger(__name__)

app = Flask(__name__)
CORS(app)  # CORS 활성화 (다른 도메인에서의 요청 허용)

# 날짜 계산 함수
def calculate_date_diff(date_str1, date_str2):
    """두 날짜 사이의 일수 차이 계산"""
    if not date_str1 or not date_str2:
        return 0
    
    try:
        date1 = datetime.strptime(date_str1, '%Y-%m-%d')
        date2 = datetime.strptime(date_str2, '%Y-%m-%d')
        return abs((date2 - date1).days)
    except Exception as e:
        logger.error(f"날짜 계산 오류: {e}")
        return 0

@app.route('/api/event-effect', methods=['GET'])
def get_event_effect():
    """
    이벤트가 미치는 효과 데이터를 JSON 형식으로 반환
    
    쿼리 파라미터:
    - event_id: 특정 이벤트 ID (선택적)
    - days: 이벤트 후 분석할 일수 (기본값 30)
    - player_status: 사용자 상태 필터 (all, active, dormant)
    """
    event_id = request.args.get('event_id')
    days_after = int(request.args.get('days', 30))
    player_status = request.args.get('player_status', 'all')
    
    try:
        with MariaDBConnection() as db:
            # 기본 쿼리 - 이벤트를 받은 사용자 및 지급 정보
            base_query = """
            SELECT 
                e.id AS event_id,
                e.name AS event_name,
                er.player_id,
                p.account AS player_account,
                er.reward_amount,
                er.applied_at AS event_date,
                MAX(CASE WHEN g.played_at > er.applied_at THEN 1 ELSE 0 END) AS has_played_after,
                MIN(CASE WHEN g.played_at > er.applied_at THEN g.played_at ELSE NULL END) AS first_play_after,
                COUNT(DISTINCT CASE WHEN g.played_at > er.applied_at AND g.played_at <= DATE_ADD(er.applied_at, INTERVAL %s DAY) THEN DATE(g.played_at) ELSE NULL END) AS play_days_after,
                SUM(CASE WHEN g.played_at > er.applied_at AND g.played_at <= DATE_ADD(er.applied_at, INTERVAL %s DAY) THEN g.net_bet ELSE 0 END) AS net_bet_after,
                MAX(CASE WHEN d.deposit_date > er.applied_at THEN 1 ELSE 0 END) AS has_deposit_after,
                MIN(CASE WHEN d.deposit_date > er.applied_at THEN d.deposit_date ELSE NULL END) AS first_deposit_after,
                COUNT(DISTINCT CASE WHEN d.deposit_date > er.applied_at AND d.deposit_date <= DATE_ADD(er.applied_at, INTERVAL %s DAY) THEN d.deposit_date ELSE NULL END) AS deposit_count_after,
                SUM(CASE WHEN d.deposit_date > er.applied_at AND d.deposit_date <= DATE_ADD(er.applied_at, INTERVAL %s DAY) THEN d.amount ELSE 0 END) AS deposit_amount_after,
                DATEDIFF(MAX(g.played_at), er.applied_at) AS days_active_after
            FROM 
                event_rewards er
            JOIN 
                events e ON er.event_id = e.id
            JOIN 
                players p ON er.player_id = p.id
            LEFT JOIN 
                game_logs g ON er.player_id = g.player
            LEFT JOIN 
                deposits d ON er.player_id = d.player_id
            """
            
            # 이벤트 ID 필터 추가
            where_conditions = ["er.applied_at IS NOT NULL"]  # 실제 지급된 이벤트만 포함
            query_params = [days_after, days_after, days_after, days_after]
            
            if event_id:
                where_conditions.append("e.id = %s")
                query_params.append(event_id)
            
            # 사용자 상태 필터 추가
            if player_status == 'active':
                where_conditions.append("DATEDIFF(NOW(), MAX(g.played_at)) <= 30")
            elif player_status == 'dormant':
                where_conditions.append("DATEDIFF(NOW(), MAX(g.played_at)) > 30")
            
            # 조건절 조합
            if where_conditions:
                base_query += " WHERE " + " AND ".join(where_conditions)
            
            # 그룹화 및 정렬
            base_query += """
            GROUP BY 
                e.id, er.player_id, er.applied_at
            ORDER BY 
                er.applied_at DESC
            """
            
            # 쿼리 실행
            results = db.query(base_query, tuple(query_params))
            
            # 이벤트별 집계 데이터
            event_summary = {}
            all_players = []
            
            for result in results:
                event_id = result['event_id']
                event_name = result['event_name']
                
                # 플레이어 데이터 가공
                player_data = {
                    'player_id': result['player_id'],
                    'player_account': result['player_account'],
                    'reward_amount': float(result['reward_amount']),
                    'event_date': result['event_date'].strftime('%Y-%m-%d') if result['event_date'] else None,
                    'has_played_after': bool(result['has_played_after']),
                    'first_play_after': result['first_play_after'].strftime('%Y-%m-%d') if result['first_play_after'] else None,
                    'play_days_after': result['play_days_after'],
                    'net_bet_after': float(result['net_bet_after']),
                    'has_deposit_after': bool(result['has_deposit_after']),
                    'first_deposit_after': result['first_deposit_after'].strftime('%Y-%m-%d') if result['first_deposit_after'] else None,
                    'deposit_count_after': result['deposit_count_after'],
                    'deposit_amount_after': float(result['deposit_amount_after']),
                    'days_active_after': result['days_active_after'] or 0,
                    'days_to_first_play': calculate_date_diff(
                        result['event_date'].strftime('%Y-%m-%d') if result['event_date'] else None,
                        result['first_play_after'].strftime('%Y-%m-%d') if result['first_play_after'] else None
                    ),
                    'days_to_first_deposit': calculate_date_diff(
                        result['event_date'].strftime('%Y-%m-%d') if result['event_date'] else None,
                        result['first_deposit_after'].strftime('%Y-%m-%d') if result['first_deposit_after'] else None
                    )
                }
                all_players.append(player_data)
                
                # 이벤트별 집계에 추가
                if event_id not in event_summary:
                    event_summary[event_id] = {
                        'event_id': event_id,
                        'event_name': event_name,
                        'total_rewards': 0,
                        'total_players': 0,
                        'players_played': 0,
                        'players_deposited': 0,
                        'total_play_days': 0,
                        'total_net_bet': 0,
                        'total_deposits': 0,
                        'total_deposit_amount': 0,
                        'avg_days_to_play': 0,
                        'avg_days_to_deposit': 0,
                        'retention_rate': 0,
                        'deposit_conversion_rate': 0,
                        'roi': 0,
                        'player_data': []
                    }
                
                event_data = event_summary[event_id]
                event_data['total_rewards'] += float(result['reward_amount'])
                event_data['total_players'] += 1
                event_data['players_played'] += 1 if result['has_played_after'] else 0
                event_data['players_deposited'] += 1 if result['has_deposit_after'] else 0
                event_data['total_play_days'] += result['play_days_after']
                event_data['total_net_bet'] += float(result['net_bet_after'])
                event_data['total_deposits'] += result['deposit_count_after']
                event_data['total_deposit_amount'] += float(result['deposit_amount_after'])
                
                if result['has_played_after'] and player_data['days_to_first_play'] > 0:
                    event_data['avg_days_to_play'] += player_data['days_to_first_play']
                
                if result['has_deposit_after'] and player_data['days_to_first_deposit'] > 0:
                    event_data['avg_days_to_deposit'] += player_data['days_to_first_deposit']
                
                # 개별 플레이어 데이터 추가
                event_data['player_data'].append(player_data)
            
            # 평균 및 비율 계산
            events_list = []
            for event_id, event_data in event_summary.items():
                if event_data['players_played'] > 0:
                    event_data['avg_days_to_play'] = round(event_data['avg_days_to_play'] / event_data['players_played'], 1)
                
                if event_data['players_deposited'] > 0:
                    event_data['avg_days_to_deposit'] = round(event_data['avg_days_to_deposit'] / event_data['players_deposited'], 1)
                
                if event_data['total_players'] > 0:
                    event_data['retention_rate'] = round(event_data['players_played'] / event_data['total_players'] * 100, 1)
                    event_data['deposit_conversion_rate'] = round(event_data['players_deposited'] / event_data['total_players'] * 100, 1)
                
                if event_data['total_rewards'] > 0:
                    event_data['roi'] = round((event_data['total_deposit_amount'] - event_data['total_rewards']) / event_data['total_rewards'] * 100, 1)
                
                events_list.append(event_data)
            
            # 전체 이벤트 분석 요약
            overall_summary = {
                'total_event_count': len(event_summary),
                'total_players_rewarded': sum(e['total_players'] for e in events_list),
                'total_reward_amount': sum(e['total_rewards'] for e in events_list),
                'total_players_played': sum(e['players_played'] for e in events_list),
                'total_players_deposited': sum(e['players_deposited'] for e in events_list),
                'total_net_bet': sum(e['total_net_bet'] for e in events_list),
                'total_deposit_amount': sum(e['total_deposit_amount'] for e in events_list),
                'overall_retention_rate': 0,
                'overall_deposit_conversion_rate': 0,
                'overall_roi': 0
            }
            
            if overall_summary['total_players_rewarded'] > 0:
                overall_summary['overall_retention_rate'] = round(overall_summary['total_players_played'] / overall_summary['total_players_rewarded'] * 100, 1)
                overall_summary['overall_deposit_conversion_rate'] = round(overall_summary['total_players_deposited'] / overall_summary['total_players_rewarded'] * 100, 1)
            
            if overall_summary['total_reward_amount'] > 0:
                overall_summary['overall_roi'] = round((overall_summary['total_deposit_amount'] - overall_summary['total_reward_amount']) / overall_summary['total_reward_amount'] * 100, 1)
            
            response = {
                'overall_summary': overall_summary,
                'events': events_list,
                'query_params': {
                    'event_id': event_id,
                    'days_after': days_after,
                    'player_status': player_status
                }
            }
            
            return jsonify(response)
    
    except Exception as e:
        logger.error(f"이벤트 효과 분석 API 오류: {e}")
        return jsonify({'error': str(e)}), 500

@app.route('/api/event-list', methods=['GET'])
def get_event_list():
    """
    이벤트 목록을 JSON 형식으로 반환
    """
    try:
        with MariaDBConnection() as db:
            # 이벤트 목록 쿼리
            query = """
            SELECT 
                e.id,
                e.name,
                e.start_date,
                e.end_date,
                COUNT(DISTINCT er.player_id) AS rewarded_players,
                SUM(er.reward_amount) AS total_rewards
            FROM 
                events e
            LEFT JOIN 
                event_rewards er ON e.id = er.event_id
            GROUP BY 
                e.id
            ORDER BY 
                e.start_date DESC
            """
            
            results = db.query(query)
            
            # 결과 가공
            events = []
            for result in results:
                event = {
                    'id': result['id'],
                    'name': result['name'],
                    'start_date': result['start_date'].strftime('%Y-%m-%d') if result['start_date'] else None,
                    'end_date': result['end_date'].strftime('%Y-%m-%d') if result['end_date'] else None,
                    'rewarded_players': result['rewarded_players'],
                    'total_rewards': float(result['total_rewards']) if result['total_rewards'] else 0
                }
                events.append(event)
            
            return jsonify({'events': events})
    
    except Exception as e:
        logger.error(f"이벤트 목록 API 오류: {e}")
        return jsonify({'error': str(e)}), 500

@app.route('/api/dormant-segment-stats', methods=['GET'])
def get_dormant_segment_stats():
    """
    휴면 사용자 세그먼트별 통계 데이터를 JSON 형식으로 반환
    """
    try:
        with MariaDBConnection() as db:
            # 휴면 기간별 사용자 통계 쿼리
            query = """
            SELECT 
                CASE 
                    WHEN days_inactive BETWEEN 31 AND 60 THEN '31-60일'
                    WHEN days_inactive BETWEEN 61 AND 90 THEN '61-90일'
                    WHEN days_inactive BETWEEN 91 AND 180 THEN '91-180일'
                    WHEN days_inactive BETWEEN 181 AND 365 THEN '181-365일'
                    WHEN days_inactive > 365 THEN '365일 이상'
                    ELSE '기타'
                END AS dormant_segment,
                COUNT(*) AS user_count,
                AVG(play_days) AS avg_play_days,
                AVG(total_valid_bet) AS avg_valid_bet,
                AVG(total_deposits) AS avg_deposits,
                AVG(deposit_amount) AS avg_deposit_amount,
                COUNT(CASE WHEN has_event_reward = 1 THEN 1 END) AS users_with_event,
                COUNT(CASE WHEN has_event_reward = 1 AND has_played_after = 1 THEN 1 END) AS users_played_after_event,
                COUNT(CASE WHEN has_event_reward = 1 AND has_deposit_after = 1 THEN 1 END) AS users_deposited_after_event
            FROM (
                SELECT 
                    p.id,
                    DATEDIFF(NOW(), MAX(g.played_at)) AS days_inactive,
                    COUNT(DISTINCT DATE(g.played_at)) AS play_days,
                    SUM(g.net_bet) AS total_valid_bet,
                    COUNT(DISTINCT d.id) AS total_deposits,
                    SUM(d.amount) AS deposit_amount,
                    MAX(CASE WHEN er.id IS NOT NULL THEN 1 ELSE 0 END) AS has_event_reward,
                    MAX(CASE WHEN er.applied_at < g.played_at THEN 1 ELSE 0 END) AS has_played_after,
                    MAX(CASE WHEN er.applied_at < d.deposit_date THEN 1 ELSE 0 END) AS has_deposit_after
                FROM 
                    players p
                LEFT JOIN 
                    game_logs g ON p.id = g.player
                LEFT JOIN 
                    deposits d ON p.id = d.player_id
                LEFT JOIN 
                    event_rewards er ON p.id = er.player_id
                GROUP BY 
                    p.id
                HAVING 
                    days_inactive > 30
                    AND play_days >= 7
                    AND total_valid_bet >= 50000
            ) AS dormant_users
            GROUP BY 
                dormant_segment
            ORDER BY 
                CASE 
                    WHEN dormant_segment = '31-60일' THEN 1
                    WHEN dormant_segment = '61-90일' THEN 2
                    WHEN dormant_segment = '91-180일' THEN 3
                    WHEN dormant_segment = '181-365일' THEN 4
                    WHEN dormant_segment = '365일 이상' THEN 5
                    ELSE 6
                END
            """
            
            results = db.query(query)
            
            # 결과 가공
            segments = []
            for result in results:
                segment = {
                    'segment': result['dormant_segment'],
                    'user_count': result['user_count'],
                    'avg_play_days': round(float(result['avg_play_days']), 1) if result['avg_play_days'] else 0,
                    'avg_valid_bet': round(float(result['avg_valid_bet']), 2) if result['avg_valid_bet'] else 0,
                    'avg_deposits': round(float(result['avg_deposits']), 1) if result['avg_deposits'] else 0,
                    'avg_deposit_amount': round(float(result['avg_deposit_amount']), 2) if result['avg_deposit_amount'] else 0,
                    'users_with_event': result['users_with_event'],
                    'users_played_after_event': result['users_played_after_event'],
                    'users_deposited_after_event': result['users_deposited_after_event'],
                    'activation_rate': round(result['users_played_after_event'] / result['users_with_event'] * 100, 1) if result['users_with_event'] > 0 else 0,
                    'deposit_rate': round(result['users_deposited_after_event'] / result['users_with_event'] * 100, 1) if result['users_with_event'] > 0 else 0
                }
                segments.append(segment)
            
            return jsonify({'segments': segments})
    
    except Exception as e:
        logger.error(f"휴면 사용자 세그먼트 통계 API 오류: {e}")
        return jsonify({'error': str(e)}), 500

if __name__ == '__main__':
    port = int(os.environ.get('PORT', 5060))
    app.run(host='0.0.0.0', port=port, debug=True)
