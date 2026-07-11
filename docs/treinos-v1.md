# Praxis · Treinos V1

## Objetivo

Transformar a aba `/treinos` de placeholder em uma experiência utilizável de ponta a ponta para:

1. montar um programa de treino;
2. criar dias de treino e descanso;
3. adicionar exercícios personalizados;
4. configurar séries, repetições, duração e descanso;
5. iniciar uma sessão real;
6. registrar séries sem perder o treino ao fechar a tela;
7. usar cronômetro de descanso persistente;
8. finalizar a sessão e consultar o histórico;
9. reutilizar automaticamente o último desempenho como referência.

## Tasks executadas

### T0 · Auditoria e baseline

- [x] Confirmar estado inicial da aba Treinos (placeholder sem CRUD).
- [x] Mapear frontend, API, SQLite, autenticação e padrões de UI.
- [x] Confirmar repositório limpo antes da alteração.
- [x] Rodar baseline de lint, typecheck e build.

### T1 · Fundação de dados

- [x] Criar schema idempotente para exercícios, programas, dias e sessões.
- [x] Criar snapshots de exercícios dentro da sessão para preservar histórico mesmo após edição/exclusão do programa.
- [x] Suportar `reps`, `weight_reps`, `duration`, `distance` e `distance_duration`.
- [x] Criar índices para programas, dias, sessões e séries.
- [x] Preservar histórico ao remover programas, dias ou exercícios da ficha.

### T2 · API de programas e exercícios

- [x] CRUD de programas.
- [x] Ativar/trocar programa atual.
- [x] Criar, editar, remover e reordenar dias.
- [x] Definir manualmente o próximo dia do ciclo.
- [x] Avançar ciclo em dia de descanso.
- [x] Biblioteca de exercícios pesquisável.
- [x] Criar exercício personalizado.
- [x] Adicionar, editar, remover e reordenar exercícios de um treino.

### T3 · Sessão ativa

- [x] Iniciar treino a partir do dia atual.
- [x] Impedir duas sessões ativas ao mesmo tempo.
- [x] Persistir sessão no backend desde o início.
- [x] Restaurar sessão ativa após fechar/reabrir a Praxis.
- [x] Registrar séries por tipo de acompanhamento.
- [x] Remover série registrada.
- [x] Cronômetro total do treino.
- [x] Cronômetro de descanso persistente em `localStorage`.
- [x] Ajustes de `-15s`, `+15s` e pular descanso.
- [x] Finalizar treino e avançar automaticamente o ciclo.
- [x] Abandonar sessão sem apagar o que já foi registrado.

### T4 · Histórico e progressão básica

- [x] Listar sessões concluídas.
- [x] Abrir detalhe da sessão.
- [x] Mostrar exercícios e séries executadas.
- [x] Buscar último resultado do mesmo exercício.
- [x] Pré-preencher a próxima série com referência do último treino.

### T5 · UX mobile-first

- [x] Tela Hoje com próximo treino, ciclo e CTA principal.
- [x] Tela Programa com montagem completa.
- [x] Tela Histórico.
- [x] Sessão ativa focada em uso na academia.
- [x] Teste E2E em viewport de 390 px sem overflow horizontal.

### T6 · Validação

- [x] Smoke test da API em SQLite in-memory.
- [x] Teste E2E: abrir Treinos → iniciar → registrar 2 séries → finalizar.
- [x] Lint.
- [x] Typecheck.
- [x] Build.

## Critérios de aceite da V1

- [x] Criar um programa sem editar banco manualmente.
- [x] Criar dias de treino e descanso.
- [x] Criar exercício personalizado de calistenia, musculação, skill ou cardio.
- [x] Configurar séries, reps/duração e descanso.
- [x] Iniciar treino.
- [x] Registrar séries.
- [x] Fechar a tela e continuar a sessão ativa depois.
- [x] Finalizar e consultar histórico.
- [x] Ver o desempenho anterior no próximo treino.

## Backlog pós-V1

Não bloqueiam o uso real da aba:

- [ ] Editar uma série já registrada sem excluir e recriar.
- [ ] Gráficos de progressão por exercício.
- [ ] Recordes pessoais e comparações automáticas.
- [ ] Vincular explicitamente programa/treino a um hábito da Praxis.
- [ ] Concluir hábito relacionado ao finalizar sessão, com vínculo configurável.
- [ ] Imagens ou GIFs de exercícios com origem/licença definida.
- [ ] Duplicar dia/programa.
- [ ] Templates prontos (PPL, Upper/Lower etc.).
- [ ] RPE/RIR opcionais.
- [ ] Sugestões da A.N.A. baseadas no histórico.

## Arquivos principais

### Backend

- `api/workouts.js`
- `api/workouts.test.mjs`
- `api/server.js`

### Frontend

- `src/pages/Treinos.jsx`
- `src/api/forjaClient.js`
- `src/lib/workouts.js`
- `src/components/workouts/ExercisePickerDialog.jsx`
- `src/components/workouts/WorkoutDayDialog.jsx`
- `src/components/workouts/WorkoutExerciseConfigDialog.jsx`
- `src/components/workouts/WorkoutHistory.jsx`
- `src/components/workouts/WorkoutProgramDialog.jsx`
- `src/components/workouts/WorkoutProgramEditor.jsx`
- `src/components/workouts/WorkoutSessionView.jsx`

### Testes

- `e2e/workouts-v1.spec.js`
- `e2e/mobile-390.spec.js`
