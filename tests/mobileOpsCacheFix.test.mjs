import assert from "node:assert/strict";
import fs from "node:fs";
import test from "node:test";

const worker = fs.readFileSync("cloudflare/src/index.mjs", "utf8");
const wrangler = fs.readFileSync("cloudflare/wrangler.jsonc", "utf8");
const operations = fs.readFileSync("admin-operations.js", "utf8");
const assetsIgnore = fs.readFileSync(".assetsignore", "utf8");

test("orders and promotions bundle is inlined into admin and cannot stay on placeholders", () => {
  assert.match(operations, /function bind\(\)/);
  assert.match(operations, /\bbind\(\);/);
  assert.match(worker, /ADMIN_OPERATIONS_VERSION = "1\.6\.2"/);
  assert.match(worker, /data-artisys-operations-build/);
  assert.match(worker, /operationsAsset\.text\(\)/);
  assert.match(worker, /Fluxo preparado", "Pedidos/);
  assert.match(worker, /Área reservada", "Promoções/);
  assert.match(worker, /cache-control", "no-store, max-age=0"/);
  assert.match(wrangler, /"run_worker_first"\s*:\s*true/);
});

test("/admin cannot collide with a static admin.html asset", () => {
  assert.doesNotMatch(assetsIgnore, /^!admin\.html$/m);
  assert.match(assetsIgnore, /^!publisher\.html$/m);
  assert.match(wrangler, /"html_handling"\s*:\s*"none"/);
  assert.match(worker, /\/publisher\.html/);
});

test("dashboard copy distinguishes manual replies from automatic rules", () => {
  assert.match(worker, /replaceAll\("Sem resposta", "Sem automação"\)/);
  assert.match(worker, /anúncios sem regra automática/);
});
