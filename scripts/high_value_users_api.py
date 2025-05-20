#!/usr/bin/env python
# -*- coding: utf-8 -*-

"""
고가치 사용자 API

이 스크립트는 고가치 사용자 데이터를 데이터베이스에서 가져와 API 형태로 제공합니다.
페이지네이션을 지원하며, 다양한 필터링 옵션을 제공합니다.
"""

import os
import sys
import logging
import json
from datetime import datetime, timedelta
from typing import Dict, List, Optional, Any, Tuple
from flask import Flask, request, jsonify
from dotenv import load_dotenv

# 프로젝트 루트 디렉토리를 Python 경로에 추가
sys.path.append(os.path.abspath(os.path.join(os.path.dirname(__file__), '..')))

from src.database.mariadb_connection import MariaDBConnection
from src.config.database import DatabaseConfig

# 로깅 설정
logging.basicConfig(
    level=logging.INFO,
    format='%(asctime)s - %(name)s - %(levelname)s - %(message)s'
)
logger = logging.getLogger(__name__)

# Flask 앱 설정
app = Flask(__name__)

# 설정 로드
load_dotenv()

# 데이터베이스 연결
db = MariaDBConnection()

# 고가치 사용자 정의 (7일 이상 게임, 유효배팅 50,000 이상)
HIGH_VALUE_THRESHOLD_DAYS = 7
HIGH_VALUE_THRESHOLD_NETBET = 50000

# 휴면 사용자 정의 (30일 이상 미접속)
DORMANT_THRESHOLD_DAYS = 30

@app.route('/api/high-value-users', methods=['GET'])
def get_high_value_users():
    """
    고가치 사용자 목록을 페이지네이션하여 JSON 형식으로 반환
    """
    try:
        # 쿼리 파라미터 파싱
        page = int(request.args.get('page', 1))
        page_size = int(request.args.get('page_size', 10))
        status = request.args.get('status', 'all')  # all, active, dormant
        sort_by = request.args.get('sort_by', 'last_play_date')  # last_play_date, total_deposit, play_days
        sort_order = request.args.get('sort_order', 'desc')  # asc, desc
        search = request.args.get('search', '')  # 이름 또는 계정으로 검색
        
        # 파라미터 검증
        if page < 1:
            page = 1
        if page_size < 1 or page_size > 100:
            page_size = 10
        if sort_order not in ['asc', 'desc']:
            sort_order = 'desc'
        
        # 페이지네이션 계산
        offset = (page - 1) * page_size
        
        # 기본 쿼리 준비
        count_query = """
            SELECT COUNT(*) as total_count
            FROM players p
            JOIN (
                SELECT player_id, 
                       COUNT(DISTINCT DATE(played_at)) as play_days,
                       SUM(net_bet) as total_net_bet
                FROM game_plays
                GROUP BY player_id
                HAVING play_days >= %s AND total_net_bet >= %s
            ) g ON p.id = g.player_id
            LEFT JOIN (
                SELECT player_id, 
                       MAX(played_at) as last_play_date
                FROM game_plays
                GROUP BY player_id
            ) lp ON p.id = lp.player_id
        """
        
        data_query = """
            SELECT p.id, p.name, p.account, 
                   g.play_days, g.total_net_bet,
                   COALESCE(lp.last_play_date, '1970-01-01') as last_play_date,
                   DATEDIFF(NOW(), COALESCE(lp.last_play_date, '1970-01-01')) as days_since_last_play,
                   COALESCE(d.total_deposits, 0) as total_deposits,
                   COALESCE(d.deposit_count, 0) as deposit_count
            FROM players p
            JOIN (
                SELECT player_id, 
                       COUNT(DISTINCT DATE(played_at)) as play_days,
                       SUM(net_bet) as total_net_bet
                FROM game_plays
                GROUP BY player_id
                HAVING play_days >= %s AND total_net_bet >= %s
            ) g ON p.id = g.player_id
            LEFT JOIN (
                SELECT player_id, 
                       MAX(played_at) as last_play_date
                FROM game_plays
                GROUP BY player_id
            ) lp ON p.id = lp.player_id
            LEFT JOIN (
                SELECT player_id,
                       SUM(amount) as total_deposits,
                       COUNT(*) as deposit_count
                FROM deposits
                GROUP BY player_id
            ) d ON p.id = d.player_id
        """
        
        # WHERE 절 조건 준비
        where_conditions = []
        query_params = [HIGH_VALUE_THRESHOLD_DAYS, HIGH_VALUE_THRESHOLD_NETBET]
        
        # 상태 필터링 (활성/휴면)
        if status == 'active':
            where_conditions.append("DATEDIFF(NOW(), COALESCE(lp.last_play_date, '1970-01-01')) < %s")
            query_params.append(DORMANT_THRESHOLD_DAYS)
        elif status == 'dormant':
            where_conditions.append("DATEDIFF(NOW(), COALESCE(lp.last_play_date, '1970-01-01')) >= %s")
            query_params.append(DORMANT_THRESHOLD_DAYS)
        
        # 검색 필터링
        if search:
            where_conditions.append("(p.name LIKE %s OR p.account LIKE %s)")
            search_param = f"%{search}%"
            query_params.extend([search_param, search_param])
        
        # WHERE 절 조합
        if where_conditions:
            where_clause = "WHERE " + " AND ".join(where_conditions)
            count_query += " " + where_clause
            data_query += " " + where_clause
        
        # ORDER