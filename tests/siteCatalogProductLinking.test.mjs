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

test('API administrativa expõe páginas canônicas e aceita linked_product_slug por grupo', () => {
  assert.match(wrapperSource, /fetchCanonicalProducts/);
  assert.match(wrapperSource, /\/api\/site-catalog\/linking/);
  assert.match(wrapperSource, /linked_product_slug/);
  assert.match(wrapperSource, /updateSiteCatalogGroup/);
});

test('vínculo é renderizado nativamente no formulário de cada produto agrupado', () => {
  assert.match(adminSource, /Página ArtiSys vinculada/);
  assert.match(adminSource, /linkedProductSlug/);
  assert.match(adminSource, /\/api\/site-catalog\/linking/);
  assert.match(adminSource, /renderGroupCard/);
  assert.match(adminSource, /Salvar vínculo/);
  assert.doesNotMatch(adminSource, /MutationObserver/);
  assert.doesNotMatch(adminHtml, /admin-site-catalog-linking\.js/);
});
