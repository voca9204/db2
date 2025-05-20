"""
쿼리 실행 및 관리 모듈

이 모듈은 데이터베이스 쿼리 실행, 성능 추적, 결과 관리를 위한 기능을 제공합니다.
파라미터 바인딩, 캐싱, 대용량 결과 처리 등을 지원합니다.
"""

import os
import time
import hashlib
import json
import logging
import pandas as pd
from pathlib import Path
from typing import Any, Dict, List, Optional, Union, Tuple, Callable
import re
from datetime import datetime

# 프로젝트 루트 디렉토리 설정
project_root = Path(__file__).parent.parent.parent

# 로깅 설정
logger = logging.getLogger(__name__)

class QueryError(Exception):
    """쿼리 실행 관련 오류 클래스"""
    pass

class QueryManager:
    """
    SQL 쿼리 실행 및 관리를 위한 클래스
    
    이 클래스는 SQL 쿼리 실행, 성능 추적, 결과 관리를 위한 기능을 제공합니다.
    파라미터 바인딩, 캐싱, 대용량 결과 처리 등을 지원합니다.
    """
    
    def __init__(self, db_connection, use_cache: bool = True, cache_dir: Optional[str] = None):
        """
        QueryManager 초기화
        
        Args:
            db_connection: 데이터베이스 연결 객체
            use_cache (bool, optional): 캐싱 사용 여부. 기본값은 True.
            cache_dir (str, optional): 캐시 디렉토리 경로. 기본값은 None.
                None인 경우 project_root/data/cache를 사용합니다.
        """
        self.connection = db_connection
        self.use_cache = use_cache
        self.query_cache = {}
        self.performance_log = []
        
        # 캐시 디렉토리 설정
        if cache_dir:
            self.cache_dir = Path(cache_dir)
        else:
            self.cache_dir = project_root / "data" / "cache"
        
        # 캐시 디렉토리 생성
        if self.use_cache and not self.cache_dir.exists():
            self.cache_dir.mkdir(parents=True, exist_ok=True)
    
    def execute_query(self, query: str, params: Optional[Union[Dict, List, Tuple]] = None, 
                     use_cache: Optional[bool] = None, cache_ttl: int = 3600,
                     as_dataframe: bool = True) -> Union[pd.DataFrame, List[Dict[str, Any]]]:
        """
        SQL 쿼리 실행 및 결과 반환
        
        Args:
            query (str): 실행할 SQL 쿼리
            params (Union[Dict, List, Tuple], optional): 쿼리 파라미터. 기본값은 None.
            use_cache (bool, optional): 이 쿼리에 캐싱 사용 여부. 기본값은 None.
                None인 경우 객체의 use_cache 설정을 따릅니다.
            cache_ttl (int, optional): 캐시 유효 시간(초). 기본값은 3600(1시간).
            as_dataframe (bool, optional): 결과를 pandas DataFrame으로 반환할지 여부. 기본값은 True.
                False인 경우 딕셔너리 리스트로 반환합니다.
            
        Returns:
            Union[pd.DataFrame, List[Dict[str, Any]]]: 쿼리 결과
            
        Raises:
            QueryError: 쿼리 실행 실패 시 발생
        """
        # 캐싱 설정
        use_cache_for_query = self.use_cache if use_cache is None else use_cache
        
        # 쿼리 실행 시작 시간
        start_time = time.time()
        
        try:
            # 쿼리 캐싱 처리
            if use_cache_for_query:
                # 캐시 키 생성
                cache_key = self._generate_cache_key(query, params)
                
                # 캐시에서 결과 확인
                cached_result = self._get_from_cache(cache_key, cache_ttl)
                if cached_result is not None:
                    # 캐시된 결과가 있으면 반환
                    execution_time = time.time() - start_time
                    self._log_performance(query, params, execution_time, True, len(cached_result))
                    
                    if as_dataframe:
                        return pd.DataFrame(cached_result)
                    return cached_result
            
            # 캐시된 결과가 없거나 캐싱을 사용하지 않는 경우 쿼리 실행
            if params:
                result = self.connection.query(query, params)
            else:
                result = self.connection.query(query)
            
            # 실행 시간 및 성능 로깅
            execution_time = time.time() - start_time
            self._log_performance(query, params, execution_time, False, len(result))
            
            # 결과 캐싱
            if use_cache_for_query:
                self._save_to_cache(cache_key, result)
            
            # 결과 반환
            if as_dataframe:
                return pd.DataFrame(result)
            return result
        
        except Exception as e:
            # 실행 시간 및 오류 로깅
            execution_time = time.time() - start_time
            self._log_performance(query, params, execution_time, False, 0, str(e))
            raise QueryError(f"쿼리 실행 실패: {str(e)}") from e
    
    def execute_from_file(self, file_path: str, params: Optional[Union[Dict, List, Tuple]] = None,
                         use_cache: Optional[bool] = None, cache_ttl: int = 3600,
                         as_dataframe: bool = True) -> Union[pd.DataFrame, List[Dict[str, Any]]]:
        """
        파일에서 SQL 쿼리를 로드하여 실행
        
        Args:
            file_path (str): SQL 쿼리 파일 경로
            params (Union[Dict, List, Tuple], optional): 쿼리 파라미터. 기본값은 None.
            use_cache (bool, optional): 이 쿼리에 캐싱 사용 여부. 기본값은 None.
            cache_ttl (int, optional): 캐시 유효 시간(초). 기본값은 3600(1시간).
            as_dataframe (bool, optional): 결과를 pandas DataFrame으로 반환할지 여부. 기본값은 True.
            
        Returns:
            Union[pd.DataFrame, List[Dict[str, Any]]]: 쿼리 결과
            
        Raises:
            QueryError: 파일 로드 또는 쿼리 실행 실패 시 발생
        """
        try:
            # 파일 경로 처리
            if not os.path.isabs(file_path):
                file_path = os.path.join(project_root, file_path)
            
            # 파일에서 쿼리 로드
            with open(file_path, 'r', encoding='utf-8') as f:
                query = f.read()
            
            # 로드된 쿼리 실행
            return self.execute_query(query, params, use_cache, cache_ttl, as_dataframe)
        
        except Exception as e:
            raise QueryError(f"파일에서 쿼리 로드 또는 실행 실패: {str(e)}") from e
    
    def load_query_template(self, template_name: str) -> str:
        """
        쿼리 템플릿 로드
        
        Args:
            template_name (str): 템플릿 이름 또는 경로
            
        Returns:
            str: 쿼리 템플릿 내용
            
        Raises:
            QueryError: 템플릿 로드 실패 시 발생
        """
        try:
            # 템플릿 경로 처리
            if not template_name.endswith('.sql'):
                template_name += '.sql'
            
            # 절대 경로가 아닌 경우 queries 디렉토리 기준으로 처리
            if not os.path.isabs(template_name):
                template_path = project_root / "queries" / template_name
            else:
                template_path = Path(template_name)
            
            # 템플릿 파일 존재 확인
            if not template_path.exists():
                raise QueryError(f"쿼리 템플릿을 찾을 수 없습니다: {template_path}")
            
            # 템플릿 로드
            with open(template_path, 'r', encoding='utf-8') as f:
                template = f.read()
            
            return template
        
        except Exception as e:
            raise QueryError(f"쿼리 템플릿 로드 실패: {str(e)}") from e
    
    def execute_template(self, template_name: str, params: Optional[Dict[str, Any]] = None,
                       use_cache: Optional[bool] = None, cache_ttl: int = 3600,
                       as_dataframe: bool = True) -> Union[pd.DataFrame, List[Dict[str, Any]]]:
        """
        템플릿을 로드하여 쿼리 실행
        
        Args:
            template_name (str): 템플릿 이름 또는 경로
            params (Dict[str, Any], optional): 템플릿 및 쿼리 파라미터. 기본값은 None.
            use_cache (bool, optional): 이 쿼리에 캐싱 사용 여부. 기본값은 None.
            cache_ttl (int, optional): 캐시 유효 시간(초). 기본값은 3600(1시간).
            as_dataframe (bool, optional): 결과를 pandas DataFrame으로 반환할지 여부. 기본값은 True.
            
        Returns:
            Union[pd.DataFrame, List[Dict[str, Any]]]: 쿼리 결과
            
        Raises:
            QueryError: 템플릿 로드 또는 쿼리 실행 실패 시 발생
        """
        try:
            # 템플릿 로드
            template = self.load_query_template(template_name)
            
            # 템플릿 파라미터 처리 (SQL 파라미터와 구분)
            sql_params = {}
            if params:
                sql_params = params.copy()
                
                # 템플릿 내 변수 치환
                for key, value in params.items():
                    placeholder = f"{{{key}}}"
                    if placeholder in template:
                        template = template.replace(placeholder, str(value))
                        # SQL 파라미터에서 제거 (이미 템플릿에 적용됨)
                        if key in sql_params:
                            del sql_params[key]
            
            # 쿼리 실행
            return self.execute_query(template, sql_params, use_cache, cache_ttl, as_dataframe)
        
        except Exception as e:
            raise QueryError(f"템플릿 기반 쿼리 실행 실패: {str(e)}") from e
    
    def execute_update(self, query: str, params: Optional[Union[Dict, List, Tuple]] = None) -> int:
        """
        데이터 변경 쿼리 실행 (INSERT, UPDATE, DELETE)
        
        Args:
            query (str): 실행할 SQL 쿼리
            params (Union[Dict, List, Tuple], optional): 쿼리 파라미터. 기본값은 None.
            
        Returns:
            int: 영향받은 행 수
            
        Raises:
            QueryError: 쿼리 실행 실패 시 발생
        """
        # 쿼리 실행 시작 시간
        start_time = time.time()
        
        try:
            # 쿼리 실행
            if params:
                affected_rows = self.connection.execute(query, params)
            else:
                affected_rows = self.connection.execute(query)
            
            # 실행 시간 및 성능 로깅
            execution_time = time.time() - start_time
            self._log_performance(query, params, execution_time, False, affected_rows)
            
            return affected_rows
        
        except Exception as e:
            # 실행 시간 및 오류 로깅
            execution_time = time.time() - start_time
            self._log_performance(query, params, execution_time, False, 0, str(e))
            raise QueryError(f"데이터 변경 쿼리 실행 실패: {str(e)}") from e
    
    def execute_batch(self, query: str, params_list: List[Union[Dict, List, Tuple]]) -> int:
        """
        배치 쿼리 실행
        
        Args:
            query (str): 실행할 SQL 쿼리
            params_list (List[Union[Dict, List, Tuple]]): 쿼리 파라미터 리스트
            
        Returns:
            int: 영향받은 총 행 수
            
        Raises:
            QueryError: 쿼리 실행 실패 시 발생
        """
        # 쿼리 실행 시작 시간
        start_time = time.time()
        
        try:
            # 배치 쿼리 실행
            affected_rows = self.connection.execute_batch(query, params_list)
            
            # 실행 시간 및 성능 로깅
            execution_time = time.time() - start_time
            self._log_performance(query, {'batch_size': len(params_list)}, execution_time, False, affected_rows)
            
            return affected_rows
        
        except Exception as e:
            # 실행 시간 및 오류 로깅
            execution_time = time.time() - start_time
            self._log_performance(query, {'batch_size': len(params_list)}, execution_time, False, 0, str(e))
            raise QueryError(f"배치 쿼리 실행 실패: {str(e)}") from e
    
    def execute_script(self, script: str) -> None:
        """
        SQL 스크립트 실행
        
        Args:
            script (str): 실행할 SQL 스크립트
            
        Raises:
            QueryError: 스크립트 실행 실패 시 발생
        """
        # 쿼리 실행 시작 시간
        start_time = time.time()
        
        try:
            # 스크립트 실행
            self.connection.execute_script(script)
            
            # 실행 시간 및 성능 로깅
            execution_time = time.time() - start_time
            self._log_performance("SQL Script", None, execution_time, False, 0)
        
        except Exception as e:
            # 실행 시간 및 오류 로깅
            execution_time = time.time() - start_time
            self._log_performance("SQL Script", None, execution_time, False, 0, str(e))
            raise QueryError(f"SQL 스크립트 실행 실패: {str(e)}") from e
    
    def get_performance_stats(self, query_pattern: Optional[str] = None) -> pd.DataFrame:
        """
        쿼리 성능 통계 조회
        
        Args:
            query_pattern (str, optional): 필터링할 쿼리 패턴 (정규식). 기본값은 None.
            
        Returns:
            pd.DataFrame: 성능 통계 데이터프레임
        """
        # 성능 로그가 없는 경우 빈 데이터프레임 반환
        if not self.performance_log:
            return pd.DataFrame(columns=[
                'query', 'params', 'execution_time', 'from_cache', 'result_count', 
                'error', 'timestamp'
            ])
        
        # 성능 로그를 데이터프레임으로 변환
        df = pd.DataFrame(self.performance_log)
        
        # 쿼리 패턴으로 필터링
        if query_pattern:
            pattern = re.compile(query_pattern, re.IGNORECASE)
            df = df[df['query'].str.contains(pattern, regex=True)]
        
        # 통계 계산을 위한 그룹화
        if not df.empty:
            # 쿼리별 평균 실행 시간, 실행 횟수, 캐시 히트율 등 계산
            stats = df.groupby('query').agg({
                'execution_time': ['mean', 'min', 'max', 'count'],
                'from_cache': 'mean',  # 캐시 히트율
                'result_count': 'mean',
                'error': lambda x: (x != '').sum()  # 오류 발생 횟수
            }).reset_index()
            
            # 컬럼명 정리
            stats.columns = [
                'query', 'avg_time', 'min_time', 'max_time', 'count', 
                'cache_hit_rate', 'avg_result_count', 'error_count'
            ]
            
            return stats
        
        return df
    
    def clear_cache(self, pattern: Optional[str] = None) -> int:
        """
        쿼리 캐시 삭제
        
        Args:
            pattern (str, optional): 삭제할 캐시 파일 패턴 (정규식). 기본값은 None.
                None인 경우 모든 캐시 삭제
            
        Returns:
            int: 삭제된 캐시 파일 수
        """
        if not self.use_cache:
            return 0
        
        try:
            deleted_count = 0
            
            # 패턴 컴파일
            if pattern:
                regex = re.compile(pattern)
            
            # 캐시 디렉토리의 파일 순회
            for cache_file in self.cache_dir.glob('*.cache'):
                if pattern:
                    # 패턴과 일치하는 파일만 삭제
                    if regex.search(cache_file.name):
                        cache_file.unlink()
                        deleted_count += 1
                else:
                    # 모든 캐시 파일 삭제
                    cache_file.unlink()
                    deleted_count += 1
            
            # 메모리 캐시도 초기화
            if not pattern:
                self.query_cache = {}
            
            return deleted_count
        
        except Exception as e:
            logger.error(f"캐시 삭제 실패: {str(e)}")
            return 0
    
    def _generate_cache_key(self, query: str, params: Optional[Union[Dict, List, Tuple]] = None) -> str:
        """
        쿼리와 파라미터로 캐시 키 생성
        
        Args:
            query (str): SQL 쿼리
            params (Union[Dict, List, Tuple], optional): 쿼리 파라미터. 기본값은 None.
            
        Returns:
            str: 캐시 키
        """
        # 쿼리와 파라미터를 문자열로 변환
        query_str = query.strip()
        params_str = json.dumps(params, sort_keys=True) if params else ''
        
        # 쿼리와 파라미터 해시 생성
        hash_input = f"{query_str}:{params_str}".encode('utf-8')
        cache_key = hashlib.md5(hash_input).hexdigest()
        
        return cache_key
    
    def _get_from_cache(self, cache_key: str, ttl: int) -> Optional[List[Dict[str, Any]]]:
        """
        캐시에서 결과 조회
        
        Args:
            cache_key (str): 캐시 키
            ttl (int): 캐시 유효 시간(초)
            
        Returns:
            Optional[List[Dict[str, Any]]]: 캐시된 결과 또는 None
        """
        if not self.use_cache:
            return None
        
        # 메모리 캐시에서 조회
        if cache_key in self.query_cache:
            cached_item = self.query_cache[cache_key]
            # 캐시 유효 기간 확인
            if time.time() - cached_item['timestamp'] < ttl:
                return cached_item['data']
            # 유효 기간이 지난 경우 캐시에서 제거
            del self.query_cache[cache_key]
        
        # 파일 캐시에서 조회
        cache_file = self.cache_dir / f"{cache_key}.cache"
        if cache_file.exists():
            try:
                with open(cache_file, 'r', encoding='utf-8') as f:
                    cached_item = json.load(f)
                
                # 캐시 유효 기간 확인
                if time.time() - cached_item['timestamp'] < ttl:
                    # 메모리 캐시에도 저장
                    self.query_cache[cache_key] = cached_item
                    return cached_item['data']
                # 유효 기간이 지난 경우 캐시 파일 삭제
                cache_file.unlink()
            except Exception as e:
                logger.warning(f"캐시 파일 읽기 실패: {str(e)}")
        
        return None
    
    def _save_to_cache(self, cache_key: str, data: List[Dict[str, Any]]) -> None:
        """
        결과를 캐시에 저장
        
        Args:
            cache_key (str): 캐시 키
            data (List[Dict[str, Any]]): 저장할 데이터
        """
        if not self.use_cache:
            return
        
        try:
            # 캐시 아이템 생성
            cached_item = {
                'timestamp': time.time(),
                'data': data
            }
            
            # 메모리 캐시에 저장
            self.query_cache[cache_key] = cached_item
            
            # 파일 캐시에 저장
            cache_file = self.cache_dir / f"{cache_key}.cache"
            with open(cache_file, 'w', encoding='utf-8') as f:
                json.dump(cached_item, f, ensure_ascii=False)
        
        except Exception as e:
            logger.warning(f"캐시 저장 실패: {str(e)}")
    
    def _log_performance(self, query: str, params: Any, execution_time: float, 
                        from_cache: bool, result_count: int, error: str = '') -> None:
        """
        쿼리 성능 정보 로깅
        
        Args:
            query (str): 실행된 SQL 쿼리
            params (Any): 쿼리 파라미터
            execution_time (float): 실행 시간(초)
            from_cache (bool): 캐시에서 조회 여부
            result_count (int): 결과 레코드 수
            error (str, optional): 오류 메시지. 기본값은 빈 문자열.
        """
        # 로그 레코드 생성
        log_record = {
            'query': query,
            'params': str(params) if params else '',
            'execution_time': execution_time,
            'from_cache': from_cache,
            'result_count': result_count,
            'error': error,
            'timestamp': datetime.now().isoformat()
        }
        
        # 성능 로그에 추가
        self.performance_log.append(log_record)
        
        # 로그 메시지 생성
        source = "캐시" if from_cache else "데이터베이스"
        result_info = f"결과 {result_count}개" if result_count > 0 else ""
        error_info = f"오류: {error}" if error else ""
        
        log_message = (
            f"쿼리 실행 ({source}) - 실행 시간: {execution_time:.4f}초 - {result_info} {error_info}"
        )
        
        # 로그 레벨 결정
        if error:
            logger.error(log_message)
        elif execution_time > 1.0:  # 1초 이상 소요된 경우 경고
            logger.warning(log_message)
        else:
            logger.debug(log_message)
    
    def process_large_results(self, query: str, params: Optional[Union[Dict, List, Tuple]] = None,
                            batch_size: int = 1000, processor: Callable[[pd.DataFrame], None] = None) -> int:
        """
        대용량 결과를 일괄 처리
        
        Args:
            query (str): 실행할 SQL 쿼리
            params (Union[Dict, List, Tuple], optional): 쿼리 파라미터. 기본값은 None.
            batch_size (int, optional): 일괄 처리할 레코드 수. 기본값은 1000.
            processor (Callable[[pd.DataFrame], None], optional): 각 배치를 처리할 콜백 함수.
                기본값은 None. None인 경우 아무 동작도 하지 않습니다.
            
        Returns:
            int: 처리된 총 레코드 수
            
        Raises:
            QueryError: 쿼리 실행 실패 시 발생
        """
        # 쿼리에 LIMIT 절이 있는지 확인
        has_limit = re.search(r'\bLIMIT\s+\d+', query, re.IGNORECASE)
        
        # LIMIT 절이 없는 경우 배치 크기만큼 제한 추가
        if not has_limit:
            paginated_query = f"{query} LIMIT {batch_size} OFFSET 0"
        else:
            # LIMIT 절이 있는 경우 원본 쿼리 사용
            paginated_query = query
            logger.warning("쿼리에 LIMIT 절이 이미 있습니다. 원본 쿼리를 사용합니다.")
        
        offset = 0
        total_processed = 0
        
        while True:
            # 현재 배치의 쿼리 생성 (LIMIT 절이 없는 경우에만 OFFSET 변경)
            if not has_limit:
                current_query = f"{query} LIMIT {batch_size} OFFSET {offset}"
            else:
                current_query = paginated_query
            
            # 쿼리 실행
            try:
                result_df = self.execute_query(current_query, params, use_cache=False, as_dataframe=True)
            except Exception as e:
                raise QueryError(f"대용량 결과 처리 중 쿼리 실행 실패: {str(e)}") from e
            
            # 결과가 없으면 종료
            if result_df.empty:
                break
            
            # 결과 개수
            batch_count = len(result_df)
            total_processed += batch_count
            
            # 프로세서가 있으면 현재 배치 처리
            if processor:
                try:
                    processor(result_df)
                except Exception as e:
                    logger.error(f"배치 처리 중 오류 발생: {str(e)}")
            
            # 배치 크기보다 작은 결과를 받았다면 마지막 배치
            if batch_count < batch_size:
                break
            
            # LIMIT 절이 있는 경우 한 번만 실행
            if has_limit:
                break
            
            # 다음 오프셋 설정
            offset += batch_size
        
        return total_processed
