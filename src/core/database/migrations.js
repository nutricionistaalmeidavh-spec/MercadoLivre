const { getDatabase } = require("./sqlite");

const schema = `
CREATE TABLE IF NOT EXISTS ml_tokens (
  seller_id TEXT PRIMARY KEY,
  encrypted_payload TEXT NOT NULL,
  expires_at INTEGER,
  updated_at INTEGER NOT NULL
);
CREATE TABLE IF NOT EXISTS webhook_events (
  event_key TEXT PRIMARY KEY,
  topic TEXT NOT NULL,
  resource TEXT,
  user_id TEXT,
  application_id TEXT,
  payload TEXT NOT NULL,
  status TEXT NOT NULL DEFAULT 'PENDING',
  attempts INTEGER NOT NULL DEFAULT 0,
  available_at INTEGER NOT NULL,
  last_error TEXT,
  created_at INTEGER NOT NULL,
  updated_at INTEGER NOT NULL
);
CREATE INDEX IF NOT EXISTS idx_webhook_events_queue ON webhook_events(status, available_at);
CREATE TABLE IF NOT EXISTS automation_runs (
  idempotency_key TEXT PRIMARY KEY,
  seller_id TEXT NOT NULL,
  order_id TEXT NOT NULL,
  automation_type TEXT NOT NULL,
  automation_version TEXT NOT NULL,
  state TEXT NOT NULL,
  reason TEXT,
  message_id TEXT,
  created_at INTEGER NOT NULL,
  updated_at INTEGER NOT NULL
);
CREATE TABLE IF NOT EXISTS message_attempts (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  idempotency_key TEXT NOT NULL,
  order_id TEXT NOT NULL,
  pack_id TEXT,
  status TEXT NOT NULL,
  http_status INTEGER,
  response TEXT,
  created_at INTEGER NOT NULL
);
`;

function migrate() {
  const db = getDatabase();
  db.exec(schema);
  return db;
}

module.exports = { migrate, schema };
