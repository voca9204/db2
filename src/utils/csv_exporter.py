"""
CSV 내보내기 및 데이터 처리 유틸리티 모듈

이 모듈은 데이터베이스 조회 결과를 CSV 파일로 변환하고,
한글 필드명과 필드 값을 영어로 변환하는 기능을 제공합니다.
"""

import os
import csv
import pandas as pd
from datetime import datetime
from typing import List, Dict, Any, Union, Optional, Tuple

class CSVExporter:
    """CSV 내보내기 및 데이터 처리 유틸리티 클래스"""
    
    # 한글-영어 필드명 매핑 기본값
    DEFAULT_FIELD_MAPPING = {
        # 사용자 관련 필드
        '이름': 'name',
        '아이디': 'id',
        '사용자아이디': 'user_id',
        '계정': 'account',
        '이메일': 'email',
        '전화번호': 'phone',
        '상태': 'status',
        '레벨': 'level',
        '생성일': 'created_at',
        '마지막접속일': 'last_login_at',
        '마지막게임일': 'last_game_at',
        '마지막배팅일': 'last_bet_at',
        '가입일': 'registration_date',
        
        # 게임 관련 필드
        '게임종류': 'game_type',
        '게임번호': 'game_id',
        '게임시간': 'game_time',
        '베팅금액': 'bet_amount',
        '유효베팅': 'valid_bet',
        '승패': 'result',
        '게임결과': 'game_result',
        '플레이타임': 'play_time',
        
        # 입출금 관련 필드
        '입금액': 'deposit_amount',
        '출금액': 'withdrawal_amount',
        '보너스': 'bonus',
        '입금횟수': 'deposit_count',
        '출금횟수': 'withdrawal_count',
        '입금일': 'deposit_date',
        '출금일': 'withdrawal_date',
        '지급일': 'payment_date',
        '보너스지급일': 'bonus_date',
        '잔액': 'balance',
        
        # 이벤트 관련 필드
        '이벤트명': 'event_name',
        '이벤트코드': 'event_code',
        '이벤트시작일': 'event_start_date',
        '이벤트종료일': 'event_end_date',
        '참여여부': 'participation_status',
        '참여일': 'participation_date',
        '보상': 'reward',
        '보상금액': 'reward_amount',
        '적용일': 'applied_at',
        
        # 분석 관련 필드
        '총계': 'total',
        '평균': 'average',
        '최대값': 'max_value',
        '최소값': 'min_value',
        '횟수': 'count',
        '비율': 'percentage',
        '기간': 'period',
        '시작일': 'start_date',
        '종료일': 'end_date',
        '활성일수': 'active_days',
        '게임일수': 'game_days',
        '접속빈도': 'login_frequency',
        '접속시간': 'login_time',
        '체류시간': 'session_duration',
        
        # 기타 필드
        '비고': 'note',
        '설명': 'description',
        '메모': 'memo',
        '분류': 'category',
        '태그': 'tag',
        '순위': 'rank'
    }
    
    # 한글-영어 필드값 매핑 기본값
    DEFAULT_VALUE_MAPPING = {
        # 상태 값
        '활성': 'active',
        '비활성': 'inactive',
        '휴면': 'dormant',
        '정지': 'suspended',
        '차단': 'blocked',
        '삭제': 'deleted',
        '대기': 'pending',
        '승인': 'approved',
        '거절': 'rejected',
        
        # 게임 결과
        '승리': 'win',
        '패배': 'lose',
        '무승부': 'draw',
        '취소': 'canceled',
        '진행중': 'in_progress',
        '완료': 'completed',
        
        # 참여 상태
        '참여': 'participated',
        '미참여': 'not_participated',
        '참여함': 'yes',
        '참여안함': 'no',
        
        # 입출금 상태
        '처리중': 'processing',
        '완료됨': 'completed',
        '실패': 'failed',
        
        # 요일
        '월요일': 'Monday',
        '화요일': 'Tuesday',
        '수요일': 'Wednesday',
        '목요일': 'Thursday',
        '금요일': 'Friday',
        '토요일': 'Saturday',
        '일요일': 'Sunday',
        
        # 기타 일반적인 값
        '예': 'yes',
        '아니오': 'no',
        '있음': 'yes',
        '없음': 'no',
        '높음': 'high',
        '중간': 'medium',
        '낮음': 'low',
        '전체': 'all',
        '일부': 'partial',
        '기타': 'other'
    }
    
    def __init__(self, 
                 field_mapping: Optional[Dict[str, str]] = None,
                 value_mapping: Optional[Dict[str, str]] = None,
                 date_format: str = '%Y-%m-%d',
                 datetime_format: str = '%Y-%m-%d %H:%M:%S'):
        """
        CSVExporter 클래스 초기화
        
        Args:
            field_mapping (Dict[str, str], optional): 한글-영어 필드명 매핑 딕셔너리
            value_mapping (Dict[str, str], optional): 한글-영어 필드값 매핑 딕셔너리
            date_format (str): 날짜 포맷
            datetime_format (str): 날짜시간 포맷
        """
        # 기본 매핑에 사용자 정의 매핑 추가
        self.field_mapping = self.DEFAULT_FIELD_MAPPING.copy()
        if field_mapping:
            self.field_mapping.update(field_mapping)
            
        self.value_mapping = self.DEFAULT_VALUE_MAPPING.copy()
        if value_mapping:
            self.value_mapping.update(value_mapping)
            
        self.date_format = date_format
        self.datetime_format = datetime_format
    
    def add_field_mapping(self, korean_name: str, english_name: str) -> None:
        """
        한글-영어 필드명 매핑 추가
        
        Args:
            korean_name (str): 한글 필드명
            english_name (str): 영어 필드명
        """
        self.field_mapping[korean_name] = english_name
    
    def add_value_mapping(self, korean_value: str, english_value: str) -> None:
        """
        한글-영어 필드값 매핑 추가
        
        Args:
            korean_value (str): 한글 필드값
            english_value (str): 영어 필드값
        """
        self.value_mapping[korean_value] = english_value
    
    def translate_field_name(self, field_name: str) -> str:
        """
        필드명을 영어로 변환
        
        Args:
            field_name (str): 변환할 필드명
            
        Returns:
            str: 변환된 영어 필드명 (매핑이 없으면 원래 이름 사용)
        """
        # 이미 영어인 경우 그대로 반환
        if field_name.isascii() and not field_name.isdigit():
            return field_name
        
        # 매핑에서 찾기
        if field_name in self.field_mapping:
            return self.field_mapping[field_name]
        
        # 매핑이 없으면 한글을 영문자로 변환 (간단한 로마자 변환)
        # 이 부분은 실제 환경에 맞게 수정 필요
        import re
        field_name = re.sub(r'[^\w\s]', '', field_name)  # 특수문자 제거
        field_name = field_name.replace(' ', '_')  # 공백을 언더스코어로 변환
        
        # 변환 실패 시 한글을 그대로 사용하면 인코딩 문제 발생 가능성 있음
        # 따라서 필드 위치 기반으로 대체 이름 생성
        if not field_name.isascii():
            field_name = f"field_{hash(field_name) % 10000:04d}"
        
        return field_name.lower()
    
    def translate_field_value(self, value: Any) -> Any:
        """
        필드값을 영어로 변환
        
        Args:
            value (Any): 변환할 필드값
            
        Returns:
            Any: 변환된 필드값 (매핑이 없거나 변환이 필요없는 타입이면 원래 값 사용)
        """
        # None 값 처리
        if value is None:
            return value
        
        # 문자열이 ��닌 경우 그대로 반환
        if not isinstance(value, str):
            return value
        
        # 이미 영어인 경우 그대로 반환
        if value.isascii() and not value.isdigit():
            return value
        
        # 매핑에서 찾기
        if value in self.value_mapping:
            return self.value_mapping[value]
        
        # 매핑이 없으면 원래 값 사용
        return value
    
    def clean_data(self, data: Dict[str, Any]) -> Dict[str, Any]:
        """
        데이터 정제 및 변환
        
        Args:
            data (Dict[str, Any]): 원본 데이터
            
        Returns:
            Dict[str, Any]: 정제된 데이터
        """
        cleaned_data = {}
        
        for key, value in data.items():
            # 필드명 변환
            english_key = self.translate_field_name(key)
            
            # 필드값 변환 및 정제
            cleaned_value = self._clean_value(value)
            cleaned_value = self.translate_field_value(cleaned_value)
            
            cleaned_data[english_key] = cleaned_value
        
        return cleaned_data
    
    def _clean_value(self, value: Any) -> Any:
        """
        값 정제 (NULL 처리, 날짜 형식 변환 등)
        
        Args:
            value (Any): 정제할 값
            
        Returns:
            Any: 정제된 값
        """
        # None 값 처리
        if value is None:
            return ''
        
        # 날짜 객체 처리
        if isinstance(value, datetime):
            if value.hour == 0 and value.minute == 0 and value.second == 0:
                return value.strftime(self.date_format)
            else:
                return value.strftime(self.datetime_format)
        
        # 기타 데이터 타입은 그대로 반환
        return value
    
    def export_to_csv(self, data: List[Dict[str, Any]], file_path: str, 
                     translate_headers: bool = True, 
                     translate_values: bool = True) -> None:
        """
        데이터를 CSV 파일로 내보내기
        
        Args:
            data (List[Dict[str, Any]]): 내보낼 데이터 리스트
            file_path (str): 저장할 파일 경로
            translate_headers (bool): 헤더 영어 변환 여부
            translate_values (bool): 값 영어 변환 여부
        """
        if not data:
            print("내보낼 데이터가 없습니다.")
            return
        
        # 디렉토리 생성
        os.makedirs(os.path.dirname(os.path.abspath(file_path)), exist_ok=True)
        
        # 데이터 처리
        processed_data = []
        
        for row in data:
            if translate_headers or translate_values:
                processed_row = {}
                
                for key, value in row.items():
                    # 헤더 변환
                    if translate_headers:
                        key = self.translate_field_name(key)
                    
                    # 값 변환 및 정제
                    if translate_values:
                        value = self._clean_value(value)
                        value = self.translate_field_value(value)
                    else:
                        value = self._clean_value(value)
                    
                    processed_row[key] = value
                
                processed_data.append(processed_row)
            else:
                # 변환 없이 정제만 수행
                processed_row = {}
                for key, value in row.items():
                    processed_row[key] = self._clean_value(value)
                
                processed_data.append(processed_row)
        
        # CSV 파일로 저장
        if processed_data:
            fieldnames = list(processed_data[0].keys())
            
            with open(file_path, 'w', newline='', encoding='utf-8-sig') as f:
                writer = csv.DictWriter(f, fieldnames=fieldnames)
                writer.writeheader()
                writer.writerows(processed_data)
            
            print(f"CSV 파일이 성공적으로 저장되었습니다: {file_path}")
    
    def export_query_result_to_csv(self, query_result: List[Dict[str, Any]], file_path: str,
                                  translate_headers: bool = True,
                                  translate_values: bool = True) -> None:
        """
        데이터베이스 쿼리 결과를 CSV 파일로 내보내기
        
        Args:
            query_result (List[Dict[str, Any]]): 데이터베이스 쿼리 결과
            file_path (str): 저장할 파일 경로
            translate_headers (bool): 헤더 영어 변환 여부
            translate_values (bool): 값 영어 변환 여부
        """
        self.export_to_csv(query_result, file_path, translate_headers, translate_values)
    
    def export_dataframe_to_csv(self, df: pd.DataFrame, file_path: str,
                               translate_headers: bool = True,
                               translate_values: bool = True) -> None:
        """
        Pandas DataFrame을 CSV 파일로 내보내기
        
        Args:
            df (pd.DataFrame): 내보낼 DataFrame
            file_path (str): 저장할 파일 경로
            translate_headers (bool): 헤더 영어 변환 여부
            translate_values (bool): 값 영어 변환 여부
        """
        if df.empty:
            print("내보낼 데이터가 없습니다.")
            return
        
        # 헤더 변환
        if translate_headers:
            df = df.rename(columns=lambda x: self.translate_field_name(x))
        
        # 값 변환
        if translate_values:
            # 문자열 컬럼만 변환
            for col in df.select_dtypes(include=['object']).columns:
                df[col] = df[col].apply(lambda x: self.translate_field_value(x))
        
        # CSV 파일로 저장
        df.to_csv(file_path, index=False, encoding='utf-8-sig')
        print(f"CSV 파일이 성공적으로 저장되었습니다: {file_path}")

    def get_field_mappings(self) -> Dict[str, str]:
        """
        현재 필드 매핑 딕셔너리 반환
        
        Returns:
            Dict[str, str]: 한글-영어 필드명 매핑 딕셔너리
        """
        return self.field_mapping
    
    def get_value_mappings(self) -> Dict[str, str]:
        """
        현재 값 매핑 딕셔너리 반환
        
        Returns:
            Dict[str, str]: 한글-영어 필드값 매핑 딕셔너리
        """
        return self.value_mapping
    
    def load_mappings_from_file(self, file_path: str) -> None:
        """
        파일에서 매핑 설정 로드
        
        Args:
            file_path (str): 매핑 파일 경로 (CSV 형식)
        """
        try:
            df = pd.read_csv(file_path, encoding='utf-8-sig')
            
            # 필드명 매핑 로드
            if 'korean_field' in df.columns and 'english_field' in df.columns:
                field_mappings = dict(zip(df['korean_field'], df['english_field']))
                self.field_mapping.update(field_mappings)
            
            # 필드값 매핑 로드
            if 'korean_value' in df.columns and 'english_value' in df.columns:
                value_mappings = dict(zip(df['korean_value'], df['english_value']))
                self.value_mapping.update(value_mappings)
                
            print(f"매핑 설정을 파일에서 성공적으로 로드했습니다: {file_path}")
        except Exception as e:
            print(f"매핑 파일 로드 중 오류 발생: {e}")
    
    def save_mappings_to_file(self, file_path: str) -> None:
        """
        매핑 설정을 파일로 저장
        
        Args:
            file_path (str): 저장할 파일 경로 (CSV 형식)
        """
        try:
            # 필드명 매핑
            field_df = pd.DataFrame({
                'korean_field': list(self.field_mapping.keys()),
                'english_field': list(self.field_mapping.values())
            })
            
            # 필드값 매핑
            value_df = pd.DataFrame({
                'korean_value': list(self.value_mapping.keys()),
                'english_value': list(self.value_mapping.values())
            })
            
            # 두 DataFrame 결합 (None 값으로 채우기)
            max_len = max(len(field_df), len(value_df))
            if len(field_df) < max_len:
                field_df = field_df.reindex(range(max_len), fill_value=None)
            if len(value_df) < max_len:
                value_df = value_df.reindex(range(max_len), fill_value=None)
            
            result_df = pd.concat([field_df, value_df], axis=1)
            
            # CSV 파일로 저장
            result_df.to_csv(file_path, index=False, encoding='utf-8-sig')
            print(f"매핑 설정을 파일로 성공적으로 저장했습니다: {file_path}")
        except Exception as e:
            print(f"매핑 파일 저장 중 오류 발생: {e}")


# 예제 사용법
if __name__ == "__main__":
    # 예제 데이터
    example_data = [
        {
            "이름": "홍길동",
            "아이디": "hong123",
            "상태": "활성",
            "마지막접속일": datetime.now(),
            "입금횟수": 5,
            "입금액": 100000,
            "게임결과": "승리",
            "메모": "우수 고객"
        },
        {
            "이름": "김철수",
            "아이디": "kim456",
            "상태": "휴면",
            "마지막접속일": datetime(2023, 5, 15),
            "입금횟수": 2,
            "입금액": 50000,
            "게임결과": "패배",
            "메모": None
        }
    ]
    
    # CSV 내보내기 유틸리티 생성
    exporter = CSVExporter()
    
    # 예제 1: 데이터를 CSV 파일로 내보내기
    exporter.export_to_csv(example_data, "example_output.csv")
    
    # 예제 2: 데이터를 DataFrame으로 변환 후 CSV로 내보내기
    df = pd.DataFrame(example_data)
    exporter.export_dataframe_to_csv(df, "example_dataframe_output.csv")
    
    # 예제 3: 매핑 설정 저장 및 로드
    exporter.save_mappings_to_file("mappings.csv")
    
    # 새 매핑 추가
    exporter.add_field_mapping("신규필드", "new_field")
    exporter.add_value_mapping("신규값", "new_value")
    
    # 매핑 설정 로드
    exporter.load_mappings_from_file("mappings.csv")
