const { migrate } = require("../../../core/database/migrations");

const FINAL_STATES = new Set(["SENT", "SKIPPED", "FAILED_FINAL"]);

function transition(key, state, { reason = null, messageId = null } = {}) {
  const db = migrate();
  const current = db.prepare("SELECT state FROM automation_runs WHERE idempotency_key = ?").get(key);
  if (!current) throw new Error("Execução de automação não encontrada.");
  if (FINAL_STATES.has(current.state) && current.state !== state) {
    throw new Error(`Execução já finalizada em ${current.state}.`);
  }
  db.prepare(`
    UPDATE automation_runs
       SET state = ?, reason = ?, message_id = COALESCE(?, message_id), updated_at = ?
     WHERE idempotency_key = ?
  `).run(state, reason, messageId, Date.now(), key);
  return db.prepare("SELECT * FROM automation_runs WHERE idempotency_key = ?").get(key);
}

module.exports = { transition, FINAL_STATES };
