-- Independent submissions; no legacy review_count is converted to an attempt.
CREATE TABLE practice_attempts (
 id TEXT PRIMARY KEY,
 user_id TEXT NOT NULL REFERENCES users(id) ON DELETE CASCADE,
 learning_question_id TEXT NOT NULL REFERENCES learning_questions(id) ON DELETE CASCADE,
 revision_id TEXT NOT NULL REFERENCES learning_question_revisions(id) ON DELETE CASCADE,
 session_id TEXT NOT NULL, session_item_id TEXT NOT NULL,
 answer_json TEXT NOT NULL CHECK(json_valid(answer_json)),
 result TEXT NOT NULL CHECK(result IN ('correct','incorrect')),
 grading_method TEXT NOT NULL CHECK(grading_method IN ('automatic','self')),
 grading_basis_json TEXT NOT NULL CHECK(json_valid(grading_basis_json)),
 client_answered_at TEXT NOT NULL, answered_at TEXT NOT NULL, received_at TEXT NOT NULL,
 client_timezone TEXT NOT NULL, time_quality TEXT NOT NULL CHECK(time_quality IN ('client','adjusted')),
 used_original_image INTEGER NOT NULL CHECK(used_original_image IN (0,1)),
 request_hash TEXT NOT NULL,
 supersedes_attempt_id TEXT UNIQUE REFERENCES practice_attempts(id) ON DELETE CASCADE,
 voided_at TEXT
);
CREATE UNIQUE INDEX idx_practice_session_item ON practice_attempts(user_id,session_item_id) WHERE supersedes_attempt_id IS NULL;
CREATE INDEX idx_practice_period ON practice_attempts(user_id,answered_at,id);
CREATE INDEX idx_practice_history ON practice_attempts(user_id,learning_question_id,answered_at DESC,received_at DESC,id DESC);
CREATE INDEX idx_practice_latest ON practice_attempts(user_id,learning_question_id,answered_at DESC,received_at DESC,id DESC) WHERE voided_at IS NULL;
CREATE INDEX idx_learning_items_scope ON items(user_id,topic_id,id);
CREATE INDEX idx_learning_saved_scope ON saved_refs(user_id,personal_topic_id,id);
CREATE TRIGGER practice_owner BEFORE INSERT ON practice_attempts
WHEN NOT EXISTS(SELECT 1 FROM learning_questions q JOIN learning_question_revisions r ON r.learning_question_id=q.id
 WHERE q.id=NEW.learning_question_id AND q.user_id=NEW.user_id AND r.id=NEW.revision_id)
BEGIN SELECT RAISE(ABORT,'practice owner mismatch'); END;
CREATE TRIGGER practice_immutable BEFORE UPDATE ON practice_attempts
WHEN NEW.id IS NOT OLD.id OR NEW.user_id IS NOT OLD.user_id OR NEW.learning_question_id IS NOT OLD.learning_question_id
 OR NEW.revision_id IS NOT OLD.revision_id OR NEW.answer_json IS NOT OLD.answer_json OR NEW.result IS NOT OLD.result
 OR NEW.grading_method IS NOT OLD.grading_method OR NEW.grading_basis_json IS NOT OLD.grading_basis_json
 OR NEW.answered_at IS NOT OLD.answered_at OR NEW.received_at IS NOT OLD.received_at OR NEW.request_hash IS NOT OLD.request_hash
 OR NEW.session_id IS NOT OLD.session_id OR NEW.session_item_id IS NOT OLD.session_item_id
 OR NEW.client_answered_at IS NOT OLD.client_answered_at OR NEW.client_timezone IS NOT OLD.client_timezone
 OR NEW.time_quality IS NOT OLD.time_quality OR NEW.used_original_image IS NOT OLD.used_original_image
 OR NEW.supersedes_attempt_id IS NOT OLD.supersedes_attempt_id OR OLD.voided_at IS NOT NULL
BEGIN SELECT RAISE(ABORT,'practice attempts are immutable'); END;
