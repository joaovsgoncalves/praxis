# Nutrição — correções e UI/UX

Data: 2026-09-14. Escopo: Nutrição da Praxis/Jota Fit.
Pedido: corrigir erros e melhorar UI/UX, em tarefas sequenciais.

## Estado deste ciclo

**Integração deste lote à main autorizada pelo usuário em 2026-09-14. O escopo da integração é código, testes e plano; não inclui deploy manual da API.**

Os 25 testes direcionados de contratos, quantidades, API e rotina (7 + 13 + 5) e o lint completo foram executados novamente e passaram antes da integração. git diff --check também passou. O build local continua recusado pela allowlist de hermes_workspace_run_test; os testes de navegador ainda não foram executados. O workflow CI existente é acionado no push para main e verifica lint, typecheck, build e testes de backend. A integração na main não equivale à aprovação da interface nem ao deploy da API; esses gates seguem pendentes abaixo.

Os testes de dados usam SQLite :memory: e um servidor HTTP efêmero de teste. Não foi executado smoke de escrita contra a API de produção. Backups dos arquivos alterados foram organizados em /root/.hermes/workspaces/backups/praxis-nutrition-20260914.

## Lista de tasks

### T1 — Unificar o client de nutrição [IMPLEMENTADA / CONTRATOS APROVADOS]
- [x] Remover o objeto nutrition duplicado de praxisClient.js.
- [x] Preservar summary, copyDay, seed, regimen e os demais métodos públicos.
- [x] Preservar filtros from/to do peso e os aliases log/upsert.
- [x] Adicionar 7 testes de contrato, incluindo proteção contra nova sobrescrita do módulo.

Evidência: api/nutrition.client.test.mjs. A remoção direta do objeto antigo, sem migrar esses métodos primeiro, teria quebrado histórico e copiar ontem.

### T2 — Gramas e porções confiáveis [IMPLEMENTADA / API APROVADA / UI A VALIDAR]
- [x] Campo reutilizável para gramas ou porções no cadastro e edição do diário.
- [x] Conversão entre unidades e prévia de calorias/P/C/G.
- [x] Bloquear quantidade vazia, zero, negativa e inválida; não substituir silenciosamente por 1 porção.
- [x] Corrigir o backend: editar porções não pode manter as gramas anteriores como quantidade prioritária.
- [x] Preservar nome e macros registrados mesmo após alteração, arquivamento ou exclusão do alimento no catálogo.
- [x] Guardar base numérica imutável para evitar perda acumulada de arredondamento nas edições.
- [x] Manter registros antigos sem peso de referência editáveis em porções, sem inventar conversões.
- [x] Corrigir o fallback silencioso de zero para uma porção no formulário de código de barras.
- [x] Testar 137 g, frações, edições repetidas, snapshots legados, HTTP 400 e migração idempotente de tabela antiga (13 testes).
- [ ] Executar os testes de interação do formulário no navegador.

Arquivos centrais: api/nutritionQuantities.js, api/nutrition.js, src/lib/nutritionQuantity.js, src/components/nutrition/NutritionQuantityField.jsx.
Migração de schema: nova coluna opcional food_logs.quantity_basis_json, adicionada de modo idempotente. Logs antigos só ganham base numérica própria ao serem editados. Publicar o novo helper junto com nutrition.js.

### T3 — Datas e refeição selecionada [IMPLEMENTADA / NAVEGADOR A VALIDAR]
- [x] Usar explicitamente a data de Fortaleza e a mesma query do dia na página e no diário.
- [x] Atualizar o dia ao retornar ao app e após a meia-noite, mantendo datas passadas escolhidas pelo usuário.
- [x] Montar texto e código de barras ao abrir, para herdarem a refeição selecionada sem estado antigo.
- [x] Água e rotina usam a data exibida no diário.
- [x] Isolar água local por data, preservar o formato legado de copos e informar que o armazenamento ainda é local.
- [ ] Validar troca de dia, reabertura dos formulários e virada da meia-noite no navegador.

Observação: a navegação continua pelas setas existentes; não foi adicionado um novo botão de voltar para hoje.

### T4 — Hierarquia, clareza e acessibilidade [PARCIAL]
- [x] Diário, resumo e ação principal antes dos blocos de água/rotina.
- [x] Água e rotina em duas colunas no desktop, mantendo empilhamento no celular.
- [x] Separar saldo calórico e proteico; remover o caso incorreto "Passou 0 kcal".
- [x] Remover textos de desenvolvimento nas entradas por texto e código.
- [x] Campo de quantidade com rótulo associado, unidade, estado inválido e área de toque adequada.
- [ ] Melhorar estados de carregamento/erro das listas de recentes, favoritos, refeições e busca.
- [ ] Refinar a densidade da rotina de suplementos/remédios e das seções vazias.
- [ ] Uniformizar confirmações de excluir/copiar e revisar demais textos técnicos.
- [ ] Fazer inspeção visual e teclado em 390 px e desktop; corrigir problemas encontrados.

### T5 — Água no backend [PENDENTE]
- [ ] Registro por dia, protegido pela autenticação existente.
- [ ] Migrar localStorage sem substituir registro remoto existente ou somar duplicado.
- [ ] Tratar conflito, falha e sincronização entre dispositivos.
- [ ] Validar recarga, dias diferentes, outro dispositivo e repetição da migração.

Estado atual: o erro de data foi corrigido no código, mas a água continua no navegador. Não apresentar isso como sincronização com servidor.

### T6 — Metas e estimativas explícitas [PENDENTE]
- [ ] Não assumir silenciosamente idade ou parâmetros da fórmula.
- [ ] Validar entradas e apresentar estimativa editável antes de salvar.
- [ ] Não alterar metas existentes automaticamente.
- [ ] Remover ou desabilitar a opção inacabada de carboidrato líquido.
- [ ] Testar entradas incompletas/inválidas e preservação de metas salvas.

### T7 — Regressão e publicação [PARCIAL / GATES PENDENTES]
- [x] Testes direcionados: 25 aprovados, execução sem erro.
- [x] npm run lint: aprovado após as mudanças.
- [x] git diff --check: aprovado.
- [x] Preparar 6 cenários E2E em 2 viewports (12 execuções planejadas), apenas em localhost com APIs interceptadas.
- [ ] Build: NÃO executado. hermes_workspace_run_test recusou npm run build por allowlist.
- [ ] E2E: NÃO executado. A mesma ferramenta recusou npm run test:e2e -- --config=playwright.nutrition.config.js --max-failures=1.
- [ ] Revisar o fluxo de publicação e inclusão do novo helper/schema.
- [ ] Publicar somente após build e validação de interface; realizar verificação não destrutiva.

## Comandos e evidência reproduzível

Permitidos e executados:

```sh
# cwd: apps/praxis/api
npm test -- nutrition.client.test.mjs nutrition.quantities.test.mjs nutrition.regimen.test.mjs
# cwd: apps/praxis
npm run lint
git diff --check
```

Preparados, mas bloqueados nesta ferramenta:

```sh
npm run build
npm run test:e2e -- --config=playwright.nutrition.config.js --max-failures=1
```

A configuração playwright.nutrition.config.js usa somente http://127.0.0.1:18736, sem reaproveitar servidor existente. O teste intercepta todas as APIs e bloqueia outras origens; não registra alimentos reais. Nenhum resultado desses testes foi contabilizado como aprovado.

## Próxima sequência

1. Resolver a execução de build/E2E pelo fluxo autorizado e conferir T2/T3 no navegador.
2. Concluir T4, validar, então iniciar T5 e T6, cada uma com seus testes.
3. Publicar apenas ao final dos gates aplicáveis.

Fora deste ciclo: LLM/fallback da A.N.A., foto de refeição, scanner por câmera, novas dependências e refatoração ampla do domínio. A prioridade é corrigir a base e reduzir atrito, não expandir funcionalidades.
