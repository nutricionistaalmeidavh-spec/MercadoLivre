import test from "node:test";
import assert from "node:assert/strict";
import { buildMessageFromRules } from "../cloudflare/src/automation.mjs";
import { normalizeOrder, evaluateOrderEligibility } from "../cloudflare/src/mercadolivre.mjs";

test("order normalization exposes unique sold item ids", () => {
  const order = normalizeOrder({
    id: 123,
    pack_id: 999,
    status: "paid",
    seller: { id: 10 },
    buyer: { id: 20 },
    payments: [{ status: "approved" }],
    order_items: [
      { item: { id: "MLB1" } },
      { item: { id: "MLB1" } },
      { item: { id: "MLB2" } }
    ]
  });
  assert.deepEqual(order.itemIds, ["MLB1", "MLB2"]);
  assert.equal(evaluateOrderEligibility(order).eligible, true);
});

test("automation refuses orders when any sold listing has no enabled rule", () => {
  const order = { itemIds: ["MLB1", "MLB2"] };
  const result = buildMessageFromRules(order, [
    { item_id: "MLB1", message: "Mensagem A", enabled: true }
  ]);
  assert.equal(result.ok, false);
  assert.match(result.reason, /MLB2/);
});

test("automation refuses disabled rules", () => {
  const result = buildMessageFromRules({ itemIds: ["MLB1"] }, [
    { item_id: "MLB1", message: "Mensagem A", enabled: false }
  ]);
  assert.equal(result.ok, false);
});

test("single listing uses exactly its configured message", () => {
  const result = buildMessageFromRules({ itemIds: ["MLB1"] }, [
    { item_id: "MLB1", item_title: "Produto A", message: "Instrução A", enabled: true }
  ]);
  assert.deepEqual(result, { ok: true, text: "Instrução A" });
});

test("multiple listings combine distinct configured messages with titles", () => {
  const result = buildMessageFromRules({ itemIds: ["MLB1", "MLB2"] }, [
    { item_id: "MLB1", item_title: "Produto A", message: "Instrução A", enabled: true },
    { item_id: "MLB2", item_title: "Produto B", message: "Instrução B", enabled: true }
  ]);
  assert.equal(result.ok, true);
  assert.match(result.text, /Produto A:\nInstrução A/);
  assert.match(result.text, /Produto B:\nInstrução B/);
});
