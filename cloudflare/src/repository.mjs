import { decryptJson, encryptJson } from "./crypto.mjs";

export async function saveToken(env, token) {
  if (!token?.user_id || !token?.access_token || !token?.refresh_token) {
    throw new Error("Token Mercado Livre incompleto.");
  }
  const payload = await encryptJson(token, env.TOKEN_ENCRYPTION_KEY);
  const now = Date.now();
  await env.DB.prepare(`
    INSERT INTO ml_tokens (seller_id, encrypted_payload, expires_at, updated_at)
    VALUES (?, ?, ?, ?)
    ON CONFLICT(seller_id) DO UPDATE SET
      encrypted_payload=excluded.encrypted_payload,
      expires_at=excluded.expires_at,
      updated_at=excluded.updated_at
  `).bind(String(token.user_id), payload, Number(token.expires_at || 0), now).run();
  return { sellerId: String(token.user_id), updatedAt: now };
}

export async function getStoredToken(env, sellerId) {
  const row = await env.DB.prepare(
    "SELECT seller_id, encrypted_payload, expires_at, updated_at FROM ml_tokens WHERE seller_id=?"
  ).bind(String(sellerId)).first();
  if (!row) return null;
  const token = await decryptJson(row.encrypted_payload, env.TOKEN_ENCRYPTION_KEY);
  return { ...token, seller_id: String(row.seller_id), stored_updated_at: Number(row.updated_at || 0) };
}

export async function listSellers(env) {
  const result = await env.DB.prepare("SELECT seller_id, expires_at, updated_at FROM ml_tokens ORDER BY updated_at DESC").all();
  return result.results || [];
}

export async function enqueueWebhook(env, payload) {
  const now = Date.now();
  const topic = String(payload?.topic || "unknown");
  const resource = String(payload?.resource || "");
  const userId = String(payload?.user_id || "");
  const applicationId = String(payload?.application_id || "");
  const sent = String(payload?.sent || payload?.attempts || "");
  const eventKey = `${topic}:${userId}:${resource}:${sent}`;

  const result = await env.DB.prepare(`
    INSERT OR IGNORE INTO webhook_events
      (event_key, topic, resource, user_id, application_id, payload, status, attempts, available_at, created_at, updated_at)
    VALUES (?, ?, ?, ?, ?, ?, 'PENDING', 0, ?, ?, ?)
  `).bind(eventKey, topic, resource, userId, applicationId, JSON.stringify(payload), now, now, now).run();

  return { eventKey, inserted: Number(result.meta?.changes || 0) === 1 };
}

export async function claimNextWebhook(env) {
  const now = Date.now();
  const candidate = await env.DB.prepare(`
    SELECT * FROM webhook_events
    WHERE status='PENDING' AND available_at <= ?
    ORDER BY created_at ASC
    LIMIT 1
  `).bind(now).first();
  if (!candidate) return null;

  const update = await env.DB.prepare(`
    UPDATE webhook_events
    SET status='PROCESSING', attempts=attempts+1, updated_at=?
    WHERE event_key=? AND status='PENDING'
  `).bind(now, candidate.event_key).run();
  if (Number(update.meta?.changes || 0) !== 1) return null;

  return env.DB.prepare("SELECT * FROM webhook_events WHERE event_key=?").bind(candidate.event_key).first();
}

export async function finishWebhook(env, eventKey) {
  await env.DB.prepare(`
    UPDATE webhook_events SET status='DONE', last_error=NULL, updated_at=? WHERE event_key=?
  `).bind(Date.now(), String(eventKey)).run();
}

export async function failWebhook(env, event, error, retryable) {
  const maxAttempts = Number(env.ML_JOB_MAX_ATTEMPTS || 5);
  const attempts = Number(event.attempts || 0);
  const canRetry = Boolean(retryable && attempts < maxAttempts);
  const delay = Math.min(15 * 60_000, 5_000 * (2 ** Math.max(0, attempts - 1)));
  await env.DB.prepare(`
    UPDATE webhook_events
    SET status=?, available_at=?, last_error=?, updated_at=?
    WHERE event_key=?
  `).bind(
    canRetry ? "PENDING" : "DEAD",
    canRetry ? Date.now() + delay : Date.now(),
    String(error?.message || error).slice(0, 2000),
    Date.now(),
    event.event_key
  ).run();
  return { retry: canRetry };
}

export async function getAutomationRun(env, idempotencyKey) {
  return env.DB.prepare("SELECT * FROM automation_runs WHERE idempotency_key=?")
    .bind(String(idempotencyKey)).first();
}

export async function upsertAutomationRun(env, run) {
  const now = Date.now();
  await env.DB.prepare(`
    INSERT INTO automation_runs
      (idempotency_key, seller_id, order_id, automation_type, automation_version, state, reason, message_id, created_at, updated_at)
    VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
    ON CONFLICT(idempotency_key) DO UPDATE SET
      state=excluded.state,
      reason=excluded.reason,
      message_id=COALESCE(excluded.message_id, automation_runs.message_id),
      updated_at=excluded.updated_at
  `).bind(
    run.idempotencyKey,
    String(run.sellerId),
    String(run.orderId),
    run.automationType || "AFTER_SALE",
    run.automationVersion || "v1",
    run.state,
    run.reason || null,
    run.messageId || null,
    now,
    now
  ).run();
}

export async function recordMessageAttempt(env, attempt) {
  await env.DB.prepare(`
    INSERT INTO message_attempts
      (idempotency_key, order_id, pack_id, status, http_status, response, created_at)
    VALUES (?, ?, ?, ?, ?, ?, ?)
  `).bind(
    attempt.idempotencyKey,
    String(attempt.orderId),
    attempt.packId == null ? null : String(attempt.packId),
    attempt.status,
    Number(attempt.httpStatus || 0),
    JSON.stringify(attempt.response ?? null),
    Date.now()
  ).run();
}

export async function listItemMessageRules(env, sellerId) {
  const result = await env.DB.prepare(`
    SELECT seller_id, item_id, item_title, message, enabled, created_at, updated_at
    FROM item_message_rules
    WHERE seller_id=?
    ORDER BY updated_at DESC, item_id ASC
  `).bind(String(sellerId)).all();
  return (result.results || []).map((row) => ({ ...row, enabled: Number(row.enabled || 0) === 1 }));
}

export async function getItemMessageRules(env, sellerId, itemIds) {
  const ids = [...new Set((itemIds || []).map(String).filter(Boolean))];
  if (!ids.length) return [];
  const placeholders = ids.map(() => "?").join(",");
  const result = await env.DB.prepare(`
    SELECT seller_id, item_id, item_title, message, enabled, created_at, updated_at
    FROM item_message_rules
    WHERE seller_id=? AND item_id IN (${placeholders})
  `).bind(String(sellerId), ...ids).all();
  return (result.results || []).map((row) => ({ ...row, enabled: Number(row.enabled || 0) === 1 }));
}

export async function upsertItemMessageRule(env, rule) {
  const now = Date.now();
  const sellerId = String(rule.sellerId);
  const itemId = String(rule.itemId);
  const title = String(rule.itemTitle || "").slice(0, 300) || null;
  const message = String(rule.message || "").trim();
  const enabled = rule.enabled ? 1 : 0;
  await env.DB.prepare(`
    INSERT INTO item_message_rules
      (seller_id, item_id, item_title, message, enabled, created_at, updated_at)
    VALUES (?, ?, ?, ?, ?, ?, ?)
    ON CONFLICT(seller_id, item_id) DO UPDATE SET
      item_title=excluded.item_title,
      message=excluded.message,
      enabled=excluded.enabled,
      updated_at=excluded.updated_at
  `).bind(sellerId, itemId, title, message, enabled, now, now).run();
  return env.DB.prepare(`
    SELECT seller_id, item_id, item_title, message, enabled, created_at, updated_at
    FROM item_message_rules WHERE seller_id=? AND item_id=?
  `).bind(sellerId, itemId).first();
}

export async function queueStats(env) {
  const result = await env.DB.prepare(`
    SELECT status, COUNT(*) AS total FROM webhook_events GROUP BY status ORDER BY status
  `).all();
  return result.results || [];
}
