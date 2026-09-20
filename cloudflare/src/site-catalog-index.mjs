import baseWorker from "./index.mjs";
import { decryptJson } from "./crypto.mjs";
import { listSellers } from "./repository.mjs";
import { handleSiteCatalogAdminApi, handleSiteCatalogFeedApi } from "./site-catalog.mjs";
import { fetchCanonicalCollections } from "./site-catalog-collections.mjs";
import { fetchCanonicalProducts, linkDecisionToCanonicalProduct, linkGroupToCanonicalProduct } from "./site-catalog-products.mjs";
import { getSiteCatalogGroup, listSiteCatalogDecisions, listSiteCatalogGroupItems, updateSiteCatalogGroup, upsertSiteCatalogDecision } from "./site-catalog-repository.mjs";

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

function groupUpdatePayload(group, linked) {
  return {
    groupId: String(group.group_id || ""),
    primaryItemId: String(group.primary_item_id || ""),
    approved: Boolean(linked.approved),
    siteVisibility: String(linked.site_visibility || "hidden"),
    collectionSlug: String(linked.collection_slug || ""),
    siteName: String(linked.site_name || group.site_name || ""),
    siteSlug: String(linked.site_slug || ""),
    featured: Boolean(group.featured),
    priceMode: String(group.price_mode || "marketplace"),
    heroPictureUrl: String(group.hero_picture_url || "")
  };
}

function decisionUpdatePayload(itemId, linked) {
  return {
    itemId: String(itemId || ""),
    approved: Boolean(linked.approved),
    siteVisibility: String(linked.site_visibility || "hidden"),
    collectionSlug: String(linked.collection_slug || ""),
    siteName: String(linked.site_name || ""),
    siteSlug: String(linked.site_slug || ""),
    featured: Boolean(linked.featured),
    priceMode: String(linked.price_mode || "marketplace"),
    heroPictureUrl: String(linked.hero_picture_url || "")
  };
}

async function handleCatalogLinkingApi(request, env) {
  const denied = await requireAdmin(request, env);
  if (denied) return denied;
  const sellerId = await resolveSellerId(env);
  const [canonicalProducts, canonicalCollections] = await Promise.all([
    fetchCanonicalProducts(env),
    fetchCanonicalCollections(env)
  ]);

  if (request.method === "GET") {
    const catalog = await handleSiteCatalogAdminApi(env, request, sellerId);
    if (catalog?.error) return json({ error: catalog.error }, catalog.status || 400);
    const productSlugs = new Set(canonicalProducts.products.map((product) => product.slug));
    return json({
      seller_id: String(sellerId),
      products: canonicalProducts.products,
      products_source: canonicalProducts.source,
      products_warning: canonicalProducts.warning || "",
      groups: (catalog.groups || []).map((group) => ({
        ...group,
        linked_product_slug: productSlugs.has(String(group.site_slug || "")) ? String(group.site_slug) : ""
      })),
      items: (catalog.items || []).map((item) => ({
        item_id: String(item.item_id || ""),
        linked_product_slug: productSlugs.has(String(item.decision?.site_slug || "")) ? String(item.decision.site_slug) : ""
      }))
    });
  }

  if (request.method === "POST") {
    const body = await request.json().catch(() => ({}));
    const groupId = String(body.group_id || "").trim();
    const itemId = String(body.item_id || "").trim();
    const linkedProductSlug = String(body.linked_product_slug || "").trim();
    if ((!groupId && !itemId) || (groupId && itemId)) {
      return json({ error: "Informe exatamente um group_id ou item_id." }, 400);
    }

    if (itemId) {
      const groupItems = await listSiteCatalogGroupItems(env, sellerId);
      if (groupItems.some((entry) => String(entry.item_id || "") === itemId)) {
        return json({ error: "Anúncio agrupado deve ser vinculado pela página do grupo." }, 409);
      }
      const decisions = await listSiteCatalogDecisions(env, sellerId);
      const decision = decisions.find((entry) => String(entry.item_id || "") === itemId) || {
        item_id: itemId,
        approved: false,
        site_visibility: "hidden",
        collection_slug: "",
        site_name: "",
        site_slug: "",
        featured: false,
        price_mode: "marketplace",
        hero_picture_url: ""
      };
      let linked;
      try {
        linked = linkDecisionToCanonicalProduct(decision, linkedProductSlug, canonicalProducts.products, canonicalCollections.collections);
      } catch (error) {
        return json({ error: error.message || "Página ArtiSys inválida." }, 400);
      }
      const saved = await upsertSiteCatalogDecision(env, sellerId, decisionUpdatePayload(itemId, linked));
      return json({
        ok: true,
        item_id: itemId,
        linked_product_slug: linkedProductSlug,
        site_name: String(saved?.site_name || ""),
        site_slug: String(saved?.site_slug || ""),
        site_visibility: String(saved?.site_visibility || "hidden"),
        collection_slug: String(saved?.collection_slug || ""),
        approved: Number(saved?.approved || 0) === 1
      });
    }

    const group = await getSiteCatalogGroup(env, sellerId, groupId);
    if (!group) return json({ error: "Grupo não encontrado." }, 404);
    let linked;
    try {
      linked = linkGroupToCanonicalProduct(group, linkedProductSlug, canonicalProducts.products, canonicalCollections.collections);
    } catch (error) {
      return json({ error: error.message || "Página ArtiSys inválida." }, 400);
    }
    const saved = await updateSiteCatalogGroup(env, sellerId, groupUpdatePayload(group, linked));
    return json({
      ok: true,
      group_id: groupId,
      linked_product_slug: linkedProductSlug,
      site_name: String(saved?.site_name || ""),
      site_slug: String(saved?.site_slug || ""),
      site_visibility: String(saved?.site_visibility || "hidden"),
      collection_slug: String(saved?.collection_slug || ""),
      approved: Number(saved?.approved || 0) === 1
    });
  }

  return json({ error: "Método não permitido." }, 405);
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
      if (url.pathname === "/api/site-catalog/linking") return await handleCatalogLinkingApi(request, env);
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
