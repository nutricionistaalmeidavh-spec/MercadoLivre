import { decryptJson, encryptJson, randomBase64Url, sha256Base64Url, timingSafeSecretEqual } from "./crypto.mjs";
import { drainQueue } from "./automation.mjs";
import { enqueueWebhook, listSellers, queueStats, saveToken } from "./repository.mjs";
import { handlePublisherApi } from "./publisher.mjs";
import { handleMessageRulesApi } from "./message-rules.mjs";
import { handleOrdersApi } from "./orders.mjs";
import { handlePromotionsApi } from "./promotions.mjs";
import { handleOperationsApi } from "./operations.mjs";

const ADMIN_COOKIE = "artisys_admin";
const ADMIN_OPERATIONS_VERSION = "1.6.4";

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
  return [`${name}=${encodeURIComponent(value)}`, "Path=/", "HttpOnly", "Secure", "SameSite=Lax", `Max-Age=${maxAge}`].join("; ");
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
  throw new Error("Há mais de um seller conectado. Selecione o seller antes de usar esta operação.");
}

async function handleAuth(request, env) {
  const url = new URL(request.url);
  const op = url.searchParams.get("op");
  if (op === "status") return json({ authenticated: await isAdmin(request, env) });

  if (op === "login" && request.method === "POST") {
    const body = await request.json().catch(() => ({}));
    if (!env.ADMIN_PASSWORD || !env.ADMIN_SESSION_SECRET) {
      return json({ error: "ADMIN_PASSWORD/ADMIN_SESSION_SECRET não configurados no Cloudflare." }, 500);
    }
    if (!(await timingSafeSecretEqual(body.password, env.ADMIN_PASSWORD))) {
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
  const sellerId = await resolveSellerId(env);
  const result = await handlePublisherApi(env, request, sellerId);
  if (result.ok) return json(result.data, result.status || 200);
  const data = result.data?.error ? result.data : { error: "Falha na API do Mercado Livre.", details: result.data };
  return json(data, result.status || 500);
}

async function handleMessageRules(request, env) {
  const denied = await requireAdmin(request, env);
  if (denied) return denied;
  const sellerId = await resolveSellerId(env);
  const result = await handleMessageRulesApi(env, request, sellerId);
  if (result?.error) return json({ error: result.error }, result.status || 400);
  return json(result);
}

async function handleOrders(request, env) {
  const denied = await requireAdmin(request, env);
  if (denied) return denied;
  const sellerId = await resolveSellerId(env);
  const result = await handleOrdersApi(env, request, sellerId);
  if (result?.error) return json({ error: result.error, details: result.details }, result.status || 400);
  return json(result);
}

async function handlePromotions(request, env) {
  const denied = await requireAdmin(request, env);
  if (denied) return denied;
  const sellerId = await resolveSellerId(env);
  const result = await handlePromotionsApi(env, request, sellerId);
  if (result?.error) return json({ error: result.error, details: result.details }, result.status || 400);
  return json(result);
}

async function handleOperations(request, env) {
  const denied = await requireAdmin(request, env);
  if (denied) return denied;
  const result = await handleOperationsApi(env, request);
  if (result?.error) return json({ error: result.error }, result.status || 400);
  return json(result);
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

async function handleAutomationStatus(request, env) {
  const denied = await requireAdmin(request, env);
  if (denied) return denied;
  const [sellers, queue] = await Promise.all([listSellers(env), queueStats(env)]);
  return json({
    mode: String(env.ML_AUTOMATION_MODE || "dry-run"),
    sellers,
    queue,
    callback: `${new URL(request.url).origin}/api/webhook`,
    message_strategy: "per_item_rule",
    default_send: false
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

async function serveOperationsScript(request, env) {
  const url = new URL(request.url);
  const asset = await env.ASSETS.fetch(new Request(`${url.origin}/admin-operations.js`, request));
  if (!asset.ok) return asset;
  const headers = new Headers(asset.headers);
  headers.set("content-type", "application/javascript; charset=utf-8");
  headers.set("cache-control", "no-store, max-age=0");
  headers.set("x-artisys-ui-build", ADMIN_OPERATIONS_VERSION);
  return new Response(await asset.text(), { status: 200, headers });
}

async function serveAdmin(request, env) {
  const url = new URL(request.url);
  const asset = await env.ASSETS.fetch(new Request(`${url.origin}/admin-cloudflare.html`, request));
  if (!asset.ok) return asset;

  const [operationsAsset, postSaleAsset, promotionsClarityAsset] = await Promise.all([
    env.ASSETS.fetch(new Request(`${url.origin}/admin-operations.js`, request)),
    env.ASSETS.fetch(new Request(`${url.origin}/admin-post-sale-templates.js`, request)),
    env.ASSETS.fetch(new Request(`${url.origin}/admin-promotions-clarity.js`, request))
  ]);
  if (!operationsAsset.ok || !postSaleAsset.ok || !promotionsClarityAsset.ok) {
    return new Response("Bundle operacional do painel não encontrado.", {
      status: 500,
      headers: { "content-type": "text/plain; charset=utf-8", "cache-control": "no-store" }
    });
  }

  let html = await asset.text();
  const operationsScript = (await operationsAsset.text()).replace(/<\/script/gi, "<\\/script");
  const postSaleScript = (await postSaleAsset.text()).replace(/<\/script/gi, "<\\/script");
  const promotionsClarityScript = (await promotionsClarityAsset.text()).replace(/<\/script/gi, "<\\/script");

  html = html.replaceAll("Sem resposta", "Sem automação");
  html = html.replaceAll("anúncios para revisar", "anúncios sem regra automática");
  html = html.replaceAll("sem resposta", "sem automação");
  html = html.replaceAll("Fluxo preparado", "Pedidos");
  html = html.replaceAll("A navegação já está pronta. A listagem e o detalhe dos pedidos entram na Entrega 3.", "Carregando vendas, pagamentos e status da automação…");
  html = html.replaceAll("Área reservada", "Promoções");
  html = html.replaceAll("O menu e o contexto por anúncio já estão prontos. O controle real de promoções será conectado na Entrega 4.", "Carregando promoções e descontos dos anúncios…");
  html = html.replaceAll("O contexto já está ligado ao anúncio correto. Criar, editar e encerrar promoções entra na Entrega 4.", "Carregando promoções deste anúncio…");
  html = html.replace(/<script[^>]+src=["']\/admin-operations\.js(?:\?[^"']*)?["'][^>]*><\/script>/gi, "");
  html = html.replace(
    '</body>',
    `<script data-artisys-operations-build="${ADMIN_OPERATIONS_VERSION}">${operationsScript}</script><script data-artisys-post-sale-build="${ADMIN_OPERATIONS_VERSION}">${postSaleScript}</script><script data-artisys-promotions-clarity-build="${ADMIN_OPERATIONS_VERSION}">${promotionsClarityScript}</script></body>`
  );

  if (!html.includes('href="/system"')) {
    html = html.replace('<div class="more-grid">', '<div class="more-grid"><a class="more-link" href="/system"><div><strong>Sistema e diagnóstico</strong><span>Saúde, configuração, fila e logs operacionais.</span></div><svg class="chevron" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.9"><path d="m9 18 6-6-6-6"/></svg></a>');
  }

  const headers = new Headers(asset.headers);
  headers.set("content-type", "text/html; charset=utf-8");
  headers.set("cache-control", "no-store, max-age=0");
  headers.set("x-artisys-ui-build", ADMIN_OPERATIONS_VERSION);
  return new Response(html, { status: 200, headers });
}

async function serveSystem(request, env) {
  const denied = await requireAdmin(request, env);
  if (denied) return Response.redirect(`${new URL(request.url).origin}/admin?view=mais`, 302);
  const url = new URL(request.url);
  const asset = await env.ASSETS.fetch(new Request(`${url.origin}/admin-system.html`, request));
  if (!asset.ok) return asset;
  const headers = new Headers(asset.headers);
  headers.set("content-type", "text/html; charset=utf-8");
  headers.set("cache-control", "no-store, max-age=0");
  headers.set("x-artisys-ui-build", ADMIN_OPERATIONS_VERSION);
  return new Response(await asset.text(), { status: 200, headers });
}

async function servePublisher(request, env) {
  const url = new URL(request.url);
  const asset = await env.ASSETS.fetch(new Request(`${url.origin}/publisher.html`, request));
  if (!asset.ok) return asset;
  let html = await asset.text();
  html = html.replace(
    "Use a senha administrativa que você configurou nas Environment Variables do Vercel.",
    "Use a senha administrativa configurada como Worker Secret no Cloudflare."
  );
  html = html.replace(
    "async function jfetch(url,opts={}){const r=await fetch(url,{credentials:'same-origin',...opts});let data;try{data=await r.json()}catch{data={text:await r.text()}}if(!r.ok)throw Object.assign(new Error(data.error||data.message||`HTTP ${r.status}`),{data,status:r.status});return data}",
    "async function jfetch(url,opts={}){const r=await fetch(url,{credentials:'same-origin',...opts});const raw=await r.text();let data={};try{data=raw?JSON.parse(raw):{}}catch{data={text:raw}}if(!r.ok)throw Object.assign(new Error(data.error||data.message||data.text||`HTTP ${r.status}`),{data,status:r.status});return data}"
  );
  const headers = new Headers(asset.headers);
  headers.set("content-type", "text/html; charset=utf-8");
  headers.set("cache-control", "no-store");
  return new Response(html, { status: 200, headers });
}

export default {
  async fetch(request, env, ctx) {
    const url = new URL(request.url);
    try {
      if (url.pathname === "/admin" || url.pathname === "/admin/" || url.pathname === "/admin.html") return await serveAdmin(request, env);
      if (url.pathname === "/admin-operations.js") return await serveOperationsScript(request, env);
      if (url.pathname === "/system" || url.pathname === "/system/") return await serveSystem(request, env);
      if (url.pathname === "/publisher" || url.pathname === "/publisher/") return await servePublisher(request, env);
      if (url.pathname === "/api/auth") return await handleAuth(request, env);
      if (url.pathname === "/api/oauth") return await handleOAuth(request, env);
      if (url.pathname === "/api/ml") return await handleMl(request, env);
      if (url.pathname === "/api/message-rules") return await handleMessageRules(request, env);
      if (url.pathname === "/api/orders") return await handleOrders(request, env);
      if (url.pathname === "/api/promotions") return await handlePromotions(request, env);
      if (url.pathname === "/api/operations") return await handleOperations(request, env);
      if (url.pathname === "/api/webhook") return await handleWebhook(request, env, ctx);
      if (url.pathname === "/api/automation") return await handleAutomationStatus(request, env);
      if (url.pathname === "/api/health") return await handleHealth(env);
      return await env.ASSETS.fetch(request);
    } catch (error) {
      console.error("worker_error", { path: url.pathname, message: error.message });
      return json({ error: error.message || "Erro interno." }, Number(error.statusCode || 500));
    }
  },

  async scheduled(_controller, env, ctx) {
    ctx.waitUntil(drainQueue(env, 25));
  }
};
