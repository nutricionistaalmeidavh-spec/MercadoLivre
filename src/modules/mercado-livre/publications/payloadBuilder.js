function buildPayload(product, categoryId, attributes, request) {
  const origin = `${(request.headers["x-forwarded-proto"] || "https").split(",")[0]}://${request.headers.host}`;
  return {
    family_name: product.product_name || product.title,
    category_id: categoryId,
    price: Number(product.price),
    currency_id: product.currency_id || "BRL",
    available_quantity: Number(product.available_quantity || 999),
    buying_mode: product.buying_mode || "buy_it_now",
    listing_type_id: product.listing_type_id || "gold_special",
    condition: product.condition || "new",
    shipping: { mode: "not_specified", local_pick_up: false, free_shipping: false, methods: [], costs: [] },
    attributes: Array.isArray(attributes) ? attributes : [],
    pictures: (product.images || []).map(path => ({ source: origin + path }))
  };
}

module.exports = { buildPayload };
