import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';

test('live license center e2e is baseline-protected and explicit opt-in',()=>{
  const source=fs.readFileSync('scripts/qa-license-center-live.mjs','utf8');
  assert.match(source,/baselineIds/);
  assert.match(source,/createdIds/);
  assert.match(source,/baselineFingerprints/);
  assert.match(source,/administrativeFingerprints/);
  assert.match(source,/function assertWritableTarget\(id\)/);
  assert.match(source,/baselineIds\.has\(id\).*createdIds\.has\(id\)/s);
  assert.match(source,/LICENSE_CENTER_LIVE_CONFIRM/);
  assert.match(source,/I_UNDERSTAND_THIS_WRITES_QA_RECORDS/);
  assert.match(source,/x-artisys-license-center-secret/);
  assert.match(source,/x-artisys-qa-run/);
  assert.match(source,/existingIdsTouched/);
  assert.match(source,/qaRecordsActive/);
  assert.match(source,/baselineDrift/);
  assert.match(source,/debora-renew-exact-six-calendar-months/);
  assert.match(source,/skipped_safe_no_qa_device/);
  assert.match(source,/findObraByIdentity/);
  assert.match(source,/findLojaByIdentity/);
  assert.match(source,/final.*suspend|cleanup.*suspend|status:'suspended'/s);
  assert.match(source,/final.*revoke|cleanup.*revoke|action:'revoke'/s);
  assert.match(source,/final.*block|cleanup.*block|\/block/s);
  assert.doesNotMatch(source,/for\s*\([^)]*baselineIds[^)]*\)\s*\{[^}]*\b(put|post|mutate|write)\b/is);
});
