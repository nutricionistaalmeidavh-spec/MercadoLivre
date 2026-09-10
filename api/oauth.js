const L=require("./_lib");
const tokenService=require("../src/modules/mercado-livre/auth/tokenService");

module.exports=async(req,res)=>{
  try{
    const u=new URL(req.url,"https://x");
    const op=u.searchParams.get("op");
    const e=L.env();

    if(op==="start"){
      if(!L.requireAdmin(req,res))return;

      const verifier=L.b64u(L.crypto.randomBytes(48));
      const challenge=L.b64u(L.crypto.createHash("sha256").update(verifier).digest());
      const state=L.encrypt({
        kind:"ml_oauth_state_v3",
        verifier,
        nonce:L.b64u(L.crypto.randomBytes(24)),
        exp:Date.now()+10*60*1000
      });

      const q=new URLSearchParams({
        response_type:"code",
        client_id:e.clientId,
        redirect_uri:e.redirectUri,
        state,
        code_challenge:challenge,
        code_challenge_method:"S256"
      });

      res.statusCode=302;
      res.setHeader("location","https://auth.mercadolivre.com.br/authorization?"+q.toString());
      return res.end();
    }

    if(op==="exchange"&&req.method==="POST"){
      const b=await L.body(req);
      if(!b.code)return L.json(res,400,{error:"Authorization code ausente."});
      if(!b.state)return L.json(res,400,{error:"State OAuth ausente."});

      const st=L.decrypt(String(b.state));
      if(!st || st.kind!=="ml_oauth_state_v3")return L.json(res,400,{error:"State OAuth inválido."});
      if(!st.exp || st.exp<Date.now())return L.json(res,400,{error:"State OAuth expirado. Volte ao painel e conecte novamente."});
      if(!st.verifier)return L.json(res,400,{error:"Code verifier PKCE ausente no state."});

      const form=new URLSearchParams({
        grant_type:"authorization_code",
        client_id:e.clientId,
        client_secret:e.clientSecret,
        code:String(b.code),
        redirect_uri:e.redirectUri,
        code_verifier:String(st.verifier)
      });

      const r=await L.mlFetch("/oauth/token",{
        method:"POST",
        headers:{"content-type":"application/x-www-form-urlencoded"},
        body:form.toString()
      });

      if(!r.ok)return L.json(res,r.status,{error:"Falha na troca do authorization code por token.",details:r.data});

      const t={...r.data,expires_at:Date.now()+Number(r.data.expires_in||21600)*1000};

      // Mantém compatibilidade com o painel atual e, quando configurado,
      // persiste uma cópia criptografada para webhooks/workers server-side.
      L.setCookie(res,"artisys_ml",L.encrypt(t),{maxAge:30*86400});
      if(process.env.TOKEN_ENCRYPTION_KEY){
        tokenService.saveToken(t);
      }

      return L.json(res,200,{ok:true,user_id:t.user_id,scope:t.scope,server_persisted:!!process.env.TOKEN_ENCRYPTION_KEY});
    }

    return L.json(res,404,{error:"Operação inválida."});
  }catch(e){
    return L.json(res,500,{error:e.message});
  }
};
