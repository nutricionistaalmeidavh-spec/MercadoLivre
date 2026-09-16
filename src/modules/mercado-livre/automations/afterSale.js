const { getOrder } = require("../orders/orderService");
const { checkEligibility } = require("../orders/orderEligibility");
const { fetchGuide } = require("../messages/communicationReasons");
const { evaluatePolicy } = require("../messages/policyGuard");
const { sendOtherMessage } = require("../messages/messageService");
const { getAfterSaleMessage } = require("../messages/templates");
const { beginRun, getRun } = require("./idempotency");
const { transition, FINAL_STATES } = require("./stateMachine");

async function runAfterSale({ orderId, sellerId, mode = process.env.ML_AUTOMATION_MODE || "dry-run" }) {
  const run = beginRun({ sellerId, orderId });
  if (!run.isNew) {
    const existing = getRun(run.key);
    if (existing && FINAL_STATES.has(existing.state)) {
      return { ok: true, duplicate: true, state: existing.state, reason: existing.reason, idempotencyKey: run.key };
    }
  }

  try {
    const order = await getOrder(orderId, sellerId);
    transition(run.key, "ORDER_FETCHED");

    const eligibility = checkEligibility(order);
    if (!eligibility.eligible) {
      transition(run.key, "SKIPPED", { reason: eligibility.reason });
      return { ok: true, sent: false, state: "SKIPPED", reason: eligibility.reason, idempotencyKey: run.key };
    }
    transition(run.key, "ELIGIBILITY_CHECKED");

    const text = getAfterSaleMessage();
    const { guide, caps } = await fetchGuide(order.packId, order.sellerId);
    const policy = evaluatePolicy({ guideResponse: guide, capsResponse: caps, text });
    if (!policy.allowed) {
      transition(run.key, "SKIPPED", { reason: policy.reason });
      return { ok: true, sent: false, state: "SKIPPED", reason: policy.reason, policy, idempotencyKey: run.key };
    }
    transition(run.key, "POLICY_CHECKED");

    if (mode !== "production") {
      transition(run.key, "SKIPPED", { reason: "DRY_RUN" });
      return { ok: true, sent: false, state: "SKIPPED", reason: "DRY_RUN", wouldSend: text, policy, idempotencyKey: run.key };
    }

    transition(run.key, "MESSAGE_PENDING");
    const result = await sendOtherMessage({
      packId: order.packId,
      sellerId: order.sellerId,
      text,
      idempotencyKey: run.key
    });
    const messageId = result?.id || result?.message_id || null;
    transition(run.key, "SENT", { reason: "SENT", messageId: messageId == null ? null : String(messageId) });
    return { ok: true, sent: true, state: "SENT", messageId, idempotencyKey: run.key };
  } catch (error) {
    const retryable = error.retryable === true || error.statusCode === 429 || Number(error.statusCode) >= 500;
    transition(run.key, retryable ? "FAILED_RETRYABLE" : "FAILED_FINAL", { reason: error.message });
    error.retryable = retryable;
    throw error;
  }
}

module.exports = { runAfterSale };
