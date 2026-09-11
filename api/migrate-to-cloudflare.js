const L = require("./_lib");

module.exports = async (req, res) => {
  try {
    if (req.method !== "POST") return L.json(res, 405, { error: "Método não permitido." });
    if (!L.requireAdmin(req, res)) return;

    const target = process.env.ML_MIGRATION_TARGET_URL;
    const migrationSecret = process.env.ML_MIGRATION_SECRET;
    if (!target || !migrationSecret) {
      return L.json(res, 503, { error: "Bridge de migração não configurado na Vercel." });
    }

    let targetUrl;
    try {
      targetUrl = new URL("/api/migration/import-token", target);
    } catch {
      return L.json(res, 500, { error: "ML_MIGRATION_TARGET_URL inválida." });
    }
    if (targetUrl.protocol !== "https:") {
      return L.json(res, 500, { error: "Migração exige destino HTTPS." });
    }

    const encryptedCookie = L.cookies(req).artisys_ml;
    const token = encryptedCookie ? L.decrypt(encryptedCookie) : null;
    if (!token?.user_id || !token?.access_token || !token?.refresh_token) {
      return L.json(res, 409, {
        error: "A conexão Mercado Livre não está disponível neste navegador/Vercel. Será necessário reconectar."
      });
    }

    const response = await fetch(targetUrl, {
      method: "POST",
      headers: {
        authorization: `Bearer ${migrationSecret}`,
        "content-type": "application/json",
        accept: "application/json"
      },
      body: JSON.stringify({ token })
    });
    const data = await response.json().catch(() => ({}));
    if (!response.ok) {
      return L.json(res, response.status, {
        error: "Cloudflare recusou a migração do token.",
        details: data?.error || null
      });
    }

    return L.json(res, 200, {
      ok: true,
      seller_id: String(data.seller_id || token.user_id),
      nickname: data.nickname || null,
      target_host: targetUrl.host,
      note: "Token transferido diretamente para o Cloudflare; o refresh token não foi retornado ao navegador."
    });
  } catch (error) {
    return L.json(res, 500, { error: "Falha ao migrar conexão Mercado Livre." });
  }
};
