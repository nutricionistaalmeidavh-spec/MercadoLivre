import assert from "node:assert/strict";
import fs from "node:fs";
import test from "node:test";

const wrapper = fs.readFileSync("cloudflare/src/site-catalog-index.mjs", "utf8");
const catalogSource = fs.readFileSync("cloudflare/src/site-catalog.mjs", "utf8");
const wrangler = fs.readFileSync("cloudflare/wrangler.jsonc", "utf8");
const migration = fs.readFileSync("cloudflare/migrations/0006_site_catalog_decisions.sql", "utf8");
const repository = fs.readFileSync("cloudflare/src/site-catalog-repository.mjs", "utf8");
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

test("bloco A persiste capa e oferece busca filtros ordenação e coleções editoriais", () => {
  const migrationV7Path = "cloudflare/migrations/0007_site_catalog_cover.sql";
  assert.equal(fs.existsSync(migrationV7Path), true, "migration 0007 precisa existir");
  const migrationV7 = fs.readFileSync(migrationV7Path, "utf8");
  assert.match(migrationV7, /hero_picture_url\s+TEXT/i);
  assert.match(repository, /hero_picture_url/);
  assert.match(adminPage, /id="catalog-search"/);
  assert.match(adminPage, /id="catalog-filter"/);
  assert.match(adminPage, /id="catalog-sort"/);
  assert.match(adminScript, /Negócios/);
  assert.match(adminScript, /Saúde/);
  assert.match(adminScript, /Aguardando coleção/);
  assert.match(adminScript, /hero_picture_url/);
  assert.match(adminScript, /Escolher como capa|Capa escolhida/);
});

test("anúncio novo fica pendente até existir decisão editorial explícita", () => {
  assert.match(catalogSource, /configured:\s*Boolean\(stored\)/);
  assert.match(adminScript, /configured\s*!==\s*false/);
  assert.match(adminScript, /if\s*\(!configured\)\s*return\s*\{\s*key:\s*['"]pending['"]/);
});

test("A.1 cria grupos canônicos com vínculo único por anúncio e CRUD seller-scoped", () => {
  const migrationV8Path = "cloudflare/migrations/0008_site_catalog_groups.sql";
  assert.equal(fs.existsSync(migrationV8Path), true, "migration 0008 precisa existir");
  const migrationV8 = fs.readFileSync(migrationV8Path, "utf8");
  assert.match(migrationV8, /CREATE TABLE IF NOT EXISTS site_catalog_groups/i);
  assert.match(migrationV8, /CREATE TABLE IF NOT EXISTS site_catalog_group_items/i);
  assert.match(migrationV8, /PRIMARY KEY\s*\(seller_id,\s*item_id\)/i);
  assert.match(repository, /listSiteCatalogGroups/);
  assert.match(repository, /replaceSiteCatalogGroupItems/);
  assert.match(repository, /deleteSiteCatalogGroup/);
  assert.match(catalogSource, /create_group/);
  assert.match(catalogSource, /save_group/);
  assert.match(catalogSource, /delete_group/);
});

test("A.1 painel é compacto, recolhível e permite agrupamento manual", () => {
  assert.match(adminPage, /Agrupar selecionados/i);
  assert.match(adminPage, /Agrupados/i);
  assert.match(adminPage, /Não agrupados/i);
  assert.match(adminScript, /group_id/);
  assert.match(adminScript, /groupSelectedButton/);
  assert.match(adminScript, /Anúncio principal/i);
  assert.match(adminScript, /Desagrupar produto/i);
  assert.match(adminScript, /Possível duplicidade/i);
  assert.match(adminScript, /createElement\(['"]details['"]\)/i);
});

test("A.1 desagrupamento falha fechado e remove aprovação individual antiga", () => {
  assert.match(repository, /UPDATE site_catalog_decisions[\s\S]*SET approved=0/);
  assert.match(repository, /removedIds/);
});
