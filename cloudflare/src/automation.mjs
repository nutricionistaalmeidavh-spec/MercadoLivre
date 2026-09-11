import {
  claimNextWebhook,
  failWebhook,
  finishWebhook,
  getAutomationRun,
  upsertAutomationRun
} from "./repository.mjs";
import {
  evaluateOrderEligibility,
  fetchMessagePolicy,
  fetchOrder,
  sendOtherMessage
} from "./mercadolivre.mjs";

const AUTOMATION_TYPE = "AFTER_SALE";
const AUTOMATION_VERSION = "v1";

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

  const text = String(env.ML_AFTER_SALE_MESSAGE || "").trim();
  const policy = await fetchMessagePolicy(env, order.packId, sellerId, text);
  if (!policy.allowed) {
    await setRun(env, { idempotencyKey: key, sellerId, orderId, state: "SKIPPED", reason: policy.reason });
    return { skipped: true, reason: policy.reason };
  }

  const mode = String(env.ML_AUTOMATION_MODE || "dry-run").toLowerCase();
  if (mode !== "production") {
    await setRun(env, { idempotencyKey: key, sellerId, orderId, state: "DRY_RUN", reason: "MESSAGE_WOULD_BE_SENT" });
    return { dryRun: true, orderId, packId: order.packId, charLimit: policy.charLimit };
  }

  const response = await sendOtherMessage(env, {
    packId: order.packId,
    sellerId,
    orderId,
    text: policy.text,
    idempotencyKey: key
  });
  const messageId = response?.id || response?.message_id || null;
  await setRun(env, { idempotencyKey: key, sellerId, orderId, state: "SENT", reason: "MESSAGE_SENT", messageId });
  return { sent: true, orderId, messageId };
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
    const retryable = error?.retryable === true || error?.statusCode === 429 || Number(error?.statusCode) >= 500;
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
