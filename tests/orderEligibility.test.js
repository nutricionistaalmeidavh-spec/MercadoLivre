const test = require("node:test");
const assert = require("node:assert/strict");
const { checkEligibility } = require("../src/modules/mercado-livre/orders/orderEligibility");

function validOrder(overrides = {}) {
  return { packId: "10", sellerId: "20", paymentStatus: "approved", cancelled: false, fraudRisk: false, ...overrides };
}

test("permite pedido pago e válido", () => {
  assert.deepEqual(checkEligibility(validOrder()), { eligible: true, reason: "ELIGIBLE" });
});

test("bloqueia pedido cancelado", () => {
  assert.equal(checkEligibility(validOrder({ cancelled: true })).reason, "ORDER_CANCELLED");
});

test("bloqueia risco de fraude mesmo com pagamento aprovado", () => {
  assert.equal(checkEligibility(validOrder({ fraudRisk: true })).reason, "FRAUD_RISK_DETECTED");
});

test("bloqueia pagamento ainda não aprovado", () => {
  assert.equal(checkEligibility(validOrder({ paymentStatus: "pending" })).reason, "PAYMENT_NOT_APPROVED");
});
