import fs from 'node:fs/promises';
import http from 'node:http';
import path from 'node:path';
import { chromium } from 'playwright';

const root=process.cwd();
const outFile=path.join(root,'qa-artifacts','license-center-isolated','report.json');
const viewports=[{name:'desktop',width:1440,height:1000},{name:'tablet',width:900,height:1100},{name:'mobile',width:390,height:844}];
const required=['obra.company.read','obra.company.create','obra.company.update-license','obra.device.control','debora.license.manage','debora.observability.read','debora.manual-sales.manage','owner.license.audit','loja-online.company.read','loja-online.company.create','loja-online.license.update','loja-online.license.extend','loja-online.license.block'];

function snapshot(){return{generatedAt:new Date().toISOString(),adminParity:{contractVersion:1,requiredCapabilities:required},parity:{status:'complete',missing:[]},obra:{companies:[]},debora:{overview:{clients:0},clients:[]},lojaOnline:{available:true,companies:[],events:[]},audit:{events:[]}}}
function response(route,body,status=200){return route.fulfill({status,contentType:'application/json',body:JSON.stringify(body)})}
function id(prefix,seq){return `${prefix}-${seq}`}

const server=http.createServer(async(req,res)=>{
  const pathname=new URL(req.url,'http://127.0.0.1').pathname;
  const file=pathname==='/licenses'?path.join(root,'license-center.html'):pathname==='/license-center.js'?path.join(root,'license-center.js'):null;
  if(!file){res.writeHead(404);res.end('not found');return}
  try{const content=await fs.readFile(file);res.writeHead(200,{'content-type':file.endsWith('.js')?'text/javascript; charset=utf-8':'text/html; charset=utf-8','cache-control':'no-store'});res.end(content)}catch{res.writeHead(500);res.end('read error')}
});
await new Promise(resolve=>server.listen(0,'127.0.0.1',resolve));
const {port}=server.address();
const base=`http://127.0.0.1:${port}`;
let browser;const results=[];
try{
  browser=await chromium.launch({headless:true});
  for(const viewport of viewports){
    const data=snapshot();let seq=0,forcedError=null;const requests=[];
    const context=await browser.newContext({viewport:{width:viewport.width,height:viewport.height}});
    await context.addCookies([{name:'artisys_admin',value:'isolated-admin-fixture',url:base}]);
    const page=await context.newPage();
    page.on('dialog',dialog=>dialog.accept());
    await page.route('**/api/license-center**',async route=>{
      const request=route.request(),url=new URL(request.url()),pathname=url.pathname,method=request.method();
      let body={};try{body=request.postDataJSON()||{}}catch{}
      requests.push({method,pathname,body});
      if(forcedError){const current=forcedError;forcedError=null;return response(route,{error:current},current==='qa_scope_violation'?403:current==='write_disabled'?503:500)}
      if(pathname==='/api/license-center'&&method==='GET')return response(route,data);
      if(pathname==='/api/license-center/debora/observability/summary'&&method==='GET')return response(route,{accounts:{total:data.debora.clients.length},presence:{onlineNow:0},pro:{total:data.debora.clients.filter(item=>item.status==='active').length},sales:{paid:0,realizedRevenueCents:0}});
      if(pathname==='/api/license-center/debora/observability/users'&&method==='GET')return response(route,{items:[],hasMore:false,nextCursor:null});
      if(pathname==='/api/license-center/debora/observability/sales'&&method==='GET')return response(route,{items:[],hasMore:false,nextCursor:null});
      if(pathname==='/api/license-center/obra/companies'&&method==='POST'){
        seq++;const company={id:id('obra',seq),name:String(body.name),adminEmail:String(body.adminEmail),status:'active',license:{id:id('lic',seq),plan:body.plan||'custom',expiresAt:body.expiresAt,maxUsers:body.maxUsers,maxProjects:body.maxProjects,maxDevices:body.maxDevices},modules:body.modules||[],channels:body.channels||[],devices:[],devicesCount:0};data.obra.companies.push(company);data.audit.events.unshift({id:id('audit',seq),product:'obra-na-mao',email:company.adminEmail,action:'created',createdAt:new Date().toISOString()});return response(route,{company,license:company.license},201);
      }
      let match=pathname.match(/^\/api\/license-center\/obra\/companies\/([^/]+)$/);
      if(match&&method==='PUT'){const company=data.obra.companies.find(item=>item.id===decodeURIComponent(match[1]));if(!company)return response(route,{error:'not_found'},404);Object.assign(company.license,{plan:body.plan??company.license.plan,expiresAt:body.expiresAt??company.license.expiresAt,maxUsers:body.maxUsers??company.license.maxUsers,maxProjects:body.maxProjects??company.license.maxProjects,maxDevices:body.maxDevices??company.license.maxDevices});if(body.modules)company.modules=body.modules;if(body.channels)company.channels=body.channels;if(body.status==='suspended')company.status='suspended';if(body.status==='active')company.status='active';return response(route,{company,license:company.license});}
      if(pathname==='/api/license-center/debora/license'&&method==='POST'){
        const email=String(body.email||'').toLowerCase(),action=String(body.action||'status');let row=data.debora.clients.find(item=>item.email===email);
        if(action==='grant'){if(!body.sale?.acquisitionChannel||!body.sale?.paymentStatus)return response(route,{error:'missing_sale_metadata'},400);if(!row){row={email,status:'active',planCode:'pro_6m',expiresAt:'2027-03-25T00:00:00.000Z',source:'manual'};data.debora.clients.push(row)}else row.status='active';data.debora.overview.clients=data.debora.clients.length;return response(route,{state:'active',grant:row,sale:{id:id('sale',++seq),...body.sale}});}
        if(action==='revoke'){if(!row)return response(route,{error:'not_found'},404);row.status='revoked';return response(route,{state:'revoked',grant:row});}
        return response(route,{state:row?.status||'none',grant:row||null});
      }
      if(pathname==='/api/license-center/debora/manual-sales/classify'&&method==='POST')return response(route,{sale:{id:id('classified',++seq),email:body.email,...body.sale}});
      if(pathname==='/api/license-center/loja-online/companies'&&method==='POST'){
        seq++;const company={company:{id:id('loja',seq),name:String(body.companyName)},admin:{email:String(body.adminEmail)},license:{id:id('loja-lic',seq),plan:body.plan||'6_MONTHS',status:'ACTIVE',maxUsers:Number(body.maxUsers)||5,expiresAt:'2027-03-25T00:00:00.000Z'},accessStatus:'ACTIVE',accessible:true,userCount:1};data.lojaOnline.companies.push(company);return response(route,{company},201);
      }
      match=pathname.match(/^\/api\/license-center\/loja-online\/companies\/([^/]+)\/(license|extend|block|unblock)$/);
      if(match){const company=data.lojaOnline.companies.find(item=>item.company.id===decodeURIComponent(match[1]));if(!company)return response(route,{error:'not_found'},404);if(match[2]==='license'){company.license.plan=body.plan??company.license.plan;company.license.maxUsers=body.maxUsers??company.license.maxUsers;company.license.expiresAt=body.expiresAt??company.license.expiresAt}if(match[2]==='block'){company.accessStatus='BLOCKED';company.license.status='BLOCKED'}if(match[2]==='unblock'){company.accessStatus='ACTIVE';company.license.status='ACTIVE'}return response(route,{company});}
      return response(route,{error:`unhandled ${method} ${pathname}`},404);
    });

    await page.goto(`${base}/licenses`,{waitUntil:'domcontentloaded'});await page.locator('#obraCount').filter({hasText:'0'}).waitFor();
    const obra=page.locator('#obraCreateForm');await obra.locator('[name=name]').fill(`ARTISYS QA E2E isolated-${viewport.name}`);await obra.locator('[name=adminEmail]').fill(`qa-license-isolated-${viewport.name}@example.test`);await obra.locator('[name=modules]').fill('obra360,rdo');await obra.locator('[name=channels]').fill('mobile,desktop');await obra.locator('button[type=submit]').click();await page.getByText(`ARTISYS QA E2E isolated-${viewport.name}`,{exact:true}).waitFor();
    const createIndex=requests.findIndex(item=>item.method==='POST'&&item.pathname==='/api/license-center/obra/companies');if(createIndex<0||!requests.slice(createIndex+1).some(item=>item.method==='GET'&&item.pathname==='/api/license-center'))throw new Error(`${viewport.name}: obra mutation was not followed by canonical refetch`);

    const debora=page.locator('#deboraLicenseForm');await debora.locator('[name=email]').fill(`qa-license-debora-${viewport.name}@example.test`);await debora.locator('[name=acquisitionChannel]').selectOption('mercado_livre');await debora.locator('[name=paymentStatus]').selectOption('paid');await debora.locator('[name=amount]').fill('80,00');await debora.locator('[name=externalOrderRef]').fill(`MLB-QA-${viewport.name}`);await debora.locator('[data-debora-action=grant]').click();await page.getByText(`qa-license-debora-${viewport.name}@example.test`,{exact:true}).waitFor();
    const grantRequest=requests.find(item=>item.method==='POST'&&item.pathname==='/api/license-center/debora/license'&&item.body?.action==='grant');if(!grantRequest?.body?.sale?.acquisitionChannel||!grantRequest?.body?.sale?.paymentStatus)throw new Error(`${viewport.name}: Debora grant did not include explicit sale metadata`);
    const loja=page.locator('#lojaCreateForm');await loja.locator('[name=companyName]').fill(`ARTISYS QA E2E LOJA isolated-${viewport.name}`);await loja.locator('[name=adminName]').fill('QA Admin');await loja.locator('[name=adminEmail]').fill(`qa-license-loja-${viewport.name}@example.test`);await loja.locator('button[type=submit]').click();await page.getByText(`ARTISYS QA E2E LOJA isolated-${viewport.name}`,{exact:true}).waitFor();

    forcedError='qa_scope_violation';await page.locator('#obraTable button[data-action="obra-suspend"]').click();await page.locator('#status').filter({hasText:'qa_scope_violation'}).waitFor();
    forcedError='write_disabled';await page.locator('#obraTable button[data-action="obra-suspend"]').click();await page.locator('#status').filter({hasText:'write_disabled'}).waitFor();
    data.parity={status:'incomplete',missing:['future.admin.capability']};await page.reload({waitUntil:'domcontentloaded'});await page.locator('#parity').filter({hasText:'future.admin.capability'}).waitFor();if(await page.locator('[data-write]:not([disabled])').count())throw new Error(`${viewport.name}: writes remain enabled with missing parity`);
    results.push({viewport:viewport.name,status:'passed',requests:requests.length});await context.close();
  }
  const report={status:'passed',generatedAt:new Date().toISOString(),viewports:results,checks:['refetch','debora_sale_metadata','qa_scope_violation','write_disabled','parity']};await fs.mkdir(path.dirname(outFile),{recursive:true});await fs.writeFile(outFile,JSON.stringify(report,null,2)+'\n');console.log(`LICENSE_CENTER_ISOLATED_REPORT=${outFile}`);
}finally{if(browser)await browser.close().catch(()=>{});server.close()}
