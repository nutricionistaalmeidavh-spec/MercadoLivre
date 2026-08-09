const L = require("./_lib");
const catalog = require("../catalog.json");
const { buildPayload } = require("../src/modules/mercado-livre/publications/payloadBuilder");
const { uploadProductPictures } = require("../src/modules/mercado-livre/pictures/pictureService");
const { publish } = require("../src/modules/mercado-livre/publications/publicationService");

function item(sku) {
  const product = catalog.find(entry => entry.sku === sku);
  if (!product) throw new Error("SKU não encontrado.");
  return product;
}

function proposedMap(product) {
  const map = {};
  for (const [key, value] of Object.entries(product.attribute_values_by_name || {})) map[L.norm(key)] = value;
  return map;
}

function attrView(attribute, proposed) {
  const tags = attribute.tags || {};
  const names = [L.norm(attribute.name), L.norm(attribute.id)];
  const suggested = names.find(name => proposed[name] != null);
  return {
    id: attribute.id, name: attribute.name, value_type: attribute.value_type,
    required: !!(tags.required || tags.new_required), conditional_required: !!tags.conditional_required,
    suggested_value: suggested ? proposed[suggested] : "",
    values: (attribute.values || []).slice(0, 100).map(value => ({ id: value.id, name: value.name }))
  };
}

module.exports = async (req, res) => {
  try {
    if (!L.requireAdmin(req, res)) return;
    const url = new URL(req.url, "https://x");
    const op = url.searchParams.get("op");
    const tokenData = await L.getToken(req, res);
    const token = tokenData.access_token;

    if (op === "me") {
      const result = await L.mlFetch("/users/me", {}, token);
      return L.json(res, result.status, result.ok ? result.data : { error: "Falha ao consultar seller.", details: result.data });
    }
    if (op === "discover") {
      const product = item(url.searchParams.get("sku"));
      const query = new URLSearchParams({ q: product.title, limit: "3" });
      const result = await L.mlFetch("/sites/MLB/domain_discovery/search?" + query, {}, token);
      return L.json(res, result.status, result.ok ? result.data : { error: "Preditor falhou.", details: result.data });
    }
    if (op === "attributes") {
      const product = item(url.searchParams.get("sku"));
      const categoryId = url.searchParams.get("category_id");
      if (!categoryId) return L.json(res, 400, { error: "category_id obrigatório." });
      const result = await L.mlFetch(`/categories/${encodeURIComponent(categoryId)}/attributes`, {}, token);
      if (!result.ok) return L.json(res, result.status, { error: "Falha ao buscar atributos.", details: result.data });
      return L.json(res, 200, { attributes: result.data.map(attribute => attrView(attribute, proposedMap(product))) });
    }
    if (op === "validate" && req.method === "POST") {
      const body = await L.body(req); const product = item(body.sku);
      if (!body.category_id) return L.json(res, 400, { error: "category_id obrigatório." });
      const payload = buildPayload(product, body.category_id, body.attributes, req);
      const result = await L.mlFetch("/items/validate", {
        method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify(payload)
      }, token);
      return L.json(res, 200, { valid: result.ok, status: result.status, response: result.data, payload_preview: payload });
    }
    if (op === "publish" && req.method === "POST") {
      const body = await L.body(req); const product = item(body.sku);
      if (!body.category_id) return L.json(res, 400, { error: "category_id obrigatório." });
      const result = await publish({ product, categoryId: body.category_id, attributes: body.attributes, request: req, token, client: L.mlFetch });
      if (!result.ok) return L.json(res, result.status, { error: "Publicação recusada.", details: result.details, uploaded_picture_ids: result.pictureIds });
      return L.json(res, 200, {
        ok: true, item_id: result.itemId, permalink: result.response.permalink,
        status: result.itemStatus.status || result.response.status, sub_status: result.itemStatus.sub_status,
        picture_ids: result.pictureIds, pictures: result.response.pictures || [], description: result.description,
        response: result.response, item_status: result.itemStatus
      });
    }
    if (op === "item-status" && req.method === "GET") {
      const itemId = url.searchParams.get("item_id");
      if (!itemId) return L.json(res, 400, { error: "item_id obrigatório." });
      const result = await L.mlFetch(`/items/${encodeURIComponent(itemId)}`, {}, token);
      return L.json(res, result.status, result.ok ? result.data : { error: "Falha ao consultar anúncio.", details: result.data });
    }
    if (op === "update-pictures" && req.method === "POST") {
      const body = await L.body(req); const product = item(body.sku);
      if (!body.item_id) return L.json(res, 400, { error: "item_id obrigatório." });
      const pictureIds = await uploadProductPictures(product, req, token);
      const result = await L.mlFetch(`/items/${encodeURIComponent(body.item_id)}`, {
        method: "PUT", headers: { "content-type": "application/json" }, body: JSON.stringify({ pictures: pictureIds.map(id => ({ id })) })
      }, token);
      if (!result.ok) return L.json(res, result.status, { error: "Falha ao atualizar imagens do anúncio.", details: result.data, uploaded_picture_ids: pictureIds });
      return L.json(res, 200, { ok: true, item_id: body.item_id, picture_ids: pictureIds, pictures: result.data.pictures || [], response: result.data });
    }
    return L.json(res, 404, { error: "Operação inválida." });
  } catch (error) {
    return L.json(res, error.statusCode || 500, { error: error.message });
  }
};
