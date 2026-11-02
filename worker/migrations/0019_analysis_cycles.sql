-- Stage summaries keep an account-scoped baseline and a single active generation.
CREATE TABLE analysis_subject_state (
 user_id TEXT NOT NULL REFERENCES users(id) ON DELETE CASCADE,subject_id TEXT NOT NULL,
 last_report_id TEXT REFERENCES analysis_reports(id) ON DELETE SET NULL,
 last_cutoff_at TEXT,last_completed_at TEXT,
 material_json TEXT NOT NULL DEFAULT '[]' CHECK(json_valid(material_json)),
 boundary_json TEXT NOT NULL DEFAULT '[]' CHECK(json_valid(boundary_json)),
 active_report_id TEXT REFERENCES analysis_reports(id) ON DELETE SET NULL,
 PRIMARY KEY(user_id,subject_id)
);
CREATE TABLE analysis_report_cycles (
 report_id TEXT PRIMARY KEY REFERENCES analysis_reports(id) ON DELETE CASCADE,
 kind TEXT NOT NULL CHECK(kind IN ('baseline','cycle')),
 baseline_report_id TEXT REFERENCES analysis_reports(id) ON DELETE SET NULL,
 from_at TEXT NOT NULL,cutoff_at TEXT NOT NULL,
 material_json TEXT NOT NULL CHECK(json_valid(material_json)),
 boundary_json TEXT NOT NULL CHECK(json_valid(boundary_json))
);
CREATE INDEX idx_analysis_completed_subject ON analysis_reports(user_id,subject_id,created_at DESC,id DESC) WHERE status='complete' AND topic_id IS NULL;
CREATE INDEX idx_practice_received ON practice_attempts(user_id,learning_question_id,received_at,id);
