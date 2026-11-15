# Fase 2, primeira fatia: persistência assíncrona

## Entregue e exercitado

- `api/storage/index.js`: fachada assíncrona com identidade obtida exclusivamente do escopo verificado do servidor. Payloads não escolhem o dono.
- `sqlite/tasks.js`: usa a tabela `tasks` existente, com uma conexão dedicada por pessoa e fila por conexão para não expor escritas ainda não confirmadas durante `await`.
- `firestore/tasks.js`: SDK oficial injetado, `users/{uid}/tasks/{locator}`, CRUD, filtros `date/status`, ordenação estável por `id` e paginação. Importar o módulo não abre rede nem lê credencial.
- Transações reais nos dois motores: rollback integral, concorrência sem atualização perdida, separação de donos, rejeição de leitura depois de escrita e invalidação da fachada transacional depois do callback.
- Erro de operação marca a transação como falha, mesmo se o serviço engolir a exceção. Isso evita que SQLite confirme escritas que o Firestore rejeitaria no commit.
- `schema.mjs`: preserva o ID original no registro; caminhos incompatíveis recebem encoding, com digest + manifesto no próprio `row.id` quando o encoding excede o limite. Validação recusa substituição de Unicode inválido. Conversão para centavos usa inteiro seguro e não arredonda frações financeiras; serialização recusa perda de centavos em números muito grandes.
- `api/firestore.indexes.json`: índices do recorte atual, ainda NÃO publicados ou homologados na nuvem.
- SDK `@google-cloud/firestore` fixado em `9.4.1`; dependências instaladas somente na worktree isolada.

## Provas

Comando da matriz real, emulador somente loopback e projeto demo:

```sh
firebase emulators:exec --only firestore --project demo-praxis-storage \
  --config api/storage/emulator.json \
  '/usr/bin/node --test api/storage.contract.test.mjs api/storage/schema.test.mjs'
```

Resultado: **36 testes aprovados, zero falhas e zero skips**. Inclui comparação integral das linhas e listas entre SQLite e Firestore, mesma identidade de registro, null/ausente, falha no commit, erro engolido, duas contas, cinco atualizações concorrentes e leitores externos que não enxergam alteração abortada.

Regressão da API atual:

```sh
/usr/bin/node --test api/tasks.list.test.mjs api/tenantDb.test.mjs api/tenant.http.test.mjs
```

Resultado: **23 testes aprovados, zero falhas e zero skips**. Conta nova vazia, áudio/arquivo por dono, sessão e tarefas mantidos. Testes usam contas/dados sintéticos em ambiente descartável, nunca o banco operacional.

Evidências locais: `/root/.hermes/cache/scratch/qa-migracao-f2/`. Resumo versionado: `docs/migration/evidence/storage-foundation.json`.

## Limites e próximos critérios

Esta é a **fundação da fase 2**, não a fase inteira concluída:

1. `server.js` NÃO importa nem seleciona a nova camada. Rotas, autenticação, timers e helpers ativos continuam como antes.
2. A camada atual cobre linhas brutas de tarefas. Não substitui ainda ordenação/enriquecimento da API, checklist, recorrência, XP ou agenda. Não conectar diretamente sem portar esses serviços e comparar envelopes/efeitos.
3. Nenhuma migração financeira foi executada. O codec de centavos apenas prepara a conversão futura, com casos de limite testados.
4. Índices e latência do emulador não provam configuração ou custo na nuvem. `offset` preserva compatibilidade básica; otimização por cursor fica para a fase de custo.
5. Callback Firestore pode repetir: nenhum HTTP, agenda, log financeiro externo ou envio dentro dele. Usar fila persistida e chave idempotente quando o serviço for portado.
6. SQLite precisa de conexão exclusiva da nova camada; não misturar operações diretas legadas nessa mesma conexão enquanto uma transação assíncrona estiver aberta. A integração ainda precisa definir ciclo de vida e encerramento das conexões.
7. Identidade, conversão de todos os chamadores para async, demais repositórios e homologação do Alfred continuam pendentes.
8. `npm audit` apontou alertas PREEXISTENTES em `body-parser@1.20.5` (high), `proxy-addr@2.0.7` (critical) e `qs@6.15.2` (moderate). As três versões são idênticas no commit-base e nesta worktree. Não foram introduzidas pelo SDK; avaliar/corrigir separadamente antes de publicar, sem atualizar produção implicitamente.

Atualização: a segunda fatia (revisões semanais pela camada nova, ciclo de vida das conexões e erro assíncrono do Express) está em `PHASE2-WEEKLY-REVIEWS.md`. Os itens 1, 6 e parte do 7 acima avançaram ali; o resto continua aberto.

## Alfred

Nenhuma mudança de acesso nesta fatia. Uso normal pelo conector atual continua; a mensagem de convivência anterior segue válida. Nenhuma mensagem foi enviada automaticamente e nenhuma pausa de escritas foi ativada.
