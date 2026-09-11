const { migrate } = require("../src/core/database/migrations");

module.exports = async (_req, res) => {
  try {
    const db = migrate();
    db.prepare("SELECT 1 AS ok").get();
    const queue = db.prepare("SELECT COUNT(*) AS count FROM webhook_events WHERE status='PENDING'").get();
    res.statusCode = 200;
    res.setHeader("content-type", "application/json; charset=utf-8");
    res.setHeader("cache-control", "no-store");
    res.end(JSON.stringify({ ok: true, database: "ok", pending_jobs: queue.count, mode: process.env.ML_AUTOMATION_MODE || "dry-run" }));
  } catch (error) {
    res.statusCode = 503;
    res.setHeader("content-type", "application/json; charset=utf-8");
    res.end(JSON.stringify({ ok: false, database: "error", error: error.message }));
  }
};
