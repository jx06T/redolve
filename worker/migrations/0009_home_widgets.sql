-- Private homepage widgets. Deleted rows keep only an identity tombstone so
-- delayed offline requests cannot resurrect deleted/completed content.
CREATE TABLE IF NOT EXISTS home_widget_items (
 id TEXT PRIMARY KEY,
 user_id TEXT NOT NULL REFERENCES users(id) ON DELETE CASCADE,
 kind TEXT NOT NULL CHECK(kind IN ('todo','countdown')),
 text TEXT NOT NULL,
 target_date TEXT,
 completed_at INTEGER,
 created_at INTEGER NOT NULL,
 updated_at INTEGER NOT NULL,
 row_version INTEGER NOT NULL DEFAULT 1,
 deleted_at INTEGER
);
CREATE INDEX IF NOT EXISTS idx_home_widgets_active ON home_widget_items(user_id,kind,created_at,id) WHERE deleted_at IS NULL;
CREATE INDEX IF NOT EXISTS idx_home_widgets_expiry ON home_widget_items(user_id,completed_at) WHERE kind='todo' AND deleted_at IS NULL AND completed_at IS NOT NULL;
CREATE TABLE IF NOT EXISTS home_widget_preferences (
 user_id TEXT PRIMARY KEY REFERENCES users(id) ON DELETE CASCADE,
 todos_visible INTEGER NOT NULL DEFAULT 1 CHECK(todos_visible IN (0,1)),
 countdowns_visible INTEGER NOT NULL DEFAULT 1 CHECK(countdowns_visible IN (0,1)),
 row_version INTEGER NOT NULL DEFAULT 1,
 updated_at INTEGER NOT NULL
);
