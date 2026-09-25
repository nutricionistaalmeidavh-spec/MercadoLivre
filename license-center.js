const state={
  snapshot:null,parityComplete:false,
  deboraUsers:{cursor:null,stack:[],next:null,hasMore:false},
  deboraSales:{cursor:null,stack:[],next:null,hasMore:false}
};
const esc=value=>String(value??'').replace(/[&<>"']/g,ch=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[ch]));
const fmtDate=value=>{if(!value)return '—';const date=new Date(value);return Number.isNaN(date.getTime())?esc(value):date.toLocaleString('pt-BR')};
const fmtMoney=value=>new Intl.NumberFormat('pt-BR',{style:'currency',currency:'BRL'}).format((Number(value)||0)/100);
const list=value=>Array.isArray(value)&&value.length?value.map(esc).join(', '):'—';
const pill=value=>`<span class="pill">${esc(value||'—')}</span>`;
const csv=value=>String(value||'').split(',').map(item=>item.trim()).filter(Boolean);
const channelLabel=value=>({mercado_livre:'Mercado Livre',mercado_livre_manual:'Manual legado',direct_sale:'Venda direta',shopee:'Shopee',gumroad:'Gumroad',courtesy:'Cortesia',partnership:'Parceria',other:'Outro',asaas:'Asaas',cadastro:'Cadastro'}[String(value||'')]||String(value||'—'));
const paymentLabel=value=>({paid:'Pago',pending:'Pendente',unpaid:'Não pago',not_applicable:'Não se aplica',unknown:'Não informado',active:'Ativo',past_due:'Em atraso',cancelled:'Cancelado',expired:'Expirado',failed:'Falhou',checkout_created:'Checkout criado'}[String(value||'')]||String(value||'—'));
const planLabel=value=>({pro_monthly:'Pro mensal',pro_annual:'Pro anual',pro_6m:'Pro 6 meses',freemium:'Freemium'}[String(value||'')]||String(value||'Freemium'));

function brlToCents(value){
  const text=String(value??'').trim();if(!text)return null;
  const normalized=(text.includes(',')?text.replace(/\./g,'').replace(',','.'):text).replace(/[^0-9.-]/g,'');
  const amount=Number(normalized);if(!Number.isFinite(amount)||amount<0)throw new Error('Informe um valor válido.');
  return Math.round(amount*100);
}
function manualSaleFromForm(form){
  const values=new FormData(form),acquisitionChannel=String(values.get('acquisitionChannel')||''),paymentStatus=String(values.get('paymentStatus')||'');
  if(!acquisitionChannel)throw new Error('Selecione a origem da venda/liberação.');
  if(!paymentStatus)throw new Error('Selecione a situação do pagamento.');
  return{acquisitionChannel,paymentStatus,amountCents:brlToCents(values.get('amount')),externalOrderRef:String(values.get('externalOrderRef')||'').trim()||null};
}
function qaHeaders(){
  const run=String(localStorage.getItem('artisys_qa_run')||'').trim();
  return run?{'x-artisys-qa-run':run}:{};
}
async function api(path,options={}){
  const headers=new Headers(options.headers||{});
  if(options.body!==undefined&&!headers.has('content-type'))headers.set('content-type','application/json');
  for(const[name,value]of Object.entries(qaHeaders()))headers.set(name,value);
  const response=await fetch(path,{credentials:'same-origin',...options,headers});
  const data=await response.json().catch(()=>({}));
  if(!response.ok)throw new Error(data.message||data.error||`HTTP ${response.status}`);
  return data;
}
async function mutate(path,method,payload,successMessage){
  if(!state.parityComplete)throw new Error('Paridade administrativa incompleta. Escrita bloqueada até o painel suportar todas as capacidades obrigatórias.');
  setStatus('Executando operação administrativa…');
  await api(path,{method,body:JSON.stringify(payload||{})});
  await load();
  setStatus(successMessage||'Operação concluída e confirmada por nova leitura.');
}
function setStatus(text,error=false){const el=document.getElementById('status');el.textContent=text;el.classList.toggle('error',error)}
function table(target,headers,rows){const el=document.getElementById(target);if(!rows.length){el.innerHTML='<div class="empty">Nenhum registro.</div>';return}el.innerHTML=`<div class="table-wrap"><table><thead><tr>${headers.map(h=>`<th>${esc(h.label)}</th>`).join('')}</tr></thead><tbody>${rows.map(row=>`<tr>${headers.map(h=>`<td>${h.render(row)}</td>`).join('')}</tr>`).join('')}</tbody></table></div>`}
function button(label,action,id,kind='secondary'){return `<button class="btn ${kind}" type="button" data-write data-action="${esc(action)}" data-id="${esc(id)}">${esc(label)}</button>`}
function readButton(label,action,id){return `<button class="btn" type="button" data-action="${esc(action)}" data-id="${esc(id)}">${esc(label)}</button>`}

function renderObra(obra){
  table('obraTable',[
    {label:'Empresa',render:r=>`<strong>${esc(r.name)}</strong><div class="muted">${esc(r.adminEmail||'—')}</div>`},
    {label:'Status',render:r=>pill(r.status)},
    {label:'Plano / validade',render:r=>`${esc(r.license?.plan||'—')}<div class="muted">${fmtDate(r.license?.expiresAt)}</div>`},
    {label:'Módulos / canais',render:r=>`${list(r.modules)}<div class="muted">${list(r.channels)}</div>`},
    {label:'Limites',render:r=>`U ${esc(r.license?.maxUsers??'—')} · P ${esc(r.license?.maxProjects??'—')} · D ${esc(r.license?.maxDevices??'—')}`},
    {label:'Dispositivos',render:r=>Array.isArray(r.devices)&&r.devices.length?r.devices.map(d=>`<div class="device-row"><span>${esc(d.name||d.id)} · ${pill(d.status)}</span>${button(d.status==='active'?'Revogar':'Reativar','obra-device',d.id)}</div>`).join(''):'—'},
    {label:'Ações',render:r=>`${button('Editar','obra-edit',r.id)} ${r.status==='suspended'?button('Reativar','obra-reactivate',r.id,'primary'):button('Suspender','obra-suspend',r.id,'danger')}`}
  ],obra);
}
function renderDebora(rows){
  table('deboraTable',[
    {label:'E-mail',render:r=>esc(r.email)},
    {label:'Status',render:r=>pill(r.status)},
    {label:'Plano',render:r=>esc(r.planCode||'—')},
    {label:'Validade',render:r=>fmtDate(r.expiresAt)},
    {label:'Origem',render:r=>esc(r.source||'—')},
    {label:'Ações',render:r=>`${button('Renovar +6m','debora-prepare-grant',r.email)} ${r.status==='revoked'?button('Reativar','debora-prepare-grant',r.email,'primary'):button('Revogar','debora-revoke',r.email,'danger')}`}
  ],rows);
}
function renderLoja(snapshot){
  if(snapshot?.available===false){document.getElementById('lojaTable').innerHTML=`<div class="empty warning">Loja Online indisponível: ${esc(snapshot.error||'erro não informado')}</div>`;return}
  table('lojaTable',[
    {label:'Empresa',render:r=>`<strong>${esc(r.company?.name||'—')}</strong><div class="muted">${esc(r.admin?.email||'—')}</div>`},
    {label:'Status',render:r=>pill(r.accessStatus)},
    {label:'Plano / validade',render:r=>`${esc(r.license?.plan||'—')}<div class="muted">${fmtDate(r.license?.expiresAt)}</div>`},
    {label:'Usuários',render:r=>`${esc(r.userCount??0)} / ${esc(r.license?.maxUsers??'—')}`},
    {label:'Ações',render:r=>`${button('Editar','loja-edit',r.company?.id)} ${button('Estender','loja-extend',r.company?.id)} ${r.accessStatus==='BLOCKED'?button('Desbloquear','loja-unblock',r.company?.id,'primary'):button('Bloquear','loja-block',r.company?.id,'danger')}`}
  ],snapshot?.companies||[]);
}
function renderAudit(rows){table('auditTable',[{label:'Quando',render:r=>fmtDate(r.createdAt)},{label:'Produto',render:r=>esc(r.product)},{label:'E-mail',render:r=>esc(r.email||'—')},{label:'Ação',render:r=>esc(r.action)},{label:'Origem',render:r=>esc(r.source||'—')},{label:'Ator',render:r=>esc(r.actor||'—')}],rows)}
function applyParity(data){
  const missing=data.parity?.missing||[];
  state.parityComplete=data.parity?.status!=='incomplete';
  const parity=document.getElementById('parity');
  if(state.parityComplete){parity.hidden=true;parity.textContent='';}
  else{parity.hidden=false;parity.textContent=`Paridade administrativa incompleta. Capacidades ausentes: ${missing.join(', ')}`;}
  for(const el of document.querySelectorAll('[data-write]'))el.disabled=!state.parityComplete;
}

function renderDeboraSummary(summary){
  document.getElementById('deboraOnline').textContent=summary?.presence?.onlineNow??0;
  document.getElementById('deboraAccounts').textContent=summary?.accounts?.total??0;
  document.getElementById('deboraPro').textContent=summary?.pro?.total??0;
  document.getElementById('deboraPaidSales').textContent=summary?.sales?.paid??0;
  document.getElementById('deboraRevenue').textContent=fmtMoney(summary?.sales?.realizedRevenueCents??0);
}
function effectivePlan(user){return user?.effectiveLicense?.planCode||user?.planCode||'freemium'}
function userOrigin(user){return user?.manualSale?.acquisitionChannel||user?.effectiveLicense?.source||(user?.subscriptionStatus?'asaas':'cadastro')}
function userPayment(user){if(user?.manualSale?.paymentStatus)return user.manualSale.paymentStatus;if(user?.effectiveLicense?.planCode==='pro_6m')return'unknown';if(['active','trialing'].includes(String(user?.subscriptionStatus||'')))return'paid';if(user?.subscriptionStatus==='past_due')return'pending';if(['cancelled','expired'].includes(String(user?.subscriptionStatus||'')))return'unpaid';return''}
function renderDeboraUsers(page){
  const rows=page?.items||[];state.deboraUsers.next=page?.nextCursor||null;state.deboraUsers.hasMore=Boolean(page?.hasMore);
  table('deboraUsersTable',[
    {label:'Usuário',render:r=>`<strong>${esc(r.email||'—')}</strong>`},
    {label:'Plano',render:r=>esc(planLabel(effectivePlan(r)))},
    {label:'Origem',render:r=>esc(channelLabel(userOrigin(r)))},
    {label:'Pagamento',render:r=>esc(paymentLabel(userPayment(r)))},
    {label:'Presença',render:r=>pill(r.online?'Online':'Offline')},
    {label:'Última atividade',render:r=>fmtDate(r.lastSeenAt||r.lastSignInAt)},
    {label:'Ações',render:r=>`${readButton('Ver atividade','debora-activity',r.userId||'')}${r.effectiveLicense?.planCode==='pro_6m'&&!r.manualSale?` ${button('Classificar pagamento','debora-classify',r.email||'')}`:''}`}
  ],rows);
  document.getElementById('deboraUsersPrev').disabled=!state.deboraUsers.stack.length;
  document.getElementById('deboraUsersNext').disabled=!state.deboraUsers.hasMore;
  applyParity(state.snapshot||{});
}
function renderDeboraSales(page){
  const rows=page?.items||[];state.deboraSales.next=page?.nextCursor||null;state.deboraSales.hasMore=Boolean(page?.hasMore);
  table('deboraSalesTable',[
    {label:'Data',render:r=>fmtDate(r.createdAt)},
    {label:'Cliente',render:r=>esc(r.email||'—')},
    {label:'Canal',render:r=>esc(channelLabel(r.acquisitionChannel||r.source))},
    {label:'Plano',render:r=>esc(planLabel(r.planCode))},
    {label:'Valor',render:r=>r.amountCents===null||r.amountCents===undefined?'—':esc(fmtMoney(r.amountCents))},
    {label:'Status',render:r=>esc(paymentLabel(r.status))},
    {label:'Referência',render:r=>esc(r.externalOrderRef||'—')}
  ],rows);
  document.getElementById('deboraSalesPrev').disabled=!state.deboraSales.stack.length;
  document.getElementById('deboraSalesNext').disabled=!state.deboraSales.hasMore;
}
async function loadDeboraUsers(){
  const query=new URLSearchParams({limit:'50'});if(state.deboraUsers.cursor)query.set('cursor',state.deboraUsers.cursor);
  renderDeboraUsers(await api(`/api/license-center/debora/observability/users?${query}`));
}
async function loadDeboraSales(){
  const query=new URLSearchParams({limit:'50'});if(state.deboraSales.cursor)query.set('cursor',state.deboraSales.cursor);
  renderDeboraSales(await api(`/api/license-center/debora/observability/sales?${query}`));
}
async function loadDeboraObservability(){
  const status=document.getElementById('deboraObservabilityStatus');status.textContent='Carregando atividade da Débora…';
  try{
    const [summary]=await Promise.all([api('/api/license-center/debora/observability/summary'),loadDeboraUsers(),loadDeboraSales()]);
    renderDeboraSummary(summary);status.textContent='Atividade, usuários e vendas atualizados.';
  }catch(error){status.textContent='Atividade indisponível temporariamente. O licenciamento continua disponível.';status.classList.add('warning');console.warn('debora_observability_unavailable',error)}
}
async function loadDeboraActivity(userId){
  if(!userId)return;const target=document.getElementById('deboraActivity');target.hidden=false;target.innerHTML='Carregando sessões…';
  try{
    const page=await api(`/api/license-center/debora/observability/users/${encodeURIComponent(userId)}/sessions?limit=25`),rows=page?.items||[];
    if(!rows.length){target.innerHTML='<div class="empty">Nenhuma sessão registrada.</div>';return}
    target.innerHTML=`<strong>Atividade recente</strong><div class="table-wrap" style="margin-top:8px"><table><thead><tr><th>Início</th><th>Fim</th><th>Duração</th></tr></thead><tbody>${rows.map(r=>`<tr><td>${fmtDate(r.startedAt)}</td><td>${fmtDate(r.endedAt||r.lastSeenAt)}</td><td>${esc(Math.round((Number(r.durationSeconds)||0)/60))} min</td></tr>`).join('')}</tbody></table></div>`;
  }catch(error){target.innerHTML=`<div class="warning">Atividade indisponível: ${esc(error.message)}</div>`}
}

async function load(){
  try{
    const data=await api('/api/license-center');state.snapshot=data;
    const obra=data.obra?.companies||[],debora=data.debora?.clients||[],loja=data.lojaOnline?.companies||[],audit=data.audit?.events||[];
    document.getElementById('obraCount').textContent=obra.length;
    document.getElementById('deboraCount').textContent=data.debora?.overview?.clients??debora.length;
    document.getElementById('lojaCount').textContent=data.lojaOnline?.available===false?'—':loja.length;
    document.getElementById('auditCount').textContent=audit.length;
    renderObra(obra);renderDebora(debora);renderLoja(data.lojaOnline);renderAudit(audit);applyParity(data);
    document.getElementById('generatedAt').textContent=`Snapshot gerado em ${fmtDate(data.generatedAt)} · contrato administrativo v${esc(data.adminParity?.contractVersion??'—')}.`;
    setStatus(state.parityComplete?'Dados sincronizados com a autoridade atual de licenças.':'Dados carregados, mas escrita bloqueada por paridade incompleta.',!state.parityComplete);
    void loadDeboraObservability();
  }catch(error){setStatus(`Não foi possível carregar a central: ${error.message}`,true)}
}

function wireForms(){
  document.getElementById('obraCreateForm').addEventListener('submit',async event=>{
    event.preventDefault();const form=new FormData(event.currentTarget);
    const payload={name:form.get('name'),adminEmail:form.get('adminEmail'),plan:form.get('plan'),expiresAt:form.get('expiresAt')||undefined,maxUsers:Number(form.get('maxUsers')),maxProjects:Number(form.get('maxProjects')),maxDevices:Number(form.get('maxDevices')),modules:csv(form.get('modules')),channels:csv(form.get('channels'))};
    try{await mutate('/api/license-center/obra/companies','POST',payload,'Empresa/licença criada e confirmada.');event.currentTarget.reset()}catch(error){setStatus(error.message,true)}
  });
  const deboraForm=document.getElementById('deboraLicenseForm');
  deboraForm.addEventListener('submit',event=>event.preventDefault());
  deboraForm.addEventListener('click',async event=>{
    const button=event.target.closest('button[data-debora-action]');if(!button)return;const email=String(new FormData(deboraForm).get('email')||'').trim();if(!email)return setStatus('Informe o e-mail da licença Débora.',true);
    const action=button.dataset.deboraAction;if(action==='revoke'&&!confirm(`Revogar o acesso Pro de ${email}?`))return;
    try{
      if(action==='status'){const result=await api('/api/license-center/debora/license',{method:'POST',headers:qaHeaders(),body:JSON.stringify({action,email})});setStatus(`Débora: ${result.state||'consultado'}.`);await load();return}
      const payload={action,email};if(action==='grant')payload.sale=manualSaleFromForm(deboraForm);
      await mutate('/api/license-center/debora/license','POST',payload,action==='grant'?'Licença Débora liberada/renovada e venda registrada.':'Licença Débora revogada e confirmada.');
    }catch(error){setStatus(error.message,true)}
  });
  document.getElementById('lojaCreateForm').addEventListener('submit',async event=>{
    event.preventDefault();const form=new FormData(event.currentTarget);const payload={companyName:form.get('companyName'),adminName:form.get('adminName'),adminEmail:form.get('adminEmail'),months:Number(form.get('months')),maxUsers:Number(form.get('maxUsers')),plan:form.get('plan')};
    try{await mutate('/api/license-center/loja-online/companies','POST',payload,'Loja criada e confirmada.');event.currentTarget.reset()}catch(error){setStatus(error.message,true)}
  });
  document.getElementById('deboraUsersPrev').addEventListener('click',()=>{if(!state.deboraUsers.stack.length)return;state.deboraUsers.cursor=state.deboraUsers.stack.pop()||null;void loadDeboraUsers()});
  document.getElementById('deboraUsersNext').addEventListener('click',()=>{if(!state.deboraUsers.next)return;state.deboraUsers.stack.push(state.deboraUsers.cursor);state.deboraUsers.cursor=state.deboraUsers.next;void loadDeboraUsers()});
  document.getElementById('deboraSalesPrev').addEventListener('click',()=>{if(!state.deboraSales.stack.length)return;state.deboraSales.cursor=state.deboraSales.stack.pop()||null;void loadDeboraSales()});
  document.getElementById('deboraSalesNext').addEventListener('click',()=>{if(!state.deboraSales.next)return;state.deboraSales.stack.push(state.deboraSales.cursor);state.deboraSales.cursor=state.deboraSales.next;void loadDeboraSales()});
}

function promptManualSale(){
  const acquisitionChannel=String(prompt('Origem: mercado_livre, direct_sale, shopee, gumroad, courtesy, partnership ou other','')||'').trim();if(!acquisitionChannel)throw new Error('Classificação cancelada: informe a origem.');
  const paymentStatus=String(prompt('Pagamento: paid, pending, unpaid ou not_applicable','')||'').trim();if(!paymentStatus)throw new Error('Classificação cancelada: informe o pagamento.');
  const amount=prompt('Valor recebido em reais (opcional)','');if(amount===null)return null;
  const externalOrderRef=prompt('Referência do pedido/comprovante (opcional)','');if(externalOrderRef===null)return null;
  return{acquisitionChannel,paymentStatus,amountCents:brlToCents(amount),externalOrderRef:String(externalOrderRef).trim()||null};
}

async function handleAction(button){
  const action=button.dataset.action,id=button.dataset.id;
  const obra=state.snapshot?.obra?.companies?.find(item=>item.id===id);
  const loja=state.snapshot?.lojaOnline?.companies?.find(item=>item.company?.id===id);
  try{
    if(action==='obra-edit'&&obra){
      const plan=prompt('Plano',obra.license?.plan||'custom');if(plan===null)return;const expiresAt=prompt('Validade (AAAA-MM-DD, vazio remove)',obra.license?.expiresAt?.slice?.(0,10)||'');if(expiresAt===null)return;
      const maxUsers=prompt('Máximo de usuários',String(obra.license?.maxUsers||10));if(maxUsers===null)return;const maxProjects=prompt('Máximo de projetos',String(obra.license?.maxProjects||5));if(maxProjects===null)return;const maxDevices=prompt('Máximo de dispositivos',String(obra.license?.maxDevices||2));if(maxDevices===null)return;
      const modules=prompt('Módulos separados por vírgula',(obra.modules||[]).join(','));if(modules===null)return;const channels=prompt('Canais separados por vírgula',(obra.channels||[]).join(','));if(channels===null)return;
      return await mutate(`/api/license-center/obra/companies/${encodeURIComponent(id)}`,'PUT',{plan,expiresAt,maxUsers:Number(maxUsers),maxProjects:Number(maxProjects),maxDevices:Number(maxDevices),modules:csv(modules),channels:csv(channels)},'Licença Obra atualizada e confirmada.');
    }
    if(action==='obra-suspend'){if(!confirm(`Suspender ${obra?.name||id}?`))return;return await mutate(`/api/license-center/obra/companies/${encodeURIComponent(id)}`,'PUT',{status:'suspended'},'Licença suspensa e confirmada.');}
    if(action==='obra-reactivate')return await mutate(`/api/license-center/obra/companies/${encodeURIComponent(id)}`,'PUT',{status:'active'},'Licença reativada e confirmada.');
    if(action==='obra-device'){
      const device=obra?.devices?.find(item=>item.id===id)||state.snapshot?.obra?.companies?.flatMap(item=>item.devices||[]).find(item=>item.id===id);const next=device?.status==='active'?'revoked':'active';if(next==='revoked'&&!confirm('Revogar somente este computador? A licença da empresa permanecerá inalterada.'))return;return await mutate(`/api/license-center/obra/devices/${encodeURIComponent(id)}`,'PUT',{status:next},'Dispositivo atualizado e confirmado.');
    }
    if(action==='debora-prepare-grant'){
      const form=document.getElementById('deboraLicenseForm');form.elements.namedItem('email').value=id;form.scrollIntoView({behavior:'smooth',block:'center'});setStatus('Preencha origem e pagamento e clique em Liberar / renovar +6m.');return;
    }
    if(action==='debora-revoke'){if(!confirm(`Revogar o acesso Pro de ${id}?`))return;return await mutate('/api/license-center/debora/license','POST',{action:'revoke',email:id},'Licença Débora revogada e confirmada.');}
    if(action==='debora-activity')return await loadDeboraActivity(id);
    if(action==='debora-classify'){
      const sale=promptManualSale();if(!sale)return;return await mutate('/api/license-center/debora/manual-sales/classify','POST',{email:id,sale},'Venda manual antiga classificada e confirmada.');
    }
    if(action==='loja-edit'&&loja){const plan=prompt('Plano',loja.license?.plan||'6_MONTHS');if(plan===null)return;const maxUsers=prompt('Máximo de usuários',String(loja.license?.maxUsers||5));if(maxUsers===null)return;const expiresAt=prompt('Validade ISO/data',loja.license?.expiresAt||'');if(expiresAt===null)return;return await mutate(`/api/license-center/loja-online/companies/${encodeURIComponent(id)}/license`,'PUT',{plan,maxUsers:Number(maxUsers),expiresAt:expiresAt||null},'Licença da Loja atualizada e confirmada.');}
    if(action==='loja-extend'){const months=Number(prompt('Estender por quantos meses? 1, 3, 6 ou 12','6'));if(![1,3,6,12].includes(months))throw new Error('Extensão deve ser 1, 3, 6 ou 12 meses.');return await mutate(`/api/license-center/loja-online/companies/${encodeURIComponent(id)}/extend`,'POST',{months},'Validade da Loja estendida e confirmada.');}
    if(action==='loja-block'){const reason=prompt('Motivo do bloqueio','Acesso suspenso pela Artisys');if(reason===null)return;return await mutate(`/api/license-center/loja-online/companies/${encodeURIComponent(id)}/block`,'POST',{reason},'Loja bloqueada e confirmada.');}
    if(action==='loja-unblock')return await mutate(`/api/license-center/loja-online/companies/${encodeURIComponent(id)}/unblock`,'POST',{},'Loja desbloqueada e confirmada.');
  }catch(error){setStatus(error.message,true)}
}

document.addEventListener('click',event=>{const button=event.target.closest('button[data-action]');if(button)handleAction(button)});
wireForms();load();
