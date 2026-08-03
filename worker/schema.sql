-- 使用者帳號表 (Google OAuth 寫入)
CREATE TABLE IF NOT EXISTS users (
    id TEXT PRIMARY KEY,               -- UUID
    email TEXT UNIQUE NOT NULL,
    name TEXT,
    created_at DATETIME DEFAULT CURRENT_TIMESTAMP
);

-- API 授權金鑰表 (供 iOS 捷徑使用)
CREATE TABLE IF NOT EXISTS api_keys (
    key TEXT PRIMARY KEY,              -- 加上前綴的隨機字串 (ex: rdv_xxx)
    user_id TEXT NOT NULL,
    description TEXT,                  -- ex: "iPad 捷徑專用"
    created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
    FOREIGN KEY(user_id) REFERENCES users(id) ON DELETE CASCADE
);

-- 錯題/筆記主表
CREATE TABLE IF NOT EXISTS items (
    id TEXT PRIMARY KEY,
    user_id TEXT NOT NULL,             -- 多租戶資料隔離關鍵
    type TEXT NOT NULL DEFAULT 'problem', -- 'problem' | 'note'
    subject TEXT,                      -- 符合學測/分科測驗課綱標準
    source TEXT,                       
    topic TEXT,                        -- 符合學測/分科測驗課綱標準
    keywords TEXT,                     -- JSON Array (AI 動態生成 + 使用者自訂)
    image_url TEXT NOT NULL,           
    draw_data TEXT,                    -- 向量筆跡與局部擦除遮罩 JSON
    status TEXT DEFAULT 'unsolved',    -- 'processing' | 'unsolved' | 'resolved'
    review_count INTEGER DEFAULT 0,    
    created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
    FOREIGN KEY(user_id) REFERENCES users(id) ON DELETE CASCADE
);

-- 分享金鑰表 (供唯讀分享使用)
CREATE TABLE IF NOT EXISTS shares (
    token TEXT PRIMARY KEY,            -- 短網址加密 Key (ex: st_abc123)
    item_id TEXT NOT NULL,
    user_id TEXT NOT NULL,
    allow_ink INTEGER DEFAULT 1,       -- 1: 包含筆跡, 0: 隱藏筆跡
    expires_at DATETIME,
    created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
    FOREIGN KEY(item_id) REFERENCES items(id) ON DELETE CASCADE
);

-- 查詢效能最佳化索引
CREATE INDEX IF NOT EXISTS idx_user_subject_topic ON items(user_id, subject, topic);
CREATE INDEX IF NOT EXISTS idx_user_status ON items(user_id, status);

-- FTS5 全文檢索虛擬表 (包含空白分隔的中文標籤，解決 unicode61 中文搜尋問題)
CREATE VIRTUAL TABLE IF NOT EXISTS items_fts USING fts5(id UNINDEXED, user_id UNINDEXED, subject, source, topic, keywords);
