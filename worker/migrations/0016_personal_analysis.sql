-- Reports contain private snapshots; details expire, numeric summaries remain.
CREATE TABLE analysis_reports (
 id TEXT PRIMARY KEY,user_id TEXT NOT NULL REFERENCES users(id) ON DELETE CASCADE,
 subject_id TEXT NOT NULL,topic_id TEXT,days INTEGER NOT NULL CHECK(days IN (7,15,30,60,90)),
 input_hash TEXT NOT NULL,status TEXT NOT NULL CHECK(status IN ('pending','complete','failed')),
 stats_json TEXT NOT NULL CHECK(json_valid(stats_json)),evidence_json TEXT,
 interpretation_json TEXT,model_version TEXT,prompt_version TEXT NOT NULL,
 created_at TEXT NOT NULL,detail_expires_at TEXT NOT NULL,lease_until TEXT NOT NULL,error TEXT
);
CREATE UNIQUE INDEX idx_analysis_input ON analysis_reports(user_id,input_hash) WHERE status IN ('pending','complete');
CREATE INDEX idx_analysis_scope ON analysis_reports(user_id,subject_id,created_at DESC,id DESC);
CREATE INDEX idx_analysis_expiry ON analysis_reports(detail_expires_at) WHERE evidence_json IS NOT NULL OR interpretation_json IS NOT NULL;
CREATE TABLE analysis_report_questions (
 report_id TEXT NOT NULL REFERENCES analysis_reports(id) ON DELETE CASCADE,
 source_key TEXT NOT NULL,item_id TEXT REFERENCES items(id) ON DELETE CASCADE,saved_ref_id TEXT REFERENCES saved_refs(id) ON DELETE CASCADE,
 revision_id TEXT REFERENCES learning_question_revisions(id) ON DELETE CASCADE,
 PRIMARY KEY(report_id,source_key),CHECK((item_id IS NOT NULL)+(saved_ref_id IS NOT NULL)=1)
);
CREATE INDEX idx_analysis_item ON analysis_report_questions(item_id,report_id);
CREATE INDEX idx_analysis_saved ON analysis_report_questions(saved_ref_id,report_id);
CREATE TRIGGER analysis_delete_item BEFORE DELETE ON items BEGIN
 DELETE FROM analysis_reports WHERE id IN (SELECT report_id FROM analysis_report_questions WHERE item_id=OLD.id);
END;
CREATE TRIGGER analysis_delete_saved BEFORE DELETE ON saved_refs BEGIN
 DELETE FROM analysis_reports WHERE id IN (SELECT report_id FROM analysis_report_questions WHERE saved_ref_id=OLD.id);
END;
