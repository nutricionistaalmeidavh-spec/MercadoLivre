import assert from "node:assert/strict";
import fs from "node:fs";
import test from "node:test";

const worker = fs.readFileSync("cloudflare/src/index.mjs", "utf8");
const operations = fs.readFileSync("cloudflare/src/operations.mjs", "utf8");
const page = fs.readFileSync("admin-system.html", "utf8");
const assets = fs.readFileSync(".assetsignore", "utf8");

test("system console is published and protected by admin session", () => {
  assert.match(assets, /!admin-system\.html/);
  assert.match(worker, /url\.pathname === "\/system"/);
  assert.match(worker, /url\.pathname === "\/api\/operations"/);
  assert.match(worker, /async function handleOperations[\s\S]*requireAdmin\(request, env\)/);
  assert.match(worker, /async function serveSystem[\s\S]*requireAdmin\(request, env\)/);
});

test("operations snapshot exposes configuration status without secret values", () => {
  for (const key of ["ml_client_secret", "token_encryption_key", "admin_password", "admin_session_secret"]) {
    assert.match(operations, new RegExp(`${key}: Boolean\\(env\\.`));
  }
  assert.doesNotMatch(operations, /encrypted_payload|access_token|refresh_token|SELECT[\s\S]*payload\s+FROM/i);
  assert.match(operations, /webhook_events/);
  assert.match(operations, /automation_runs/);
  assert.match(operations, /message_attempts/);
});

test("system console includes health, configuration, queue and activity views", () => {
  for (const text of ["Saúde", "Configuração", "Fila", "Atividade recente", "Webhooks", "Automações", "Mensagens"]) {
    assert.match(page, new RegExp(text));
  }
  assert.match(page, /\/api\/operations\?limit=25/);
  assert.match(page, /\/publisher/);
  assert.match(page, /\/api\/oauth\?op=start/);
  assert.doesNotMatch(page, /client_secret\s*[:=]\s*["'][^"']+["']/i);
});

test("system console inline script parses as JavaScript", () => {
  const scripts = [...page.matchAll(/<script>([\s\S]*?)<\/script>/g)].map((m) => m[1]);
  assert.ok(scripts.length > 0);
  for (const script of scripts) assert.doesNotThrow(() => new Function(script));
});
