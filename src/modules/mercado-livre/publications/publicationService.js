const { buildPayload } = require("./payloadBuilder");
const { uploadProductPictures } = require("../pictures/pictureService");

async function publish({ product, categoryId, attributes, request, token, client }) {
  const pictureIds = await uploadProductPictures(product, request, token);
  const payload = buildPayload(product, categoryId, attributes, request);
  payload.pictures = pictureIds.map(id => ({ id }));
  const created = await client("/items", {
    method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify(payload)
  }, token);
  if (!created.ok) return { ok: false, status: created.status, details: created.data, pictureIds };

  const itemId = created.data.id;
  let description = null;
  if (product.description) {
    const response = await client(`/items/${encodeURIComponent(itemId)}/description`, {
      method: "POST", headers: { "content-type": "application/json" },
      body: JSON.stringify({ plain_text: product.description })
    }, token);
    description = { ok: response.ok, status: response.status, response: response.data };
  }
  const status = await client(`/items/${encodeURIComponent(itemId)}`, {}, token);
  return {
    ok: true, itemId, pictureIds, description,
    response: created.data,
    itemStatus: status.ok ? status.data : { lookupError: status.data, httpStatus: status.status }
  };
}

module.exports = { publish };
