import { getValidToken } from "./token-service.mjs";
import { mlRequest } from "./mercadolivre.mjs";

function norm(value) {
  return String(value || "")
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, " ")
    .trim();
}

async function loadCatalog(env, request) {
  const origin = new URL(request.url).origin;
  const [baseResponse, newResponse] = await Promise.all([
    env.ASSETS.fetch(new Request(`${origin}/catalog.json`)),
    env.ASSETS.fetch(new Request(`${origin}/catalog-novos.json`))
  ]);
  if (!baseResponse.ok || !newResponse.ok) throw new Error("Catálogo não disponível nos assets do Worker.");
  const [base, newer] = await Promise.all([baseResponse.json(), newResponse.json()]);
  return [...base, ...newer];
}

async function getProduct(env, request, sku) {
  const catalog = await loadCatalog(env, request);
  const product = catalog.find((entry) => entry.sku === sku);
  if (!product) throw new Error("SKU não encontrado.");
  return product;
}

function proposedMap(product) {
  const map = {};
  for (const [key, value] of Object.entries(product.attribute_values_by_name || {})) map[norm(key)] = value;
  return map;
}

function attrView(attribute, proposed) {
  const tags = attribute.tags || {};
  const names = [norm(attribute.name), norm(attribute.id)];
  const suggested = names.find((name) => proposed[name] != null);
  return {
    id: attribute.id,
    name: attribute.name,
    value_type: attribute.value_type,
    required: Boolean(tags.required || tags.new_required),
    conditional_required: Boolean(tags.conditional_required),
    suggested_value: suggested ? proposed[suggested] : "",
    values: (attribute.values || []).slice(0, 100).map((value) => ({ id: value.id, name: value.name }))
  };
}

function buildPayload(product, categoryId, attributes, request) {
  const origin = new URL(request.url).origin;
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
    pictures: (product.images || []).map((imagePath) => ({ source: new URL(imagePath, `${origin}/`).href }))
  };
}

async function uploadProductPictures(env, product, request, token) {
  const origin = new URL(request.url).origin;
  const ids = [];
  for (const imagePath of product.images || []) {
    const assetUrl = new URL(imagePath, `${origin}/`).href;
    const imageResponse = await env.ASSETS.fetch(new Request(assetUrl));
    if (!imageResponse.ok) throw new Error(`Falha ao ler imagem ${imagePath}: HTTP ${imageResponse.status}`);
    const bytes = await imageResponse.arrayBuffer();
    const fileName = String(imagePath).split("/").pop() || "imagem.jpg";
    const form = new FormData();
    form.append("file", new Blob([bytes], { type: imageResponse.headers.get("content-type") || "image/jpeg" }), fileName);
    const response = await fetch("https://api.mercadolibre.com/pictures/items/upload", {
      method: "POST",
      headers: { Authorization: `Bearer ${token}`, accept: "application/json" },
      body: form
    });
    const data = await response.json().catch(() => ({}));
    if (!response.ok || !data.id) throw new Error(`Falha no upload da imagem ${fileName}: HTTP ${response.status}`);
    ids.push(data.id);
  }
  if (!ids.length) throw new Error("Nenhuma imagem foi carregada para o Mercado Livre.");
  return ids;
}

async function publishProduct(env, product, categoryId, attributes, request, token) {
  const pictureIds = await uploadProductPictures(env, product, request, token);
  const payload = buildPayload(product, categoryId, attributes, request);
  payload.pictures = pictureIds.map((id) => ({ id }));

  const created = await mlRequest("/items", token, {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify(payload)
  });
  if (!created.ok) return { ok: false, status: created.status, details: created.data, pictureIds };

  const itemId = created.data.id;
  let description = null;
  if (product.description) {
    const response = await mlRequest(`/items/${encodeURIComponent(itemId)}/description`, token, {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ plain_text: product.description })
    });
    description = { ok: response.ok, status: response.status, response: response.data };
  }
  const itemStatus = await mlRequest(`/items/${encodeURIComponent(itemId)}`, token);
  return {
    ok: true,
    itemId,
    pictureIds,
    description,
    response: created.data,
    itemStatus: itemStatus.ok ? itemStatus.data : { lookupError: itemStatus.data, httpStatus: itemStatus.status }
  };
}

export async function handlePublisherApi(env, request, sellerId) {
  const url = new URL(request.url);
  const op = url.searchParams.get("op");
  const tokenData = await getValidToken(env, sellerId);
  const token = tokenData.access_token;

  if (op === "me") return mlRequest("/users/me", token);

  if (op === "discover") {
    const product = await getProduct(env, request, url.searchParams.get("sku"));
    const query = new URLSearchParams({ q: product.title, limit: "3" });
    return mlRequest(`/sites/MLB/domain_discovery/search?${query}`, token);
  }

  if (op === "attributes") {
    const product = await getProduct(env, request, url.searchParams.get("sku"));
    const categoryId = url.searchParams.get("category_id");
    if (!categoryId) return { ok: false, status: 400, data: { error: "category_id obrigatório." } };
    const response = await mlRequest(`/categories/${encodeURIComponent(categoryId)}/attributes`, token);
    if (!response.ok) return response;
    const proposed = proposedMap(product);
    return { ok: true, status: 200, data: { attributes: response.data.map((attribute) => attrView(attribute, proposed)) } };
  }

  if (op === "validate" && request.method === "POST") {
    const body = await request.json();
    const product = await getProduct(env, request, body.sku);
    if (!body.category_id) return { ok: false, status: 400, data: { error: "category_id obrigatório." } };
    const payload = buildPayload(product, body.category_id, body.attributes, request);
    const response = await mlRequest("/items/validate", token, {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify(payload)
    });
    return { ok: true, status: 200, data: { valid: response.ok, status: response.status, response: response.data, payload_preview: payload } };
  }

  if (op === "publish" && request.method === "POST") {
    const body = await request.json();
    const product = await getProduct(env, request, body.sku);
    if (!body.category_id) return { ok: false, status: 400, data: { error: "category_id obrigatório." } };
    const result = await publishProduct(env, product, body.category_id, body.attributes, request, token);
    if (!result.ok) return { ok: false, status: result.status, data: { error: "Publicação recusada.", details: result.details, uploaded_picture_ids: result.pictureIds } };
    return {
      ok: true,
      status: 200,
      data: {
        ok: true,
        item_id: result.itemId,
        permalink: result.response.permalink,
        status: result.itemStatus.status || result.response.status,
        sub_status: result.itemStatus.sub_status,
        picture_ids: result.pictureIds,
        pictures: result.response.pictures || [],
        description: result.description,
        response: result.response,
        item_status: result.itemStatus
      }
    };
  }

  if (op === "item-status") {
    const itemId = url.searchParams.get("item_id");
    if (!itemId) return { ok: false, status: 400, data: { error: "item_id obrigatório." } };
    return mlRequest(`/items/${encodeURIComponent(itemId)}`, token);
  }

  if (op === "update-pictures" && request.method === "POST") {
    const body = await request.json();
    const product = await getProduct(env, request, body.sku);
    if (!body.item_id) return { ok: false, status: 400, data: { error: "item_id obrigatório." } };
    const pictureIds = await uploadProductPictures(env, product, request, token);
    const response = await mlRequest(`/items/${encodeURIComponent(body.item_id)}`, token, {
      method: "PUT",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ pictures: pictureIds.map((id) => ({ id })) })
    });
    if (!response.ok) return { ok: false, status: response.status, data: { error: "Falha ao atualizar imagens do anúncio.", details: response.data, uploaded_picture_ids: pictureIds } };
    return { ok: true, status: 200, data: { ok: true, item_id: body.item_id, picture_ids: pictureIds, pictures: response.data.pictures || [], response: response.data } };
  }

  return { ok: false, status: 404, data: { error: "Operação inválida." } };
}
