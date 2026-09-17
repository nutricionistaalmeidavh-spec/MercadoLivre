import test from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";
import * as automation from "../cloudflare/src/automation.mjs";
import * as messageRules from "../cloudflare/src/message-rules.mjs";

test("P3 accepts only direct https product links and rejects known shorteners", () => {
  assert.equal(typeof messageRules.validateProductLink, "function");

  assert.deepEqual(
    messageRules.validateProductLink("https://drive.google.com/drive/folders/abc"),
    { ok: true, url: "https://drive.google.com/drive/folders/abc" }
  );

  assert.equal(messageRules.validateProductLink("http://example.com/produto").ok, false);
  assert.equal(messageRules.validateProductLink("https://bit.ly/produto").reason, "PRODUCT_LINK_SHORTENER_NOT_ALLOWED");
  assert.equal(messageRules.validateProductLink("https://tinyurl.com/produto").reason, "PRODUCT_LINK_SHORTENER_NOT_ALLOWED");
});

test("P3 refuses an enabled template that needs a missing product link", () => {
  const result = automation.buildMessageFromRules(
    { orderId: "10", itemIds: ["MLB1"], buyerNickname: "CLIENTE" },
    [{ item_id: "MLB1", item_title: "Produto A", message: "Acesse {{link_produto}}", product_link: "", enabled: true }]
  );
  assert.equal(result.ok, false);
  assert.equal(result.reason, "MISSING_PRODUCT_LINK:MLB1");
});

test("P5 refuses unknown unresolved template variables before policy lookup", () => {
  const result = automation.buildMessageFromRules(
    { orderId: "11", itemIds: ["MLB1"], buyerNickname: "CLIENTE" },
    [{ item_id: "MLB1", item_title: "Produto A", message: "Olá {{cliente}} {{cupom}}", product_link: "", enabled: true }]
  );
  assert.equal(result.ok, false);
  assert.equal(result.reason, "UNRESOLVED_TEMPLATE_VARIABLES:cupom");
});

test("P5 validates final resolved message length before calling Mercado Livre policy", () => {
  const result = automation.buildMessageFromRules(
    { orderId: "12", itemIds: ["MLB1"], buyerNickname: "CLIENTE" },
    [{ item_id: "MLB1", item_title: "Produto A", message: "x".repeat(2001), product_link: "", enabled: true }]
  );
  assert.equal(result.ok, false);
  assert.equal(result.reason, "FINAL_MESSAGE_TOO_LONG");
});

test("P4 admin editor contains a live resolved-message preview", () => {
  const ui = fs.readFileSync("admin-post-sale-templates.js", "utf8");
  assert.match(ui, /Prévia da mensagem/i);
  assert.match(ui, /renderPreview/);
  assert.match(ui, /João/);
  assert.match(ui, /123456789/);
  assert.match(ui, /detailProductLink.*addEventListener\(['\"]input['\"]/s);
  assert.match(ui, /detailMessage.*addEventListener\(['\"]input['\"]/s);
});

test("P6 message attempts persist delivery context and moderation status", () => {
  assert.equal(fs.existsSync("cloudflare/migrations/0004_message_attempt_context.sql"), true);
  const migration = fs.readFileSync("cloudflare/migrations/0004_message_attempt_context.sql", "utf8");
  const repository = fs.readFileSync("cloudflare/src/repository.mjs", "utf8");
  const ml = fs.readFileSync("cloudflare/src/mercadolivre.mjs", "utf8");
  assert.match(migration, /context_json/i);
  assert.match(migration, /moderation_status/i);
  assert.match(repository, /context_json/i);
  assert.match(repository, /moderation_status/i);
  assert.match(ml, /deliveryContext/);
});

test("P6 explicit non-retryable moderation wins even when HTTP status is 5xx", () => {
  assert.equal(typeof automation.isRetryableProcessingError, "function");
  assert.equal(automation.isRetryableProcessingError({ statusCode: 500, retryable: false }), false);
  assert.equal(automation.isRetryableProcessingError({ statusCode: 500 }), true);
  assert.equal(automation.isRetryableProcessingError({ statusCode: 429 }), true);
});
