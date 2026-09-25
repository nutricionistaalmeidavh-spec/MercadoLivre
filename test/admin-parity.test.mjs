import test from 'node:test';
import assert from 'node:assert/strict';
import { SUPPORTED_LICENSE_CENTER_CAPABILITIES, compareCapabilities } from '../cloudflare/src/license-center-capabilities.mjs';

test('capability comparison reports missing authority requirements',()=>{
  assert.deepEqual(compareCapabilities(['obra.company.create','debora.license.manage'],new Set(['obra.company.create'])),{status:'incomplete',missing:['debora.license.manage']});
});

test('general panel declares the approved license-center capabilities explicitly',()=>{
  for(const id of [
    'obra.company.create','obra.company.update-license','debora.license.manage',
    'debora.observability.read','debora.manual-sales.manage','loja-online.license.update'
  ])assert.equal(SUPPORTED_LICENSE_CENTER_CAPABILITIES.has(id),true,id);
});
