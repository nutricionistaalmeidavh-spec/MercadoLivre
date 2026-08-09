# Deploy na Vercel

1. Importe este diretório como um novo projeto Vercel.
2. Configure as variáveis de `.env.example` em Settings > Environment Variables.
3. Use a mesma `ML_REDIRECT_URI` no Mercado Livre Developers.
4. Faça um deploy de preview e teste login, OAuth, validação e consulta de anúncio.
5. Só depois promova para produção e publique um único SKU piloto.

Não há build command nem dependências externas obrigatórias. As funções em `api/` são Serverless Functions e os módulos reutilizáveis ficam em `src/`.

Com Node.js instalado, execute `npm run check` antes do deploy.
