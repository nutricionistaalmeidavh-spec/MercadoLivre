import assert from "node:assert/strict";
import fs from "node:fs";
import test from "node:test";

const worker = fs.readFileSync("cloudflare/src/index.mjs", "utf8");
const wrangler = fs.readFileSync("cloudflare/wrangler.jsonc", "utf8");
const operations = fs.readFileSync("admin-operations.js", "utf8");

test("orders and promotions bundle is inlined into admin and cannot stay on placeholders", () => {
  assert.match(operations, /function bind\(\)/);
  assert.match(operations, /\bbind\(\);/);
  assert.match(worker, /ADMIN_OPERATIONS_VERSION = "1\.6\.2"/);
  assert.match(worker, /data-artisys-operations-build/);
  assert.match(worker, /operationsAsset\.text\(\)/);
  assert.match(worker, /Fluxo preparado", "Pedidos/);
  assert.match(worker, /Área reservada", "Promoções/);
  assert.match(worker, /cache-control", "no-store, max-age=0"/);
  assert.match(wrangler, /"\/admin-operations\.js"/);
});

test("dashboard copy distinguishes manual replies from automatic rules", () => {
  assert.match(worker, /replaceAll\("Sem resposta", "Sem automação"\)/);
  assert.match(worker, /anúncios sem regra automática/);
});
