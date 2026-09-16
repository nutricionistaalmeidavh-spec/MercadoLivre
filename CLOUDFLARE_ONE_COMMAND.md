# MercadoLivre — migração completa para Cloudflare com um comando

O runtime principal pode operar em Cloudflare Workers + D1. O script `scripts/migrate-all-to-cloudflare.ps1` automatiza a preparação do ambiente e preserva a autorização Mercado Livre existente quando o cookie antigo da Vercel ainda está disponível.

## Pré-requisitos no Windows

- Git
- Node.js 22+
- navegador disponível para os logins do Wrangler/Vercel
- acesso às contas Cloudflare e Vercel já utilizadas pelo projeto

## Comando único

Execute no PowerShell:

```powershell
$dir=Join-Path $env:TEMP ("MercadoLivre-"+[guid]::NewGuid()); git clone --branch feature/mercadolivre-automation-v1 --single-branch https://github.com/nutricionistaalmeidavh-spec/MercadoLivre.git $dir; Set-Location $dir; powershell -NoProfile -ExecutionPolicy Bypass -File .\scripts\migrate-all-to-cloudflare.ps1
```

O script:

1. autentica o Wrangler usando keyring quando necessário;
2. cria ou reutiliza o D1 `artisys-mercadolivre`;
3. coloca automaticamente o Database ID no `wrangler.jsonc` local;
4. aplica as migrations remotas;
5. publica o Worker e descobre a URL `workers.dev`;
6. vincula o projeto Vercel `agente-ml-1`;
7. lê `ML_CLIENT_SECRET` e `ADMIN_PASSWORD` diretamente do ambiente Production da Vercel usando `vercel env run`, sem criar arquivo `.env`;
8. cria novas chaves de criptografia/sessão e configura todos os Worker Secrets;
9. prepara `ML_MIGRATION_SECRET` e `ML_MIGRATION_TARGET_URL` temporariamente na Vercel;
10. publica o bridge temporário na produção antiga da Vercel;
11. abre a página `/migration.html` no hostname antigo para reutilizar o cookie OAuth já existente;
12. exige que `migration_audit` registre `SUCCESS` no D1 antes de continuar;
13. remove o segredo temporário do Cloudflare;
14. imprime e copia as novas URLs de Redirect e Webhook.

## Únicos passos que continuam manuais

Há duas operações que não devem ser simuladas pelo script:

1. Na página de migração aberta pelo script, clicar em **Migrar conexão**. Esse clique é necessário porque o cookie OAuth atual é HttpOnly e pertence ao hostname antigo da Vercel.
2. No Mercado Livre DevCenter, atualizar a Redirect URI para `<WORKER>/mercadolivre/callback`, a URL de notificações para `<WORKER>/api/webhook` e habilitar `orders_v2`.

Não clique em **Conectar Mercado Livre** novamente se a migração registrar `SUCCESS`.

## Segurança

- nenhum access token ou refresh token é exibido pelo script;
- `ML_CLIENT_SECRET` e `ADMIN_PASSWORD` são injetados pela Vercel diretamente no processo temporário;
- as novas chaves são geradas localmente com `crypto.randomBytes(32)`;
- o Worker começa em `ML_AUTOMATION_MODE=dry-run`;
- a Vercel não deve ser desligada até a transferência do token registrar `SUCCESS` e o DevCenter apontar para o Worker.
