-- Apply after 0005. Existing separate author layers are retained as read-only references.
ALTER TABLE items ADD COLUMN progress_seq INTEGER NOT NULL DEFAULT 1;
ALTER TABLE items ADD COLUMN previous_status TEXT NOT NULL DEFAULT 'unsolved';

CREATE TRIGGER IF NOT EXISTS source_work_shared_update AFTER UPDATE OF draw_seq,notes_seq ON items
WHEN NEW.draw_seq IS NOT OLD.draw_seq OR NEW.notes_seq IS NOT OLD.notes_seq
BEGIN
 UPDATE collection_items SET shared_seq=shared_seq+1,updated_at=CURRENT_TIMESTAMP
 WHERE source_item_id=NEW.id AND state='included';
 UPDATE collection_search_versions SET revision=revision+1 WHERE collection_id IN
 (SELECT collection_id FROM collection_items WHERE source_item_id=NEW.id);
END;

CREATE TRIGGER IF NOT EXISTS source_progress_shared_update AFTER UPDATE OF status,review_count ON items
WHEN NEW.status IS NOT OLD.status OR NEW.review_count IS NOT OLD.review_count
BEGIN
 UPDATE items SET progress_seq=progress_seq+1,
 previous_status = CASE WHEN NEW.status='archived' AND OLD.status IN ('unsolved','resolved') THEN OLD.status ELSE previous_status END
 WHERE id=NEW.id;
 INSERT INTO collection_search_user_versions(collection_id,user_id,revision)
 SELECT DISTINCT collection_id,NEW.user_id,1 FROM collection_items WHERE source_item_id=NEW.id
 ON CONFLICT(collection_id,user_id) DO UPDATE SET revision=revision+1;
END;

UPDATE collection_search_versions SET revision=revision+1;
UPDATE collection_search_cache_config SET schema_version=2,ready=1 WHERE id=1;
