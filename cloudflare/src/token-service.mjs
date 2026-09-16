import { getStoredToken, saveToken } from "./repository.mjs";

async function acquireRefreshLock(env, sellerId) {
  const now = Date.now();
  const until = now + 15_000;
  const inserted = await env.DB.prepare(
    "INSERT OR IGNORE INTO token_locks (seller_id, locked_until) VALUES (?, ?)"
  ).bind(String(sellerId), until).run();
  if (Number(inserted.meta?.changes || 0) === 1) return true;

  const recovered = await env.DB.prepare(
    "UPDATE token_locks SET locked_until=? WHERE seller_id=? AND locked_until < ?"
  ).bind(until, String(sellerId), now).run();
  return Number(recovered.meta?.changes || 0) === 1;
}

async function releaseRefreshLock(env, sellerId) {
  await env.DB.prepare("DELETE FROM token_locks WHERE seller_id=?").bind(String(sellerId)).run();
}

async function refreshToken(env, token) {
  const form = new URLSearchParams({
    grant_type: "refresh_token",
    client_id: env.ML_CLIENT_ID,
    client_secret: env.ML_CLIENT_SECRET,
    refresh_token: token.refresh_token
  });
  const response = await fetch("https://api.mercadolibre.com/oauth/token", {
    method: "POST",
    headers: { "content-type": "application/x-www-form-urlencoded", accept: "application/json" },
    body: form.toString()
  });
  const data = await response.json().catch(() => ({}));
  if (!response.ok) {
    const error = new Error("Falha ao renovar token Mercado Livre.");
    error.statusCode = response.status;
    error.details = data;
    error.retryable = response.status === 429 || response.status >= 500;
    throw error;
  }
  const next = {
    ...data,
    user_id: data.user_id || token.user_id,
    expires_at: Date.now() + Number(data.expires_in || 21600) * 1000
  };
  await saveToken(env, next);
  return next;
}

export async function getValidToken(env, sellerId) {
  const current = await getStoredToken(env, sellerId);
  if (!current?.access_token) throw new Error("Mercado Livre não conectado no Cloudflare.");
  if (!current.expires_at || Date.now() <= Number(current.expires_at) - 120_000) return current;

  if (await acquireRefreshLock(env, sellerId)) {
    try {
      const latest = await getStoredToken(env, sellerId);
      if (latest?.expires_at && Date.now() <= Number(latest.expires_at) - 120_000) return latest;
      return await refreshToken(env, latest || current);
    } finally {
      await releaseRefreshLock(env, sellerId);
    }
  }

  for (let i = 0; i < 20; i += 1) {
    await new Promise((resolve) => setTimeout(resolve, 250));
    const latest = await getStoredToken(env, sellerId);
    if (latest?.expires_at && Number(latest.expires_at) > Number(current.expires_at || 0)) return latest;
  }

  const error = new Error("Renovação de token em andamento; tente novamente.");
  error.retryable = true;
  throw error;
}
