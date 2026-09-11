const test = require("node:test");
const assert = require("node:assert/strict");
const { normalizeOrder } = require("../src/modules/mercado-livre/orders/orderService");

test("normaliza pedido e detecta pagamento aprovado", () => {
  const order = normalizeOrder({
    id: 1001,
    pack_id: 2002,
    status: "paid",
    seller: { id: 3003 },
    buyer: { id: 4004 },
    tags: [],
    payments: [{ status: "approved" }],
    order_items: [{ item: { id: "MLB123" } }],
    date_created: "2026-09-10T20:00:00Z"
  });
  assert.equal(order.orderId, "1001");
  assert.equal(order.packId, "2002");
  assert.equal(order.sellerId, "3003");
  assert.equal(order.paymentStatus, "approved");
  assert.deepEqual(order.itemIds, ["MLB123"]);
});

test("normaliza tag de risco de fraude", () => {
  const order = normalizeOrder({ id: 1, seller: { id: 2 }, tags: ["fraud_risk_detected"], payments: [{ status: "approved" }] });
  assert.equal(order.fraudRisk, true);
});
