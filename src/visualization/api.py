"""
RESTful API 모듈

이 모듈은 데이터에 액세스하기 위한 RESTful API를 정의합니다.
"""

from flask import Blueprint, jsonify, request, current_app
import logging

bp = Blueprint('api', __name__)
logger = logging.getLogger(__name__)

from ...database.mariadb_connection import MariaDBConnection
from ...database.orm import DatabaseSession, Repository
from ...database.models import Player, PlayerWallet, PlayerComment
from ...utils.config import AppConfig, mask_sensitive_data

# 데이터베이스 연결 및 ORM 세션 획득
def get_db_conn():
    """데이터베이스 연결 획득"""
    return MariaDBConnection()

def get_db_session():
    """ORM 세션 획득"""
    return DatabaseSession()

# 플레이어 API 엔드포인트
@bp.route('/players', methods=['GET'])
def get_players():
    """플레이어 목록 API"""
    try:
        # 쿼리 파라미터 획득
        limit = request.args.get('limit', default=100, type=int)
        offset = request.args.get('offset', default=0, type=int)
        status = request.args.get('status', default=None, type=str)
        
        # 데이터베이스 연결
        conn = get_db_conn()
        
        # 기본 쿼리
        query = "SELECT id, name, account, status FROM players"
        params = []
        
        # 필터 적용
        if status:
            query += " WHERE status = %s"
            params.append(status)
        
        # 정렬 및 페이지네이션
        query += " ORDER BY id LIMIT %s OFFSET %s"
        params.extend([limit, offset])
        
        # 쿼리 실행
        players = conn.query(query, tuple(params))
        
        # 민감한 정보 마스킹
        masked_players = mask_sensitive_data(players)
        
        # 결과 반환
        return jsonify({
            'data': masked_players,
            'meta': {
                'limit': limit,
                'offset': offset,
                'total': conn.query_one("SELECT COUNT(*) as count FROM players")['count']
            }
        })
    except Exception as e:
        logger.error(f"Error fetching players: {str(e)}")
        return jsonify({'error': str(e)}), 500

@bp.route('/players/<int:player_id>', methods=['GET'])
def get_player(player_id):
    """단일 플레이어 상세 정보 API"""
    try:
        # 데이터베이스 연결
        conn = get_db_conn()
        
        # 플레이어 조회
        player = conn.query_one("SELECT * FROM players WHERE id = %s", (player_id,))
        
        if not player:
            return jsonify({'error': 'Player not found'}), 404
        
        # 지갑 정보 조회
        wallets = conn.query(
            "SELECT * FROM player_wallets WHERE player_id = %s",
            (player_id,)
        )
        
        # 코멘트 조회
        comments = conn.query(
            "SELECT * FROM player_comments WHERE player_id = %s ORDER BY created_at DESC",
            (player_id,)
        )
        
        # 결과 조합
        result = {
            'player': player,
            'wallets': wallets,
            'comments': comments
        }
        
        # 민감한 정보 마스킹
        masked_result = mask_sensitive_data(result)
        
        return jsonify(masked_result)
    except Exception as e:
        logger.error(f"Error fetching player {player_id}: {str(e)}")
        return jsonify({'error': str(e)}), 500

# 분석 데이터 API 엔드포인트
@bp.route('/analytics/players/status', methods=['GET'])
def player_status_analytics():
    """플레이어 상태별 분석"""
    try:
        conn = get_db_conn()
        status_counts = conn.query(
            "SELECT status, COUNT(*) as count FROM players GROUP BY status"
        )
        
        # 민감한 정보는 없지만 일관성을 위해 마스킹 함수 적용
        masked_data = mask_sensitive_data(status_counts)
        
        return jsonify(masked_data)
    except Exception as e:
        logger.error(f"Error in player status analytics: {str(e)}")
        return jsonify({'error': str(e)}), 500

@bp.route('/analytics/wallets/balance', methods=['GET'])
def wallet_balance_analytics():
    """지갑 잔액 분석"""
    try:
        conn = get_db_conn()
        currency = request.args.get('currency', default=None, type=str)
        
        query = """
            SELECT 
                AVG(balance) as avg_balance,
                MIN(balance) as min_balance,
                MAX(balance) as max_balance,
                SUM(balance) as total_balance,
                COUNT(*) as count
            FROM player_wallets
        """
        params = []
        
        if currency:
            query += " WHERE currency = %s"
            params.append(currency)
        
        balance_stats = conn.query_one(query, tuple(params) if params else None)
        
        # 민감한 정보는 없지만 일관성을 위해 마스킹 함수 적용
        masked_stats = mask_sensitive_data(balance_stats)
        
        return jsonify(masked_stats)
    except Exception as e:
        logger.error(f"Error in wallet balance analytics: {str(e)}")
        return jsonify({'error': str(e)}), 500
