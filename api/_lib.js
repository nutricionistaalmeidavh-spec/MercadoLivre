const crypto = require("crypto");
const { getEnvironment } = require("../src/config/environment");
const { request: mercadoLivreRequest, API } = require("../src/core/http/mercadoLivreClient");

function env(){
  return getEnvironment();
}
function b64u(buf){return Buffer.from(buf).toString("base64url")}
function key(){const e=env();return crypto.createHash("sha256").update(e.clientSecret+"|"+e.adminPassword+"|artisys-ml-v1").digest()}
function encrypt(obj){
  const iv=crypto.randomBytes(12), cipher=crypto.createCipheriv("aes-256-gcm",key(),iv);
  const data=Buffer.from(JSON.stringify(obj));
  const enc=Buffer.concat([cipher.update(data),cipher.final()]),tag=cipher.getAuthTag();
  return [b64u(iv),b64u(tag),b64u(enc)].join(".");
}
function decrypt(s){
  try{const [iv,tag,enc]=s.split(".").map(x=>Buffer.from(x,"base64url"));const d=crypto.createDecipheriv("aes-256-gcm",key(),iv);d.setAuthTag(tag);return JSON.parse(Buffer.concat([d.update(enc),d.final()]).toString("utf8"))}catch{return null}
}
function cookies(req){const out={};String(req.headers.cookie||"").split(";").forEach(p=>{const i=p.indexOf("=");if(i>0)out[p.slice(0,i).trim()]=decodeURIComponent(p.slice(i+1).trim())});return out}
function setCookie(res,name,value,opts={}){
  const parts=[`${name}=${encodeURIComponent(value)}`,`Path=${opts.path||"/"}`,"HttpOnly","Secure","SameSite=Lax"];
  if(opts.maxAge!=null)parts.push(`Max-Age=${opts.maxAge}`); if(opts.expires)parts.push(`Expires=${opts.expires.toUTCString()}`);
  const old=res.getHeader("Set-Cookie"); const arr=old?(Array.isArray(old)?old:[old]):[]; res.setHeader("Set-Cookie",[...arr,parts.join("; ")]);
}
function clearCookie(res,name){setCookie(res,name,"",{maxAge:0,expires:new Date(0)})}
function adminSession(req){const c=cookies(req).artisys_admin;if(!c)return false;const x=decrypt(c);return !!(x&&x.ok&&x.exp>Date.now())}
function requireAdmin(req,res){if(!adminSession(req)){res.statusCode=401;res.setHeader("content-type","application/json");res.end(JSON.stringify({error:"Acesso administrativo necessário."}));return false}return true}
function makeAdmin(res){setCookie(res,"artisys_admin",encrypt({ok:true,exp:Date.now()+7*864e5}),{maxAge:7*86400})}
async function body(req){return await new Promise((resolve,reject)=>{let d="";req.on("data",x=>{d+=x;if(d.length>2e6){reject(new Error("Body muito grande"));req.destroy()}});req.on("end",()=>{if(!d)return resolve({});try{resolve(JSON.parse(d))}catch{reject(new Error("JSON inválido"))}})})}
function json(res,status,data){res.statusCode=status;res.setHeader("content-type","application/json; charset=utf-8");res.setHeader("cache-control","no-store");res.end(JSON.stringify(data))}
function norm(s){return String(s||"").normalize("NFD").replace(/[\u0300-\u036f]/g,"").toLowerCase().replace(/[^a-z0-9]+/g," ").trim()}
async function mlFetch(path,opts={},token){
  return mercadoLivreRequest(path,opts,token);
}
async function getToken(req,res){
  let t=decrypt(cookies(req).artisys_ml); if(!t||!t.access_token)throw new Error("Mercado Livre não conectado.");
  if(t.expires_at && Date.now()>t.expires_at-120000){
    const e=env();const form=new URLSearchParams({grant_type:"refresh_token",client_id:e.clientId,client_secret:e.clientSecret,refresh_token:t.refresh_token});
    const r=await mlFetch("/oauth/token",{method:"POST",headers:{"content-type":"application/x-www-form-urlencoded"},body:form.toString()});
    if(!r.ok)throw new Error("Falha ao renovar token: "+JSON.stringify(r.data));
    t={...r.data,expires_at:Date.now()+Number(r.data.expires_in||21600)*1000}; setCookie(res,"artisys_ml",encrypt(t),{maxAge:30*86400});
  } return t;
}
function origin(req){const proto=(req.headers["x-forwarded-proto"]||"https").split(",")[0];return `${proto}://${req.headers.host}`}
module.exports={env,encrypt,decrypt,cookies,setCookie,clearCookie,adminSession,requireAdmin,makeAdmin,body,json,norm,mlFetch,getToken,origin,b64u,crypto,API};
