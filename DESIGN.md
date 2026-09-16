---
version: alpha
name: "ArtiSys Mercado Livre"
description: "Painel operacional mobile-first para administrar anúncios, automações e operações do Mercado Livre com leitura rápida e segurança."
colors:
  ink: "#10231A"
  ink-soft: "#5E7066"
  surface: "#FFFFFF"
  canvas: "#F4F6F2"
  line: "#DCE5DF"
  brand: "#12623A"
  brand-strong: "#0C4A2B"
  marketplace: "#FFE600"
  info: "#E8F2FF"
  success: "#E7F6EC"
  warning: "#FFF5CC"
  danger: "#FCE8E6"
  focus: "#1666D8"
typography:
  display:
    fontFamily: "Arial Black, Arial, sans-serif"
  sans:
    fontFamily: "Inter, ui-sans-serif, system-ui, -apple-system, BlinkMacSystemFont, Segoe UI, sans-serif"
  mono:
    fontFamily: "ui-monospace, SFMono-Regular, Menlo, Consolas, monospace"
rounded:
  DEFAULT: "0.875rem"
  sm: "0.625rem"
  md: "0.875rem"
  lg: "1.25rem"
spacing:
  section-gap: "1.25rem"
  page-max: "72rem"
components:
  button: {}
  card: {}
  bottom-nav: {}
  status-pill: {}
  listing-card: {}
  tabs: {}
  input: {}
  textarea: {}
---

# ArtiSys Mercado Livre Design System

## Overview

### Creative North Star
Uma central de operação de e-commerce vista no celular: informação densa, cartões objetivos, marca ArtiSys em verde e um acento amarelo do universo Mercado Livre usado somente para orientação e prioridade.

### Product context and register
- **Audience and primary job:** operador ArtiSys que acompanha a conta Mercado Livre, anúncios e automações pelo celular.
- **Target market(s) and evidence:** Brasil; interface em pt-BR e integração com Mercado Livre Brasil.
- **Locale(s) and language policy:** pt-BR; termos de API ficam escondidos da UI quando houver nome de negócio equivalente.
- **Usage scene:** celular como dispositivo primário, consultas rápidas ao longo do dia e ajustes pontuais em anúncios.
- **Register:** produto/admin.
- **Memorable signature:** faixa curta amarelo Mercado Livre combinada ao verde profundo ArtiSys para separar contexto de marketplace de ações do sistema.
- **Restraint:** formulários, estados, filtros e dados devem permanecer silenciosos e utilitários; nada de efeitos decorativos em rotinas administrativas.
- **Anti-references:** landing pages de marketing, dashboards genéricos com gradientes e cards sem hierarquia, interfaces desktop comprimidas em mobile.
- **Token ownership/runtime mapping:** este arquivo registra os tokens; `admin-cloudflare.html` implementa os mesmos valores como CSS custom properties.

## Colors
O verde ArtiSys é a cor de ação primária. O amarelo Mercado Livre é contextual e não substitui estados semânticos. Sucesso, aviso, erro e informação têm superfícies próprias e sempre texto/ícone associado. O foco usa azul independente para permanecer visível em qualquer fundo.

## Typography
Títulos curtos usam `display` com peso forte e compactação moderada. Corpo e controles usam a pilha `sans`. IDs e valores técnicos usam `mono`. Evitar caixa alta contínua em labels; usar sentence case.

## Layout
Mobile-first. No celular, navegação inferior fixa com safe-area; conteúdo respeita padding inferior suficiente para não ficar coberto. Em telas largas, a navegação vira sidebar persistente. Dashboard usa cards de leitura rápida; anúncios usam lista de cards compactos, nunca duas colunas em celular. Detalhe do anúncio ocupa a área principal e preserva o retorno à lista.

## Elevation & Depth
Hierarquia por superfície, borda e contraste tonal. Sombras são mínimas e reservadas a navegação fixa e painéis destacados. Cards comuns dependem de borda e diferença de superfície.

## Shapes
Cards principais: 20px. Controles: 10–14px. Pills de status são totalmente arredondadas. Imagens de anúncio têm 14px. Evitar arredondamento exagerado em tudo.

## Components

### Foundational visual states
Todo controle tem hover, focus-visible, pressed, disabled e busy. `focus-visible` usa anel azul de 3px. Loading mantém geometria. Estados vazios orientam a próxima ação.

### Buttons and actions
Primário verde sólido. Secundário neutro com superfície cinza-esverdeada. Ghost para navegação e ações de baixo risco. Danger só para operações destrutivas. Botão busy mantém largura.

### Navigation and data display
Bottom nav tem cinco destinos: Início, Anúncios, Pedidos, Promoções e Mais. Item ativo recebe fundo tonal e label forte. Em desktop, a mesma taxonomia aparece na sidebar. Status usam pills e nunca só cor.

### Forms and overlays
Busca possui botão limpar. Textareas usam `resize: none` e altura suficiente. Detalhe de anúncio usa uma view dedicada com tabs para Resumo, Pós-venda, Comercial e Promoções.

### Iconography
SVG line icons de 20–22px, stroke 1.8–2.0, com label textual na navegação. Ícones não substituem nomes de ações críticas.

### Motion
Transições de 140–180ms apenas para mudança de estado, navegação e feedback. `prefers-reduced-motion` desativa movimento não essencial.

### Content and data visualization
Voz direta: “Salvar resposta”, “Abrir anúncio”, “Atualizar”. Estados descrevem o que acontece e o que fazer em seguida. Números e moeda seguem pt-BR.

## Do's and Don'ts
- **Do:** priorizar leitura rápida no celular e manter ações frequentes a um toque.
- **Do:** preservar a mesma nomenclatura entre dashboard, lista e detalhe.
- **Don't:** usar a tela de resposta automática como página principal do produto.
- **Don't:** misturar configuração técnica do Cloudflare com operação cotidiana do Mercado Livre.