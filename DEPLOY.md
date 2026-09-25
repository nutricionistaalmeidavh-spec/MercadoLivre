# Deploy no Cloudflare Workers

## Pré-requisitos

- Worker `artisys-mercadolivre` já criado.
- D1 `artisys-mercadolivre` já criado.
- Variáveis/secrets do app Mercado Livre já configurados no Worker.

## Validar localmente

```bash
npm run check
npm test
npm run qa:license-center:isolated
```

## Aplicar migrations D1

```bash
npx -y wrangler@4 d1 migrations apply artisys-mercadolivre --remote --config cloudflare/wrangler.jsonc
```

## Central de Licenças — configuração de escrita

A Central nova continua usando `obra-na-mao-comercial` como autoridade. O Worker MercadoLivre não recebe acesso direto ao D1 de licenças.

Configure um segredo de escrita diferente do segredo de leitura:

```bash
npx -y wrangler@4 secret put OBRA_LICENSE_CENTER_WRITE_SECRET --config cloudflare/wrangler.jsonc
```

O valor deve ser exatamente o mesmo cadastrado como `LICENSE_CENTER_WRITE_SECRET` no Worker `obra-na-mao-comercial`, mas nunca deve ser salvo em Git, documentação, frontend, chat ou logs.

Antes de habilitar escrita no Obra, execute o gate cross-repo:

```bash
npm run verify:license-center:parity-live
```

Variáveis locais necessárias para esse gate:

```text
LICENSE_CENTER_AUTHORITY_URL
LICENSE_CENTER_READ_SECRET
```

O resultado esperado é:

```text
ADMIN_PARITY_OK contractVersion=<n>
```

Se aparecer `ADMIN_PARITY_FAILURE`, não habilite escrita. A própria página `/licenses` também desabilita os controles quando a autoridade exige uma capability ainda ausente no Painel Geral.

## Publicar Worker

```bash
npx -y wrangler@4 deploy --config cloudflare/wrangler.jsonc
```

O projeto usa `keep_vars: true`, portanto os valores atuais de `ML_CLIENT_ID` e `ML_APPLICATION_ID` configurados no Cloudflare não devem ser substituídos pelo repositório.

Depois do deploy, confira:

- `/api/health`
- `/admin`
- `/licenses`
- OAuth Mercado Livre
- listagem de anúncios
- regras de resposta por `item_id`

Mantenha `ML_AUTOMATION_MODE=dry-run` durante a validação inicial.

## E2E live da Central de Licenças

Execute somente depois que:

1. Obra estiver publicado com os endpoints novos;
2. MercadoLivre estiver publicado;
3. os segredos de escrita correspondentes estiverem configurados;
4. o gate de paridade estiver verde;
5. `LICENSE_CENTER_WRITE_ENABLED=true` estiver efetivamente publicado no Obra.

Variáveis necessárias:

```text
LICENSE_CENTER_PANEL_URL
LICENSE_CENTER_ADMIN_PASSWORD
LICENSE_CENTER_AUTHORITY_URL
LICENSE_CENTER_READ_SECRET
LICENSE_CENTER_LIVE_CONFIRM=I_UNDERSTAND_THIS_WRITES_QA_RECORDS
```

Execute:

```bash
npm run qa:license-center:live
```

O runner cria somente empresas/licenças sintéticas identificadas pelo próprio `qaRunId`, captura um baseline antes do primeiro write e recusa qualquer alvo que já existia.

Aceite a fase 7 somente se o relatório terminar com:

```text
status = passed
existingIdsTouched = 0
qaRecordsActive = 0
```

Os registros QA terminam inativos: Obra suspenso, Débora revogada e Loja Online bloqueada. Não há DELETE físico.

## Rollback

A primeira ação é desligar a escrita no `obra-na-mao-comercial`:

```text
LICENSE_CENTER_WRITE_ENABLED=false
```

Depois, se necessário, reverta a versão do `artisys-mercadolivre` ou do `obra-na-mao-comercial`. Não existe rollback de banco para esta entrega porque não há migração de schema.

Durante toda a fase 7, a Central antiga em `artisys.dev/sistema#owner` permanece ativa como fallback.
