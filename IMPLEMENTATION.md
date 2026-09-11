# MercadoLivre Automation v1

Branch de implementação: `feature/mercadolivre-automation-v1`.

## Fluxo

`orders_v2 -> /api/webhook -> SQLite -> worker -> orderService -> eligibility -> action_guide/caps -> policyGuard -> dry-run/OTHER -> audit`.

## Segurança por padrão

- `ML_AUTOMATION_MODE` usa `dry-run` quando não configurado.
- Para envio real, configure explicitamente `ML_AUTOMATION_MODE=production`.
- Tokens server-side só são persistidos quando `TOKEN_ENCRYPTION_KEY` está definida.
- `refresh_token` e `access_token` são criptografados com AES-256-GCM antes do SQLite.
- Nunca salve `.env`, banco SQLite ou chaves no Git.

## Configuração no Mercado Livre Developers

Na aplicação já existente, configure uma Callback URL pública apontando para `/api/webhook` e habilite `orders_v2`.

## Self-host

```bash
cp .env.example .env
# preencher secrets
mkdir -p data
docker compose up -d --build
```

O volume `./data:/app/data` mantém tokens, fila e idempotência entre reinícios.

## Antes de produção

1. Conectar novamente o OAuth para persistir o token no servidor.
2. Manter `ML_AUTOMATION_MODE=dry-run`.
3. Fazer uma venda controlada e confirmar o registro em `/api/automation?op=status`.
4. Confirmar que o `action_guide` permite `OTHER` no pack testado.
5. Só então mudar explicitamente para `ML_AUTOMATION_MODE=production`.

## Verificação

```bash
npm install
npm run check
npm test
```
