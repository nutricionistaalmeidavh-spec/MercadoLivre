import test from "node:test";
import assert from "node:assert/strict";
import { fetchLicenseCenterSnapshot, handleLicenseCenterApi } from "../cloudflare/src/license-center.mjs";

test("read-only proxy sends only GET to Obra service binding with server-side secret", async () => {
  let captured;
  const env = {
    OBRA_LICENSE_CENTER_READ_SECRET: "read-secret",
    OBRA_LICENSING: {
      async fetch(request) {
        captured = request;
        return new Response(JSON.stringify({ obra: { companies: [] } }), { status: 200, headers: { "content-type": "application/json" } });
      }
    }
  };

  const payload = await fetchLicenseCenterSnapshot(env);
  assert.deepEqual(payload, { obra: { companies: [] } });
  assert.equal(captured.method, "GET");
  assert.equal(new URL(captured.url).pathname, "/api/internal/license-center/snapshot");
  assert.equal(captured.headers.get("x-artisys-license-center-secret"), "read-secret");
});

test("API rejects mutation methods before contacting licensing authority", async () => {
  let calls = 0;
  const env = {
    OBRA_LICENSE_CENTER_READ_SECRET: "read-secret",
    OBRA_LICENSING: { async fetch() { calls += 1; return new Response("{}"); } }
  };
  const response = await handleLicenseCenterApi(new Request("https://panel.test/api/license-center", { method: "POST" }), env);
  assert.equal(response.status, 405);
  assert.equal(calls, 0);
});
