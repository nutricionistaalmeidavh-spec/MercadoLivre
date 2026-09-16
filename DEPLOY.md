# Deploy no Cloudflare Workers

## Pré-requisitos

- Worker `artisys-mercadolivre` já criado.
- D1 `artisys-mercadolivre` já criado.
- Variáveis/secrets do app Mercado Livre já configurados no Worker.

## Validar localmente

```bash
npm run check
npm test
```

## Aplicar migrations D1

```bash
npx -y wrangler@4 d1 migrations apply artisys-mercadolivre --remote --config cloudflare/wrangler.jsonc
```

## Publicar Worker

```bash
npx -y wrangler@4 deploy --config cloudflare/wrangler.jsonc
```

O projeto usa `keep_vars: true`, portanto os valores atuais de `ML_CLIENT_ID` e `ML_APPLICATION_ID` configurados no Cloudflare não devem ser substituídos pelo repositório.

Depois do deploy, confira:

- `/api/health`
- `/admin`
- OAuth Mercado Livre
- listagem de anúncios
- regras de resposta por `item_id`

Mantenha `ML_AUTOMATION_MODE=dry-run` durante a validação inicial.
