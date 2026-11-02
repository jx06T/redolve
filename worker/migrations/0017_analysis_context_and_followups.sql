-- Private report context and conversations share their parent report's lifetime.
CREATE TABLE analysis_report_contexts (
 report_id TEXT PRIMARY KEY REFERENCES analysis_reports(id) ON DELETE CASCADE,
 context_json TEXT NOT NULL CHECK(json_valid(context_json)),run_token TEXT
);
CREATE TABLE analysis_followups (
 id TEXT PRIMARY KEY,user_id TEXT NOT NULL REFERENCES users(id) ON DELETE CASCADE,
 report_id TEXT NOT NULL REFERENCES analysis_reports(id) ON DELETE CASCADE,
 question TEXT NOT NULL,request_hash TEXT NOT NULL,status TEXT NOT NULL CHECK(status IN ('pending','complete','failed')),
 answer_json TEXT,evidence_json TEXT,model_version TEXT,run_token TEXT NOT NULL,
 created_at TEXT NOT NULL,lease_until TEXT NOT NULL,error TEXT
);
CREATE INDEX idx_analysis_followup_history ON analysis_followups(user_id,report_id,created_at,id);
CREATE UNIQUE INDEX idx_analysis_followup_pending ON analysis_followups(user_id,report_id) WHERE status='pending';
