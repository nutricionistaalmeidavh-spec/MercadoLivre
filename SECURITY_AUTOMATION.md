# Segurança da automação Mercado Livre

- Segredos permanecem em variáveis de ambiente.
- Tokens persistidos usam AES-256-GCM.
- O webhook valida `application_id` quando disponível.
- A mensageria usa política fail-closed.
- Produção exige `ML_AUTOMATION_MODE=production` explícito.
- `.env` e estado SQLite não são versionados.
- Logs e endpoints administrativos não devem expor access token, refresh token, client secret ou chave de criptografia.
