import assert from 'node:assert/strict';
import fs from 'node:fs';
import test from 'node:test';

const worker = fs.readFileSync('cloudflare/src/index.mjs','utf8');
const orders = fs.readFileSync('cloudflare/src/orders.mjs','utf8');
const promotions = fs.readFileSync('cloudflare/src/promotions.mjs','utf8');
const ui = fs.readFileSync('admin-operations.js','utf8');
const postSaleUi = fs.readFileSync('admin-post-sale-templates.js','utf8');
const promoUi = fs.readFileSync('admin-promotions-clarity.js','utf8');
const assets = fs.readFileSync('.assetsignore','utf8');

test('worker exposes admin-only orders and promotions routes', () => {
  assert.match(worker, /url\.pathname === "\/api\/orders"/);
  assert.match(worker, /url\.pathname === "\/api\/promotions"/);
  assert.match(worker, /requireAdmin\(request, env\)/);
  assert.match(worker, /admin-operations\.js/);
});

test('orders API uses seller-scoped Mercado Livre search and detail', () => {
  assert.match(orders, /\/orders\/search\?\$\{query\}/);
  assert.match(orders, /seller: String\(sellerId\)/);
  assert.match(orders, /\/orders\/\$\{encodeURIComponent\(orderId\)\}/);
  assert.match(orders, /automation_runs/);
  assert.match(orders, /message_attempts/);
});

test('promotion mutations are confirmation-gated and limited to price discount', () => {
  assert.match(promotions, /body\.confirm !== true/);
  assert.match(promotions, /promotionType !== "PRICE_DISCOUNT"/);
  assert.match(promotions, /days > 14/);
  assert.match(promotions, /discount < 5 \|\| discount >= 80/);
  assert.match(promotions, /method: "DELETE"/);
});

test('mobile operations UI avoids browser-native confirmation dialogs', () => {
  assert.doesNotMatch(ui, /\bconfirm\s*\(/);
  assert.doesNotMatch(ui, /\balert\s*\(/);
  assert.doesNotMatch(ui, /\bprompt\s*\(/);
  assert.match(ui, /role="dialog"/);
  assert.match(ui, /aria-modal="true"/);
  assert.match(ui, /data-order-id/);
  assert.match(ui, /PRICE_DISCOUNT/);
});

test('promotions are rendered directly with business labels and grouped states', () => {
  assert.match(ui, /PROMOTION_TYPE_LABELS/);
  assert.match(ui, /Campanha do vendedor/);
  assert.match(ui, /Desconto individual/);
  assert.match(ui, /Cupom do vendedor/);
  assert.match(ui, /Promoções ativas/);
  assert.match(ui, /Programadas/);
  assert.match(ui, /Oportunidades disponíveis/);
  assert.match(ui, /Encerradas/);
  assert.match(ui, /Sem preço definido/);
  assert.match(ui, /data-promo-direct="1"/);
  assert.doesNotMatch(ui, /id="newDiscount"/);
});

test('legacy promotions clarity layer yields to direct renderer', () => {
  assert.doesNotMatch(promoUi, /observer\.observe\(document\.body/);
  assert.match(promoUi, /dataset\.promoDirect === '1'/);
});

test('admin inlines promotions clarity bundle and does not load it externally', () => {
  assert.match(worker, /ADMIN_OPERATIONS_VERSION = "1\.6\.4"/);
  assert.match(worker, /admin-promotions-clarity\.js/);
  assert.match(worker, /promotionsClarityScript/);
  assert.match(worker, /data-artisys-promotions-clarity-build/);
  assert.doesNotMatch(postSaleUi, /script\.src\s*=\s*['"]\/admin-promotions-clarity\.js/);
});

test('operations assets are included in Cloudflare static assets', () => {
  assert.match(assets, /!admin-operations\.js/);
  assert.match(assets, /!admin-promotions-clarity\.js/);
});
