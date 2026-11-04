CREATE TABLE personal_weaknesses (
 id TEXT PRIMARY KEY,
 user_id TEXT NOT NULL REFERENCES users(id) ON DELETE CASCADE,
 subject_id TEXT NOT NULL REFERENCES taxonomies(id) ON DELETE CASCADE,
 title TEXT NOT NULL, title_key TEXT NOT NULL, target TEXT NOT NULL,
 UNIQUE(user_id,subject_id,title_key)
);
CREATE TABLE practice_weakness_reviews (
 attempt_id TEXT NOT NULL REFERENCES practice_attempts(id) ON DELETE CASCADE,
 user_id TEXT NOT NULL REFERENCES users(id) ON DELETE CASCADE,
 learning_question_id TEXT NOT NULL REFERENCES learning_questions(id) ON DELETE CASCADE,
 version INTEGER NOT NULL CHECK(version>0),
 weakness_ids TEXT NOT NULL CHECK(json_valid(weakness_ids) AND json_type(weakness_ids)='array'),
 recorded_at TEXT NOT NULL,
 PRIMARY KEY(attempt_id,version)
);
CREATE INDEX idx_practice_weakness_scope ON practice_weakness_reviews(user_id,learning_question_id,recorded_at,attempt_id);
