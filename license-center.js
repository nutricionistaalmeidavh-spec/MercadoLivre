const state={snapshot:null,parityComplete:false};
const esc=value=>String(value??'').replace(/[&<>"']/g,ch=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[ch]));
const fmtDate=value=>{if(!value)return '—';const date=new Date(value);return Number.isNaN(date.getTime())?esc(value):date.toLocaleString('pt-BR')};
const list=value=>Array.isArray(value)&&value.length?value.map(esc).join(', '):'—';
const pill=value=>`<span class="pill">${esc(value||'—')}</span>`;
const csv=value=>String(value||'').split(',').map(item=>item.trim()).filter(Boolean);

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
    {label:'Ações',render:r=>`${button('Renovar +6m','debora-grant',r.email)} ${r.status==='revoked'?button('Reativar','debora-grant',r.email,'primary'):button('Revogar','debora-revoke',r.email,'danger')}`}
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
  }catch(error){setStatus(`Não foi possível carregar a central: ${error.message}`,true)}
}

function wireForms(){
  document.getElementById('obraCreateForm').addEventListener('submit',async event=>{
    event.preventDefault();const form=new FormData(event.currentTarget);
    const payload={name:form.get('name'),adminEmail:form.get('adminEmail'),plan:form.get('plan'),expiresAt:form.get('expiresAt')||undefined,maxUsers:Number(form.get('maxUsers')),maxProjects:Number(form.get('maxProjects')),maxDevices:Number(form.get('maxDevices')),modules:csv(form.get('modules')),channels:csv(form.get('channels'))};
    try{await mutate('/api/license-center/obra/companies','POST',payload,'Empresa/licença criada e confirmada.');event.currentTarget.reset()}catch(error){setStatus(error.message,true)}
  });
  document.getElementById('deboraLicenseForm').addEventListener('submit',event=>event.preventDefault());
  document.getElementById('deboraLicenseForm').addEventListener('click',async event=>{
    const button=event.target.closest('button[data-debora-action]');if(!button)return;const email=String(new FormData(document.getElementById('deboraLicenseForm')).get('email')||'').trim();if(!email)return setStatus('Informe o e-mail da licença Débora.',true);
    const action=button.dataset.deboraAction;if(action==='revoke'&&!confirm(`Revogar o acesso Pro de ${email}?`))return;
    try{if(action==='status'){const result=await api('/api/license-center/debora/license',{method:'POST',headers:qaHeaders(),body:JSON.stringify({action,email})});setStatus(`Débora: ${result.state||'consultado'}.`);await load();}else await mutate('/api/license-center/debora/license','POST',{action,email},action==='grant'?'Licença Débora liberada/renovada e confirmada.':'Licença Débora revogada e confirmada.')}catch(error){setStatus(error.message,true)}
  });
  document.getElementById('lojaCreateForm').addEventListener('submit',async event=>{
    event.preventDefault();const form=new FormData(event.currentTarget);const payload={companyName:form.get('companyName'),adminName:form.get('adminName'),adminEmail:form.get('adminEmail'),months:Number(form.get('months')),maxUsers:Number(form.get('maxUsers')),plan:form.get('plan')};
    try{await mutate('/api/license-center/loja-online/companies','POST',payload,'Loja criada e confirmada.');event.currentTarget.reset()}catch(error){setStatus(error.message,true)}
  });
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
    if(action==='debora-grant')return await mutate('/api/license-center/debora/license','POST',{action:'grant',email:id},'Licença Débora liberada/renovada e confirmada.');
    if(action==='debora-revoke'){if(!confirm(`Revogar o acesso Pro de ${id}?`))return;return await mutate('/api/license-center/debora/license','POST',{action:'revoke',email:id},'Licença Débora revogada e confirmada.');}
    if(action==='loja-edit'&&loja){const plan=prompt('Plano',loja.license?.plan||'6_MONTHS');if(plan===null)return;const maxUsers=prompt('Máximo de usuários',String(loja.license?.maxUsers||5));if(maxUsers===null)return;const expiresAt=prompt('Validade ISO/data',loja.license?.expiresAt||'');if(expiresAt===null)return;return await mutate(`/api/license-center/loja-online/companies/${encodeURIComponent(id)}/license`,'PUT',{plan,maxUsers:Number(maxUsers),expiresAt:expiresAt||null},'Licença da Loja atualizada e confirmada.');}
    if(action==='loja-extend'){const months=Number(prompt('Estender por quantos meses? 1, 3, 6 ou 12','6'));if(![1,3,6,12].includes(months))throw new Error('Extensão deve ser 1, 3, 6 ou 12 meses.');return await mutate(`/api/license-center/loja-online/companies/${encodeURIComponent(id)}/extend`,'POST',{months},'Validade da Loja estendida e confirmada.');}
    if(action==='loja-block'){const reason=prompt('Motivo do bloqueio','Acesso suspenso pela Artisys');if(reason===null)return;return await mutate(`/api/license-center/loja-online/companies/${encodeURIComponent(id)}/block`,'POST',{reason},'Loja bloqueada e confirmada.');}
    if(action==='loja-unblock')return await mutate(`/api/license-center/loja-online/companies/${encodeURIComponent(id)}/unblock`,'POST',{},'Loja desbloqueada e confirmada.');
  }catch(error){setStatus(error.message,true)}
}

document.addEventListener('click',event=>{const button=event.target.closest('button[data-action]');if(button)handleAction(button)});
wireForms();load();
