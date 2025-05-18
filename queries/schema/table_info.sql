-- 테이블 목록 조회
SELECT table_name
FROM information_schema.tables
WHERE table_schema = DATABASE()
ORDER BY table_name;

-- 테이블 정보 조회
SELECT 
    column_name AS 'Field',
    column_type AS 'Type',
    is_nullable AS 'Null',
    column_key AS 'Key',
    column_default AS 'Default',
    extra AS 'Extra'
FROM information_schema.columns
WHERE table_schema = DATABASE()
AND table_name = ?
ORDER BY ordinal_position;

-- 테이블 외래키 관계 조회
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
