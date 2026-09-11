# Migração sem quebra do publisher

A versão v1 mantém o token no cookie `artisys_ml` para o painel existente e grava uma cópia criptografada server-side quando `TOKEN_ENCRYPTION_KEY` estiver configurada. Isso permite migrar o publisher para o novo `TokenService` em etapa posterior sem interromper o fluxo atual.
