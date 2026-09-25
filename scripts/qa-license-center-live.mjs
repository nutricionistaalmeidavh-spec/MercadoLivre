import fs from 'node:fs/promises';
import path from 'node:path';
import crypto from 'node:crypto';
import { chromium } from 'playwright';

const CONFIRM='I_UNDERSTAND_THIS_WRITES_QA_RECORDS';
if(process.env.LICENSE_CENTER_LIVE_CONFIRM!==CONFIRM)throw new Error(`Refusing live QA. Set LICENSE_CENTER_LIVE_CONFIRM=${CONFIRM}`);
const panelBase=String(process.env.LICENSE_CENTER_PANEL_URL||'').replace(/\/$/,'');
const authorityBase=String(process.env.LICENSE_CENTER_AUTHORITY_URL||'').replace(/\/$/,'');
const adminPassword=String(process.env.LICENSE_CENTER_ADMIN_PASSWORD||'');
const readSecret=String(process.env.LICENSE_CENTER_READ_SECRET||'');
for(const[name,value]of Object.entries({LICENSE_CENTER_PANEL_URL:panelBase,LICENSE_CENTER_AUTHORITY_URL:authorityBase,LICENSE_CENTER_ADMIN_PASSWORD:adminPassword,LICENSE_CENTER_READ_SECRET:readSecret}))if(!value)throw new Error(`Missing ${name}`);

const stamp=new Date().toISOString().replace(/[-:TZ.]/g,'').slice(0,14),qaRunId=`${stamp}-${crypto.randomBytes(3).toString('hex')}`;
const qaEmail=`qa-license-${qaRunId}@example.test`,obraName=`ARTISYS QA E2E ${qaRunId}`,lojaName=`ARTISYS QA E2E LOJA ${qaRunId}`;
const baselineIds=new Set(),createdIds=new Set(),baselineEmails=new Set(),writeTargets=[];
let existingIdsTouched=0,browser,context,obraId=null,obraLicenseId=null,lojaId=null,lojaLicenseId=null,deboraCreated=false;
const checks=[];
const outDir=path.join(process.cwd(),'qa-artifacts','license-center-live',qaRunId),outFile=path.join(outDir,'report.json');

function assertWritableTarget(id){
  if(baselineIds.has(id)||!createdIds.has(id)){
    if(baselineIds.has(id))existingIdsTouched+=1;
    throw new Error(`unsafe_target:${id}`);
  }
  writeTargets.push(id);
}
function collectIds(snapshot){
  const ids=new Set();
  for(const company of snapshot.obra?.companies||[]){if(company.id)ids.add(String(company.id));if(company.license?.id)ids.add(String(company.license.id));}
  for(const row of snapshot.lojaOnline?.companies||[]){if(row.company?.id)ids.add(String(row.company.id));if(row.license?.id)ids.add(String(row.license.id));}
  return ids;
}
function findObra(snapshot){return(snapshot.obra?.companies||[]).find(row=>row.id===obraId)}
function findDebora(snapshot){return(snapshot.debora?.clients||[]).find(row=>String(row.email||'').toLowerCase()===qaEmail)}
function findLoja(snapshot){return(snapshot.lojaOnline?.companies||[]).find(row=>row.company?.id===lojaId)}
function assert(condition,message){if(!condition)throw new Error(message)}

async function authoritySnapshot(){
  const response=await fetch(`${authorityBase}/api/internal/license-center/snapshot`,{headers:{'x-artisys-license-center-secret':readSecret}});
  const payload=await response.json().catch(()=>({}));if(!response.ok)throw new Error(`authority_read_failed:${response.status}:${payload.message||payload.error||''}`);return payload;
}
async function panelSnapshot(){
  const response=await context.request.get(`${panelBase}/api/license-center`);const payload=await response.json().catch(()=>({}));if(!response.ok())throw new Error(`panel_read_failed:${response.status()}:${payload.message||payload.error||''}`);return payload;
}
async function panelWrite(pathname,method,payload,targetId=null){
  if(targetId)assertWritableTarget(targetId);
  const response=await context.request.fetch(`${panelBase}${pathname}`,{method,headers:{'x-artisys-qa-run':qaRunId,'content-type':'application/json'},data:payload||{}});
  const data=await response.json().catch(()=>({}));if(!response.ok())throw new Error(`write_failed:${method}:${pathname}:${response.status()}:${data.message||data.error||''}`);return data;
}
async function verifyBoth(label,predicate){
  const [panel,authority]=await Promise.all([panelSnapshot(),authoritySnapshot()]);
  assert(predicate(panel),`${label}:panel_mismatch`);assert(predicate(authority),`${label}:authority_mismatch`);checks.push({label,status:'passed'});return{panel,authority};
}
function addCreated(id){assert(id&&!baselineIds.has(String(id)),`created_id_collides_with_baseline:${id}`);createdIds.add(String(id));return String(id)}

async function login(){
  browser=await chromium.launch({headless:true});context=await browser.newContext();
  const response=await context.request.post(`${panelBase}/api/auth?op=login`,{data:{password:adminPassword}});if(!response.ok())throw new Error(`admin_login_failed:${response.status()}`);
  const page=await context.newPage();await page.goto(`${panelBase}/licenses`,{waitUntil:'domcontentloaded'});await page.locator('#status').waitFor({state:'visible'});checks.push({label:'admin-login-and-license-page',status:'passed'});await page.close();
}

async function captureBaseline(){
  const [panel,authority]=await Promise.all([panelSnapshot(),authoritySnapshot()]);
  for(const id of collectIds(authority))baselineIds.add(id);
  for(const row of authority.debora?.clients||[])baselineEmails.add(String(row.email||'').toLowerCase());
  assert(!baselineEmails.has(qaEmail),'qa_email_already_exists');
  assert(panel.parity?.status!=='incomplete',`ADMIN_PARITY_FAILURE:${(panel.parity?.missing||[]).join(',')}`);
  checks.push({label:'baseline-captured',status:'passed',ids:baselineIds.size});
}

async function runObra(){
  const created=await panelWrite('/api/license-center/obra/companies','POST',{name:obraName,adminEmail:qaEmail,plan:'qa-e2e',expiresAt:'2027-12-31',maxUsers:20,maxProjects:8,maxDevices:4,modules:['obra360','rdo'],channels:['mobile','desktop']});
  obraId=addCreated(created.company?.id);obraLicenseId=addCreated(created.license?.id);
  await verifyBoth('obra-create',snap=>{const row=findObra(snap);return row?.adminEmail===qaEmail&&row?.license?.id===obraLicenseId});
  await panelWrite(`/api/license-center/obra/companies/${encodeURIComponent(obraId)}`,'PUT',{maxUsers:25,maxProjects:9,maxDevices:5,modules:['obra360','rdo','finance'],channels:['mobile','desktop']},obraId);
  await verifyBoth('obra-update-limits-modules',snap=>{const row=findObra(snap);return row?.license?.maxUsers===25&&row?.license?.maxProjects===9&&row?.license?.maxDevices===5&&row?.modules?.includes('finance')});
  await panelWrite(`/api/license-center/obra/companies/${encodeURIComponent(obraId)}`,'PUT',{expiresAt:'2028-01-31'},obraId);
  await verifyBoth('obra-expiry',snap=>String(findObra(snap)?.license?.expiresAt||'').startsWith('2028-01-31'));
  await panelWrite(`/api/license-center/obra/companies/${encodeURIComponent(obraId)}`,'PUT',{status:'suspended'},obraId);
  await verifyBoth('obra-suspend',snap=>findObra(snap)?.license?.status==='revoked');
  await panelWrite(`/api/license-center/obra/companies/${encodeURIComponent(obraId)}`,'PUT',{status:'active'},obraId);
  await verifyBoth('obra-reactivate',snap=>findObra(snap)?.license?.status==='active');
  const authority=await authoritySnapshot();assert((authority.audit?.events||[]).some(event=>event.email===qaEmail),'obra_audit_missing');checks.push({label:'obra-audit',status:'passed'});
}

async function runDebora(){
  let result=await panelWrite('/api/license-center/debora/license','POST',{action:'grant',email:qaEmail});deboraCreated=true;
  let verified=await verifyBoth('debora-grant',snap=>findDebora(snap)?.status==='active');const firstExpiry=Date.parse(findDebora(verified.authority)?.expiresAt||'');
  result=await panelWrite('/api/license-center/debora/license','POST',{action:'grant',email:qaEmail});verified=await verifyBoth('debora-renew',snap=>findDebora(snap)?.status==='active');const secondExpiry=Date.parse(findDebora(verified.authority)?.expiresAt||'');assert(Number.isFinite(firstExpiry)&&Number.isFinite(secondExpiry)&&secondExpiry>firstExpiry,'debora_renewal_did_not_advance_expiry');
  await panelWrite('/api/license-center/debora/license','POST',{action:'revoke',email:qaEmail});await verifyBoth('debora-revoke',snap=>findDebora(snap)?.status==='revoked');
  await panelWrite('/api/license-center/debora/license','POST',{action:'grant',email:qaEmail});await verifyBoth('debora-reactivate',snap=>findDebora(snap)?.status==='active');
  const authority=await authoritySnapshot();assert((authority.audit?.events||[]).some(event=>event.product==='debora-lactacao'&&event.email===qaEmail),'debora_audit_missing');checks.push({label:'debora-audit',status:'passed'});
}

async function runLoja(){
  const created=await panelWrite('/api/license-center/loja-online/companies','POST',{companyName:lojaName,adminName:'QA E2E',adminEmail:qaEmail,months:6,maxUsers:5,plan:'6_MONTHS'});
  lojaId=addCreated(created.company?.id);lojaLicenseId=addCreated(created.license?.id);
  await verifyBoth('loja-create',snap=>{const row=findLoja(snap);return row?.company?.name===lojaName&&row?.admin?.email===qaEmail&&row?.accessStatus==='ACTIVE'});
  await panelWrite(`/api/license-center/loja-online/companies/${encodeURIComponent(lojaId)}/license`,'PUT',{plan:'QA_E2E',maxUsers:7},lojaId);await verifyBoth('loja-update',snap=>{const row=findLoja(snap);return row?.license?.plan==='QA_E2E'&&row?.license?.maxUsers===7});
  const before=Date.parse(findLoja(await authoritySnapshot())?.license?.expiresAt||'');await panelWrite(`/api/license-center/loja-online/companies/${encodeURIComponent(lojaId)}/extend`,'POST',{months:6},lojaId);const extended=await verifyBoth('loja-extend',snap=>Date.parse(findLoja(snap)?.license?.expiresAt||'')>before);
  await panelWrite(`/api/license-center/loja-online/companies/${encodeURIComponent(lojaId)}/block`,'POST',{reason:`QA ${qaRunId}`},lojaId);await verifyBoth('loja-block',snap=>findLoja(snap)?.accessStatus==='BLOCKED');
  await panelWrite(`/api/license-center/loja-online/companies/${encodeURIComponent(lojaId)}/unblock`,'POST',{},lojaId);await verifyBoth('loja-unblock',snap=>findLoja(snap)?.accessStatus==='ACTIVE');
  const authority=extended.authority;void authority;const current=await authoritySnapshot();assert((current.lojaOnline?.events||[]).some(event=>event.companyId===lojaId),'loja_audit_missing');checks.push({label:'loja-audit',status:'passed'});
}

async function cleanup(){
  const cleanup=[];
  if(obraId){try{assertWritableTarget(obraId);await panelWrite(`/api/license-center/obra/companies/${encodeURIComponent(obraId)}`,'PUT',{status:'suspended'});cleanup.push('final cleanup suspend obra')}catch(error){cleanup.push(`obra cleanup failed:${error.message}`)}}
  if(deboraCreated){try{await panelWrite('/api/license-center/debora/license','POST',{action:'revoke',email:qaEmail});cleanup.push('final cleanup revoke debora')}catch(error){cleanup.push(`debora cleanup failed:${error.message}`)}}
  if(lojaId){try{assertWritableTarget(lojaId);await panelWrite(`/api/license-center/loja-online/companies/${encodeURIComponent(lojaId)}/block`,'POST',{reason:`Final QA cleanup ${qaRunId}`});cleanup.push('final cleanup block loja')}catch(error){cleanup.push(`loja cleanup failed:${error.message}`)}}
  return cleanup;
}

let failure=null,cleanupResult=[];
try{
  await login();await captureBaseline();await runObra();await runDebora();await runLoja();
}catch(error){failure=error;
}finally{
  if(context)cleanupResult=await cleanup().catch(error=>[`cleanup_failed:${error.message}`]);
  let qaRecordsActive=0,baselineDrift=[];
  try{
    if(context){const final=await authoritySnapshot();const obra=findObra(final),debora=findDebora(final),loja=findLoja(final);if(obra&&obra.license?.status!=='revoked')qaRecordsActive++;if(debora&&debora.status!=='revoked')qaRecordsActive++;if(loja&&loja.accessStatus!=='BLOCKED')qaRecordsActive++;const finalIds=collectIds(final);for(const id of baselineIds)if(!finalIds.has(id))baselineDrift.push(`missing:${id}`);}
  }catch(error){failure=failure||error;qaRecordsActive+=1}
  const status=!failure&&existingIdsTouched===0&&qaRecordsActive===0?'passed':'failed';const report={status,qaRunId,generatedAt:new Date().toISOString(),existingIdsTouched,qaRecordsActive,createdIds:[...createdIds],writeTargets,baselineCount:baselineIds.size,baselineDrift,checks,cleanup:cleanupResult,error:failure?String(failure.message||failure):null};await fs.mkdir(outDir,{recursive:true});await fs.writeFile(outFile,JSON.stringify(report,null,2)+'\n');console.log(`LICENSE_CENTER_LIVE_REPORT=${outFile}`);if(browser)await browser.close().catch(()=>{});if(status!=='passed')process.exitCode=1;
}
