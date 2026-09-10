const DEFAULT_AFTER_SALE_MESSAGE = "Olá! Recebemos seu pedido e já estamos acompanhando por aqui. Obrigado pela compra. Se precisar falar sobre este pedido, pode usar este chat.";

function getAfterSaleMessage() {
  return String(process.env.ML_AFTER_SALE_MESSAGE || DEFAULT_AFTER_SALE_MESSAGE).trim();
}

module.exports = { DEFAULT_AFTER_SALE_MESSAGE, getAfterSaleMessage };
