(() => {
  const list = document.getElementById('catalog-list');
  const status = document.getElementById('catalog-status');
  const search = document.getElementById('catalog-search');
  const filter = document.getElementById('catalog-filter');
  const sort = document.getElementById('catalog-sort');
  const LIVE_COLLECTIONS = new Set(['agro']);
  let catalogItems = [];
  let generatedAt = '';

  function money(value, currency = 'BRL') {
    if (!Number.isFinite(Number(value))) return 'Preço indisponível';
    return new Intl.NumberFormat('pt-BR', { style: 'currency', currency }).format(Number(value));
  }

  function slugify(value) {
    return String(value || '').normalize('NFD').replace(/[\u0300-\u036f]/g, '').toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/^-+|-+$/g, '').slice(0, 100);
  }

  function field(label, control) {
    const wrapper = document.createElement('label');
    wrapper.className = 'field';
    const title = document.createElement('span');
    title.textContent = label;
    wrapper.append(title, control);
    return wrapper;
  }

  function select(options, value) {
    const node = document.createElement('select');
    for (const [optionValue, label] of options) {
      const option = document.createElement('option');
      option.value = optionValue;
      option.textContent = label;
      option.selected = optionValue === value;
      node.appendChild(option);
    }
    return node;
  }

  function checkbox(label, checked) {
    const wrapper = document.createElement('label');
    const input = document.createElement('input');
    input.type = 'checkbox';
    input.checked = Boolean(checked);
    wrapper.append(input, document.createTextNode(label));
    return { wrapper, input };
  }

  function editorialState(item) {
    const decision = item.decision || {};
    if (decision.approved) return { key: 'approved', label: 'Aprovado', className: 'live' };
    if (decision.configured === false) return { key: 'pending', label: 'Pendente', className: '' };
    if ((decision.site_visibility || 'hidden') === 'hidden') return { key: 'hidden', label: 'Oculto', className: 'hidden' };
    if (decision.site_visibility === 'collection' && decision.collection_slug && !LIVE_COLLECTIONS.has(decision.collection_slug)) {
      return { key: 'awaiting', label: 'Aguardando coleção', className: 'wait' };
    }
    return { key: 'pending', label: 'Pendente', className: '' };
  }

  function visibleItems() {
    const query = String(search?.value || '').trim().toLocaleLowerCase('pt-BR');
    const wanted = filter?.value || 'all';
    const order = sort?.value || 'sold-desc';
    const items = catalogItems.filter((item) => {
      const decision = item.decision || {};
      const haystack = [item.item_id, item.title, decision.site_name].map((value) => String(value || '').toLocaleLowerCase('pt-BR')).join(' ');
      if (query && !haystack.includes(query)) return false;
      return wanted === 'all' || editorialState(item).key === wanted;
    });
    items.sort((a, b) => {
      if (order === 'name-asc') return String(a.decision?.site_name || a.title || '').localeCompare(String(b.decision?.site_name || b.title || ''), 'pt-BR');
      if (order === 'price-desc') return Number(b.price || 0) - Number(a.price || 0);
      if (order === 'price-asc') return Number(a.price || 0) - Number(b.price || 0);
      return Number(b.sold_quantity || 0) - Number(a.sold_quantity || 0);
    });
    return items;
  }

  function updateStatus(renderedCount) {
    const approved = catalogItems.filter((item) => editorialState(item).key === 'approved').length;
    const pending = catalogItems.filter((item) => editorialState(item).key === 'pending').length;
    const awaiting = catalogItems.filter((item) => editorialState(item).key === 'awaiting').length;
    const parts = [`${catalogItems.length} anúncios ativos`, `${approved} aprovados`, `${pending} pendentes`];
    if (awaiting) parts.push(`${awaiting} aguardando coleção`);
    if (renderedCount !== catalogItems.length) parts.push(`${renderedCount} exibidos`);
    if (generatedAt) {
      const date = new Date(generatedAt);
      if (!Number.isNaN(date.getTime())) parts.push(`sincronizado ${date.toLocaleString('pt-BR')}`);
    }
    status.textContent = parts.join(' · ');
  }

  function render() {
    const items = visibleItems();
    if (!items.length) {
      const empty = document.createElement('div');
      empty.className = 'empty';
      empty.textContent = catalogItems.length ? 'Nenhum anúncio corresponde aos filtros atuais.' : 'Nenhum anúncio ativo encontrado na conta conectada.';
      list.replaceChildren(empty);
    } else {
      list.replaceChildren(...items.map(renderItem));
    }
    updateStatus(items.length);
  }

  async function save(item, refs, button, feedback) {
    button.disabled = true;
    feedback.textContent = 'Salvando…';
    feedback.className = 'meta';
    try {
      if (refs.visibility.value === 'individual' && !refs.slug.value.trim()) {
        refs.slug.value = slugify(refs.name.value || item.title || item.item_id);
      }
      const response = await fetch('/api/site-catalog/admin', {
        method: 'POST',
        credentials: 'same-origin',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify({
          item_id: item.item_id,
          approved: refs.approved.checked,
          site_visibility: refs.visibility.value,
          collection_slug: refs.collection.value,
          site_name: refs.name.value,
          site_slug: refs.slug.value,
          featured: refs.featured.checked,
          price_mode: refs.priceMode.value,
          hero_picture_url: refs.heroPicture.value
        })
      });
      const data = await response.json().catch(() => ({}));
      if (!response.ok) throw new Error(data.error || `HTTP ${response.status}`);
      feedback.textContent = data.decision?.approved ? 'Aprovado e salvo.' : 'Salvo. Ainda não publicado.';
      feedback.className = data.decision?.approved ? 'meta ok' : 'meta';
      await load();
    } catch (error) {
      feedback.textContent = error.message || 'Falha ao salvar.';
      feedback.className = 'meta error';
    } finally {
      button.disabled = false;
    }
  }

  function renderItem(item) {
    const decision = item.decision || {};
    const state = editorialState(item);
    const card = document.createElement('article');
    card.className = 'item';

    const media = document.createElement('div');
    media.className = 'media';
    const pictures = Array.isArray(item.pictures) ? item.pictures : [];
    const heroPicture = { value: decision.hero_picture_url || '' };
    if (!pictures.length) {
      const empty = document.createElement('span');
      empty.className = 'meta';
      empty.textContent = 'Anúncio sem imagem disponível.';
      media.appendChild(empty);
    } else {
      const coverButtons = [];
      const refreshCover = () => {
        for (const entry of coverButtons) {
          const selected = entry.src === heroPicture.value;
          entry.button.classList.toggle('selected', selected);
          entry.button.setAttribute('aria-pressed', String(selected));
          entry.label.textContent = selected ? 'Capa escolhida' : 'Escolher como capa';
        }
      };
      for (const src of pictures) {
        const button = document.createElement('button');
        button.type = 'button';
        button.className = 'cover-option';
        const img = document.createElement('img');
        img.src = src;
        img.alt = `Foto do anúncio ${item.title}`;
        img.loading = 'lazy';
        const label = document.createElement('span');
        button.append(img, label);
        button.addEventListener('click', () => {
          heroPicture.value = heroPicture.value === src ? '' : src;
          refreshCover();
        });
        coverButtons.push({ button, label, src });
        media.appendChild(button);
      }
      refreshCover();
    }

    const body = document.createElement('div');
    body.className = 'body';
    const headline = document.createElement('div');
    headline.className = 'headline';
    const heading = document.createElement('div');
    const h2 = document.createElement('h2');
    h2.textContent = item.title || item.item_id;
    const meta = document.createElement('div');
    meta.className = 'meta';
    const stock = Number.isFinite(Number(item.available_quantity)) ? Number(item.available_quantity) : '—';
    meta.textContent = `${item.item_id} · ${money(item.price, item.currency_id)} · ${Number(item.sold_quantity || 0)} vendidos · estoque ${stock}`;
    heading.append(h2, meta);
    const badge = document.createElement('span');
    badge.className = `badge ${state.className}`.trim();
    badge.textContent = state.label;
    headline.append(heading, badge);

    const controls = document.createElement('div');
    controls.className = 'controls';
    const name = document.createElement('input');
    name.value = decision.site_name || item.title || '';
    const slug = document.createElement('input');
    slug.value = decision.site_slug || '';
    name.addEventListener('blur', () => { if (!slug.value.trim()) slug.value = slugify(name.value); });
    const topRow = document.createElement('div');
    topRow.className = 'row';
    topRow.append(field('Nome no site', name), field('Slug no site', slug));

    const visibility = select([
      ['hidden', 'Ocultar do site'],
      ['individual', 'Página individual'],
      ['collection', 'Página de coleção'],
      ['external', 'Link externo'],
      ['digital', 'Produto digital']
    ], decision.site_visibility || 'hidden');
    const collection = select([
      ['', 'Sem coleção'],
      ['agro', 'Agro'],
      ['negocios', 'Negócios'],
      ['saude', 'Saúde']
    ], decision.collection_slug || '');
    const priceMode = select([
      ['marketplace', 'Usar preço do Mercado Livre'],
      ['contact', 'Sob consulta'],
      ['hidden', 'Não mostrar preço']
    ], decision.price_mode || 'marketplace');
    const secondRow = document.createElement('div');
    secondRow.className = 'row';
    secondRow.append(field('Onde aparece', visibility), field('Coleção', collection), field('Preço', priceMode));

    const approved = checkbox('Aprovado para o site', decision.approved);
    const featured = checkbox('Destaque', decision.featured);
    const checks = document.createElement('div');
    checks.className = 'checks';
    checks.append(approved.wrapper, featured.wrapper);

    const feedback = document.createElement('span');
    feedback.className = 'meta';
    const syncApprovalAvailability = () => {
      const waiting = visibility.value === 'collection' && collection.value && !LIVE_COLLECTIONS.has(collection.value);
      approved.input.disabled = waiting;
      if (waiting) {
        approved.input.checked = false;
        feedback.textContent = 'Aguardando coleção: classificação pode ser salva, mas ainda não publicada.';
        feedback.className = 'meta';
      } else if (feedback.textContent.startsWith('Aguardando coleção')) {
        feedback.textContent = '';
      }
    };
    visibility.addEventListener('change', syncApprovalAvailability);
    collection.addEventListener('change', syncApprovalAvailability);
    syncApprovalAvailability();

    const actions = document.createElement('div');
    actions.className = 'actions';
    const saveButton = document.createElement('button');
    saveButton.type = 'button';
    saveButton.className = 'button';
    saveButton.textContent = 'Salvar classificação';
    const link = document.createElement('a');
    link.className = 'button secondary';
    link.href = item.permalink || '#';
    link.target = '_blank';
    link.rel = 'noopener noreferrer';
    link.textContent = 'Ver anúncio';
    saveButton.addEventListener('click', () => save(item, {
      approved: approved.input,
      featured: featured.input,
      visibility,
      collection,
      name,
      slug,
      priceMode,
      heroPicture
    }, saveButton, feedback));
    actions.append(saveButton, link, feedback);

    controls.append(topRow, secondRow, checks, actions);
    body.append(headline, controls);
    card.append(media, body);
    return card;
  }

  async function load() {
    status.textContent = 'Carregando anúncios…';
    status.className = 'status';
    try {
      const response = await fetch('/api/site-catalog/admin', { credentials: 'same-origin' });
      const data = await response.json().catch(() => ({}));
      if (!response.ok) throw new Error(data.error || `HTTP ${response.status}`);
      catalogItems = Array.isArray(data.items) ? data.items : [];
      generatedAt = data.generated_at || new Date().toISOString();
      render();
    } catch (error) {
      catalogItems = [];
      list.replaceChildren();
      status.textContent = error.message || 'Falha ao carregar anúncios.';
      status.className = 'status error';
    }
  }

  search?.addEventListener('input', render);
  filter?.addEventListener('change', render);
  sort?.addEventListener('change', render);
  load();
})();
