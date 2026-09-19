# Catalog Product Groups Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:executing-plans to implement this plan task-by-task.

**Goal:** Permitir agrupar vários anúncios do Mercado Livre em um único produto canônico no catálogo ArtiSys e reduzir drasticamente o tamanho dos cards no painel mobile.

**Architecture:** Manter `site_catalog_decisions` para compatibilidade com anúncios isolados. Adicionar `site_catalog_groups` e `site_catalog_group_items`; grupos concentram classificação editorial e elegem um anúncio principal. O feed público emite um único produto por grupo e continua emitindo anúncios individuais não agrupados. A UI opera em modo compacto/recolhível e oferece seleção manual para agrupar/desagrupar.

**Tech Stack:** Cloudflare Worker, D1, JavaScript ESM, HTML/CSS mobile-first, Node test runner.

**Spec:** Conversa aprovada em 2026-09-19: agrupamento manual, anúncio principal, feed deduplicado, cards compactos e sugestões não automáticas.

## Global Constraints

- Nada é agrupado ou publicado automaticamente.
- Negócios e Saúde continuam classificáveis, mas não publicáveis enquanto não forem coleções live.
- Anúncios não agrupados mantêm o comportamento atual.
- Grupo publica no máximo uma entrada no feed.
- O anúncio principal fornece preço, permalink e fotos por padrão.
- O total de vendas do grupo é a soma dos anúncios vinculados.
- Migration deve ser aditiva e não destrutiva.
- `ML_AUTOMATION_MODE` e automações pós-venda não podem ser alterados.

## Review Focus

- Um item não pode pertencer a dois grupos do mesmo seller.
- Excluir/desagrupar não pode apagar decisões individuais existentes.
- Grupo sem anúncio principal válido não pode ser publicado.
- Grupo aprovado com coleção ainda não live deve falhar fechado.
- Feed não pode duplicar itens agrupados como entradas individuais.

---

### Task 1: Contratos RED de agrupamento

**Files:**
- Modify: `tests/siteCatalogFeed.test.mjs`
- Modify: `tests/siteCatalogRouting.test.mjs`

**Interfaces:**
- Produces: contratos para `buildPublicCatalogFeed(..., groups, groupItems)` e assets/migration A.1.

- [ ] Escrever testes que exigem migration 0008, tabelas de grupo, anúncio principal, soma de vendas e deduplicação.
- [ ] Rodar CI e confirmar falha somente nos contratos novos.

### Task 2: Persistência D1 de grupos

**Files:**
- Create: `cloudflare/migrations/0008_site_catalog_groups.sql`
- Modify: `cloudflare/src/site-catalog-repository.mjs`

**Interfaces:**
- Produces: `listSiteCatalogGroups`, `createSiteCatalogGroup`, `updateSiteCatalogGroup`, `deleteSiteCatalogGroup`, `replaceSiteCatalogGroupItems`.

- [ ] Criar migration aditiva com `site_catalog_groups` e `site_catalog_group_items`.
- [ ] Implementar CRUD seller-scoped e constraint de item único por seller.
- [ ] Rodar testes.

### Task 3: API e feed canônico

**Files:**
- Modify: `cloudflare/src/site-catalog.mjs`

**Interfaces:**
- Consumes: grupos e vínculos do repositório.
- Produces: GET admin com `groups` e `group_id` por item; POST actions `save_group`, `delete_group`, `save_item`; feed deduplicado.

- [ ] Normalizar decisão editorial de grupo usando as mesmas regras fail-closed.
- [ ] Validar que `primary_item_id` pertence ao seller e ao grupo.
- [ ] Construir uma entrada por grupo aprovado usando anúncio principal e vendas somadas.
- [ ] Excluir do fluxo individual qualquer anúncio pertencente a grupo.
- [ ] Rodar testes.

### Task 4: Painel compacto e agrupamento manual

**Files:**
- Modify: `admin-site-catalog.html`
- Modify: `admin-site-catalog.js`

**Interfaces:**
- Consumes: `items[]` e `groups[]` da API admin.
- Produces: lista compacta, detalhes recolhíveis, seleção e agrupamento/desagrupamento.

- [ ] Cards fechados mostram capa, nome, status, anúncios e vendas.
- [ ] Detalhes só renderizam formulário e galeria ao expandir.
- [ ] Adicionar modo seleção e botão `Agrupar selecionados`.
- [ ] Grupo permite nome, anúncio principal, classificação, capa, preço, destaque, aprovação e desagrupar.
- [ ] Filtros incluem Agrupados e Não agrupados.
- [ ] Rodar syntax check e testes.

### Task 5: Verificação e merge

**Files:**
- Review only.

- [ ] Confirmar que somente catálogo/admin/migration/testes foram alterados.
- [ ] Confirmar CI completo verde.
- [ ] Revisar migration como aditiva.
- [ ] Merge por squash na `main`.
- [ ] Fornecer comando único PowerShell para pull, QA, descobrir D1, aplicar migrations e deploy.