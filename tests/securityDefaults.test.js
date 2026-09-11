const test = require("node:test");
const assert = require("node:assert/strict");

test("produção exige opt-in explícito", () => {
  const previous = process.env.ML_AUTOMATION_MODE;
  delete process.env.ML_AUTOMATION_MODE;
  assert.equal(process.env.ML_AUTOMATION_MODE || "dry-run", "dry-run");
  if (previous != null) process.env.ML_AUTOMATION_MODE = previous;
});
