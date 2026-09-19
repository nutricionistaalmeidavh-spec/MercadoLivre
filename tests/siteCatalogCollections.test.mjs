import assert from 'node:assert/strict';
import fs from 'node:fs';
import test from 'node:test';
import {
  normalizeCanonicalCollections,
  normalizeCatalogDecision
} from '../cloudflare/src/site-catalog.mjs';

test('descobre coleções publicadas a partir da fonte canônica ArtiSys', () => {
  const collections = normalizeCanonicalCollections({
    collections: [
      { slug: 'agro', name: 'Sistemas ArtiSys para o Agro' },
      { slug: 'negocios', name: 'Sistemas ArtiSys para Negócios' },
      { slug: 'saude', name: 'Sistemas ArtiSys para Saúde' }
    ]
  });
  assert.deepEqual(collections.map((item) => item.slug), ['agro', 'negocios', 'saude']);
});

test('aprovação de coleção usa a lista descoberta e não um allowlist fixo', () => {
  const live = new Set(['agro', 'negocios', 'saude']);
  const decision = normalizeCatalogDecision({
    item_id: 'MLB200',
    approved: true,
    site_visibility: 'collection',
    collection_slug: 'negocios',
    site_name: 'Sistema de Negócios'
  }, live);
  assert.equal(decision.approved, true);
  assert.equal(decision.collectionSlug, 'negocios');
});

test('coleção fora da fonte canônica continua fail-closed', () => {
  const decision = normalizeCatalogDecision({
    item_id: 'MLB201',
    approved: true,
    site_visibility: 'collection',
    collection_slug: 'nao-publicada'
  }, new Set(['agro', 'negocios', 'saude']));
  assert.equal(decision.approved, false);
});

test('painel consome coleções devolvidas pela API em vez de allowlist fixa', () => {
  const admin = fs.readFileSync('admin-site-catalog.js', 'utf8');
  assert.match(admin, /data\.collections/);
  assert.doesNotMatch(admin, /const LIVE_COLLECTIONS = new Set\(\['agro'\]\)/);
});
