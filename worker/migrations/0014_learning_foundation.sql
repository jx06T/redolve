-- Personal learning foundation. Additive; no legacy AI calls or fabricated attempts.
CREATE TABLE item_texts (
 item_id TEXT PRIMARY KEY REFERENCES items(id) ON DELETE CASCADE,
 user_id TEXT NOT NULL REFERENCES users(id) ON DELETE CASCADE,
 source_content_seq INTEGER NOT NULL,
 ocr_text TEXT NOT NULL DEFAULT '',
 text_origin TEXT NOT NULL CHECK(text_origin IN ('legacy','ai','user')),
 legacy_rowid INTEGER,
 updated_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP
);
CREATE TABLE learning_questions (
 id TEXT PRIMARY KEY,
 user_id TEXT NOT NULL REFERENCES users(id) ON DELETE CASCADE,
 item_id TEXT REFERENCES items(id) ON DELETE CASCADE,
 saved_ref_id TEXT REFERENCES saved_refs(id) ON DELETE CASCADE,
 current_revision_id TEXT,
 confirmation_status TEXT NOT NULL DEFAULT 'ai' CHECK(confirmation_status IN ('ai','confirmed')),
 row_version INTEGER NOT NULL DEFAULT 0 CHECK(row_version>=0),
 confirmed_at TEXT,
 created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
 CHECK((item_id IS NOT NULL)+(saved_ref_id IS NOT NULL)=1),
 UNIQUE(user_id,item_id), UNIQUE(user_id,saved_ref_id)
);
CREATE TRIGGER learning_owner BEFORE INSERT ON learning_questions
WHEN (NEW.item_id IS NOT NULL AND NOT EXISTS(SELECT 1 FROM items WHERE id=NEW.item_id AND user_id=NEW.user_id))
 OR (NEW.saved_ref_id IS NOT NULL AND NOT EXISTS(SELECT 1 FROM saved_refs WHERE id=NEW.saved_ref_id AND user_id=NEW.user_id))
BEGIN SELECT RAISE(ABORT,'learning owner mismatch'); END;
CREATE TABLE learning_question_revisions (
 id TEXT PRIMARY KEY,
 learning_question_id TEXT NOT NULL REFERENCES learning_questions(id) ON DELETE CASCADE,
 revision_no INTEGER NOT NULL CHECK(revision_no>0),
 content_json TEXT NOT NULL CHECK(json_valid(content_json)),
 personal_json TEXT NOT NULL CHECK(json_valid(personal_json)),
 source_version TEXT NOT NULL,
 created_by TEXT NOT NULL CHECK(created_by IN ('ai','user')),
 created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
 UNIQUE(learning_question_id,revision_no)
);
CREATE TRIGGER learning_revision_immutable BEFORE UPDATE ON learning_question_revisions
BEGIN SELECT RAISE(ABORT,'learning revisions are immutable'); END;
CREATE TRIGGER learning_current_revision BEFORE UPDATE OF current_revision_id ON learning_questions
WHEN NEW.current_revision_id IS NOT NULL AND NOT EXISTS(
 SELECT 1 FROM learning_question_revisions WHERE id=NEW.current_revision_id AND learning_question_id=NEW.id)
BEGIN SELECT RAISE(ABORT,'learning revision mismatch'); END;
CREATE TABLE learning_revision_asset_refs (
 revision_id TEXT PRIMARY KEY REFERENCES learning_question_revisions(id) ON DELETE CASCADE,
 asset_id TEXT NOT NULL REFERENCES assets(id) ON DELETE RESTRICT
);
CREATE INDEX idx_learning_revision_asset ON learning_revision_asset_refs(asset_id);
CREATE TRIGGER learning_asset_ready BEFORE INSERT ON learning_revision_asset_refs
WHEN NOT EXISTS(SELECT 1 FROM assets WHERE id=NEW.asset_id AND state='ready')
BEGIN SELECT RAISE(ABORT,'learning asset unavailable'); END;
DROP VIEW asset_reference_inventory;
CREATE VIEW asset_reference_inventory AS
 SELECT asset_id FROM asset_refs UNION ALL SELECT asset_id FROM share_asset_refs
 UNION ALL SELECT asset_id FROM learning_revision_asset_refs;
CREATE TABLE learning_backfill (
 id INTEGER PRIMARY KEY CHECK(id=1), last_rowid INTEGER NOT NULL DEFAULT 0,
 completed INTEGER NOT NULL DEFAULT 0 CHECK(completed IN (0,1))
);
INSERT INTO learning_backfill(id) VALUES(1);
