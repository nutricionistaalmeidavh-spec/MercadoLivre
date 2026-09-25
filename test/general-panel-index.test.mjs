import test from "node:test";
import assert from "node:assert/strict";
import worker from "../cloudflare/src/general-panel-index.mjs";

test("general panel worker exposes fetch and scheduled handlers", () => {
  assert.equal(typeof worker.fetch, "function");
  assert.equal(typeof worker.scheduled, "function");
});
