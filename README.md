# ArtiSys — Mercado Livre

Integração Mercado Livre executada em **Cloudflare Workers + D1**.

## Runtime principal

- Cloudflare Worker: API, OAuth, webhooks e automações.
- Cloudflare D1: tokens OAuth, fila, auditoria e regras de mensagem por anúncio.
- Mercado Livre OAuth 2.0 + PKCE.
- Refresh token automático.
- Webhook `orders_v2`.
- Publicador de anúncios e upload de imagens para o CDN do Mercado Livre.
- Automação pós-venda em `dry-run` por padrão.

## Painel administrativo

Acesse:

```text
/admin
```

O painel permite:

- entrar com a senha administrativa do Worker;
- conectar/reconectar a conta Mercado Livre;
- visualizar o modo da automação;
- listar os anúncios ativos do seller conectado;
- cadastrar uma mensagem diferente para cada `item_id`;
- ativar ou desativar a resposta automática individualmente.

### Regra de segurança

Nenhum anúncio envia mensagem por padrão.

Uma mensagem só pode seguir para a política de comunicação do Mercado Livre quando:

1. a venda é elegível;
2. todos os anúncios presentes no pedido possuem regra cadastrada;
3. todas essas regras estão `enabled=true`;
4. a mensagem passa pelo Action Guide/Caps do Mercado Livre;
5. `ML_AUTOMATION_MODE=production`.

Se qualquer anúncio do pedido não possuir regra ativa, a automação registra `SKIPPED` e não envia mensagem.

## Variáveis do Worker

Configure no Cloudflare:

- `ML_CLIENT_ID`
- `ML_APPLICATION_ID`
- `ML_CLIENT_SECRET` (Secret)
- `TOKEN_ENCRYPTION_KEY` (Secret)
- `ADMIN_PASSWORD` (Secret)
- `ADMIN_SESSION_SECRET` (Secret)

O `wrangler.jsonc` usa `keep_vars: true` para preservar as variáveis já configuradas no Worker durante novos deploys.

## Redirect OAuth

```text
https://artisys-mercadolivre.nutricionistaalmeidavh.workers.dev/mercadolivre/callback
```

## Webhook

```text
https://artisys-mercadolivre.nutricionistaalmeidavh.workers.dev/api/webhook
```

Tópico:

```text
orders_v2
```

## Deploy

Antes do deploy, aplique as migrations D1 e rode os checks:

```bash
npm run check
npm test
npx -y wrangler@4 d1 migrations apply artisys-mercadolivre --remote --config cloudflare/wrangler.jsonc
npx -y wrangler@4 deploy --config cloudflare/wrangler.jsonc
```

Mantenha `ML_AUTOMATION_MODE=dry-run` até validar uma venda controlada e as regras por anúncio.
