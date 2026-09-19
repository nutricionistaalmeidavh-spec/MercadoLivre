import baseWorker from "./index.mjs";
import { decryptJson } from "./crypto.mjs";
import { listSellers } from "./repository.mjs";
import { handleSiteCatalogAdminApi, handleSiteCatalogFeedApi } from "./site-catalog.mjs";

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

async function serveSiteCatalogAdmin(request, env) {
  const denied = await requireAdmin(request, env);
  if (denied) return Response.redirect(`${new URL(request.url).origin}/admin?view=mais`, 302);
  const url = new URL(request.url);
  const asset = await env.ASSETS.fetch(new Request(`${url.origin}/admin-site-catalog.html`, request));
  if (!asset.ok) return asset;
  const headers = new Headers(asset.headers);
  headers.set("content-type", "text/html; charset=utf-8");
  headers.set("cache-control", "no-store, max-age=0");
  return new Response(await asset.text(), { status: 200, headers });
}

async function handleAdminApi(request, env) {
  const denied = await requireAdmin(request, env);
  if (denied) return denied;
  const sellerId = await resolveSellerId(env);
  const result = await handleSiteCatalogAdminApi(env, request, sellerId);
  if (result?.error) return json({ error: result.error }, result.status || 400);
  return json(result);
}

async function handlePublicFeed(request, env) {
  if (request.method === "OPTIONS") {
    return new Response(null, {
      status: 204,
      headers: {
        "access-control-allow-origin": "*",
        "access-control-allow-methods": "GET, OPTIONS",
        "access-control-max-age": "86400"
      }
    });
  }
  const sellerId = await resolveSellerId(env);
  const result = await handleSiteCatalogFeedApi(env, request, sellerId);
  if (result?.error) return json({ error: result.error }, result.status || 400, { "access-control-allow-origin": "*" });
  return json(result, 200, {
    "access-control-allow-origin": "*",
    "cache-control": "public, max-age=60, s-maxage=300"
  });
}

async function serveAdminWithCatalogLink(request, env, ctx) {
  const response = await baseWorker.fetch(request, env, ctx);
  if (!response.ok || !String(response.headers.get("content-type") || "").includes("text/html")) return response;
  let html = await response.text();
  if (!html.includes('href="/site-catalog"')) {
    const card = '<a class="more-link" href="/site-catalog"><div><strong>Catálogo ArtiSys</strong><span>Aprove quais anúncios e fotos entram no site artisys.dev.</span></div><svg class="chevron" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.9"><path d="m9 18 6-6-6-6"/></svg></a>';
    html = html.replace('<div class="more-grid">', `<div class="more-grid">${card}`);
  }
  return new Response(html, { status: response.status, headers: response.headers });
}

export default {
  async fetch(request, env, ctx) {
    const url = new URL(request.url);
    try {
      if (url.pathname === "/admin" || url.pathname === "/admin/" || url.pathname === "/admin.html") return await serveAdminWithCatalogLink(request, env, ctx);
      if (url.pathname === "/site-catalog" || url.pathname === "/site-catalog/") return await serveSiteCatalogAdmin(request, env);
      if (url.pathname === "/api/site-catalog/admin") return await handleAdminApi(request, env);
      if (url.pathname === "/api/site-catalog/feed") return await handlePublicFeed(request, env);
      return baseWorker.fetch(request, env, ctx);
    } catch (error) {
      console.error("site_catalog_worker_error", { path: url.pathname, message: error.message });
      return json({ error: error.message || "Erro interno." }, Number(error.statusCode || 500), url.pathname === "/api/site-catalog/feed" ? { "access-control-allow-origin": "*" } : {});
    }
  },

  async scheduled(controller, env, ctx) {
    if (typeof baseWorker.scheduled === "function") return baseWorker.scheduled(controller, env, ctx);
  }
};
