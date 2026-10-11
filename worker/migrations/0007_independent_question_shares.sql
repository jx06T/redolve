-- Existing collections/downloads are not retroactively granted redistribution.
-- New collections explicitly set allow_reshare=1 in the creation API.
ALTER TABLE collections ADD COLUMN allow_reshare INTEGER NOT NULL DEFAULT 0 CHECK(allow_reshare IN (0,1));
ALTER TABLE saved_snapshots ADD COLUMN reshare_allowed INTEGER NOT NULL DEFAULT 0 CHECK(reshare_allowed IN (0,1));

CREATE TABLE IF NOT EXISTS independent_shares (
 token TEXT PRIMARY KEY, user_id TEXT NOT NULL REFERENCES users(id) ON DELETE CASCADE,
 origin_kind TEXT NOT NULL CHECK(origin_kind IN ('owned','saved','collection')), origin_key TEXT NOT NULL,
 collection_id TEXT, entry_id TEXT,
 image_asset_id TEXT NOT NULL REFERENCES assets(id) ON DELETE RESTRICT,
 source TEXT NOT NULL, keywords TEXT, topic_label TEXT, provider_name TEXT,
 draw_data TEXT, typed_notes TEXT, content_hash TEXT NOT NULL,
 allow_ink INTEGER NOT NULL CHECK(allow_ink IN (0,1)), allow_notes INTEGER NOT NULL CHECK(allow_notes IN (0,1)),
 expires_at TEXT, created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP
);
CREATE INDEX IF NOT EXISTS idx_independent_shares_owner ON independent_shares(user_id,origin_kind,origin_key,created_at DESC);
CREATE INDEX IF NOT EXISTS idx_independent_shares_list ON independent_shares(user_id,created_at DESC,token DESC);
CREATE INDEX IF NOT EXISTS idx_independent_shares_expiry ON independent_shares(expires_at);
CREATE TABLE IF NOT EXISTS share_asset_refs (
 token TEXT PRIMARY KEY REFERENCES independent_shares(token) ON DELETE CASCADE,
 asset_id TEXT NOT NULL REFERENCES assets(id) ON DELETE RESTRICT
);
CREATE INDEX IF NOT EXISTS idx_share_asset_refs_asset ON share_asset_refs(asset_id);
CREATE TRIGGER IF NOT EXISTS independent_share_asset_ready BEFORE INSERT ON share_asset_refs
WHEN NOT EXISTS(SELECT 1 FROM independent_shares s JOIN assets a ON a.id=s.image_asset_id
 WHERE s.token=NEW.token AND s.image_asset_id=NEW.asset_id AND a.state='ready')
BEGIN
 SELECT RAISE(ABORT,'share asset mismatch or not ready');
END;
CREATE VIEW IF NOT EXISTS asset_reference_inventory AS
 SELECT asset_id FROM asset_refs UNION ALL SELECT asset_id FROM share_asset_refs;
