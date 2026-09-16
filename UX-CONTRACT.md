# UX Contract

## Product context
- Audience: operador ArtiSys responsável pela conta Mercado Livre.
- Primary jobs: acompanhar estado da conta, localizar anúncios, configurar pós-venda, acompanhar pedidos e pagamentos, consultar/criar/encerrar promoções e abrir publicação.
- Target market(s): Brasil.
- Active locales: pt-BR.
- Language/content register and native-review policy: linguagem operacional direta; nomes técnicos só quando necessários.
- Timezone/calendar policy: America/Sao_Paulo para exibição operacional quando houver datas locais.
- Accessibility target: WCAG 2.2 AA.

## Business-context sources
| Domain / scope | Authoritative source | Source type | Reviewed date |
|---|---|---|---|
| OAuth e sessão admin | `cloudflare/src/index.mjs` | Runtime/API contract | 2026-09-16 |
| Anúncios e regras pós-venda | `cloudflare/src/message-rules.mjs` | Runtime/API contract | 2026-09-16 |
| Publicação e consulta de item | `cloudflare/src/publisher.mjs` | Runtime/API contract | 2026-09-16 |
| Automação pós-venda | `cloudflare/src/automation.mjs` | Runtime/domain contract | 2026-09-16 |
| Pedidos | `cloudflare/src/orders.mjs` + API `/orders` Mercado Livre | Runtime/API contract | 2026-09-16 |
| Promoções | `cloudflare/src/promotions.mjs` + API `/seller-promotions` Mercado Livre | Runtime/API contract | 2026-09-16 |

## Visual contract
- Project `DESIGN.md`: `DESIGN.md`.
- Token ownership model: `DESIGN.md` registra valores normativos; CSS custom properties em `admin-cloudflare.html` implementam os mesmos tokens.
- Runtime design-system/token source: `admin-cloudflare.html` + extensão operacional `admin-operations.js`.
- Mapping/export/adapters: tokens CSS `--color-*`, `--radius-*`, `--nav-*`.
- Token drift gate: testes estáticos e revisão visual mobile/desktop.
- Supported themes: claro.
- Design-context owner/review policy: mudanças duráveis de identidade atualizam `DESIGN.md` e runtime juntos.

## Canonical UI Map
| Capability | Canonical owner | Source of truth | Allowed variants | Verification |
|---|---|---|---|---|
| Form | `.field`/`.ops-field` + handlers do painel | UX-CONTRACT + runtime | login / pós-venda / promoção | teste estático + fluxo manual |
| Scrollbar | stylesheet global | DESIGN.md | padrão | inspeção visual |
| Toast/status | `.notice` + regiões `aria-live` | UX-CONTRACT | success / warning / info / error | teste estático |
| CRUD | APIs admin + detalhe contextual | runtime API | edit / external mutation | teste unitário + fluxo manual |
| Dialog | `.ops-modal` | UX-CONTRACT | confirmação comercial | teclado + foco + Escape |

## Component behavior
| Component | Default | Hover | Focus | Active | Disabled | Busy | Error |
|---|---|---|---|---|---|---|---|
| Button | ação legível | tonal | anel azul | leve compressão | sem interação | mantém tamanho | mensagem próxima |
| Icon button | ícone + aria-label | tonal | anel azul | leve compressão | sem interação | spinner opcional | mensagem próxima |
| Input | borda neutra | borda forte | anel azul | n/a | superfície muted | n/a | texto associado |
| Secret input | masked | igual input | anel azul | n/a | n/a | n/a | texto associado |
| Search | clear imediato | borda forte | anel azul | n/a | n/a | n/a | estado de lista |
| Textarea | resize none | borda forte | anel azul | n/a | n/a | salvar bloqueado | texto associado |
| Table/list | cards compactos | elevação mínima | item focável | selecionado tonal | n/a | skeleton | estado inline |
| Dialog | bottom sheet mobile / central desktop | n/a | foco inicial previsível | n/a | n/a | ação busy | erro dentro do dialog |

## Dataset navigation
- Admin tables: pedidos usam lista paginada pela API; a primeira entrega operacional carrega até 40 por consulta.
- Exploratory lists: busca + filtros explícitos para anúncios e pedidos.
- URL state: `view`, `q`, `filter`, `item` e `order` preservam contexto principal; estado de promoções é reconsultado por anúncio.
- Page size: anúncios até 100 ativos; pedidos até 40 na primeira página operacional.
- Empty/no-results/error/loading treatment: estados dedicados no mesmo espaço da lista, com skeleton durante leitura remota.
- Back/scroll restoration: anúncio preserva posição; pedido retorna à lista sem perder filtros carregados.

## Flow ledger
| Operation | Trigger | Pending | Success destination | Success feedback | Failure recovery | Focus outcome | Source ref |
|---|---|---|---|---|---|---|---|
| Login | Entrar | botão busy | dashboard | painel aberto | erro inline | header do app | `/api/auth` |
| Search anúncio | digitar | sem bloqueio | lista filtrada | contagem atualizada | limpar busca | busca | client-side |
| Edit pós-venda | Salvar resposta | botão busy | detalhe | notice success | mantém texto para retry | botão salvar | `/api/message-rules` |
| Disable pós-venda | Desativar | botão busy | detalhe | notice success | mantém regra anterior | toggle | `/api/message-rules` |
| Listar pedidos | abrir Pedidos / filtrar | skeleton | lista | contagem atualizada | erro inline + refresh | lista | `/api/orders` |
| Ver pedido | tocar card | skeleton | detalhe | timeline carregada | erro inline + voltar | botão voltar | `/api/orders?order_id=` |
| Criar desconto | Novo desconto | dialog + botão busy | Promoções | lista recarregada | mantém dialog para retry | dialog | `POST /api/promotions` |
| Encerrar desconto | Encerrar desconto | confirmação + botão busy | Promoções | lista recarregada | mantém dialog para retry | dialog | `DELETE /api/promotions` |
| Refresh | Atualizar | indicador | mesma view | dados atualizados | notice error | botão atualizar | APIs admin |
| Cancel/back | Voltar | n/a | lista | contexto preservado | n/a | card anterior quando aplicável | client-side |

## Navigation and responsive behavior
- Route document title policy: `{Tela} — ArtiSys Mercado Livre`.
- Route error / 403 page behavior: shell permanece disponível; erro orienta reconexão/relogin.
- Breadcrumb/tab/route-state policy: detalhe de anúncio usa tabs in-page; view principal usa query string; pedido usa subview com parâmetro `order`.
- Sidebar/drawer/bottom-sheet transformation: bottom nav fixa em mobile; sidebar persistente a partir de 900px; confirmação comercial usa bottom sheet em mobile e dialog central em desktop.
- Responsive table strategy: cards independentes para anúncios, pedidos e promoções.
- Truncation/full-value access: título pode limitar visualmente; IDs permanecem visíveis e detalhes recuperam valores completos.
- Focus restoration and sticky-obstruction policy: `scroll-padding-bottom` inclui nav fixa; Escape fecha dialog; retorno de detalhe preserva contexto.

## Overlays and feedback
- Dialog primitive: `.ops-modal`, `role=dialog`, `aria-modal=true`, Escape fecha e clique no backdrop fecha quando seguro.
- Destructive confirmation levels: encerramento de promoção exige dialog explícito; criação de promoção exige submit explícito e `confirm=true` no backend.
- Toast placement/duration/deduplication: feedback inline/notice com `aria-live`; sem toast flutuante obrigatório.
- Alert/banner scope and persistence: banner dry-run persiste no dashboard enquanto modo estiver ativo.
- Tooltip delay/dismissal: labels visíveis; não é requisito do fluxo atual.
- Unsaved-changes behavior: promoção não auto-salva; fechar dialog descarta rascunho local.
- Layer/z-index contract: dialog > bottom nav > header/sidebar > conteúdo.

## Async and resilience
- Mutation default: pessimista.
- Idempotency and duplicate-submit policy: botões ficam busy durante POST/DELETE; promoção exige confirmação explícita no request.
- Auto-save/draft recovery: não há auto-save.
- Offline/read-stale/write behavior: mostrar erro e preservar dados já carregados.
- Retry/backoff/timeout behavior: refresh manual para UI; runtime cuida de jobs.
- Session expiry/re-authentication: 401 retorna para login sem apagar filtros locais.
- Stale-request cancellation/invalidation and pending-state ownership: busca de pedidos usa debounce de 300ms; refresh serializa por tela.

## Validation
- Schema/validation layer: validação de negócio no Worker e validação mínima de entrada na UI.
- Trigger timing: no submit.
- Error summary/inline policy: erro junto à ação ou lista correspondente.
- Server error mapping: mensagem segura da API; detalhes do Mercado Livre não incluem secrets.
- Sensitive-value handling: senha mascarada; secrets não aparecem na UI.
- Promoções: PRICE_DISCOUNT exige preço > 0, período válido, máximo de 14 dias e desconto dentro de 5% a <80% quando preço atual é conhecido.
- `noValidate`, first-invalid focus, duplicate-submit prevention, unsaved changes, and submit recovery: formulário de promoção usa `novalidate`; duplicate-submit bloqueado; erro mantém campos para correção.

## Permission and clipboard
- Permission UI strategy: sessão admin obrigatória; 401 volta ao login.
- Clipboard copy policy: não há secrets copiáveis.
- Disabled-state explanation: operações promocionais não suportadas são exibidas como consulta somente leitura nesta etapa.

## Verification
- Required static commands: `npm run check`, `npm test`, `npx -p @google/design.md designmd lint DESIGN.md`.
- Browser/device/locale/theme matrix: iPhone narrow width, Android narrow width, desktop >= 900px; pt-BR; light.
- Accessibility checks: labels, landmarks, `aria-current`, `aria-live`, foco visível, touch targets, dialog com Escape.
- Component-state/visual regression coverage: revisão manual do login, dashboard, anúncios, pedidos, promoções, detalhes e filtros.
- Canonical sibling flow used for comparison: painel Cloudflare atual.
- CRUD full-flow evidence: salvar/desativar regra por anúncio; criar/encerrar PRICE_DISCOUNT com confirmação.
- Failure-path evidence: login inválido, conta desconectada, falha de listagem, falha de pedido e rejeição de promoção pelo Mercado Livre.
