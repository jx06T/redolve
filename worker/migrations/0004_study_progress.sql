-- Additive, safe to repeat. Does not change source items or shared layers.
CREATE TABLE IF NOT EXISTS collection_item_progress (
 user_id TEXT NOT NULL REFERENCES users(id),
 entry_id TEXT NOT NULL REFERENCES collection_items(id),
 status TEXT NOT NULL DEFAULT 'unsolved' CHECK(status IN ('unsolved','resolved','archived')),
 previous_status TEXT NOT NULL DEFAULT 'unsolved' CHECK(previous_status IN ('unsolved','resolved')),
 review_count INTEGER NOT NULL DEFAULT 0 CHECK(review_count>=0),
 row_version INTEGER NOT NULL DEFAULT 0,
 updated_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
 PRIMARY KEY(user_id,entry_id)
);
