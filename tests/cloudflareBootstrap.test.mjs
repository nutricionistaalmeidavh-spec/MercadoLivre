import assert from "node:assert/strict";
import fs from "node:fs";
import test from "node:test";

const wrangler = fs.readFileSync("cloudflare/wrangler.jsonc", "utf8");
const worker = fs.readFileSync("cloudflare/src/index.mjs", "utf8");
const admin = fs.readFileSync("admin-cloudflare.html", "utf8");
const callback = fs.readFileSync("mercadolivre/callback/index.html", "utf8");
const messageRules = fs.readFileSync("cloudflare/src/message-rules.mjs", "utf8");
const design = fs.readFileSync("DESIGN.md", "utf8");
const ux = fs.readFileSync("UX-CONTRACT.md", "utf8");
const pkg = fs.readFileSync("package.json", "utf8");

test("Cloudflare remains dry-run by default and uses D1", () => {
  assert.match(wrangler, /"ML_AUTOMATION_MODE"\s*:\s*"dry-run"/);
  assert.match(wrangler, /"binding"\s*:\s*"DB"/);
});

test("active Cloudflare runtime has no Vercel migration dependency", () => {
  assert.doesNotMatch(worker, /migration\/import-token|recordMigration/);
  assert.doesNotMatch(admin, /vercel/i);
  assert.doesNotMatch(pkg, /migrate-all-to-cloudflare|configure-cloudflare-secrets|cloudflare:migrate/);
  assert.match(worker, /Worker Secret no Cloudflare/);
});

test("admin consumes response body only once", () => {
  assert.match(admin, /const raw=await response\.text\(\)/);
  assert.doesNotMatch(admin, /await response\.json\(\)/);
});

test("OAuth callback exposes safe provider error details for diagnosis", () => {
  assert.match(callback, /d\.details/);
  assert.match(callback, /detail\.error_description/);
  assert.match(callback, /detail\.message/);
  assert.match(callback, /HTTP '\+r\.status/);
  assert.doesNotMatch(callback, /client_secret|access_token|refresh_token/i);
});

test("message rules endpoint is admin-only in Worker routing", () => {
  assert.match(worker, /url\.pathname === "\/api\/message-rules"/);
  assert.match(worker, /requireAdmin\(request, env\)/);
});

test("mobile dashboard exposes canonical navigation and listing detail tabs", () => {
  for (const view of ["inicio", "anuncios", "pedidos", "promocoes", "mais"]) {
    assert.match(admin, new RegExp(`data-view="${view}"`));
  }
  for (const tab of ["resumo", "pos-venda", "comercial", "promocoes"]) {
    assert.match(admin, new RegExp(`data-tab="${tab}"`));
  }
  assert.match(admin, /class="bottom-nav"/);
  assert.match(admin, /aria-label="Navegação principal"/);
  assert.match(admin, /id="listingSearch"/);
  assert.match(admin, /id="clearSearch"/);
});

test("listing API exposes summary fields needed by the mobile detail view", () => {
  for (const field of ["body.price", "body.available_quantity", "body.sold_quantity", "body.listing_type_id", "body.category_id"]) {
    assert.match(messageRules, new RegExp(field.replace(".", "\\.")));
  }
});

test("dashboard keeps post-sale disabled by default and edits rule only per item", () => {
  assert.match(admin, /saveCurrentRule/);
  assert.match(admin, /item_id:item\.item_id/);
  assert.doesNotMatch(admin, /ML_AFTER_SALE_MESSAGE/);
  assert.match(admin, /DRY-RUN/);
});

test("inline admin script parses as JavaScript", () => {
  const scripts = [...admin.matchAll(/<script>([\s\S]*?)<\/script>/g)].map((match) => match[1]);
  assert.ok(scripts.length > 0);
  for (const script of scripts) assert.doesNotThrow(() => new Function(script));
});

test("design context is maintained for the multi-screen admin", () => {
  assert.match(design, /ArtiSys Mercado Livre Design System/);
  assert.match(design, /Mobile-first/);
  assert.match(ux, /## Navigation and responsive behavior/);
  assert.match(ux, /WCAG 2\.2 AA/);
});
