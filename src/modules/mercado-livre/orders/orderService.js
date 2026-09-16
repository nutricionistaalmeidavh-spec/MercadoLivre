const tokenService = require("../auth/tokenService");
const { request } = require("../../../core/http/mercadoLivreClient");

function normalizeOrder(order) {
  const payments = Array.isArray(order.payments) ? order.payments : [];
  const paid = payments.length > 0 && payments.every(payment => ["approved", "accredited"].includes(payment.status));
  return {
    orderId: String(order.id),
    packId: order.pack_id != null ? String(order.pack_id) : null,
    sellerId: order.seller?.id != null ? String(order.seller.id) : null,
    buyerId: order.buyer?.id != null ? String(order.buyer.id) : null,
    itemIds: (order.order_items || []).map(entry => String(entry.item?.id)).filter(Boolean),
    status: order.status || null,
    paymentStatus: paid ? "approved" : (payments[0]?.status || null),
    cancelled: order.status === "cancelled" || !!order.cancel_detail,
    fraudRisk: Array.isArray(order.tags) && order.tags.includes("fraud_risk_detected"),
    createdAt: order.date_created || null,
    raw: order
  };
}

async function getOrder(orderId, sellerId) {
  const token = await tokenService.getValidToken(sellerId);
  const response = await request(`/orders/${encodeURIComponent(orderId)}`, {}, token.access_token);
  if (!response.ok) {
    const error = new Error("Falha ao consultar pedido do Mercado Livre.");
    error.statusCode = response.status;
    error.details = response.data;
    throw error;
  }
  return normalizeOrder(response.data);
}

module.exports = { getOrder, normalizeOrder };
