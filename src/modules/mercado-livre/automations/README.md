# Automação after-sale v1

Estados principais: `RECEIVED`, `ORDER_FETCHED`, `ELIGIBILITY_CHECKED`, `POLICY_CHECKED`, `MESSAGE_PENDING`, `SENT`, `SKIPPED`, `FAILED_RETRYABLE`, `FAILED_FINAL`.

A chave de idempotência é formada por seller, pedido, tipo e versão da automação.
