import test from 'node:test';
import assert from 'node:assert/strict';
import { proxyLicenseCenterWrite } from '../cloudflare/src/license-center.mjs';

test('write proxy uses only write secret and preserves qa run header',async()=>{
  let captured,writes=0;
  const env={
    OBRA_LICENSE_CENTER_READ_SECRET:'read-secret',
    OBRA_LICENSE_CENTER_WRITE_SECRET:'write-secret',
    OBRA_LICENSING:{async fetch(request){
      if(new URL(request.url).pathname==='/api/internal/license-center/snapshot')return Response.json({adminParity:{contractVersion:1,requiredCapabilities:[]}});
      captured=request;writes+=1;return Response.json({ok:true});
    }}
  };
  const request=new Request('https://panel.test/api/license-center/obra/companies',{method:'POST',headers:{'content-type':'application/json','x-artisys-qa-run':'run-123','authorization':'Bearer browser-secret'},body:JSON.stringify({name:'QA'})});
  const response=await proxyLicenseCenterWrite(request,env,'/api/internal/license-center/obra/companies');
  assert.equal(response.status,200);
  assert.equal(writes,1);
  assert.equal(captured.headers.get('x-artisys-license-center-write-secret'),'write-secret');
  assert.equal(captured.headers.get('x-artisys-qa-run'),'run-123');
  assert.equal(captured.headers.get('x-artisys-license-center-secret'),null);
  assert.equal(captured.headers.get('authorization'),null);
});

test('write proxy fails closed before mutation when authority requires an unsupported admin capability',async()=>{
  let writes=0;
  const env={
    OBRA_LICENSE_CENTER_READ_SECRET:'read-secret',
    OBRA_LICENSE_CENTER_WRITE_SECRET:'write-secret',
    OBRA_LICENSING:{async fetch(request){
      if(new URL(request.url).pathname==='/api/internal/license-center/snapshot')return Response.json({adminParity:{contractVersion:2,requiredCapabilities:['obra.company.create','future.admin.capability']}});
      writes+=1;return Response.json({ok:true});
    }}
  };
  const request=new Request('https://panel.test/api/license-center/obra/companies',{method:'POST',headers:{'content-type':'application/json'},body:JSON.stringify({name:'Cliente'})});
  const response=await proxyLicenseCenterWrite(request,env,'/api/internal/license-center/obra/companies');
  assert.equal(response.status,409);
  assert.equal(writes,0);
  assert.deepEqual(await response.json(),{error:'admin_parity_incomplete',missing:['future.admin.capability']});
});
