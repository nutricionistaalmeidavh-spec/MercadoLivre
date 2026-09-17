import { getValidToken } from "./token-service.mjs";
import { mlRequest } from "./mercadolivre.mjs";

function clampInt(value, fallback, min, max) {
  const parsed = Number.parseInt(String(value ?? ""), 10);
  if (!Number.isFinite(parsed)) return fallback;
  return Math.min(max, Math.max(min, parsed));
}

function normalizePayment(payment) {
  return {
    id: payment?.id != null ? String(payment.id) : null,
    status: String(payment?.status || ""),
    status_detail: String(payment?.status_detail || ""),
    transaction_amount: Number(payment?.transaction_amount || 0),
    total_paid_amount: Number(payment?.total_paid_amount || 0),
    currency_id: String(payment?.currency_id || "BRL")
  };
}

function normalizeItem(entry) {
  const item = entry?.item || {};
  return {
    item_id: String(item.id || ""),
    title: String(item.title || ""),
    variation_id: entry?.variation_id != null ? String(entry.variation_id) : null,
    quantity: Number(entry?.quantity || 0),
    unit_price: Number(entry?.unit_price || 0),
    full_unit_price: Number(entry?.full_unit_price || entry?.unit_price || 0),
    currency_id: String(entry?.currency_id || "BRL")
  };
}

function normalizeOrder(order) {
  const payments = Array.isArray(order?.payments) ? order.payments.map(normalizePayment) : [];
  const items = Array.isArray(order?.order_items) ? order.order_items.map(normalizeItem) : [];
  return {
    id: String(order?.id || ""),
    pack_id: order?.pack_id != null ? String(order.pack_id) : null,
    status: String(order?.status || ""),
    status_detail: order?.status_detail || null,
    date_created: order?.date_created || null,
    date_closed: order?.date_closed || null,
    last_updated: order?.last_updated || order?.date_last_updated || null,
    total_amount: Number(order?.total_amount || 0),
    paid_amount: Number(order?.paid_amount || 0),
    currency_id: String(order?.currency_id || "BRL"),
    buyer: {
      id: order?.buyer?.id != null ? String(order.buyer.id) : null,
      nickname: String(order?.buyer?.nickname || "")
    },
    items,
    payments,
    tags: Array.isArray(order?.tags) ? order.tags.map(String) : []
  };
}

function parseJson(value) {
  if (value == null || value === "") return null;
  try { return JSON.parse(String(value)); } catch { return null; }
}

async function loadAutomationRuns(env, sellerId) {
  const result = await env.DB.prepare(
    `SELECT idempotency_key, order_id, state, reason, message_id, updated_at
       FROM automation_runs
      WHERE seller_id = ?
      ORDER BY updated_at DESC
      LIMIT 500`
  ).bind(String(sellerId)).all();
  const map = new Map();
  for (const row of result.results || []) {
    const key = String(row.order_id || "");
    if (!key || map.has(key)) continue;
    map.set(key, {
      state: String(row.state || ""),
      reason: row.reason == null ? null : String(row.reason),
      message_id: row.message_id == null ? null : String(row.message_id),
      updated_at: Number(row.updated_at || 0)
    });
  }
  return map;
}

async function loadOrderAudit(env, orderId) {
  const [run, attempts] = await Promise.all([
    env.DB.prepare(
      `SELECT idempotency_key, state, reason, message_id, created_at, updated_at
         FROM automation_runs
        WHERE order_id = ?
        ORDER BY updated_at DESC
        LIMIT 1`
    ).bind(String(orderId)).first(),
    env.DB.prepare(
      `SELECT status, http_status, context_json, moderation_status, created_at
         FROM message_attempts
        WHERE order_id = ?
        ORDER BY created_at DESC
        LIMIT 25`
    ).bind(String(orderId)).all()
  ]);
  return {
    automation: run ? {
      state: String(run.state || ""),
      reason: run.reason == null ? null : String(run.reason),
      message_id: run.message_id == null ? null : String(run.message_id),
      created_at: Number(run.created_at || 0),
      updated_at: Number(run.updated_at || 0)
    } : null,
    message_attempts: (attempts.results || []).map((row) => ({
      status: String(row.status || ""),
      http_status: row.http_status == null ? null : Number(row.http_status),
      moderation_status: row.moderation_status == null ? null : String(row.moderation_status),
      context: parseJson(row.context_json),
      created_at: Number(row.created_at || 0)
    }))
  };
}

export async function handleOrdersApi(env, request, sellerId) {
  if (request.method !== "GET") return { error: "Método não permitido.", status: 405 };
  const url = new URL(request.url);
  const token = await getValidToken(env, sellerId);
  const orderId = String(url.searchParams.get("order_id") || "").trim();

  if (orderId) {
    const response = await mlRequest(`/orders/${encodeURIComponent(orderId)}`, token.access_token);
    if (!response.ok) return { error: "Não foi possível carregar o pedido.", status: response.status || 502, details: response.data };
    const audit = await loadOrderAudit(env, orderId);
    return { ok: true, order: normalizeOrder(response.data), ...audit };
  }

  const limit = clampInt(url.searchParams.get("limit"), 30, 1, 50);
  const offset = clampInt(url.searchParams.get("offset"), 0, 0, 10000);
  const q = String(url.searchParams.get("q") || "").trim();
  const status = String(url.searchParams.get("status") || "").trim();
  const query = new URLSearchParams({ seller: String(sellerId), limit: String(limit), offset: String(offset), sort: "date_desc" });
  if (q) query.set("q", q);
  if (status && status !== "all") query.set("order.status", status);

  const response = await mlRequest(`/orders/search?${query}`, token.access_token);
  if (!response.ok) return { error: "Não foi possível listar os pedidos.", status: response.status || 502, details: response.data };
  const runs = await loadAutomationRuns(env, sellerId);
  const orders = (Array.isArray(response.data?.results) ? response.data.results : []).map(normalizeOrder).map((order) => ({
    ...order,
    automation: runs.get(order.id) || null
  }));

  return {
    ok: true,
    paging: response.data?.paging || { total: orders.length, offset, limit },
    orders
  };
}
