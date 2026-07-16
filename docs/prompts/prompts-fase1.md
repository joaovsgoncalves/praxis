# Jota Fit — Prompts Fase 1: Experiência do Aluno
**Copie e cole cada prompt no Base44, um por vez. Teste antes de ir pro próximo.**

---

## 🏋️ Prompt 1 — Timer de Treino

```
Adicione um componente WorkoutTimer na StudentWorkoutsPage.

Funcionalidades:
- Cronômetro crescente mostrando tempo total de treino (MM:SS)
- Timer de descanso entre séries com contagem regressiva (botões: 30s, 60s, 90s, ou input custom)
- Quando timer de descanso zera: vibrar e tocar som breve
- Botões grandes: ▶️ Iniciar | ⏸️ Pausar | ⏹️ Finalizar
- Ao finalizar: salvar tempo total em minutos no WorkoutLog atual e calcular XP (1 XP por minuto de treino)
- Mostrar número do exercício atual / total de exercícios
- Barra de progresso visual dos exercícios concluídos

Design: fundo escuro (#0d0d0d), números do cronômetro em dourado (#D4A853) com fonte monospace grande (48px), botões arredondados com hover brilhante.

Quando não estiver treinando, mostrar botão "Iniciar Treino" que ativa o timer e começa a registrar o primeiro exercício.
```

---

## 📏 Prompt 2 — Medidas Corporais

```
Crie uma entidade BodyMeasurement com os campos:
- student_email (string, obrigatório)
- date (date, obrigatório)
- weight_kg (number)
- body_fat_pct (number, percentual de gordura)
- arm_circumference (number, cm, bíceps)
- leg_circumference (number, cm, coxa)
- chest_circumference (number, cm, peito)
- waist_circumference (number, cm, cintura)
- notes (string, opcional)

Crie uma página /progresso com:

1. Formulário rápido no topo: seletor de data (default hoje) + campos numéricos para cada medida + botão "Salvar". Se já existe medição pra data, carregar dados existentes (modo edição).

2. Gráfico de linha mostrando evolução do peso nos últimos 30 dias (use Recharts LineChart). Linha dourada, fundo escuro, grid sutil.

3. Gráfico de barras comparando medidas atual vs primeira medição (bíceps, coxa, peito, cintura). Barra cinza = primeira, barra dourada = atual.

4. Cards de conquista automáticas:
   - "📉 Perdeu X kg" quando peso atual < primeira medição
   - "💪 Ganhou X cm no braço" quando bíceps atual > primeira medição
   - "🎯 Registrou 7 medições seguidas" quando 7 dias consecutivos

Design: consistente com o resto do app, escuro com acentos dourados. Adicione link "/progresso" na sidebar do aluno.
```

---

## 🎬 Prompt 3 — Vídeos Demonstrativos de Exercícios

```
Crie uma entidade Exercise com os campos:
- name (string, obrigatório, ex: "Flexão de braço")
- description (string, descrição detalhada do exercício)
- muscle_groups (array de strings, ex: ["peito", "tríceps", "ombros"])
- video_url (string, link do YouTube ou upload)
- difficulty (enum: beginner, intermediate, advanced)
- equipment_needed (array de strings, ex: ["barra", "paralelas", "nenhum"])
- tips (string, dicas de execução)
- sets_recommended (string, ex: "3x12-15")
- rest_seconds (number, tempo de descanso sugerido em segundos)

Na entidade Workout, o campo exercises já existe. Altere para ser um array de objetos com: exercise_id (referência), sets, reps, rest_seconds (override do padrão), notes.

Na StudentWorkoutsPage, quando o aluno clica num exercício do treino, abra um modal com:
- Vídeo embedado (YouTube iframe ou placeholder se não tiver)
- Nome grande + badges de músculos trabalhados (badges coloridos)
- Nível de dificuldade com ícone colorido (verde=iniciante, amarelo=intermediário, vermelho=avançado)
- Equipamento necessário (lista com ícones)
- Dicas de execução em caixa destacada
- Séries x reps sugeridas
- Botão "Fechar"

Cadastre 5 exercícios de exemplo: Flexão, Barra fixa, Dips, Agachamento pistol, Prancha.
```

---

## 🚀 Prompt 4 — Onboarding Guiado

```
Refaça completamente a OnboardingPage como um wizard de 5 etapas com barra de progresso no topo (bolinhas numeradas 1-5, preenchida = concluída):

Etapa 1 — "Qual seu nível?"
3 cards grandes com ícone e descrição:
- 🟢 Iniciante: "Estou começando na calistenia"
- 🟡 Intermediário: "Já faço flexões e barras"
- 🔴 Avançado: "Skills avançadas como muscle-up"
Seleciona 1, botão "Próximo".

Etapa 2 — "Qual seu objetivo?"
Multi-select (mínimo 1, máximo 3):
- 💪 Ganhar força e massa
- 🔥 Perder gordura
- 🤸 Aprender skills (handstand, muscle-up, etc)
- ❤️ Saúde e disposição
Botão "Próximo".

Etapa 3 — "Quando você treina?"
Checkboxes dos dias da semana (Seg, Ter, Qua, Qui, Sex, Sáb, Dom).
Seletor de horário preferido (Manhã, Tarde, Noite).
Botão "Próximo".

Etapa 4 — "Sobre você"
Campos: nome, peso atual (kg), objetivo de peso (kg), foto (opcional).
Botão "Próximo".

Etapa 5 — "Seu primeiro treino!"
Baseado nas respostas anteriores:
- Mostrar 2-3 treinos sugeridos da entidade Workout com nome, descrição, duração estimada e XP que vai ganhar
- Aluno seleciona 1+
- Botão "Começar minha jornada! 🚀"

Ao finalizar:
- Salvar dados no StudentProfile (name, objetivo, nível)
- Criar WorkoutAssignment para os treinos selecionados
- Marcar onboarding_completed = true
- Redirecionar para / (Check-in page)
- Mostrar toast "Bem-vindo à sua jornada RPG! 💪"

Design: cada etapa em tela cheia, transição suave entre etapas, botão "Voltar" funcional.
```

---

## Checklist de Validação (após cada prompt)

- [ ] Entidade criada corretamente no painel de entidades
- [ ] Página renderiza sem erros
- [ ] CRUD funciona (criar, ler, editar, deletar)
- [ ] Design consistente com o resto do app
- [ ] Mobile responsivo
- [ ] Dados persistem após refresh

---

*Gerado por A.N.A. em 2026-05-06*
