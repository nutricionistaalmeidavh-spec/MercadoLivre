(() => {
  const TYPE_LABELS = {
    SELLER_CAMPAIGN: 'Campanha do vendedor',
    PRICE_DISCOUNT: 'Desconto individual',
    SELLER_COUPON_CAMPAIGN: 'Cupom do vendedor'
  };
  const GROUP_ORDER = ['active', 'scheduled', 'available', 'finished', 'other'];
  const GROUP_LABELS = {
    active: 'Promoções ativas',
    scheduled: 'Programadas',
    available: 'Oportunidades disponíveis',
    finished: 'Encerradas',
    other: 'Outras condições'
  };

  const style = document.createElement('style');
  style.textContent = `
    .promo-groups{display:grid;gap:14px;margin-top:14px}
    .promo-group{display:grid;gap:8px}
    .promo-section-title{font-size:11px;font-weight:900;letter-spacing:.065em;text-transform:uppercase;color:var(--ink-soft);padding:0 2px}
    .promo-section-list{display:grid;gap:8px}
    .promo-entry-available{border:1px dashed #d3ddd7;background:#fafbf9!important}
    .promo-no-price{font-size:11px;font-weight:800;color:var(--ink-soft);text-align:right;max-width:110px}
  `;
  document.head.appendChild(style);

  function promotionTypeLabel(type) {
    const key = String(type || '').trim().toUpperCase();
    return TYPE_LABELS[key] || String(type || 'Promoção');
  }

  function promotionGroup(statusLabel) {
    const status = String(statusLabel || '').trim().toLowerCase();
    if (status === 'ativa' || status === 'ativando') return 'active';
    if (status === 'programada') return 'scheduled';
    if (status === 'disponível') return 'available';
    if (status === 'finalizada' || status === 'removendo') return 'finished';
    return 'other';
  }

  function promotionPriceMarkup(priceText, statusLabel) {
    const text = String(priceText || '').trim();
    const group = promotionGroup(statusLabel);
    const normalized = text.replace(/\s/g, '').replace('R$', '').replace('.', '').replace(',', '.');
    const numeric = Number(normalized);
    if (group === 'available' && (!Number.isFinite(numeric) || numeric === 0)) return 'Sem preço definido';
    return text || '—';
  }

  function promotionEntryInfo(entry) {
    const top = entry.querySelector('.promo-top');
    const typeEl = top?.querySelector('strong');
    const statusEl = typeEl?.parentElement?.querySelector('div');
    const priceEl = top?.children?.[1] || null;
    const rawType = String(typeEl?.textContent || '').trim();
    const status = String(statusEl?.textContent || '').trim();
    return { top, typeEl, statusEl, priceEl, rawType, status, group: promotionGroup(status) };
  }

  function clarifyPromotionCard(card) {
    if (card.dataset.promoClarified === '1') return;
    const header = card.querySelector(':scope > .promo-top');
    const actions = card.querySelector(':scope > .promo-actions');
    const host = Array.from(card.children).find((child) => child !== header && child !== actions && child.querySelector?.('strong'));
    if (!header || !host) {
      card.dataset.promoClarified = '1';
      return;
    }

    const entries = Array.from(host.children);
    const groups = new Map(GROUP_ORDER.map((key) => [key, []]));

    for (const entry of entries) {
      const info = promotionEntryInfo(entry);
      if (info.typeEl) info.typeEl.textContent = promotionTypeLabel(info.rawType);
      if (info.priceEl) {
        const price = promotionPriceMarkup(info.priceEl.textContent, info.status);
        info.priceEl.textContent = price;
        if (price === 'Sem preço definido') {
          info.priceEl.className = 'promo-no-price';
          entry.classList.add('promo-entry-available');
        }
      }
      groups.get(info.group)?.push(entry);
    }

    const wrapper = document.createElement('div');
    wrapper.className = 'promo-groups';
    for (const key of GROUP_ORDER) {
      const rows = groups.get(key) || [];
      if (!rows.length) continue;
      const section = document.createElement('section');
      section.className = 'promo-group';
      const title = document.createElement('div');
      title.className = 'promo-section-title';
      title.textContent = GROUP_LABELS[key];
      const body = document.createElement('div');
      body.className = 'promo-section-list';
      rows.forEach((row) => body.appendChild(row));
      section.append(title, body);
      wrapper.appendChild(section);
    }
    host.replaceWith(wrapper);

    const badge = header.querySelector('.pill');
    if (badge) {
      const activeCount = (groups.get('active') || []).length;
      const scheduledCount = (groups.get('scheduled') || []).length;
      badge.classList.toggle('pill-success', activeCount > 0);
      badge.classList.toggle('pill-neutral', activeCount === 0);
      badge.textContent = activeCount
        ? `${activeCount} ativa${activeCount === 1 ? '' : 's'}`
        : scheduledCount
          ? `${scheduledCount} programada${scheduledCount === 1 ? '' : 's'}`
          : 'Sem promoção ativa';
    }

    card.dataset.promoClarified = '1';
  }

  function clarifyPromotionsHeader() {
    document.getElementById('newDiscount')?.remove();
    const view = document.getElementById('view-promocoes');
    if (!view) return;
    const intro = view.querySelector('.section-card .page-copy');
    if (intro) intro.textContent = 'Veja separadamente o que está ativo, programado ou apenas disponível. Para criar um desconto individual, use o botão dentro do anúncio correspondente.';
  }

  function clarifyDetailPanel() {
    const panel = document.getElementById('tab-promocoes');
    if (!panel) return;
    panel.querySelectorAll('.kv').forEach((row) => {
      const label = row.querySelector('.kv-label');
      const value = row.querySelector('.kv-value');
      if (!label) return;
      const original = String(label.textContent || '');
      for (const [type, translated] of Object.entries(TYPE_LABELS)) {
        if (original.includes(type)) label.textContent = original.replace(type, translated);
      }
      if (value && /Disponível/i.test(label.textContent || '') && /(?:R\$\s*)?0(?:[.,]00)?/.test(String(value.textContent || '').trim())) {
        value.textContent = 'Sem preço definido';
      }
    });
  }

  function applyPromotionClarity() {
    clarifyPromotionsHeader();
    document.querySelectorAll('#promosList .promo-card').forEach(clarifyPromotionCard);
    clarifyDetailPanel();
  }

  let scheduled = false;
  const observer = new MutationObserver(() => {
    if (scheduled) return;
    scheduled = true;
    queueMicrotask(() => {
      scheduled = false;
      applyPromotionClarity();
    });
  });
  observer.observe(document.body, { childList: true, subtree: true });
  applyPromotionClarity();
})();
