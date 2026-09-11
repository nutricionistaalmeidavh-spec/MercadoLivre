# Migração Vercel → Cloudflare — MercadoLivre

Este kit migra o runtime para Cloudflare Workers + D1 e preserva a conexão OAuth atual quando o cookie `artisys_ml` da implantação antiga da Vercel ainda estiver válido.

## Princípio de segurança

- Não rotacione o `ML_CLIENT_SECRET` durante a migração.
- Não envie `access_token` ou `refresh_token` por chat, commit ou arquivo compartilhado.
- O bridge temporário transfere o token diretamente Vercel → Cloudflare via HTTPS.
- `ML_MIGRATION_SECRET` é temporário e deve ser removido dos dois lados após a migração.
- A automação permanece em `dry-run` até teste controlado.

## 1. Criar D1

No Cloudflare Dashboard, crie um banco D1 chamado `artisys-mercadolivre`.

Copie o Database ID e substitua `REPLACE_WITH_D1_DATABASE_ID` em `cloudflare/wrangler.jsonc`.

Depois aplique as migrations:

```bash
npx wrangler d1 migrations apply artisys-mercadolivre --remote --config cloudflare/wrangler.jsonc
```

## 2. Configurar secrets no Cloudflare

No Worker, configure como **Secrets**:

- `ML_CLIENT_SECRET` — o MESMO valor usado hoje na Vercel.
- `TOKEN_ENCRYPTION_KEY` — nova chave forte para criptografar tokens no D1.
- `ADMIN_PASSWORD` — pode manter a senha atual do painel.
- `ADMIN_SESSION_SECRET` — nova chave forte para cookies administrativos do Cloudflare.
- `ML_MIGRATION_SECRET` — chave temporária, igual nos dois provedores durante a migração.

Gere chaves aleatórias localmente, por exemplo:

```bash
node -e "console.log(require('crypto').randomBytes(32).toString('base64url'))"
```

Nunca salve os valores reais no Git.

## 3. Configurar variáveis não secretas

Em `cloudflare/wrangler.jsonc` já ficam:

- `ML_CLIENT_ID=7397781723111552`
- `ML_AUTOMATION_MODE=dry-run`
- `ML_JOB_MAX_ATTEMPTS=5`
- mensagem pós-venda inicial.

Depois que o Worker possuir uma URL definitiva, configure também:

- `ML_REDIRECT_URI=https://SEU-WORKER/mercadolivre/callback`
- `ML_APPLICATION_ID=7397781723111552` (se o application id for o mesmo client id; confirme no DevCenter).

## 4. Deploy inicial do Cloudflare

```bash
npx wrangler deploy --config cloudflare/wrangler.jsonc
```

Teste:

```text
https://SEU-WORKER/api/health
```

A resposta esperada informa `runtime=cloudflare-workers`, `database=d1` e `mode=dry-run`.

## 5. Preparar bridge temporário na Vercel

Na implantação ANTIGA da Vercel, mantenha `ML_CLIENT_SECRET` e `ADMIN_PASSWORD` exatamente como estão. O cookie antigo foi criptografado usando esses valores; alterá-los antes da migração impede a leitura do token existente.

Adicione temporariamente na Vercel:

- `ML_MIGRATION_TARGET_URL=https://SEU-WORKER`
- `ML_MIGRATION_SECRET=<o mesmo segredo temporário configurado no Cloudflare>`

Faça um deploy temporário contendo:

- `api/migrate-to-cloudflare.js`
- `migration.html`

Não é necessário colocar o refresh token em nenhuma Environment Variable.

## 6. Migrar a conexão já existente

No MESMO domínio antigo da Vercel:

1. Abra `/admin.html` e entre normalmente.
2. Confirme que o painel ainda mostra Mercado Livre conectado.
3. Abra `/migration.html`.
4. Clique em **Migrar conexão** uma única vez.

O fluxo é:

```text
browser (cookie HttpOnly antigo)
→ Vercel
→ descriptografa token no servidor
→ HTTPS com ML_MIGRATION_SECRET
→ Cloudflare Worker
→ criptografia nova
→ D1
→ valida /users/me
```

O refresh token não é retornado ao navegador.

## 7. Validar no Cloudflare

Abra o painel no domínio Cloudflare e faça login administrativo. O `admin.html` continua usando `/api/auth`, `/api/oauth` e `/api/ml`, agora atendidos pelo Worker.

Confirme:

- `/api/ml?op=me` retorna o seller correto;
- `/api/automation?op=status` lista o seller;
- publicação/consulta continua funcionando;
- modo continua `dry-run`.

## 8. Alterar a aplicação no Mercado Livre DevCenter

Somente depois da migração do token estar validada:

1. Altere a Redirect URI para `https://SEU-WORKER/mercadolivre/callback`.
2. Configure a URL de notificações como `https://SEU-WORKER/api/webhook`.
3. Habilite o tópico de Orders / `orders_v2`.
4. Não rotacione o Client Secret durante essa troca.

A renovação de token usa `client_id + client_secret + refresh_token`; a `redirect_uri` participa do fluxo de autorização por código, não da chamada de refresh. Portanto, mantendo o mesmo aplicativo e Client Secret, a troca de hospedagem não exige uma nova autorização apenas por causa da URL.

## 9. Teste controlado

Com `ML_AUTOMATION_MODE=dry-run`:

1. Faça uma venda controlada.
2. Confirme a entrada do evento no status da automação.
3. Confirme a consulta do pedido.
4. Confirme elegibilidade e `action_guide`.
5. Confirme que o resultado é `DRY_RUN` e nenhuma mensagem real foi enviada.

Somente depois disso altere explicitamente para:

```text
ML_AUTOMATION_MODE=production
```

## 10. Encerrar Vercel

Depois de Cloudflare validado:

- remova `ML_MIGRATION_SECRET` da Vercel;
- remova `ML_MIGRATION_TARGET_URL` da Vercel;
- remova `ML_MIGRATION_SECRET` do Cloudflare;
- desative/remova o deploy antigo somente após confirmar publisher + OAuth + webhook;
- não é necessário apagar o aplicativo no Mercado Livre: ele continua sendo o mesmo aplicativo.

## Rollback

Enquanto o Cloudflare estiver em `dry-run`, mantenha o deploy antigo da Vercel disponível até a validação final. Se a migração do cookie falhar, o fallback é simplesmente executar OAuth novamente no Cloudflare usando a mesma aplicação Mercado Livre.
