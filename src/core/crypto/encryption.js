const crypto = require("crypto");

function getKey() {
  const raw = process.env.TOKEN_ENCRYPTION_KEY;
  if (!raw) throw new Error("TOKEN_ENCRYPTION_KEY não configurada.");
  return crypto.createHash("sha256").update(raw).digest();
}

function encryptJson(value) {
  const iv = crypto.randomBytes(12);
  const cipher = crypto.createCipheriv("aes-256-gcm", getKey(), iv);
  const plaintext = Buffer.from(JSON.stringify(value), "utf8");
  const encrypted = Buffer.concat([cipher.update(plaintext), cipher.final()]);
  const tag = cipher.getAuthTag();
  return [iv, tag, encrypted].map(part => part.toString("base64url")).join(".");
}

function decryptJson(value) {
  const [ivRaw, tagRaw, dataRaw] = String(value || "").split(".");
  if (!ivRaw || !tagRaw || !dataRaw) throw new Error("Payload criptografado inválido.");
  const decipher = crypto.createDecipheriv("aes-256-gcm", getKey(), Buffer.from(ivRaw, "base64url"));
  decipher.setAuthTag(Buffer.from(tagRaw, "base64url"));
  return JSON.parse(Buffer.concat([
    decipher.update(Buffer.from(dataRaw, "base64url")),
    decipher.final()
  ]).toString("utf8"));
}

module.exports = { encryptJson, decryptJson };
