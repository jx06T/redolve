-- Personal review stars are separate from external collection likes.
ALTER TABLE items ADD COLUMN starred INTEGER NOT NULL DEFAULT 0 CHECK(starred IN (0,1));
ALTER TABLE saved_refs ADD COLUMN starred INTEGER NOT NULL DEFAULT 0 CHECK(starred IN (0,1));
ALTER TABLE collection_item_progress ADD COLUMN starred INTEGER NOT NULL DEFAULT 0 CHECK(starred IN (0,1));
CREATE INDEX IF NOT EXISTS idx_items_personal_star ON items(user_id,created_at DESC,id DESC) WHERE starred=1;
CREATE INDEX IF NOT EXISTS idx_saved_personal_star ON saved_refs(user_id,downloaded_at DESC,id DESC) WHERE starred=1;
CREATE TRIGGER IF NOT EXISTS personal_star_source_update AFTER UPDATE OF starred ON items
WHEN NEW.starred IS NOT OLD.starred
BEGIN
 INSERT INTO collection_search_user_versions(collection_id,user_id,revision)
 SELECT DISTINCT collection_id,NEW.user_id,1 FROM collection_items WHERE source_item_id=NEW.id
 ON CONFLICT(collection_id,user_id) DO UPDATE SET revision=revision+1;
END;
