const { migrate } = require("../../../core/database/migrations");
const { encryptJson, decryptJson } = require("../../../core/crypto/encryption");

function saveToken(token) {
  if (!token || token.user_id == null) throw new Error("Token sem user_id do seller.");
  const db = migrate();
  const now = Date.now();
  const expiresAt = token.expires_at || (token.expires_in ? now + Number(token.expires_in) * 1000 : null);
  const payload = { ...token, expires_at: expiresAt };
  db.prepare(`
    INSERT INTO ml_tokens (seller_id, encrypted_payload, expires_at, updated_at)
    VALUES (?, ?, ?, ?)
    ON CONFLICT(seller_id) DO UPDATE SET
      encrypted_payload=excluded.encrypted_payload,
      expires_at=excluded.expires_at,
      updated_at=excluded.updated_at
  `).run(String(token.user_id), encryptJson(payload), expiresAt, now);
  return payload;
}

function getToken(sellerId) {
  const db = migrate();
  const row = db.prepare("SELECT encrypted_payload FROM ml_tokens WHERE seller_id = ?").get(String(sellerId));
  return row ? decryptJson(row.encrypted_payload) : null;
}

function getAnyToken() {
  const db = migrate();
  const row = db.prepare("SELECT encrypted_payload FROM ml_tokens ORDER BY updated_at DESC LIMIT 1").get();
  return row ? decryptJson(row.encrypted_payload) : null;
}

module.exports = { saveToken, getToken, getAnyToken };
