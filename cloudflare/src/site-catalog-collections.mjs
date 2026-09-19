const DEFAULT_COLLECTIONS_URL = 'https://artisys.dev/sistemas/collections.json';
const FALLBACK_COLLECTIONS = [{ slug: 'agro', name: 'Agro' }];

function cleanSlug(value) {
  return String(value || '')
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-+|-+$/g, '')
    .slice(0, 100);
}

export function normalizeCanonicalCollections(source = {}) {
  const raw = Array.isArray(source) ? source : source.collections;
  if (!Array.isArray(raw)) return [];
  const seen = new Set();
  const output = [];
  for (const entry of raw) {
    const slug = cleanSlug(entry?.slug);
    if (!slug || seen.has(slug)) continue;
    seen.add(slug);
    output.push({
      slug,
      name: String(entry?.name || entry?.category || slug).trim() || slug,
      category: String(entry?.category || '').trim()
    });
  }
  return output;
}

export function canonicalCollectionSlugs(collections = []) {
  return new Set(normalizeCanonicalCollections(collections).map((collection) => collection.slug));
}

export async function fetchCanonicalCollections(env = {}, fetchImpl = fetch) {
  const url = String(env.ARTISYS_COLLECTIONS_URL || DEFAULT_COLLECTIONS_URL).trim();
  try {
    const response = await fetchImpl(url, {
      headers: { accept: 'application/json' },
      cf: { cacheTtl: 300, cacheEverything: true }
    });
    if (!response.ok) throw new Error(`HTTP ${response.status}`);
    const collections = normalizeCanonicalCollections(await response.json());
    if (!collections.length) throw new Error('Fonte canônica sem coleções publicadas.');
    return { collections, source: 'canonical', url };
  } catch (error) {
    return {
      collections: FALLBACK_COLLECTIONS.map((collection) => ({ ...collection, category: collection.name })),
      source: 'fallback',
      url,
      warning: error?.message || 'Falha ao consultar coleções canônicas.'
    };
  }
}
