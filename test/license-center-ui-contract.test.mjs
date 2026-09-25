import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';

test('license center exposes administrative actions and mandatory refetch',()=>{
  const html=fs.readFileSync('license-center.html','utf8');
  const script=fs.readFileSync('license-center.js','utf8');
  const assets=fs.readFileSync('.assetsignore','utf8');
  assert.match(html,/id="obraCreateForm"/);
  assert.match(html,/id="deboraLicenseForm"/);
  assert.match(html,/id="lojaCreateForm"/);
  assert.match(html,/src="\/license-center\.js"/);
  assert.match(script,/async function mutate/);
  assert.match(script,/await load\(\)/);
  assert.match(script,/\/api\/license-center\/obra\/companies/);
  assert.match(script,/\/api\/license-center\/debora\/license/);
  assert.match(script,/\/api\/license-center\/loja-online\/companies/);
  assert.match(script,/parity.*missing|missing.*parity/s);
  assert.match(assets,/!license-center\.js/);
});
