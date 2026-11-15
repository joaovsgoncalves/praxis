# Fase 2, segunda fatia: primeira rota pela camada nova (revisões semanais)

Base: `70e2b16` (fundação). Commits: `07c76dd`, `8d226bf`, `f838a3b`, `00fa392`. Branch local `ana/migracao-firebase-f2`, sem push, sem deploy.

## Por que revisões semanais

A tabela `weekly_reviews` só é usada por `routes/weeklyReviews.js`, que atende a tela e quatro ferramentas do Alfred (`reviews.list`, `reviews.current`, `reviews.set`, `reviews.delete`). Não tem XP, agenda, recorrência nem leitura por outro módulo. Depois desta fatia, a camada nova é a única dona dessa tabela no servidor.

## Entregue

1. **Erro assíncrono no Express 4** (`api/lib/asyncRoute.js`). Promessa rejeitada vai para `next(err)`, o mesmo caminho do erro síncrono de hoje: mesmo status, tipo e primeira linha do corpo. Contraprova no teste: a rota assíncrona crua pendura a requisição e gera `unhandledRejection`.
2. **Semântica de gravação do SQLite em JS** (`api/storage/sqliteSemantics.js`). Ligação posicional do better-sqlite3 (listas achatadas, objeto como saco de parâmetros nomeados, ordem dos erros) e afinidade TEXT/INTEGER (número em coluna de texto vira `"5.0"`, `"4"` em coluna inteira vira `4`). Oráculo contra o SQLite 3.53 real: 60.097 valores comparados, 23 recusados explicitamente (floats com mais de 15 dígitos, inteiros fora da faixa segura, onde o SQLite tem regra própria) e 17.296 combinações de parâmetros com os mesmos erros e a mesma ordem.
3. **Repositório de revisões nos dois motores** (`storage/sqlite/weeklyReviews.js`, `storage/firestore/weeklyReviews.js`), fachada com vários domínios (`storage/index.js`) e drivers por motor (`storage/*/driver.js`). No Firestore, a unicidade de `week_start` é um documento-sentinela criado e apagado no mesmo commit do registro; `week_start` é imutável. Linhas saem na ordem das colunas da tabela, para o corpo HTTP sair igual byte a byte.
4. **Ciclo de vida das conexões SQLite dedicadas** (`storage/sqlite/connections.js`, `storage/runtime.js`). Uma conexão por dono, separada da fachada legada, aberta só depois do preparo legado (`fileMustExist`), com o mesmo `timeout`. `close()` recusa chamadas novas, espera as que estão em andamento e fecha. O ambiente só aceita `PRAXIS_STORAGE=sqlite` (ou ausente); `firestore` derruba a subida antes de abrir banco.
5. **Rota nova** (`routes/weeklyReviews.js` + `services/weeklyReviews.js`) ligada no `server.js`, com o dono vindo do mesmo escopo verificado (`tenant.currentUserId`).
6. **Desligamento gracioso** (`lib/shutdown.js`): SIGTERM/SIGINT param de aceitar conexões, esperam as requisições, param os relógios, fecham a camada nova e os bancos, e saem com 0. Trava = saída forçada em 10 s.

## Diferença intencional (única)

Lista com tamanho diferente de 1 ou objeto no meio dos campos deslocava os parâmetros na rota antiga e gravava valores fora de lugar com 201. Agora é 500 `sqlite_coercion_unsupported`, sem gravar nada. Nem a tela nem o Alfred enviam isso (texto até 10.000 caracteres e nota inteira de 1 a 5). Coberto por teste.

## Achados que viraram correção

- Duas criações do mesmo documento numa transação: o SQLite responde UNIQUE; o Firestore recusava o pedido inteiro com `INVALID_ARGUMENT`. Corrigido em tarefas e revisões (`already_exists` nos dois). Contraprova: sem a correção, o teste de tarefas quebra no emulador.
- O teste de paridade não percebia o teto de 52 do `limit` porque o roteiro tinha menos de 52 semanas. Roteiro ampliado com 55 semanas; contraprova (tirar o teto) agora quebra no passo 81.

## Provas executadas

| Prova | Resultado |
|---|---|
| Paridade HTTP, 93 passos, rota antiga congelada × nova SQLite × nova Firestore (emulador) | idêntica em status, tipo e corpo (ids e carimbos normalizados) |
| Gravação concorrente da mesma semana (6 pedidos) | 1 criação + 5 atualizações, 1 linha, nos dois motores |
| Servidor real (`server.js` em cópia isolada, 2 contas, chave do agente) | 6/6 |
| Matriz com emulador Firestore loopback | 71/71, zero skips |
| Suíte inteira da API (`/usr/bin/node --test`) | 455 testes, 451 aprovados, 0 falhas, 4 pulados (os 4 de Firestore, cobertos na matriz) |

Comandos:

```sh
cd api && PATH=/usr/bin:$PATH /usr/bin/node --test
firebase emulators:exec --only firestore --project demo-praxis-storage --config api/storage/emulator.json \
  '/usr/bin/node --test api/storage.contract.test.mjs api/storage/schema.test.mjs api/storage.weeklyReviews.contract.test.mjs api/storage/sqlite/connections.test.mjs api/storage/sqliteSemantics.test.mjs api/weeklyReviews.parity.test.mjs api/lib/asyncRoute.test.mjs'
```

Dados só sintéticos (SQLite em memória ou cópia vazia, emulador no projeto `demo-praxis-storage`). Nenhum banco de produção foi aberto com escrita; a ordem das colunas de `weekly_reviews` em produção foi conferida em modo somente leitura (só esquema).

## Limites

- É a primeira rota, não a fase 2 inteira. As outras rotas continuam no `db` síncrono legado.
- O Firestore só existe por injeção em teste. Índice de `week_start` (campo único, automático) não foi publicado nem medido na nuvem.
- Convivência das duas conexões no mesmo processo é segura porque a transação nova só aguarda operações dela mesma. Esperar timer, rede ou arquivo dentro da transação trava escrita legada (`SQLITE_BUSY`); isso está provado por contraprova e documentado como proibido.
- O handler de erro padrão do Express em produção (sem `NODE_ENV`) devolve HTML com stack. É preexistente e foi preservado de propósito; corrigir é mudança de contrato à parte.
- Lint do front não roda na worktree (sem `node_modules` da raiz, que não foi instalado de propósito). Checagem de sintaxe de cada arquivo novo passou.
- `npm audit` (body-parser, proxy-addr, qs) continua pendente, igual na base.

## Alfred

Nenhuma ação dele é necessária nesta fatia. Os quatro caminhos que ele usa (`/api/weekly-reviews`, `/current`, `POST`, `DELETE /{id}`) respondem igual, inclusive prévia por `current` e releitura. Nada disso está em produção: a branch é local.
