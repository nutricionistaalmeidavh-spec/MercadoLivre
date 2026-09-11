const tokenService = require("../auth/tokenService");
const { request } = require("../../../core/http/mercadoLivreClient");
const { migrate } = require("../../../core/database/migrations");

function isModerated(data) {
  const status = String(data?.status || "").toLowerCase();
  const moderation = String(data?.message_moderation?.status || data?.moderation?.status || "").toLowerCase();
  return status === "moderated" || status === "rejected" || moderation === "rejected";
}

async function sendOtherMessage({ packId, sellerId, text, idempotencyKey }) {
  const token = await tokenService.getValidToken(sellerId);
  const response = await request(
    `/messages/action_guide/packs/${encodeURIComponent(packId)}/option?tag=post_sale`,
    {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ option_id: "OTHER", text: String(text).trim() })
    },
    token.access_token
  );

  const moderated = response.ok && isModerated(response.data);
  const db = migrate();
  db.prepare(`
    INSERT INTO message_attempts (idempotency_key, order_id, pack_id, status, http_status, response, created_at)
    VALUES (?, ?, ?, ?, ?, ?, ?)
  `).run(
    idempotencyKey,
    String(idempotencyKey).split(":")[1] || "unknown",
    String(packId),
    moderated ? "MODERATED" : (response.ok ? "SENT" : "FAILED"),
    Number(response.status || 0),
    JSON.stringify(response.data ?? null),
    Date.now()
  );

  if (!response.ok || moderated) {
    const error = new Error(moderated ? "Mensagem pós-venda moderada pelo Mercado Livre." : "Mercado Livre recusou a mensagem pós-venda.");
    error.statusCode = response.status;
    error.details = response.data;
    error.retryable = !moderated && (response.status === 429 || response.status >= 500);
    throw error;
  }
  return response.data;
}

module.exports = { sendOtherMessage, isModerated };
