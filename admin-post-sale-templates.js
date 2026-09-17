(() => {
  const SUPPORTED = ['{{saudacao}}', '{{cliente}}', '{{produto}}', '{{pedido}}', '{{link_produto}}'];
  const SHORTENER_HOSTS = new Set(['bit.ly', 'tinyurl.com', 't.co', 'cutt.ly', 'rebrand.ly', 'is.gd', 'goo.gl', 'shorturl.at']);

  function previewGreeting() {
    const parts = new Intl.DateTimeFormat('pt-BR', {
      timeZone: 'America/Sao_Paulo',
      hour: '2-digit',
      hourCycle: 'h23'
    }).formatToParts(new Date());
    const hour = Number(parts.find((part) => part.type === 'hour')?.value ?? 0);
    if (hour >= 5 && hour < 12) return 'bom dia';
    if (hour >= 12 && hour < 18) return 'boa tarde';
    return 'boa noite';
  }

  function validateDeliveryLink(value) {
    const raw = String(value || '').trim();
    if (!raw) return { ok: true, url: '' };
    let parsed;
    try { parsed = new URL(raw); } catch { return { ok: false, message: 'Informe um link de entrega válido.' }; }
    if (parsed.protocol !== 'https:') return { ok: false, message: 'O link de entrega precisa usar https://.' };
    const host = parsed.hostname.toLowerCase().replace(/^www\./, '');
    if (SHORTENER_HOSTS.has(host)) return { ok: false, message: 'Não use link encurtado na entrega do produto.' };
    return { ok: true, url: parsed.toString() };
  }

  function renderPreview(item) {
    const textarea = $('detailMessage');
    const linkInput = $('detailProductLink');
    const preview = $('detailMessagePreview');
    const meta = $('detailPreviewMeta');
    if (!textarea || !preview || !meta) return;

    const link = String(linkInput?.value || '').trim();
    const values = {
      saudacao: previewGreeting(),
      cliente: 'João',
      produto: String(item?.title || item?.item_id || 'Produto'),
      pedido: '123456789',
      link_produto: link || '[link não configurado]'
    };
    const resolved = String(textarea.value || '').replace(/\{\{\s*(saudacao|cliente|produto|pedido|link_produto)\s*\}\}/gi, (_match, key) => values[String(key).toLowerCase()] || '');
    const unresolved = [...new Set([...resolved.matchAll(/\{\{\s*([^{}]+?)\s*\}\}/g)].map((match) => String(match[1] || '').trim()).filter(Boolean))];
    preview.textContent = resolved || 'A prévia aparecerá aqui conforme você escreve a mensagem.';
    meta.textContent = unresolved.length
      ? `Variáveis não reconhecidas: ${unresolved.join(', ')}`
      : `${resolved.length} caracteres após resolver as variáveis.`;
  }

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
      </div>
      <div style="margin-top:14px;background:#f6f8f6;border:1px solid var(--line);border-radius:14px;padding:13px">
        <div style="font-size:12px;font-weight:850">Prévia da mensagem</div>
        <div style="font-size:11px;color:var(--ink-soft);margin-top:4px">Simulação com comprador João e pedido 123456789.</div>
        <pre id="detailMessagePreview" style="margin:10px 0 0;white-space:pre-wrap;overflow-wrap:anywhere;font:inherit;font-size:13px;line-height:1.5"></pre>
        <div id="detailPreviewMeta" class="textarea-meta" style="margin-top:9px"></div>
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

    $('detailProductLink').addEventListener('input', () => renderPreview(item));
    $('detailMessage').addEventListener('input', () => renderPreview(item));
    renderPreview(item);
  };

  saveCurrentRule = async function saveCurrentRuleWithProductLink(disable) {
    const item = state.items.find((entry) => entry.item_id === state.selectedId);
    if (!item) return;
    const message = $('detailMessage').value.trim();
    const rawProductLink = $('detailProductLink')?.value.trim() || '';
    const enabled = disable ? false : $('detailEnabled').checked;
    const target = $('detailRuleMsg');
    const button = disable ? $('disableRuleBtn') : $('saveRuleBtn');

    if (enabled && !message) {
      showNotice(target, 'Escreva a mensagem antes de ativar a resposta automática.', 'warning');
      $('detailMessage').focus();
      return;
    }

    const linkValidation = validateDeliveryLink(rawProductLink);
    if (!linkValidation.ok) {
      showNotice(target, linkValidation.message, 'warning');
      $('detailProductLink')?.focus();
      return;
    }
    const productLink = linkValidation.url;

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

  if (!document.querySelector('script[data-artisys-promotions-clarity]')) {
    const script = document.createElement('script');
    script.src = '/admin-promotions-clarity.js?v=1.6.3';
    script.dataset.artisysPromotionsClarity = '1';
    document.head.appendChild(script);
  }
})();
