import { compareCapabilities } from "./license-center-capabilities.mjs";

function json(data, status = 200) {
  return new Response(JSON.stringify(data), {
    status,
    headers: { "content-type": "application/json; charset=utf-8", "cache-control": "no-store" }
  });
}

const INTERNAL_WRITE_PATTERNS=[
  /^\/api\/internal\/license-center\/obra\/companies$/,
  /^\/api\/internal\/license-center\/obra\/companies\/[^/]+$/,
  /^\/api\/internal\/license-center\/obra\/devices\/[^/]+$/,
  /^\/api\/internal\/license-center\/debora\/license$/,
  /^\/api\/internal\/license-center\/debora\/manual-sales\/classify$/,
  /^\/api\/internal\/license-center\/loja-online\/companies$/,
  /^\/api\/internal\/license-center\/loja-online\/companies\/[^/]+\/(license|extend|block|unblock)$/
];
const INTERNAL_READ_PATTERNS=[
  /^\/api\/internal\/license-center\/debora\/observability\/summary$/,
  /^\/api\/internal\/license-center\/debora\/observability\/users$/,
  /^\/api\/internal\/license-center\/debora\/observability\/sales$/,
  /^\/api\/internal\/license-center\/debora\/observability\/users\/[^/]+\/sessions$/,
  /^\/api\/internal\/license-center\/debora\/manual-sales$/,
  /^\/api\/internal\/license-center\/debora\/manual-sales\/summary$/
];

function allowedInternalTarget(path){return INTERNAL_WRITE_PATTERNS.some(pattern=>pattern.test(path));}
function allowedInternalReadTarget(path){return INTERNAL_READ_PATTERNS.some(pattern=>pattern.test(path));}

export async function fetchLicenseCenterSnapshot(env) {
  const binding = env.OBRA_LICENSING;
  const secret = String(env.OBRA_LICENSE_CENTER_READ_SECRET || "").trim();
  if (!binding?.fetch) throw new Error("OBRA_LICENSING não configurado.");
  if (!secret) throw new Error("OBRA_LICENSE_CENTER_READ_SECRET não configurado.");

  const request = new Request("https://obra.internal/api/internal/license-center/snapshot", {
    method: "GET",
    headers: { "x-artisys-license-center-secret": secret }
  });
  const response = await binding.fetch(request);
  const payload = await response.json().catch(() => ({}));
  if (!response.ok) {
    const error = new Error(payload?.message || payload?.error || "Falha ao consultar a Central de Licenças.");
    error.statusCode = response.status;
    throw error;
  }
  return {...payload,parity:compareCapabilities(payload?.adminParity?.requiredCapabilities||[])};
}

export async function proxyLicenseCenterRead(request,env,targetPath){
  const binding=env.OBRA_LICENSING;
  const secret=String(env.OBRA_LICENSE_CENTER_READ_SECRET||"").trim();
  if(request.method!=="GET")return json({error:"method_not_allowed"},405);
  if(!binding?.fetch)return json({error:"license_center_unavailable",message:"OBRA_LICENSING não configurado."},503);
  if(!secret)return json({error:"read_secret_missing",message:"OBRA_LICENSE_CENTER_READ_SECRET não configurado."},503);
  const target=new URL(`https://obra.internal${targetPath}`);
  if(!allowedInternalReadTarget(target.pathname))return json({error:"read_target_not_allowed"},404);
  const upstream=await binding.fetch(new Request(target,{method:"GET",headers:{"x-artisys-license-center-secret":secret}}));
  const payload=await upstream.json().catch(()=>({}));
  return json(payload,upstream.status);
}

export async function proxyLicenseCenterWrite(request,env,targetPath){
  const binding=env.OBRA_LICENSING;
  const secret=String(env.OBRA_LICENSE_CENTER_WRITE_SECRET||"").trim();
  if(!binding?.fetch)return json({error:"license_center_unavailable",message:"OBRA_LICENSING não configurado."},503);
  if(!secret)return json({error:"write_secret_missing",message:"OBRA_LICENSE_CENTER_WRITE_SECRET não configurado."},503);
  if(!allowedInternalTarget(targetPath))return json({error:"write_target_not_allowed"},404);

  let snapshot;
  try{
    snapshot=await fetchLicenseCenterSnapshot(env);
  }catch(error){
    return json({error:"license_center_unavailable",message:error?.message||"Não foi possível validar a paridade administrativa antes da escrita."},Number(error?.statusCode||503));
  }
  if(snapshot?.parity?.status==="incomplete"){
    return json({error:"admin_parity_incomplete",missing:snapshot.parity.missing||[]},409);
  }

  const headers=new Headers({"content-type":"application/json","x-artisys-license-center-write-secret":secret});
  const qaRun=String(request.headers.get("x-artisys-qa-run")||"").trim();
  if(qaRun)headers.set("x-artisys-qa-run",qaRun);
  const body=request.method==="GET"||request.method==="HEAD"?undefined:await request.text();
  const upstream=await binding.fetch(new Request(`https://obra.internal${targetPath}`,{method:request.method,headers,body}));
  const payload=await upstream.json().catch(()=>({}));
  return json(payload,upstream.status);
}

export async function handleLicenseCenterApi(request, env) {
  if (request.method !== "GET") return json({ error: "method_not_allowed" }, 405);
  try {
    return json(await fetchLicenseCenterSnapshot(env));
  } catch (error) {
    return json({ error: "license_center_unavailable", message: error?.message || "Central de Licenças indisponível." }, Number(error?.statusCode || 503));
  }
}

export async function serveLicenseCenterPage(request, env) {
  const url = new URL(request.url);
  const asset = await env.ASSETS.fetch(new Request(`${url.origin}/license-center.html`, request));
  if (!asset.ok) return asset;
  const headers = new Headers(asset.headers);
  headers.set("content-type", "text/html; charset=utf-8");
  headers.set("cache-control", "no-store, max-age=0");
  return new Response(await asset.text(), { status: 200, headers });
}
