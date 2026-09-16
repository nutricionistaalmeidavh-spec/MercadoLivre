const L = require("./_lib");
const { enqueueNotification } = require("../src/modules/mercado-livre/notifications/notificationService");

module.exports = async (req, res) => {
  try {
    if (req.method !== "POST") return L.json(res, 405, { error: "Método não permitido." });
    const payload = await L.body(req);
    if (payload.topic !== "orders_v2") {
      return L.json(res, 200, { ok: true, ignored: true, reason: "UNSUPPORTED_TOPIC" });
    }
    const expectedAppId = String(process.env.ML_APPLICATION_ID || process.env.ML_CLIENT_ID || L.env().clientId || "");
    if (expectedAppId && payload.application_id != null && String(payload.application_id) !== expectedAppId) {
      return L.json(res, 403, { error: "application_id não corresponde à aplicação configurada." });
    }
    if (!/^\/orders\/\d+/.test(String(payload.resource || ""))) {
      return L.json(res, 400, { error: "resource de pedido inválido." });
    }
    const queued = enqueueNotification(payload);
    return L.json(res, 200, { ok: true, queued: queued.inserted, event_key: queued.eventKey });
  } catch (error) {
    return L.json(res, 400, { error: error.message });
  }
};
