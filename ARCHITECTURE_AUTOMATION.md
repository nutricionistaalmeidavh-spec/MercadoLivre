# Arquitetura Automation v1

O webhook apenas valida e persiste o evento. O worker processa fora da requisição. Regras de pedido, política de mensagem, envio e idempotência são módulos independentes. Essa separação evita que indisponibilidade da API do Mercado Livre cause perda silenciosa de notificações.
