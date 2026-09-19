(() => {
  const list = document.getElementById('catalog-list');
  const status = document.getElementById('catalog-status');
  const search = document.getElementById('catalog-search');
  const filter = document.getElementById('catalog-filter');
  const sort = document.getElementById('catalog-sort');
  const suggestions = document.getElementById('catalog-suggestions');
  const selectionBar = document.getElementById('catalog-selection-bar');
  const selectionCopy = document.getElementById('catalog-selection-copy');
  const groupName = document.getElementById('catalog-group-name');
  const groupSelectedButton = document.getElementById('catalog-group-selected');
  const clearSelectionButton = document.getElementById('catalog-clear-selection');
  let liveCollections = new Map([['agro', 'Agro']]);
  const TITLE_STOPWORDS = new Set(['sistema', 'software', 'artisys', 'completo', 'completa', 'para', 'com', 'de', 'do', 'da', 'dos', 'das', 'e']);
  let catalogItems = [];
  let catalogGroups = [];
  let generatedAt = '';
  let collectionsSource = 'fallback';
  let collectionsWarning = '';
  let canonicalProducts = [];
  let productsSource = 'unavailable';
  let productsWarning = '';
  let selectedIds = new Set();

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

  function editorialState(decision = {}, configured = true) {
    if (decision.approved) return { key: 'approved', label: 'Aprovado', className: 'live' };
    if (!configured) return { key: 'pending', label: 'Pendente', className: '' };
    if ((decision.site_visibility || 'hidden') === 'hidden') return { key: 'hidden', label: 'Oculto', className: 'hidden' };
    if (decision.site_visibility === 'collection' && decision.collection_slug && !liveCollections.has(decision.collection_slug)) {
      return { key: 'awaiting', label: 'Aguardando coleção', className: 'wait' };
    }
    return { key: 'pending', label: 'Pendente', className: '' };
  }

  function itemById(itemId) {
    return catalogItems.find((item) => item.item_id === itemId) || null;
  }

  function ungroupedItems() {
    return catalogItems.filter((item) => !item.group_id);
  }

  function groupPrimary(group) {
    return itemById(group.primary_item_id);
  }

  function entryForGroup(group) {
    const primary = groupPrimary(group);
    return {
      kind: 'group',
      id: group.group_id,
      group,
      name: group.site_name || primary?.title || 'Produto agrupado',
      price: primary?.price ?? null,
      currency: primary?.currency_id || 'BRL',
      sold: Number(group.sold_quantity || 0),
      state: editorialState(group, true),
      haystack: [group.site_name, group.site_slug, group.group_id, ...(group.item_ids || []).flatMap((id) => {
        const item = itemById(id);
        return [id, item?.title || ''];
      })].join(' ').toLocaleLowerCase('pt-BR')
    };
  }

  function entryForItem(item) {
    return {
      kind: 'item',
      id: item.item_id,
      item,
      name: item.decision?.site_name || item.title || item.item_id,
      price: item.price,
      currency: item.currency_id || 'BRL',
      sold: Number(item.sold_quantity || 0),
      state: editorialState(item.decision || {}, item.decision?.configured !== false),
      haystack: [item.item_id, item.title, item.decision?.site_name].join(' ').toLocaleLowerCase('pt-BR')
    };
  }

  function allEntries() {
    return [...catalogGroups.map(entryForGroup), ...ungroupedItems().map(entryForItem)];
  }

  function visibleEntries() {
    const query = String(search?.value || '').trim().toLocaleLowerCase('pt-BR');
    const wanted = filter?.value || 'all';
    const order = sort?.value || 'sold-desc';
    const entries = allEntries().filter((entry) => {
      if (query && !entry.haystack.includes(query)) return false;
      if (wanted === 'grouped') return entry.kind === 'group';
      if (wanted === 'ungrouped') return entry.kind === 'item';
      return wanted === 'all' || entry.state.key === wanted;
    });
    entries.sort((a, b) => {
      if (order === 'name-asc') return a.name.localeCompare(b.name, 'pt-BR');
      if (order === 'price-desc') return Number(b.price || 0) - Number(a.price || 0);
      if (order === 'price-asc') return Number(a.price || 0) - Number(b.price || 0);
      return b.sold - a.sold;
    });
    return entries;
  }

  function normalizeTitleTokens(value) {
    return [...new Set(String(value || '')
      .normalize('NFD').replace(/[\u0300-\u036f]/g, '')
      .toLowerCase().split(/[^a-z0-9]+/)
      .filter((token) => token.length >= 3 && !TITLE_STOPWORDS.has(token)))];
  }

  function duplicateScore(a, b) {
    if (a.category_id && b.category_id && a.category_id !== b.category_id) return 0;
    const pa = Number(a.price || 0);
    const pb = Number(b.price || 0);
    if (pa > 0 && pb > 0 && Math.max(pa, pb) / Math.min(pa, pb) > 1.8) return 0;
    const left = new Set(normalizeTitleTokens(a.title));
    const right = new Set(normalizeTitleTokens(b.title));
    if (!left.size || !right.size) return 0;
    let intersection = 0;
    for (const token of left) if (right.has(token)) intersection += 1;
    const union = new Set([...left, ...right]).size;
    return union ? intersection / union : 0;
  }

  function duplicateCandidate(item) {
    let best = null;
    let bestScore = 0;
    for (const candidate of ungroupedItems()) {
      if (candidate.item_id === item.item_id) continue;
      const score = duplicateScore(item, candidate);
      if (score > bestScore) {
        best = candidate;
        bestScore = score;
      }
    }
    return bestScore >= 0.45 ? best : null;
  }

  function renderSuggestions() {
    const seen = new Set();
    const nodes = [];
    for (const item of ungroupedItems()) {
      const candidate = duplicateCandidate(item);
      if (!candidate) continue;
      const pair = [item.item_id, candidate.item_id].sort().join(':');
      if (seen.has(pair)) continue;
      seen.add(pair);
      const node = document.createElement('div');
      node.className = 'suggestion';
      node.textContent = `Possível duplicidade: ${item.title} + ${candidate.title}. Se forem o mesmo produto, selecione os dois para agrupar.`;
      nodes.push(node);
      if (nodes.length >= 4) break;
    }
    suggestions.replaceChildren(...nodes);
  }

  function updateStatus(renderedCount) {
    const entries = allEntries();
    const approved = entries.filter((entry) => entry.state.key === 'approved').length;
    const parts = [
      `${entries.length} produtos`,
      `${catalogGroups.length} agrupados`,
      `${ungroupedItems().length} anúncios não agrupados`,
      `${approved} aprovados`,
      `${liveCollections.size} coleções publicadas`
    ];
    if (renderedCount !== entries.length) parts.push(`${renderedCount} exibidos`);
    if (generatedAt) {
      const date = new Date(generatedAt);
      if (!Number.isNaN(date.getTime())) parts.push(`sincronizado ${date.toLocaleString('pt-BR')}`);
    }
    if (collectionsSource === 'fallback') parts.push('coleções em fallback');
    status.textContent = parts.join(' · ');
    status.title = collectionsWarning || '';
  }

  function summaryThumb(src, label) {
    if (!src) {
      const empty = document.createElement('div');
      empty.className = 'summary-thumb empty';
      empty.textContent = 'sem foto';
      return empty;
    }
    const img = document.createElement('img');
    img.className = 'summary-thumb';
    img.src = src;
    img.alt = label;
    img.loading = 'lazy';
    return img;
  }

  function badge(state) {
    const node = document.createElement('span');
    node.className = `badge ${state.className}`.trim();
    node.textContent = state.label;
    return node;
  }

  function chevron() {
    const node = document.createElement('span');
    node.className = 'chevron';
    node.textContent = '▼';
    return node;
  }

  function renderMedia(pictures, heroPicture, label) {
    const media = document.createElement('div');
    media.className = 'media';
    if (!pictures.length) {
      const empty = document.createElement('span');
      empty.className = 'meta';
      empty.textContent = 'Sem imagem disponível.';
      media.appendChild(empty);
      return { media, heroPicture };
    }
    const buttons = [];
    const refresh = () => {
      for (const entry of buttons) {
        const selected = entry.src === heroPicture.value;
        entry.button.classList.toggle('selected', selected);
        entry.button.setAttribute('aria-pressed', String(selected));
        entry.caption.textContent = selected ? 'Capa escolhida' : 'Escolher como capa';
      }
    };
    for (const src of pictures) {
      const button = document.createElement('button');
      button.type = 'button';
      button.className = 'cover-option';
      const img = document.createElement('img');
      img.src = src;
      img.alt = label;
      img.loading = 'lazy';
      const caption = document.createElement('span');
      button.append(img, caption);
      button.addEventListener('click', () => {
        heroPicture.value = heroPicture.value === src ? '' : src;
        refresh();
      });
      buttons.push({ button, caption, src });
      media.appendChild(button);
    }
    refresh();
    return { media, heroPicture };
  }

  function classificationControls(source) {
    const name = document.createElement('input');
    name.value = source.site_name || '';
    const slug = document.createElement('input');
    slug.value = source.site_slug || '';
    name.addEventListener('blur', () => { if (!slug.value.trim()) slug.value = slugify(name.value); });
    const visibility = select([
      ['hidden', 'Ocultar do site'],
      ['individual', 'Página individual'],
      ['collection', 'Página de coleção'],
      ['external', 'Link externo'],
      ['digital', 'Produto digital']
    ], source.site_visibility || 'hidden');
    const collection = select([
      ['', 'Sem coleção'],
      ...[...liveCollections.entries()].map(([slugValue, label]) => [slugValue, label])
    ], source.collection_slug || '');
    const priceMode = select([
      ['marketplace', 'Usar preço do Mercado Livre'],
      ['contact', 'Sob consulta'],
      ['hidden', 'Não mostrar preço']
    ], source.price_mode || 'marketplace');
    const approved = checkbox('Aprovado para o site', source.approved);
    const featured = checkbox('Destaque', source.featured);
    const feedback = document.createElement('span');
    feedback.className = 'meta';
    const syncApprovalAvailability = () => {
      const waiting = visibility.value === 'collection' && collection.value && !liveCollections.has(collection.value);
      approved.input.disabled = waiting;
      if (waiting) {
        approved.input.checked = false;
        feedback.textContent = 'Aguardando coleção: pode salvar, mas ainda não publicar.';
      } else if (feedback.textContent.startsWith('Aguardando coleção')) {
        feedback.textContent = '';
      }
    };
    visibility.addEventListener('change', syncApprovalAvailability);
    collection.addEventListener('change', syncApprovalAvailability);
    syncApprovalAvailability();
    return { name, slug, visibility, collection, priceMode, approved, featured, feedback };
  }

  function appendClassificationForm(parent, controls) {
    const first = document.createElement('div');
    first.className = 'row two';
    first.append(field('Nome no site', controls.name), field('Slug no site', controls.slug));
    const second = document.createElement('div');
    second.className = 'row';
    second.append(field('Onde aparece', controls.visibility), field('Coleção', controls.collection), field('Preço', controls.priceMode));
    const checks = document.createElement('div');
    checks.className = 'checks';
    checks.append(controls.approved.wrapper, controls.featured.wrapper);
    parent.append(first, second, checks);
  }

  async function postCatalog(payload) {
    const response = await fetch('/api/site-catalog/admin', {
      method: 'POST',
      credentials: 'same-origin',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify(payload)
    });
    const data = await response.json().catch(() => ({}));
    if (!response.ok) throw new Error(data.error || `HTTP ${response.status}`);
    return data;
  }

async function postLinking(groupId, linkedProductSlug) {
  const response = await fetch('/api/site-catalog/linking', {
    method: 'POST',
    credentials: 'same-origin',
    headers: { 'content-type': 'application/json' },
    body: JSON.stringify({ group_id: groupId, linked_product_slug: linkedProductSlug })
  });
  const data = await response.json().catch(() => ({}));
  if (!response.ok) throw new Error(data.error || `HTTP ${response.status}`);
  return data;
}

  async function saveItem(item, controls, heroPicture, button) {
    button.disabled = true;
    controls.feedback.textContent = 'Salvando…';
    try {
      if (controls.visibility.value === 'individual' && !controls.slug.value.trim()) controls.slug.value = slugify(controls.name.value || item.title);
      await postCatalog({
        action: 'save_item',
        item_id: item.item_id,
        approved: controls.approved.input.checked,
        site_visibility: controls.visibility.value,
        collection_slug: controls.collection.value,
        site_name: controls.name.value,
        site_slug: controls.slug.value,
        featured: controls.featured.input.checked,
        price_mode: controls.priceMode.value,
        hero_picture_url: heroPicture.value
      });
      controls.feedback.textContent = 'Classificação salva.';
      controls.feedback.className = 'meta ok';
      await load();
    } catch (error) {
      controls.feedback.textContent = error.message || 'Falha ao salvar.';
      controls.feedback.className = 'meta error';
    } finally {
      button.disabled = false;
    }
  }

  function toggleSelected(item, checked) {
    if (checked) selectedIds.add(item.item_id);
    else selectedIds.delete(item.item_id);
    syncSelectionBar();
  }

  function syncSelectionBar() {
    const validIds = new Set(ungroupedItems().map((item) => item.item_id));
    selectedIds = new Set([...selectedIds].filter((id) => validIds.has(id)));
    const count = selectedIds.size;
    selectionBar.classList.toggle('active', count > 0);
    selectionCopy.textContent = `${count} anúncio${count === 1 ? '' : 's'} selecionado${count === 1 ? '' : 's'}`;
    groupSelectedButton.disabled = count < 2;
    if (count && !groupName.value.trim()) {
      const first = itemById([...selectedIds][0]);
      groupName.value = first?.decision?.site_name || first?.title || '';
    }
    if (!count) groupName.value = '';
  }

  async function groupSelected() {
    const itemIds = [...selectedIds];
    if (itemIds.length < 2) return;
    groupSelectedButton.disabled = true;
    selectionCopy.textContent = 'Agrupando anúncios…';
    try {
      await postCatalog({ action: 'create_group', item_ids: itemIds, site_name: groupName.value.trim() });
      selectedIds.clear();
      groupName.value = '';
      await load();
    } catch (error) {
      selectionCopy.textContent = error.message || 'Falha ao agrupar.';
    } finally {
      groupSelectedButton.disabled = selectedIds.size < 2;
    }
  }

  async function addItemToGroup(item, group, button, feedback) {
    button.disabled = true;
    feedback.textContent = 'Adicionando…';
    try {
      await postCatalog({
        action: 'save_group',
        group_id: group.group_id,
        item_ids: [...new Set([...(group.item_ids || []), item.item_id])],
        primary_item_id: group.primary_item_id,
        approved: group.approved,
        site_visibility: group.site_visibility,
        collection_slug: group.collection_slug,
        site_name: group.site_name,
        site_slug: group.site_slug,
        featured: group.featured,
        price_mode: group.price_mode,
        hero_picture_url: group.hero_picture_url
      });
      await load();
    } catch (error) {
      feedback.textContent = error.message || 'Falha ao adicionar ao grupo.';
      feedback.className = 'meta error';
    } finally {
      button.disabled = false;
    }
  }

  function renderItemCard(item) {
    const state = editorialState(item.decision || {}, item.decision?.configured !== false);
    const details = document.createElement('details');
    details.className = 'item';
    const summary = document.createElement('summary');
    summary.className = 'compact-summary';

    const selector = document.createElement('input');
    selector.type = 'checkbox';
    selector.className = 'select-box';
    selector.checked = selectedIds.has(item.item_id);
    selector.setAttribute('aria-label', `Selecionar ${item.title}`);
    selector.addEventListener('click', (event) => event.stopPropagation());
    selector.addEventListener('change', () => toggleSelected(item, selector.checked));

    const thumb = summaryThumb(item.pictures?.[0], `Foto de ${item.title}`);
    const main = document.createElement('div');
    main.className = 'summary-main';
    const title = document.createElement('div');
    title.className = 'summary-title';
    title.textContent = item.title || item.item_id;
    const meta = document.createElement('div');
    meta.className = 'summary-meta';
    meta.textContent = `${money(item.price, item.currency_id)} · ${Number(item.sold_quantity || 0)} vendidos · ${item.item_id}`;
    main.append(title, meta);
    const duplicate = duplicateCandidate(item);
    if (duplicate) {
      const hint = document.createElement('div');
      hint.className = 'duplicate-hint';
      hint.textContent = `Possível duplicidade com ${duplicate.title}`;
      main.appendChild(hint);
    }
    const side = document.createElement('div');
    side.className = 'summary-side';
    side.append(badge(state), chevron());
    summary.append(selector, thumb, main, side);

    const detail = document.createElement('div');
    detail.className = 'detail';
    const heroPicture = { value: item.decision?.hero_picture_url || '' };
    const media = renderMedia(Array.isArray(item.pictures) ? item.pictures : [], heroPicture, `Foto de ${item.title}`);
    const controls = classificationControls({
      ...item.decision,
      site_name: item.decision?.site_name || item.title || ''
    });
    const form = document.createElement('div');
    form.className = 'controls';
    appendClassificationForm(form, controls);

    if (catalogGroups.length) {
      const addRow = document.createElement('div');
      addRow.className = 'row two';
      const groupSelect = select(catalogGroups.map((group) => [group.group_id, group.site_name || group.group_id]), catalogGroups[0]?.group_id || '');
      const addButton = document.createElement('button');
      addButton.type = 'button';
      addButton.className = 'button secondary';
      addButton.textContent = 'Adicionar a grupo existente';
      const addFeedback = document.createElement('span');
      addFeedback.className = 'meta';
      addButton.addEventListener('click', () => {
        const group = catalogGroups.find((entry) => entry.group_id === groupSelect.value);
        if (group) addItemToGroup(item, group, addButton, addFeedback);
      });
      addRow.append(field('Grupo existente', groupSelect), addButton);
      form.append(addRow, addFeedback);
    }

    const actions = document.createElement('div');
    actions.className = 'actions';
    const saveButton = document.createElement('button');
    saveButton.type = 'button';
    saveButton.className = 'button';
    saveButton.textContent = 'Salvar classificação';
    saveButton.addEventListener('click', () => saveItem(item, controls, heroPicture, saveButton));
    const link = document.createElement('a');
    link.className = 'button secondary';
    link.href = item.permalink || '#';
    link.target = '_blank';
    link.rel = 'noopener noreferrer';
    link.textContent = 'Ver anúncio';
    actions.append(saveButton, link, controls.feedback);
    form.append(actions);
    detail.append(media.media, form);
    details.append(summary, detail);
    return details;
  }

  function renderGroupCard(group) {
    const memberItems = (group.item_ids || []).map(itemById).filter(Boolean);
    const primary = groupPrimary(group);
    const state = editorialState(group, true);
    const details = document.createElement('details');
    details.className = 'item';
    const summary = document.createElement('summary');
    summary.className = 'compact-summary';
    const spacer = document.createElement('span');
    spacer.className = 'select-box';
    const thumb = summaryThumb(group.hero_picture_url || group.pictures?.[0] || primary?.pictures?.[0], `Capa de ${group.site_name}`);
    const main = document.createElement('div');
    main.className = 'summary-main';
    const title = document.createElement('div');
    title.className = 'summary-title';
    title.textContent = group.site_name || primary?.title || 'Produto agrupado';
    const meta = document.createElement('div');
    meta.className = 'summary-meta';
    meta.textContent = `${memberItems.length} anúncios · ${Number(group.sold_quantity || 0)} vendidos${primary ? ` · principal ${primary.item_id}` : ' · principal indisponível'}`;
    main.append(title, meta);
    const side = document.createElement('div');
    side.className = 'summary-side';
    side.append(badge(state), chevron());
    summary.append(spacer, thumb, main, side);

    const detail = document.createElement('div');
    detail.className = 'detail';
    const membersLabel = document.createElement('div');
    membersLabel.className = 'section-label';
    membersLabel.textContent = 'Anúncios do produto';
    const members = document.createElement('div');
    members.className = 'members';
    const memberRefs = [];
    for (const item of memberItems) {
      const row = document.createElement('div');
      row.className = 'member';
      const include = document.createElement('input');
      include.type = 'checkbox';
      include.checked = true;
      include.className = 'select-box';
      const info = document.createElement('div');
      info.className = 'member-name';
      info.textContent = item.title || item.item_id;
      const small = document.createElement('small');
      small.textContent = `${item.item_id} · ${money(item.price, item.currency_id)} · ${Number(item.sold_quantity || 0)} vendas`;
      info.appendChild(document.createElement('br'));
      info.appendChild(small);
      const primaryLabel = document.createElement('label');
      primaryLabel.className = 'primary-label';
      const primaryRadio = document.createElement('input');
      primaryRadio.type = 'radio';
      primaryRadio.name = `primary-${group.group_id}`;
      primaryRadio.value = item.item_id;
      primaryRadio.checked = item.item_id === group.primary_item_id;
      primaryLabel.append(primaryRadio, document.createTextNode('Anúncio principal'));
      row.append(include, info, primaryLabel);
      members.appendChild(row);
      memberRefs.push({ item, include, primaryRadio });
    }

    const heroPicture = { value: group.hero_picture_url || '' };
    const media = renderMedia(Array.isArray(group.pictures) ? group.pictures : [], heroPicture, `Foto de ${group.site_name}`);
    const controls = classificationControls(group);
    const form = document.createElement('div');
    form.className = 'controls';
    const linkedProductSlug = String(group.linked_product_slug || '');
  const productSelect = select([
    ['', 'Sem página vinculada'],
    ...canonicalProducts.map((product) => [
      String(product.slug || ''),
      `${product.name || product.slug}${product.category ? ` · ${product.category}` : ''}`
    ])
  ], linkedProductSlug);
  const linkButton = document.createElement('button');
  linkButton.type = 'button';
  linkButton.className = 'button secondary';
  linkButton.textContent = 'Salvar vínculo';
  linkButton.disabled = productsSource === 'unavailable' || canonicalProducts.length === 0;
  productSelect.disabled = linkButton.disabled;
  const linkFeedback = document.createElement('span');
  linkFeedback.className = 'meta';
  if (productsSource === 'unavailable') {
    linkFeedback.textContent = productsWarning || 'Não foi possível carregar as páginas ArtiSys.';
    linkFeedback.className = 'meta error';
  } else if (linkedProductSlug) {
    const currentProduct = canonicalProducts.find((product) => String(product.slug || '') === linkedProductSlug);
    linkFeedback.textContent = currentProduct ? `Página atual: ${currentProduct.name}.` : 'Página vinculada.';
  } else {
    linkFeedback.textContent = 'Selecione manualmente a página ArtiSys representada por este grupo.';
  }
  const linkRow = document.createElement('div');
  linkRow.className = 'row two artisys-link-row';
  linkRow.append(field('Página ArtiSys vinculada', productSelect), linkButton);
  linkButton.addEventListener('click', async () => {
    linkButton.disabled = true;
    productSelect.disabled = true;
    linkFeedback.textContent = 'Salvando vínculo…';
    linkFeedback.className = 'meta';
    try {
      const linked = await postLinking(group.group_id, productSelect.value);
      group.linked_product_slug = String(linked.linked_product_slug || '');
      if (linked.site_name !== undefined) controls.name.value = String(linked.site_name || '');
      if (linked.site_slug !== undefined) controls.slug.value = String(linked.site_slug || '');
      if (linked.site_visibility) controls.visibility.value = String(linked.site_visibility);
      controls.collection.value = String(linked.collection_slug || '');
      controls.approved.input.checked = Boolean(linked.approved);
      linkFeedback.textContent = productSelect.value
        ? `Vinculado a ${linked.site_name || productSelect.selectedOptions[0]?.textContent || productSelect.value}.`
        : 'Vínculo removido.';
      linkFeedback.className = 'meta ok';
      await load();
    } catch (error) {
      linkFeedback.textContent = error.message || 'Falha ao salvar vínculo.';
      linkFeedback.className = 'meta error';
      linkButton.disabled = productsSource === 'unavailable' || canonicalProducts.length === 0;
      productSelect.disabled = linkButton.disabled;
    }
  });

  form.append(linkRow, linkFeedback);
  appendClassificationForm(form, controls);

  const actions = document.createElement('div');
    actions.className = 'actions';
    const saveButton = document.createElement('button');
    saveButton.type = 'button';
    saveButton.className = 'button';
    saveButton.textContent = 'Salvar produto agrupado';
    saveButton.addEventListener('click', async () => {
      const itemIds = memberRefs.filter((ref) => ref.include.checked).map((ref) => ref.item.item_id);
      const primaryRef = memberRefs.find((ref) => ref.primaryRadio.checked && ref.include.checked);
      if (itemIds.length < 2) {
        controls.feedback.textContent = 'Mantenha ao menos dois anúncios ou use Desagrupar produto.';
        controls.feedback.className = 'meta error';
        return;
      }
      if (!primaryRef) {
        controls.feedback.textContent = 'Escolha um Anúncio principal que permaneça no grupo.';
        controls.feedback.className = 'meta error';
        return;
      }
      if (controls.visibility.value === 'individual' && !controls.slug.value.trim()) controls.slug.value = slugify(controls.name.value);
      saveButton.disabled = true;
      controls.feedback.textContent = 'Salvando grupo…';
      try {
        await postCatalog({
          action: 'save_group',
          group_id: group.group_id,
          item_ids: itemIds,
          primary_item_id: primaryRef.item.item_id,
          approved: controls.approved.input.checked,
          site_visibility: controls.visibility.value,
          collection_slug: controls.collection.value,
          site_name: controls.name.value,
          site_slug: controls.slug.value,
          featured: controls.featured.input.checked,
          price_mode: controls.priceMode.value,
          hero_picture_url: heroPicture.value
        });
        await load();
      } catch (error) {
        controls.feedback.textContent = error.message || 'Falha ao salvar grupo.';
        controls.feedback.className = 'meta error';
      } finally {
        saveButton.disabled = false;
      }
    });

    const primaryLink = document.createElement('a');
    primaryLink.className = 'button secondary';
    primaryLink.href = primary?.permalink || '#';
    primaryLink.target = '_blank';
    primaryLink.rel = 'noopener noreferrer';
    primaryLink.textContent = 'Ver anúncio principal';

    const deleteButton = document.createElement('button');
    deleteButton.type = 'button';
    deleteButton.className = 'button danger';
    deleteButton.textContent = 'Desagrupar produto';
    deleteButton.addEventListener('click', async () => {
      if (deleteButton.dataset.confirm !== '1') {
        deleteButton.dataset.confirm = '1';
        deleteButton.textContent = 'Confirmar desagrupamento';
        controls.feedback.textContent = 'Clique novamente para confirmar. As classificações individuais serão preservadas.';
        setTimeout(() => {
          deleteButton.dataset.confirm = '0';
          deleteButton.textContent = 'Desagrupar produto';
        }, 5000);
        return;
      }
      deleteButton.disabled = true;
      try {
        await postCatalog({ action: 'delete_group', group_id: group.group_id });
        await load();
      } catch (error) {
        controls.feedback.textContent = error.message || 'Falha ao desagrupar.';
        controls.feedback.className = 'meta error';
      } finally {
        deleteButton.disabled = false;
      }
    });

    actions.append(saveButton, primaryLink, deleteButton, controls.feedback);
    form.append(actions);
    detail.append(membersLabel, members, media.media, form);
    details.append(summary, detail);
    return details;
  }

  function render() {
    const entries = visibleEntries();
    const nodes = entries.map((entry) => entry.kind === 'group' ? renderGroupCard(entry.group) : renderItemCard(entry.item));
    if (!nodes.length) {
      const empty = document.createElement('div');
      empty.className = 'empty-list';
      empty.textContent = allEntries().length ? 'Nenhum produto corresponde aos filtros atuais.' : 'Nenhum anúncio ativo encontrado na conta conectada.';
      list.replaceChildren(empty);
    } else {
      list.replaceChildren(...nodes);
    }
    updateStatus(entries.length);
    syncSelectionBar();
    renderSuggestions();
  }

  async function load() {
    status.textContent = 'Carregando produtos…';
    status.className = 'status';
    try {
      const response = await fetch('/api/site-catalog/admin', { credentials: 'same-origin' });
      const data = await response.json().catch(() => ({}));
      if (!response.ok) throw new Error(data.error || `HTTP ${response.status}`);
      if (Array.isArray(data.collections) && data.collections.length) {
        liveCollections = new Map(data.collections.map((collection) => [String(collection.slug || ''), String(collection.name || collection.category || collection.slug || '')]).filter(([slug]) => slug));
      }
      collectionsSource = data.collections_source || 'fallback';
      collectionsWarning = data.collections_warning || '';
      catalogItems = Array.isArray(data.items) ? data.items : [];
  catalogGroups = Array.isArray(data.groups) ? data.groups : [];
  generatedAt = data.generated_at || new Date().toISOString();

  try {
    const linkingResponse = await fetch('/api/site-catalog/linking', {
      credentials: 'same-origin',
      cache: 'no-store'
    });
    const linkingData = await linkingResponse.json().catch(() => ({}));
    if (!linkingResponse.ok) throw new Error(linkingData.error || `HTTP ${linkingResponse.status}`);
    canonicalProducts = Array.isArray(linkingData.products) ? linkingData.products : [];
    productsSource = linkingData.products_source || 'unavailable';
    productsWarning = linkingData.products_warning || '';
    const linkedByGroup = new Map((Array.isArray(linkingData.groups) ? linkingData.groups : []).map((entry) => [
      String(entry.group_id || ''),
      String(entry.linked_product_slug || '')
    ]));
    catalogGroups = catalogGroups.map((group) => ({
      ...group,
      linked_product_slug: linkedByGroup.get(String(group.group_id || '')) || ''
    }));
  } catch (linkError) {
    canonicalProducts = [];
    productsSource = 'unavailable';
    productsWarning = linkError.message || 'Falha ao carregar páginas ArtiSys.';
  }

  render();
    } catch (error) {
      catalogItems = [];
      catalogGroups = [];
      list.replaceChildren();
      suggestions.replaceChildren();
      status.textContent = error.message || 'Falha ao carregar anúncios.';
      status.className = 'status error';
    }
  }

  search?.addEventListener('input', render);
  filter?.addEventListener('change', render);
  sort?.addEventListener('change', render);
  groupSelectedButton?.addEventListener('click', groupSelected);
  clearSelectionButton?.addEventListener('click', () => {
    selectedIds.clear();
    groupName.value = '';
    render();
  });
  load();
})();