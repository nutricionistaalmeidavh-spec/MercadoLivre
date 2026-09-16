import { getValidToken } from "./token-service.mjs";
import { recordMessageAttempt } from "./repository.mjs";

export async function mlRequest(path, token, options = {}) {
  const headers = { accept: "application/json", ...(options.headers || {}) };
  if (token) headers.authorization = `Bearer ${token}`;
  const response = await fetch(`https://api.mercadolibre.com${path}`, { ...options, headers });
  const text = await response.text();
  let data = {};
  try { data = text ? JSON.parse(text) : {}; } catch { data = { text }; }
  return { ok: response.ok, status: response.status, data };
}

export function normalizeOrder(data) {
  const payments = Array.isArray(data?.payments) ? data.payments : [];
  const approved = payments.some((payment) => payment?.status === "approved");
  const rejected = payments.some((payment) => ["rejected", "cancelled", "refunded", "charged_back"].includes(payment?.status));
  const itemIds = [...new Set((Array.isArray(data?.order_items) ? data.order_items : [])
    .map((entry) => String(entry?.item?.id || "").trim())
    .filter(Boolean))];
  return {
    orderId: String(data?.id || ""),
    packId: data?.pack_id == null ? null : String(data.pack_id),
    sellerId: String(data?.seller?.id || ""),
    buyerId: String(data?.buyer?.id || ""),
    itemIds,
    status: String(data?.status || ""),
    paymentApproved: approved,
    paymentRejected: rejected,
    cancelled: String(data?.status || "") === "cancelled",
    fraudRisk: Boolean(data?.tags?.includes?.("fraud_risk_detected")),
    raw: data
  };
}

export function evaluateOrderEligibility(order) {
  if (!order?.orderId || !order?.sellerId) return { eligible: false, reason: "INVALID_ORDER" };
  if (order.cancelled) return { eligible: false, reason: "ORDER_CANCELLED" };
  if (order.fraudRisk) return { eligible: false, reason: "FRAUD_RISK" };
  if (!order.paymentApproved) return { eligible: false, reason: order.paymentRejected ? "PAYMENT_REJECTED" : "PAYMENT_NOT_APPROVED" };
  if (!order.packId) return { eligible: false, reason: "PACK_ID_MISSING" };
  if (!Array.isArray(order.itemIds) || !order.itemIds.length) return { eligible: false, reason: "ORDER_ITEMS_MISSING" };
  return { eligible: true, reason: "ELIGIBLE" };
}

export async function fetchOrder(env, orderId, sellerId) {
  const token = await getValidToken(env, sellerId);
  const response = await mlRequest(`/orders/${encodeURIComponent(orderId)}`, token.access_token);
  if (!response.ok) {
    const error = new Error("Falha ao consultar pedido no Mercado Livre.");
    error.statusCode = response.status;
    error.retryable = response.status === 429 || response.status >= 500;
    throw error;
  }
  const order = normalizeOrder(response.data);
  if (String(order.sellerId) !== String(sellerId)) {
    const error = new Error("Pedido não pertence ao seller da notificação.");
    error.retryable = false;
    throw error;
  }
  return order;
}

function findOtherOption(value) {
  if (!value || typeof value !== "object") return null;
  if (value.option_id === "OTHER") return value;
  for (const child of Object.values(value)) {
    if (Array.isArray(child)) {
      for (const entry of child) {
        const found = findOtherOption(entry);
        if (found) return found;
      }
    } else if (child && typeof child === "object") {
      const found = findOtherOption(child);
      if (found) return found;
    }
  }
  return null;
}

function findOtherCap(value) {
  if (!value || typeof value !== "object") return null;
  if (value.option_id === "OTHER" && typeof value.cap_available === "number") return value.cap_available;
  for (const child of Object.values(value)) {
    if (Array.isArray(child)) {
      for (const entry of child) {
        const found = findOtherCap(entry);
        if (found != null) return found;
      }
    } else if (child && typeof child === "object") {
      const found = findOtherCap(child);
      if (found != null) return found;
    }
  }
  return null;
}

export function evaluateMessagePolicy({ guide, caps, text }) {
  if (!guide?.ok) return { allowed: false, reason: "ACTION_GUIDE_UNAVAILABLE" };
  if (!caps?.ok) return { allowed: false, reason: "CAPS_UNAVAILABLE" };
  const option = findOtherOption(guide.data);
  if (!option) return { allowed: false, reason: "OTHER_NOT_AVAILABLE" };
  const cap = findOtherCap(caps.data);
  if (cap == null || cap < 1) return { allowed: false, reason: "NO_OTHER_MESSAGE_CAP" };
  const normalized = String(text || "").trim();
  const charLimit = Number(option.char_limit || guide.data?.char_limit || 350);
  if (!normalized) return { allowed: false, reason: "EMPTY_MESSAGE" };
  if (normalized.length > charLimit) return { allowed: false, reason: "MESSAGE_TOO_LONG", charLimit };
  return { allowed: true, reason: "OTHER_ALLOWED", text: normalized, charLimit, capAvailable: cap };
}

export async function fetchMessagePolicy(env, packId, sellerId, text) {
  const token = await getValidToken(env, sellerId);
  const base = `/messages/action_guide/packs/${encodeURIComponent(packId)}`;
  const [guide, caps] = await Promise.all([
    mlRequest(`${base}?tag=post_sale`, token.access_token),
    mlRequest(`${base}/caps_available?tag=post_sale`, token.access_token)
  ]);
  return evaluateMessagePolicy({ guide, caps, text });
}

export async function sendOtherMessage(env, { packId, sellerId, orderId, text, idempotencyKey }) {
  const token = await getValidToken(env, sellerId);
  const response = await mlRequest(
    `/messages/action_guide/packs/${encodeURIComponent(packId)}/option?tag=post_sale`,
    token.access_token,
    {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ option_id: "OTHER", text })
    }
  );

  const moderationStatus = String(response.data?.status || response.data?.message_status || "").toLowerCase();
  const moderated = ["moderated", "rejected", "blocked"].includes(moderationStatus);
  await recordMessageAttempt(env, {
    idempotencyKey,
    orderId,
    packId,
    status: response.ok && !moderated ? "SENT" : moderated ? "MODERATED" : "FAILED",
    httpStatus: response.status,
    response: response.data
  });

  if (!response.ok || moderated) {
    const error = new Error(moderated ? "Mensagem moderada ou bloqueada pelo Mercado Livre." : "Mercado Livre recusou a mensagem pós-venda.");
    error.statusCode = response.status;
    error.retryable = !moderated && (response.status === 429 || response.status >= 500);
    throw error;
  }
  return response.data;
}
