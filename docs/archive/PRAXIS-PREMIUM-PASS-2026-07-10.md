# Praxis Premium Pass — 2026-07-10

Objetivo: elevar o interior da Praxis para a mesma régua visual e de produto da landing, sem regressão funcional.

## Escopo fechado

### Task 1 — Marca única
- Extrair símbolo π e assinatura da landing para um componente reutilizável.
- Aplicar na sidebar.
- Manter a mesma identidade entre landing e produto.

### Task 2 — Sidebar premium
- Remover scrollbar nativa visível, preservando scroll por mouse/trackpad/touch.
- Header fixo e navegação rolável.
- Fades sutis no topo/fundo indicando conteúdo adicional.
- Reduzir força do item ativo: ouro translúcido, borda e brilho sutil.
- Refinar labels, espaçamento e densidade.

### Task 3 — Arquitetura visual do Hoje
- Reorganizar em hierarquia explícita: saudação/resumo → Agora → alertas → Execução × Contexto.
- Coluna esquerda: tarefas + hábitos.
- Coluna direita: nutrição + wellness + agenda + rituais.
- Melhorar equilíbrio entre colunas e largura dos cards.

### Task 4 — Sistema de superfícies
- Criar shells compartilhadas para cards e seções.
- Unificar raio, borda, fundo, sombra, cabeçalhos e densidade.
- Reduzir card dentro de card e ruído visual.

### Task 5 — Tipografia e respiro
- Melhorar escala de títulos, números e labels.
- Aumentar áreas clicáveis quando necessário.
- Padronizar gaps e paddings.
- Subtrair copy redundante.

### Task 6 — Motion funcional
- Transições curtas em hover, progresso, entrada de seção e troca de estado.
- Sem animação ornamental excessiva.
- Respeitar prefers-reduced-motion.

### Task 7 — QA e ship
- npm run prepush:check.
- QA navegador em 1440px e 390px.
- Sem overflow horizontal.
- Sem console errors de UI.
- Validar login e rotas internas principais.
- git commit + push origin main.
- deploy produção + aliases canônicos.
- smoke de produção.

## Critério de aceite

O interior precisa parecer o mesmo produto da landing: mesma marca, mesma linguagem de superfícies, hierarquia clara, sidebar limpa, Hoje legível em 3 segundos e sem regressão funcional.
