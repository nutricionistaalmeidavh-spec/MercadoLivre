(() => {
  const STYLE = `
  .ops-toolbar{display:grid;gap:10px;margin-bottom:12px}.ops-toolbar-row{display:flex;gap:8px;overflow-x:auto;padding-bottom:2px}.ops-card-list{display:grid;gap:10px}.order-card,.promo-card{width:100%;text-align:left;background:#fff;border:1px solid var(--line);border-radius:17px;padding:14px;color:var(--ink)}
  .order-card{display:grid;gap:10px}.order-card:hover,.promo-card:hover{border-color:#b7c7be;box-shadow:0 8px 24px rgba(16,35,26,.05)}.order-top,.promo-top{display:flex;justify-content:space-between;gap:12px;align-items:flex-start}.order-id,.promo-item-id{font:700 11px/1.2 ui-monospace,SFMono-Regular,Menlo,monospace;color:var(--ink-soft)}.order-value{font:900 16px/1.1 "Arial Black",Arial,sans-serif}.order-product{display:flex;gap:9px;align-items:center}.order-product-thumb{width:44px;height:44px;border-radius:10px;object-fit:cover;background:#edf2ef}.order-product-copy{min-width:0}.order-product-title{font-size:13px;font-weight:850;white-space:nowrap;overflow:hidden;text-overflow:ellipsis}.order-product-meta{font-size:11px;color:var(--ink-soft);margin-top:3px}.order-foot,.promo-foot{display:flex;gap:6px;flex-wrap:wrap;align-items:center}.ops-back{display:flex;align-items:center;gap:10px;margin-bottom:12px}.ops-detail{display:grid;gap:12px}.timeline{display:grid;gap:0}.timeline-row{display:grid;grid-template-columns:18px 1fr;gap:10px;position:relative;padding-bottom:16px}.timeline-row:before{content:"";position:absolute;left:8px;top:14px;bottom:-2px;width:1px;background:var(--line)}.timeline-row:last-child:before{display:none}.timeline-dot{width:9px;height:9px;border-radius:50%;background:var(--brand);margin-top:5px;z-index:1}.timeline-title{font-size:13px;font-weight:850}.timeline-copy{font-size:11px;color:var(--ink-soft);margin-top:3px;line-height:1.45}.promo-summary{display:grid;grid-template-columns:repeat(2,minmax(0,1fr));gap:9px}.promo-metric{background:#f6f8f6;border-radius:13px;padding:12px}.promo-type{font-size:13px;font-weight:900}.promo-price{font:900 18px/1.1 "Arial Black",Arial,sans-serif;margin-top:8px}.promo-actions{display:flex;gap:8px;flex-wrap:wrap;margin-top:10px}.promo-actions .btn{flex:1 1 150px}.promo-groups{display:grid;gap:14px;margin-top:14px}.promo-group{display:grid;gap:8px}.promo-section-title{font-size:11px;font-weight:900;letter-spacing:.065em;text-transform:uppercase;color:var(--ink-soft);padding:0 2px}.promo-section-list{display:grid;gap:8px}.promo-entry{background:#f6f8f6;border-radius:13px;padding:11px}.promo-entry-available{border:1px dashed #d3ddd7;background:#fafbf9}.promo-no-price{font-size:11px;font-weight:800;color:var(--ink-soft);text-align:right;max-width:110px}.ops-modal-backdrop{position:fixed;inset:0;z-index:100;background:rgba(7,19,13,.56);display:grid;place-items:end center;padding:16px 12px calc(16px + env(safe-area-inset-bottom));backdrop-filter:blur(5px)}.ops-modal{width:min(100%,540px);background:#fff;border-radius:22px;padding:18px;box-shadow:0 24px 80px rgba(0,0,0,.24);max-height:86dvh;overflow:auto}.ops-modal h2{margin:0;font-size:20px}.ops-modal p{font-size:13px;color:var(--ink-soft);line-height:1.45}.ops-form{display:grid;gap:12px;margin-top:14px}.ops-field{display:grid;gap:6px}.ops-field label{font-size:12px;font-weight:850}.ops-field input,.ops-field select{width:100%;border:1px solid #c9d7cf;background:#fff;color:var(--ink);border-radius:13px;padding:12px 13px;font-size:16px}.ops-modal-actions{display:flex;gap:8px;margin-top:16px}.ops-modal-actions .btn{flex:1}.ops-alert{padding:12px;border-radius:13px;background:var(--warning);color:#665000;font-size:12px;line-height:1.45}.ops-danger{background:var(--danger);color:#8a2924}.ops-skeleton{height:88px;border-radius:17px;background:linear-gradient(90deg,#eef2ef 25%,#f7f9f7 50%,#eef2ef 75%);background-size:200% 100%;animation:opsShimmer 1.2s infinite}@keyframes opsShimmer{to{background-position:-200% 0}}@media(prefers-reduced-motion:reduce){.ops-skeleton{animation:none}}@media(min-width:760px){.ops-card-list{grid-template-columns:repeat(2,minmax(0,1fr))}.ops-modal-backdrop{place-items:center}.promo-summary{grid-template-columns:repeat(4,minmax(0,1fr))}}
  `;
  const style = document.createElement('style');
  style.textContent = STYLE;
  document.head.appendChild(style);

  const PROMOTION_TYPE_LABELS = {
    SELLER_CAMPAIGN: 'Campanha do vendedor',
    PRICE_DISCOUNT: 'Desconto individual',
    SELLER_COUPON_CAMPAIGN: 'Cupom do vendedor'
  };
  const PROMOTION_GROUP_ORDER = ['active', 'scheduled', 'available', 'finished', 'other'];
  const PROMOTION_GROUP_LABELS = {
    active: 'Promoções ativas',
    scheduled: 'Programadas',
    available: 'Oportunidades disponíveis',
    finished: 'Encerradas',
    other: 'Outras condições'
  };

  const ops = {
    orders: [],
    orderPaging: null,
    orderQ: '',
    orderStatus: 'all',
    orderDetail: null,
    promotionsByItem: new Map(),
    promotionsLoaded: false,
    loadingOrders: false,
    loadingPromos: false
  };

  function e(v) { return typeof esc === 'function' ? esc(v) : String(v ?? ''); }
  function fmtMoney(v, currency = 'BRL') { return typeof money === 'function' ? money(v, currency) : `${currency} ${Number(v || 0).toFixed(2)}`; }
  function dateTime(v) { if (!v) return '—'; const d = new Date(v); return Number.isNaN(d.getTime()) ? String(v) : d.toLocaleString('pt-BR', { dateStyle: 'short', timeStyle: 'short' }); }
  function statusText(status) {
    const map = { paid:'Pago', confirmed:'Confirmado', payment_required:'Aguardando pagamento', payment_in_process:'Pagamento em análise', partially_paid:'Parcialmente pago', cancelled:'Cancelado', invalid:'Inválido', started:'Ativa', pending:'Programada', candidate:'Disponível', finished:'Finalizada', sync_requested:'Ativando', restore_requested:'Removendo' };
    return map[String(status || '').toLowerCase()] || String(status || '—');
  }
  function promotionTypeLabel(type) {
    const key = String(type || '').trim().toUpperCase();
    return PROMOTION_TYPE_LABELS[key] || String(type || 'Promoção');
  }
  function promotionGroup(status) {
    const key = String(status || '').trim().toLowerCase();
    if (key === 'started' || key === 'sync_requested') return 'active';
    if (key === 'pending') return 'scheduled';
    if (key === 'candidate') return 'available';
    if (key === 'finished' || key === 'restore_requested') return 'finished';
    return 'other';
  }
  function promotionPriceText(promo, currency) {
    const group = promotionGroup(promo?.status);
    const numeric = promo?.price == null ? NaN : Number(promo.price);
    if (group === 'available' && (!Number.isFinite(numeric) || numeric === 0)) return 'Sem preço definido';
    return promo?.price != null ? fmtMoney(promo.price, currency) : '—';
  }
  function promotionGroupsMarkup(promos, item) {
    const groups = new Map(PROMOTION_GROUP_ORDER.map(key => [key, []]));
    for (const promo of promos) groups.get(promotionGroup(promo.status))?.push(promo);
    return PROMOTION_GROUP_ORDER.map(group => {
      const rows = groups.get(group) || [];
      if (!rows.length) return '';
      const body = rows.map(p => {
        const price = promotionPriceText(p, item.currency_id);
        const availableNoPrice = group === 'available' && price === 'Sem preço definido';
        const canEnd = p.type === 'PRICE_DISCOUNT' && ['started','pending','sync_requested'].includes(String(p.status).toLowerCase());
        return `<div class="promo-entry${group === 'available' ? ' promo-entry-available' : ''}"><div class="promo-top"><div><strong style="font-size:12px">${e(promotionTypeLabel(p.type))}</strong><div style="font-size:11px;color:var(--ink-soft);margin-top:3px">${e(statusText(p.status))}</div></div><div${availableNoPrice?' class="promo-no-price"':' style="font-weight:900"'}>${e(price)}</div></div>${p.original_price!=null?`<div style="font-size:11px;color:var(--ink-soft);margin-top:6px">Original: ${e(fmtMoney(p.original_price,item.currency_id))}${p.end_date?` · até ${e(dateTime(p.end_date))}`:''}</div>`:''}${canEnd?`<div class="promo-actions"><button class="btn btn-danger end-discount" type="button" data-item="${e(item.item_id)}">Encerrar desconto</button></div>`:''}</div>`;
      }).join('');
      return `<section class="promo-group"><div class="promo-section-title">${e(PROMOTION_GROUP_LABELS[group])}</div><div class="promo-section-list">${body}</div></section>`;
    }).join('');
  }
  function automationPill(a) {
    if (!a) return '<span class="pill pill-neutral">Sem execução</span>';
    const stateName = String(a.state || '').toUpperCase();
    if (stateName === 'SENT') return '<span class="pill pill-success">Mensagem enviada</span>';
    if (stateName === 'DRY_RUN') return '<span class="pill pill-info">Dry-run</span>';
    if (stateName === 'SKIPPED') return '<span class="pill pill-warning">Automação ignorada</span>';
    if (stateName === 'FAILED') return '<span class="pill" style="background:var(--danger);color:#8a2924">Falhou</span>';
    return `<span class="pill pill-neutral">${e(stateName || 'Automação')}</span>`;
  }
  function itemThumb(itemId) { const it = state?.items?.find?.(i => String(i.item_id) === String(itemId)); return it?.thumbnail || ''; }
  function itemTitle(itemId, fallback) { const it = state?.items?.find?.(i => String(i.item_id) === String(itemId)); return it?.title || fallback || itemId; }

  function replaceViews() {
    const pedidos = document.getElementById('view-pedidos');
    const promos = document.getElementById('view-promocoes');
    if (pedidos) pedidos.innerHTML = `
      <div id="ordersListPage">
        <div class="page-head"><div><div class="eyebrow">Operação</div><h1 class="page-title">Pedidos</h1><p class="page-copy">Vendas, pagamentos e execução da automação em uma única linha do tempo.</p></div><button id="ordersRefresh" class="icon-btn" type="button" aria-label="Atualizar pedidos"><svg class="icon" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.9"><path d="M20 11a8 8 0 1 0 1 5"/><path d="M20 4v7h-7"/></svg></button></div>
        <div class="ops-toolbar"><div class="search-box"><svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.9"><circle cx="11" cy="11" r="7"/><path d="m20 20-4-4"/></svg><input id="ordersSearch" class="search-input" type="search" placeholder="Pedido, anúncio ou comprador" autocomplete="off"><button id="ordersClear" class="clear-search hidden" type="button" aria-label="Limpar busca">×</button></div><div class="ops-toolbar-row" role="group" aria-label="Filtrar pedidos"><button class="filter-chip order-filter active" data-order-status="all" type="button">Todos</button><button class="filter-chip order-filter" data-order-status="paid" type="button">Pagos</button><button class="filter-chip order-filter" data-order-status="payment_required" type="button">Pendentes</button><button class="filter-chip order-filter" data-order-status="cancelled" type="button">Cancelados</button></div></div>
        <div id="ordersMeta" class="list-count"></div><div id="ordersMsg" aria-live="polite"></div><div id="ordersList" class="ops-card-list"></div>
      </div>
      <div id="orderDetailPage" class="hidden"></div>`;
    if (promos) promos.innerHTML = `
      <div class="page-head"><div><div class="eyebrow">Comercial</div><h1 class="page-title">Promoções</h1><p class="page-copy">Consulte campanhas de cada anúncio e crie descontos individuais com confirmação explícita.</p></div><button id="promosRefresh" class="icon-btn" type="button" aria-label="Atualizar promoções"><svg class="icon" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.9"><path d="M20 11a8 8 0 1 0 1 5"/><path d="M20 4v7h-7"/></svg></button></div>
      <div class="section-card" style="margin-top:0"><div class="section-head"><h2>Promoções por anúncio</h2></div><p class="page-copy">Veja separadamente o que está ativo, programado ou apenas disponível. Para criar um desconto individual, use o botão dentro do anúncio correspondente.</p></div>
      <div id="promosMsg" aria-live="polite"></div><div id="promosList" class="ops-card-list" data-promo-direct="1" style="margin-top:12px"></div>`;
  }

  async function loadOrders({ force = false } = {}) {
    if (ops.loadingOrders || (!force && ops.orders.length)) { renderOrders(); return; }
    ops.loadingOrders = true;
    const list = document.getElementById('ordersList');
    if (list) list.innerHTML = '<div class="ops-skeleton"></div><div class="ops-skeleton"></div>';
    const msg = document.getElementById('ordersMsg'); if (msg) msg.innerHTML = '';
    try {
      const p = new URLSearchParams({ limit: '40' });
      if (ops.orderQ) p.set('q', ops.orderQ);
      if (ops.orderStatus !== 'all') p.set('status', ops.orderStatus);
      const data = await api(`/api/orders?${p}`);
      ops.orders = Array.isArray(data.orders) ? data.orders : [];
      ops.orderPaging = data.paging || null;
      renderOrders();
    } catch (err) {
      if (msg) showNotice(msg, err.message, 'error');
      if (list) list.innerHTML = '';
    } finally { ops.loadingOrders = false; }
  }

  function renderOrders() {
    const list = document.getElementById('ordersList'); if (!list) return;
    const meta = document.getElementById('ordersMeta');
    const total = Number(ops.orderPaging?.total ?? ops.orders.length);
    if (meta) meta.textContent = `${ops.orders.length} exibidos · ${total} encontrados`;
    if (!ops.orders.length) { list.innerHTML = '<div class="empty"><h3>Nenhum pedido encontrado</h3><p>Ajuste a busca ou o filtro de status.</p></div>'; return; }
    list.innerHTML = ops.orders.map(order => {
      const first = order.items?.[0] || {};
      const thumb = itemThumb(first.item_id);
      const payment = order.payments?.[0];
      return `<button class="order-card" type="button" data-order-id="${e(order.id)}"><div class="order-top"><div><div class="order-id">PEDIDO ${e(order.id)}</div><div style="font-size:12px;color:var(--ink-soft);margin-top:5px">${e(dateTime(order.date_created))} · ${e(order.buyer?.nickname || 'Comprador')}</div></div><div class="order-value">${e(fmtMoney(order.total_amount, order.currency_id))}</div></div><div class="order-product">${thumb?`<img class="order-product-thumb" src="${e(thumb)}" alt="">`:'<div class="order-product-thumb"></div>'}<div class="order-product-copy"><div class="order-product-title">${e(itemTitle(first.item_id, first.title))}</div><div class="order-product-meta">${first.quantity || 1} un. · ${e(first.item_id || '')}</div></div></div><div class="order-foot"><span class="pill ${order.status==='paid'?'pill-success':order.status==='cancelled'?'pill-warning':'pill-neutral'}">${e(statusText(order.status))}</span>${payment?`<span class="pill pill-neutral">Pagamento: ${e(statusText(payment.status))}</span>`:''}${automationPill(order.automation)}</div></button>`;
    }).join('');
    list.querySelectorAll('[data-order-id]').forEach(btn => btn.addEventListener('click', () => openOrder(btn.dataset.orderId)));
  }

  async function openOrder(id) {
    const listPage = document.getElementById('ordersListPage'); const detail = document.getElementById('orderDetailPage');
    if (!listPage || !detail) return;
    listPage.classList.add('hidden'); detail.classList.remove('hidden'); detail.innerHTML = '<div class="ops-skeleton"></div>';
    const u = new URL(location.href); u.searchParams.set('order', id); history.replaceState(null,'',u);
    try {
      const data = await api(`/api/orders?order_id=${encodeURIComponent(id)}`); ops.orderDetail = data; renderOrderDetail(data);
    } catch (err) { detail.innerHTML = `<div class="notice notice-error">${e(err.message)}</div><button id="orderBackError" class="btn btn-secondary" style="margin-top:12px" type="button">Voltar</button>`; document.getElementById('orderBackError')?.addEventListener('click', closeOrder); }
  }

  function renderOrderDetail(data) {
    const detail = document.getElementById('orderDetailPage'); if (!detail) return;
    const o = data.order || {}; const first = o.items?.[0] || {}; const attempts = data.message_attempts || [];
    const timeline = [
      {t:'Pedido criado', c:dateTime(o.date_created)},
      {t:`Pedido ${statusText(o.status)}`, c:`Valor ${fmtMoney(o.total_amount,o.currency_id)}`},
      ...(o.payments||[]).map(p=>({t:`Pagamento ${statusText(p.status)}`,c:`${fmtMoney(p.total_paid_amount||p.transaction_amount,p.currency_id)}${p.status_detail?` · ${p.status_detail}`:''}`})),
      ...(data.automation?[{t:`Automação: ${data.automation.state}`,c:data.automation.reason || (data.automation.message_id?`Mensagem ${data.automation.message_id}`:'Sem detalhe adicional')}]:[{t:'Automação ainda sem execução',c:'Nenhum registro encontrado para este pedido.'}]),
      ...attempts.slice(0,5).map(a=>({t:`Tentativa de mensagem: ${a.status}`,c:`${a.http_status?`HTTP ${a.http_status} · `:''}${new Date(a.created_at).toLocaleString('pt-BR')}`}))
    ];
    detail.innerHTML = `<div class="ops-back"><button id="orderBack" class="back-btn" type="button" aria-label="Voltar para pedidos"><svg class="icon" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.9"><path d="m15 18-6-6 6-6"/></svg></button><div><div class="eyebrow">Pedido</div><div class="order-id">${e(o.id)}</div></div></div><div class="ops-detail"><section class="detail-hero"><div class="order-top"><div><h1 class="detail-title" style="margin:0">${e(itemTitle(first.item_id,first.title)||'Pedido')}</h1><div class="listing-meta"><span class="pill ${o.status==='paid'?'pill-success':'pill-neutral'}">${e(statusText(o.status))}</span>${automationPill(data.automation)}</div></div><div class="order-value">${e(fmtMoney(o.total_amount,o.currency_id))}</div></div></section><section class="section-card"><h2 style="margin:0 0 12px;font-size:17px">Resumo</h2><div class="kv-grid"><div class="kv"><div class="kv-label">Comprador</div><div class="kv-value">${e(o.buyer?.nickname||'—')}</div></div><div class="kv"><div class="kv-label">Pack</div><div class="kv-value">${e(o.pack_id||'—')}</div></div><div class="kv"><div class="kv-label">Criado</div><div class="kv-value">${e(dateTime(o.date_created))}</div></div><div class="kv"><div class="kv-label">Pago</div><div class="kv-value">${e(fmtMoney(o.paid_amount,o.currency_id))}</div></div></div></section><section class="section-card"><h2 style="margin:0 0 14px;font-size:17px">Linha do tempo</h2><div class="timeline">${timeline.map(x=>`<div class="timeline-row"><span class="timeline-dot"></span><div><div class="timeline-title">${e(x.t)}</div><div class="timeline-copy">${e(x.c)}</div></div></div>`).join('')}</div></section></div>`;
    document.getElementById('orderBack')?.addEventListener('click', closeOrder);
  }

  function closeOrder() {
    document.getElementById('ordersListPage')?.classList.remove('hidden'); document.getElementById('orderDetailPage')?.classList.add('hidden');
    const u = new URL(location.href); u.searchParams.delete('order'); history.replaceState(null,'',u);
  }

  async function loadPromotions({ force = false } = {}) {
    if (ops.loadingPromos || !state?.items?.length) { renderPromotions(); return; }
    if (!force && ops.promotionsLoaded) { renderPromotions(); return; }
    ops.loadingPromos = true; const list = document.getElementById('promosList'); if (list) list.innerHTML='<div class="ops-skeleton"></div><div class="ops-skeleton"></div>';
    try {
      const ids = state.items.slice(0,25).map(i=>i.item_id).join(','); const data = await api(`/api/promotions?item_ids=${encodeURIComponent(ids)}`);
      ops.promotionsByItem.clear(); (data.items||[]).forEach(row=>ops.promotionsByItem.set(String(row.item_id),row)); ops.promotionsLoaded=true; renderPromotions();
    } catch(err) { showNotice(document.getElementById('promosMsg'),err.message,'error'); if(list) list.innerHTML=''; }
    finally { ops.loadingPromos=false; }
  }

  function renderPromotions() {
    const list=document.getElementById('promosList'); if(!list)return;
    const items=state?.items||[]; if(!items.length){list.innerHTML='<div class="empty"><h3>Sem anúncios carregados</h3><p>Conecte a conta e atualize os anúncios primeiro.</p></div>';return}
    list.innerHTML=items.map(item=>{
      const row=ops.promotionsByItem.get(String(item.item_id));
      const promos=row?.promotions||[];
      const activeCount=promos.filter(p=>['started','sync_requested'].includes(String(p.status).toLowerCase())).length;
      const scheduledCount=promos.filter(p=>String(p.status).toLowerCase()==='pending').length;
      const badgeText=activeCount?`${activeCount} ativa${activeCount===1?'':'s'}`:scheduledCount?`${scheduledCount} programada${scheduledCount===1?'':'s'}`:'Sem promoção ativa';
      const badgeClass=activeCount?'pill-success':'pill-neutral';
      return `<article class="promo-card"><div class="promo-top"><div><div class="promo-type">${e(item.title||item.item_id)}</div><div class="promo-item-id">${e(item.item_id)}</div></div><span class="pill ${badgeClass}">${e(badgeText)}</span></div>${promos.length?`<div class="promo-groups">${promotionGroupsMarkup(promos,item)}</div>`:'<p class="page-copy" style="margin-top:10px">Nenhuma promoção retornada para este anúncio.</p>'}<div class="promo-actions"><button class="btn btn-secondary create-discount" type="button" data-item="${e(item.item_id)}">Criar desconto</button>${item.permalink?`<a class="btn btn-ghost" target="_blank" rel="noopener" href="${e(item.permalink)}">Ver anúncio</a>`:''}</div></article>`;
    }).join('');
    list.querySelectorAll('.create-discount').forEach(b=>b.addEventListener('click',()=>openDiscountModal(b.dataset.item)));
    list.querySelectorAll('.end-discount').forEach(b=>b.addEventListener('click',()=>openEndModal(b.dataset.item)));
  }

  function modal(content) { closeModal(); const wrap=document.createElement('div');wrap.id='opsModal';wrap.className='ops-modal-backdrop';wrap.innerHTML=`<div class="ops-modal" role="dialog" aria-modal="true" aria-labelledby="opsModalTitle">${content}</div>`;document.body.appendChild(wrap);wrap.addEventListener('click',ev=>{if(ev.target===wrap)closeModal()});document.addEventListener('keydown',modalEsc);requestAnimationFrame(()=>wrap.querySelector('input,button')?.focus()); }
  function modalEsc(ev){if(ev.key==='Escape')closeModal()}
  function closeModal(){document.getElementById('opsModal')?.remove();document.removeEventListener('keydown',modalEsc)}

  function openDiscountModal(itemId) {
    const item=state.items.find(i=>String(i.item_id)===String(itemId));const today=new Date();const end=new Date(today.getTime()+6*86400000);const iso=d=>d.toISOString().slice(0,10);
    modal(`<h2 id="opsModalTitle">Novo desconto</h2><p>${e(item?.title||itemId)}</p><div class="ops-alert">O Mercado Livre valida elegibilidade e faixa de desconto. O desconto individual pode durar no máximo 14 dias.</div><form id="discountForm" class="ops-form" novalidate><div class="ops-field"><label for="dealPrice">Preço promocional</label><input id="dealPrice" name="deal_price" inputmode="decimal" placeholder="Ex.: 179,90" required></div><div class="ops-field"><label for="topDealPrice">Preço para melhores compradores (opcional)</label><input id="topDealPrice" name="top_deal_price" inputmode="decimal" placeholder="Opcional"></div><div class="ops-field"><label for="startDate">Início</label><input id="startDate" name="start_date" type="date" value="${iso(today)}" required></div><div class="ops-field"><label for="finishDate">Fim</label><input id="finishDate" name="finish_date" type="date" value="${iso(end)}" required></div><div id="discountMsg" aria-live="polite"></div><div class="ops-modal-actions"><button id="cancelDiscount" class="btn btn-ghost" type="button">Cancelar</button><button id="confirmDiscount" class="btn btn-primary" type="submit">Criar desconto</button></div></form>`);
    document.getElementById('cancelDiscount').onclick=closeModal;document.getElementById('discountForm').onsubmit=async ev=>{ev.preventDefault();const btn=document.getElementById('confirmDiscount');const num=v=>Number(String(v||'').replace(',','.'));const body={item_id:itemId,promotion_type:'PRICE_DISCOUNT',deal_price:num(document.getElementById('dealPrice').value),top_deal_price:document.getElementById('topDealPrice').value?num(document.getElementById('topDealPrice').value):null,start_date:document.getElementById('startDate').value,finish_date:document.getElementById('finishDate').value,confirm:true};setBusy(btn,true,'Criando');try{await api('/api/promotions',{method:'POST',headers:{'content-type':'application/json'},body:JSON.stringify(body)});closeModal();ops.promotionsLoaded=false;await loadPromotions({force:true})}catch(err){showNotice(document.getElementById('discountMsg'),err.data?.details?.message||err.message,'error');setBusy(btn,false)}};
  }

  function openEndModal(itemId){const item=state.items.find(i=>String(i.item_id)===String(itemId));modal(`<h2 id="opsModalTitle">Encerrar desconto?</h2><p>${e(item?.title||itemId)}</p><div class="ops-alert ops-danger">A promoção PRICE_DISCOUNT será removida deste anúncio. Essa ação altera a oferta no Mercado Livre imediatamente.</div><div id="endPromoMsg" aria-live="polite"></div><div class="ops-modal-actions"><button id="cancelEnd" class="btn btn-ghost" type="button">Manter promoção</button><button id="confirmEnd" class="btn btn-danger" type="button">Encerrar desconto</button></div>`);document.getElementById('cancelEnd').onclick=closeModal;document.getElementById('confirmEnd').onclick=async()=>{const btn=document.getElementById('confirmEnd');setBusy(btn,true,'Encerrando');try{await api(`/api/promotions?item_id=${encodeURIComponent(itemId)}&promotion_type=PRICE_DISCOUNT&confirm=true`,{method:'DELETE'});closeModal();ops.promotionsLoaded=false;await loadPromotions({force:true})}catch(err){showNotice(document.getElementById('endPromoMsg'),err.data?.details?.message||err.message,'error');setBusy(btn,false)}}}

  async function renderItemPromotions(itemId){const panel=document.getElementById('tab-promocoes');if(!panel||!itemId)return;panel.innerHTML='<div class="ops-skeleton"></div>';try{const data=await api(`/api/promotions?item_id=${encodeURIComponent(itemId)}`);const row=data.items?.[0];const promos=row?.promotions||[];const currency=state.items.find(i=>i.item_id===itemId)?.currency_id;panel.innerHTML=`<div class="section-card"><div class="section-head"><h2>Promoções deste anúncio</h2><button id="itemNewDiscount" class="btn btn-primary" type="button">Novo desconto</button></div>${promos.length?`<div style="display:grid;gap:9px">${promos.map(p=>`<div class="kv"><div class="kv-label">${e(promotionTypeLabel(p.type))} · ${e(statusText(p.status))}</div><div class="kv-value">${e(promotionPriceText(p,currency))}</div>${p.end_date?`<div class="mini-meta">Até ${e(dateTime(p.end_date))}</div>`:''}</div>`).join('')}</div>`:'<div class="empty"><h3>Sem promoção</h3><p>Este anúncio não possui promoção ativa ou candidata retornada pela API.</p></div>'}</div>`;document.getElementById('itemNewDiscount')?.addEventListener('click',()=>openDiscountModal(itemId))}catch(err){panel.innerHTML=`<div class="notice notice-error">${e(err.message)}</div>`}}

  function bind() {
    replaceViews();
    document.getElementById('ordersRefresh')?.addEventListener('click',()=>loadOrders({force:true}));
    document.getElementById('promosRefresh')?.addEventListener('click',()=>{ops.promotionsLoaded=false;loadPromotions({force:true})});
    document.getElementById('ordersSearch')?.addEventListener('input',ev=>{ops.orderQ=ev.target.value;document.getElementById('ordersClear')?.classList.toggle('hidden',!ops.orderQ);clearTimeout(bind.searchTimer);bind.searchTimer=setTimeout(()=>loadOrders({force:true}),300)});
    document.getElementById('ordersClear')?.addEventListener('click',()=>{ops.orderQ='';const input=document.getElementById('ordersSearch');if(input){input.value='';input.focus()}document.getElementById('ordersClear')?.classList.add('hidden');loadOrders({force:true})});
    document.querySelectorAll('.order-filter').forEach(btn=>btn.addEventListener('click',()=>{ops.orderStatus=btn.dataset.orderStatus;document.querySelectorAll('.order-filter').forEach(x=>x.classList.toggle('active',x===btn));loadOrders({force:true})}));
    document.querySelectorAll('.nav-control').forEach(btn=>btn.addEventListener('click',()=>{if(btn.dataset.view==='pedidos')loadOrders();if(btn.dataset.view==='promocoes')loadPromotions()}));
    document.addEventListener('click',ev=>{const tab=ev.target.closest?.('[data-tab="promocoes"]');if(tab)setTimeout(()=>renderItemPromotions(state?.selectedId),0)});
    const originalRefresh=window.refreshAll; // lexical refreshAll may not be on window; navigation listeners cover normal use.
    const currentView=new URL(location.href).searchParams.get('view');if(currentView==='pedidos')loadOrders();if(currentView==='promocoes')loadPromotions();
  }

  bind();
})();