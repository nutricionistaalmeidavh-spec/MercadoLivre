const { migrate } = require("../../../core/database/migrations");
const { handleOrderNotification } = require("../notifications/ordersHandler");

const MAX_ATTEMPTS = Number(process.env.ML_JOB_MAX_ATTEMPTS || 5);

function claimNext() {
  const db = migrate();
  const now = Date.now();
  db.exec("BEGIN IMMEDIATE");
  try {
    const row = db.prepare(`
      SELECT * FROM webhook_events
       WHERE status = 'PENDING' AND available_at <= ?
       ORDER BY created_at ASC
       LIMIT 1
    `).get(now);
    if (!row) {
      db.exec("COMMIT");
      return null;
    }
    const updated = db.prepare(`
      UPDATE webhook_events
         SET status='PROCESSING', attempts=attempts+1, updated_at=?
       WHERE event_key=? AND status='PENDING'
    `).run(now, row.event_key);
    const claimed = updated.changes === 1
      ? db.prepare("SELECT * FROM webhook_events WHERE event_key=?").get(row.event_key)
      : null;
    db.exec("COMMIT");
    return claimed;
  } catch (error) {
    try { db.exec("ROLLBACK"); } catch {}
    throw error;
  }
}

function backoffMs(attempt) {
  return Math.min(15 * 60_000, 5_000 * (2 ** Math.max(0, attempt - 1)));
}

async function processOne() {
  const event = claimNext();
  if (!event) return { processed: false };
  const db = migrate();
  try {
    const payload = JSON.parse(event.payload);
    let result;
    if (event.topic === "orders_v2") result = await handleOrderNotification(payload);
    else result = { ignored: true, reason: "UNSUPPORTED_TOPIC" };

    db.prepare(`UPDATE webhook_events SET status='DONE', last_error=NULL, updated_at=? WHERE event_key=?`)
      .run(Date.now(), event.event_key);
    return { processed: true, eventKey: event.event_key, result };
  } catch (error) {
    const retryable = error.retryable === true || error.statusCode === 429 || Number(error.statusCode) >= 500;
    const canRetry = retryable && event.attempts < MAX_ATTEMPTS;
    db.prepare(`
      UPDATE webhook_events
         SET status=?, available_at=?, last_error=?, updated_at=?
       WHERE event_key=?
    `).run(
      canRetry ? "PENDING" : "DEAD",
      canRetry ? Date.now() + backoffMs(event.attempts) : Date.now(),
      String(error.message || error),
      Date.now(),
      event.event_key
    );
    return { processed: true, eventKey: event.event_key, error: error.message, retry: canRetry };
  }
}

function startWorker({ intervalMs = Number(process.env.ML_WORKER_INTERVAL_MS || 2000) } = {}) {
  let running = false;
  const tick = async () => {
    if (running) return;
    running = true;
    try {
      while ((await processOne()).processed) {}
    } finally {
      running = false;
    }
  };
  const timer = setInterval(() => void tick(), intervalMs);
  timer.unref?.();
  void tick();
  return () => clearInterval(timer);
}

module.exports = { claimNext, processOne, startWorker, backoffMs };
