-- 0011 was withdrawn. Independent plans do not rebuild existing widget tables.
CREATE TABLE IF NOT EXISTS study_progress_plans (
 id TEXT PRIMARY KEY,
 user_id TEXT NOT NULL REFERENCES users(id) ON DELETE CASCADE,
 name TEXT NOT NULL,
 unit TEXT NOT NULL,
 target_count INTEGER NOT NULL CHECK(typeof(target_count)='integer' AND target_count BETWEEN 1 AND 1000000),
 completed_count INTEGER NOT NULL DEFAULT 0 CHECK(typeof(completed_count)='integer' AND completed_count>=0),
 created_at INTEGER NOT NULL,
 updated_at INTEGER NOT NULL,
 row_version INTEGER NOT NULL DEFAULT 1,
 deleted_at INTEGER
);
CREATE INDEX IF NOT EXISTS idx_study_progress_active ON study_progress_plans(user_id,created_at,id) WHERE deleted_at IS NULL;
CREATE TABLE IF NOT EXISTS study_progress_preferences (
 user_id TEXT PRIMARY KEY REFERENCES users(id) ON DELETE CASCADE,
 visible INTEGER NOT NULL DEFAULT 1 CHECK(visible IN (0,1)),
 plan_order TEXT NOT NULL DEFAULT '[]' CHECK(json_valid(plan_order) AND json_type(plan_order)='array'),
 row_version INTEGER NOT NULL DEFAULT 1,
 updated_at INTEGER NOT NULL
);
CREATE TABLE IF NOT EXISTS study_progress_operations (
 id TEXT PRIMARY KEY,
 user_id TEXT NOT NULL REFERENCES users(id) ON DELETE CASCADE,
 plan_id TEXT NOT NULL REFERENCES study_progress_plans(id) ON DELETE CASCADE,
 delta INTEGER NOT NULL CHECK(delta IN (-1,1)),
 effect INTEGER NOT NULL CHECK(effect IN (-1,0,1)),
 applied INTEGER NOT NULL DEFAULT 0 CHECK(applied IN (0,1)),
 created_at INTEGER NOT NULL
);
CREATE INDEX IF NOT EXISTS idx_study_progress_operations_plan ON study_progress_operations(plan_id);
