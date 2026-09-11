const test = require("node:test");
const assert = require("node:assert/strict");
const { DEFAULT_AFTER_SALE_MESSAGE, getAfterSaleMessage } = require("../src/modules/mercado-livre/messages/templates");

test("template padrão cabe no limite de 350 caracteres", () => {
  assert.ok(DEFAULT_AFTER_SALE_MESSAGE.length <= 350);
});

test("template pode ser configurado por ambiente", () => {
  const old = process.env.ML_AFTER_SALE_MESSAGE;
  process.env.ML_AFTER_SALE_MESSAGE = "Mensagem customizada";
  assert.equal(getAfterSaleMessage(), "Mensagem customizada");
  if (old == null) delete process.env.ML_AFTER_SALE_MESSAGE;
  else process.env.ML_AFTER_SALE_MESSAGE = old;
});
