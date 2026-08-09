# ArtiSys — Painel Mercado Livre para celular

Painel Vercel sem banco de dados e sem dependências externas.

## O que faz

- Login administrativo próprio.
- OAuth 2.0 + PKCE do Mercado Livre.
- Access/refresh tokens criptografados em cookie HttpOnly.
- Preditor de categoria para os 20 SKUs.
- Consulta dos atributos oficiais da categoria.
- Validação em `/items/validate` sem publicar.
- Publicação real somente com confirmação explícita.
- Inclusão automática da descrição após o POST `/items`.
- 62 imagens servidas pelo próprio Vercel, já comprimidas em JPG.

## Environment Variables obrigatórias no Vercel

Configure em **Project > Settings > Environment Variables**:

- `ML_CLIENT_SECRET` = Client Secret da aplicação AutomaçãoArtiSys
- `ADMIN_PASSWORD` = uma senha nova e forte só para este painel

O projeto já possui defaults para:
- `ML_CLIENT_ID=7397781723111552`
- `ML_REDIRECT_URI=https://eng-planilhas-callback-ml.vercel.app/mercadolivre/callback`

Se o domínio do projeto mudar, crie também:
- `ML_REDIRECT_URI=https://NOVO-DOMINIO.vercel.app/mercadolivre/callback`

e atualize a mesma URL no Mercado Livre Developers.

## Uso pelo iPhone

1. Abra `/admin.html`.
2. Entre com `ADMIN_PASSWORD`.
3. Toque em **Conectar Mercado Livre**.
4. Autorize.
5. Escolha `ENG-001`.
6. **Buscar categorias**.
7. Escolha a categoria sugerida adequada.
8. **Buscar atributos obrigatórios** e complete os campos.
9. **Validar**.
10. Somente quando estiver aprovado, digite `PUBLICAR` e publique o piloto.

## Segurança

O Client Secret nunca aparece no frontend.
Os tokens do Mercado Livre são criptografados antes de entrar no cookie e o cookie é HttpOnly/Secure/SameSite=Lax.
A aplicação não usa banco de dados.


## Correção OAuth v2

Esta versão corrige o erro `State OAuth inválido`.

O `state` agora é autocontido, criptografado e autenticado. Ele transporta
de forma protegida o `code_verifier`, nonce e expiração, portanto não depende
de cookie temporário para sobreviver ao redirecionamento do Mercado Livre.

Não é necessário alterar as Environment Variables já configuradas.


## Correção OAuth v3

Corrige o erro `Acesso administrativo necessário` no callback.

O fluxo de início continua exigindo login administrativo.
A etapa de callback/exchange não depende do cookie administrativo, pois o Mercado Livre
pode abrir o retorno em outro navegador/webview no iPhone.

A segurança do callback é mantida pelo `state` criptografado, autenticado, com nonce,
expiração e `code_verifier` PKCE.


## Compatibilidade User Products / family_name — v4

Corrige o erro de validação:
`body.required_fields: family_name`

O payload agora:
- envia `family_name` usando o nome do SKU/produto;
- não envia `title` na criação/validação, seguindo o modelo atual de User Products;
- mantém categoria, preço, estoque, atributos e imagens.


## V5 — envio de produto digital

Corrige os avisos/erro:
- `shipping.lost_me1_by_user`
- `shipping.digital`
- `Digital products cannot be sent in 'me2'`

O payload de publicação agora declara explicitamente:

```json
"shipping": {
  "mode": "not_specified",
  "local_pick_up": false,
  "free_shipping": false,
  "methods": [],
  "costs": []
}
```

Isso evita que o Mercado Livre tente aplicar ME2 a um arquivo digital.


## V6 — imagens via CDN do Mercado Livre

A publicação real não depende mais das URLs externas diretamente no array `pictures`.

Fluxo:
1. O painel baixa cada JPG público do próprio Vercel.
2. Envia o arquivo por multipart para `/pictures/items/upload`.
3. Recebe os `picture_id` do CDN do Mercado Livre.
4. Publica o anúncio usando `pictures: [{"id":"..."}]`.

Também foi adicionada a opção **Corrigir imagens de anúncio existente**, que faz
`PUT /items/{ITEM_ID}` enviando os picture IDs recém-carregados.
