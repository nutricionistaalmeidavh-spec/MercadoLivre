import {fetchOrder} from './mercadolivre.mjs';

const allowedSku=/^[A-Z0-9][A-Z0-9_-]{1,90}$/;
const validEmail=(v)=>/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(String(v||''))&&String(v).length<=254;
const isObj=(v)=>Boolean(v)&&typeof v==='object'&&!Array.isArray(v);

export function commerceOrderPayload(order,sellerId,itemSkus,buyerEmail){
  if(order.sellerId!==String(sellerId))return {error:'wrong_seller'};
  if(order.status==='cancelled'||order.cancelled||order.fraudRisk||order.paymentRejected||
     order.status!=='paid'||order.paymentApproved!==true)return {error:'payment_not_eligible'};
  if(!validEmail(buyerEmail))return {error:'buyer_email_not_verified'};
  const lines=[];
  for(const line of Array.isArray(order.raw?.order_items)?order.raw.order_items:[]){
    const itemId=String(line?.item?.id||'');
    const sku=String(itemSkus[itemId]||'').toUpperCase();
    const quantity=Number(line?.quantity);
    if(!allowedSku.test(sku)||!Number.isSafeInteger(quantity)||quantity<1||quantity>20)continue;
    lines.push({id:itemId,sku,quantity});
  }
  if(!lines.length)return {error:'no_mapped_software_items'};
  return {source:'mercadolivre',seller:String(sellerId),externalOrderId:order.orderId,
    eventId:'ml-paid-'+String(sellerId)+'-'+order.orderId,event:'paid',paymentConfirmed:true,
    email:String(buyerEmail).trim().toLowerCase(),name:String(order.buyerFirstName||'').slice(0,160),
    currency:String(order.raw?.currency_id||'BRL'),lines};
}
async function hmac(secret,body){
  const key=await crypto.subtle.importKey('raw',new TextEncoder().encode(secret),{name:'HMAC',hash:'SHA-256'},false,['sign']);
  const signed=await crypto.subtle.sign('HMAC',key,new TextEncoder().encode(body));
  return [...new Uint8Array(signed)].map(n=>n.toString(16).padStart(2,'0')).join('');
}
export async function syncCommerceOrder(env,request,sellerId){
  if(request.method!=='POST')return {status:405,error:'method_not_allowed'};
  const url=String(env.ARTISYS_COMMERCE_URL||'').trim();
  const secret=String(env.ARTISYS_COMMERCE_SECRET||'');
  if(!url||secret.length<32)return {status:503,error:'commerce_bridge_not_configured'};
  let target;
  try{target=new URL('/v1/ingest/mercadolivre',url)}catch{return {status:503,error:'invalid_commerce_url'}}
  if(target.protocol!=='https:'||target.username||target.password||target.hash)return {status:503,error:'commerce_https_required'};
  let skuMap;
  try{skuMap=JSON.parse(String(env.ARTISYS_COMMERCE_ITEM_SKUS_JSON||'{}'))}
  catch{return {status:503,error:'invalid_item_sku_mapping'}}
  if(!isObj(skuMap)||Object.keys(skuMap).length===0)return {status:503,error:'item_sku_mapping_not_configured'};
  const data=await request.json().catch(()=>null);
  if(!isObj(data)||!/^\d{6,20}$/.test(String(data.order_id||'')))return {status:422,error:'invalid_order_id'};
  const order=await fetchOrder(env,String(data.order_id),sellerId);
  const apiEmail=String(order.raw?.buyer?.email||'').trim().toLowerCase();
  const supplied=String(data.buyer_email||'').trim().toLowerCase();
  if(apiEmail&&supplied&&apiEmail!==supplied)return {status:422,error:'buyer_email_conflict'};
  // Buyer email may be unavailable in Mercado Livre. Manual entry requires an explicit
  // authenticated seller verification, never infer email from name or nickname.
  if(!apiEmail&&(data.email_verified!==true||!supplied))return {status:422,error:'buyer_email_verification_required'};
  const payload=commerceOrderPayload(order,sellerId,skuMap,apiEmail||supplied);
  if(payload.error)return {status:409,error:payload.error};
  const raw=JSON.stringify(payload),timestamp=String(Date.now());
  const signature='sha256='+await hmac(secret,timestamp+'.'+raw);
  const reply=await fetch(target.toString(),{
    method:'POST',headers:{'content-type':'application/json','x-artisys-timestamp':timestamp,
      'x-artisys-signature':signature},body:raw,signal:AbortSignal.timeout(10000),redirect:'manual'
  });
  const result=await reply.json().catch(()=>({}));
  if(!reply.ok||result.ok!==true||(result.created===0&&!result.duplicate))
    return {status:502,error:'commerce_not_confirmed'};
  return {ok:true,created:Number(result.created||0),duplicate:Boolean(result.duplicate),order_id:order.orderId};
}
