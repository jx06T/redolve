-- Candidate recognition never replaces confirmed learning revisions automatically.
CREATE TABLE learning_corrections (
 id TEXT PRIMARY KEY,user_id TEXT NOT NULL REFERENCES users(id) ON DELETE CASCADE,
 item_id TEXT REFERENCES items(id) ON DELETE CASCADE,saved_ref_id TEXT REFERENCES saved_refs(id) ON DELETE CASCADE,
 input_hash TEXT NOT NULL,source_version TEXT NOT NULL,base_row_version INTEGER NOT NULL,
 status TEXT NOT NULL CHECK(status IN ('pending','complete','failed')),data_json TEXT,model_version TEXT,
 run_token TEXT NOT NULL,lease_until TEXT NOT NULL,error TEXT,created_at TEXT NOT NULL,
 adopted_revision_id TEXT REFERENCES learning_question_revisions(id) ON DELETE SET NULL,
 CHECK((item_id IS NOT NULL)+(saved_ref_id IS NOT NULL)=1),UNIQUE(user_id,input_hash)
);
CREATE INDEX idx_correction_item ON learning_corrections(user_id,item_id,created_at DESC,id DESC);
CREATE INDEX idx_correction_saved ON learning_corrections(user_id,saved_ref_id,created_at DESC,id DESC);
CREATE TRIGGER correction_owner BEFORE INSERT ON learning_corrections
WHEN (NEW.item_id IS NOT NULL AND NOT EXISTS(SELECT 1 FROM items WHERE id=NEW.item_id AND user_id=NEW.user_id))
 OR (NEW.saved_ref_id IS NOT NULL AND NOT EXISTS(SELECT 1 FROM saved_refs WHERE id=NEW.saved_ref_id AND user_id=NEW.user_id))
BEGIN
 SELECT RAISE(ABORT,'correction owner mismatch');
END;
