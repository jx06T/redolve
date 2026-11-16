-- Batch inputs contain text/context only. Composite images are sent inline to Google.
CREATE TABLE correction_batches (
 id TEXT PRIMARY KEY,user_id TEXT NOT NULL REFERENCES users(id) ON DELETE CASCADE,
 status TEXT NOT NULL CHECK(status IN ('submitting','unknown','running','complete','failed','cancelled')),
 provider_name TEXT,model TEXT NOT NULL,prompt_version TEXT NOT NULL,
 request_hash TEXT NOT NULL,created_at TEXT NOT NULL,updated_at TEXT NOT NULL,
 error TEXT,cleaned_at TEXT,locked_until TEXT NOT NULL DEFAULT '',run_token TEXT
);
CREATE INDEX idx_correction_batches_user ON correction_batches(user_id,created_at DESC,id DESC);
CREATE TABLE correction_run_metadata (
 correction_id TEXT PRIMARY KEY REFERENCES learning_corrections(id) ON DELETE CASCADE,
 prompt_version TEXT NOT NULL,model TEXT NOT NULL,workspace_version TEXT NOT NULL,
 request_id TEXT,input_fingerprint TEXT NOT NULL,
 batch_id TEXT REFERENCES correction_batches(id) ON DELETE CASCADE,
 batch_position INTEGER,context_json TEXT,usage_json TEXT
);
CREATE UNIQUE INDEX idx_correction_run_request ON correction_run_metadata(request_id) WHERE request_id IS NOT NULL;
CREATE UNIQUE INDEX idx_correction_batch_position ON correction_run_metadata(batch_id,batch_position) WHERE batch_id IS NOT NULL;
CREATE TRIGGER correction_batch_owner BEFORE INSERT ON correction_run_metadata
WHEN NEW.batch_id IS NOT NULL AND NOT EXISTS(
 SELECT 1 FROM correction_batches b JOIN learning_corrections c ON c.user_id=b.user_id
 WHERE b.id=NEW.batch_id AND c.id=NEW.correction_id)
BEGIN SELECT RAISE(ABORT,'correction batch owner mismatch'); END;
