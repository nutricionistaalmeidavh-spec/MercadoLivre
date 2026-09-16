import assert from "node:assert/strict";
import fs from "node:fs";
import test from "node:test";

const wrangler = fs.readFileSync("cloudflare/wrangler.jsonc", "utf8");

test("admin shell always passes through Worker before static assets", () => {
  assert.match(wrangler, /"run_worker_first"\s*:\s*true/);
});
