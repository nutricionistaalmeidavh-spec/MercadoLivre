import test from 'node:test';
import assert from 'node:assert/strict';
import { proxyLicenseCenterWrite } from '../cloudflare/src/license-center.mjs';

test('write proxy uses only write secret and preserves qa run header',async()=>{
  let captured;
  const env={
    OBRA_LICENSE_CENTER_WRITE_SECRET:'write-secret',
    OBRA_LICENSING:{async fetch(request){captured=request;return Response.json({ok:true});}}
  };
  const request=new Request('https://panel.test/api/license-center/obra/companies',{method:'POST',headers:{'content-type':'application/json','x-artisys-qa-run':'run-123','authorization':'Bearer browser-secret'},body:JSON.stringify({name:'QA'})});
  const response=await proxyLicenseCenterWrite(request,env,'/api/internal/license-center/obra/companies');
  assert.equal(response.status,200);
  assert.equal(captured.headers.get('x-artisys-license-center-write-secret'),'write-secret');
  assert.equal(captured.headers.get('x-artisys-qa-run'),'run-123');
  assert.equal(captured.headers.get('x-artisys-license-center-secret'),null);
  assert.equal(captured.headers.get('authorization'),null);
});
