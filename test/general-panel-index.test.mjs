import test from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";
import worker from "../cloudflare/src/general-panel-index.mjs";

test("general panel worker exposes fetch and scheduled handlers", () => {
  assert.equal(typeof worker.fetch, "function");
  assert.equal(typeof worker.scheduled, "function");
});

test("license center page is included in Cloudflare static assets", () => {
  const assetsIgnore = fs.readFileSync(".assetsignore", "utf8");
  assert.match(assetsIgnore, /!license-center\.html/);
});
