# 데이터 디렉토리

이 디렉토리는 DB2 프로젝트에서 사용하는 모든 데이터 파일을 담고 있습니다.

## 디렉토리 구조

- **raw/**: 원본 데이터 파일
- **processed/**: 분석 과정에서 생성된 처리된 데이터 파일
- **external/**: 외부 소스에서 가져온 데이터 파일

## 데이터 파일 목록

### processed/

- `event_payment_data.csv`: 이벤트 지급 데이터
- `event_payment_data_1plus.csv`: 이벤트 지급을 1회 이상 받은 사용자 데이터
- `inactive_event_deposit_data.csv`: 이벤트 지급 후 미입금 사용자 데이터
