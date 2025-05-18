# 쿼리 디렉토리

이 디렉토리는 DB2 프로젝트에서 사용하는 모든 SQL 쿼리 파일을 담고 있습니다.

## 디렉토리 구조

- **event/**: 이벤트 분석 관련 쿼리
- **user/**: 사용자 분석 관련 쿼리
- **schema/**: 데이터베이스 스키마 분석 관련 쿼리

## 쿼리 파일 목록

### event/

- `event_payment_query.sql`: 이벤트 지급 분석 쿼리
- `event_payment_1plus_query.sql`: 이벤트 지급을 1회 이상 받은 사용자 분석 쿼리
- `inactive_event_deposit_query.sql`: 이벤트 지급 후 미입금 사용자 분석 쿼리

### schema/

- `table_info.sql`: 테이블 정보 조회 쿼리
