(() => {
  const status = document.getElementById('catalog-status');
  if (!status) return;

  const panel = document.createElement('section');
  panel.className = 'status';
  panel.setAttribute('aria-label', 'Vínculo de grupo com página ArtiSys');

  const title = document.createElement('strong');
  title.textContent = 'Vínculo de grupo → página ArtiSys';

  const help = document.createElement('div');
  help.className = 'meta';
  help.textContent = 'Escolha o grupo e a página existente. Anúncios adicionados depois ao mesmo grupo herdam esse vínculo automaticamente.';

  const row = document.createElement('div');
  row.className = 'row';

  const groupSelect = document.createElement('select');
  const productSelect = document.createElement('select');
  const saveButton = document.createElement('button');
  saveButton.type = 'button';
  saveButton.className = 'button';
  saveButton.textContent = 'Salvar vínculo';

  const feedback = document.createElement('span');
  feedback.className = 'meta';

  function field(label, control) {
    const wrapper = document.createElement('label');
    wrapper.className = 'field';
    const caption = document.createElement('span');
    caption.textContent = label;
    wrapper.append(caption, control);
    return wrapper;
  }

  row.append(field('Grupo do Mercado Livre', groupSelect), field('Página ArtiSys vinculada', productSelect), saveButton);
  panel.append(title, help, row, feedback);
  status.before(panel);

  let groups = [];
  let products = [];

  function fillSelect(select, entries, selectedValue = '') {
    select.replaceChildren();
    for (const [value, label] of entries) {
      const option = document.createElement('option');
      option.value = value;
      option.textContent = label;
      option.selected = value === selectedValue;
      select.appendChild(option);
    }
  }

  function syncProductForGroup() {
    const group = groups.find((entry) => entry.group_id === groupSelect.value);
    const linked = group?.linked_product_slug || '';
    productSelect.value = products.some((product) => product.slug === linked) ? linked : '';
  }

  async function load() {
    feedback.textContent = 'Carregando vínculos…';
    try {
      const response = await fetch('/api/site-catalog/linking', { credentials: 'same-origin', cache: 'no-store' });
      const data = await response.json().catch(() => ({}));
      if (!response.ok) throw new Error(data.error || `HTTP ${response.status}`);
      groups = Array.isArray(data.groups) ? data.groups : [];
      products = Array.isArray(data.products) ? data.products : [];

      fillSelect(groupSelect, groups.length
        ? groups.map((group) => [group.group_id, group.site_name || group.group_id])
        : [['', 'Nenhum grupo disponível']]);
      fillSelect(productSelect, [
        ['', 'Sem página vinculada'],
        ...products.map((product) => [product.slug, `${product.name}${product.category ? ` · ${product.category}` : ''}`])
      ]);

      groupSelect.disabled = groups.length === 0;
      productSelect.disabled = groups.length === 0 || products.length === 0;
      saveButton.disabled = groups.length === 0 || products.length === 0;
      if (groups.length) syncProductForGroup();

      if (data.products_source === 'unavailable') {
        feedback.textContent = data.products_warning || 'Não foi possível carregar as páginas ArtiSys.';
        feedback.className = 'meta error';
      } else {
        feedback.textContent = `${groups.length} grupo(s) · ${products.length} página(s) disponíveis`;
        feedback.className = 'meta';
      }
    } catch (error) {
      feedback.textContent = error.message || 'Falha ao carregar vínculos.';
      feedback.className = 'meta error';
      saveButton.disabled = true;
    }
  }

  groupSelect.addEventListener('change', syncProductForGroup);
  saveButton.addEventListener('click', async () => {
    if (!groupSelect.value) return;
    saveButton.disabled = true;
    feedback.textContent = 'Salvando vínculo…';
    feedback.className = 'meta';
    try {
      const response = await fetch('/api/site-catalog/linking', {
        method: 'POST',
        credentials: 'same-origin',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify({
          group_id: groupSelect.value,
          linked_product_slug: productSelect.value
        })
      });
      const data = await response.json().catch(() => ({}));
      if (!response.ok) throw new Error(data.error || `HTTP ${response.status}`);
      feedback.textContent = productSelect.value
        ? `Vínculo salvo: ${data.site_name || productSelect.value}.`
        : 'Vínculo removido; o grupo ficou oculto até nova classificação.';
      feedback.className = 'meta ok';
      const group = groups.find((entry) => entry.group_id === groupSelect.value);
      if (group) group.linked_product_slug = data.linked_product_slug || '';
      setTimeout(() => window.location.reload(), 300);
    } catch (error) {
      feedback.textContent = error.message || 'Falha ao salvar vínculo.';
      feedback.className = 'meta error';
      saveButton.disabled = false;
    }
  });

  load();
})();
