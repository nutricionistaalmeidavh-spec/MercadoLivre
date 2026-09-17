import assert from 'node:assert/strict';
import fs from 'node:fs';
import test from 'node:test';

const worker = fs.readFileSync('cloudflare/src/index.mjs','utf8');
const orders = fs.readFileSync('cloudflare/src/orders.mjs','utf8');
const promotions = fs.readFileSync('cloudflare/src/promotions.mjs','utf8');
const ui = fs.readFileSync('admin-operations.js','utf8');
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

test('promotions UI separates active campaigns from available opportunities', () => {
  assert.match(ui, /Promoções ativas/);
  assert.match(ui, /Oportunidades disponíveis/);
  assert.match(ui, /Campanha do vendedor/);
  assert.match(ui, /Desconto individual/);
  assert.match(ui, /Cupom do vendedor/);
  assert.match(ui, /promotionTypeLabel/);
  assert.match(ui, /promotionPriceMarkup/);
  assert.doesNotMatch(ui, /id="newDiscount"/);
});

test('operations asset is included in Cloudflare static assets', () => {
  assert.match(assets, /!admin-operations\.js/);
});
