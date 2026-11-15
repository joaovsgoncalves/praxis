# Fase 2: onde estamos

Atualizado em 15/11/2026. Branch local `ana/migracao-firebase-f2`, último código em `9f0010e`. Sem push, sem deploy, produção intacta (`bcbadad`, SQLite).

## Rotas servidas pela camada nova

| Rota | Consumidores | Commit | Prova |
|---|---|---|---|
| `/api/weekly-reviews` (4) | tela, Alfred `reviews.*` | `00fa392` | paridade 93 passos (antiga = SQLite = Firestore), servidor real |
| `/api/purchases` (4) | tela, Alfred `purchases.*` | `9f0010e` | paridade 55 passos (antiga = SQLite = Firestore), servidor real |

São 8 das ~123 rotas (contagem de `router/app.get|post|put|patch|delete`). Restam 537 chamadas síncronas ao SQLite (`db.prepare/exec/transaction`) fora dos testes, concentradas em finanças, tarefas, hábitos e frentes.

## Base pronta para as próximas rotas

- Fachada assíncrona com dono obrigatório, transações e proteção de leitura depois de escrita (`storage/index.js`).
- Domínios: tarefas (CRUD bruto, ainda sem rota), revisões semanais, compras.
- Semântica de gravação e ordenação do SQLite em JS, provada contra o SQLite real (`storage/sqliteSemantics.js`, `storage/sqliteOrder.js`).
- Conexões SQLite dedicadas com ciclo de vida e desligamento gracioso; `PRAXIS_STORAGE` só aceita `sqlite`.
- Erro assíncrono do Express levado ao handler atual (`lib/asyncRoute.js`).
- Arnês de paridade reutilizável com oráculo congelado (`test-support/httpParity.mjs`, `test-support/oracles/`).

## Compras (terceira fatia)

- Mesma regra da antiga: `status=all`, igualdade, "tudo menos pausado" (que também descarta NULL), ordem `sort_order ASC, created_date DESC`, posição `MAX + 1` reaproveitada depois de apagar o último, id do cliente com a mesma conversão do SQLite (`5` vira `"5.0"`), id repetido com o mesmo erro `UNIQUE constraint failed: purchase_items.id`.
- Firestore: filtro e ordem em memória com a comparação do SQLite (NULL < número < texto em bytes UTF-8), `_row` como ordem de inserção para desempatar como o `rowid`, e uma sequência lida e gravada em cada criação.
- Diferenças intencionais: filtro na query com lista/objeto que deslocava parâmetros vira 500 explícito; id escolhido pelo cliente acima de 1500 bytes é recusado (limite do Firestore). Nenhum consumidor real manda isso.
- Contraprovas: tirar o "menos pausado" quebra a paridade (passo 24); ler a maior posição fora da transação repete posição no teste de corrida. Tirar a sequência do Firestore NÃO quebrou o teste de corrida no emulador, porque a leitura da lista inteira dentro da transação já serializa as criações; a sequência fica pela ordem de inserção e como defesa extra, e isso precisa ser confirmado no Firestore real antes do corte.

## Provas da rodada

| Prova | Resultado |
|---|---|
| Matriz com emulador Firestore loopback | 87/87, zero skips |
| Suíte inteira da API | 467 testes, 461 aprovados, 0 falhas, 6 pulados (todos de Firestore, cobertos na matriz) |
| Servidor real (`storage.http.test.mjs`) | 7/7: duas contas, chave do agente nos fluxos do Alfred, 500 em vez de pendurar, desligamento com código 0, dados no arquivo certo de cada conta |

## Falta na fase 2

1. Demais rotas pequenas sem efeito externo (configurações, foco, bem-estar, metas, rituais, insights de leitura).
2. Consumidores internos sem requisição: virada do dia, fila da agenda, relógios do servidor.
3. Identidade e sessões (`praxisAuth.js`, banco de controle) num repositório.
4. Tarefas e hábitos com checklist, recorrência, XP e agenda são a fase 3; finanças, a fase 5.
5. `npm audit` (body-parser, proxy-addr, qs) antes de qualquer publicação.

## Alfred

Nenhuma ação dele é necessária. `reviews.*` e `purchases.*` respondem igual, inclusive prévia e releitura, e nada disso está no ar.
