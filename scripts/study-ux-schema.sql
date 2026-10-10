SELECT 'reader_tables' AS metric, COUNT(*) AS count FROM sqlite_master WHERE type='table' AND name IN ('collection_item_reads','saved_refs');
SELECT 'starred_column' AS metric, COUNT(*) AS count FROM pragma_table_info('collection_item_reads') WHERE name='starred';
SELECT 'classification_column' AS metric, COUNT(*) AS count FROM pragma_table_info('saved_refs') WHERE name='classification_state';
SELECT 'study_progress_table' AS metric, COUNT(*) AS count FROM sqlite_master WHERE type='table' AND name='collection_item_progress';
SELECT 'study_progress_columns' AS metric, COUNT(*) AS count FROM pragma_table_info('collection_item_progress') WHERE name IN ('user_id','entry_id','status','previous_status','review_count','row_version','updated_at');
