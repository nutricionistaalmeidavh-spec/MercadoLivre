import test from "node:test";
import assert from "node:assert/strict";
import { buildMessageFromRules, greetingForDate, resolveBuyerDisplayName } from "../cloudflare/src/automation.mjs";
import { normalizeOrder } from "../cloudflare/src/mercadolivre.mjs";

test("normalizes buyer identity for post-sale personalization", () => {
  const order = normalizeOrder({
    id: 123,
    pack_id: 999,
    status: "paid",
    seller: { id: 10 },
    buyer: { id: 20, first_name: "  João   Pedro ", nickname: "JOAO-ML" },
    payments: [{ status: "approved" }],
    order_items: [{ item: { id: "MLB1" } }]
  });
  assert.equal(order.buyerFirstName, "João Pedro");
  assert.equal(order.buyerNickname, "JOAO-ML");
  assert.equal(resolveBuyerDisplayName(order), "João");
});

test("buyer name falls back to nickname and then cliente", () => {
  assert.equal(resolveBuyerDisplayName({ buyerFirstName: "", buyerNickname: "CLIENTE_99" }), "CLIENTE_99");
  assert.equal(resolveBuyerDisplayName({ buyerFirstName: "", buyerNickname: "" }), "cliente");
});

test("greeting uses America/Sao_Paulo time bands", () => {
  assert.equal(greetingForDate(new Date("2026-09-16T13:00:00Z")), "bom dia");
  assert.equal(greetingForDate(new Date("2026-09-16T18:00:00Z")), "boa tarde");
  assert.equal(greetingForDate(new Date("2026-09-17T01:00:00Z")), "boa noite");
});

test("single listing resolves supported template variables from its own rule", () => {
  const order = {
    orderId: "123456",
    itemIds: ["MLB1"],
    buyerFirstName: "Maria Clara",
    buyerNickname: "MARIA-ML"
  };
  const result = buildMessageFromRules(order, [
    {
      item_id: "MLB1",
      item_title: "ArtiSys PDV",
      message: "Olá, {{saudacao}}, {{cliente}}. Produto: {{produto}}. Pedido: {{pedido}}. Acesso: {{link_produto}}",
      product_link: "https://example.com/produto",
      enabled: true
    }
  ], { now: new Date("2026-09-16T18:00:00Z") });
  assert.deepEqual(result, {
    ok: true,
    text: "Olá, boa tarde, Maria. Produto: ArtiSys PDV. Pedido: 123456. Acesso: https://example.com/produto"
  });
});

test("each listing resolves its own product and delivery link without global fallback", () => {
  const order = { orderId: "7", itemIds: ["MLB1", "MLB2"], buyerNickname: "COMPRADOR" };
  const result = buildMessageFromRules(order, [
    { item_id: "MLB1", item_title: "Produto A", message: "{{produto}} => {{link_produto}}", product_link: "https://a.example", enabled: true },
    { item_id: "MLB2", item_title: "Produto B", message: "{{produto}} => {{link_produto}}", product_link: "https://b.example", enabled: true }
  ], { now: new Date("2026-09-16T13:00:00Z") });
  assert.equal(result.ok, true);
  assert.match(result.text, /Produto A:\nProduto A => https:\/\/a\.example/);
  assert.match(result.text, /Produto B:\nProduto B => https:\/\/b\.example/);
  assert.doesNotMatch(result.text, /Produto B:\nProduto B => https:\/\/a\.example/);
});
