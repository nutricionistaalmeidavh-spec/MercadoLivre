import { getValidToken } from "./token-service.mjs";
import { listItemMessageRules, upsertItemMessageRule } from "./repository.mjs";
import { mlRequest } from "./mercadolivre.mjs";

function chunk(values, size) {
  const out = [];
  for (let i = 0; i < values.length; i += size) out.push(values.slice(i, i + size));
  return out;
}

async function fetchSellerListings(env, sellerId) {
  const token = await getValidToken(env, sellerId);
  const search = await mlRequest(`/users/${encodeURIComponent(sellerId)}/items/search?status=active&limit=100`, token.access_token);
  if (!search.ok) {
    const error = new Error("Falha ao listar anúncios do Mercado Livre.");
    error.statusCode = search.status;
    throw error;
  }

  const ids = Array.isArray(search.data?.results) ? search.data.results.map(String).filter(Boolean) : [];
  const items = [];
  for (const group of chunk(ids, 20)) {
    const query = new URLSearchParams({
      ids: group.join(","),
      attributes: [
        "body.id",
        "body.title",
        "body.status",
        "body.thumbnail",
        "body.permalink",
        "body.seller_id",
        "body.price",
        "body.currency_id",
        "body.available_quantity",
        "body.sold_quantity",
        "body.listing_type_id",
        "body.condition",
        "body.category_id",
        "body.start_time",
        "body.stop_time"
      ].join(",")
    });
    const response = await mlRequest(`/items/bulk?${query}`, token.access_token);
    if (!response.ok || !Array.isArray(response.data)) continue;
    for (const entry of response.data) {
      const body = entry?.body || {};
      if (Number(entry?.status_code || 0) >= 400 || String(body.seller_id || "") !== String(sellerId)) continue;
      items.push({
        item_id: String(body.id || entry?.id || ""),
        title: String(body.title || ""),
        status: String(body.status || ""),
        thumbnail: body.thumbnail || null,
        permalink: body.permalink || null,
        price: Number.isFinite(Number(body.price)) ? Number(body.price) : null,
        currency_id: String(body.currency_id || "BRL"),
        available_quantity: Number.isFinite(Number(body.available_quantity)) ? Number(body.available_quantity) : null,
        sold_quantity: Number.isFinite(Number(body.sold_quantity)) ? Number(body.sold_quantity) : null,
        listing_type_id: String(body.listing_type_id || ""),
        condition: String(body.condition || ""),
        category_id: String(body.category_id || ""),
        start_time: body.start_time || null,
        stop_time: body.stop_time || null
      });
    }
  }
  return items.filter((item) => item.item_id);
}

export async function handleMessageRulesApi(env, request, sellerId) {
  if (request.method === "GET") {
    const [items, rules] = await Promise.all([
      fetchSellerListings(env, sellerId),
      listItemMessageRules(env, sellerId)
    ]);
    const byId = new Map(rules.map((rule) => [String(rule.item_id), rule]));
    return {
      seller_id: String(sellerId),
      mode: String(env.ML_AUTOMATION_MODE || "dry-run"),
      items: items.map((item) => {
        const rule = byId.get(item.item_id);
        return {
          ...item,
          rule: rule ? {
            message: String(rule.message || ""),
            enabled: Boolean(rule.enabled),
            updated_at: Number(rule.updated_at || 0)
          } : { message: "", enabled: false, updated_at: 0 }
        };
      })
    };
  }

  if (request.method === "POST") {
    const body = await request.json().catch(() => ({}));
    const itemId = String(body.item_id || "").trim();
    const message = String(body.message || "").trim();
    const enabled = Boolean(body.enabled);
    if (!itemId) return { error: "item_id obrigatório.", status: 400 };
    if (enabled && !message) return { error: "Defina a mensagem antes de ativar a automação deste anúncio.", status: 400 };
    if (message.length > 2000) return { error: "Mensagem muito longa para configuração.", status: 400 };

    const token = await getValidToken(env, sellerId);
    const itemResponse = await mlRequest(`/items/${encodeURIComponent(itemId)}`, token.access_token);
    if (!itemResponse.ok) return { error: "Anúncio não encontrado no Mercado Livre.", status: itemResponse.status || 404 };
    if (String(itemResponse.data?.seller_id || "") !== String(sellerId)) {
      return { error: "O anúncio não pertence ao seller conectado.", status: 403 };
    }

    const saved = await upsertItemMessageRule(env, {
      sellerId,
      itemId,
      itemTitle: itemResponse.data?.title || body.title || "",
      message,
      enabled
    });
    return {
      ok: true,
      rule: {
        item_id: String(saved.item_id),
        title: String(saved.item_title || ""),
        message: String(saved.message || ""),
        enabled: Number(saved.enabled || 0) === 1,
        updated_at: Number(saved.updated_at || 0)
      }
    };
  }

  return { error: "Método não permitido.", status: 405 };
}
