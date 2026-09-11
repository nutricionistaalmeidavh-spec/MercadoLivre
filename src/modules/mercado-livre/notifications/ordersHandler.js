const { runAfterSale } = require("../automations/afterSale");

function orderIdFromResource(resource) {
  const match = String(resource || "").match(/\/orders\/(\d+)/);
  return match ? match[1] : null;
}

async function handleOrderNotification(payload) {
  if (payload.topic !== "orders_v2") return { ignored: true, reason: "UNSUPPORTED_TOPIC" };
  const orderId = orderIdFromResource(payload.resource);
  if (!orderId) throw new Error("Notificação orders_v2 sem order_id válido.");
  if (payload.user_id == null) throw new Error("Notificação orders_v2 sem user_id do seller.");
  return runAfterSale({ orderId, sellerId: String(payload.user_id) });
}

module.exports = { handleOrderNotification, orderIdFromResource };
