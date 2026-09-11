const test = require("node:test");
const assert = require("node:assert/strict");
const { backoffMs } = require("../src/modules/mercado-livre/jobs/worker");

test("retry usa backoff exponencial com teto", () => {
  assert.equal(backoffMs(1), 5000);
  assert.equal(backoffMs(2), 10000);
  assert.equal(backoffMs(3), 20000);
  assert.equal(backoffMs(20), 15 * 60_000);
});
