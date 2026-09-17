import {
  claimNextWebhook,
  failWebhook,
  finishWebhook,
  getAutomationRun,
  getItemMessageRules,
  recordMessageAttempt,
  upsertAutomationRun
} from "./repository.mjs";
import {
  evaluateOrderEligibility,
  fetchMessagePolicy,
  fetchOrder,
  sendOtherMessage
} from "./mercadolivre.mjs";

const AUTOMATION_TYPE = "AFTER_SALE";
const AUTOMATION_VERSION = "v2-item-rules";
const POST_SALE_TIME_ZONE = "America/Sao_Paulo";
const FINAL_MESSAGE_MAX_LENGTH = 2000;
const TEMPLATE_TOKEN = /\{\{\s*(saudacao|cliente|produto|pedido|link_produto)\s*\}\}/gi;
const TEMPLATE_ANY_TOKEN = /\{\{\s*([^{}]+?)\s*\}\}/g;
const PRODUCT_LINK_TOKEN = /\{\{\s*link_produto\s*\}\}/i;

export function parseOrderId(resource) {
  const match = String(resource || "").match(/\/orders\/(\d+)/);
  return match ? match[1] : null;
}

function idempotencyKey(sellerId, orderId) {
  return `${sellerId}:${orderId}:${AUTOMATION_TYPE}:${AUTOMATION_VERSION}`;
}

async function setRun(env, values) {
  await upsertAutomationRun(env, {
    ...values,
    automationType: AUTOMATION_TYPE,
    automationVersion: AUTOMATION_VERSION
  });
}

function cleanDisplayText(value, maxLength = 120) {
  return String(value || "")
    .replace(/[\u0000-\u001F\u007F]/g, " ")
    .replace(/\s+/g, " ")
    .trim()
    .slice(0, maxLength);
}

export function resolveBuyerDisplayName(order) {
  const firstName = cleanDisplayText(order?.buyerFirstName);
  if (firstName) return firstName.split(" ")[0];
  const nickname = cleanDisplayText(order?.buyerNickname);
  return nickname || "cliente";
}

export function greetingForDate(now = new Date()) {
  const date = now instanceof Date ? now : new Date(now);
  const parts = new Intl.DateTimeFormat("pt-BR", {
    timeZone: POST_SALE_TIME_ZONE,
    hour: "2-digit",
    hourCycle: "h23"
  }).formatToParts(date);
  const hour = Number(parts.find((part) => part.type === "hour")?.value ?? 0);
  if (hour >= 5 && hour < 12) return "bom dia";
  if (hour >= 12 && hour < 18) return "boa tarde";
  return "boa noite";
}

export function resolvePostSaleTemplate(template, { order, rule, now = new Date() } = {}) {
  const values = {
    saudacao: greetingForDate(now),
    cliente: resolveBuyerDisplayName(order),
    produto: cleanDisplayText(rule?.item_title || rule?.item_id || "produto", 300),
    pedido: cleanDisplayText(order?.orderId || "", 80),
    link_produto: String(rule?.product_link || "").trim()
  };
  return String(template || "").replace(TEMPLATE_TOKEN, (_match, key) => values[String(key).toLowerCase()] ?? "").trim();
}

function unresolvedVariables(text) {
  return [...new Set(
    [...String(text || "").matchAll(TEMPLATE_ANY_TOKEN)]
      .map((match) => String(match[1] || "").trim().toLowerCase())
      .filter(Boolean)
  )];
}

function validateFinalMessage(text) {
  const normalized = String(text || "").trim();
  if (!normalized) return { ok: false, reason: "EMPTY_RESOLVED_MESSAGE" };
  const unresolved = unresolvedVariables(normalized);
  if (unresolved.length) return { ok: false, reason: `UNRESOLVED_TEMPLATE_VARIABLES:${unresolved.join(",")}` };
  if (normalized.length > FINAL_MESSAGE_MAX_LENGTH) return { ok: false, reason: "FINAL_MESSAGE_TOO_LONG" };
  return { ok: true, text: normalized };
}

export function buildMessageFromRules(order, rules, { now = new Date() } = {}) {
  const byId = new Map(rules.map((rule) => [String(rule.item_id), rule]));
  const missing = order.itemIds.filter((itemId) => {
    const rule = byId.get(String(itemId));
    return !rule || !rule.enabled || !String(rule.message || "").trim();
  });
  if (missing.length) return { ok: false, reason: `NO_ENABLED_MESSAGE_RULE:${missing.join(",")}` };

  const selected = order.itemIds.map((itemId) => byId.get(String(itemId)));
  for (const rule of selected) {
    if (PRODUCT_LINK_TOKEN.test(String(rule.message || "")) && !String(rule.product_link || "").trim()) {
      return { ok: false, reason: `MISSING_PRODUCT_LINK:${rule.item_id}` };
    }
  }

  const uniqueMessages = [];
  const seen = new Set();
  for (const rule of selected) {
    const resolved = resolvePostSaleTemplate(rule.message, { order, rule, now });
    const checked = validateFinalMessage(resolved);
    if (!checked.ok) return checked;
    if (seen.has(checked.text)) continue;
    seen.add(checked.text);
    uniqueMessages.push({ rule, text: checked.text });
  }

  const combined = uniqueMessages.length === 1
    ? uniqueMessages[0].text
    : uniqueMessages.map(({ rule, text }) => {
      const title = cleanDisplayText(rule.item_title || rule.item_id || "Produto", 300);
      return `${title}:\n${text}`;
    }).join("\n\n");

  return validateFinalMessage(combined);
}

function buildDeliveryContext(order, rules, finalText) {
  const byId = new Map(rules.map((rule) => [String(rule.item_id), rule]));
  const items = (order.itemIds || []).map((itemId) => {
    const rule = byId.get(String(itemId)) || {};
    return {
      item_id: String(itemId),
      title: cleanDisplayText(rule.item_title || itemId, 300),
      product_link: String(rule.product_link || "").trim()
    };
  });
  return {
    order_id: String(order.orderId || ""),
    pack_id: order.packId == null ? null : String(order.packId),
    buyer: resolveBuyerDisplayName(order),
    item_ids: items.map((item) => item.item_id),
    items,
    final_text: String(finalText || "")
  };
}

export function isRetryableProcessingError(error) {
  if (error?.retryable === false) return false;
  if (error?.retryable === true) return true;
  const status = Number(error?.statusCode || 0);
  return status === 429 || status >= 500;
}

export async function processOrderEvent(env, payload) {
  const sellerId = String(payload?.user_id || "");
  const orderId = parseOrderId(payload?.resource);
  if (!sellerId || !orderId) return { ignored: true, reason: "INVALID_ORDERS_V2_NOTIFICATION" };

  const key = idempotencyKey(sellerId, orderId);
  const prior = await getAutomationRun(env, key);
  if (prior && ["SENT", "DRY_RUN", "SKIPPED"].includes(prior.state)) {
    return { duplicate: true, state: prior.state, reason: prior.reason || null };
  }

  await setRun(env, { idempotencyKey: key, sellerId, orderId, state: "RECEIVED" });
  const order = await fetchOrder(env, orderId, sellerId);
  await setRun(env, { idempotencyKey: key, sellerId, orderId, state: "ORDER_FETCHED" });

  const eligibility = evaluateOrderEligibility(order);
  if (!eligibility.eligible) {
    await setRun(env, { idempotencyKey: key, sellerId, orderId, state: "SKIPPED", reason: eligibility.reason });
    return { skipped: true, reason: eligibility.reason };
  }

  const rules = await getItemMessageRules(env, sellerId, order.itemIds);
  const configured = buildMessageFromRules(order, rules);
  if (!configured.ok) {
    await setRun(env, { idempotencyKey: key, sellerId, orderId, state: "SKIPPED", reason: configured.reason });
    return { skipped: true, reason: configured.reason };
  }

  const deliveryContext = buildDeliveryContext(order, rules, configured.text);
  const policy = await fetchMessagePolicy(env, order.packId, sellerId, configured.text);
  if (!policy.allowed) {
    await setRun(env, { idempotencyKey: key, sellerId, orderId, state: "SKIPPED", reason: policy.reason });
    return { skipped: true, reason: policy.reason };
  }

  const mode = String(env.ML_AUTOMATION_MODE || "dry-run").toLowerCase();
  if (mode !== "production") {
    await recordMessageAttempt(env, {
      idempotencyKey: key,
      orderId,
      packId: order.packId,
      status: "DRY_RUN",
      httpStatus: 0,
      response: { reason: "CONFIGURED_MESSAGE_WOULD_BE_SENT" },
      moderationStatus: "not_sent",
      context: deliveryContext
    });
    await setRun(env, { idempotencyKey: key, sellerId, orderId, state: "DRY_RUN", reason: "CONFIGURED_MESSAGE_WOULD_BE_SENT" });
    return { dryRun: true, orderId, packId: order.packId, itemIds: order.itemIds, charLimit: policy.charLimit };
  }

  const response = await sendOtherMessage(env, {
    packId: order.packId,
    sellerId,
    orderId,
    text: policy.text,
    idempotencyKey: key,
    deliveryContext
  });
  const messageId = response?.id || response?.message_id || null;
  await setRun(env, { idempotencyKey: key, sellerId, orderId, state: "SENT", reason: "MESSAGE_SENT", messageId });
  return { sent: true, orderId, itemIds: order.itemIds, messageId };
}

export async function processOneQueuedEvent(env) {
  const event = await claimNextWebhook(env);
  if (!event) return { processed: false };
  try {
    const payload = JSON.parse(event.payload);
    const result = event.topic === "orders_v2"
      ? await processOrderEvent(env, payload)
      : { ignored: true, reason: "UNSUPPORTED_TOPIC" };
    await finishWebhook(env, event.event_key);
    return { processed: true, eventKey: event.event_key, result };
  } catch (error) {
    const retryable = isRetryableProcessingError(error);
    const status = await failWebhook(env, event, error, retryable);
    return { processed: true, eventKey: event.event_key, error: error.message, retry: status.retry };
  }
}

export async function drainQueue(env, max = 10) {
  const results = [];
  for (let i = 0; i < max; i += 1) {
    const result = await processOneQueuedEvent(env);
    if (!result.processed) break;
    results.push(result);
  }
  return results;
}
