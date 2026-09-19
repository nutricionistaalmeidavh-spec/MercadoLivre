import assert from 'node:assert/strict';
import fs from 'node:fs';
import test from 'node:test';

const productsModule = await import('../cloudflare/src/site-catalog-products.mjs');
const siteCatalogSource = fs.readFileSync('cloudflare/src/site-catalog.mjs', 'utf8');
const adminSource = fs.readFileSync('admin-site-catalog.js', 'utf8');

test('grupo pode ser vinculado manualmente a uma página canônica como NutriDesk', () => {
  assert.equal(typeof productsModule.linkGroupToCanonicalProduct, 'function');
  const linked = productsModule.linkGroupToCanonicalProduct(
    { site_name: 'Grupo antigo', site_slug: 'grupo-antigo', site_visibility: 'individual', collection_slug: '' },
    'nutridesk',
    [
      { slug: 'nutridesk', name: 'NutriDesk', category: 'Saúde', pageMode: 'individual', collections: [] }
    ],
    [
      { slug: 'saude', name: 'Sistemas ArtiSys para Saúde', categories: ['Saúde'] }
    ]
  );
  assert.equal(linked.site_name, 'NutriDesk');
  assert.equal(linked.site_slug, 'nutridesk');
  assert.equal(linked.site_visibility, 'individual');
  assert.equal(linked.collection_slug, 'saude');
});

test('API administrativa expõe produtos canônicos e aceita linked_product_slug no grupo', () => {
  assert.match(siteCatalogSource, /fetchCanonicalProducts/);
  assert.match(siteCatalogSource, /products:\s*canonicalProducts\.products/);
  assert.match(siteCatalogSource, /linked_product_slug/);
});

test('painel oferece seletor Página ArtiSys vinculada para grupos', () => {
  assert.match(adminSource, /Página ArtiSys vinculada/);
  assert.match(adminSource, /canonicalProducts/);
  assert.match(adminSource, /linked_product_slug/);
});
