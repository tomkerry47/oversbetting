-- ============================================================
-- Wipe Database - Delete all data
-- ============================================================
-- Run this in Supabase SQL Editor to clear all data

-- Delete all data (cascade will handle related records)
TRUNCATE TABLE fines CASCADE;
TRUNCATE TABLE selections CASCADE;
TRUNCATE TABLE fixtures CASCADE;
TRUNCATE TABLE weeks CASCADE;

-- Reset sequences
ALTER SEQUENCE weeks_id_seq RESTART WITH 1;
ALTER SEQUENCE fixtures_id_seq RESTART WITH 1;
ALTER SEQUENCE selections_id_seq RESTART WITH 1;
ALTER SEQUENCE fines_id_seq RESTART WITH 1;

-- Verify empty
SELECT 'weeks' as table_name, COUNT(*) as rows FROM weeks
UNION ALL
SELECT 'fixtures', COUNT(*) FROM fixtures
UNION ALL
SELECT 'selections', COUNT(*) FROM selections
UNION ALL
SELECT 'fines', COUNT(*) FROM fines;
