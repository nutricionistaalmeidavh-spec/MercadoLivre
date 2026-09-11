import test from "node:test";
import assert from "node:assert/strict";
import { encryptJson, decryptJson, timingSafeSecretEqual } from "../cloudflare/src/crypto.mjs";
import { parseOrderId } from "../cloudflare/src/automation.mjs";
import { evaluateMessagePolicy, normalizeOrder } from "../cloudflare/src/mercadolivre.mjs";

test("Cloudflare crypto encrypts and decrypts token payload", async () => {
  const secret = "test-secret-not-production";
  const token = { user_id: 123, access_token: "access", refresh_token: "refresh", expires_at: 123456 };
  const encrypted = await encryptJson(token, secret);
  assert.notEqual(encrypted, JSON.stringify(token));
  assert.deepEqual(await decryptJson(encrypted, secret), token);
  assert.equal(await timingSafeSecretEqual("same", "same"), true);
  assert.equal(await timingSafeSecretEqual("same", "different"), false);
});

test("Cloudflare order notification parser extracts order id", () => {
  assert.equal(parseOrderId("/orders/2000000012345678"), "2000000012345678");
  assert.equal(parseOrderId("/shipments/123"), null);
});

test("Cloudflare order normalization rejects cancelled and unapproved orders", () => {
  const cancelled = normalizeOrder({
    id: 1,
    pack_id: 10,
    status: "cancelled",
    seller: { id: 99 },
    buyer: { id: 100 },
    payments: [{ status: "approved" }]
  });
  assert.equal(cancelled.cancelled, true);

  const pending = normalizeOrder({
    id: 2,
    pack_id: 11,
    status: "confirmed",
    seller: { id: 99 },
    buyer: { id: 100 },
    payments: [{ status: "pending" }]
  });
  assert.equal(pending.paymentApproved, false);
});

test("Cloudflare message policy only uses cap associated with OTHER", () => {
  const allowed = evaluateMessagePolicy({
    guide: { ok: true, data: { options: [{ option_id: "OTHER", char_limit: 350 }] } },
    caps: { ok: true, data: { options: [{ option_id: "OTHER", cap_available: 1 }, { option_id: "DELIVERY", cap_available: 5 }] } },
    text: "Mensagem permitida"
  });
  assert.equal(allowed.allowed, true);

  const blocked = evaluateMessagePolicy({
    guide: { ok: true, data: { options: [{ option_id: "OTHER", char_limit: 350 }] } },
    caps: { ok: true, data: { options: [{ option_id: "OTHER", cap_available: 0 }, { option_id: "DELIVERY", cap_available: 5 }] } },
    text: "Mensagem"
  });
  assert.equal(blocked.allowed, false);
  assert.equal(blocked.reason, "NO_OTHER_MESSAGE_CAP");
});
