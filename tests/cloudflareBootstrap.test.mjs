import assert from "node:assert/strict";
import fs from "node:fs";
import test from "node:test";

const ps = fs.readFileSync("scripts/migrate-all-to-cloudflare.ps1", "utf8");
const helper = fs.readFileSync("scripts/configure-cloudflare-secrets.mjs", "utf8");
const wrangler = fs.readFileSync("cloudflare/wrangler.jsonc", "utf8");

test("bootstrap mantém Cloudflare em dry-run e usa D1", () => {
  assert.match(wrangler, /"ML_AUTOMATION_MODE"\s*:\s*"dry-run"/);
  assert.match(wrangler, /"binding"\s*:\s*"DB"/);
});

test("bootstrap lê secrets existentes via Vercel env run sem arquivo local", () => {
  assert.match(ps, /vercel@latest env run -e production/);
  assert.doesNotMatch(ps, /env pull/);
  assert.match(helper, /process\.env\.ML_CLIENT_SECRET/);
  assert.match(helper, /process\.env\.ADMIN_PASSWORD/);
});

test("bootstrap exige auditoria SUCCESS antes do cleanup", () => {
  const successCheck = ps.indexOf("$auditRaw -notmatch 'SUCCESS'");
  const cleanup = ps.indexOf("ML_MIGRATION_SECRET\":null");
  assert.ok(successCheck >= 0, "deve validar SUCCESS");
  assert.ok(cleanup > successCheck, "cleanup deve ocorrer somente após SUCCESS");
});

test("helper não imprime valores de secrets", () => {
  assert.doesNotMatch(helper, /console\.log\([^\n]*(ML_CLIENT_SECRET|ADMIN_PASSWORD|migrationSecret|TOKEN_ENCRYPTION_KEY)/);
  assert.match(helper, /secret", "bulk"/);
});
