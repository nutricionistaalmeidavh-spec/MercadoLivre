const { migrate } = require("../../../core/database/migrations");

function buildKey({ sellerId, orderId, automationType = "AFTER_SALE", automationVersion = "v1" }) {
  return [String(sellerId), String(orderId), automationType, automationVersion].join(":");
}

function beginRun(input) {
  const db = migrate();
  const key = buildKey(input);
  const now = Date.now();
  const result = db.prepare(`
    INSERT OR IGNORE INTO automation_runs
      (idempotency_key, seller_id, order_id, automation_type, automation_version, state, created_at, updated_at)
    VALUES (?, ?, ?, ?, ?, 'RECEIVED', ?, ?)
  `).run(
    key,
    String(input.sellerId),
    String(input.orderId),
    input.automationType || "AFTER_SALE",
    input.automationVersion || "v1",
    now,
    now
  );
  return { key, isNew: result.changes === 1 };
}

function getRun(key) {
  return migrate().prepare("SELECT * FROM automation_runs WHERE idempotency_key = ?").get(key) || null;
}

module.exports = { buildKey, beginRun, getRun };
