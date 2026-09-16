import { listSellers, queueStats } from "./repository.mjs";

function rows(result) {
  return Array.isArray(result?.results) ? result.results : [];
}

export async function handleOperationsApi(env, request) {
  if (request.method !== "GET") return { error: "Método não permitido.", status: 405 };

  const url = new URL(request.url);
  const limit = Math.min(50, Math.max(5, Number(url.searchParams.get("limit") || 20)));
  const [sellers, queue, webhooks, runs, attempts, dbCheck] = await Promise.all([
    listSellers(env),
    queueStats(env),
    env.DB.prepare(`
      SELECT event_key, topic, resource, user_id, status, attempts, last_error, created_at, updated_at
      FROM webhook_events ORDER BY created_at DESC LIMIT ?
    `).bind(limit).all(),
    env.DB.prepare(`
      SELECT idempotency_key, seller_id, order_id, automation_type, state, reason, message_id, created_at, updated_at
      FROM automation_runs ORDER BY updated_at DESC LIMIT ?
    `).bind(limit).all(),
    env.DB.prepare(`
      SELECT id, order_id, pack_id, status, http_status, created_at
      FROM message_attempts ORDER BY created_at DESC LIMIT ?
    `).bind(limit).all(),
    env.DB.prepare("SELECT 1 AS ok").first()
  ]);

  return {
    ok: Boolean(dbCheck?.ok),
    runtime: "cloudflare-workers",
    database: dbCheck?.ok ? "d1" : "unavailable",
    mode: String(env.ML_AUTOMATION_MODE || "dry-run"),
    callback: `${url.origin}/api/webhook`,
    oauth_callback: env.ML_REDIRECT_URI || `${url.origin}/mercadolivre/callback`,
    sellers,
    queue,
    config: {
      ml_client_id: Boolean(env.ML_CLIENT_ID),
      ml_client_secret: Boolean(env.ML_CLIENT_SECRET),
      token_encryption_key: Boolean(env.TOKEN_ENCRYPTION_KEY),
      admin_password: Boolean(env.ADMIN_PASSWORD),
      admin_session_secret: Boolean(env.ADMIN_SESSION_SECRET),
      ml_application_id: Boolean(env.ML_APPLICATION_ID),
      automation_mode: String(env.ML_AUTOMATION_MODE || "dry-run"),
      max_attempts: Number(env.ML_JOB_MAX_ATTEMPTS || 5)
    },
    activity: {
      webhooks: rows(webhooks),
      automation_runs: rows(runs),
      message_attempts: rows(attempts)
    }
  };
}
