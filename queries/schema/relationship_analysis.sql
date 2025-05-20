-- 테이블 관계 분석 쿼리
SELECT 
    tc.constraint_name,
    kcu.table_name AS 'source_table',
    kcu.column_name AS 'source_column',
    kcu.referenced_table_name AS 'target_table',
    kcu.referenced_column_name AS 'target_column'
FROM information_schema.table_constraints tc
JOIN information_schema.key_column_usage kcu
    ON tc.constraint_name = kcu.constraint_name
    AND tc.table_schema = kcu.table_schema
WHERE tc.constraint_type = 'FOREIGN KEY'
AND tc.table_schema = DATABASE()
AND kcu.referenced_table_name IS NOT NULL
ORDER BY tc.table_name, kcu.ordinal_position;
