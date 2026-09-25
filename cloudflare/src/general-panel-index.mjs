import baseWorker from "./site-catalog-index.mjs";
import { decryptJson } from "./crypto.mjs";
import { handleLicenseCenterApi, proxyLicenseCenterWrite, serveLicenseCenterPage } from "./license-center.mjs";

const ADMIN_COOKIE = "artisys_admin";

function json(data, status = 200) {
  return new Response(JSON.stringify(data), {
    status,
    headers: { "content-type": "application/json; charset=utf-8", "cache-control": "no-store" }
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

async function serveAdminWithLicenseLink(request, env, ctx) {
  const response = await baseWorker.fetch(request, env, ctx);
  if (!response.ok || !String(response.headers.get("content-type") || "").includes("text/html")) return response;
  let html = await response.text();
  if (!html.includes('href="/licenses"')) {
    const card = '<a class="more-link" href="/licenses"><div><strong>Central de Licenças</strong><span>Administre clientes, licenças, validade, módulos, dispositivos e auditoria em uma única central.</span></div><svg class="chevron" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.9"><path d="m9 18 6-6-6-6"/></svg></a>';
    html = html.replace('<div class="more-grid">', `<div class="more-grid">${card}`);
  }
  return new Response(html, { status: response.status, headers: response.headers });
}

async function serveLicenseCenter(request, env) {
  const denied = await requireAdmin(request, env);
  if (denied) return Response.redirect(`${new URL(request.url).origin}/admin?view=mais`, 302);
  return serveLicenseCenterPage(request, env);
}

function licenseCenterWriteTarget(pathname,method){
  if(pathname==="/api/license-center/obra/companies"&&method==="POST")return "/api/internal/license-center/obra/companies";
  let match=pathname.match(/^\/api\/license-center\/obra\/companies\/([^/]+)$/);
  if(match&&method==="PUT")return `/api/internal/license-center/obra/companies/${encodeURIComponent(decodeURIComponent(match[1]))}`;
  match=pathname.match(/^\/api\/license-center\/obra\/devices\/([^/]+)$/);
  if(match&&method==="PUT")return `/api/internal/license-center/obra/devices/${encodeURIComponent(decodeURIComponent(match[1]))}`;
  if(pathname==="/api/license-center/debora/license"&&method==="POST")return "/api/internal/license-center/debora/license";
  if(pathname==="/api/license-center/loja-online/companies"&&method==="POST")return "/api/internal/license-center/loja-online/companies";
  match=pathname.match(/^\/api\/license-center\/loja-online\/companies\/([^/]+)\/(license|extend|block|unblock)$/);
  if(match&&((match[2]==="license"&&method==="PUT")||(match[2]!=="license"&&method==="POST")))return `/api/internal/license-center/loja-online/companies/${encodeURIComponent(decodeURIComponent(match[1]))}/${match[2]}`;
  return null;
}

async function handleLicenseCenter(request, env) {
  const denied = await requireAdmin(request, env);
  if (denied) return denied;
  const url=new URL(request.url);
  if(url.pathname==="/api/license-center")return handleLicenseCenterApi(request, env);
  const target=licenseCenterWriteTarget(url.pathname,request.method);
  if(!target)return json({error:"not_found"},404);
  return proxyLicenseCenterWrite(request,env,target);
}

export default {
  async fetch(request, env, ctx) {
    const url = new URL(request.url);
    try {
      if (url.pathname === "/admin" || url.pathname === "/admin/" || url.pathname === "/admin.html") {
        return await serveAdminWithLicenseLink(request, env, ctx);
      }
      if (url.pathname === "/licenses" || url.pathname === "/licenses/") return await serveLicenseCenter(request, env);
      if (url.pathname === "/api/license-center" || url.pathname.startsWith("/api/license-center/")) return await handleLicenseCenter(request, env);
      return baseWorker.fetch(request, env, ctx);
    } catch (error) {
      console.error("general_panel_worker_error", { path: url.pathname, message: error?.message || String(error) });
      return json({ error: error?.message || "Erro interno." }, Number(error?.statusCode || 500));
    }
  },

  async scheduled(controller, env, ctx) {
    if (typeof baseWorker.scheduled === "function") return baseWorker.scheduled(controller, env, ctx);
  }
};
