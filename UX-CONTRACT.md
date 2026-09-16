# UX Contract

## Product context
- Audience: operador ArtiSys responsável pela conta Mercado Livre.
- Primary jobs: acompanhar estado da conta, localizar anúncios, configurar pós-venda, abrir publicação e preparar operações comerciais.
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

## Visual contract
- Project `DESIGN.md`: `DESIGN.md`.
- Token ownership model: `DESIGN.md` registra valores normativos; CSS custom properties em `admin-cloudflare.html` implementam os mesmos tokens.
- Runtime design-system/token source: `admin-cloudflare.html`.
- Mapping/export/adapters: tokens CSS `--color-*`, `--radius-*`, `--nav-*`.
- Token drift gate: testes estáticos e revisão visual mobile/desktop.
- Supported themes: claro.
- Design-context owner/review policy: mudanças duráveis de identidade atualizam `DESIGN.md` e runtime juntos.

## Canonical UI Map
| Capability | Canonical owner | Source of truth | Allowed variants | Verification |
|---|---|---|---|---|
| Form | `.field` + handlers do painel | UX-CONTRACT + HTML | login / pós-venda | teste estático + fluxo manual |
| Scrollbar | stylesheet global | DESIGN.md | padrão | inspeção visual |
| Toast/status | `.notice` + regiões `aria-live` | UX-CONTRACT | success / warning / info / error | teste estático |
| CRUD | API `/api/message-rules` + detalhe do anúncio | runtime API | edit | teste unitário + fluxo manual |

## Component behavior
| Component | Default | Hover | Focus | Active | Disabled | Busy | Error |
|---|---|---|---|---|---|---|---|
| Button | ação legível | tonal | anel azul | leve compressão | sem interação | mantém tamanho | mensagem próxima |
| Icon button | ícone + aria-label | tonal | anel azul | leve compressão | sem interação | spinner opcional | mensagem próxima |
| Input | borda neutra | borda forte | anel azul | n/a | superfície muted | n/a | texto associado |
| Secret input | masked | igual input | anel azul | n/a | n/a | n/a | texto associado |
| Search | clear imediato | borda forte | anel azul | n/a | n/a | n/a | estado de lista |
| Textarea | resize none | borda forte | anel azul | n/a | n/a | salvar bloqueado | texto associado |
| Table/list | cards compactos | elevação mínima | item focável | selecionado tonal | n/a | skeleton não obrigatório | estado inline |

## Dataset navigation
- Admin tables: não aplicável nesta entrega; anúncios usam lista responsiva.
- Exploratory lists: busca local + filtros explícitos.
- URL state: `view`, `q` e `filter` persistidos em query string.
- Page size: lista atual limitada pelo contrato da API (até 100 anúncios ativos).
- Empty/no-results/error/loading treatment: estados dedicados no mesmo espaço da lista.
- Back/scroll restoration: abrir detalhe preserva posição da lista; voltar restaura contexto.

## Flow ledger
| Operation | Trigger | Pending | Success destination | Success feedback | Failure recovery | Focus outcome | Source ref |
|---|---|---|---|---|---|---|---|
| Login | Entrar | botão busy | dashboard | painel aberto | erro inline | header do app | `/api/auth` |
| Search | digitar | sem bloqueio | lista filtrada | contagem atualizada | limpar busca | busca | client-side |
| Edit pós-venda | Salvar resposta | botão busy | detalhe | notice success | mantém texto para retry | botão salvar | `/api/message-rules` |
| Disable pós-venda | Desativar | botão busy | detalhe | notice success | mantém regra anterior | toggle | `/api/message-rules` |
| Refresh | Atualizar | indicador | mesma view | dados atualizados | notice error | botão atualizar | APIs admin |
| Cancel/back | Voltar | n/a | lista | contexto preservado | n/a | card anterior | client-side |

## Navigation and responsive behavior
- Route document title policy: `{Tela} — ArtiSys Mercado Livre`.
- Route error / 403 page behavior: shell permanece disponível; erro orienta reconexão/relogin.
- Breadcrumb/tab/route-state policy: detalhe usa tabs in-page; view principal usa query string.
- Sidebar/drawer/bottom-sheet transformation: bottom nav fixa em mobile; sidebar persistente a partir de 900px.
- Responsive table strategy: cards independentes para anúncios.
- Truncation/full-value access: título pode limitar visualmente; ID e ação “Abrir anúncio” permanecem acessíveis.
- Focus restoration and sticky-obstruction policy: `scroll-padding-bottom` inclui nav fixa; retorno foca card quando possível.

## Overlays and feedback
- Dialog primitive: não necessário nesta entrega.
- Destructive confirmation levels: nenhuma ação destrutiva nova nesta entrega.
- Toast placement/duration/deduplication: feedback inline/notice com `aria-live`; sem toast flutuante obrigatório.
- Alert/banner scope and persistence: banner dry-run persiste no dashboard enquanto modo estiver ativo.
- Tooltip delay/dismissal: não necessário; labels visíveis.
- Unsaved-changes behavior: detalhe marca alterações de mensagem; navegação pede confirmação somente quando houver edição não salva (implementação futura se a tela passar a ter múltiplas mutações).
- Layer/z-index contract: detalhe > header/sidebar > bottom nav.

## Async and resilience
- Mutation default: pessimista.
- Idempotency and duplicate-submit policy: botão fica busy durante POST.
- Auto-save/draft recovery: não há auto-save.
- Offline/read-stale/write behavior: mostrar erro e preservar dados já carregados.
- Retry/backoff/timeout behavior: refresh manual para UI; runtime cuida de jobs.
- Session expiry/re-authentication: 401 retorna para login sem apagar estado local de filtros.
- Stale-request cancellation/invalidation and pending-state ownership: refresh serializa atualização principal; busca é local.

## Validation
- Schema/validation layer: validação de negócio no Worker; UI impede ativar resposta vazia.
- Trigger timing: no submit.
- Error summary/inline policy: erro junto à ação.
- Server error mapping: mensagem segura da API.
- Sensitive-value handling: senha mascarada; secrets não aparecem na UI.
- `noValidate`, first-invalid focus, duplicate-submit prevention, unsaved changes, and submit recovery: formulários usam validação própria; duplicate-submit bloqueado em mutações.

## Permission and clipboard
- Permission UI strategy: sessão admin obrigatória; 401 volta ao login.
- Clipboard copy policy: não há secrets copiáveis nesta entrega.
- Disabled-state explanation: controles futuros mostram texto “Disponível na próxima entrega” quando não operacionais.

## Verification
- Required static commands: `npm run check`, `npm test`.
- Browser/device/locale/theme matrix: iPhone narrow width, Android narrow width, desktop >= 900px; pt-BR; light.
- Accessibility checks: labels, landmarks, `aria-current`, `aria-live`, foco visível, touch targets.
- Component-state/visual regression coverage: revisão manual do login, dashboard, lista, detalhe e filtros.
- Canonical sibling flow used for comparison: painel Cloudflare atual.
- CRUD full-flow evidence: salvar/desativar regra por anúncio.
- Failure-path evidence: login inválido, conta desconectada, falha de listagem e falha de salvamento.