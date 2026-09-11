const test = require("node:test");
const assert = require("node:assert/strict");
const { evaluatePolicy } = require("../src/modules/mercado-livre/messages/policyGuard");

const guide = { ok: true, data: { options: [{ option_id: "OTHER", char_limit: 350 }] } };
const caps = { ok: true, data: { options: [{ option_id: "OTHER", cap_available: 1 }] } };

test("autoriza OTHER quando disponível e com cap", () => {
  const result = evaluatePolicy({ guideResponse: guide, capsResponse: caps, text: "Obrigado pela compra" });
  assert.equal(result.allowed, true);
  assert.equal(result.optionId, "OTHER");
});

test("bloqueia quando cap acabou", () => {
  const result = evaluatePolicy({ guideResponse: guide, capsResponse: { ok: true, data: { cap_available: 0 } }, text: "Olá" });
  assert.equal(result.allowed, false);
  assert.equal(result.reason, "NO_MESSAGE_CAP");
});

test("bloqueia mensagem acima do limite retornado", () => {
  const result = evaluatePolicy({ guideResponse: { ok: true, data: { options: [{ option_id: "OTHER", char_limit: 5 }] } }, capsResponse: caps, text: "123456" });
  assert.equal(result.allowed, false);
  assert.equal(result.reason, "MESSAGE_TOO_LONG");
});

test("bloqueia quando OTHER não está disponível", () => {
  const result = evaluatePolicy({ guideResponse: { ok: true, data: { options: [{ option_id: "REQUEST_BILLING_INFO" }] } }, capsResponse: caps, text: "Olá" });
  assert.equal(result.reason, "OTHER_NOT_AVAILABLE");
});
