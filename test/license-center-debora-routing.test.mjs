import test from 'node:test';
import assert from 'node:assert/strict';
import { licenseCenterReadTarget, licenseCenterWriteTarget } from '../cloudflare/src/general-panel-index.mjs';

test('maps Debora observability and partner reads to the Obra internal bridge',()=>{
  assert.equal(licenseCenterReadTarget('/api/license-center/debora/observability/summary','GET',''),'/api/internal/license-center/debora/observability/summary');
  assert.equal(licenseCenterReadTarget('/api/license-center/debora/observability/users','GET','?limit=25&search=client'),'/api/internal/license-center/debora/observability/users?limit=25&search=client');
  assert.equal(licenseCenterReadTarget('/api/license-center/debora/observability/sales','GET','?limit=10&channel=asaas'),'/api/internal/license-center/debora/observability/sales?limit=10&channel=asaas');
  assert.equal(licenseCenterReadTarget('/api/license-center/debora/observability/users/u%201/sessions','GET','?limit=5'),'/api/internal/license-center/debora/observability/users/u%201/sessions?limit=5');
  assert.equal(licenseCenterReadTarget('/api/license-center/debora/manual-sales','GET','?limit=20'),'/api/internal/license-center/debora/manual-sales?limit=20');
  assert.equal(licenseCenterReadTarget('/api/license-center/debora/manual-sales/summary','GET',''),'/api/internal/license-center/debora/manual-sales/summary');
  assert.equal(licenseCenterReadTarget('/api/license-center/debora/partners','GET',''),'/api/internal/license-center/debora/partners');
  assert.equal(licenseCenterReadTarget('/api/license-center/debora/partner-sales','GET','?partnerId=p1'),'/api/internal/license-center/debora/partner-sales?partnerId=p1');
});

test('maps Debora license, manual-sale and partner writes to guarded write routes',()=>{
  assert.equal(licenseCenterWriteTarget('/api/license-center/debora/manual-sales/classify','POST'),'/api/internal/license-center/debora/manual-sales/classify');
  assert.equal(licenseCenterWriteTarget('/api/license-center/debora/license','POST'),'/api/internal/license-center/debora/license');
  assert.equal(licenseCenterWriteTarget('/api/license-center/debora/partners','POST'),'/api/internal/license-center/debora/partners');
  assert.equal(licenseCenterWriteTarget('/api/license-center/debora/partner-commission','POST'),'/api/internal/license-center/debora/partner-commission');
});
