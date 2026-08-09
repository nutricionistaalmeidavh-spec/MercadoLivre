const API = "https://api.mercadolibre.com";

async function request(path, options = {}, token) {
  const headers = { accept: "application/json", ...(options.headers || {}) };
  if (token) headers.authorization = `Bearer ${token}`;
  const response = await fetch(API + path, { ...options, headers });
  const text = await response.text();
  let data = {};
  try { data = text ? JSON.parse(text) : {}; } catch { data = { text }; }
  return { ok: response.ok, status: response.status, data, headers: response.headers };
}

module.exports = { API, request };
