const test = require("node:test");
const assert = require("node:assert/strict");
const { evaluatePolicy } = require("../src/modules/mercado-livre/messages/policyGuard");

test("falha fechada quando action guide está indisponível", () => {
  const result = evaluatePolicy({
    guideResponse: { ok: false, status: 500, data: { error: "temporary" } },
    capsResponse: { ok: true, data: { cap_available: 1 } },
    text: "Olá"
  });
  assert.equal(result.allowed, false);
  assert.equal(result.reason, "ACTION_GUIDE_UNAVAILABLE");
});

test("falha fechada quando caps não podem ser consultados", () => {
  const result = evaluatePolicy({
    guideResponse: { ok: true, data: { options: [{ option_id: "OTHER" }] } },
    capsResponse: { ok: false, status: 503 },
    text: "Olá"
  });
  assert.equal(result.allowed, false);
  assert.equal(result.reason, "CAPS_UNAVAILABLE");
});
