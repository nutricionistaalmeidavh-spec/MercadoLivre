const DEFAULT_PRODUCTS_URL = "https://artisys.dev/sistemas/products.json";
const FALLBACK_PRODUCTS_URL = "https://obra-na-mao-comercial.nutricionistaalmeidavh.workers.dev/sistemas/products.json";

function cleanSlug(value) {
  return String(value || "")
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "")
    .slice(0, 100);
}

function collectionForProduct(product, collections = []) {
  const allowed = new Map((collections || []).map((collection) => [cleanSlug(collection?.slug), collection]).filter(([slug]) => slug));
  for (const slug of product?.collections || []) {
    const clean = cleanSlug(slug);
    if (allowed.has(clean)) return clean;
  }
  const category = String(product?.category || "").trim();
  const categorySlug = cleanSlug(category);
  for (const [slug, collection] of allowed) {
    const categories = [
      ...(Array.isArray(collection?.categories) ? collection.categories : []),
      collection?.category,
      collection?.name
    ].map((value) => String(value || "").trim()).filter(Boolean);
    if (slug === categorySlug || categories.some((value) => value === category || cleanSlug(value) === categorySlug)) return slug;
  }
  return "";
}

export function normalizeCanonicalProducts(payload) {
  const source = Array.isArray(payload) ? payload : Array.isArray(payload?.products) ? payload.products : [];
  const seen = new Set();
  const products = [];
  for (const raw of source) {
    const slug = cleanSlug(raw?.slug);
    const name = String(raw?.name || "").trim();
    if (!slug || !name || seen.has(slug)) continue;
    seen.add(slug);
    products.push({
      slug,
      name: name.slice(0, 160),
      category: String(raw?.category || "").trim(),
      type: String(raw?.type || "").trim(),
      status: String(raw?.status || "").trim(),
      pageMode: String(raw?.pageMode || "individual").trim(),
      collections: [...new Set((Array.isArray(raw?.collections) ? raw.collections : []).map(cleanSlug).filter(Boolean))],
      externalHref: String(raw?.externalHref || "").trim()
    });
  }
  return products.sort((a, b) => a.name.localeCompare(b.name, "pt-BR"));
}

export function linkGroupToCanonicalProduct(group = {}, linkedProductSlug, products = [], collections = []) {
  const slug = cleanSlug(linkedProductSlug);
  if (!slug) {
    return {
      ...group,
      site_visibility: "hidden",
      collection_slug: "",
      site_slug: "",
      approved: false
    };
  }
  const product = normalizeCanonicalProducts(products).find((entry) => entry.slug === slug);
  if (!product) {
    const error = new Error("Página ArtiSys selecionada não existe no catálogo publicado.");
    error.code = "UNKNOWN_ARTISYS_PRODUCT";
    throw error;
  }
  const mode = ["individual", "collection", "external", "digital"].includes(product.pageMode) ? product.pageMode : "individual";
  return {
    ...group,
    site_name: product.name,
    site_slug: product.slug,
    site_visibility: mode,
    collection_slug: collectionForProduct(product, collections)
  };
}

export function linkDecisionToCanonicalProduct(decision = {}, linkedProductSlug, products = [], collections = []) {
  return linkGroupToCanonicalProduct(decision, linkedProductSlug, products, collections);
}

export async function fetchCanonicalProducts(env = {}, fetchImpl = fetch) {
  const urls = [...new Set([
    String(env.ARTISYS_PRODUCTS_URL || "").trim(),
    DEFAULT_PRODUCTS_URL,
    FALLBACK_PRODUCTS_URL
  ].filter(Boolean))];
  const failures = [];
  for (const url of urls) {
    try {
      const response = await fetchImpl(url, {
        headers: { accept: "application/json" },
        cf: { cacheTtl: 300, cacheEverything: true }
      });
      if (!response.ok) {
        failures.push(`${url}: HTTP ${response.status}`);
        continue;
      }
      const products = normalizeCanonicalProducts(await response.json());
      if (!products.length) {
        failures.push(`${url}: catálogo vazio`);
        continue;
      }
      return { products, source: "canonical", url, warning: "" };
    } catch (error) {
      failures.push(`${url}: ${error?.message || "falha"}`);
    }
  }
  return {
    products: [],
    source: "unavailable",
    url: "",
    warning: `Não foi possível carregar os produtos canônicos ArtiSys. ${failures.join(" | ")}`.trim()
  };
}
