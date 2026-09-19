(() => {
  const list = document.getElementById('catalog-list');
  const status = document.getElementById('catalog-status');

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
          price_mode: refs.priceMode.value
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
    const card = document.createElement('article');
    card.className = 'item';

    const media = document.createElement('div');
    media.className = 'media';
    const pictures = Array.isArray(item.pictures) ? item.pictures : [];
    if (!pictures.length) {
      const empty = document.createElement('span');
      empty.className = 'meta';
      empty.textContent = 'Anúncio sem imagem disponível.';
      media.appendChild(empty);
    } else {
      for (const src of pictures) {
        const img = document.createElement('img');
        img.src = src;
        img.alt = `Foto do anúncio ${item.title}`;
        img.loading = 'lazy';
        media.appendChild(img);
      }
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
    meta.textContent = `${item.item_id} · ${money(item.price, item.currency_id)} · ${Number(item.sold_quantity || 0)} vendidos`;
    heading.append(h2, meta);
    const badge = document.createElement('span');
    badge.className = `badge${decision.approved ? ' live' : ''}`;
    badge.textContent = decision.approved ? 'Aprovado' : 'Pendente';
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
      ['agro', 'Agro']
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
    const feedback = document.createElement('span');
    feedback.className = 'meta';
    saveButton.addEventListener('click', () => save(item, { approved: approved.input, featured: featured.input, visibility, collection, name, slug, priceMode }, saveButton, feedback));
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
      list.replaceChildren(...(data.items || []).map(renderItem));
      const approved = (data.items || []).filter((item) => item.decision?.approved).length;
      status.textContent = `${(data.items || []).length} anúncios ativos · ${approved} aprovados para o site`;
      if (!(data.items || []).length) status.textContent = 'Nenhum anúncio ativo encontrado na conta conectada.';
    } catch (error) {
      list.replaceChildren();
      status.textContent = error.message || 'Falha ao carregar anúncios.';
      status.className = 'status error';
    }
  }

  load();
})();
