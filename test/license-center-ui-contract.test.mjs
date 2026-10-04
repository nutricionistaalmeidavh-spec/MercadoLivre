import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';

test('license center exposes administrative actions, Debora observability, partners and mandatory refetch',()=>{
  const html=fs.readFileSync('license-center.html','utf8');
  const script=fs.readFileSync('license-center.js','utf8');
  const assets=fs.readFileSync('.assetsignore','utf8');
  assert.match(html,/id="obraCreateForm"/);
  assert.match(html,/id="deboraLicenseForm"/);
  assert.match(html,/name="acquisitionChannel"/);
  assert.match(html,/name="paymentStatus"/);
  assert.match(html,/name="amount"/);
  assert.match(html,/name="externalOrderRef"/);
  assert.match(html,/id="deboraObservabilityStatus"/);
  assert.match(html,/id="deboraUsersTable"/);
  assert.match(html,/id="deboraSalesTable"/);
  assert.match(html,/id="deboraActivity"/);
  assert.match(html,/id="deboraPartnerForm"/);
  assert.match(html,/name="discountType"/);
  assert.match(html,/name="discountValue"/);
  assert.match(html,/id="deboraPartnersTable"/);
  assert.match(html,/id="deboraPartnerSalesTable"/);
  assert.match(html,/id="lojaCreateForm"/);
  assert.match(html,/src="\/license-center\.js"/);
  assert.match(script,/parityComplete:false/);
  assert.match(script,/async function mutate/);
  assert.match(script,/await load\(\)/);
  assert.match(script,/\/api\/license-center\/obra\/companies/);
  assert.match(script,/\/api\/license-center\/debora\/license/);
  assert.match(script,/\/api\/license-center\/debora\/observability\/summary/);
  assert.match(script,/\/api\/license-center\/debora\/observability\/users/);
  assert.match(script,/\/api\/license-center\/debora\/observability\/sales/);
  assert.match(script,/\/api\/license-center\/debora\/manual-sales\/classify/);
  assert.match(script,/\/api\/license-center\/debora\/partners/);
  assert.match(script,/\/api\/license-center\/debora\/partner-sales/);
  assert.match(script,/\/api\/license-center\/debora\/partner-commission/);
  assert.match(script,/\/api\/license-center\/loja-online\/companies/);
  assert.match(script,/parity.*missing|missing.*parity/s);
  assert.match(assets,/!license-center\.js/);
});

test('license center is mobile-first with collapsible product and action panels',()=>{
  const html=fs.readFileSync('license-center.html','utf8');
  const ui=fs.readFileSync('license-center-ui.js','utf8');
  const assets=fs.readFileSync('.assetsignore','utf8');

  assert.match(html,/class="breadcrumbs"/);
  assert.match(html,/class="section-nav"/);
  assert.match(html,/href="#obra-na-mao"/);
  assert.match(html,/href="#debora-lactacao"/);
  assert.match(html,/href="#loja-online"/);
  assert.match(html,/href="#auditoria"/);

  assert.match(html,/<details[^>]+id="obra-na-mao"[^>]+class="[^"]*panel product-panel[^"]*"/);
  assert.match(html,/<details[^>]+id="debora-lactacao"[^>]+class="[^"]*panel product-panel[^"]*"/);
  assert.match(html,/<details[^>]+id="loja-online"[^>]+class="[^"]*panel product-panel[^"]*"/);
  assert.match(html,/<details[^>]+id="auditoria"[^>]+class="[^"]*panel product-panel[^"]*"/);
  assert.match(html,/class="product-summary"/);

  assert.match(html,/id="obraCreateDetails"[^>]*class="action-panel"/);
  assert.match(html,/id="deboraLicenseDetails"[^>]*class="action-panel"/);
  assert.match(html,/id="deboraPartnerDetails"[^>]*class="action-panel"/);
  assert.match(html,/id="lojaCreateDetails"[^>]*class="action-panel"/);

  assert.match(html,/\.desktop-table\{display:none\}/);
  assert.match(html,/\.mobile-records\{display:grid[^}]*\}/);
  assert.match(html,/@media\(min-width:701px\)[\s\S]*\.desktop-table\{display:block\}[\s\S]*\.mobile-records(?:,\.audit-timeline)?\{display:none\}/);
  assert.match(html,/src="\/license-center-ui\.js"/);
  assert.match(ui,/className='mobile-records'/);
  assert.match(ui,/function buildAuditTimeline/);
  assert.match(ui,/className='audit-timeline'/);
  assert.match(html,/\.audit-timeline\{display:grid/);
  assert.match(ui,/function openPanelFor/);
  assert.match(ui,/openPanelFor\(form\)/);
  assert.match(assets,/!license-center-ui\.js/);
});


test('redesign preserves the existing license-center integration contract',()=>{
  const html=fs.readFileSync('license-center.html','utf8');
  const script=fs.readFileSync('license-center.js','utf8');
  const ui=fs.readFileSync('license-center-ui.js','utf8');

  const requiredIds=[
    'status','parity','obraCount','deboraCount','lojaCount','auditCount',
    'obraCreateForm','obraTable','deboraLicenseForm','deboraTable',
    'deboraObservabilityStatus','deboraUsersTable','deboraUsersPrev','deboraUsersNext',
    'deboraActivity','deboraSalesTable','deboraSalesPrev','deboraSalesNext',
    'deboraPartnersStatus','deboraPartnerForm','deboraPartnerReset','deboraPartnersTable',
    'deboraPartnerSummary','deboraPartnerSalesTable','lojaCreateForm','lojaTable',
    'auditTable','generatedAt'
  ];
  for(const id of requiredIds)assert.match(html,new RegExp(`id=["']${id}["']`),`missing preserved DOM id: ${id}`);

  const actions=[
    'obra-edit','obra-suspend','obra-reactivate','obra-device',
    'debora-prepare-grant','debora-revoke','debora-activity','debora-classify',
    'debora-partner-edit','debora-commission-approve',
    'loja-edit','loja-extend','loja-block','loja-unblock'
  ];
  for(const action of actions)assert.match(script,new RegExp(`action===['"]${action}['"]`),`missing preserved handler: ${action}`);

  const endpoints=[
    '/api/license-center',
    '/api/license-center/obra/companies',
    '/api/license-center/debora/license',
    '/api/license-center/debora/observability/summary',
    '/api/license-center/debora/partners',
    '/api/license-center/debora/partner-sales',
    '/api/license-center/loja-online/companies'
  ];
  for(const endpoint of endpoints)assert.ok(script.includes(endpoint),`missing preserved endpoint: ${endpoint}`);

  assert.match(html,/aria-label="Breadcrumb"/);
  assert.match(html,/href="\/admin\?view=mais"/);
  assert.doesNotMatch(ui,/fetch\s*\(/);
  assert.doesNotMatch(ui,/\/api\/license-center/);
});
