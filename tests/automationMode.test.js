const test = require("node:test");
const assert = require("node:assert/strict");
const { DEFAULT_AFTER_SALE_MESSAGE } = require("../src/modules/mercado-livre/messages/templates");

test("mensagem padrão não é promocional e cabe no limite conhecido", () => {
  assert.ok(DEFAULT_AFTER_SALE_MESSAGE.length > 0);
  assert.ok(DEFAULT_AFTER_SALE_MESSAGE.length <= 350);
  assert.equal(/https?:\/\//i.test(DEFAULT_AFTER_SALE_MESSAGE), false);
});
