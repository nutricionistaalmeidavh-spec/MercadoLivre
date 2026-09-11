const encoder = new TextEncoder();
const decoder = new TextDecoder();

function toBase64Url(bytes) {
  let binary = "";
  for (const byte of bytes) binary += String.fromCharCode(byte);
  return btoa(binary).replace(/\+/g, "-").replace(/\//g, "_").replace(/=+$/g, "");
}

function fromBase64Url(value) {
  const padded = String(value).replace(/-/g, "+").replace(/_/g, "/").padEnd(Math.ceil(String(value).length / 4) * 4, "=");
  const binary = atob(padded);
  return Uint8Array.from(binary, (char) => char.charCodeAt(0));
}

async function deriveAesKey(secret) {
  if (!secret) throw new Error("TOKEN_ENCRYPTION_KEY não configurada.");
  const digest = await crypto.subtle.digest("SHA-256", encoder.encode(String(secret)));
  return crypto.subtle.importKey("raw", digest, "AES-GCM", false, ["encrypt", "decrypt"]);
}

export async function encryptJson(value, secret) {
  const key = await deriveAesKey(secret);
  const iv = crypto.getRandomValues(new Uint8Array(12));
  const encrypted = new Uint8Array(await crypto.subtle.encrypt(
    { name: "AES-GCM", iv },
    key,
    encoder.encode(JSON.stringify(value))
  ));
  return `${toBase64Url(iv)}.${toBase64Url(encrypted)}`;
}

export async function decryptJson(payload, secret) {
  const [ivEncoded, encryptedEncoded] = String(payload || "").split(".");
  if (!ivEncoded || !encryptedEncoded) throw new Error("Payload criptografado inválido.");
  const key = await deriveAesKey(secret);
  const decrypted = await crypto.subtle.decrypt(
    { name: "AES-GCM", iv: fromBase64Url(ivEncoded) },
    key,
    fromBase64Url(encryptedEncoded)
  );
  return JSON.parse(decoder.decode(decrypted));
}

async function digest(value) {
  return new Uint8Array(await crypto.subtle.digest("SHA-256", encoder.encode(String(value || ""))));
}

export async function timingSafeSecretEqual(left, right) {
  const [a, b] = await Promise.all([digest(left), digest(right)]);
  if (a.length !== b.length) return false;
  let diff = 0;
  for (let i = 0; i < a.length; i += 1) diff |= a[i] ^ b[i];
  return diff === 0;
}

export function randomBase64Url(size = 32) {
  return toBase64Url(crypto.getRandomValues(new Uint8Array(size)));
}

export async function sha256Base64Url(value) {
  const digestBytes = new Uint8Array(await crypto.subtle.digest("SHA-256", encoder.encode(String(value))));
  return toBase64Url(digestBytes);
}
