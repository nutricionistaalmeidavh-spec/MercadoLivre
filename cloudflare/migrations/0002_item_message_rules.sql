CREATE TABLE IF NOT EXISTS item_message_rules (
  seller_id TEXT NOT NULL,
  item_id TEXT NOT NULL,
  item_title TEXT,
  message TEXT NOT NULL DEFAULT '',
  enabled INTEGER NOT NULL DEFAULT 0 CHECK (enabled IN (0, 1)),
  created_at INTEGER NOT NULL,
  updated_at INTEGER NOT NULL,
  PRIMARY KEY (seller_id, item_id)
);

CREATE INDEX IF NOT EXISTS idx_item_message_rules_enabled
  ON item_message_rules (seller_id, enabled, updated_at DESC);
