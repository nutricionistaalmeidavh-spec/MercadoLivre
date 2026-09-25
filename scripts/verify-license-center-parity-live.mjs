import { pathToFileURL } from 'node:url';
import { SUPPORTED_LICENSE_CENTER_CAPABILITIES } from '../cloudflare/src/license-center-capabilities.mjs';

export function evaluateLicenseCenterParity(snapshot){
  const contractVersion=Number(snapshot?.adminParity?.contractVersion||0);
  const required=Array.isArray(snapshot?.adminParity?.requiredCapabilities)?snapshot.adminParity.requiredCapabilities:[];
  const missing=required.filter(capability=>!SUPPORTED_LICENSE_CENTER_CAPABILITIES.has(capability)).sort();
  return{ok:missing.length===0,contractVersion,missing};
}

export async function verifyLicenseCenterParityLive({authorityUrl,readSecret,fetchImpl=fetch}={}){
  const base=String(authorityUrl||process.env.LICENSE_CENTER_AUTHORITY_URL||'').trim().replace(/\/$/,'');
  const secret=String(readSecret||process.env.LICENSE_CENTER_READ_SECRET||'').trim();
  if(!base)throw new Error('LICENSE_CENTER_AUTHORITY_URL ausente.');
  if(!secret)throw new Error('LICENSE_CENTER_READ_SECRET ausente.');
  const response=await fetchImpl(`${base}/api/internal/license-center/snapshot`,{headers:{'x-artisys-license-center-secret':secret}});
  const payload=await response.json().catch(()=>({}));
  if(!response.ok)throw new Error(`AUTHORITY_SNAPSHOT_FAILURE status=${response.status} error=${payload.message||payload.error||'unknown'}`);
  return evaluateLicenseCenterParity(payload);
}

async function main(){
  try{
    const result=await verifyLicenseCenterParityLive();
    if(!result.ok){
      console.error('ADMIN_PARITY_FAILURE');
      for(const capability of result.missing)console.error(`missing: ${capability}`);
      process.exitCode=1;
      return;
    }
    console.log(`ADMIN_PARITY_OK contractVersion=${result.contractVersion}`);
  }catch(error){
    console.error('ADMIN_PARITY_FAILURE');
    console.error(`error: ${error?.message||String(error)}`);
    process.exitCode=1;
  }
}

if(process.argv[1]&&pathToFileURL(process.argv[1]).href===import.meta.url)await main();
