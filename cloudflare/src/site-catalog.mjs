import { mlRequest } from "./mercadolivre.mjs";
import { getValidToken } from "./token-service.mjs";
import {
  canonicalCollectionSlugs,
  fetchCanonicalCollections
} from "./site-catalog-collections.mjs";
export { normalizeCanonicalCollections } from "./site-catalog-collections.mjs";
import {
  createSiteCatalogGroup,
  deleteSiteCatalogGroup,
  getSiteCatalogGroup,
  listSiteCatalogDecisions,
  listSiteCatalogGroupItems,
  listSiteCatalogGroups,
  replaceSiteCatalogGroupItems,
  updateSiteCatalogGroup,
  upsertSiteCatalogDecision
} from "./site-catalog-repository.mjs";

const SITE_VISIBILITIES = new Set(["hidden", "individual", "collection", "external", "digital"]);
const PRICE_MODES = new Set(["marketplace", "contact", "hidden"]);
const FALLBACK_LIVE_COLLECTIONS = new Set(["agro"]);

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

function uniqueStrings(values) {
  return [...new Set((values || []).map((value) => String(value || "").trim()).filter(Boolean))];
}

export function normalizeCatalogDecision(input = {}, liveCollections = FALLBACK_LIVE_COLLECTIONS) {
  const itemId = String(input.item_id || input.itemId || "").trim();
  const requestedVisibility = String(input.site_visibility || input.siteVisibility || "hidden").trim().toLowerCase();
  const siteVisibility = SITE_VISIBILITIES.has(requestedVisibility) ? requestedVisibility : "hidden";
  const collectionSlug = cleanSlug(input.collection_slug || input.collectionSlug);
  const siteName = String(input.site_name || input.siteName || "").trim().slice(0, 160);
  const siteSlug = cleanSlug(input.site_slug || input.siteSlug);
  const requestedPriceMode = String(input.price_mode || input.priceMode || "marketplace").trim().toLowerCase();
  const priceMode = PRICE_MODES.has(requestedPriceMode) ? requestedPriceMode : "marketplace";
  const heroPictureUrl = cleanHttpsUrl(input.hero_picture_url || input.heroPictureUrl);
  const allowedCollections = liveCollections instanceof Set ? liveCollections : canonicalCollectionSlugs(liveCollections);
  const collectionAllowed = siteVisibility !== "collection" || (Boolean(collectionSlug) && allowedCollections.has(collectionSlug));
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

function normalizeCatalogGroup(input = {}, liveCollections = FALLBACK_LIVE_COLLECTIONS) {
  const normalized = normalizeCatalogDecision({
    ...input,
    item_id: input.primary_item_id || input.primaryItemId || input.group_id || input.groupId || "group"
  }, liveCollections);
  return {
    groupId: String(input.group_id || input.groupId || "").trim(),
    primaryItemId: String(input.primary_item_id || input.primaryItemId || "").trim(),
    approved: normalized.approved,
    siteVisibility: normalized.siteVisibility,
    collectionSlug: normalized.collectionSlug,
    siteName: normalized.siteName,
    siteSlug: normalized.siteSlug,
    featured: normalized.featured,
    priceMode: normalized.priceMode,
    heroPictureUrl: normalized.heroPictureUrl
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

function groupPictures(memberListings, heroPictureUrl) {
  const pictures = [...new Set(memberListings.flatMap((listing) => productPictures(listing)))].slice(0, 12);
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

function buildIndividualProduct(listing, rawDecision, liveCollections = FALLBACK_LIVE_COLLECTIONS) {
  if (!rawDecision) return null;
  const decision = normalizeCatalogDecision(rawDecision, liveCollections);
  if (!decision.approved || decision.siteVisibility === "hidden") return null;
  if (decision.siteVisibility === "individual" && !decision.siteSlug) return null;
  if (decision.siteVisibility === "collection" && !decision.collectionSlug) return null;
  const name = decision.siteName || String(listing.title || "").trim();
  const slug = decision.siteSlug || cleanSlug(name) || String(listing.item_id || "").toLowerCase();
  const pictures = orderedPictures(listing, decision.heroPictureUrl);
  return {
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
  };
}

function buildGroupedProduct(rawGroup, memberIds, listingById, liveCollections = FALLBACK_LIVE_COLLECTIONS) {
  const group = normalizeCatalogGroup(rawGroup, liveCollections);
  if (!group.groupId || !group.approved || group.siteVisibility === "hidden") return null;
  if (group.siteVisibility === "individual" && !group.siteSlug) return null;
  if (group.siteVisibility === "collection" && !group.collectionSlug) return null;
  if (!memberIds.includes(group.primaryItemId)) return null;
  const primary = listingById.get(group.primaryItemId);
  if (!primary) return null;
  const memberListings = memberIds.map((itemId) => listingById.get(itemId)).filter(Boolean);
  if (!memberListings.length) return null;

  const name = group.siteName || String(primary.title || "").trim();
  const slug = group.siteSlug || cleanSlug(name) || group.groupId;
  const pictures = groupPictures(memberListings, group.heroPictureUrl);
  const sourceItemIds = memberIds.filter((itemId) => listingById.has(itemId));
  return {
    group_id: group.groupId,
    item_id: String(primary.item_id || ""),
    sourceItemIds,
    name,
    slug,
    pageMode: group.siteVisibility,
    collection: group.collectionSlug || "",
    featured: group.featured,
    priceMode: group.priceMode,
    price: group.priceMode === "marketplace" && Number.isFinite(Number(primary.price)) ? Number(primary.price) : null,
    currency: String(primary.currency_id || "BRL"),
    permalink: String(primary.permalink || ""),
    soldQuantity: memberListings.reduce((sum, listing) => sum + (Number.isFinite(Number(listing.sold_quantity)) ? Number(listing.sold_quantity) : 0), 0),
    ...(group.heroPictureUrl && pictures[0] === group.heroPictureUrl ? { heroPicture: group.heroPictureUrl } : {}),
    pictures
  };
}

export function buildPublicCatalogFeed(listings = [], decisions = [], groups = [], groupItems = [], liveCollections = FALLBACK_LIVE_COLLECTIONS) {
  const decisionByItem = new Map(decisions.map((decision) => [String(decision.item_id || decision.itemId || ""), decision]));
  const listingById = new Map(listings.map((listing) => [String(listing.item_id || ""), listing]));
  const memberIdsByGroup = new Map();
  const groupedItemIds = new Set();
  for (const link of groupItems) {
    const groupId = String(link.group_id || link.groupId || "").trim();
    const itemId = String(link.item_id || link.itemId || "").trim();
    if (!groupId || !itemId) continue;
    groupedItemIds.add(itemId);
    if (!memberIdsByGroup.has(groupId)) memberIdsByGroup.set(groupId, []);
    memberIdsByGroup.get(groupId).push(itemId);
  }

  const output = [];
  for (const rawGroup of groups) {
    const groupId = String(rawGroup.group_id || rawGroup.groupId || "").trim();
    const grouped = buildGroupedProduct(rawGroup, uniqueStrings(memberIdsByGroup.get(groupId) || []), listingById, liveCollections);
    if (grouped) output.push(grouped);
  }

  for (const listing of listings) {
    const itemId = String(listing.item_id || "");
    if (groupedItemIds.has(itemId)) continue;
    const individual = buildIndividualProduct(listing, decisionByItem.get(itemId), liveCollections);
    if (individual) output.push(individual);
  }
  return output;
}

function decisionForAdmin(listing, stored, liveCollections = FALLBACK_LIVE_COLLECTIONS) {
  const normalized = normalizeCatalogDecision(stored || {}, liveCollections);
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

function groupForAdmin(group, itemIds, listingById, liveCollections = FALLBACK_LIVE_COLLECTIONS) {
  const normalized = normalizeCatalogGroup(group, liveCollections);
  const activeListings = itemIds.map((itemId) => listingById.get(itemId)).filter(Boolean);
  const pictures = groupPictures(activeListings, normalized.heroPictureUrl);
  return {
    group_id: normalized.groupId,
    item_ids: itemIds,
    primary_item_id: normalized.primaryItemId,
    primary_available: Boolean(listingById.get(normalized.primaryItemId)),
    approved: normalized.approved,
    site_visibility: normalized.siteVisibility,
    collection_slug: normalized.collectionSlug,
    site_name: normalized.siteName,
    site_slug: normalized.siteSlug,
    featured: normalized.featured,
    price_mode: normalized.priceMode,
    hero_picture_url: normalized.heroPictureUrl,
    sold_quantity: activeListings.reduce((sum, listing) => sum + Number(listing.sold_quantity || 0), 0),
    pictures,
    updated_at: Number(group.updated_at || 0)
  };
}

function validateGroupListings(listings, itemIds, primaryItemId) {
  if (itemIds.length < 2) return "Selecione pelo menos dois anúncios para formar um grupo.";
  const listingById = new Map(listings.map((listing) => [String(listing.item_id), listing]));
  const missing = itemIds.find((itemId) => !listingById.has(itemId));
  if (missing) return `O anúncio ${missing} não está ativo na conta conectada.`;
  if (!primaryItemId || !itemIds.includes(primaryItemId)) return "Escolha um anúncio principal que pertença ao grupo.";
  return "";
}

async function saveIndividualDecision(env, sellerId, body, liveCollections) {
  const decision = normalizeCatalogDecision(body, liveCollections);
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

async function createGroup(env, sellerId, body, liveCollections) {
  const listings = await fetchSellerCatalogListings(env, sellerId);
  const itemIds = uniqueStrings(body.item_ids);
  const primaryItemId = String(body.primary_item_id || itemIds[0] || "").trim();
  const validationError = validateGroupListings(listings, itemIds, primaryItemId);
  if (validationError) return { error: validationError, status: 400 };
  const listingById = new Map(listings.map((listing) => [String(listing.item_id), listing]));
  const siteName = String(body.site_name || listingById.get(primaryItemId)?.title || "Produto agrupado").trim().slice(0, 160);
  const group = {
    groupId: `grp_${crypto.randomUUID()}`,
    primaryItemId,
    approved: false,
    siteVisibility: "individual",
    collectionSlug: "",
    siteName,
    siteSlug: cleanSlug(siteName),
    featured: false,
    priceMode: "marketplace",
    heroPictureUrl: ""
  };
  await createSiteCatalogGroup(env, sellerId, group);
  try {
    await replaceSiteCatalogGroupItems(env, sellerId, group.groupId, itemIds);
  } catch (error) {
    await deleteSiteCatalogGroup(env, sellerId, group.groupId);
    return { error: error.message || "Falha ao agrupar anúncios.", status: 409 };
  }
  return { ok: true, group: groupForAdmin(await getSiteCatalogGroup(env, sellerId, group.groupId), itemIds, listingById, liveCollections) };
}

async function saveGroup(env, sellerId, body, liveCollections) {
  const groupId = String(body.group_id || "").trim();
  if (!groupId) return { error: "group_id obrigatório.", status: 400 };
  const existing = await getSiteCatalogGroup(env, sellerId, groupId);
  if (!existing) return { error: "Grupo não encontrado.", status: 404 };

  const listings = await fetchSellerCatalogListings(env, sellerId);
  const itemIds = uniqueStrings(body.item_ids);
  const primaryItemId = String(body.primary_item_id || "").trim();
  const validationError = validateGroupListings(listings, itemIds, primaryItemId);
  if (validationError) return { error: validationError, status: 400 };
  const normalized = normalizeCatalogGroup({ ...body, group_id: groupId, primary_item_id: primaryItemId }, liveCollections);
  if (body.approved && !normalized.approved) return { error: "Classificação incompleta ou inválida para publicação.", status: 400 };

  const listingById = new Map(listings.map((listing) => [String(listing.item_id), listing]));
  const availablePictures = [...new Set(itemIds.flatMap((itemId) => productPictures(listingById.get(itemId) || {})))];
  if (normalized.heroPictureUrl && !availablePictures.includes(normalized.heroPictureUrl)) {
    return { error: "A foto de capa precisa pertencer a um anúncio atual do grupo.", status: 400 };
  }

  try {
    await replaceSiteCatalogGroupItems(env, sellerId, groupId, itemIds);
  } catch (error) {
    return { error: error.message || "Falha ao atualizar anúncios do grupo.", status: 409 };
  }
  const saved = await updateSiteCatalogGroup(env, sellerId, normalized);
  return { ok: true, group: groupForAdmin(saved, itemIds, listingById, liveCollections) };
}

export async function handleSiteCatalogAdminApi(env, request, sellerId) {
  const canonical = await fetchCanonicalCollections(env);
  const liveCollections = canonicalCollectionSlugs(canonical.collections);

  if (request.method === "GET") {
    const [items, decisions, groups, groupItems] = await Promise.all([
      fetchSellerCatalogListings(env, sellerId),
      listSiteCatalogDecisions(env, sellerId),
      listSiteCatalogGroups(env, sellerId),
      listSiteCatalogGroupItems(env, sellerId)
    ]);
    const byItem = new Map(decisions.map((decision) => [String(decision.item_id), decision]));
    const groupByItem = new Map(groupItems.map((link) => [String(link.item_id), String(link.group_id)]));
    const itemIdsByGroup = new Map();
    for (const link of groupItems) {
      const groupId = String(link.group_id);
      if (!itemIdsByGroup.has(groupId)) itemIdsByGroup.set(groupId, []);
      itemIdsByGroup.get(groupId).push(String(link.item_id));
    }
    const listingById = new Map(items.map((item) => [String(item.item_id), item]));
    return {
      seller_id: String(sellerId),
      generated_at: new Date().toISOString(),
      collections: canonical.collections,
      collections_source: canonical.source,
      collections_warning: canonical.warning || "",
      groups: groups.map((group) => groupForAdmin(group, itemIdsByGroup.get(String(group.group_id)) || [], listingById, liveCollections)),
      items: items.map((item) => ({
        ...item,
        group_id: groupByItem.get(String(item.item_id)) || "",
        pictures: productPictures(item),
        decision: decisionForAdmin(item, byItem.get(item.item_id), liveCollections)
      }))
    };
  }

  if (request.method === "POST") {
    const body = await request.json().catch(() => ({}));
    const action = String(body.action || "save_item").trim().toLowerCase();
    if (action === "save_item") return saveIndividualDecision(env, sellerId, body, liveCollections);
    if (action === "create_group") return createGroup(env, sellerId, body, liveCollections);
    if (action === "save_group") return saveGroup(env, sellerId, body, liveCollections);
    if (action === "delete_group") {
      const groupId = String(body.group_id || "").trim();
      if (!groupId) return { error: "group_id obrigatório.", status: 400 };
      await deleteSiteCatalogGroup(env, sellerId, groupId);
      return { ok: true, deleted_group_id: groupId };
    }
    return { error: "Ação de catálogo inválida.", status: 400 };
  }

  return { error: "Método não permitido.", status: 405 };
}

export async function handleSiteCatalogFeedApi(env, request, sellerId) {
  if (request.method !== "GET") return { error: "Método não permitido.", status: 405 };
  const [canonical, items, decisions, groups, groupItems] = await Promise.all([
    fetchCanonicalCollections(env),
    fetchSellerCatalogListings(env, sellerId),
    listSiteCatalogDecisions(env, sellerId),
    listSiteCatalogGroups(env, sellerId),
    listSiteCatalogGroupItems(env, sellerId)
  ]);
  const liveCollections = canonicalCollectionSlugs(canonical.collections);
  return {
    version: 3,
    seller_id: String(sellerId),
    generated_at: new Date().toISOString(),
    collections: canonical.collections,
    items: buildPublicCatalogFeed(items, decisions, groups, groupItems, liveCollections)
  };
}
