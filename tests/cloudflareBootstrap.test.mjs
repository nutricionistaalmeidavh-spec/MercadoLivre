import assert from "node:assert/strict";
import fs from "node:fs";
import test from "node:test";

const wrangler = fs.readFileSync("cloudflare/wrangler.jsonc", "utf8");
const worker = fs.readFileSync("cloudflare/src/index.mjs", "utf8");
const admin = fs.readFileSync("admin-cloudflare.html", "utf8");
const callback = fs.readFileSync("mercadolivre/callback/index.html", "utf8");
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
