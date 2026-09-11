const L = require("./_lib");
const { migrate } = require("../src/core/database/migrations");
const { processOne } = require("../src/modules/mercado-livre/jobs/worker");

module.exports = async (req, res) => {
  try {
    if (!L.requireAdmin(req, res)) return;
    const url = new URL(req.url, "https://x");
    const op = url.searchParams.get("op") || "status";
    const db = migrate();

    if (op === "status" && req.method === "GET") {
      const queue = db.prepare("SELECT status, COUNT(*) AS count FROM webhook_events GROUP BY status").all();
      const recent = db.prepare(`
        SELECT idempotency_key, seller_id, order_id, automation_type, automation_version, state, reason, message_id, updated_at
          FROM automation_runs ORDER BY updated_at DESC LIMIT 25
      `).all();
      return L.json(res, 200, {
        ok: true,
        mode: process.env.ML_AUTOMATION_MODE || "dry-run",
        queue,
        recent
      });
    }

    if (op === "process-one" && req.method === "POST") {
      return L.json(res, 200, { ok: true, result: await processOne() });
    }

    return L.json(res, 404, { error: "Operação inválida." });
  } catch (error) {
    return L.json(res, 500, { error: error.message });
  }
};
