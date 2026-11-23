CREATE TABLE IF NOT EXISTS profile_state (
  id TEXT PRIMARY KEY,
  revision INTEGER NOT NULL,
  updated_at TEXT NOT NULL,
  profile_json TEXT NOT NULL
);

CREATE TABLE IF NOT EXISTS feedback_events (
  id TEXT PRIMARY KEY,
  post_id TEXT NOT NULL,
  author_handle TEXT NOT NULL,
  action TEXT NOT NULL,
  reason_tag TEXT,
  synced_to_x INTEGER NOT NULL DEFAULT 0,
  source_client TEXT NOT NULL DEFAULT 'unknown',
  created_at TEXT NOT NULL,
  post_snippet TEXT,
  quoted_snippet TEXT,
  terms_json TEXT,
  embedding_json TEXT
);

CREATE INDEX IF NOT EXISTS idx_feedback_created_at
  ON feedback_events(created_at DESC);

CREATE TABLE IF NOT EXISTS judge_cache (
  post_id TEXT PRIMARY KEY,
  profile_rev INTEGER NOT NULL,
  verdict_json TEXT NOT NULL,
  created_at TEXT NOT NULL
);

CREATE TABLE IF NOT EXISTS story_snoozes (
  id TEXT PRIMARY KEY,
  post_id TEXT NOT NULL,
  label TEXT NOT NULL,
  terms_json TEXT NOT NULL,
  embedding_json TEXT,
  created_at TEXT NOT NULL,
  expires_at TEXT NOT NULL,
  source_client TEXT NOT NULL DEFAULT 'unknown'
);

CREATE INDEX IF NOT EXISTS idx_snoozes_expires_at
  ON story_snoozes(expires_at);
