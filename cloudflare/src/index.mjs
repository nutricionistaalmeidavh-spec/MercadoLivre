import { decryptJson, encryptJson, randomBase64Url, sha256Base64Url, timingSafeSecretEqual } from "./crypto.mjs";
import { drainQueue } from "./automation.mjs";
import { getValidToken } from "./token-service.mjs";
import { mlRequest } from "./mercadolivre.mjs";
import { enqueueWebhook, listSellers, queueStats, recordMigration, saveToken } from "./repository.mjs";
import { handlePublisherApi } from "./publisher.mjs";

const ADMIN_COOKIE = "artisys_admin";

function json(data, status = 200, headers = {}) {
  return new Response(JSON.stringify(data), {
    status,
    headers: { "content-type": "application/json; charset=utf-8", "cache-control": "no-store", ...headers }
  });
}

function parseCookies(request) {
  const result = {};
  for (const part of String(request.headers.get("cookie") || "").split(";")) {
    const index = part.indexOf("=");
    if (index > 0) result[part.slice(0, index).trim()] = decodeURIComponent(part.slice(index + 1).trim());
  }
  return result;
}

function cookieHeader(name, value, maxAge) {
  const parts = [`${name}=${encodeURIComponent(value)}`, "Path=/", "HttpOnly", "Secure", "SameSite=Lax", `Max-Age=${maxAge}`];
  return parts.join("; ");
}

async function isAdmin(request, env) {
  const cookie = parseCookies(request)[ADMIN_COOKIE];
  if (!cookie || !env.ADMIN_SESSION_SECRET) return false;
  try {
    const session = await decryptJson(cookie, env.ADMIN_SESSION_SECRET);
    return Boolean(session?.ok && Number(session.exp || 0) > Date.now());
  } catch {
    return false;
  }
}

async function requireAdmin(request, env) {
  return (await isAdmin(request, env)) ? null : json({ error: "Acesso administrativo necessário." }, 401);
}

async function resolveSellerId(env) {
  const sellers = await listSellers(env);
  if (sellers.length === 1) return String(sellers[0].seller_id);
  if (sellers.length === 0) throw new Error("Mercado Livre ainda não conectado no Cloudflare.");
  throw new Error("Há mais de um seller conectado. Informe explicitamente o seller no painel antes de usar esta operação.");
}

async function handleAuth(request, env) {
  const url = new URL(request.url);
  const op = url.searchParams.get("op");
  if (op === "status") return json({ authenticated: await isAdmin(request, env) });

  if (op === "login" && request.method === "POST") {
    const body = await request.json().catch(() => ({}));
    if (!env.ADMIN_PASSWORD || !(await timingSafeSecretEqual(body.password, env.ADMIN_PASSWORD))) {
      return json({ error: "Senha incorreta." }, 403);
    }
    const session = await encryptJson({ ok: true, exp: Date.now() + 7 * 864e5 }, env.ADMIN_SESSION_SECRET);
    return json({ ok: true }, 200, { "set-cookie": cookieHeader(ADMIN_COOKIE, session, 7 * 86400) });
  }

  if (op === "logout" && request.method === "POST") {
    return json({ ok: true }, 200, { "set-cookie": cookieHeader(ADMIN_COOKIE, "", 0) });
  }

  return json({ error: "Operação inválida." }, 404);
}

async function handleOAuth(request, env) {
  const denied = await requireAdmin(request, env);
  if (denied) return denied;

  const url = new URL(request.url);
  const op = url.searchParams.get("op");
  const redirectUri = env.ML_REDIRECT_URI || `${url.origin}/mercadolivre/callback`;

  if (op === "start") {
    if (!env.ML_CLIENT_ID || !env.ML_CLIENT_SECRET) return json({ error: "ML_CLIENT_ID/ML_CLIENT_SECRET não configurados." }, 500);
    const verifier = randomBase64Url(48);
    const challenge = await sha256Base64Url(verifier);
    const state = await encryptJson({ kind: "ml_oauth_cf_v1", verifier, exp: Date.now() + 10 * 60_000 }, env.ADMIN_SESSION_SECRET);
    const query = new URLSearchParams({
      response_type: "code",
      client_id: env.ML_CLIENT_ID,
      redirect_uri: redirectUri,
      state,
      code_challenge: challenge,
      code_challenge_method: "S256"
    });
    return Response.redirect(`https://auth.mercadolivre.com.br/authorization?${query}`, 302);
  }

  if (op === "exchange" && request.method === "POST") {
    const body = await request.json().catch(() => ({}));
    if (!body.code || !body.state) return json({ error: "Authorization code/state ausente." }, 400);
    let state;
    try { state = await decryptJson(String(body.state), env.ADMIN_SESSION_SECRET); } catch { return json({ error: "State OAuth inválido." }, 400); }
    if (state?.kind !== "ml_oauth_cf_v1" || !state.verifier || Number(state.exp || 0) < Date.now()) {
      return json({ error: "State OAuth inválido ou expirado." }, 400);
    }

    const form = new URLSearchParams({
      grant_type: "authorization_code",
      client_id: env.ML_CLIENT_ID,
      client_secret: env.ML_CLIENT_SECRET,
      code: String(body.code),
      redirect_uri: redirectUri,
      code_verifier: String(state.verifier)
    });
    const response = await fetch("https://api.mercadolibre.com/oauth/token", {
      method: "POST",
      headers: { "content-type": "application/x-www-form-urlencoded", accept: "application/json" },
      body: form.toString()
    });
    const token = await response.json().catch(() => ({}));
    if (!response.ok) return json({ error: "Falha na troca do authorization code por token.", details: token }, response.status);
    token.expires_at = Date.now() + Number(token.expires_in || 21600) * 1000;
    await saveToken(env, token);
    return json({ ok: true, user_id: token.user_id, scope: token.scope, server_persisted: true });
  }

  return json({ error: "Operação inválida." }, 404);
}

async function handleMl(request, env) {
  const denied = await requireAdmin(request, env);
  if (denied) return denied;
  try {
    const sellerId = await resolveSellerId(env);
    const result = await handlePublisherApi(env, request, sellerId);
    if (result.ok) return json(result.data, result.status || 200);
    const data = result.data?.error ? result.data : { error: "Falha na API do Mercado Livre.", details: result.data };
    return json(data, result.status || 500);
  } catch (error) {
    return json({ error: error.message }, error.statusCode || 500);
  }
}

async function handleWebhook(request, env, ctx) {
  if (request.method !== "POST") return json({ error: "Método não permitido." }, 405);
  const payload = await request.json().catch(() => null);
  if (!payload || typeof payload !== "object") return json({ error: "Payload inválido." }, 400);

  if (env.ML_APPLICATION_ID && String(payload.application_id || "") !== String(env.ML_APPLICATION_ID)) {
    return json({ error: "Aplicação da notificação não confere." }, 403);
  }

  const queued = await enqueueWebhook(env, payload);
  ctx.waitUntil(drainQueue(env, 3));
  return json({ ok: true, accepted: queued.inserted, event_key: queued.eventKey });
}

async function handleMigrationImport(request, env) {
  if (request.method !== "POST") return json({ error: "Método não permitido." }, 405);
  const authorization = request.headers.get("authorization") || "";
  const supplied = authorization.startsWith("Bearer ") ? authorization.slice(7) : "";
  if (!env.ML_MIGRATION_SECRET || !(await timingSafeSecretEqual(supplied, env.ML_MIGRATION_SECRET))) {
    return json({ error: "Migração não autorizada." }, 401);
  }

  const body = await request.json().catch(() => ({}));
  const token = body.token || {};
  if (!token.user_id || !token.access_token || !token.refresh_token) return json({ error: "Token de migração incompleto." }, 400);
  if (!token.expires_at) token.expires_at = Date.now() + Number(token.expires_in || 21600) * 1000;

  await saveToken(env, token);
  try {
    const valid = await getValidToken(env, String(token.user_id));
    const me = await mlRequest("/users/me", valid.access_token);
    if (!me.ok || String(me.data?.id || "") !== String(token.user_id)) throw new Error("Token importado não validou o seller esperado.");
    await recordMigration(env, token.user_id, "SUCCESS");
    return json({ ok: true, seller_id: String(token.user_id), nickname: me.data?.nickname || null });
  } catch (error) {
    await recordMigration(env, token.user_id, "FAILED_VALIDATION");
    return json({ error: "Token importado, mas a validação no Mercado Livre falhou. Reconexão pode ser necessária." }, 422);
  }
}

async function handleAutomationStatus(request, env) {
  const denied = await requireAdmin(request, env);
  if (denied) return denied;
  const [sellers, queue] = await Promise.all([listSellers(env), queueStats(env)]);
  return json({
    mode: String(env.ML_AUTOMATION_MODE || "dry-run"),
    sellers,
    queue,
    callback: `${new URL(request.url).origin}/api/webhook`
  });
}

async function handleHealth(env) {
  try {
    await env.DB.prepare("SELECT 1 AS ok").first();
    return json({ ok: true, runtime: "cloudflare-workers", database: "d1", mode: String(env.ML_AUTOMATION_MODE || "dry-run") });
  } catch {
    return json({ ok: false, database: "unavailable" }, 503);
  }
}

export default {
  async fetch(request, env, ctx) {
    const url = new URL(request.url);
    try {
      if (url.pathname === "/api/auth") return handleAuth(request, env);
      if (url.pathname === "/api/oauth") return handleOAuth(request, env);
      if (url.pathname === "/api/ml") return handleMl(request, env);
      if (url.pathname === "/api/webhook") return handleWebhook(request, env, ctx);
      if (url.pathname === "/api/migration/import-token") return handleMigrationImport(request, env);
      if (url.pathname === "/api/automation") return handleAutomationStatus(request, env);
      if (url.pathname === "/api/health") return handleHealth(env);
      return env.ASSETS.fetch(request);
    } catch (error) {
      console.error("worker_error", { path: url.pathname, message: error.message });
      return json({ error: "Erro interno." }, 500);
    }
  },

  async scheduled(_controller, env, ctx) {
    ctx.waitUntil(drainQueue(env, 25));
  }
};
