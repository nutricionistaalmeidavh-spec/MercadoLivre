# Runbook de ativação

1. Configurar `TOKEN_ENCRYPTION_KEY` e armazenamento persistente.
2. Reconectar OAuth para persistir token server-side.
3. Configurar callback `/api/webhook` e tópico `orders_v2` no Mercado Livre Developers.
4. Subir em `dry-run` e realizar venda controlada.
5. Conferir fila, elegibilidade e policy guard.
6. Somente após validação, definir `ML_AUTOMATION_MODE=production`.
7. Não habilitar resposta por IA nesta versão.
