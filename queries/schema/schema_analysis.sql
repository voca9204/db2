-- 테이블 스키마 분석 쿼리
SELECT 
    table_name,
    table_rows,
    data_length,
    index_length,
    create_time,
    update_time,
    engine,
    table_collation
FROM information_schema.tables
WHERE table_schema = DATABASE()
ORDER BY table_name;
