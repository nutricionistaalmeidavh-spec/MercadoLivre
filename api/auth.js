const L=require("./_lib");
module.exports=async(req,res)=>{try{const u=new URL(req.url,"https://x"),op=u.searchParams.get("op");
if(op==="status")return L.json(res,200,{authenticated:L.adminSession(req)});
if(op==="login"&&req.method==="POST"){const b=await L.body(req),e=L.env();if(!b.password||!require("crypto").timingSafeEqual(Buffer.from(String(b.password).padEnd(128,"\0").slice(0,128)),Buffer.from(String(e.adminPassword).padEnd(128,"\0").slice(0,128))))return L.json(res,403,{error:"Senha incorreta."});L.makeAdmin(res);return L.json(res,200,{ok:true})}
if(op==="logout"&&req.method==="POST"){L.clearCookie(res,"artisys_admin");L.clearCookie(res,"artisys_ml");return L.json(res,200,{ok:true})}
return L.json(res,404,{error:"Operação inválida."})}catch(e){return L.json(res,500,{error:e.message})}};