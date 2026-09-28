function openPanelFor(node){
  let current=node;
  while(current){
    const details=current.closest?.('details');
    if(!details)break;
    details.open=true;
    current=details.parentElement;
  }
}

function enhanceTableWrap(wrap){
  if(!wrap||wrap.dataset.mobileEnhanced==='true')return;
  const table=wrap.querySelector('table');
  if(!table)return;
  const headers=[...table.querySelectorAll('thead th')].map(cell=>cell.textContent.trim());
  const rows=[...table.querySelectorAll('tbody tr')];
  if(!rows.length)return;

  wrap.dataset.mobileEnhanced='true';
  wrap.classList.add('desktop-table');

  const records=document.createElement('div');
  records.className='mobile-records';
  records.setAttribute('role','list');

  for(const row of rows){
    const card=document.createElement('article');
    card.className='mobile-record';
    card.setAttribute('role','listitem');
    [...row.children].forEach((cell,index)=>{
      const field=document.createElement('div');
      field.className='mobile-field';
      const label=document.createElement('div');
      label.className='mobile-label';
      label.textContent=headers[index]||`Campo ${index+1}`;
      const value=document.createElement('div');
      value.className='mobile-value';
      for(const child of [...cell.childNodes])value.appendChild(child.cloneNode(true));
      field.append(label,value);
      card.appendChild(field);
    });
    records.appendChild(card);
  }
  wrap.insertAdjacentElement('afterend',records);
}

function enhanceTables(root=document){
  root.querySelectorAll?.('.table-wrap').forEach(enhanceTableWrap);
}

function openHashPanel(){
  const id=decodeURIComponent(location.hash.slice(1));
  if(!id)return;
  const target=document.getElementById(id);
  if(target)openPanelFor(target);
}

document.addEventListener('click',event=>{
  const link=event.target.closest('a[href^="#"]');
  if(link){
    const id=decodeURIComponent(link.getAttribute('href').slice(1));
    const target=document.getElementById(id);
    if(target)openPanelFor(target);
  }

  const button=event.target.closest('button[data-action]');
  if(!button)return;
  if(button.dataset.action==='debora-prepare-grant'){
    const form=document.getElementById('deboraLicenseForm');
    if(form)openPanelFor(form);
  }
  if(button.dataset.action==='debora-partner-edit'){
    const form=document.getElementById('deboraPartnerForm');
    if(form)openPanelFor(form);
  }
},true);

const root=document.querySelector('main');
if(root){
  const observer=new MutationObserver(()=>enhanceTables(root));
  observer.observe(root,{childList:true,subtree:true});
  enhanceTables(root);
}

window.addEventListener('hashchange',openHashPanel);
openHashPanel();
