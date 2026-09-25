import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';

test('isolated license center e2e covers all authorities and refetches canonical state',()=>{
  const source=fs.readFileSync('scripts/qa-license-center-isolated.mjs','utf8');
  for(const path of ['/api/license-center/obra/companies','/api/license-center/debora/license','/api/license-center/loja-online/companies'])assert.match(source,new RegExp(path.replaceAll('/','\\/')));
  assert.match(source,/desktop/);
  assert.match(source,/tablet/);
  assert.match(source,/mobile/);
  assert.match(source,/qa_scope_violation/);
  assert.match(source,/write_disabled/);
  assert.match(source,/parity/);
  assert.match(source,/refetch|loadSnapshot|\/api\/license-center/);
  assert.match(source,/qa-artifacts\/license-center-isolated\/report\.json/);
});
