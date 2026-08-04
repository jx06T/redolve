-- Redolve Database Schema v1.3.0

-- 使用者帳號表 (Google OAuth 寫入)
CREATE TABLE IF NOT EXISTS users (
    id TEXT PRIMARY KEY,
    email TEXT UNIQUE NOT NULL,
    name TEXT,
    created_at DATETIME DEFAULT CURRENT_TIMESTAMP
);

-- API 授權金鑰表 (供 iOS 捷徑使用，使用 bcrypt hash 儲存)
CREATE TABLE IF NOT EXISTS api_keys (
    key_hash TEXT PRIMARY KEY,
    key_prefix TEXT NOT NULL,
    user_id TEXT NOT NULL,
    description TEXT,
    created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
    FOREIGN KEY(user_id) REFERENCES users(id) ON DELETE CASCADE
);

-- 課綱分類樹表 (學測/分科測驗標準)
CREATE TABLE IF NOT EXISTS taxonomies (
    id TEXT PRIMARY KEY,
    parent_id TEXT,
    label TEXT NOT NULL,
    level INTEGER NOT NULL,
    FOREIGN KEY(parent_id) REFERENCES taxonomies(id)
);

-- 錯題/筆記主表 (image_url 儲存 R2 私有 object key)
CREATE TABLE IF NOT EXISTS items (
    id TEXT PRIMARY KEY,
    user_id TEXT NOT NULL,
    type TEXT NOT NULL DEFAULT 'problem',
    topic_id TEXT,
    keywords TEXT,
    keyword_tokens TEXT,
    source TEXT,
    image_url TEXT NOT NULL,
    draw_data TEXT,
    typed_notes TEXT,
    status TEXT DEFAULT 'processing',
    review_count INTEGER DEFAULT 0,
    vector_clock TEXT,
    updated_at DATETIME DEFAULT CURRENT_TIMESTAMP,
    created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
    FOREIGN KEY(user_id) REFERENCES users(id) ON DELETE CASCADE,
    FOREIGN KEY(topic_id) REFERENCES taxonomies(id)
);

-- 分享金鑰表 (供唯讀分享使用，expires_at 为 NULL 表示手動撤銷)
CREATE TABLE IF NOT EXISTS shares (
    token TEXT PRIMARY KEY,
    item_id TEXT NOT NULL,
    user_id TEXT NOT NULL,
    allow_ink INTEGER DEFAULT 1,
    expires_at DATETIME,
    created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
    FOREIGN KEY(item_id) REFERENCES items(id) ON DELETE CASCADE
);

-- 查詢效能最佳化索引
CREATE INDEX IF NOT EXISTS idx_user_status ON items(user_id, status);
CREATE INDEX IF NOT EXISTS idx_user_topic_id ON items(user_id, topic_id);
CREATE INDEX IF NOT EXISTS idx_user_created ON items(user_id, created_at DESC, id DESC);

-- FTS5 全文檢索虛擬表 (包含細粒度中文 token)
CREATE VIRTUAL TABLE IF NOT EXISTS items_fts USING fts5(
    id UNINDEXED,
    user_id UNINDEXED,
    source,
    keyword_tokens
);
