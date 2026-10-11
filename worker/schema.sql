-- Redolve Database Schema v1.3.0

-- 使用者帳號表 (Google OAuth 寫入)
CREATE TABLE IF NOT EXISTS users (
    id TEXT PRIMARY KEY,
    email TEXT UNIQUE NOT NULL,
    name TEXT,
    created_at DATETIME DEFAULT CURRENT_TIMESTAMP
);

-- Revocable browser sessions; older JWTs without a matching session are rejected.
CREATE TABLE IF NOT EXISTS auth_sessions (
    id TEXT PRIMARY KEY,
    user_id TEXT NOT NULL,
    expires_at INTEGER NOT NULL,
    created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
    FOREIGN KEY(user_id) REFERENCES users(id) ON DELETE CASCADE
);
CREATE INDEX IF NOT EXISTS idx_auth_sessions_user ON auth_sessions(user_id);

-- API 授權金鑰表 (供 iOS 捷徑使用，使用 bcrypt hash 儲存)
CREATE TABLE IF NOT EXISTS api_keys (
    key_hash TEXT PRIMARY KEY,
    key_prefix TEXT NOT NULL,
    user_id TEXT NOT NULL,
    description TEXT,
    created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
    FOREIGN KEY(user_id) REFERENCES users(id) ON DELETE CASCADE
);

-- 課綱分類樹表 (學測/分科測驗標準與使用者自訂科目/單元)
CREATE TABLE IF NOT EXISTS taxonomies (
    id TEXT PRIMARY KEY,
    user_id TEXT DEFAULT NULL,
    parent_id TEXT,
    label TEXT NOT NULL,
    level INTEGER NOT NULL,
    FOREIGN KEY(user_id) REFERENCES users(id) ON DELETE CASCADE,
    FOREIGN KEY(parent_id) REFERENCES taxonomies(id)
);

-- 錯題/筆記主表 (image_url 儲存 R2 私有 object key)
CREATE TABLE IF NOT EXISTS items (
    id TEXT PRIMARY KEY,
    user_id TEXT NOT NULL,
    type TEXT NOT NULL DEFAULT 'problem',
    topic_id TEXT,
    keywords TEXT,
    keyword_tokens TEXT,
    source TEXT,
    image_url TEXT NOT NULL,
    draw_data TEXT,
    typed_notes TEXT,
    status TEXT DEFAULT 'processing',
    review_count INTEGER DEFAULT 0,
    vector_clock TEXT,
    updated_at DATETIME DEFAULT CURRENT_TIMESTAMP,
    created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
    FOREIGN KEY(user_id) REFERENCES users(id) ON DELETE CASCADE,
    FOREIGN KEY(topic_id) REFERENCES taxonomies(id)
);

-- 分享金鑰表 (供唯讀分享使用，expires_at 为 NULL 表示手動撤銷)
CREATE TABLE IF NOT EXISTS shares (
    token TEXT PRIMARY KEY,
    item_id TEXT NOT NULL,
    user_id TEXT NOT NULL,
    allow_ink INTEGER DEFAULT 1,
    allow_notes INTEGER DEFAULT 1,
    expires_at DATETIME,
    created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
    FOREIGN KEY(item_id) REFERENCES items(id) ON DELETE CASCADE
);

-- 查詢效能最佳化索引
CREATE INDEX IF NOT EXISTS idx_user_status ON items(user_id, status);
CREATE INDEX IF NOT EXISTS idx_user_topic_id ON items(user_id, topic_id);
CREATE INDEX IF NOT EXISTS idx_user_created ON items(user_id, created_at DESC, id DESC);

-- FTS5 全文檢索虛擬表 (包含細粒度中文 token 與打字筆記)
CREATE VIRTUAL TABLE IF NOT EXISTS items_fts USING fts5(
    id UNINDEXED,
    user_id UNINDEXED,
    source,
    keyword_tokens,
    typed_notes,
    problem_text
);

-- Sharing v2. Apply only after confirming this migration was never run remotely.
ALTER TABLE items ADD COLUMN content_seq INTEGER NOT NULL DEFAULT 1;
ALTER TABLE items ADD COLUMN draw_seq INTEGER NOT NULL DEFAULT 0;
ALTER TABLE items ADD COLUMN notes_seq INTEGER NOT NULL DEFAULT 0;
UPDATE items SET draw_seq=CASE WHEN json_valid(vector_clock)
 THEN MAX(0,COALESCE(CAST(json_extract(vector_clock,'$.seq') AS INTEGER),0)) ELSE 0 END;

CREATE TABLE assets (
 id TEXT PRIMARY KEY, storage_key TEXT NOT NULL UNIQUE, mime_type TEXT NOT NULL DEFAULT 'image/jpeg',
 byte_size INTEGER, state TEXT NOT NULL DEFAULT 'ready' CHECK(state IN ('staging','ready','gc_pending','deleting','deleted','quarantined')),
 generation INTEGER NOT NULL DEFAULT 1, gc_after TEXT, created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP
);
CREATE TABLE asset_refs (
 id TEXT PRIMARY KEY, asset_id TEXT NOT NULL REFERENCES assets(id) ON DELETE RESTRICT,
 item_id TEXT REFERENCES items(id) ON DELETE CASCADE,
 layer_id TEXT REFERENCES shared_layers(id) ON DELETE CASCADE,
 snapshot_id TEXT REFERENCES saved_snapshots(id) ON DELETE CASCADE,
 workspace_id TEXT REFERENCES personal_workspaces(id) ON DELETE CASCADE,
 role TEXT NOT NULL CHECK(role IN ('source_image','shared_draw','saved_image','saved_draw','personal_draw','cover')),
 created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
 CHECK ((item_id IS NOT NULL)+(layer_id IS NOT NULL)+(snapshot_id IS NOT NULL)+(workspace_id IS NOT NULL)=1)
);
CREATE INDEX idx_asset_refs_asset ON asset_refs(asset_id);
CREATE INDEX idx_asset_refs_item ON asset_refs(item_id);
CREATE INDEX idx_asset_refs_layer ON asset_refs(layer_id);
CREATE INDEX idx_asset_refs_snapshot ON asset_refs(snapshot_id);
CREATE TRIGGER asset_ref_ready BEFORE INSERT ON asset_refs
WHEN NOT EXISTS(SELECT 1 FROM assets WHERE id=NEW.asset_id AND state='ready')
BEGIN SELECT RAISE(ABORT,'asset is not ready'); END;
CREATE TRIGGER asset_ref_owner BEFORE INSERT ON asset_refs
WHEN (NEW.role='source_image' AND NOT EXISTS(
  SELECT 1 FROM items WHERE id=NEW.item_id AND image_url=NEW.asset_id))
 OR (NEW.role='shared_draw' AND NOT EXISTS(
  SELECT 1 FROM shared_layers WHERE id=NEW.layer_id AND draw_asset_id=NEW.asset_id AND state='active'))
 OR (NEW.role='saved_image' AND NOT EXISTS(
  SELECT 1 FROM saved_snapshots ss JOIN saved_refs sr ON sr.id=ss.saved_ref_id
  WHERE ss.id=NEW.snapshot_id AND ss.image_asset_id=NEW.asset_id
   AND sr.current_snapshot_id=ss.id))
 OR (NEW.role='saved_draw' AND NOT EXISTS(
  SELECT 1 FROM saved_snapshot_layers ssl JOIN saved_snapshots ss ON ss.id=ssl.snapshot_id
  JOIN saved_refs sr ON sr.id=ss.saved_ref_id
  WHERE ssl.snapshot_id=NEW.snapshot_id AND ssl.draw_asset_id=NEW.asset_id
   AND sr.current_snapshot_id=ss.id))
 OR (NEW.role='personal_draw' AND NOT EXISTS(
  SELECT 1 FROM personal_workspaces WHERE id=NEW.workspace_id AND draw_asset_id=NEW.asset_id))
BEGIN SELECT RAISE(ABORT,'asset reference owner mismatch'); END;

CREATE TABLE public_profiles (
 user_id TEXT PRIMARY KEY REFERENCES users(id) ON DELETE CASCADE,
 display_name TEXT NOT NULL, confirmed_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP
);
CREATE TABLE collections (
 id TEXT PRIMARY KEY, owner_id TEXT REFERENCES users(id) ON DELETE SET NULL,
 kind TEXT NOT NULL DEFAULT 'set' CHECK(kind IN ('personal','set','single')),
 title TEXT NOT NULL, description TEXT NOT NULL DEFAULT '', public_name TEXT NOT NULL,
 lifecycle TEXT NOT NULL DEFAULT 'draft' CHECK(lifecycle IN ('draft','active','suspended','deleted')),
 visibility TEXT NOT NULL DEFAULT 'restricted' CHECK(visibility IN ('restricted','link','public')),
 listed INTEGER NOT NULL DEFAULT 0 CHECK(listed IN (0,1)),
 show_shared_ink INTEGER NOT NULL DEFAULT 0 CHECK(show_shared_ink IN (0,1)),
 show_shared_notes INTEGER NOT NULL DEFAULT 0 CHECK(show_shared_notes IN (0,1)),
 acl_version INTEGER NOT NULL DEFAULT 1, row_version INTEGER NOT NULL DEFAULT 1,
 created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP, updated_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
 CHECK(listed=0 OR visibility='public'),
 CHECK(kind!='personal' OR (visibility='restricted' AND listed=0))
);
CREATE UNIQUE INDEX idx_personal_collection ON collections(owner_id) WHERE kind='personal';
CREATE INDEX idx_collections_owner ON collections(owner_id,lifecycle);
CREATE INDEX idx_collections_public ON collections(lifecycle,visibility,listed,updated_at DESC);
CREATE TABLE collection_grants (
 id TEXT PRIMARY KEY, collection_id TEXT NOT NULL REFERENCES collections(id) ON DELETE RESTRICT,
 kind TEXT NOT NULL CHECK(kind IN ('user','link')),
 role TEXT NOT NULL CHECK(role IN ('viewer','contributor')),
 user_id TEXT REFERENCES users(id) ON DELETE CASCADE, token_hash TEXT UNIQUE,
 expires_at TEXT, revoked_at TEXT, created_by TEXT REFERENCES users(id) ON DELETE SET NULL,
 created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
 CHECK((kind='user' AND user_id IS NOT NULL AND token_hash IS NULL) OR
       (kind='link' AND user_id IS NULL AND token_hash IS NOT NULL AND role='viewer'))
);
CREATE INDEX idx_grants_user ON collection_grants(collection_id,user_id,role,revoked_at,expires_at);
CREATE TABLE grant_holders (
 grant_id TEXT NOT NULL REFERENCES collection_grants(id) ON DELETE CASCADE,
 user_id TEXT NOT NULL REFERENCES users(id) ON DELETE CASCADE,
 claimed_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP, PRIMARY KEY(grant_id,user_id)
);
CREATE TABLE invitations (
 id TEXT PRIMARY KEY, collection_id TEXT NOT NULL REFERENCES collections(id) ON DELETE RESTRICT,
 role TEXT NOT NULL CHECK(role IN ('viewer','contributor')),
 email TEXT NOT NULL, token_hash TEXT NOT NULL UNIQUE, expires_at TEXT NOT NULL,
 accepted_by TEXT REFERENCES users(id) ON DELETE SET NULL, accepted_at TEXT, revoked_at TEXT,
 created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP
);
CREATE INDEX idx_invitations_email ON invitations(email,expires_at,revoked_at);
CREATE TABLE owner_transfers (
 collection_id TEXT PRIMARY KEY REFERENCES collections(id) ON DELETE RESTRICT,
 from_user_id TEXT NOT NULL REFERENCES users(id) ON DELETE CASCADE,
 to_user_id TEXT NOT NULL REFERENCES users(id) ON DELETE CASCADE,
 expires_at TEXT NOT NULL, created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP
);
CREATE INDEX idx_owner_transfers_target ON owner_transfers(to_user_id,expires_at);
CREATE TABLE collection_items (
 id TEXT PRIMARY KEY, collection_id TEXT NOT NULL REFERENCES collections(id) ON DELETE RESTRICT,
 source_item_id TEXT REFERENCES items(id) ON DELETE SET NULL,
 contributor_id TEXT REFERENCES users(id) ON DELETE SET NULL,
 origin_item_key TEXT NOT NULL, state TEXT NOT NULL DEFAULT 'included' CHECK(state IN ('included','removed')),
 generation INTEGER NOT NULL DEFAULT 1, display_order INTEGER NOT NULL DEFAULT 0,
 shared_seq INTEGER NOT NULL DEFAULT 0, latest_add_event_seq INTEGER,
 created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP, updated_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
 UNIQUE(collection_id,origin_item_key)
);
CREATE INDEX idx_entries_collection ON collection_items(collection_id,state,display_order,id);
CREATE INDEX idx_entries_contributor ON collection_items(contributor_id,state);
CREATE INDEX idx_entries_source ON collection_items(source_item_id,state,collection_id);
CREATE TRIGGER entry_source_owner_insert BEFORE INSERT ON collection_items
WHEN NEW.source_item_id IS NOT NULL AND NOT EXISTS
 (SELECT 1 FROM items WHERE id=NEW.source_item_id AND user_id=NEW.contributor_id)
BEGIN SELECT RAISE(ABORT,'source owner mismatch'); END;
CREATE TRIGGER entry_source_owner_update BEFORE UPDATE OF source_item_id,contributor_id ON collection_items
WHEN NEW.source_item_id IS NOT NULL AND NOT EXISTS
 (SELECT 1 FROM items WHERE id=NEW.source_item_id AND user_id=NEW.contributor_id)
BEGIN SELECT RAISE(ABORT,'source owner mismatch'); END;
CREATE TRIGGER entry_contributor_insert BEFORE INSERT ON collection_items
WHEN NOT EXISTS(
 SELECT 1 FROM collections co WHERE co.id=NEW.collection_id AND co.lifecycle!='deleted'
  AND (co.owner_id=NEW.contributor_id OR EXISTS(
   SELECT 1 FROM collection_grants g WHERE g.collection_id=co.id AND g.kind='user'
    AND g.role='contributor' AND g.user_id=NEW.contributor_id AND g.revoked_at IS NULL
    AND (g.expires_at IS NULL OR datetime(g.expires_at)>CURRENT_TIMESTAMP))))
BEGIN SELECT RAISE(ABORT,'contributor no longer authorized'); END;
CREATE TRIGGER entry_contributor_reinclude BEFORE UPDATE OF state ON collection_items
WHEN NEW.state='included' AND OLD.state!='included' AND NOT EXISTS(
 SELECT 1 FROM collections co WHERE co.id=NEW.collection_id AND co.lifecycle!='deleted'
  AND (co.owner_id=NEW.contributor_id OR EXISTS(
   SELECT 1 FROM collection_grants g WHERE g.collection_id=co.id AND g.kind='user'
    AND g.role='contributor' AND g.user_id=NEW.contributor_id AND g.revoked_at IS NULL
    AND (g.expires_at IS NULL OR datetime(g.expires_at)>CURRENT_TIMESTAMP))))
BEGIN SELECT RAISE(ABORT,'contributor no longer authorized'); END;
CREATE TABLE shared_layers (
 id TEXT PRIMARY KEY, entry_id TEXT NOT NULL REFERENCES collection_items(id) ON DELETE RESTRICT,
 entry_generation INTEGER NOT NULL, user_id TEXT REFERENCES users(id) ON DELETE SET NULL,
 author_display TEXT NOT NULL, state TEXT NOT NULL DEFAULT 'active' CHECK(state IN ('active','detached')),
 draw_asset_id TEXT REFERENCES assets(id) ON DELETE RESTRICT, draw_seq INTEGER NOT NULL DEFAULT 0,
 typed_notes TEXT NOT NULL DEFAULT '', notes_seq INTEGER NOT NULL DEFAULT 0,
 updated_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP, UNIQUE(entry_id,entry_generation,user_id)
);
CREATE INDEX idx_layers_entry ON shared_layers(entry_id,entry_generation,state,user_id);
CREATE TRIGGER layer_write_authorized BEFORE UPDATE OF draw_asset_id,typed_notes ON shared_layers
WHEN NEW.state='active' AND NOT EXISTS(
 SELECT 1 FROM collection_items ci JOIN collections co ON co.id=ci.collection_id
 JOIN items i ON i.id=ci.source_item_id AND i.user_id=ci.contributor_id
 WHERE ci.id=NEW.entry_id AND ci.generation=NEW.entry_generation AND ci.state='included'
  AND co.lifecycle!='deleted' AND (co.owner_id=NEW.user_id OR EXISTS(
   SELECT 1 FROM collection_grants g WHERE g.collection_id=co.id AND g.kind='user'
    AND g.role='contributor' AND g.user_id=NEW.user_id AND g.revoked_at IS NULL
    AND (g.expires_at IS NULL OR datetime(g.expires_at)>CURRENT_TIMESTAMP))))
BEGIN SELECT RAISE(ABORT,'shared layer write revoked'); END;
CREATE TRIGGER layer_content_changed AFTER UPDATE OF draw_asset_id,typed_notes ON shared_layers
WHEN NEW.state='active' AND
 (NEW.draw_asset_id IS NOT OLD.draw_asset_id OR NEW.typed_notes IS NOT OLD.typed_notes)
BEGIN
 UPDATE collection_items SET shared_seq=shared_seq+1
 WHERE id=NEW.entry_id AND generation=NEW.entry_generation;
END;
CREATE TRIGGER layer_detached AFTER UPDATE OF state ON shared_layers
WHEN OLD.state='active' AND NEW.state='detached'
BEGIN
 UPDATE collection_items SET shared_seq=shared_seq+1
 WHERE id=NEW.entry_id AND generation=NEW.entry_generation;
END;
CREATE TABLE collection_events (
 seq INTEGER PRIMARY KEY AUTOINCREMENT, collection_id TEXT NOT NULL REFERENCES collections(id) ON DELETE RESTRICT,
 entry_id TEXT REFERENCES collection_items(id) ON DELETE RESTRICT, generation INTEGER,
 type TEXT NOT NULL CHECK(type IN ('add','remove','suspend','resume')),
 created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP
);
CREATE UNIQUE INDEX idx_events_add ON collection_events(entry_id,generation,type) WHERE type='add';
CREATE TRIGGER add_event_live BEFORE INSERT ON collection_events
WHEN NEW.type='add' AND NOT EXISTS(
 SELECT 1 FROM collection_items ci JOIN collections co ON co.id=ci.collection_id
 JOIN items i ON i.id=ci.source_item_id AND i.user_id=ci.contributor_id
 WHERE ci.id=NEW.entry_id AND ci.collection_id=NEW.collection_id AND
  ci.state='included' AND ci.generation=NEW.generation AND co.lifecycle='active'
  AND (co.owner_id=ci.contributor_id OR EXISTS(
   SELECT 1 FROM collection_grants g WHERE g.collection_id=co.id AND g.kind='user'
    AND g.role='contributor' AND g.user_id=ci.contributor_id AND g.revoked_at IS NULL
    AND (g.expires_at IS NULL OR datetime(g.expires_at)>CURRENT_TIMESTAMP))))
BEGIN SELECT RAISE(ABORT,'add event source invalid'); END;
CREATE INDEX idx_events_collection ON collection_events(collection_id,seq DESC);
CREATE TABLE subscriptions (
 user_id TEXT NOT NULL REFERENCES users(id) ON DELETE CASCADE,
 collection_id TEXT NOT NULL REFERENCES collections(id) ON DELETE RESTRICT,
 subscribed_after_seq INTEGER NOT NULL DEFAULT 0, read_all_through_seq INTEGER NOT NULL DEFAULT 0,
 last_known_title TEXT NOT NULL, subscribed_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
 PRIMARY KEY(user_id,collection_id)
);
CREATE INDEX idx_subscriptions_collection ON subscriptions(collection_id);
CREATE TABLE collection_item_reads (
 starred INTEGER NOT NULL DEFAULT 0 CHECK(starred IN (0,1)),
 user_id TEXT NOT NULL REFERENCES users(id) ON DELETE CASCADE,
 entry_id TEXT NOT NULL REFERENCES collection_items(id) ON DELETE RESTRICT,
 seen_add_event_seq INTEGER NOT NULL DEFAULT 0, seen_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
 PRIMARY KEY(user_id,entry_id)
);


CREATE TABLE saved_refs (
 classification_state TEXT NOT NULL DEFAULT 'ready' CHECK(classification_state IN ('ready','pending','failed','manual')),
 id TEXT PRIMARY KEY, user_id TEXT NOT NULL REFERENCES users(id) ON DELETE CASCADE,
 entry_id TEXT NOT NULL REFERENCES collection_items(id) ON DELETE RESTRICT,
 current_snapshot_id TEXT REFERENCES saved_snapshots(id) ON DELETE SET NULL,
 personal_topic_id TEXT REFERENCES taxonomies(id) ON DELETE SET NULL,
 personal_tags TEXT NOT NULL DEFAULT '[]', status TEXT NOT NULL DEFAULT 'unsolved'
 CHECK(status IN ('unsolved','resolved','archived')), review_count INTEGER NOT NULL DEFAULT 0,
 row_version INTEGER NOT NULL DEFAULT 1, downloaded_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
 updated_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP, UNIQUE(user_id,entry_id)
);
CREATE INDEX idx_saved_user ON saved_refs(user_id,status,personal_topic_id,downloaded_at DESC);
CREATE INDEX idx_saved_entry ON saved_refs(entry_id,user_id);
CREATE TABLE saved_snapshots (
 id TEXT PRIMARY KEY, saved_ref_id TEXT NOT NULL REFERENCES saved_refs(id) ON DELETE CASCADE,
 image_asset_id TEXT NOT NULL REFERENCES assets(id) ON DELETE RESTRICT,
 source_title TEXT NOT NULL, source_label TEXT, source_tags TEXT, source_topic_label TEXT,
 collection_title TEXT NOT NULL, provider_public_name TEXT NOT NULL,
 source_content_seq INTEGER NOT NULL, source_shared_seq INTEGER NOT NULL,
 acquisition_policy_version INTEGER NOT NULL DEFAULT 2,
 acquired_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP
);
CREATE INDEX idx_snapshot_saved ON saved_snapshots(saved_ref_id,acquired_at DESC);
CREATE TABLE saved_snapshot_layers (
 snapshot_id TEXT NOT NULL REFERENCES saved_snapshots(id) ON DELETE CASCADE,
 layer_origin_key TEXT NOT NULL, author_display TEXT NOT NULL,
 draw_asset_id TEXT REFERENCES assets(id) ON DELETE RESTRICT, typed_notes TEXT,
 retained_field_mask INTEGER NOT NULL, PRIMARY KEY(snapshot_id,layer_origin_key)
);
CREATE TABLE personal_workspaces (
 id TEXT PRIMARY KEY, user_id TEXT NOT NULL REFERENCES users(id) ON DELETE CASCADE,
 item_id TEXT REFERENCES items(id) ON DELETE CASCADE,
 saved_ref_id TEXT REFERENCES saved_refs(id) ON DELETE CASCADE,
 draw_asset_id TEXT REFERENCES assets(id) ON DELETE RESTRICT,
 draw_seq INTEGER NOT NULL DEFAULT 0, typed_notes TEXT NOT NULL DEFAULT '',
 notes_seq INTEGER NOT NULL DEFAULT 0, canvas_geometry TEXT,
 updated_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
 CHECK((item_id IS NOT NULL)!=(saved_ref_id IS NOT NULL)), UNIQUE(item_id),UNIQUE(saved_ref_id)
);
CREATE TRIGGER workspace_draw_write AFTER UPDATE OF draw_asset_id ON personal_workspaces
WHEN NEW.draw_asset_id IS NOT OLD.draw_asset_id AND NEW.saved_ref_id IS NOT NULL
BEGIN
 SELECT CASE WHEN NOT EXISTS(SELECT 1 FROM saved_refs sr
  WHERE sr.id=NEW.saved_ref_id AND sr.user_id=NEW.user_id)
  THEN RAISE(ABORT,'workspace owner mismatch') END;
END;
CREATE TABLE user_upload_preferences (
 user_id TEXT PRIMARY KEY REFERENCES users(id) ON DELETE CASCADE,
 default_collection_id TEXT REFERENCES collections(id) ON DELETE SET NULL,
 updated_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP
);
CREATE TABLE sharing_audit (
 id TEXT PRIMARY KEY, actor_id TEXT REFERENCES users(id) ON DELETE SET NULL,
 collection_id TEXT REFERENCES collections(id) ON DELETE SET NULL,
 action TEXT NOT NULL, target_id TEXT, detail TEXT,
 created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP
);
CREATE TABLE maintenance_jobs (
 id TEXT PRIMARY KEY, kind TEXT NOT NULL, target_id TEXT NOT NULL,
 state TEXT NOT NULL DEFAULT 'pending', lease_until TEXT, attempts INTEGER NOT NULL DEFAULT 0,
 next_attempt_at TEXT, last_error TEXT, UNIQUE(kind,target_id)
);
CREATE TABLE content_reports (
 id TEXT PRIMARY KEY, reporter_id TEXT REFERENCES users(id) ON DELETE SET NULL,
 collection_id TEXT NOT NULL REFERENCES collections(id) ON DELETE RESTRICT,
 entry_id TEXT REFERENCES collection_items(id) ON DELETE SET NULL,
 category TEXT NOT NULL, detail TEXT, state TEXT NOT NULL DEFAULT 'open',
 resolution TEXT, created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP
);
INSERT OR IGNORE INTO assets(id,storage_key)
SELECT DISTINCT image_url,image_url FROM items WHERE image_url IS NOT NULL AND image_url!='';
INSERT OR IGNORE INTO asset_refs(id,asset_id,item_id,role)
SELECT 'item:'||id,image_url,id,'source_image' FROM items WHERE image_url IS NOT NULL AND image_url!='';

-- Additive, safe to repeat. Does not change source items or shared layers.
CREATE TABLE IF NOT EXISTS collection_item_progress (
 user_id TEXT NOT NULL REFERENCES users(id),
 entry_id TEXT NOT NULL REFERENCES collection_items(id),
 status TEXT NOT NULL DEFAULT 'unsolved' CHECK(status IN ('unsolved','resolved','archived')),
 previous_status TEXT NOT NULL DEFAULT 'unsolved' CHECK(previous_status IN ('unsolved','resolved')),
 review_count INTEGER NOT NULL DEFAULT 0 CHECK(review_count>=0),
 row_version INTEGER NOT NULL DEFAULT 0,
 updated_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
 PRIMARY KEY(user_id,entry_id)
);

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
 previous_status=CASE WHEN NEW.status='archived' AND OLD.status IN ('unsolved','resolved') THEN OLD.status ELSE previous_status END
 WHERE id=NEW.id;
 INSERT INTO collection_search_user_versions(collection_id,user_id,revision)
 SELECT DISTINCT collection_id,NEW.user_id,1 FROM collection_items WHERE source_item_id=NEW.id
 ON CONFLICT(collection_id,user_id) DO UPDATE SET revision=revision+1;
END;

UPDATE collection_search_versions SET revision=revision+1;
UPDATE collection_search_cache_config SET schema_version=2,ready=1 WHERE id=1;
