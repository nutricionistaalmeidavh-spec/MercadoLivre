const { getEnvironment } = require("../../../config/environment");
const { request } = require("../../../core/http/mercadoLivreClient");
const repository = require("./tokenRepository");

const refreshLocks = new Map();

async function refreshToken(token) {
  const env = getEnvironment();
  const form = new URLSearchParams({
    grant_type: "refresh_token",
    client_id: env.clientId,
    client_secret: env.clientSecret,
    refresh_token: token.refresh_token
  });
  const response = await request("/oauth/token", {
    method: "POST",
    headers: { "content-type": "application/x-www-form-urlencoded" },
    body: form.toString()
  });
  if (!response.ok) {
    const error = new Error("Falha ao renovar token do Mercado Livre.");
    error.statusCode = response.status;
    error.details = response.data;
    throw error;
  }
  const next = {
    ...response.data,
    user_id: response.data.user_id ?? token.user_id,
    expires_at: Date.now() + Number(response.data.expires_in || 21600) * 1000
  };
  return repository.saveToken(next);
}

async function getValidToken(sellerId) {
  const token = sellerId == null ? repository.getAnyToken() : repository.getToken(sellerId);
  if (!token || !token.access_token) throw new Error("Mercado Livre não conectado no servidor.");
  if (!token.expires_at || Date.now() < token.expires_at - 120000) return token;

  const key = String(token.user_id || sellerId || "default");
  if (!refreshLocks.has(key)) {
    refreshLocks.set(key, refreshToken(token).finally(() => refreshLocks.delete(key)));
  }
  return refreshLocks.get(key);
}

module.exports = { getValidToken, refreshToken, saveToken: repository.saveToken };
