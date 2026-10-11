-- Sharing search validators. Additive and repeatable; apply after 0004.
-- Keep validation disabled until every trigger and backfill has completed.
CREATE TABLE IF NOT EXISTS collection_search_cache_config (
 id INTEGER PRIMARY KEY CHECK(id=1), schema_version INTEGER NOT NULL, ready INTEGER NOT NULL CHECK(ready IN (0,1))
);
INSERT INTO collection_search_cache_config(id,schema_version,ready) VALUES(1,1,0)
ON CONFLICT(id) DO UPDATE SET ready=0;
CREATE TABLE IF NOT EXISTS collection_search_versions (
 collection_id TEXT PRIMARY KEY REFERENCES collections(id) ON DELETE CASCADE,
 revision INTEGER NOT NULL DEFAULT 1
);
CREATE TABLE IF NOT EXISTS collection_search_user_versions (
 collection_id TEXT NOT NULL REFERENCES collections(id) ON DELETE CASCADE,
 user_id TEXT NOT NULL REFERENCES users(id) ON DELETE CASCADE,
 revision INTEGER NOT NULL DEFAULT 1, PRIMARY KEY(collection_id,user_id)
);
CREATE TRIGGER IF NOT EXISTS search_version_collection_insert AFTER INSERT ON collections
BEGIN
 INSERT OR IGNORE INTO collection_search_versions(collection_id,revision) VALUES(NEW.id,1);
END;

CREATE TRIGGER IF NOT EXISTS search_version_collection_update AFTER UPDATE ON collections
BEGIN
 UPDATE collection_search_versions SET revision=revision+1 WHERE collection_id=NEW.id;
END;

CREATE TRIGGER IF NOT EXISTS search_version_entry_insert AFTER INSERT ON collection_items
BEGIN
 UPDATE collection_search_versions SET revision=revision+1 WHERE collection_id=NEW.collection_id;
END;

CREATE TRIGGER IF NOT EXISTS search_version_entry_update AFTER UPDATE ON collection_items
WHEN NEW.collection_id IS NOT OLD.collection_id OR NEW.source_item_id IS NOT OLD.source_item_id OR NEW.contributor_id IS NOT OLD.contributor_id OR NEW.state IS NOT OLD.state OR NEW.generation IS NOT OLD.generation OR NEW.display_order IS NOT OLD.display_order OR NEW.created_at IS NOT OLD.created_at OR NEW.latest_add_event_seq IS NOT OLD.latest_add_event_seq
BEGIN
 UPDATE collection_search_versions SET revision=revision+1 WHERE collection_id IN (OLD.collection_id,NEW.collection_id);
END;

CREATE TRIGGER IF NOT EXISTS search_version_entry_delete BEFORE DELETE ON collection_items
BEGIN
 UPDATE collection_search_versions SET revision=revision+1 WHERE collection_id=OLD.collection_id;
END;

CREATE TRIGGER IF NOT EXISTS search_version_grant_insert AFTER INSERT ON collection_grants
BEGIN
 UPDATE collection_search_versions SET revision=revision+1 WHERE collection_id=NEW.collection_id;
END;

CREATE TRIGGER IF NOT EXISTS search_version_grant_update AFTER UPDATE ON collection_grants
BEGIN
 UPDATE collection_search_versions SET revision=revision+1 WHERE collection_id IN (OLD.collection_id,NEW.collection_id);
END;

CREATE TRIGGER IF NOT EXISTS search_version_grant_delete BEFORE DELETE ON collection_grants
BEGIN
 UPDATE collection_search_versions SET revision=revision+1 WHERE collection_id=OLD.collection_id;
END;

CREATE TRIGGER IF NOT EXISTS search_version_layer_insert AFTER INSERT ON shared_layers
BEGIN
 UPDATE collection_search_versions SET revision=revision+1 WHERE collection_id IN (SELECT collection_id FROM collection_items WHERE id=NEW.entry_id);
END;

CREATE TRIGGER IF NOT EXISTS search_version_profile_insert AFTER INSERT ON public_profiles
BEGIN
 UPDATE collection_search_versions SET revision=revision+1 WHERE collection_id IN (SELECT collection_id FROM collection_items WHERE contributor_id=NEW.user_id) OR collection_id IN (SELECT id FROM collections WHERE owner_id=NEW.user_id);
END;

CREATE TRIGGER IF NOT EXISTS search_version_taxonomy_insert AFTER INSERT ON taxonomies
WHEN NEW.user_id IS NULL
BEGIN
 UPDATE collection_search_versions SET revision=revision+1;
END;

CREATE TRIGGER IF NOT EXISTS search_version_asset_insert AFTER  INSERT ON assets
BEGIN
 UPDATE collection_search_versions SET revision=revision+1 WHERE collection_id IN (SELECT ci.collection_id FROM collection_items ci JOIN items i ON i.id=ci.source_item_id WHERE i.image_url=NEW.id);
END;

CREATE TRIGGER IF NOT EXISTS search_version_layer_update AFTER UPDATE ON shared_layers
BEGIN
 UPDATE collection_search_versions SET revision=revision+1 WHERE collection_id IN (SELECT collection_id FROM collection_items WHERE id=NEW.entry_id OR id=OLD.entry_id);
END;

CREATE TRIGGER IF NOT EXISTS search_version_profile_update AFTER UPDATE ON public_profiles
BEGIN
 UPDATE collection_search_versions SET revision=revision+1 WHERE collection_id IN (SELECT collection_id FROM collection_items WHERE contributor_id=NEW.user_id) OR collection_id IN (SELECT id FROM collections WHERE owner_id=NEW.user_id);
END;

CREATE TRIGGER IF NOT EXISTS search_version_taxonomy_update AFTER UPDATE ON taxonomies
WHEN NEW.user_id IS NULL OR OLD.user_id IS NULL
BEGIN
 UPDATE collection_search_versions SET revision=revision+1;
END;

CREATE TRIGGER IF NOT EXISTS search_version_asset_update AFTER UPDATE OF state ON assets
WHEN NEW.state IS NOT OLD.state
BEGIN
 UPDATE collection_search_versions SET revision=revision+1 WHERE collection_id IN (SELECT ci.collection_id FROM collection_items ci JOIN items i ON i.id=ci.source_item_id WHERE i.image_url=NEW.id);
END;

CREATE TRIGGER IF NOT EXISTS search_version_layer_delete BEFORE DELETE ON shared_layers
BEGIN
 UPDATE collection_search_versions SET revision=revision+1 WHERE collection_id IN (SELECT collection_id FROM collection_items WHERE id=OLD.entry_id);
END;

CREATE TRIGGER IF NOT EXISTS search_version_profile_delete BEFORE DELETE ON public_profiles
BEGIN
 UPDATE collection_search_versions SET revision=revision+1 WHERE collection_id IN (SELECT collection_id FROM collection_items WHERE contributor_id=OLD.user_id) OR collection_id IN (SELECT id FROM collections WHERE owner_id=OLD.user_id);
END;

CREATE TRIGGER IF NOT EXISTS search_version_taxonomy_delete BEFORE DELETE ON taxonomies
WHEN OLD.user_id IS NULL
BEGIN
 UPDATE collection_search_versions SET revision=revision+1;
END;

CREATE TRIGGER IF NOT EXISTS search_version_asset_delete BEFORE  DELETE ON assets
BEGIN
 UPDATE collection_search_versions SET revision=revision+1 WHERE collection_id IN (SELECT ci.collection_id FROM collection_items ci JOIN items i ON i.id=ci.source_item_id WHERE i.image_url=OLD.id);
END;

CREATE TRIGGER IF NOT EXISTS search_version_source_update AFTER UPDATE OF source,topic_id,keywords,keyword_tokens,image_url,user_id,created_at,content_seq ON items
WHEN NEW.source IS NOT OLD.source OR NEW.topic_id IS NOT OLD.topic_id OR NEW.keywords IS NOT OLD.keywords OR NEW.keyword_tokens IS NOT OLD.keyword_tokens OR NEW.image_url IS NOT OLD.image_url OR NEW.user_id IS NOT OLD.user_id OR NEW.created_at IS NOT OLD.created_at OR NEW.content_seq IS NOT OLD.content_seq
BEGIN
 UPDATE collection_search_versions SET revision=revision+1 WHERE collection_id IN (SELECT collection_id FROM collection_items WHERE source_item_id=NEW.id);
END;

CREATE TRIGGER IF NOT EXISTS search_version_source_delete BEFORE DELETE ON items
BEGIN
 UPDATE collection_search_versions SET revision=revision+1 WHERE collection_id IN (SELECT collection_id FROM collection_items WHERE source_item_id=OLD.id);
END;

CREATE TRIGGER IF NOT EXISTS search_version_progress_insert AFTER INSERT ON collection_item_progress
BEGIN
 INSERT INTO collection_search_user_versions(collection_id,user_id,revision) SELECT collection_id,NEW.user_id,1 FROM collection_items WHERE id=NEW.entry_id ON CONFLICT(collection_id,user_id) DO UPDATE SET revision=revision+1;
END;

CREATE TRIGGER IF NOT EXISTS search_version_progress_update AFTER UPDATE ON collection_item_progress
BEGIN
 INSERT INTO collection_search_user_versions(collection_id,user_id,revision) SELECT collection_id,OLD.user_id,1 FROM collection_items WHERE id=OLD.entry_id ON CONFLICT(collection_id,user_id) DO UPDATE SET revision=revision+1;
 INSERT INTO collection_search_user_versions(collection_id,user_id,revision) SELECT collection_id,NEW.user_id,1 FROM collection_items WHERE id=NEW.entry_id AND (NEW.user_id IS NOT OLD.user_id OR NEW.entry_id IS NOT OLD.entry_id) ON CONFLICT(collection_id,user_id) DO UPDATE SET revision=revision+1;
END;

CREATE TRIGGER IF NOT EXISTS search_version_progress_delete BEFORE DELETE ON collection_item_progress
BEGIN
 INSERT INTO collection_search_user_versions(collection_id,user_id,revision) SELECT collection_id,OLD.user_id,1 FROM collection_items WHERE id=OLD.entry_id ON CONFLICT(collection_id,user_id) DO UPDATE SET revision=revision+1;
END;

CREATE TRIGGER IF NOT EXISTS search_version_saved_insert AFTER INSERT ON saved_refs
BEGIN
 INSERT INTO collection_search_user_versions(collection_id,user_id,revision) SELECT collection_id,NEW.user_id,1 FROM collection_items WHERE id=NEW.entry_id ON CONFLICT(collection_id,user_id) DO UPDATE SET revision=revision+1;
END;

CREATE TRIGGER IF NOT EXISTS search_version_saved_update AFTER UPDATE OF id,user_id,entry_id ON saved_refs
BEGIN
 INSERT INTO collection_search_user_versions(collection_id,user_id,revision) SELECT collection_id,OLD.user_id,1 FROM collection_items WHERE id=OLD.entry_id ON CONFLICT(collection_id,user_id) DO UPDATE SET revision=revision+1;
 INSERT INTO collection_search_user_versions(collection_id,user_id,revision) SELECT collection_id,NEW.user_id,1 FROM collection_items WHERE id=NEW.entry_id AND (NEW.user_id IS NOT OLD.user_id OR NEW.entry_id IS NOT OLD.entry_id) ON CONFLICT(collection_id,user_id) DO UPDATE SET revision=revision+1;
END;

CREATE TRIGGER IF NOT EXISTS search_version_saved_delete BEFORE DELETE ON saved_refs
BEGIN
 INSERT INTO collection_search_user_versions(collection_id,user_id,revision) SELECT collection_id,OLD.user_id,1 FROM collection_items WHERE id=OLD.entry_id ON CONFLICT(collection_id,user_id) DO UPDATE SET revision=revision+1;
END;

INSERT OR IGNORE INTO collection_search_versions(collection_id,revision) SELECT id,1 FROM collections;
UPDATE collection_search_cache_config SET schema_version=1,ready=1 WHERE id=1;
