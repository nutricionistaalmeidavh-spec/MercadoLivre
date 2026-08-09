# Pacote para Automatizador Mercado Livre

Este pacote contem os 8 produtos digitais montados em estrutura inicial para publicacao no Mercado Livre.

## Ordem recomendada para o automatizador

1. Ler `00_controle/manifesto_produtos.csv`.
2. Para cada SKU, usar o arquivo ZIP indicado em `01_produtos_zip/`.
3. Usar as imagens em `02_imagens_por_sku/{SKU}/imagem_01.png`, `imagem_02.png` e `imagem_03.png`.
4. Usar o texto em `03_anuncios_md/{SKU}/anuncio_mercado_livre.md`.
5. Consultar `00_controle/catalogo_produtos_digitais_pronto_postagem.xlsx` se precisar de preco, prioridade ou visao geral.

## Observacoes importantes

- As imagens foram feitas para priorizar mockups, arquivos e telas internas do produto.
- Evitar adicionar texto nas imagens como garantia, envio imediato, desconto, funcionalidade automatica, promessa de resultado ou qualquer chamada agressiva.
- Os produtos sao digitais. A entrega recomendada e enviar o ZIP correspondente ao SKU apos a venda.
- Os arquivos academicos originais nao devem ser usados diretamente no anuncio. Os materiais finais foram recriados/adaptados como produtos profissionais.

## Estrutura

- `00_controle`: planilha de catalogo, manifesto e mapas.
- `01_produtos_zip`: ZIP final de entrega de cada produto.
- `02_imagens_por_sku`: 3 imagens por produto, organizadas por SKU.
- `03_anuncios_md`: textos prontos de anuncio por SKU.
- `04_planilhas_editaveis`: planilhas editaveis separadas, quando o produto inclui XLSX.

