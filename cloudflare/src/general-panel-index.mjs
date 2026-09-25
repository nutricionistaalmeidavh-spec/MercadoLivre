import baseWorker from "./site-catalog-index.mjs";
import { decryptJson } from "./crypto.mjs";
import { handleLicenseCenterApi, serveLicenseCenterPage } from "./license-center.mjs";

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
    const card = '<a class="more-link" href="/licenses"><div><strong>Central de Licenças</strong><span>Consulte clientes, licenças, validade, módulos, dispositivos e auditoria. Somente leitura nesta etapa.</span></div><svg class="chevron" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.9"><path d="m9 18 6-6-6-6"/></svg></a>';
    html = html.replace('<div class="more-grid">', `<div class="more-grid">${card}`);
  }
  return new Response(html, { status: response.status, headers: response.headers });
}

async function serveLicenseCenter(request, env) {
  const denied = await requireAdmin(request, env);
  if (denied) return Response.redirect(`${new URL(request.url).origin}/admin?view=mais`, 302);
  return serveLicenseCenterPage(request, env);
}

async function handleLicenseCenter(request, env) {
  const denied = await requireAdmin(request, env);
  if (denied) return denied;
  return handleLicenseCenterApi(request, env);
}

export default {
  async fetch(request, env, ctx) {
    const url = new URL(request.url);
    try {
      if (url.pathname === "/admin" || url.pathname === "/admin/" || url.pathname === "/admin.html") {
        return await serveAdminWithLicenseLink(request, env, ctx);
      }
      if (url.pathname === "/licenses" || url.pathname === "/licenses/") return await serveLicenseCenter(request, env);
      if (url.pathname === "/api/license-center") return await handleLicenseCenter(request, env);
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
