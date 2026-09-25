function json(data, status = 200) {
  return new Response(JSON.stringify(data), {
    status,
    headers: { "content-type": "application/json; charset=utf-8", "cache-control": "no-store" }
  });
}

export async function fetchLicenseCenterSnapshot(env) {
  const binding = env.OBRA_LICENSING;
  const secret = String(env.OBRA_LICENSE_CENTER_READ_SECRET || "").trim();
  if (!binding?.fetch) throw new Error("OBRA_LICENSING não configurado.");
  if (!secret) throw new Error("OBRA_LICENSE_CENTER_READ_SECRET não configurado.");

  const request = new Request("https://obra.internal/api/internal/license-center/snapshot", {
    method: "GET",
    headers: { "x-artisys-license-center-secret": secret }
  });
  const response = await binding.fetch(request);
  const payload = await response.json().catch(() => ({}));
  if (!response.ok) {
    const error = new Error(payload?.message || payload?.error || "Falha ao consultar a Central de Licenças.");
    error.statusCode = response.status;
    throw error;
  }
  return payload;
}

export async function handleLicenseCenterApi(request, env) {
  if (request.method !== "GET") {
    return json({ error: "read_only", message: "Central de Licenças disponível somente para leitura nesta etapa." }, 405);
  }
  try {
    return json(await fetchLicenseCenterSnapshot(env));
  } catch (error) {
    return json({ error: "license_center_unavailable", message: error?.message || "Central de Licenças indisponível." }, Number(error?.statusCode || 503));
  }
}

export async function serveLicenseCenterPage(request, env) {
  const url = new URL(request.url);
  const asset = await env.ASSETS.fetch(new Request(`${url.origin}/license-center.html`, request));
  if (!asset.ok) return asset;
  const headers = new Headers(asset.headers);
  headers.set("content-type", "text/html; charset=utf-8");
  headers.set("cache-control", "no-store, max-age=0");
  return new Response(await asset.text(), { status: 200, headers });
}
