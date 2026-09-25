import test from 'node:test';
import assert from 'node:assert/strict';
import { evaluateLicenseCenterParity } from '../scripts/verify-license-center-parity-live.mjs';

test('live parity verifier fails when authority requires unsupported capability',()=>{
  assert.deepEqual(evaluateLicenseCenterParity({adminParity:{contractVersion:3,requiredCapabilities:['obra.company.create','future.admin.capability']}}),{
    ok:false,contractVersion:3,missing:['future.admin.capability']
  });
});

test('live parity verifier passes when every required capability is supported',()=>{
  assert.deepEqual(evaluateLicenseCenterParity({adminParity:{contractVersion:1,requiredCapabilities:['obra.company.create','debora.license.manage']}}),{
    ok:true,contractVersion:1,missing:[]
  });
});
