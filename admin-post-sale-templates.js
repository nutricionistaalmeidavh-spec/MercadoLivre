(() => {
  const SUPPORTED = ['{{saudacao}}', '{{cliente}}', '{{produto}}', '{{pedido}}', '{{link_produto}}'];

  const originalRenderDetailPanels = renderDetailPanels;
  renderDetailPanels = function renderDetailPanelsWithTemplateTools(item) {
    originalRenderDetailPanels(item);
    const textarea = $('detailMessage');
    if (!textarea || document.getElementById('detailProductLink')) return;

    const field = document.createElement('div');
    field.innerHTML = `
      <label for="detailProductLink" style="display:block;font-size:12px;font-weight:800;margin-bottom:7px">Link de entrega do produto</label>
      <input id="detailProductLink" type="url" inputmode="url" autocomplete="url" placeholder="https://..." value="${esc(item.rule?.product_link || '')}" style="width:100%;border:1px solid #c9d7cf;background:#fff;color:var(--ink);border-radius:13px;padding:13px 14px;font-size:16px">
      <div class="textarea-meta" style="margin-top:7px"><span>Este link pertence somente a este anúncio.</span><span>Use {{link_produto}} na mensagem.</span></div>
      <div style="margin-top:12px">
        <div style="font-size:12px;font-weight:800;margin-bottom:7px">Variáveis disponíveis</div>
        <div id="templateVariableButtons" style="display:flex;gap:6px;flex-wrap:wrap"></div>
      </div>`;
    textarea.parentElement.insertAdjacentElement('afterend', field);

    const buttons = field.querySelector('#templateVariableButtons');
    for (const token of SUPPORTED) {
      const button = document.createElement('button');
      button.type = 'button';
      button.className = 'filter-chip';
      button.textContent = token;
      button.addEventListener('click', () => {
        const start = textarea.selectionStart ?? textarea.value.length;
        const end = textarea.selectionEnd ?? start;
        textarea.setRangeText(token, start, end, 'end');
        textarea.dispatchEvent(new Event('input', { bubbles: true }));
        textarea.focus();
      });
      buttons.appendChild(button);
    }
  };

  saveCurrentRule = async function saveCurrentRuleWithProductLink(disable) {
    const item = state.items.find((entry) => entry.item_id === state.selectedId);
    if (!item) return;
    const message = $('detailMessage').value.trim();
    const productLink = $('detailProductLink')?.value.trim() || '';
    const enabled = disable ? false : $('detailEnabled').checked;
    const target = $('detailRuleMsg');
    const button = disable ? $('disableRuleBtn') : $('saveRuleBtn');

    if (enabled && !message) {
      showNotice(target, 'Escreva a mensagem antes de ativar a resposta automática.', 'warning');
      $('detailMessage').focus();
      return;
    }
    if (enabled && /\{\{\s*link_produto\s*\}\}/i.test(message) && !productLink) {
      showNotice(target, 'Defina o link de entrega antes de usar {{link_produto}}.', 'warning');
      $('detailProductLink')?.focus();
      return;
    }

    setBusy(button, true, disable ? 'Desativando' : 'Salvando');
    try {
      const response = await api('/api/message-rules', {
        method: 'POST',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify({
          item_id: item.item_id,
          title: item.title,
          message,
          product_link: productLink,
          enabled
        })
      });
      item.rule = { ...item.rule, ...response.rule };
      if (disable) $('detailEnabled').checked = false;
      showNotice(target, response.rule.enabled ? 'Resposta salva e ativada.' : 'Resposta salva e desativada.', 'success');
      renderDashboard();
      renderListings();
      $('detailPills').innerHTML = statusPill(item);
    } catch (error) {
      showNotice(target, error.message, 'error');
    } finally {
      setBusy(button, false);
    }
  };
})();
