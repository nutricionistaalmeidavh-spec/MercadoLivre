const test = require("node:test");
const assert = require("node:assert/strict");
const fs = require("fs");
const os = require("os");
const path = require("path");

const dir = fs.mkdtempSync(path.join(os.tmpdir(), "artisys-ml-"));
process.env.ML_DB_PATH = path.join(dir, "test.sqlite");
process.env.TOKEN_ENCRYPTION_KEY = "test-only-encryption-key";

const { closeDatabase } = require("../src/core/database/sqlite");
const tokens = require("../src/modules/mercado-livre/auth/tokenRepository");
const idempotency = require("../src/modules/mercado-livre/automations/idempotency");

 test("token é persistido criptografado e recuperado", () => {
  tokens.saveToken({ user_id: 123, access_token: "access-secret", refresh_token: "refresh-secret", expires_in: 3600 });
  const restored = tokens.getToken("123");
  assert.equal(restored.access_token, "access-secret");
  assert.equal(restored.refresh_token, "refresh-secret");

  const bytes = fs.readFileSync(process.env.ML_DB_PATH);
  assert.equal(bytes.includes(Buffer.from("access-secret")), false);
  assert.equal(bytes.includes(Buffer.from("refresh-secret")), false);
});

test("idempotência aceita uma única execução por seller/order/versão", () => {
  const first = idempotency.beginRun({ sellerId: "123", orderId: "999" });
  const second = idempotency.beginRun({ sellerId: "123", orderId: "999" });
  assert.equal(first.isNew, true);
  assert.equal(second.isNew, false);
  assert.equal(first.key, second.key);
});

test.after(() => {
  closeDatabase();
  fs.rmSync(dir, { recursive: true, force: true });
});
