import { getValidToken } from "./token-service.mjs";
import { mlRequest } from "./mercadolivre.mjs";

function normalizePromotion(entry) {
  return {
    id: entry?.id != null ? String(entry.id) : null,
    ref_id: entry?.ref_id != null ? String(entry.ref_id) : null,
    type: String(entry?.type || ""),
    status: String(entry?.status || ""),
    name: String(entry?.name || ""),
    price: entry?.price == null ? null : Number(entry.price),
    original_price: entry?.original_price == null ? null : Number(entry.original_price),
    min_discounted_price: entry?.min_discounted_price == null ? null : Number(entry.min_discounted_price),
    max_discounted_price: entry?.max_discounted_price == null ? null : Number(entry.max_discounted_price),
    suggested_discounted_price: entry?.suggested_discounted_price == null ? null : Number(entry.suggested_discounted_price),
    start_date: entry?.start_date || null,
    end_date: entry?.end_date || entry?.finish_date || null,
    boosted_offer: Boolean(entry?.boosted_offer),
    total_price_for_boosted_offer: entry?.total_price_for_boosted_offer == null ? null : Number(entry.total_price_for_boosted_offer)
  };
}

async function assertItemOwnership(env, sellerId, itemId, token) {
  const item = await mlRequest(`/items/${encodeURIComponent(itemId)}`, token);
  if (!item.ok) return { ok: false, status: item.status || 404, error: "Anúncio não encontrado no Mercado Livre." };
  if (String(item.data?.seller_id || "") !== String(sellerId)) return { ok: false, status: 403, error: "O anúncio não pertence ao seller conectado." };
  return { ok: true, item: item.data };
}

function normalizeDateOnly(value) {
  const text = String(value || "").trim();
  if (!/^\d{4}-\d{2}-\d{2}$/.test(text)) return null;
  const date = new Date(`${text}T00:00:00Z`);
  return Number.isNaN(date.getTime()) ? null : date;
}

export async function handlePromotionsApi(env, request, sellerId) {
  const url = new URL(request.url);
  const tokenData = await getValidToken(env, sellerId);
  const token = tokenData.access_token;

  if (request.method === "GET") {
    const ids = String(url.searchParams.get("item_ids") || url.searchParams.get("item_id") || "")
      .split(",").map((v) => v.trim()).filter(Boolean).slice(0, 25);
    if (!ids.length) return { error: "Informe item_id ou item_ids.", status: 400 };
    const entries = await Promise.all(ids.map(async (itemId) => {
      const response = await mlRequest(`/seller-promotions/items/${encodeURIComponent(itemId)}?app_version=v2`, token);
      if (!response.ok) return { item_id: itemId, ok: false, status: response.status, promotions: [], error: response.data?.message || response.data?.error || "Falha ao consultar promoções." };
      const list = Array.isArray(response.data) ? response.data : [];
      return { item_id: itemId, ok: true, promotions: list.map(normalizePromotion) };
    }));
    return { ok: true, items: entries };
  }

  if (request.method === "POST") {
    const body = await request.json().catch(() => ({}));
    const itemId = String(body.item_id || "").trim();
    const promotionType = String(body.promotion_type || "PRICE_DISCOUNT").trim().toUpperCase();
    if (!itemId) return { error: "item_id obrigatório.", status: 400 };
    if (promotionType !== "PRICE_DISCOUNT") return { error: "Nesta etapa, a criação pelo painel é limitada a PRICE_DISCOUNT.", status: 400 };
    if (body.confirm !== true) return { error: "Confirmação explícita obrigatória para criar promoção.", status: 409 };

    const dealPrice = Number(body.deal_price);
    const topDealPrice = body.top_deal_price == null || body.top_deal_price === "" ? null : Number(body.top_deal_price);
    const start = normalizeDateOnly(body.start_date);
    const finish = normalizeDateOnly(body.finish_date);
    if (!(dealPrice > 0)) return { error: "Informe um preço promocional válido.", status: 400 };
    if (topDealPrice != null && !(topDealPrice > 0)) return { error: "Preço para melhores compradores inválido.", status: 400 };
    if (!start || !finish || finish < start) return { error: "Período da promoção inválido.", status: 400 };
    const days = Math.floor((finish.getTime() - start.getTime()) / 86400000) + 1;
    if (days > 14) return { error: "PRICE_DISCOUNT aceita período máximo de 14 dias.", status: 400 };

    const owner = await assertItemOwnership(env, sellerId, itemId, token);
    if (!owner.ok) return owner;
    const regularPrice = Number(owner.item?.price || 0);
    if (regularPrice > 0) {
      const discount = ((regularPrice - dealPrice) / regularPrice) * 100;
      if (discount < 5 || discount >= 80) return { error: "O desconto deve ficar entre 5% e menos de 80% do preço atual.", status: 400 };
    }

    const payload = {
      deal_price: dealPrice,
      start_date: String(body.start_date),
      finish_date: String(body.finish_date),
      promotion_type: "PRICE_DISCOUNT"
    };
    if (topDealPrice != null) payload.top_deal_price = topDealPrice;
    const response = await mlRequest(`/seller-promotions/items/${encodeURIComponent(itemId)}?app_version=v2`, token, {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify(payload)
    });
    if (!response.ok) return { error: "Mercado Livre recusou a promoção.", status: response.status || 400, details: response.data };
    return { ok: true, item_id: itemId, promotion_type: "PRICE_DISCOUNT", result: response.data };
  }

  if (request.method === "DELETE") {
    const itemId = String(url.searchParams.get("item_id") || "").trim();
    const promotionType = String(url.searchParams.get("promotion_type") || "PRICE_DISCOUNT").trim().toUpperCase();
    const confirmed = url.searchParams.get("confirm") === "true";
    if (!itemId) return { error: "item_id obrigatório.", status: 400 };
    if (!confirmed) return { error: "Confirmação explícita obrigatória para encerrar promoção.", status: 409 };
    if (promotionType !== "PRICE_DISCOUNT") return { error: "Nesta etapa, o encerramento pelo painel é limitado a PRICE_DISCOUNT.", status: 400 };
    const owner = await assertItemOwnership(env, sellerId, itemId, token);
    if (!owner.ok) return owner;
    const response = await mlRequest(`/seller-promotions/items/${encodeURIComponent(itemId)}?promotion_type=PRICE_DISCOUNT&app_version=v2`, token, { method: "DELETE" });
    if (!response.ok) return { error: "Mercado Livre recusou o encerramento da promoção.", status: response.status || 400, details: response.data };
    return { ok: true, item_id: itemId, promotion_type: "PRICE_DISCOUNT" };
  }

  return { error: "Método não permitido.", status: 405 };
}
