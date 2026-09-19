import { mlRequest } from "./mercadolivre.mjs";
import { getValidToken } from "./token-service.mjs";
import { listSiteCatalogDecisions, upsertSiteCatalogDecision } from "./site-catalog-repository.mjs";

const SITE_VISIBILITIES = new Set(["hidden", "individual", "collection", "external", "digital"]);
const PRICE_MODES = new Set(["marketplace", "contact", "hidden"]);
const LIVE_COLLECTIONS = new Set(["agro"]);

function cleanSlug(value) {
  return String(value || "")
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "")
    .slice(0, 100);
}

function cleanHttpsUrl(value) {
  const url = String(value || "").trim();
  return url.startsWith("https://") ? url : "";
}

export function normalizeCatalogDecision(input = {}) {
  const itemId = String(input.item_id || input.itemId || "").trim();
  const requestedVisibility = String(input.site_visibility || input.siteVisibility || "hidden").trim().toLowerCase();
  const siteVisibility = SITE_VISIBILITIES.has(requestedVisibility) ? requestedVisibility : "hidden";
  const collectionSlug = cleanSlug(input.collection_slug || input.collectionSlug);
  const siteName = String(input.site_name || input.siteName || "").trim().slice(0, 160);
  const siteSlug = cleanSlug(input.site_slug || input.siteSlug);
  const requestedPriceMode = String(input.price_mode || input.priceMode || "marketplace").trim().toLowerCase();
  const priceMode = PRICE_MODES.has(requestedPriceMode) ? requestedPriceMode : "marketplace";
  const heroPictureUrl = cleanHttpsUrl(input.hero_picture_url || input.heroPictureUrl);
  const collectionAllowed = siteVisibility !== "collection" || (Boolean(collectionSlug) && LIVE_COLLECTIONS.has(collectionSlug));
  const classifiable = siteVisibility !== "hidden" && collectionAllowed;
  return {
    itemId,
    approved: Boolean(input.approved) && classifiable,
    siteVisibility,
    collectionSlug,
    siteName,
    siteSlug,
    featured: Boolean(input.featured),
    priceMode,
    heroPictureUrl
  };
}

export function productPictures(listing = {}) {
  const candidates = Array.isArray(listing.pictures) && listing.pictures.length
    ? listing.pictures.map((picture) => picture?.secure_url || picture?.url)
    : [listing.thumbnail];
  return [...new Set(candidates.map((value) => String(value || "").trim()).filter((value) => value.startsWith("https://")))].slice(0, 12);
}

function orderedPictures(listing, heroPictureUrl) {
  const pictures = productPictures(listing);
  if (!heroPictureUrl || !pictures.includes(heroPictureUrl)) return pictures;
  return [heroPictureUrl, ...pictures.filter((picture) => picture !== heroPictureUrl)];
}

function chunk(values, size) {
  const output = [];
  for (let index = 0; index < values.length; index += size) output.push(values.slice(index, index + size));
  return output;
}

export async function fetchSellerCatalogListings(env, sellerId) {
  const token = await getValidToken(env, sellerId);
  const search = await mlRequest(`/users/${encodeURIComponent(sellerId)}/items/search?status=active&limit=100`, token.access_token);
  if (!search.ok) {
    const error = new Error("Falha ao listar anúncios do Mercado Livre para o catálogo ArtiSys.");
    error.statusCode = search.status;
    throw error;
  }
  const ids = Array.isArray(search.data?.results) ? search.data.results.map(String).filter(Boolean) : [];
  const items = [];
  for (const group of chunk(ids, 20)) {
    const query = new URLSearchParams({
      ids: group.join(","),
      attributes: [
        "body.id", "body.title", "body.status", "body.thumbnail", "body.pictures", "body.permalink",
        "body.seller_id", "body.price", "body.currency_id", "body.available_quantity", "body.sold_quantity",
        "body.listing_type_id", "body.condition", "body.category_id", "body.start_time", "body.stop_time"
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
        pictures: Array.isArray(body.pictures) ? body.pictures : [],
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

export function buildPublicCatalogFeed(listings = [], decisions = []) {
  const decisionByItem = new Map(decisions.map((decision) => [String(decision.item_id || decision.itemId || ""), decision]));
  const output = [];
  for (const listing of listings) {
    const rawDecision = decisionByItem.get(String(listing.item_id || ""));
    if (!rawDecision) continue;
    const decision = normalizeCatalogDecision(rawDecision);
    if (!decision.approved || decision.siteVisibility === "hidden") continue;
    if (decision.siteVisibility === "individual" && !decision.siteSlug) continue;
    if (decision.siteVisibility === "collection" && !decision.collectionSlug) continue;
    const name = decision.siteName || String(listing.title || "").trim();
    const slug = decision.siteSlug || cleanSlug(name) || String(listing.item_id || "").toLowerCase();
    const pictures = orderedPictures(listing, decision.heroPictureUrl);
    output.push({
      item_id: String(listing.item_id || ""),
      name,
      slug,
      pageMode: decision.siteVisibility,
      collection: decision.collectionSlug || "",
      featured: decision.featured,
      priceMode: decision.priceMode,
      price: decision.priceMode === "marketplace" && Number.isFinite(Number(listing.price)) ? Number(listing.price) : null,
      currency: String(listing.currency_id || "BRL"),
      permalink: String(listing.permalink || ""),
      soldQuantity: Number.isFinite(Number(listing.sold_quantity)) ? Number(listing.sold_quantity) : 0,
      ...(decision.heroPictureUrl && pictures[0] === decision.heroPictureUrl ? { heroPicture: decision.heroPictureUrl } : {}),
      pictures
    });
  }
  return output;
}

function decisionForAdmin(listing, stored) {
  const normalized = normalizeCatalogDecision(stored || {});
  return {
    configured: Boolean(stored),
    approved: normalized.approved,
    site_visibility: normalized.siteVisibility,
    collection_slug: normalized.collectionSlug,
    site_name: normalized.siteName || listing.title,
    site_slug: normalized.siteSlug,
    featured: normalized.featured,
    price_mode: normalized.priceMode,
    hero_picture_url: normalized.heroPictureUrl
  };
}

export async function handleSiteCatalogAdminApi(env, request, sellerId) {
  if (request.method === "GET") {
    const [items, decisions] = await Promise.all([
      fetchSellerCatalogListings(env, sellerId),
      listSiteCatalogDecisions(env, sellerId)
    ]);
    const byItem = new Map(decisions.map((decision) => [String(decision.item_id), decision]));
    return {
      seller_id: String(sellerId),
      generated_at: new Date().toISOString(),
      items: items.map((item) => ({
        ...item,
        pictures: productPictures(item),
        decision: decisionForAdmin(item, byItem.get(item.item_id))
      }))
    };
  }

  if (request.method === "POST") {
    const body = await request.json().catch(() => ({}));
    const decision = normalizeCatalogDecision(body);
    if (!decision.itemId) return { error: "item_id obrigatório.", status: 400 };
    if (body.approved && !decision.approved) return { error: "Classificação incompleta ou inválida para publicação.", status: 400 };

    const token = await getValidToken(env, sellerId);
    const itemResponse = await mlRequest(`/items/${encodeURIComponent(decision.itemId)}`, token.access_token);
    if (!itemResponse.ok) return { error: "Anúncio não encontrado no Mercado Livre.", status: itemResponse.status || 404 };
    if (String(itemResponse.data?.seller_id || "") !== String(sellerId)) return { error: "O anúncio não pertence ao seller conectado.", status: 403 };
    const availablePictures = productPictures(itemResponse.data || {});
    if (decision.heroPictureUrl && !availablePictures.includes(decision.heroPictureUrl)) {
      return { error: "A foto de capa precisa pertencer ao anúncio atual.", status: 400 };
    }

    const saved = await upsertSiteCatalogDecision(env, sellerId, decision);
    return {
      ok: true,
      decision: {
        item_id: String(saved.item_id),
        approved: Number(saved.approved || 0) === 1,
        site_visibility: String(saved.site_visibility || "hidden"),
        collection_slug: String(saved.collection_slug || ""),
        site_name: String(saved.site_name || ""),
        site_slug: String(saved.site_slug || ""),
        featured: Number(saved.featured || 0) === 1,
        price_mode: String(saved.price_mode || "marketplace"),
        hero_picture_url: String(saved.hero_picture_url || ""),
        updated_at: Number(saved.updated_at || 0)
      }
    };
  }

  return { error: "Método não permitido.", status: 405 };
}

export async function handleSiteCatalogFeedApi(env, request, sellerId) {
  if (request.method !== "GET") return { error: "Método não permitido.", status: 405 };
  const [items, decisions] = await Promise.all([
    fetchSellerCatalogListings(env, sellerId),
    listSiteCatalogDecisions(env, sellerId)
  ]);
  return {
    version: 1,
    seller_id: String(sellerId),
    generated_at: new Date().toISOString(),
    items: buildPublicCatalogFeed(items, decisions)
  };
}
