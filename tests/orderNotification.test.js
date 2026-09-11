const test = require("node:test");
const assert = require("node:assert/strict");
const { orderIdFromResource } = require("../src/modules/mercado-livre/notifications/ordersHandler");

test("extrai order id de resource orders_v2", () => {
  assert.equal(orderIdFromResource("/orders/2195160686"), "2195160686");
});

test("recusa resource que não é pedido", () => {
  assert.equal(orderIdFromResource("/messages/123"), null);
});
