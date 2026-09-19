(() => {
  const list = document.getElementById('catalog-list');
  if (!list) return;

  let groups = [];
  let products = [];
  let productsSource = 'unavailable';
  let productsWarning = '';
  let renderQueued = false;

  function field(label, control) {
    const wrapper = document.createElement('label');
    wrapper.className = 'field';
    const caption = document.createElement('span');
    caption.textContent = label;
    wrapper.append(caption, control);
    return wrapper;
  }

  function fillSelect(select, selectedValue = '') {
    select.replaceChildren();
    const empty = document.createElement('option');
    empty.value = '';
    empty.textContent = 'Sem página vinculada';
    empty.selected = !selectedValue;
    select.appendChild(empty);
    for (const product of products) {
      const option = document.createElement('option');
      option.value = product.slug;
      option.textContent = `${product.name}${product.category ? ` · ${product.category}` : ''}`;
      option.selected = product.slug === selectedValue;
      select.appendChild(option);
    }
  }

  function groupForCard(card) {
    const text = card.textContent || '';
    return groups.find((group) => {
      const primary = String(group.primary_item_id || '').trim();
      if (primary && text.includes(primary)) return true;
      const ids = Array.isArray(group.item_ids) ? group.item_ids.map((id) => String(id || '').trim()).filter(Boolean) : [];
      return ids.length > 0 && ids.every((id) => text.includes(id));
    }) || null;
  }

  async function saveLink(group, productSelect, saveButton, feedback) {
    saveButton.disabled = true;
    feedback.textContent = 'Salvando vínculo…';
    feedback.className = 'meta';
    try {
      const response = await fetch('/api/site-catalog/linking', {
        method: 'POST',
        credentials: 'same-origin',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify({
          group_id: group.group_id,
          linked_product_slug: productSelect.value
        })
      });
      const data = await response.json().catch(() => ({}));
      if (!response.ok) throw new Error(data.error || `HTTP ${response.status}`);
      group.linked_product_slug = data.linked_product_slug || '';
      feedback.textContent = productSelect.value
        ? `Vinculado a ${data.site_name || productSelect.selectedOptions[0]?.textContent || productSelect.value}.`
        : 'Vínculo removido.';
      feedback.className = 'meta ok';
      setTimeout(() => window.location.reload(), 250);
    } catch (error) {
      feedback.textContent = error.message || 'Falha ao salvar vínculo.';
      feedback.className = 'meta error';
      saveButton.disabled = false;
    }
  }

  function injectLinkControl(card, group) {
    if (card.querySelector('.artisys-link-row')) return;
    const controls = card.querySelector('.detail .controls');
    if (!controls) return;

    const productSelect = document.createElement('select');
    fillSelect(productSelect, group.linked_product_slug || '');
    productSelect.disabled = productsSource === 'unavailable' || products.length === 0;

    const saveButton = document.createElement('button');
    saveButton.type = 'button';
    saveButton.className = 'button secondary';
    saveButton.textContent = 'Salvar vínculo';
    saveButton.disabled = productSelect.disabled;

    const feedback = document.createElement('span');
    feedback.className = 'meta';
    if (productsSource === 'unavailable') {
      feedback.textContent = productsWarning || 'Não foi possível carregar as páginas ArtiSys.';
      feedback.className = 'meta error';
    } else if (group.linked_product_slug) {
      const current = products.find((product) => product.slug === group.linked_product_slug);
      feedback.textContent = current ? `Página atual: ${current.name}.` : 'Página vinculada.';
    } else {
      feedback.textContent = 'Selecione manualmente a página ArtiSys representada por este grupo.';
    }

    saveButton.addEventListener('click', () => saveLink(group, productSelect, saveButton, feedback));

    const row = document.createElement('div');
    row.className = 'row two artisys-link-row';
    row.append(field('Página ArtiSys vinculada', productSelect), saveButton);

    const firstRow = controls.querySelector('.row');
    if (firstRow) controls.insertBefore(row, firstRow);
    else controls.prepend(row);
    controls.insertBefore(feedback, row.nextSibling);
  }

  function renderInlineLinks() {
    renderQueued = false;
    const cards = [...list.querySelectorAll('details.item')];
    for (const card of cards) {
      const grouped = [...card.querySelectorAll('button')].some((button) => button.textContent.trim() === 'Salvar produto agrupado');
      if (!grouped) continue;
      const group = groupForCard(card);
      if (group) injectLinkControl(card, group);
    }
  }

  function queueRender() {
    if (renderQueued) return;
    renderQueued = true;
    queueMicrotask(renderInlineLinks);
  }

  async function load() {
    try {
      const response = await fetch('/api/site-catalog/linking', {
        credentials: 'same-origin',
        cache: 'no-store'
      });
      const data = await response.json().catch(() => ({}));
      if (!response.ok) throw new Error(data.error || `HTTP ${response.status}`);
      groups = Array.isArray(data.groups) ? data.groups : [];
      products = Array.isArray(data.products) ? data.products : [];
      productsSource = data.products_source || 'unavailable';
      productsWarning = data.products_warning || '';
      queueRender();
    } catch (error) {
      groups = [];
      products = [];
      productsSource = 'unavailable';
      productsWarning = error.message || 'Falha ao carregar páginas ArtiSys.';
    }
  }

  const observer = new MutationObserver(queueRender);
  observer.observe(list, { childList: true, subtree: true });
  load();
})();
