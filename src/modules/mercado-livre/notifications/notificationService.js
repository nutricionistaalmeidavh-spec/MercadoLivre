const crypto = require("crypto");
const { migrate } = require("../../../core/database/migrations");

function eventKey(payload) {
  const stable = [payload.topic, payload.resource, payload.user_id, payload.sent || payload.received || ""].join("|");
  return crypto.createHash("sha256").update(stable).digest("hex");
}

function enqueueNotification(payload) {
  if (!payload || !payload.topic || !payload.resource) throw new Error("Notificação inválida.");
  const db = migrate();
  const now = Date.now();
  const key = eventKey(payload);
  const result = db.prepare(`
    INSERT OR IGNORE INTO webhook_events
      (event_key, topic, resource, user_id, application_id, payload, status, attempts, available_at, created_at, updated_at)
    VALUES (?, ?, ?, ?, ?, ?, 'PENDING', 0, ?, ?, ?)
  `).run(
    key,
    String(payload.topic),
    String(payload.resource),
    payload.user_id == null ? null : String(payload.user_id),
    payload.application_id == null ? null : String(payload.application_id),
    JSON.stringify(payload),
    now,
    now,
    now
  );
  return { eventKey: key, inserted: result.changes === 1 };
}

module.exports = { enqueueNotification, eventKey };
