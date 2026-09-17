CREATE TABLE IF NOT EXISTS audit_events (
  id TEXT PRIMARY KEY,
  at INTEGER NOT NULL,
  actor_id TEXT NOT NULL,
  action TEXT NOT NULL,
  entity_type TEXT,
  entity_id TEXT,
  metadata TEXT NOT NULL DEFAULT '{}'
);

CREATE INDEX IF NOT EXISTS idx_audit_events_at ON audit_events(at DESC);
CREATE INDEX IF NOT EXISTS idx_audit_events_entity ON audit_events(entity_type, entity_id, at DESC);
CREATE INDEX IF NOT EXISTS idx_audit_events_action ON audit_events(action, at DESC);

CREATE TABLE IF NOT EXISTS alerts (
  id TEXT PRIMARY KEY,
  entity_kind TEXT NOT NULL,
  entity_id TEXT NOT NULL,
  title TEXT NOT NULL,
  severity TEXT NOT NULL,
  status TEXT NOT NULL DEFAULT 'active',
  reason TEXT,
  metadata TEXT NOT NULL DEFAULT '{}',
  created_at INTEGER NOT NULL,
  updated_at INTEGER NOT NULL,
  acknowledged_at INTEGER,
  acknowledged_by TEXT,
  dismissed_at INTEGER,
  dismissed_by TEXT,
  dismiss_reason TEXT
);

CREATE INDEX IF NOT EXISTS idx_alerts_status_updated ON alerts(status, updated_at DESC);
CREATE INDEX IF NOT EXISTS idx_alerts_entity ON alerts(entity_kind, entity_id, updated_at DESC);
CREATE INDEX IF NOT EXISTS idx_alerts_reason ON alerts(reason, updated_at DESC);
