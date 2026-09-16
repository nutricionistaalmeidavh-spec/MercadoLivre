import assert from "node:assert/strict";
import fs from "node:fs";
import test from "node:test";

const worker = fs.readFileSync("cloudflare/src/index.mjs", "utf8");
const wrangler = fs.readFileSync("cloudflare/wrangler.jsonc", "utf8");
const operations = fs.readFileSync("admin-operations.js", "utf8");

test("orders and promotions bundle is executed and cache-busted", () => {
  assert.match(operations, /function bind\(\)/);
  assert.match(operations, /\bbind\(\);/);
  assert.match(worker, /ADMIN_OPERATIONS_VERSION = "1\.6\.1"/);
  assert.match(worker, /admin-operations\.js\?v=\$\{ADMIN_OPERATIONS_VERSION\}/);
  assert.match(worker, /cache-control", "no-store, max-age=0"/);
  assert.match(wrangler, /"\/admin-operations\.js"/);
});

test("dashboard copy distinguishes manual replies from automatic rules", () => {
  assert.match(worker, /replaceAll\("Sem resposta", "Sem automação"\)/);
  assert.match(worker, /anúncios sem regra automática/);
});
