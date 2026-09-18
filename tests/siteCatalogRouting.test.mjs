import assert from "node:assert/strict";
import fs from "node:fs";
import test from "node:test";

const wrapper = fs.readFileSync("cloudflare/src/site-catalog-index.mjs", "utf8");
const wrangler = fs.readFileSync("cloudflare/wrangler.jsonc", "utf8");
const migration = fs.readFileSync("cloudflare/migrations/0006_site_catalog_decisions.sql", "utf8");
const assetsIgnore = fs.readFileSync(".assetsignore", "utf8");
const adminPage = fs.readFileSync("admin-site-catalog.html", "utf8");
const adminScript = fs.readFileSync("admin-site-catalog.js", "utf8");

test("site catalog wrapper becomes Cloudflare entrypoint and keeps existing worker delegated", () => {
  assert.match(wrangler, /"main"\s*:\s*"\.\/src\/site-catalog-index\.mjs"/);
  assert.match(wrapper, /import baseWorker from "\.\/index\.mjs"/);
  assert.match(wrapper, /return baseWorker\.fetch\(request, env, ctx\)/);
  assert.match(wrapper, /baseWorker\.scheduled/);
});

test("public feed is separate from admin mutation surface", () => {
  assert.match(wrapper, /\/api\/site-catalog\/feed/);
  assert.match(wrapper, /\/api\/site-catalog\/admin/);
  assert.match(wrapper, /requireAdmin/);
  assert.match(wrapper, /access-control-allow-origin/i);
  assert.match(wrapper, /handleSiteCatalogFeedApi/);
  assert.match(wrapper, /handleSiteCatalogAdminApi/);
});

test("approval state is persisted in dedicated D1 table", () => {
  assert.match(migration, /CREATE TABLE IF NOT EXISTS site_catalog_decisions/i);
  assert.match(migration, /PRIMARY KEY \(seller_id, item_id\)/i);
  assert.match(migration, /approved INTEGER NOT NULL DEFAULT 0/i);
  assert.match(migration, /site_visibility TEXT NOT NULL DEFAULT 'hidden'/i);
});

test("admin assets expose explicit approval controls and are shipped by Cloudflare assets", () => {
  assert.match(assetsIgnore, /!admin-site-catalog\.html/);
  assert.match(assetsIgnore, /!admin-site-catalog\.js/);
  assert.match(adminPage, /Aprovação do catálogo/i);
  assert.match(adminScript, /Aprovado para o site/);
  assert.match(adminScript, /Ocultar do site/);
  assert.match(adminScript, /Página individual/);
  assert.match(adminScript, /Página de coleção/);
  assert.match(adminScript, /Produto digital/);
});
