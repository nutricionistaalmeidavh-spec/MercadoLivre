import assert from 'node:assert/strict';
import fs from 'node:fs';
import test from 'node:test';

const productsModule = await import('../cloudflare/src/site-catalog-products.mjs');
const wrapperSource = fs.readFileSync('cloudflare/src/site-catalog-index.mjs', 'utf8');
const adminSource = fs.readFileSync('admin-site-catalog.js', 'utf8');
const adminHtml = fs.readFileSync('admin-site-catalog.html', 'utf8');

test('grupo pode ser vinculado manualmente a uma página canônica como NutriDesk', () => {
  assert.equal(typeof productsModule.linkGroupToCanonicalProduct, 'function');
  const linked = productsModule.linkGroupToCanonicalProduct(
    { site_name: 'Grupo antigo', site_slug: 'grupo-antigo', site_visibility: 'individual', collection_slug: '' },
    'nutridesk',
    [{ slug: 'nutridesk', name: 'NutriDesk', category: 'Saúde', pageMode: 'individual', collections: [] }],
    [{ slug: 'saude', name: 'Sistemas ArtiSys para Saúde', categories: ['Saúde'] }]
  );
  assert.equal(linked.site_name, 'NutriDesk');
  assert.equal(linked.site_slug, 'nutridesk');
  assert.equal(linked.site_visibility, 'individual');
  assert.equal(linked.collection_slug, 'saude');
});

test('anúncio individual pode ser vinculado manualmente a uma página canônica', () => {
  assert.equal(typeof productsModule.linkDecisionToCanonicalProduct, 'function');
  const linked = productsModule.linkDecisionToCanonicalProduct(
    {
      item_id: 'MLB123',
      approved: false,
      site_name: 'Título antigo',
      site_slug: '',
      site_visibility: 'hidden',
      collection_slug: '',
      featured: true,
      price_mode: 'marketplace',
      hero_picture_url: 'https://example.com/capa.jpg'
    },
    'nutridesk',
    [{ slug: 'nutridesk', name: 'NutriDesk', category: 'Saúde', pageMode: 'individual', collections: [] }],
    [{ slug: 'saude', name: 'Sistemas ArtiSys para Saúde', categories: ['Saúde'] }]
  );
  assert.equal(linked.item_id, 'MLB123');
  assert.equal(linked.site_name, 'NutriDesk');
  assert.equal(linked.site_slug, 'nutridesk');
  assert.equal(linked.site_visibility, 'individual');
  assert.equal(linked.collection_slug, 'saude');
  assert.equal(linked.featured, true);
  assert.equal(linked.hero_picture_url, 'https://example.com/capa.jpg');
});

test('API administrativa expõe páginas canônicas e aceita linked_product_slug por grupo', () => {
  assert.match(wrapperSource, /fetchCanonicalProducts/);
  assert.match(wrapperSource, /\/api\/site-catalog\/linking/);
  assert.match(wrapperSource, /linked_product_slug/);
  assert.match(wrapperSource, /updateSiteCatalogGroup/);
});

test('API de vínculo aceita item_id e persiste decisão individual', () => {
  assert.match(wrapperSource, /item_id/);
  assert.match(wrapperSource, /upsertSiteCatalogDecision/);
  assert.match(wrapperSource, /linkDecisionToCanonicalProduct/);
  assert.match(wrapperSource, /items\s*:/);
});

test('vínculo é renderizado nativamente no formulário de cada produto agrupado', () => {
  assert.match(adminSource, /Página ArtiSys vinculada/);
  assert.match(adminSource, /linkedProductSlug/);
  assert.match(adminSource, /\/api\/site-catalog\/linking/);
  assert.match(adminSource, /renderGroupCard/);
  assert.match(adminSource, /artisys-link-row/);
  assert.match(adminSource, /Salvar vínculo/);
  assert.doesNotMatch(adminSource, /MutationObserver/);
  assert.doesNotMatch(adminHtml, /admin-site-catalog-linking\.js/);
});

test('vínculo é renderizado também no formulário de anúncio individual', () => {
  const itemStart = adminSource.indexOf('function renderItemCard');
  const groupStart = adminSource.indexOf('function renderGroupCard');
  assert.ok(itemStart >= 0 && groupStart > itemStart, 'renderItemCard precisa existir antes de renderGroupCard');
  const itemRenderer = adminSource.slice(itemStart, groupStart);
  assert.match(itemRenderer, /appendArtisysLinking/);
  assert.match(itemRenderer, /item_id/);
  assert.match(adminSource, /Página ArtiSys vinculada/);
});
