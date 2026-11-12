# P5 — Mercado Livre → ArtiSys Commerce Core

Integração opt-in para vendas de softwares. Preserva OAuth Mercado Livre, tokens, automação pós-venda, fila de mensagens e dados existentes. Não publica anúncios, não envia mensagens, não altera licenças nem processa pedidos automaticamente sem autorização e configuração explícita.

## Configuração privada (não versionar valores)

- ARTISYS_COMMERCE_URL: base HTTPS do Commerce Core self-hosted (sem barra de caminho obrigatória).
- ARTISYS_COMMERCE_SECRET: segredo HMAC exclusivo com ao menos 32 caracteres. Deve coincidir com MERCADOLIVRE_BRIDGE_SECRET do Commerce Core.
- ARTISYS_COMMERCE_ITEM_SKUS_JSON: mapa de item_id do Mercado Livre para SKU aprovado do Commerce Core, por exemplo {"MLB99999999":"ARTISYS-PDV-NEXUS"}; esse ID é **fictício** e deve ser substituído após consulta do anúncio real.

Nenhuma variável atual é alterada pelo PR. Com variáveis ausentes, rota recusa com 503.

## Execução manual segura

POST /api/commerce/sync é acessível somente com cookie de sessão administrativa do painel Mercado Livre (não usa token enviado pelo browser). Corpo exemplo:

    {"order_id":"12345678","buyer_email":"cliente@exemplo.com","email_verified":true}

O endpoint:
1. Exige exatamente um seller conectado.
2. Consulta /orders/:id com OAuth existente e confirma que o pedido pertence ao seller.
3. Recusa cancelamento, fraude, pagamento não aprovado e status diferente de paid.
4. Seleciona somente os itens cujo item_id está explicitamente mapeado no JSON privado.
5. Usa e-mail retornado pela API Mercado Livre, quando disponível. Se não existir, aceita apenas e-mail preenchido e sinalizado como verificado pelo administrador. Nunca infere identidade pelo nickname.
6. Assina payload com HMAC-SHA256 do corpo bruto e timestamp, envia ao Commerce Core por HTTPS.
7. Só confirma sucesso após receber HTTP 200 e ack do core. Repetir o mesmo pedido não emite licença duplicada.

O Commerce Core ainda mantém o licenciamento nativo aguardando integração (waiting_configuration) até existir um conector produto. Portanto, uma venda importada pode aparecer no portal sem que o aplicativo original esteja liberado.

## QA

- npm test e npm run check; inclui test/commerce-bridge.test.mjs.
- Testar pedido pendente, pago, cancelado, Seller diferente, SKU sem mapeamento, e-mail ausente e replay.
- Validar em ambiente isolado antes de habilitar sync comercial.
- Sem segredos nos logs; sem envio automático de WhatsApp.
- Para uma automação real, acrescentar job persistente e reconciliação de pedidos em PR próprio, após confirmar disponibilidade de e-mail e política de dados do marketplace.

**Sem publicação na main ou deploy automático nesta branch.**
